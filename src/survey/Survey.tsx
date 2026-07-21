/**
 * `<Survey>` root (design: docs/design/1.1-survey-root.md; A11, A12).
 *
 * Two layers:
 * - The public `Survey` (forwardRef function component) owns MODEL
 *   LIFECYCLE: json XOR model resolution, pre-model URL preflight (A11),
 *   owned-model dispose, `applyTheme`, `setIsMobile`, and the imperative
 *   `SurveyRefHandle`. Hooks here manage composition/lifecycle only —
 *   the A3 reactive binding stays in the class layer.
 * - `SurveyRoot` (class, extends the 0.4 `SurveyElementBase`) owns the
 *   per-model RENDER WIRING: event props, lifecycle bridge
 *   install/uninstall, scroll-host registration, the page-change
 *   render-complete call, and page dispatch through `RNElementFactory`.
 *   A model swap remounts it (`key`), so every subscription's lifetime is
 *   exactly one model's.
 *
 * Upstream reference: survey-react-ui's `Survey` (reactSurvey.tsx). Two
 * deliberate divergences, per the design note: model recreation happens
 * in commit-phase effects (upstream mutates inside
 * `shouldComponentUpdate`, a render-phase side effect React 19 may
 * replay/discard), and there is NO arbitrary model-property passthrough
 * (typed surface only; DIFFERENCES.md).
 */
import * as React from 'react';
import { Dimensions, ScrollView, View } from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';

import { Helpers, Model } from '../core/facade';
import type { Base, ITheme, SurveyModel } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { SurveyThemeProvider } from '../theme-rn/provider';
import type { SurveyComponentStyles } from '../theme-rn/overrides';
import { RNElementFactory } from '../factories/ElementFactory';
import { preflightSurveyJson } from '../security/json-preflight';
import type { UriPolicyConfig } from '../security/uri-policy';
import { UriPolicyContext } from '../security/UriPolicyContext';
import { LinkPressContext } from '../security/LinkPressContext';
import type { SurveyLinkPressHandler } from '../security/LinkPressContext';
import {
  acquireChoicesByUrlGate,
  installChoicesByUrlGate,
  registerModelUriPolicy,
  releaseChoicesByUrlGate,
  runWithConstructionUriPolicy,
  unregisterModelUriPolicy,
} from '../security/choices-gate';
import { reportDiagnostic } from '../diagnostics';
import {
  createLifecycleRegistry,
  readElementName,
} from '../lifecycle/registry';
import { installLifecycleBridge } from '../lifecycle/bridge';
import { LifecycleContext } from '../lifecycle/LifecycleContext';
import type { LifecycleContextValue } from '../lifecycle/LifecycleContext';
import type {
  LifecycleRegistry,
  ScrollHostHandle,
  ScrollRequestInfo,
} from '../lifecycle/types';
import { extractModelEventProps, wireModelEventProps } from './event-props';
import type { ExtractedEventProps, SurveyModelEventProps } from './event-props';
import { evaluateWidthExpression } from '../layout/width-resolver';
import { SurveyHeader } from '../components/SurveyHeader';
import { SurveyProgressBar } from '../components/SurveyProgressBar';
import { SurveyNavigation } from '../components/SurveyNavigation';
import { SurveyStateFrame } from '../components/SurveyStateFrame';
import { SurveyTimerPanel } from '../components/SurveyTimerPanel';
import { createOverlayStack } from '../overlay/stack';
import type { OverlayStack } from '../overlay/stack';
import type { OverlayPayload } from '../overlay/popup-bridge';
import { OverlayContext } from '../overlay/OverlayContext';
import { registerDialogHost } from '../overlay/dialog-adapter';
import type { DialogHostToken } from '../overlay/dialog-adapter';
import { OverlayHost } from '../overlay/OverlayHost';

/**
 * The shell's `ISurveyCreator` stand-in, threaded through page → row →
 * question dispatch. The RN dispatch chain never calls creator METHODS
 * (rows dispatch through the descriptor factories directly — upstream's
 * `createQuestionElement` role), but `QuestionElementBase.canRender`
 * requires a truthy creator (upstream parity) — omitting it renders
 * every question null (the 1.17 kitchen-sink regression). Frozen, stable
 * identity: never re-created across renders.
 */
const SHELL_CREATOR = Object.freeze({});

