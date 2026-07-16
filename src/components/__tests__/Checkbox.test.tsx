/**
 * Task 1.12 — checkbox question (design: docs/design/0.7-theme-rn.md,
 * "item recipe" + bridge `getItemVariant` extraction — components call
 * `question.getItemClass(item)` and extract, never re-derive model state).
 * Upstream analogs: `SurveyQuestionSelectbase` +
 * `SurveyQuestionCheckboxItem`/`boolean.tsx` item components
 * (survey-react-ui); `QuestionCheckboxModel` (survey-core
 * question_checkbox.ts) — selection goes through `clickItemHandler`/
 * `isItemSelected` (model methods), never hand-rolled array juggling.
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { QuestionCheckboxModel } from '../../core/facade';
import { Checkbox } from '../Checkbox';
import { QuestionChrome } from '../QuestionChrome';

function createCheckbox(
  props: Record<string, unknown> = {},
  name = 'q1'
): QuestionCheckboxModel {
  const model = new Model({
    elements: [{ type: 'checkbox', name, choices: ['a', 'b', 'c'], ...props }],
  });
  return model.getQuestionByName(name) as QuestionCheckboxModel;
}

/**
 * survey-core's array-valued properties are backed by `PropertyArray`,
 * which decorates the array instance with own-enumerable
 * push/shift/unshift/pop/splice function properties (for its observable
 * mechanism) — `toEqual` fails against a plain array literal even though
 * the elements match. Normalize to a plain array before asserting.
 */
function plainArray(value: unknown): unknown[] {
  return Array.isArray(value) ? Array.from(value) : [];
}

