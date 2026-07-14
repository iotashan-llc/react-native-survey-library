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
 * - Cancellation is IRREVERSIBLE: `allow` is locked to `false` via a
 *   defineProperty getter (not a plain assignment — EventBase hands the
 *   same mutable options object to later subscribers, who could
 *   otherwise reassign it and re-open core's DOM block + the unguarded
 *   `settings.environment` destructure, survey.ts:5872). Consumer
 *   handlers still fire and observe `allow === false`.
 * - Focus intent is discriminated by CALLER SHAPE, not `question` alone:
 *   the three internal funnel callers are `Question.focus()`
 *   (question.ts:1618 — `id: this.id`, chains `onScolledCallback` →
 *   `focusInputElement`), `panel.expand()` (panel.ts:2499 — `question`
 *   set but `id: q.inputId`, NO callback — scroll-only on web too), and
 *   `page.scrollToTop()` (page.ts:336 — `question: null`). The event
 *   does not carry the callback, so the bridge treats a request as focus
 *   intent only when `question != null && elementId === question.id`
 *   (web parity: panel expand scrolls to the first question without
 *   focusing its input).
 * - The bridge INITIATES focus (`focusFirst` on the registered handle,
 *   `a11yFocus` fallback) but NEVER fires `question.focusIn()` — that is
 *   the component's job, from its native input's actual `onFocus` event
 *   (see `ElementHandle.focusFirst` contract). A synchronous boolean
 *   cannot prove async native focus landed; synthesizing focusIn here
 *   would double-fire `onFocusInQuestion` once components wire onFocus.
 * - Coalescing/async ordering: the SCROLL TARGET coalesces last-wins per
 *   tick; the FOCUS INTENT coalesces separately (a scroll-only request
 *   never drops a pending focus). A monotonic request generation drops
 *   stale measurement completions; a superseded settle timer is canceled
 *   (its focus intent re-parked unless a newer focus replaced it).
 * - Visible-skip: the fired event does not carry `scrollIfVisible`;
 *   panel expand and page scroll pass `false` at the caller, while
 *   `Question.focus(onError, scrollIfVisible?)` forwards its public arg
 *   (where `true` means force-scroll even when visible). That flag is
 *   lost on the event, so the bridge ALWAYS skips fully-visible targets
 *   — `Question.focus(…, true)` force-scroll is a documented RN
 *   divergence (design doc, "Event-field reality check").
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

interface PendingScroll {
  candidate: Base | null;
  question: Question | null;
  page: PageModel | null;
}

interface PendingSettle {
  timer: ReturnType<typeof setTimeout>;
  question: Question;
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
  let pendingScroll: PendingScroll | null = null;
  let pendingFocusQuestion: Question | null = null;
  /**
   * Monotonic per-request generation. A flush captures it at start and
   * abandons after any `await` if a newer request arrived — the newer
   * flush owns the (separately parked) focus intent, and a stale
   * measurement must never scroll after a fresher one already did.
   */
  let generation = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let settle: PendingSettle | null = null;
  let reportedNoScrollHost = false;
  let reportedAllowOverride = false;

  /**
   * Makes the cancellation IRREVERSIBLE for the dispatch (review round 2,
   * critical): `EventBase.fire` hands the SAME mutable options object to
   * every later subscriber (event.ts:17-23), so a plain `allow = false`
   * could be reassigned by a consumer handler, re-opening core's DOM
   * block and the unguarded `settings.environment` destructure
   * (survey.ts:5872). The getter pins `false`; the setter no-ops (a
   * throwing setter would crash strict-mode consumer handlers) and
   * surfaces the `allow-override-ignored` diagnostic once per install.
   */
  function lockAllowFalse(eventOptions: ScrollToTopEvent): void {
    try {
      Object.defineProperty(eventOptions, 'allow', {
        configurable: false,
        enumerable: true,
        get: () => false,
        set: () => {
          if (!reportedAllowOverride) {
            reportedAllowOverride = true;
            const question = (eventOptions.question ??
              eventOptions.element ??
              null) as unknown as Base | null;
            reportDiagnostic({
              code: 'lifecycle-diagnostic',
              lifecycleCode: 'allow-override-ignored',
              elementName: question ? readElementName(question) : undefined,
              elementType: question ? readElementType(question) : undefined,
            });
          }
        },
      });
    } catch {
      // A consumer-frozen/locked options object can't be redefined;
      // plain assignment is the remaining best effort (non-throwing
      // invariant — the bridge must never crash the funnel).
      eventOptions.allow = false;
    }
  }

