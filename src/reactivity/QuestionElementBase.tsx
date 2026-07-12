/**
 * RN analog of survey-react-ui's `SurveyQuestionElementBase`
 * (reactquestion_element.tsx:193-281) — design: docs/design/0.4-reactive-base.md,
 * port map.
 *
 * Carried over as-is: `getRenderedElements()` => `[questionBase]` (without
 * it the question would sit outside the shared D2 render guard whenever a
 * subclass's `getStateElement()` differs from/is absent — see the base
 * class's own render-guard tests), `questionBase`/`creator` getters,
 * `canRender()` requiring both, `isDisplayMode` falling back to
 * `isInputReadOnly`.
 *
 * NOT ported: `control`/`content: HTMLElement` refs + `data-rendered`
 * attribute idempotence, `afterRenderQuestionElement`/
 * `beforeDestroyQuestionElement` calls into core (banned; see design doc's
 * "afterRender-family ban" — only `onAfterRenderQuestionInput` is lost by
 * skipping it, and that gets an RN parity contract in M1), the
 * `customWidget` shouldComponentUpdate branches (D3), `wrapCell`/
 * `ReactSurveyElementsWrapper` (deferred to the M1 wrapper-seam task).
 *
 * NEW for RN: the DOM `data-rendered` idempotence check is replaced by a
 * mounted hook keyed to the (question, native ref) PAIR — it re-fires
 * whenever either half of the pair changes, and hooks receive the
 * CAPTURED pair as arguments (a no-arg hook reading current props could
 * not clean up the OLD model after a retarget). A nullish native ref
 * means NO mounted pair: `onQuestionMounted` only ever fires with a
 * concrete ref, and a detach cleans the previous pair without a
 * mount(nullish).
 *
 * ALSO NEW for RN (design: docs/design/0.5-factories.md, "Upstream shape"):
 * the commit phase checks `question.customWidget` ONCE per question — a
 * module-scoped attempted-check `WeakSet<Question>` is recorded BEFORE the
 * read, so even a throw never re-runs discovery — and reports a
 * `custom-widget-ignored` diagnostic if a widget matched. DOM custom
 * widgets are won't-support in RN — the widget is never honored, the
 * question renders via its normal dispatch key regardless — this is
 * diagnostic-only, never a render-affecting branch (unlike upstream's
 * customWidget shouldComponentUpdate carve-out, which stays unported per
 * 0.4 D3). Reading `customWidget` triggers core's widget-discovery scan,
 * which runs CONSUMER callbacks (`widgetIsLoaded`/`isFit` — survey-core
 * question.ts:1274-1282, questionCustomWidgets.ts:33-35); the read is
 * wrapped in try/catch so a throwing consumer callback is contained
 * (logged once) and can never break a supported question's commit.
 */
import type { Base, Question } from '../core/facade';
import { reportCustomWidgetIgnoredOnce } from '../diagnostics';
import { SurveyElementBase } from './SurveyElementBase';
import type { SurveyElementBaseState } from './SurveyElementBase';

/**
 * Questions whose customWidget discovery has already been ATTEMPTED (not
 * necessarily succeeded) — recorded before the read so a throwing consumer
 * callback is still only attempted once per question.
 */
const customWidgetCheckAttempted = new WeakSet<Question>();

export interface QuestionElementBaseProps {
  question: Question;
  creator?: unknown;
  isDisplayMode?: boolean;
}

type MountedPair = readonly [Question, unknown];

export class QuestionElementBase<
  P extends QuestionElementBaseProps = QuestionElementBaseProps,
  S extends SurveyElementBaseState = SurveyElementBaseState,
> extends SurveyElementBase<P, S> {
  private nativeElementValue: unknown;
  private mountedPair: MountedPair | undefined;

  /**
   * Sets the RN analog of upstream's `control`/`content` DOM refs. A
   * subclass calls this (typically from a native `ref` callback) before
   * the mounted-hook reconcile runs each commit.
   */
  public setNativeElement(ref: unknown): void {
    this.nativeElementValue = ref;
  }

  protected get questionBase(): Question {
    return this.props.question;
  }

  protected get creator(): unknown {
    return this.props.creator;
  }

  protected canRender(): boolean {
    return !!this.questionBase && !!this.creator;
  }

  protected getRenderedElements(): Base[] {
    return [this.questionBase];
  }

  protected get isDisplayMode(): boolean {
    const props = this.props as QuestionElementBaseProps;
    return (
      props.isDisplayMode ||
      (!!this.questionBase && this.questionBase.isInputReadOnly) ||
      false
    );
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.checkCustomWidgetIgnored();
    this.reconcileMountedHook();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.checkCustomWidgetIgnored();
    this.reconcileMountedHook();
  }

  componentWillUnmount(): void {
    super.componentWillUnmount();
    this.cleanupMountedHook();
  }

  protected onQuestionMounted(
    _question: Question,
    _nativeElement: unknown
  ): void {}
  protected onQuestionWillUnmount(
    _question: Question,
    _nativeElement: unknown
  ): void {}

  private reconcileMountedHook(): void {
    const question = this.questionBase;
    const ref = this.nativeElementValue;
    const previous = this.mountedPair;
    // A nullish native ref means there is NO mounted pair: nothing to
    // mount (onQuestionMounted only ever fires with a concrete ref), and a
    // detach (ref -> nullish) cleans the previous pair without a spurious
    // mount.
    const next: MountedPair | undefined =
      ref === null || ref === undefined
        ? undefined
        : ([question, ref] as const);
    if (previous === undefined && next === undefined) {
      return;
    }
    if (
      previous &&
      next &&
      previous[0] === next[0] &&
      previous[1] === next[1]
    ) {
      return;
    }
    if (previous) {
      this.onQuestionWillUnmount(previous[0], previous[1]);
    }
    this.mountedPair = next;
    if (next) {
      this.onQuestionMounted(next[0], next[1]);
    }
  }

  private cleanupMountedHook(): void {
    if (this.mountedPair) {
      this.onQuestionWillUnmount(this.mountedPair[0], this.mountedPair[1]);
      this.mountedPair = undefined;
    }
  }

  private checkCustomWidgetIgnored(): void {
    const question = this.questionBase;
    if (!question) return;
    if (customWidgetCheckAttempted.has(question)) return;
    customWidgetCheckAttempted.add(question);
    let widget: Question['customWidget'];
    try {
      widget = question.customWidget;
    } catch (error) {
      // Contained: the getter runs consumer widgetIsLoaded/isFit callbacks
      // — a throw there must never break a supported question's commit.
      console.error(
        '[react-native-survey-library] customWidget discovery threw; continuing without the diagnostic',
        error
      );
      return;
    }
    if (!widget) return;
    reportCustomWidgetIgnoredOnce(question, {
      code: 'custom-widget-ignored',
      questionType: question.getType(),
      name: question.name,
      widgetName: widget.name,
    });
  }
}
