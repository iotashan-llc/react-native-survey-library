/**
 * `multipletext` question (task 2.6) — RN port of survey-react-ui's
 * `SurveyQuestionMultipleText` (reactquestion_multipletext.tsx). Core
 * owns the grid: `getRows()` returns row objects with `isVisible` +
 * `cells` (item cells whose `cell.item.editor` IS a real
 * QuestionTextModel — rendered through the existing TextQuestion, so the
 * 1.9 draft/commit machinery applies unchanged), plus error cells
 * (`isErrorsCell`) whose visibility core drives from itemErrorLocation.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { MultipleTextQuestion } from '../MultipleTextQuestion';

function createMultipleText(
  extra: Record<string, unknown> = {},
  name = 'mt'
): { model: Model; question: Question } {
  const model = new Model({
    elements: [
      {
        type: 'multipletext',
        name,
        items: [
          { name: 'first', title: 'First name' },
          { name: 'last', title: 'Last name' },
          { name: 'city' },
        ],
        ...extra,
      },
    ],
  });
  return { model, question: model.getQuestionByName(name)! };
}

describe('MultipleTextQuestion — grid + editors', () => {
  it('renders every item title and a text input per item (editor = real QuestionTextModel)', () => {
    const { question } = createMultipleText();
    render(<MultipleTextQuestion question={question} creator={{}} />);
    expect(screen.getByText('First name')).toBeTruthy();
    expect(screen.getByText('Last name')).toBeTruthy();
    expect(screen.getByText('city')).toBeTruthy(); // title falls back to name
    expect(screen.getByTestId('first-input')).toBeTruthy();
    expect(screen.getByTestId('last-input')).toBeTruthy();
  });

  it('typing + blur commits through the item editor into the composite value', () => {
    const { question } = createMultipleText();
    render(<MultipleTextQuestion question={question} creator={{}} />);
    const input = screen.getByTestId('first-input');
    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'Ada');
    fireEvent(input, 'blur');
    expect(question.value).toEqual({ first: 'Ada' });
  });

  it('an external composite write re-renders the editors', () => {
    const { question } = createMultipleText();
    render(<MultipleTextQuestion question={question} creator={{}} />);
    act(() => {
      question.value = { last: 'Lovelace' };
    });
    expect(screen.getByTestId('last-input').props.value).toBe('Lovelace');
  });

  it('colCount lays multiple items into one row (row count follows core getRows)', () => {
    const { question } = createMultipleText({ colCount: 2 });
    render(<MultipleTextQuestion question={question} creator={{}} />);
    // Core: 3 items at colCount 2 -> 2 item rows.
    expect(screen.getAllByTestId('sv-multipletext-row')).toHaveLength(2);
  });

  it('item-level errors surface in the error cell after validation', () => {
    const { model, question } = createMultipleText({
      items: [{ name: 'req', title: 'Required item', isRequired: true }],
    });
    render(<MultipleTextQuestion question={question} creator={{}} />);
    act(() => {
      model.completeLastPage();
    });
    expect(screen.getByText(/Response required/i)).toBeTruthy();
  });
});
