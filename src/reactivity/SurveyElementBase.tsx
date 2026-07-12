/**
 * Class-based reactive binding between survey-core `Base` models and React
 * (design: docs/design/0.4-reactive-base.md, A3). Ported from
 * survey-react-ui's `SurveyElementBase` (reactquestion_element.tsx) with
 * four deliberate divergences (D1-D4) documented inline below — the
 * mechanism is preserved, not upstream's render-phase side effects, which
 * violate React 19 contracts. See the design doc for the full rationale;
 * this file implements it, it does not re-derive it.
 *
 * All survey-core imports go through the facade per the project's import
 * contract (ESLint-enforced).
 */
import * as React from 'react';
import { Text } from 'react-native';
import type {
  Base,
  IPropertyArrayValueChangedEvent,
  IPropertyValueChangedEvent,
  LocalizableString,
} from '../core/facade';
import { SurveyThemeContext } from '../theme-rn/provider';

/**
 * Reserved base state shape. `__svRev` is a monotonically-bumped counter —
 * never a copy of any model property — so subclass state fields can never
 * collide with a model notification (see design doc "State shape").
 */
export interface SurveyElementBaseState {
  __svRev?: number;
}

/**
 * D2's render guard (`reactRendering`) is intentionally NOT a declared
 * survey-core property — it is a dynamically-added counter living ON the
 * model, shared across every React observer of that model. This type
 * documents the shape without touching survey-core's own typings.
 */
type RenderGuardHost = Base & { reactRendering?: number };

type PropertyChangedCallback = (
  sender: Base,
  options: IPropertyValueChangedEvent
) => void;

type ArrayChangedCallback = (
  sender: Base,
  options: IPropertyArrayValueChangedEvent
) => void;

/**
 * RN's Metro (and jest's react-native preset) define the `__DEV__` global;
 * declared module-locally so the dev-only mount-commit warning typechecks
 * without widening the library's ambient types.
 */
declare const __DEV__: boolean | undefined;

