/**
 * `ExpressionQuestion` — task 1.15. Expression questions are read-only
 * computed displays (`QuestionExpressionModel.hasInput === false`): core
 * recalculates `value`/`formatedValue` from the `expression` property
 * whenever a referenced dependency's value changes
 * (survey-core question_expression.ts). This component just renders the
 * live `formatedValue`, no input.
 *
 * Upstream's `SurveyQuestionExpression` (reactquestion_expression.tsx)
 * does NOT override `getStateElement()` — it relies on the generic
 * `SurveyQuestion` wrapper (reactquestion.tsx) subscribing to the
 * question and re-rendering it as a child. This library has no such
 * generic per-question wrapper yet (M1 composition tasks land later), so
 * this component subscribes directly (mirrors upstream's boolean.tsx
 * pattern) — required for recalculation to actually re-render here.
 */
import { act, render, screen } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { Question, QuestionExpressionModel } from '../../core/facade';
import { ExpressionQuestion } from '../ExpressionQuestion';

function createExpressionQuestion(
  name: string,
  expression: string
): { model: Model; question: Question } {
  const model = new Model({
    elements: [{ type: 'expression', name, expression }],
  });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return { model, question };
}

describe('ExpressionQuestion', () => {
  it('renders the computed formatedValue for a real expression question', () => {
    const { question } = createExpressionQuestion('q1', '1 + 2');
    render(<ExpressionQuestion question={question} creator={{}} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('recalculates and re-renders when a referenced dependency question changes (real Model, cross-question expression)', () => {
    const model = new Model({
      elements: [
        { type: 'text', name: 'a' },
        { type: 'expression', name: 'b', expression: '{a} + 1' },
      ],
    });
    const question = model.getQuestionByName('b') as Question;
    render(<ExpressionQuestion question={question} creator={{}} />);
    expect(screen.queryByText('6')).toBeNull();

    act(() => {
      model.setValue('a', 5);
    });
    expect(screen.getByText('6')).toBeTruthy();

    act(() => {
      model.setValue('a', 10);
    });
    expect(screen.getByText('11')).toBeTruthy();
  });

  it('currency displayStyle: renders the formatted value and re-renders when currency/format mutate (real Model)', () => {
    // QuestionExpressionModel.onPropertyValueChanged routes
    // format/currency/displayStyle writes through updateFormatedValue()
    // (question_expression.ts, v2.5.33) — the rendered text must follow.
    const model = new Model({
      elements: [
        { type: 'text', name: 'price' },
        {
          type: 'expression',
          name: 'total',
          expression: '{price} * 2',
          displayStyle: 'currency',
        },
      ],
    });
    const question = model.getQuestionByName(
      'total'
    ) as QuestionExpressionModel;
    render(<ExpressionQuestion question={question} creator={{}} />);

    act(() => {
      model.setValue('price', 5);
    });
    expect(screen.getByText('$10.00')).toBeTruthy();

    act(() => {
      question.currency = 'EUR';
    });
    expect(screen.queryByText('$10.00')).toBeNull();
    expect(screen.getByText('€10.00')).toBeTruthy();

    act(() => {
      question.format = 'Total: {0}';
    });
    expect(screen.getByText('Total: €10.00')).toBeTruthy();
  });

  it('does not render at all when canRender() is false (no creator)', () => {
    const { question } = createExpressionQuestion('q2', '1 + 1');
    const { toJSON } = render(
      <ExpressionQuestion question={question} creator={undefined} />
    );
    expect(toJSON()).toBeNull();
  });
});
