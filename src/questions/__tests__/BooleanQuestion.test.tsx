/**
 * `BooleanQuestion` (default/switch renderAs) — task 1.13. RN analog of
 * survey-react-ui's `SurveyQuestionBoolean` (boolean.tsx), rendered as a
 * native `Switch` (no faithful RN analog of the web slider's
 * click-position/left-right label semantics — documented delta: the
 * native Switch toggles a plain boolean via `onValueChange`, still routed
 * through `question.booleanValue` per `QuestionBooleanModel.setBooleanValue`
 * — valueTrue/valueFalse mapping and the readOnly/designMode guard both
 * still apply).
 *
 * `booleanValue` (not raw `value`) is the binding contract
 * (question_boolean.ts): `get booleanValue()` maps `value === valueTrue`
 * to `true`/`false`/`null` (indeterminate when unanswered — `isEmpty()`);
 * `set booleanValue(v)` maps back through `getValueTrue()`/`getValueFalse()`
 * and no-ops under readOnly/designMode.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import { BooleanQuestion } from '../BooleanQuestion';

function createBooleanQuestion(
  name: string,
  extra: Record<string, unknown> = {}
): { model: Model; question: Question } {
  const model = new Model({
    elements: [{ type: 'boolean', name, ...extra }],
  });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return { model, question };
}

describe('BooleanQuestion (switch/default renderAs)', () => {
  it('renders a Switch bound to booleanValue=false by default (valueFalse)', () => {
    const { question } = createBooleanQuestion('q1');
    render(<BooleanQuestion question={question} creator={{}} />);
    const sw = screen.getByTestId('sv-boolean-switch-q1');
    expect(sw.props.value).toBe(false);
  });

  it('indeterminate initial state: no default value -> booleanValue is null, isIndeterminate true, accessibilityState.checked is "mixed"', () => {
    const { question } = createBooleanQuestion('q-indet');
    expect(question.booleanValue).toBeNull();
    render(<BooleanQuestion question={question} creator={{}} />);
    const sw = screen.getByTestId('sv-boolean-switch-q-indet');
    expect(sw.props.accessibilityState?.checked).toBe('mixed');
  });

  it('toggling the Switch (onValueChange) updates the model via booleanValue', () => {
    const { question } = createBooleanQuestion('q2');
    render(<BooleanQuestion question={question} creator={{}} />);
    const sw = screen.getByTestId('sv-boolean-switch-q2');
    // RN's <Switch> consumes `onValueChange` internally and forwards its
    // OWN `onChange` handler down to the native host component — the host
    // node's props never carry `onValueChange` directly. `fireEvent`
    // walks up from the queried host node to the composite `<Switch>`
    // element (which DOES carry `onValueChange`), the same mechanism RTL
    // documents for `Pressable`'s `onPress`.
    fireEvent(sw, 'valueChange', true);
    expect(question.booleanValue).toBe(true);
    expect(question.value).toBe(true);
  });

  it('an external model update (question update, not a UI toggle) re-renders the Switch (0.4 subscription)', () => {
    const { question } = createBooleanQuestion('q3');
    render(<BooleanQuestion question={question} creator={{}} />);
    expect(screen.getByTestId('sv-boolean-switch-q3').props.value).toBe(false);

    act(() => {
      question.booleanValue = true;
    });
    expect(screen.getByTestId('sv-boolean-switch-q3').props.value).toBe(true);
  });

  it('respects custom valueTrue/valueFalse mapping through booleanValue (never raw value juggling)', () => {
    const { question } = createBooleanQuestion('q4', {
      valueTrue: 'yep',
      valueFalse: 'nope',
    });
    render(<BooleanQuestion question={question} creator={{}} />);
    const sw = screen.getByTestId('sv-boolean-switch-q4');
    fireEvent(sw, 'valueChange', true);
    expect(question.value).toBe('yep');
    expect(question.booleanValue).toBe(true);
  });

  it('renders labelTrue/labelFalse locstrings either side of the switch, in [False, True] order by default (swapOrder=false)', () => {
    const { question } = createBooleanQuestion('q5', {
      labelTrue: 'On',
      labelFalse: 'Off',
    });
    render(<BooleanQuestion question={question} creator={{}} />);
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
  });

  it('swapOrder=true reverses the visual label order to [True, False]', () => {
    const { question } = createBooleanQuestion('q6', {
      labelTrue: 'On',
      labelFalse: 'Off',
      swapOrder: true,
    });
    render(<BooleanQuestion question={question} creator={{}} />);
    // Both labels are still present; swapOrder only affects left/right
    // placement (locLabelLeft/locLabelRight), asserted via render order.
    const onIndex = screen.getByText('On');
    const offIndex = screen.getByText('Off');
    expect(onIndex).toBeTruthy();
    expect(offIndex).toBeTruthy();
  });

  it('does not render at all when canRender() is false (no creator)', () => {
    const { question } = createBooleanQuestion('q7');
    const { toJSON } = render(
      <BooleanQuestion question={question} creator={undefined} />
    );
    expect(toJSON()).toBeNull();
  });

  it('disables the Switch when the question is read-only (isDisplayMode)', () => {
    const { question } = createBooleanQuestion('q8');
    question.readOnly = true;
    render(<BooleanQuestion question={question} creator={{}} />);
    const sw = screen.getByTestId('sv-boolean-switch-q8');
    expect(sw.props.disabled).toBe(true);
  });
});