/** RN-level scroll-interception event (design note, "Bridge wiring"),
 * delivered through the bridge's `onScrollRequest` consult seam.
 * `preventDefault()` suppresses the NATIVE SCROLL ONLY — focus-intent
 * completion still runs (pinned bridge semantics). */
export interface SurveyScrollToElementEvent {
  elementName: string | undefined;
  preventDefault(): void;
}

export interface SurveyOwnProps {
  /** Untrusted survey JSON — preflighted (A11) BEFORE model construction
   * (`choicesByUrl` fires its request at construction). XOR with `model`. */
  json?: unknown;
  /** Host-constructed model — documented TRUSTED/prevalidated by the host
   * (A11). Never disposed by this component. */
  model?: SurveyModel;
  /** ITheme, passed unmodified: fed to BOTH `model.applyTheme` and
   * `SurveyThemeProvider`. */
  theme?: ITheme;
  /** A12 per-component slot overrides — forwarded to `SurveyThemeProvider`
   * (hoist the object; identity participates in provider memoization). */
  styles?: SurveyComponentStyles;
  /** URI-policy config for the json-path preflight. Render-time sinks keep
   * their own config seams per 0.9. */
  uriPolicy?: UriPolicyConfig;
  /** RN-level scroll interception with preventDefault semantics — consumed
   * by the 1.2 bridge (NOT a model event; excluded from event wiring). */
  onScrollToElement?: (event: SurveyScrollToElementEvent) => void;
  /** Host opt-in link events (NOT a model event; excluded from event
   * wiring). Provided through `LinkPressContext` to EVERY sanitized-HTML
   * sink in the tree (titles/descriptions/errors/completed-page/html
   * question/choices): an anchor press that passes the URI policy's
   * press-time revalidation delivers `{ url, context }` — the canonical
   * validated URL plus the sink label — and the HOST decides what to do
   * (e.g. `Linking.openURL(event.url)` is the host's line to write; this
   * library NEVER navigates — invariant 8). Without this prop (and
   * without a per-sink `SanitizedHtml onLinkPress`), anchors render as
   * plain text: no link a11y role, no pressable. */
  onLinkPress?: SurveyLinkPressHandler;
}

export type SurveyProps = SurveyOwnProps & SurveyModelEventProps;

export interface SurveyRefHandle {
  model: SurveyModel | null;
  /** Delegates to `model.focusQuestion` — routes through the core scroll
   * funnel, which the installed bridge intercepts natively. */
  focusQuestion(name: string): boolean;
  /** Scrolls the survey's host ScrollView to the top. */
  scrollToTop(): void;
}

/** Provider doc, "Responsive ownership": the Survey root owns
 * `onLayout -> width < 600 -> setIsMobile(narrow) AND the provider's
 * narrow prop`. */
const NARROW_BREAKPOINT = 600;

// ---------------------------------------------------------------------
// Inner class — per-model render wiring (remounted per model via `key`)
// ---------------------------------------------------------------------

interface SurveyRootProps {
  survey: SurveyModel;
  eventProps: ExtractedEventProps;
  onScrollToElement?: (event: SurveyScrollToElementEvent) => void;
  onNarrowChange(narrow: boolean): void;
}

type ScrollViewInstance = React.ComponentRef<typeof ScrollView>;

/** Structural view of the native methods this component actually calls —
 * RN 0.86's exported component types don't surface the instance methods
 * (`measureLayout`, `getInnerViewNode`) in their public typings. */
interface MeasurableNode {
  measureLayout(
    relativeTo: unknown,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail?: () => void
  ): void;
}

class SurveyRoot extends SurveyElementBase<SurveyRootProps> {
  private readonly registry: LifecycleRegistry = createLifecycleRegistry();
  private readonly lifecycleValue: LifecycleContextValue = {
    registry: this.registry,
  };

  private readonly scrollRef = React.createRef<ScrollViewInstance>();
  private uninstallBridge: (() => void) | undefined;
  private deregisterScrollHost: (() => void) | undefined;
  private wiredEventProps: ExtractedEventProps = {};
  private lastNarrow: boolean | null = null;
  /** Pending deferred timer-start (5.7a) — cleared on detach if the survey
   * unmounts/swaps before the macrotask fires. */
  private startTimerHandle: ReturnType<typeof setTimeout> | undefined;