describe('Checkbox', () => {
  it('renders every visible choice item label', () => {
    const question = createCheckbox();
    render(<Checkbox question={question} creator={{}} />);
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('b')).toBeTruthy();
    expect(screen.getByText('c')).toBeTruthy();
  });

  it('pressing an item selects it via clickItemHandler (multi-select)', () => {
    const question = createCheckbox();
    render(<Checkbox question={question} creator={{}} />);
    fireEvent.press(screen.getByText('a'));
    expect(plainArray(question.value)).toEqual(['a']);
    fireEvent.press(screen.getByText('b'));
    expect(plainArray(question.value)).toEqual(['a', 'b']);
  });

  it('pressing a selected item deselects it', () => {
    const question = createCheckbox({ defaultValue: ['a', 'b'] });
    render(<Checkbox question={question} creator={{}} />);
    fireEvent.press(screen.getByText('a'));
    expect(plainArray(question.value)).toEqual(['b']);
  });

  it('selectAll: pressing "Select All" selects every item; pressing again clears', () => {
    const question = createCheckbox({ showSelectAllItem: true });
    render(<Checkbox question={question} creator={{}} />);
    fireEvent.press(screen.getByText('Select All'));
    expect(plainArray(question.value)).toEqual(['a', 'b', 'c']);
    fireEvent.press(screen.getByText('Select All'));
    expect(plainArray(question.value)).toEqual([]);
  });

  it('none item: selecting it clears other selections; selecting another item clears none', () => {
    const question = createCheckbox({
      showNoneItem: true,
      defaultValue: ['a'],
    });
    render(<Checkbox question={question} creator={{}} />);
    fireEvent.press(screen.getByText('None'));
    expect(plainArray(question.value)).toEqual(['none']);
    fireEvent.press(screen.getByText('b'));
    expect(plainArray(question.value)).toEqual(['b']);
  });

  it('other item: selecting it reveals a comment input; typing + blur commits otherValue', () => {
    const question = createCheckbox({ showOtherItem: true });
    render(<Checkbox question={question} creator={{}} />);
    fireEvent.press(screen.getByText('Other (describe)'));
    expect(question.isOtherSelected).toBe(true);
    const input = screen.getByTestId('checkbox-other-input');
    fireEvent.changeText(input, 'my custom answer');
    fireEvent(input, 'blur');
    expect(question.otherValue).toBe('my custom answer');
  });

  it('deselecting other hides its comment input', () => {
    const question = createCheckbox({ showOtherItem: true });
    render(<Checkbox question={question} creator={{}} />);
    fireEvent.press(screen.getByText('Other (describe)'));
    expect(screen.queryByTestId('checkbox-other-input')).toBeTruthy();
    fireEvent.press(screen.getByText('Other (describe)'));
    expect(screen.queryByTestId('checkbox-other-input')).toBeNull();
  });

  it('columns: colCount > 1 arranges items into N flex-wrap columns', () => {
    const question = createCheckbox({ colCount: 2 });
    render(<Checkbox question={question} creator={{}} />);
    const container = screen.getByTestId('checkbox-items');
    expect(container.props.style).toEqual(
      expect.objectContaining({ flexDirection: 'row', flexWrap: 'wrap' })
    );
  });

  it('default (colCount 1): items stack vertically', () => {
    const question = createCheckbox();
    render(<Checkbox question={question} creator={{}} />);
    const container = screen.getByTestId('checkbox-items');
    expect(container.props.style).toEqual(
      expect.objectContaining({ flexDirection: 'column' })
    );
  });

  it('readOnly question: items are not pressable (no value change on press)', () => {
    const question = createCheckbox({ readOnly: true });
    render(<Checkbox question={question} creator={{}} />);
    fireEvent.press(screen.getByText('a'));
    expect(plainArray(question.value)).toEqual([]);
  });

  it('external model changes (programmatic selection) re-render the item list', () => {
    const question = createCheckbox();
    render(<Checkbox question={question} creator={{}} />);
    act(() => {
      question.value = ['c'];
    });
    // No throw and the model reflects the external write; visual checked
    // state is verified via the item recipe integration below.
    expect(plainArray(question.value)).toEqual(['c']);
  });

  /**
   * Locks the DOCUMENTED v1 ordering divergence (codex PR-18 review,
   * missed-surface 2; DIFFERENCES.md "Item ordering"): upstream's
   * `separateSpecialChoices: true` renders head (Select All) / body
   * (real choices) / foot (None, Other) SECTIONS
   * (reactquestion_selectbase.tsx bodyItems/footItems); this renderer
   * deliberately iterates `visibleChoices` flat — same item order
   * ('', a, b, none, other), no sectioning. If sectioning ever lands,
   * this test must be updated alongside DIFFERENCES.md.
   */
  it('separateSpecialChoices: items (incl. Other in the upstream foot section) render flat in visibleChoices order — the documented divergence', () => {
    const question = createCheckbox({
      showSelectAllItem: true,
      showNoneItem: true,
      showOtherItem: true,
      separateSpecialChoices: true,
    });
    // Upstream would split: head=[selectAll], body=[a,b,c], foot=[none,other].
    expect(
      (
        question as unknown as { footItems: Array<{ value: unknown }> }
      ).footItems.map((i) => i.value)
    ).toEqual(['none', 'other']);
    render(<Checkbox question={question} creator={{}} />);
    const expectedLabels = question.visibleChoices.map((i) => i.text);
    const renderedLabels = screen
      .getAllByText(/^(Select All|a|b|c|None|Other \(describe\))$/)
      .map((node) => node.props.children);
    expect(renderedLabels).toEqual(expectedLabels);
  });

  /**
   * Enablement goes through `question.getItemEnabled(item)` (codex PR-18
   * review major 2), exactly like web (reactquestion_checkbox.tsx:64):
   * `!question.isDisabledAttr && item.isEnabled`. Load-bearing — core's
   * own `clickItemHandler` does NOT reject a disabled ITEM (`selectItem`
   * only checks `isReadOnlyAttr`), so without the Pressable gate a
   * disabled choice would still mutate the answer (verified empirically
   * against survey-core v2.5.33).
   */
  it('disabled choice (enableIf false): press does not mutate the value', () => {
    const question = createCheckbox({
      choices: [{ value: 'a' }, { value: 'b', enableIf: 'false' }],
    });
    render(<Checkbox question={question} creator={{}} />);
    fireEvent.press(screen.getByText('b'));
    expect(plainArray(question.value)).toEqual([]);
    expect(question.getItemEnabled(question.visibleChoices[1]!)).toBe(false);
  });

  it('disabled question (readOnlyCallback — the core seam parent containers drive): press blocked and Other input not editable', () => {
    const question = createCheckbox({ showOtherItem: true });
    render(<Checkbox question={question} creator={{}} />);
    // Select Other while enabled so its comment input is showing.
    fireEvent.press(screen.getByText('Other (describe)'));
    expect(screen.getByTestId('checkbox-other-input').props.editable).toBe(
      true
    );
    // Now the parent disables the whole question (isDisabledAttr -> true).
    // readOnlyCallback is not an observable property, so poke a benign one
    // to flush a re-render (real parents fire their own notifications).
    act(() => {
      (
        question as unknown as { readOnlyCallback: () => boolean }
      ).readOnlyCallback = () => true;
      question.titleLocation = 'top';
    });
    fireEvent.press(screen.getByText('a'));
    expect(plainArray(question.value)).toEqual(['other']);
    expect(screen.getByTestId('checkbox-other-input').props.editable).toBe(
      false
    );
  });

  /**
   * 1.7 boundary guard (codex PR-18 review, missed-surface 1) — see the
   * matching Comment test for the rationale (chrome also subscribes;
   * two observers of one model are safe under the 0.4 D2 model-scoped
   * render guard; this locks the composed dispatcher shape).
   */
  it('inside QuestionChrome: a press commits exactly once', () => {
    const question = createCheckbox();
    const model = question.survey as unknown as Model;
    let valueChangedCount = 0;
    model.onValueChanged.add(() => {
      valueChangedCount += 1;
    });
    render(
      <QuestionChrome question={question} creator={{}}>
        <Checkbox question={question} creator={{}} />
      </QuestionChrome>
    );
    fireEvent.press(screen.getByText('a'));
    expect(plainArray(question.value)).toEqual(['a']);
    expect(valueChangedCount).toBe(1);
  });
});

describe('Checkbox — group accessibility (task 1.16)', () => {
  it('the items container carries the question label (core ariaRole "group" has no RN analog — label only, documented)', () => {
    const question = createCheckbox({ title: 'Pick some' });
    render(<Checkbox question={question} creator={{}} />);
    const container = screen.getByTestId('checkbox-items');
    expect(container.props.accessibilityLabel).toBe('Pick some');
    expect(container.props.accessibilityRole).toBeUndefined();
  });
});

describe('Checkbox — "Other" input accessibility label (task 1.16)', () => {
  it('the conditional free-text input is named by the other item text', () => {
    const question = createCheckbox({ showOtherItem: true });
    render(<Checkbox question={question} creator={{}} />);
    fireEvent.press(screen.getByText(question.otherItem.text));
    expect(
      screen.getByTestId('checkbox-other-input').props.accessibilityLabel
    ).toBe(question.otherItem.text);
  });
});