  /**
   * Initiates native focus on the handle. Deliberately does NOT call
   * `question.focusIn()` — the component's native input fires it from
   * its actual `onFocus` event (ownership contract on
   * `ElementHandle.focusFirst`). The a11y fallback is container focus,
   * not input focus, so it fires no focusIn either.
   */
  function initiateFocus(handle: ElementHandle): void {
    if (!installed) return;
    const landed = handle.focusFirst ? handle.focusFirst() === true : false;
    if (!landed) {
      handle.a11yFocus?.();
    }
  }

  /** Consumes and completes (or re-schedules) the parked focus intent. */
  function completePendingFocus(scrolled: boolean): void {
    const question = pendingFocusQuestion;
    if (!question) return;
    pendingFocusQuestion = null;
    // The focus handle resolves from the QUESTION itself (exact → page
    // fallback), independent of the possibly-different scroll target
    // (e.g. a later same-tick page request took the scroll).
    const target = registry.resolveScrollTarget(question);
    if (!target) return;
    if (scrolled) {
      // RN scrollTo has no completion callback; bounded settle delay
      // (documented approximation, design doc piece 2 step 4).
      settle = {
        question,
        timer: setTimeout(() => {
          settle = null;
          initiateFocus(target.handle);
        }, scrollSettleMs),
      };
    } else {
      initiateFocus(target.handle);
    }
  }

  async function flush(): Promise<void> {
    flushTimer = null;
    if (!installed) return;
    const gen = generation;
    const request = pendingScroll;
    pendingScroll = null;

    let scrolled = false;
    const target = request?.candidate
      ? registry.resolveScrollTarget(request.candidate)
      : null;
    if (request && target) {
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
            // Contained (invariant 9 spirit): a host that rejects
            // mid-flight (e.g. unmounted between request and measure)
            // degrades to a skipped scroll — focus-intent completion
            // below still runs.
            console.error(
              '[react-native-survey-library] lifecycle scroll-host measureTarget failed; skipping the scroll',
              error
            );
            measured = null;
          }
          // STALE DROP: a newer request arrived while measuring — its
          // flush owns the scroll and the parked focus intent.
          if (!installed || gen !== generation) return;
          if (measured) {
            const viewport = host.getViewport();
            const fullyVisible =
              !!viewport &&
              measured.y >= viewport.offsetY &&
              measured.y + measured.height <=
                viewport.offsetY + viewport.height;
            if (!fullyVisible) {
              host.scrollTo(Math.max(0, measured.y - topInset), true);
              scrolled = true;
            }
          }
        }
      }
    }

    completePendingFocus(scrolled);
  }

  function handleScrollToTop(
    _sender: SurveyModel,
    eventOptions: ScrollToTopEvent
  ): void {
    // Native ownership — never let core reach the DOM block or the
    // settings.environment destructure. Locked (not just assigned) so no
    // later subscriber can reassign it; set even when uninstalled races
    // are impossible (we removed the handler), purely defensive.
    lockAllowFalse(eventOptions);
    if (!installed) return;
    const question = (eventOptions.question ?? null) as Question | null;
    const page = (eventOptions.page ?? null) as PageModel | null;
    const element = (eventOptions.element ?? null) as unknown as Base | null;

    generation += 1;

    // A newer request supersedes an in-flight settle window: cancel the
    // timer and RE-PARK its focus intent (a scroll-only request must not
    // drop it; a newer focus intent below replaces it).
    if (settle) {
      clearTimeout(settle.timer);
      pendingFocusQuestion = settle.question;
      settle = null;
    }

    // Scroll target: last-wins within the tick (matches web, where the
    // later scrollIntoView wins).
    pendingScroll = {
      candidate: (question as Base | null) ?? element ?? (page as Base | null),
      question,
      page,
    };

    // Focus intent: ONLY the Question.focus caller shape (elementId ===
    // question.id). panel.expand() carries `question` too but targets
    // q.inputId and chains no focus callback — scroll-only, web parity
    // (see the module banner + design doc "Focus-intent discrimination").
    const focusIntent =
      question !== null &&
      eventOptions.elementId === (question as unknown as { id?: string }).id;
    if (focusIntent) {
      pendingFocusQuestion = question;
    }

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
    if (settle !== null) {
      clearTimeout(settle.timer);
      settle = null;
    }
    pendingScroll = null;
    pendingFocusQuestion = null;
    registry.clear();
  };
}