  /** Scroll-host viewport bookkeeping (bridge-author wiring note:
   * onScroll + onLayout keep `getViewport()` answerable so the bridge can
   * honor `scrollIfVisible`; `null` before first layout = bridge scrolls
   * unconditionally, degraded but safe). Offset legitimately starts at 0;
   * only the height gates viewport availability. */
  private viewportOffsetY = 0;
  private viewportHeight: number | null = null;

  protected getStateElement(): Base | null {
    return this.props.survey;
  }

  /** Per-root overlay stack (design 2.1 D2) — provided to descendants
   * via OverlayContext; the host renders after the ScrollView. */
  private dialogHostToken: DialogHostToken | undefined;

  private readonly overlayStack: OverlayStack<OverlayPayload> =
    createOverlayStack<OverlayPayload>();

  /** 2.1 D3 device adapter — fill-if-untouched (see componentDidMount). */
  private readonly handleOpenDropdownMenu = (
    _sender: unknown,
    options: {
      deviceType?: string;
      screenWidth?: number;
      screenHeight?: number;
    }
  ): void => {
    // NULLISH detection — an explicit consumer 0 is a touched value.
    // Core's DOM-less defaults are undefined dims + deviceType 'mobile'
    // (calculateIsTablet(NaN) is false under IsTouch — devices.ts:56-64).
    if (options.screenWidth == null || options.screenHeight == null) {
      const window = Dimensions.get('window');
      if (options.screenWidth == null) options.screenWidth = window.width;
      if (options.screenHeight == null) options.screenHeight = window.height;
    }
    // Refine ONLY core's blind default; a consumer-set nondefault
    // deviceType (e.g. 'desktop') always survives. Same tablet heuristic
    // shape as upstream calculateIsTablet: smaller dimension at/above
    // the 600 breakpoint.
    if (options.deviceType === 'mobile') {
      const isTablet =
        Math.min(options.screenWidth, options.screenHeight) >= 600;
      options.deviceType = isTablet ? 'tablet' : 'mobile';
    }
  };

  /** Bridge consult -> `onScrollToElement` prop (design note, "Bridge
   * wiring"). Stable identity: installed once per model; reads the
   * LATEST prop so handler swaps never reinstall the bridge. Returning
   * `false` suppresses the native scroll only (focus still completes —
   * bridge-pinned semantics). */
  private readonly handleScrollRequest = (info: ScrollRequestInfo): boolean => {
    const handler = this.props.onScrollToElement;
    if (!handler) return true;
    let suppressed = false;
    handler({
      elementName: readElementName(info.element),
      preventDefault: () => {
        suppressed = true;
      },
    });
    return !suppressed;
  };

  componentDidMount(): void {
    super.componentDidMount();
    const survey = this.props.survey;
    this.uninstallBridge = installLifecycleBridge(survey, this.registry, {
      onScrollRequest: this.handleScrollRequest,
    });
    this.deregisterScrollHost = this.registry.registerScrollHost(
      this.buildScrollHostHandle()
    );
    wireModelEventProps(survey, {}, this.props.eventProps);
    this.wiredEventProps = this.props.eventProps;
    // Core-initiated full re-renders (upstream parity: reactSurvey.tsx
    // setSurveyEvents) — covers state/page transitions the property
    // subscription may not surface.
    survey.renderCallback = () => this.forceUpdate();
    // 2.1 device adapter (design D3): fill-if-untouched — core computed
    // the dropdown-menu options with no DOM window, so only MISSING
    // fields are filled from RN Dimensions; consumer listeners (any
    // registration order) are never clobbered. Identity unsubscribe in
    // detachFromModel.
    survey.onOpenDropdownMenu.add(this.handleOpenDropdownMenu);
    // 2.2 dialog adapter: this root's overlay stack becomes a dialog
    // host (last-mounted wins). Token disposal is independent of the
    // `detached` guard — StrictMode remounts register fresh tokens.
    this.dialogHostToken = registerDialogHost(this.overlayStack);
    // 5.7a timer: start the core timer (upstream reactSurvey onSurveyUpdated
    // → `startTimerFromUI()`). Core self-gates: it starts only when
    // `showTimer` is set and `state === "running"`; otherwise a no-op. The
    // SurveyTimer singleton owns the interval — `detachFromModel` stops it.
    //
    // DEFERRED one macrotask (same rationale as the outer component's
    // `setIsMobile` deferral): `startTimerFromUI` flips `timerModel.isRunning`,
    // and a just-mounted `SurveyTimerPanel` subscribed to that model would see
    // the mutation inside its own mount-commit window, tripping the dev-only
    // render-to-commit invariant (0.4-reactive-base). One macrotask later the
    // mount commit is flushed and the panel observes the start cleanly.
    this.startTimerHandle = setTimeout(() => {
      this.startTimerHandle = undefined;
      if (!this.detached && !this.props.survey.isDisposed) {
        this.props.survey.startTimerFromUI();
      }
    }, 0);
    this.callAfterRenderPage();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    const survey = this.props.survey;
    wireModelEventProps(survey, this.wiredEventProps, this.props.eventProps);
    this.wiredEventProps = this.props.eventProps;
    this.callAfterRenderPage();
  }

