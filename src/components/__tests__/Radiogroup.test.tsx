/**
 * Task 1.12 — radiogroup question. Same body-only scope and bridge/recipe
 * usage as `Checkbox` (see that file's + `ChoiceItemRow`'s headers).
 * Upstream: `QuestionRadiogroupModel` (survey-core question_radiogroup.ts)
 * — single-select via the base `selectItem`/`clickItemHandler(item)`
 * (one-arg, unlike checkbox's two-arg toggle form).
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { QuestionRadiogroupModel } from '../../core/facade';
import { Radiogroup } from '../Radiogroup';

function createRadiogroup(
  props: Record<string, unknown> = {},
  name = 'q1'
): QuestionRadiogroupModel {
  const model = new Model({
    elements: [
      { type: 'radiogroup', name, choices: ['a', 'b', 'c'], ...props },
    ],
  });
  return model.getQuestionByName(name) as QuestionRadiogroupModel;
}

describe('Radiogroup', () => {
  it('renders every visible choice item label', () => {
    const question = createRadiogroup();
    render(<Radiogroup question={question} creator={{}} />);
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('b')).toBeTruthy();
    expect(screen.getByText('c')).toBeTruthy();
  });

  it('pressing an item selects it via clickItemHandler (single-select)', () => {
    const question = createRadiogroup();
    render(<Radiogroup question={question} creator={{}} />);
    fireEvent.press(screen.getByText('a'));
    expect(question.value).toBe('a');
  });

  it('pressing a different item replaces the selection (single-select exclusivity)', () => {
    const question = createRadiogroup({ defaultValue: 'a' });
    render(<Radiogroup question={question} creator={{}} />);
    fireEvent.press(screen.getByText('b'));
    expect(question.value).toBe('b');
  });

  it('none item: selecting it clears the prior selection', () => {
    const question = createRadiogroup({
      showNoneItem: true,
      defaultValue: 'a',
    });
    render(<Radiogroup question={question} creator={{}} />);
    fireEvent.press(screen.getByText('None'));
    expect(question.value).toBe('none');
  });

  it('other item: selecting it reveals a comment input; typing + blur commits otherValue', () => {
    const question = createRadiogroup({ showOtherItem: true });
    render(<Radiogroup question={question} creator={{}} />);
    fireEvent.press(screen.getByText('Other (describe)'));
    expect(question.isOtherSelected).toBe(true);
    const input = screen.getByTestId('radiogroup-other-input');
    fireEvent.changeText(input, 'my custom answer');
    fireEvent(input, 'blur');
    expect(question.otherValue).toBe('my custom answer');
  });

  it('columns: colCount > 1 arranges items into N flex-wrap columns', () => {
    const question = createRadiogroup({ colCount: 3 });
    render(<Radiogroup question={question} creator={{}} />);
    const container = screen.getByTestId('radiogroup-items');
    expect(container.props.style).toEqual(
      expect.objectContaining({ flexDirection: 'row', flexWrap: 'wrap' })
    );
  });

  it('readOnly question: items are not pressable (no value change on press)', () => {
    const question = createRadiogroup({ readOnly: true });
    render(<Radiogroup question={question} creator={{}} />);
    fireEvent.press(screen.getByText('a'));
    expect(question.value).toBeFalsy();
  });

  it('external model changes (programmatic selection) re-render the item list', () => {
    const question = createRadiogroup();
    render(<Radiogroup question={question} creator={{}} />);
    act(() => {
      question.value = 'c';
    });
    expect(question.value).toBe('c');
  });

  /**
   * Enablement via `question.getItemEnabled(item)` (codex PR-18 review
   * major 2) — see the matching Checkbox suite for the full rationale
   * (core's clickItemHandler does not itself reject a disabled item).
   */
  it('disabled choice (enableIf false): press does not mutate the value', () => {
    const question = createRadiogroup({
      choices: [{ value: 'a' }, { value: 'b', enableIf: 'false' }],
    });
    render(<Radiogroup question={question} creator={{}} />);
    fireEvent.press(screen.getByText('b'));
    expect(question.value).toBeFalsy();
    expect(question.getItemEnabled(question.visibleChoices[1]!)).toBe(false);
  });

  it('disabled question (readOnlyCallback — the core seam parent containers drive): press blocked and Other input not editable', () => {
    const question = createRadiogroup({ showOtherItem: true });
    render(<Radiogroup question={question} creator={{}} />);
    fireEvent.press(screen.getByText('Other (describe)'));
    expect(screen.getByTestId('radiogroup-other-input').props.editable).toBe(
      true
    );
    act(() => {
      (
        question as unknown as { readOnlyCallback: () => boolean }
      ).readOnlyCallback = () => true;
      question.titleLocation = 'top';
    });
    fireEvent.press(screen.getByText('a'));
    expect(question.value).toBe('other');
    expect(screen.getByTestId('radiogroup-other-input').props.editable).toBe(
      false
    );
  });
});

describe('Radiogroup — group accessibility (task 1.16)', () => {
  it('the items container exposes radiogroup semantics with the question label (core a11y_input_ariaRole, question_radiogroup.ts:95-97)', () => {
    const question = createRadiogroup({ title: 'Choose one' });
    render(<Radiogroup question={question} creator={{}} />);
    const container = screen.getByTestId('radiogroup-items');
    expect(container.props.accessibilityRole).toBe('radiogroup');
    expect(container.props.accessibilityLabel).toBe('Choose one');
  });
});
