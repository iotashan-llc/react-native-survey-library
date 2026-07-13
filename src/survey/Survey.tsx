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
import { ScrollView, View } from 'react-native';
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
import { reportDiagnostic } from '../diagnostics';
import { createLifecycleRegistry } from '../lifecycle/registry';
import { installLifecycleBridge } from '../lifecycle/bridge';
import { LifecycleContext } from '../lifecycle/LifecycleContext';
import type { LifecycleContextValue } from '../lifecycle/LifecycleContext';
import type { LifecycleRegistry, ScrollHostHandle } from '../lifecycle/types';
import { extractModelEventProps, wireModelEventProps } from './event-props';
import type { ExtractedEventProps, SurveyModelEventProps } from './event-props';

/** RN-level scroll-interception event (design note, "Bridge wiring"):
 * surfaced once the 1.2 bridge exposes its consult seam. */
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
  private lastActivePage: unknown = null;
  private lastNarrow: boolean | null = null;

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

  componentDidMount(): void {
    super.componentDidMount();
    const survey = this.props.survey;
    this.uninstallBridge = installLifecycleBridge(survey, this.registry, {});
    this.deregisterScrollHost = this.registry.registerScrollHost(
      this.buildScrollHostHandle()
    );
    wireModelEventProps(survey, {}, this.props.eventProps);
    this.wiredEventProps = this.props.eventProps;
    // Core-initiated full re-renders (upstream parity: reactSurvey.tsx
    // setSurveyEvents) — covers state/page transitions the property
    // subscription may not surface.
    survey.renderCallback = () => this.forceUpdate();
    this.lastActivePage = survey.activePage;
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    const survey = this.props.survey;
    wireModelEventProps(survey, this.wiredEventProps, this.props.eventProps);
    this.wiredEventProps = this.props.eventProps;

    // The render-complete call that drives the page-change scroll (1.2
    // design, "Sequencing"): re-enters the core funnel, which the bridge
    // intercepts. Only meaningful while the survey is presenting pages.
    // Core afterRenderPage parity (survey.ts:5514-5519): a pending
    // `focusingQuestionInfo` (set by `focusQuestion`) routes to
    // `focusQuestionInfo()` and SUPPRESSES the page-change scroll —
    // either/or, never both. Both members are private in the typings but
    // real at runtime (`focusQuestionInfo` is a prototype method, pinned
    // by the api-surface gate; `focusingQuestionInfo` is a bare field —
    // see the gate's not-listable note).
    const page = survey.activePage;
    if (page !== this.lastActivePage) {
      this.lastActivePage = page;
      const state = survey.state;
      if (page && (state === 'running' || state === 'starting')) {
        const focusable = survey as unknown as {
          focusingQuestionInfo?: unknown;
          focusQuestionInfo(): void;
        };
        if (focusable.focusingQuestionInfo) {
          focusable.focusQuestionInfo();
        } else {
          survey.scrollToTopOnPageChange();
        }
      }
    }
  }

  componentWillUnmount(): void {
    const survey = this.props.survey;
    wireModelEventProps(survey, this.wiredEventProps, {});
    this.wiredEventProps = {};
    survey.renderCallback = undefined as unknown as () => void;
    this.deregisterScrollHost?.();
    this.deregisterScrollHost = undefined;
    this.uninstallBridge?.();
    this.uninstallBridge = undefined;
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

  private readonly handleRootLayout = (event: LayoutChangeEvent): void => {
    const narrow = event.nativeEvent.layout.width < NARROW_BREAKPOINT;
    if (narrow !== this.lastNarrow) {
      this.lastNarrow = narrow;
      this.props.onNarrowChange(narrow);
    }
  };

  protected renderElement(): React.JSX.Element {
    const survey = this.props.survey;
    const state = survey.state;
    const presentingPages = state === 'running' || state === 'starting';
    return (
      <LifecycleContext.Provider value={this.lifecycleValue}>
        <View testID="survey-root" onLayout={this.handleRootLayout}>
          <ScrollView
            ref={this.scrollRef}
            testID="survey-scroll"
            onScroll={this.handleScroll}
            onLayout={this.handleScrollLayout}
            scrollEventThrottle={16}
          >
            {presentingPages
              ? this.renderActivePage()
              : this.renderNonRunningState(state)}
          </ScrollView>
        </View>
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
    return RNElementFactory.createElement(key, { survey, page });
  }

  /** Seam for task 1.8: completion/completed-before/loading/empty states
   * render nothing in the v0.1 shell. */
  protected renderNonRunningState(_state: string): React.JSX.Element | null {
    return null;
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
    // `onScrollToElement` stays inside `rest` deliberately —
    // `extractModelEventProps` excludes it by name (it is the RN-level
    // bridge-consult prop, not a model event). The bridge consult seam is
    // pending on the 1.2 task (LifecycleBridgeOptions has no
    // onScrollRequest yet — flagged); the prop contract is stable now,
    // wiring lands with the seam.
    const { json, model, theme, styles, uriPolicy, ...rest } = props;

    const entryRef = React.useRef<ModelEntry | null>(null);
    const innerRef = React.useRef<SurveyRoot | null>(null);
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
        if (prev?.owned && !prev.model.isDisposed) prev.model.dispose();
      };

      if (model !== undefined) {
        // Host-owned path — `model` wins over `json` (diagnostic above).
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
          return; // deep-equal json — never recreate (upstream parity)
        }
        disposePrevIfOwned();
        const { json: clean, diagnostics } = preflightSurveyJson(
          json,
          uriPolicy
        );
        for (const diagnostic of diagnostics) reportDiagnostic(diagnostic);
        entryRef.current = {
          model: new Model(clean as object) as unknown as SurveyModel,
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

    // Owned-model dispose on unmount. Clearing entryRef makes StrictMode's
    // remount simulation reconstruct from the retained json prop instead
    // of rendering a disposed model.
    React.useEffect(
      () => () => {
        const entry = entryRef.current;
        if (entry?.owned && !entry.model.isDisposed) entry.model.dispose();
        entryRef.current = null;
      },
      []
    );

    // applyTheme — on model creation/swap and on theme change (canonical
    // snapshot compare, not reference compare). No theme prop -> no call.
    React.useEffect(() => {
      if (!activeModel || !theme) {
        appliedThemeRef.current = { model: activeModel, signature: '' };
        return;
      }
      const signature = stableStringify(theme);
      if (
        appliedThemeRef.current.model === activeModel &&
        appliedThemeRef.current.signature === signature
      ) {
        return;
      }
      activeModel.applyTheme(theme);
      appliedThemeRef.current = { model: activeModel, signature };
    });

    // Responsive ownership (provider doc): narrow -> model.setIsMobile.
    React.useEffect(() => {
      if (!activeModel) {
        isMobileRef.current = { model: null, narrow: null };
        return;
      }
      if (
        isMobileRef.current.model === activeModel &&
        isMobileRef.current.narrow === narrow
      ) {
        return;
      }
      activeModel.setIsMobile(narrow);
      isMobileRef.current = { model: activeModel, narrow };
    });

    React.useImperativeHandle(ref, () => ({
      model: activeModel,
      focusQuestion: (name: string) =>
        entryRef.current?.model.focusQuestion(name) ?? false,
      scrollToTop: () => {
        innerRef.current?.scrollToHostTop();
      },
    }));

    const eventProps = extractModelEventProps(rest as Record<string, unknown>);

    return (
      <SurveyThemeProvider theme={theme} styles={styles} narrow={narrow}>
        {activeModel ? (
          <SurveyRoot
            key={entryRef.current!.key}
            ref={innerRef}
            survey={activeModel}
            eventProps={eventProps}
            onNarrowChange={setNarrow}
          />
        ) : null}
      </SurveyThemeProvider>
    );
  }
);

Survey.displayName = 'Survey';