  /**
   * The render-complete call (review round 1: full core parity, not a
   * hand-rolled either/or). Delegates to core's PUBLIC `afterRenderPage`
   * (survey.ts:5514-5526) — exactly what upstream's page component calls
   * from ITS didMount/didUpdate — which owns the whole machine: design-
   * mode suppression, `doScroll` dedup via `isCurrentPageRendered`
   * (mount → `scrollToTopOnPageChange(false)`, the autofocus path; page
   * change → `(true)`), the `setTimeout(…, 1)` deferral, the pending-
   * focus suppression, and the unconditional `focusQuestionInfo()`.
   * The deferred funnel re-enters `scrollToTopOnPageChange`, which the
   * installed bridge intercepts (1.2 design, "Sequencing").
   *
   * RN has no HTMLElement: `onAfterRenderPage` subscribers receive
   * `htmlElement: null` (documented in DIFFERENCES.md).
   */
  /** The page whose render-complete was last reported — upstream's page
   * component likewise skips updates while the same page stays active
   * (panel-base.tsx:53-62); without this gate the 0.4 base's mount
   * reconciliation update and every unrelated model update would re-fire
   * `onAfterRenderPage` and re-schedule deferred scrolls (review round 2). */
  private lastAfterRenderPage: unknown = null;

  private callAfterRenderPage(): void {
    const survey = this.props.survey;
    const state = survey.state;
    const page = survey.activePage;
    const presenting =
      state === 'running' || state === 'starting' || state === 'preview';
    if (!page || !presenting) {
      // Reset the gate whenever no page presents (review round 3): a
      // completed→clear() round-trip re-mounts the SAME PageModel and
      // must re-fire the render-complete for it.
      this.lastAfterRenderPage = null;
      return;
    }
    if (page === this.lastAfterRenderPage) return;
    this.lastAfterRenderPage = page;
    (
      survey as unknown as { afterRenderPage(htmlElement: unknown): void }
    ).afterRenderPage(null);
  }

  /** Whether `detachFromModel` already ran (swap transactions detach
   * BEFORE the keyed unmount — see the outer component's model-resolution
   * effect; review round 1 "ordered transaction"). */
  private detached = false;

  /**
   * Idempotent teardown of every model-facing wire this root owns:
   * event props, renderCallback, scroll-host registration, bridge.
   * Called by the OUTER component before it disposes an owned model on
   * swap (the keyed unmount only happens a commit later — too late), and
   * by `componentWillUnmount` for the normal path.
   */
  public detachFromModel(): void {
    // Dialog host teardown sits OUTSIDE the detached guard (2.2 D2 —
    // StrictMode double-mounts re-register; dispose() is idempotent).
    this.dialogHostToken?.dispose();
    this.dialogHostToken = undefined;
    if (this.detached) return;
    this.detached = true;
    const survey = this.props.survey;
    // 5.7a timer: cancel a not-yet-fired deferred start, then stop the core
    // timer (upstream reactSurvey destroySurvey → `stopTimer()`) so the
    // SurveyTimer interval is cleared — no leaked setInterval after
    // unmount/model-swap. Both are no-ops when the timer never started.
    if (this.startTimerHandle !== undefined) {
      clearTimeout(this.startTimerHandle);
      this.startTimerHandle = undefined;
    }
    survey.stopTimer();
    survey.onOpenDropdownMenu.remove(this.handleOpenDropdownMenu);
    wireModelEventProps(survey, this.wiredEventProps, {});
    this.wiredEventProps = {};
    survey.renderCallback = undefined as unknown as () => void;
    this.deregisterScrollHost?.();
    this.deregisterScrollHost = undefined;
    this.uninstallBridge?.();
    this.uninstallBridge = undefined;
  }

