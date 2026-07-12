/**
 * Native lifecycle bridge — interception core (design:
 * docs/design/1.2-lifecycle-bridge.md, piece 2; A15).
 *
 * Subscribes `survey.onScrollToTop` — the SINGLE funnel for every scroll
 * request in survey-core (invalid-submit error focus, `focusQuestion()`,
 * page-change scroll, panel expand; `onScrollingElementToTop` is a
 * deprecated alias of the SAME EventBase, so one subscription covers
 * both names) — and takes native ownership:
 *
 * - `options.allow = false` ALWAYS: core never reaches its DOM block or
 *   the unguarded `settings.environment` destructure (survey.ts:5872).
 *   Consumer handlers subscribed after install still fire and observe
 *   `allow === false` (EventBase fires all handlers).
 * - Canceling drops core's chained `onScolledCallback` (the web path to
 *   `focusInputElement`) — moot-but-mandatory in RN, where
 *   `SurveyElement.FocusElement` no-ops without a DOM; the bridge
 *   REPLACES that role: focus intent (event `question` non-null) is
 *   completed through the registered handle (`focusFirst` →
 *   `question.focusIn()` parity, else `a11yFocus`).
 * - Same-tick requests coalesce to the LAST (matches web, where the
 *   later scrollIntoView wins). The flush resolves the target through
 *   the registry (exact → page fallback), consults `onScrollRequest`,
 *   measures, applies the visible-skip semantic (every internal core
 *   caller passes `scrollIfVisible: false` — the fired event carries no
 *   such field), scrolls, and completes focus after a bounded settle
 *   (RN `scrollTo` has no completion callback).
 *
 * `<Survey>` (1.1) owns the call sites: install on mount/model-swap,
 * uninstall on swap-out/unmount. Everything here is non-throwing
 * (invariant 9 spirit): missing host/handle/measurement degrade to
 * diagnostics or silent skips, never a crash.
 */
import type {
  PageModel,
  Question,
  ScrollToTopEvent,
  SurveyModel,
} from '../core/facade';
import type { Base } from '../core/facade';
import { reportDiagnostic } from '../diagnostics';
import { readElementName, readElementType } from './registry';
import type {
  ElementHandle,
  LifecycleBridgeOptions,
  LifecycleRegistry,
  ScrollRequestInfo,
} from './types';

const DEFAULT_SCROLL_SETTLE_MS = 300;

interface PendingRequest {
  candidate: Base | null;
  question: Question | null;
  page: PageModel | null;
}

/**
 * Installs the bridge on `survey`; returns the uninstall function
 * (removes the subscription, cancels in-flight timers, and clears the
 * registry — post-uninstall events from the old model are inert).
 */
export function installLifecycleBridge(
  survey: SurveyModel,
  registry: LifecycleRegistry,
  options?: LifecycleBridgeOptions
): () => void {
  const scrollSettleMs = options?.scrollSettleMs ?? DEFAULT_SCROLL_SETTLE_MS;
  const topInset = options?.topInset ?? 0;
  const onScrollRequest = options?.onScrollRequest;

  let installed = true;
  let pending: PendingRequest | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let reportedNoScrollHost = false;

  function completeFocusIntent(
    question: Question,
    handle: ElementHandle
  ): void {
    if (!installed) return;
    const landed = handle.focusFirst ? handle.focusFirst() === true : false;
    if (landed) {
      // Event parity: web's DOM focus-bubble handler drives
      // onFocusInQuestion/lastActiveQuestion; in RN the bridge must.
      question.focusIn();
    } else {
      handle.a11yFocus?.();
    }
  }

  async function flush(): Promise<void> {
    flushTimer = null;
    const request = pending;
    pending = null;
    if (!installed || !request || !request.candidate) return;

    const target = registry.resolveScrollTarget(request.candidate);
    if (!target) return;

    let allowScroll = true;
    if (onScrollRequest) {
      const info: ScrollRequestInfo = {
        element: target.element,
        question: request.question,
        page: request.page,
        viaPageFallback: target.viaPageFallback,
      };
      try {
        // `false` suppresses the NATIVE SCROLL ONLY — focus-intent
        // completion still runs below (pinned semantics; design doc,
        // "The consult seam").
        allowScroll = onScrollRequest(info) !== false;
      } catch (error) {
        // Contained: a throwing consumer callback can never break the
        // scroll/focus path; treated as `true`.
        console.error(
          '[react-native-survey-library] onScrollRequest threw; continuing with the native scroll',
          error
        );
        allowScroll = true;
      }
    }

    let scrolled = false;
    if (allowScroll) {
      const host = registry.getScrollHost();
      if (!host) {
        if (!reportedNoScrollHost) {
          reportedNoScrollHost = true;
          reportDiagnostic({
            code: 'lifecycle-diagnostic',
            lifecycleCode: 'no-scroll-host',
            elementName: readElementName(target.element),
            elementType: readElementType(target.element),
          });
        }
      } else {
        let measured: Awaited<ReturnType<typeof host.measureTarget>> = null;
        try {
          measured = await host.measureTarget(target.handle.containerRef);
        } catch (error) {
          // Contained (invariant 9 spirit): a host that rejects mid-flight
          // (e.g. unmounted between request and measure) degrades to a
          // skipped scroll — focus-intent completion below still runs.
          console.error(
            '[react-native-survey-library] lifecycle scroll-host measureTarget failed; skipping the scroll',
            error
          );
          measured = null;
        }
        if (!installed) return;
        if (measured) {
          const viewport = host.getViewport();
          const fullyVisible =
            !!viewport &&
            measured.y >= viewport.offsetY &&
            measured.y + measured.height <= viewport.offsetY + viewport.height;
          if (!fullyVisible) {
            host.scrollTo(Math.max(0, measured.y - topInset), true);
            scrolled = true;
          }
        }
      }
    }

    if (request.question) {
      const question = request.question;
      if (scrolled) {
        // RN scrollTo has no completion callback; bounded settle delay
        // (documented approximation, design doc piece 2 step 4).
        settleTimer = setTimeout(() => {
          settleTimer = null;
          completeFocusIntent(question, target.handle);
        }, scrollSettleMs);
      } else {
        completeFocusIntent(question, target.handle);
      }
    }
  }

  function handleScrollToTop(
    _sender: SurveyModel,
    eventOptions: ScrollToTopEvent
  ): void {
    // Native ownership — never let core reach the DOM block or the
    // settings.environment destructure. Set even when uninstalled races
    // are impossible (we removed the handler), purely defensive.
    eventOptions.allow = false;
    if (!installed) return;
    const question = (eventOptions.question ?? null) as Question | null;
    const page = (eventOptions.page ?? null) as PageModel | null;
    const element = (eventOptions.element ?? null) as unknown as Base | null;
    pending = {
      candidate: (question as Base | null) ?? element ?? (page as Base | null),
      question,
      page,
    };
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        // Belt for the non-throwing guarantee: flush() contains its own
        // failure points, but nothing async may ever surface as an
        // unhandled rejection out of the bridge.
        flush().catch((error) => {
          console.error(
            '[react-native-survey-library] lifecycle bridge flush failed; continuing',
            error
          );
        });
      }, 0);
    }
  }

  survey.onScrollToTop.add(handleScrollToTop);

  return function uninstallLifecycleBridge(): void {
    if (!installed) return;
    installed = false;
    survey.onScrollToTop.remove(handleScrollToTop);
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    pending = null;
    registry.clear();
  };
}
