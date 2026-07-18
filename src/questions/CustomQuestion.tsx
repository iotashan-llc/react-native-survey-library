/**
 * `custom` question adapter (task 2.11) — a ComponentCollection runtime type
 * with a `questionJSON`/`createQuestion` (single wrapped question). Dispatch
 * key is `getTemplate()` = `"custom"` (NOT the registered `getType()` name).
 *
 * Renders the LIVE `question.contentQuestion` (built by the model ctor) as an
 * INPUT-ONLY body through the normal RN question dispatcher — the OUTER custom
 * question's row wrapper (`SurveyRowElement` → `QuestionChrome`) already renders
 * title/description/errors, exactly as web does `createQuestionElement(
 * contentQuestion)`. Value proxies through the outer model (scalar); the
 * renderer never re-parses `questionJSON` or re-wires the inner to the survey.
 * Plan: docs/design/2.11-custom-composite-plan.md.
 *
 * Reactivity: subscribe the OUTER question only — the dispatched inner component
 * subscribes `contentQuestion` through its own QuestionElementBase lineage
 * (2.11 review). A malformed custom (a `createQuestion` callback returning null)
 * leaves `contentQuestion` null → a distinct fallback + diagnostic, never a
 * crash.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { Base, Question } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { RNQuestionFactory } from '../factories/QuestionFactory';
import { resolveQuestionDispatchKey } from '../factories/dispatch-key';
import { createUnsupportedQuestion } from '../components/UnsupportedQuestion';
import { reportDiagnostic } from '../diagnostics';

interface CustomModelLike {
  name: string;
  contentQuestion: Question | null;
  getType(): string;
}

export class CustomQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get custom(): CustomModelLike {
    return this.questionBase as unknown as CustomModelLike;
  }

  /** Malformed-content diagnostic — staged in render, flushed+deduped in the
   * commit phase (never emitted from render). */
  private pendingMissing = false;
  private reportedMissing = false;

  componentDidMount(): void {
    super.componentDidMount();
    this.flushMissingDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushMissingDiagnostic();
  }

  private flushMissingDiagnostic(): void {
    if (!this.pendingMissing || this.reportedMissing) return;
    this.reportedMissing = true;
    reportDiagnostic({
      code: 'custom-content-missing',
      questionName: this.custom.name,
      questionType: this.custom.getType(),
    });
  }

  protected renderElement(): React.JSX.Element {
    const inner = this.custom.contentQuestion;
    this.pendingMissing = false;
    if (!inner) {
      // A `createQuestion` callback returned null — render nothing renderable
      // but keep the survey alive (invariant 9). NOT createUnsupportedQuestion,
      // which requires a concrete inner Question (2.11 review).
      this.pendingMissing = true;
      return <View testID="custom-question-malformed" />;
    }
    const dispatchKey = resolveQuestionDispatchKey(
      inner as unknown as Parameters<typeof resolveQuestionDispatchKey>[0]
    );
    const questionProps = { question: inner, creator: this.creator };
    const body =
      RNQuestionFactory.createQuestion(dispatchKey, questionProps) ??
      createUnsupportedQuestion(questionProps, { dispatchKey });
    return <View testID={`custom-question-${this.custom.name}`}>{body}</View>;
  }
}