  componentWillUnmount(): void {
    this.detachFromModel();
    super.componentWillUnmount();
  }

  /** `SurveyRefHandle.scrollToTop` delegate. */
  public scrollToHostTop(): void {
    this.scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  private buildScrollHostHandle(): ScrollHostHandle {
    return {
      scrollTo: (y, animated) => {
        this.scrollRef.current?.scrollTo({ y, animated });
      },
      measureTarget: (containerRef) =>
        new Promise((resolve) => {
          const node = containerRef.current as unknown as
            MeasurableNode | null | undefined;
          const scrollView = this.scrollRef.current as unknown as
            { getInnerViewNode?: () => unknown } | null | undefined;
          const host = scrollView?.getInnerViewNode?.();
          if (!node || typeof node.measureLayout !== 'function' || !host) {
            resolve(null);
            return;
          }
          node.measureLayout(
            host,
            (_x: number, y: number, _width: number, height: number) =>
              resolve({ y, height }),
            () => resolve(null)
          );
        }),
      getViewport: () =>
        this.viewportHeight === null
          ? null
          : { offsetY: this.viewportOffsetY, height: this.viewportHeight },
    };
  }

  private readonly handleScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ): void => {
    this.viewportOffsetY = event.nativeEvent.contentOffset.y;
  };

  private readonly handleScrollLayout = (event: LayoutChangeEvent): void => {
    this.viewportHeight = event.nativeEvent.layout.height;
  };

  /** Measured root width — the percent base for a calc()-form
   * `renderedWidth` (plain % strings pass through natively). */
  private rootLayoutWidth: number | null = null;

  private readonly handleRootLayout = (event: LayoutChangeEvent): void => {
    const width = event.nativeEvent.layout.width;
    if (width !== this.rootLayoutWidth) {
      this.rootLayoutWidth = width;
      this.forceUpdate();
    }
    const narrow = width < NARROW_BREAKPOINT;
    if (narrow !== this.lastNarrow) {
      this.lastNarrow = narrow;
      this.props.onNarrowChange(narrow);
    }
  };

