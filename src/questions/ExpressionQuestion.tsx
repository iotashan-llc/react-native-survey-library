/**
 * `expression` question type (task 1.15, design:
 * docs/IMPLEMENTATION-PLAN.md row 1.15). RN analog of survey-react-ui's
 * `SurveyQuestionExpression` (reactquestion_expression.tsx) — a read-only
 * computed display: `QuestionExpressionModel.hasInput === false`
 * (question_expression.ts), core recalculates `value` (and the derived
 * `formatedValue`) from the `expression` property whenever a referenced
 * dependency's value changes (survey-core's condition-runner). This
 * component renders the live `formatedValue`, never an input.
 *
 * Deviation from upstream, documented: `SurveyQuestionExpression` does
 * NOT override `getStateElement()` — it relies on the generic
 * `SurveyQuestion` wrapper (reactquestion.tsx, :45) subscribing to the
 * question and re-rendering this component as its child on ANY property
 * change (including the `formatedValue` write `updateFormatedValue()`
 * performs). This library has no such generic per-question dispatch
 * wrapper yet (page/row/panel composition is a later M1 task) — so this
 * component subscribes directly, mirroring `BooleanQuestion`'s explicit
 * `getStateElement()` override. Without it, `formatedValue` would
 * recalculate on the model but the rendered text would go stale.
 */
import * as React from 'react';
import { Text } from 'react-native';
import type { Base } from '../core/facade';
import { QuestionExpressionModel } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';

export class ExpressionQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get expressionQuestion(): QuestionExpressionModel {
    return this.questionBase as QuestionExpressionModel;
  }

  protected renderElement(): React.JSX.Element {
    const question = this.expressionQuestion;
    return (
      <Text
        testID={`sv-expression-${question.name}`}
        accessibilityLiveRegion="polite"
      >
        {question.formatedValue}
      </Text>
    );
  }
}
