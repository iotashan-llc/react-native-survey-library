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

  constructor(props: P) {
    super(props);
    this.state = {} as S;
  }

  componentDidMount(): void {
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
    if (!this.canRender()) {
      return null;
    }

    // D2: capture the rendered-element list ONCE; a throw/suspend inside
    // renderElement() must not strand the shared, model-scoped guard.
    const renderedElements = this.getRenderedElements();
    this.startRendering(renderedElements);
    let result: React.JSX.Element | null;
    try {
      result = this.renderElement();
    } finally {
      this.endRendering(renderedElements);
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
    return this.getRenderedElements().some(
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