  /**
   * Root width contract (1.3 design "Exclusions" — owned here): upstream
   * applies `style.maxWidth = survey.renderedWidth` on the page body
   * (reactSurvey.tsx:178-180) and centers it via the static-mode css.
   * `renderedWidth` is `"600px"` / `"80%"` / undefined; percent strings
   * pass through (native % maxWidth), everything else goes through the
   * 1.3 evaluator (px/calc → dp). Reactive for free: `width`/
   * `calculatedWidthMode` are model properties the 0.4 base observes.
   */
  private resolveRootWidthStyle():
    | { maxWidth: number | string; alignSelf: 'center'; width: '100%' }
    | undefined {
    const raw = (this.props.survey as SurveyModel & { renderedWidth?: unknown })
      .renderedWidth;
    if (!raw || typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const constrain = (maxWidth: number | string) =>
      ({ maxWidth, alignSelf: 'center', width: '100%' }) as const;
    if (trimmed.endsWith('%')) return constrain(trimmed);
    const value = evaluateWidthExpression(trimmed, this.rootLayoutWidth ?? 0);
    if (value.kind === 'dp' && value.dp > 0) return constrain(value.dp);
    return undefined;
  }

  protected renderElement(): React.JSX.Element {
    const survey = this.props.survey;
    const state = survey.state;
    const presentingPages = state === 'running' || state === 'starting';
    return (
      <LifecycleContext.Provider value={this.lifecycleValue}>
        <OverlayContext.Provider value={this.overlayStack}>
          {/* The OUTER root stays unconstrained — it is the layout probe
            (narrow breakpoint + the width evaluator's percent base). The
            constraint applies to the INNER body only, so a calc()-form
            renderedWidth never feeds its own result back into the base
            (review round 2: 1000dp parent + calc(100% - 40px) must stay
            960, not shrink 960→920→880 across layouts). */}
          <View testID="survey-root" onLayout={this.handleRootLayout}>
            <View testID="survey-body" style={this.resolveRootWidthStyle()}>
              <ScrollView
                ref={this.scrollRef}
                testID="survey-scroll"
                onScroll={this.handleScroll}
                onLayout={this.handleScrollLayout}
                scrollEventThrottle={16}
              >
                {/* Shell assembly (task 1.17): header always (its own
                  renderedHasHeader gate applies); progress + nav only
                  while pages present; the state frame owns completed/
                  completedBefore/loading/empty. */}
                <SurveyHeader survey={survey} />
                {presentingPages ? (
                  <SurveyTimerPanel survey={survey} location="top" />
                ) : null}
                {presentingPages ? <SurveyProgressBar survey={survey} /> : null}
                {presentingPages ? (
                  this.renderActivePage()
                ) : (
                  <SurveyStateFrame survey={survey} />
                )}
                {presentingPages ? <SurveyNavigation survey={survey} /> : null}
                {presentingPages ? (
                  <SurveyTimerPanel survey={survey} location="bottom" />
                ) : null}
              </ScrollView>
            </View>
            <OverlayHost stack={this.overlayStack} />
          </View>
        </OverlayContext.Provider>
      </LifecycleContext.Provider>
    );
  }

  private renderActivePage(): React.JSX.Element | null {
    const survey = this.props.survey;
    const page = survey.activePage;
    if (!page) return null;
    // Upstream parity (reactSurvey.tsx renderPage): the model's
    // pageComponent override wins over the default key. Task 1.4
    // registers the real 'sv-page'; until then an unregistered key
    // renders an empty shell (createElement -> null), never a crash.
    const key =
      (survey as SurveyModel & { pageComponent?: string }).pageComponent ||
      'sv-page';
    return RNElementFactory.createElement(key, {
      survey,
      page,
      creator: SHELL_CREATOR,
    });
  }
}

// ---------------------------------------------------------------------
// Outer function component — model lifecycle owner
// ---------------------------------------------------------------------

interface ModelEntry {
  model: SurveyModel;
  owned: boolean;
  /** The consumer's ORIGINAL json reference (pre-preflight) — the
   * `Helpers.isTwoValueEquals` comparison base for change detection. */
  json: unknown;
  /** Remount key for `SurveyRoot` — bumped on every model swap so all
   * per-model wiring gets a fresh instance. */
  key: number;
}

/** Recursively sorts object keys — same canonicalization approach as the
 * provider's snapshot memoization: an equal-but-different-reference (or
 * same-reference-but-mutated) theme produces the matching signature. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',');
  return `{${body}}`;
}

type PropCondition = 'ok' | 'conflicting' | 'missing';

export const Survey = React.forwardRef<SurveyRefHandle, SurveyProps>(
  function SurveyImpl(props, ref) {
    // `onScrollToElement` is the RN-level bridge-consult prop, not a
    // model event: it is destructured out here and routed to the bridge's
    // `onScrollRequest` seam by `SurveyRoot` (`extractModelEventProps`
    // also excludes it by name, defense in depth).
    const {
      json,
      model,
      theme,
      styles,
      uriPolicy,
      onScrollToElement,
      onLinkPress,
      ...rest
    } = props;

    const entryRef = React.useRef<ModelEntry | null>(null);
    const innerRef = React.useRef<SurveyRoot | null>(null);
    /** Two-phase owned-model disposal (review round 2): a replaced owned
     * model is STAGED here; the keyed remount commit unmounts the old
     * tree (every 0.4 subscription unwinds), and only the FOLLOWING
     * commit's dispose effect actually disposes — so disposal never runs
     * with live UI subscribers. `staged` → `ready` → disposed. */
    const disposeStagedRef = React.useRef<SurveyModel[]>([]);
    const disposeReadyRef = React.useRef<SurveyModel[]>([]);
    const lastConditionRef = React.useRef<PropCondition | null>(null);
    const appliedThemeRef = React.useRef<{
      model: SurveyModel | null;
      signature: string;
    }>({ model: null, signature: '' });
    const isMobileRef = React.useRef<{
      model: SurveyModel | null;
      narrow: boolean | null;
    }>({ model: null, narrow: null });
    const [, force] = React.useReducer((c: number) => c + 1, 0);
    const [narrow, setNarrow] = React.useState(false);

    const activeModel = entryRef.current?.model ?? null;

