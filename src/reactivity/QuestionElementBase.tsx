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
 * not clean up the OLD model after a retarget).
 */
import type { Base, Question } from '../core/facade';
import { SurveyElementBase } from './SurveyElementBase';
import type { SurveyElementBaseState } from './SurveyElementBase';

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
    this.reconcileMountedHook();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
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
    if (previous && previous[0] === question && previous[1] === ref) {
      return;
    }
    if (previous) {
      this.onQuestionWillUnmount(previous[0], previous[1]);
    }
    this.mountedPair = [question, ref] as const;
    this.onQuestionMounted(question, ref);
  }

  private cleanupMountedHook(): void {
    if (this.mountedPair) {
      this.onQuestionWillUnmount(this.mountedPair[0], this.mountedPair[1]);
      this.mountedPair = undefined;
    }
  }
}