function isDevMode(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

type SubscribableElement = Base & {
  addOnPropertyValueChangedCallback?: (
    callback: PropertyChangedCallback
  ) => void;
  removeOnPropertyValueChangedCallback?: (
    callback: PropertyChangedCallback
  ) => void;
  addOnArrayChangedCallback?: (callback: ArrayChangedCallback) => void;
  removeOnArrayChangedCallback?: (callback: ArrayChangedCallback) => void;
};

export class SurveyElementBase<
  P = unknown,
  S extends SurveyElementBaseState = SurveyElementBaseState,
> extends React.Component<P, S> {
  /**
   * Companion amendment 1 (design: docs/design/0.7-theme-rn.md,
   * "Companion amendments" #1): every `SurveyElementBase` subclass
   * inherits `SurveyThemeContext` consumption via `this.context` for
   * free — no `<Context.Consumer>` wrapper, no `useContext` (which
   * would require a hooks rewrite, contrary to A3). Single-context
   * constraint: a subclass that ALSO needs a different context cannot
   * use `static contextType` for it (React allows only one) and must
   * fall back to `<Context.Consumer>` for that second context — same
   * limitation any React class component with `contextType` already
   * set has. (No `declare context` field: this project's Babel-based
   * TS transform doesn't have `allowDeclareFields` enabled, so a `declare`
   * class member would emit as a real runtime field write; the typed
   * accessor below reads the React-managed `this.context` instead.)
   */
  static contextType = SurveyThemeContext;

  /** Typed accessor for `this.context` (companion amendment 1's "typed `this.context` accessor"). */
  protected get themeContext(): React.ContextType<typeof SurveyThemeContext> {
    return this.context as React.ContextType<typeof SurveyThemeContext>;
  }

  /**
   * Deferred to M1's LocalizableString renderer (task 1.3) — this is the
   * abstract seam every later component port calls through, per the
   * design's port map. Returns the fallback plain-text rendering until
   * then.
   */
  public static renderLocString(
    locStr: LocalizableString,
    style?: unknown,
    key?: string
  ): React.JSX.Element {
    return (
      <Text style={style as never} key={key}>
        {locStr.renderedHtml}
      </Text>
    );
  }

  private changedStatePropNameValue: string | undefined;

  /**
   * D1: committed subscription registry, mutated ONLY from commit-phase
   * lifecycles (never from `shouldComponentUpdate`, which upstream uses
   * and which React 19 may invoke speculatively/discard without a commit).
   */
  private subscribedElements: Base[] = [];

  /**
   * D2: stack of per-render-pass snapshots of the rendered-element list.
   * `render()` pushes the frozen copy it incremented and pops it in
   * `finally`; while THIS instance is rendering, `isRendering` consults
   * the top snapshot (membership may have been mutated mid-render — the
   * captured list is the one whose counters were raised). Outside a
   * render pass it falls back to current membership, which is how one
   * observer sees another observer's in-progress render on a shared model.
   */
  private activeRenderSnapshots: Base[][] = [];

  /**
   * True from `componentDidMount` until the next `render()` — D4's mount
   * reconcile bump guarantees that render immediately follows the mount
   * commit, so this flag's lifetime is exactly the mount-commit window
   * (every sibling's componentDidMount in the same commit runs before
   * React flushes the bump). Powers the dev-only invariant warning below.
   */
  private inMountCommit = false;

  constructor(props: P) {
    super(props);
    this.state = {} as S;
  }

  componentDidMount(): void {
    this.inMountCommit = true;
    const elements = dedupe(this.getStateElements());
    this.subscribeElements(elements);
    this.subscribedElements = elements;
    // D4: close the render-to-commit gap — a mutation between this
    // component's render and this subscribe would otherwise be missed.
    this.bumpRevision();
  }

  componentDidUpdate(): void {
    const nextElements = dedupe(this.getStateElements());
    const previousElements = this.subscribedElements;
    const added = nextElements.filter((el) => !previousElements.includes(el));
    const removed = previousElements.filter((el) => !nextElements.includes(el));

    this.unsubscribeElements(removed);
    this.subscribeElements(added);
    this.subscribedElements = nextElements;

    if (added.length > 0) {
      // D4 (swap case): newly-added elements get the same mount reconcile
      // — a pre-subscribe mutation on the just-retargeted model must not
      // be missed either.
      this.bumpRevision();
    }
  }

  componentWillUnmount(): void {
    this.unsubscribeElements(this.subscribedElements);
    this.subscribedElements = [];
  }

  /**
   * D1: plain — no upstream freeze/thaw (D3 omits `allowComponentUpdate`/
   * `denyComponentUpdate`; zero call sites upstream). No side effects here;
   * subscription work happens exclusively in the commit-phase lifecycles
   * above.
   */
  shouldComponentUpdate(): boolean {
    return true;
  }

  render(): React.JSX.Element | null {
    // The mount-commit window ends when React flushes the D4 bump into
    // this very render (see inMountCommit).
    this.inMountCommit = false;

    if (!this.canRender()) {
      return null;
    }

    // D2: SNAPSHOT the rendered-element list (Array.from — never an alias
    // of getRenderedElements()'s return, whose membership renderElement()
    // could mutate in place); a throw/suspend or membership mutation
    // inside renderElement() must not strand the shared, model-scoped
    // guard — the finally decrements exactly the elements that were
    // incremented.
    const renderedElements = Array.from(this.getRenderedElements());
    this.activeRenderSnapshots.push(renderedElements);
    this.startRendering(renderedElements);
    let result: React.JSX.Element | null;
    try {
      result = this.renderElement();
    } finally {
      this.endRendering(renderedElements);
      this.activeRenderSnapshots.pop();
    }

    if (result) {
      result = this.wrapElement(result);
    }
    this.changedStatePropNameValue = undefined;
    return result;
  }

  protected wrapElement(element: React.JSX.Element): React.JSX.Element {
    return element;
  }

  protected get isRendering(): boolean {
    // While this instance renders, consult the ACTIVE snapshot (its
    // counters are the raised ones even if membership mutated mid-render);
    // otherwise, current membership against the shared model counters —
    // that is how cross-observer suppression on a shared model works.
    const snapshot =
      this.activeRenderSnapshots[this.activeRenderSnapshots.length - 1];
    const elements = snapshot ?? this.getRenderedElements();
    return elements.some(
      (el) => ((el as RenderGuardHost).reactRendering ?? 0) > 0
    );
  }

  protected getRenderedElements(): Base[] {
    return this.getStateElements();
  }

  private startRendering(elements: Base[]): void {
    elements.forEach((el) => {
      const host = el as RenderGuardHost;
      host.reactRendering = (host.reactRendering ?? 0) + 1;
    });
  }

  private endRendering(elements: Base[]): void {
    elements.forEach((el) => {
      const host = el as RenderGuardHost;
      host.reactRendering = (host.reactRendering ?? 0) - 1;
    });
  }

  protected canRender(): boolean {
    return true;
  }

  protected renderElement(): React.JSX.Element | null {
    return null;
  }

  protected get changedStatePropName(): string | undefined {
    return this.changedStatePropNameValue;
  }

  protected getStateElements(): Base[] {
    const element = this.getStateElement();
    return element ? [element] : [];
  }

  protected getStateElement(): Base | null {
    return null;
  }

  protected get isDisplayMode(): boolean {
    const props = this.props as { isDisplayMode?: boolean };
    return props.isDisplayMode ?? false;
  }

  protected renderLocString(
    locStr: LocalizableString,
    style?: unknown,
    key?: string
  ): React.JSX.Element {
    return SurveyElementBase.renderLocString(locStr, style, key);
  }

  protected canUsePropInState(_key: string): boolean {
    return true;
  }

  private canMakeReact(stateElement: Base): boolean {
    return (
      !!stateElement &&
      typeof (stateElement as SubscribableElement)
        .addOnPropertyValueChangedCallback === 'function'
    );
  }

  private propertyValueChangedHandler = (
    _stateElement: Base,
    options: IPropertyValueChangedEvent
  ): void => {
    const key = options.name;
    if (isDevMode() && this.inMountCommit) {
      // Renderer-internal invariant (design doc, "render→commit gap"):
      // renderer components never mutate the model from render/mount
      // lifecycles — D4 covers app code doing this; the warning keeps our
      // own house clean.
      console.warn(
        `[react-native-survey-library] Model property "${key}" changed during a mount commit. ` +
          'Renderer components must not mutate the model from render/mount lifecycles ' +
          '(design 0.4-reactive-base, render-to-commit gap invariant).'
      );
    }
    if (!this.canUsePropInState(key) || this.isRendering) return;
    this.changedStatePropNameValue = key;
    this.bumpRevision();
  };

  private onArrayChangedCallback = (
    _stateElement: Base,
    options: IPropertyArrayValueChangedEvent
  ): void => {
    // Upstream-absent prop filter, deliberately: the array path is not
    // gated by canUsePropInState (design doc "The correct survey-core
    // API" table; kept as-is).
    if (this.isRendering) return;
    this.changedStatePropNameValue = options.name;
    this.bumpRevision();
  };

  /**
   * Functional setState updater — required, not stylistic: an object-form
   * update computed from `this.state` at call time would lose increments
   * when multiple notifications land in the same batch (design doc "State
   * shape"). The `?? 0` fallback survives a subclass state initializer
   * that omitted the field.
   */
  private bumpRevision(): void {
    this.setState(
      (state) => ({ __svRev: (state.__svRev ?? 0) + 1 }) as unknown as S
    );
  }

  private subscribeElements(elements: Base[]): void {
    elements.forEach((el) => this.subscribeElement(el));
  }

  private subscribeElement(stateElement: Base): void {
    if (!this.canMakeReact(stateElement)) return;
    const el = stateElement as Required<SubscribableElement>;
    el.addOnArrayChangedCallback(this.onArrayChangedCallback);
    el.addOnPropertyValueChangedCallback(this.propertyValueChangedHandler);
  }

  private unsubscribeElements(elements: Base[]): void {
    elements.forEach((el) => this.unsubscribeElement(el));
  }

  private unsubscribeElement(stateElement: Base): void {
    if (!this.canMakeReact(stateElement)) return;
    const el = stateElement as Required<SubscribableElement>;
    el.removeOnPropertyValueChangedCallback(this.propertyValueChangedHandler);
    el.removeOnArrayChangedCallback(this.onArrayChangedCallback);
  }
}

function dedupe(elements: Base[]): Base[] {
  return Array.from(new Set(elements));
}