    // Model resolution — commit phase, every commit, internally guarded
    // (upstream does this in shouldComponentUpdate; see module header).
    React.useEffect(() => {
      // Re-assert the request-time choicesByUrl gate every commit
      // (idempotent single compare): a host hook assigned between commits
      // is captured into the gate's chain instead of displacing it.
      installChoicesByUrlGate();
      const condition: PropCondition =
        model !== undefined
          ? json !== undefined
            ? 'conflicting'
            : 'ok'
          : json !== undefined
            ? 'ok'
            : 'missing';
      if (condition !== lastConditionRef.current) {
        lastConditionRef.current = condition;
        if (condition === 'conflicting') {
          reportDiagnostic({
            code: 'survey-root-diagnostic',
            rootCode: 'conflicting-props',
          });
        } else if (condition === 'missing') {
          reportDiagnostic({
            code: 'survey-root-diagnostic',
            rootCode: 'missing-model',
          });
        }
      }

      const prev = entryRef.current;
      const disposePrevIfOwned = (): void => {
        // Ordered swap transaction (review rounds 1+2): detach the old
        // root's explicit model wiring (events, renderCallback, scroll
        // host, bridge) NOW, then STAGE the owned model for disposal —
        // the keyed remount commit unmounts the old tree (unsubscribing
        // every 0.4 reactive subscriber, root and descendants) and the
        // commit after that actually disposes (dispose effect below).
        innerRef.current?.detachFromModel();
        if (prev) unregisterModelUriPolicy(prev.model);
        if (prev?.owned && !prev.model.isDisposed) {
          disposeStagedRef.current.push(prev.model);
        }
      };

      if (model !== undefined) {
        // Host-owned path — `model` wins over `json` (diagnostic above).
        // Request-time gate: a host model's runtime RE-runs are gated
        // only when the host provided `uriPolicy` (its construction-time
        // requests fired before this component existed — documented
        // boundary); without the prop the documented trusted-by-host
        // contract holds. Synced every commit so a uriPolicy prop
        // change/removal takes effect.
        if (uriPolicy !== undefined) registerModelUriPolicy(model, uriPolicy);
        else unregisterModelUriPolicy(model);
        if (prev && !prev.owned && prev.model === model) return;
        disposePrevIfOwned();
        entryRef.current = {
          model,
          owned: false,
          json: undefined,
          key: (prev?.key ?? 0) + 1,
        };
        force();
        return;
      }

      if (json !== undefined) {
        if (
          prev?.owned &&
          !prev.model.isDisposed &&
          Helpers.isTwoValueEquals(prev.json, json)
        ) {
          // Same model kept — refresh its request-time gate config so a
          // uriPolicy-only prop change still takes effect.
          registerModelUriPolicy(prev.model, uriPolicy);
          return; // deep-equal json — never recreate (upstream parity)
        }
        disposePrevIfOwned();
        const { json: clean, diagnostics } = preflightSurveyJson(
          json,
          uriPolicy
        );
        for (const diagnostic of diagnostics) reportDiagnostic(diagnostic);
        // Construction-context window (A11 request-time gate):
        // choicesByUrl requests fire synchronously inside `new Model()`,
        // before the instance exists to key the registry. An owned model
        // is ALWAYS gated — `undefined` config gates with the fail-closed
        // defaults, mirroring the preflight above.
        const built = runWithConstructionUriPolicy(
          uriPolicy,
          () => new Model(clean as object)
        ) as unknown as SurveyModel;
        registerModelUriPolicy(built, uriPolicy);
        entryRef.current = {
          model: built,
          owned: true,
          json,
          key: (prev?.key ?? 0) + 1,
        };
        force();
        return;
      }

      if (prev) {
        disposePrevIfOwned();
        entryRef.current = null;
        force();
      }
    });

    // Dispose effect — the second phase of the swap transaction. Runs
    // AFTER the resolution effect every commit: `ready` models were
    // staged in a PREVIOUS commit, so the keyed remount that unmounted
    // their tree (and unwound every 0.4 subscription) has already
    // committed — dispose them now. Then promote this commit's staged
    // models; the `force()` the resolution effect issued guarantees the
    // promoting commit happens.
    React.useEffect(() => {
      const ready = disposeReadyRef.current;
      if (ready.length > 0) {
        disposeReadyRef.current = [];
        for (const staleModel of ready) {
          if (!staleModel.isDisposed) staleModel.dispose();
        }
      }
      if (disposeStagedRef.current.length > 0) {
        disposeReadyRef.current = disposeStagedRef.current;
        disposeStagedRef.current = [];
      }
    });

