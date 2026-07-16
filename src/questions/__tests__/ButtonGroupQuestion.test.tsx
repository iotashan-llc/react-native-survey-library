/**
 * `buttongroup` question (task 2.9) — RN port of survey-react-ui's
 * `SurveyQuestionButtonGroup` (reactquestion_buttongroup.tsx), built on
 * core's own per-item `ButtonGroupItemModel` view-model (value/caption/
 * icon/selected/readOnly/onChange → selectItem — invariant 6: consumed,
 * never re-derived).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { ButtonGroupQuestion } from '../ButtonGroupQuestion';

function createButtonGroup(
  extra: Record<string, unknown> = {},
  name = 'bg'
): Question {
  const model = new Model({
    elements: [
      {
        type: 'buttongroup',
        name,
        choices: ['alpha', 'beta', 'gamma'],
        ...extra,
      },
    ],
  });
  return model.getQuestionByName(name)!;
}

describe('ButtonGroupQuestion — rendering + selection', () => {
  it('renders one pressable per visible choice with its caption', () => {
    const question = createButtonGroup();
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    for (const caption of ['alpha', 'beta', 'gamma']) {
      expect(screen.getByText(caption)).toBeTruthy();
    }
    expect(screen.getByTestId('sv-buttongroup-item-bg-0')).toBeTruthy();
    expect(screen.getByTestId('sv-buttongroup-item-bg-2')).toBeTruthy();
  });

  it('press selects through core selectItem (single select, exclusivity)', () => {
    const question = createButtonGroup();
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-1'));
    expect(question.value).toBe('beta');
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-2'));
    expect(question.value).toBe('gamma');
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-1').props.accessibilityState
        ?.checked
    ).toBe(false);
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-2').props.accessibilityState
        ?.checked
    ).toBe(true);
  });

  it('re-renders reactively on an external value write', () => {
    const question = createButtonGroup();
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    act(() => {
      question.value = 'alpha';
    });
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-0').props.accessibilityState
        ?.checked
    ).toBe(true);
  });

  it('read-only blocks presses (isInputReadOnly consumed, not re-derived)', () => {
    const question = createButtonGroup({ readOnly: true });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-0'));
    expect(question.value).toBeUndefined();
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-0').props.accessibilityState
        ?.disabled
    ).toBe(true);
  });

  it('a disabled ITEM blocks its press while siblings stay live (enableIf on the item)', () => {
    const question = createButtonGroup({
      choices: ['alpha', { value: 'beta', enableIf: 'false' }, 'gamma'],
    });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-1'));
    expect(question.value).toBeUndefined();
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-2'));
    expect(question.value).toBe('gamma');
  });
});

describe('ButtonGroupQuestion — icons + captions', () => {
  it('renders the item icon through RNIcon when iconName is set', () => {
    const question = createButtonGroup({
      choices: [{ value: 'a', iconName: 'icon-search', showCaption: false }],
    });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    expect(screen.getByTestId('sv-buttongroup-item-bg-0')).toBeTruthy();
    // showCaption false hides the caption text.
    expect(screen.queryByText('a')).toBeNull();
  });
});

describe('ButtonGroupQuestion — group accessibility (1.16 pattern)', () => {
  it('container exposes radiogroup semantics with the question label; items are radios', () => {
    const question = createButtonGroup({ title: 'Pick one' });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    const row = screen.getByTestId('sv-buttongroup-bg');
    expect(row.props.accessibilityRole).toBe('radiogroup');
    expect(row.props.accessibilityLabel).toBe('Pick one');
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-0').props.accessibilityRole
    ).toBe('radio');
  });
});