    // Owned-model dispose on unmount. Clearing entryRef makes StrictMode's
    // remount simulation reconstruct from the retained json prop instead
    // of rendering a disposed model.
    React.useEffect(
      () => () => {
        for (const staleModel of [
          ...disposeReadyRef.current,
          ...disposeStagedRef.current,
        ]) {
          if (!staleModel.isDisposed) staleModel.dispose();
        }
        disposeReadyRef.current = [];
        disposeStagedRef.current = [];
        const entry = entryRef.current;
        if (entry) unregisterModelUriPolicy(entry.model);
        if (entry?.owned && !entry.model.isDisposed) entry.model.dispose();
        entryRef.current = null;
      },
      []
    );

    // Request-time choicesByUrl gate lifetime: refcounted across ALL
    // mounted Surveys (they share the one global hook safely); the last
    // unmount restores whatever host hook the gate had captured.
    React.useEffect(() => {
      acquireChoicesByUrlGate();
      return () => releaseChoicesByUrlGate();
    }, []);

    // applyTheme — on model creation/swap and on theme change (canonical
    // snapshot compare, not reference compare). No theme prop -> no call.
    // Reads the LIVE entry (never the render-captured snapshot): within
    // the same commit as a swap, the resolution effect above has already
    // replaced the model, and the render-time capture would be the old —
    // possibly just-disposed — instance (review round 1).
    React.useEffect(() => {
      const liveModel = entryRef.current?.model ?? null;
      if (!liveModel || !theme) {
        appliedThemeRef.current = { model: liveModel, signature: '' };
        return;
      }
      const signature = stableStringify(theme);
      if (
        appliedThemeRef.current.model === liveModel &&
        appliedThemeRef.current.signature === signature
      ) {
        return;
      }
      liveModel.applyTheme(theme);
      appliedThemeRef.current = { model: liveModel, signature };
    });

    // Responsive ownership (provider doc): narrow -> model.setIsMobile.
    // Live-entry read, same rationale as the theme effect above. The
    // write is DEFERRED one macrotask: this effect runs in the same
    // commit batch that mounts subscriber components (their D4
    // mount-commit window is still open), and `setIsMobile` fans out a
    // `_isMobile` property notification — deferring moves the mutation
    // after the batch so the dev-only render-to-commit invariant warning
    // never fires for the renderer's own responsive plumbing (task 1.16
    // polish; behavior unchanged — core no-ops equal values).
    React.useEffect(() => {
      const liveModel = entryRef.current?.model ?? null;
      if (!liveModel) {
        isMobileRef.current = { model: null, narrow: null };
        return;
      }
      if (
        isMobileRef.current.model === liveModel &&
        isMobileRef.current.narrow === narrow
      ) {
        return;
      }
      // The applied-ref updates INSIDE the timer (review round 1): an
      // intervening re-render cancels the pending timer via cleanup, and
      // the rescheduled effect must not early-return believing the write
      // already landed.
      const timer = setTimeout(() => {
        isMobileRef.current = { model: liveModel, narrow };
        if (!liveModel.isDisposed) liveModel.setIsMobile(narrow);
      }, 0);
      return () => clearTimeout(timer);
    });

    React.useImperativeHandle(ref, () => ({
      // Getter: the handle can never expose a stale render-captured model
      // while its methods act on the live entry (review round 1).
      get model() {
        return entryRef.current?.model ?? null;
      },
      focusQuestion: (name: string) =>
        entryRef.current?.model.focusQuestion(name) ?? false,
      scrollToTop: () => {
        innerRef.current?.scrollToHostTop();
      },
    }));

    const eventProps = extractModelEventProps(rest as Record<string, unknown>);

    return (
      <UriPolicyContext.Provider value={uriPolicy}>
        <LinkPressContext.Provider value={onLinkPress}>
          <SurveyThemeProvider theme={theme} styles={styles} narrow={narrow}>
            {activeModel ? (
              <SurveyRoot
                key={entryRef.current!.key}
                ref={innerRef}
                survey={activeModel}
                eventProps={eventProps}
                onScrollToElement={onScrollToElement}
                onNarrowChange={setNarrow}
              />
            ) : null}
          </SurveyThemeProvider>
        </LinkPressContext.Provider>
      </UriPolicyContext.Provider>
    );
  }
);

Survey.displayName = 'Survey';
