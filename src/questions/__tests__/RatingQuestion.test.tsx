/**
 * `rating` question type (task 1.14) -- RN port of survey-react-ui's
 * `SurveyQuestionRating` + item components. Dispatch via the descriptor
 * table's "rating" template row + per-item `RNElementFactory` dispatch
 * under `question.itemComponent`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { RatingQuestion } from '../RatingQuestion';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

function createRatingQuestion(
  name: string,
  extra: Record<string, unknown> = {}
): { model: Model; question: Question } {
  const model = new Model({
    elements: [{ type: 'rating', name, ...extra }],
  });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return { model, question };
}

describe('RatingQuestion -- numbers/labels mode (default rateType)', () => {
  it('renders one item per visibleRateValues entry (default rateMin=1/rateMax=5)', () => {
    const { question } = createRatingQuestion('q1');
    render(<RatingQuestion question={question} creator={{}} />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`sv-rating-item-q1-${i}`)).toBeTruthy();
    }
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('respects a custom rateMin/rateMax/rateStep (visibleRateValues, core-owned)', () => {
    const { question } = createRatingQuestion('q2', {
      rateMin: 0,
      rateMax: 10,
      rateStep: 5,
    });
    render(<RatingQuestion question={question} creator={{}} />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('pressing an item sets the value via setValueFromClick (question.value)', () => {
    const { question } = createRatingQuestion('q3');
    render(<RatingQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-rating-item-q3-2'));
    expect(question.value).toBe(3);
  });

  it('pressing the SAME selected item again clears the value (setValueFromClick toggle, core-owned)', () => {
    const { question } = createRatingQuestion('q4');
    render(<RatingQuestion question={question} creator={{}} />);
    const item = screen.getByTestId('sv-rating-item-q4-2');
    fireEvent.press(item);
    expect(question.value).toBe(3);
    fireEvent.press(item);
    expect(question.value).toBeUndefined();
  });

  it('marks the selected item with accessibilityState.checked and re-renders reactively on external value change', () => {
    const { question } = createRatingQuestion('q5');
    render(<RatingQuestion question={question} creator={{}} />);
    const item2 = screen.getByTestId('sv-rating-item-q5-1');
    expect(item2.props.accessibilityState?.checked).toBe(false);
    act(() => {
      question.value = 2;
    });
    expect(item2.props.accessibilityState?.checked).toBe(true);
  });

  it('renders minRateDescription/maxRateDescription as flanking locstrings when set', () => {
    const { question } = createRatingQuestion('q6', {
      minRateDescription: 'Bad',
      maxRateDescription: 'Great',
    });
    render(<RatingQuestion question={question} creator={{}} />);
    expect(screen.getByText('Bad')).toBeTruthy();
    expect(screen.getByText('Great')).toBeTruthy();
  });
});

describe('RatingQuestion -- stars mode (rateType: "stars")', () => {
  it('renders star items via RNIcon, filled up to the selected value', () => {
    const { question } = createRatingQuestion('q7', {
      rateType: 'stars',
      rateMax: 5,
    });
    render(<RatingQuestion question={question} creator={{}} />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`sv-rating-item-q7-${i}`)).toBeTruthy();
    }
    const third = screen.getByTestId('sv-rating-item-q7-2');
    expect(third.props.accessibilityState?.checked).toBe(false);
    fireEvent.press(third);
    expect(question.value).toBe(3);
    expect(third.props.accessibilityState?.checked).toBe(true);
    // "filled up to" -- the FIRST star is also selected once the third is.
    expect(
      screen.getByTestId('sv-rating-item-q7-0').props.accessibilityState
        ?.checked
    ).toBe(true);
    // the star AFTER the selected one is not.
    expect(
      screen.getByTestId('sv-rating-item-q7-3').props.accessibilityState
        ?.checked
    ).toBe(false);
  });

  it('string rateValues: stars fill up to the selected item POSITION (upstream getItemClass uses rateValues order, question_rating.ts:770-777)', () => {
    const { question } = createRatingQuestion('q7s', {
      rateType: 'stars',
      rateValues: ['low', 'mid', 'high'],
    });
    render(<RatingQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-rating-item-q7s-2'));
    expect(question.value).toBe('high');
    // Every PRECEDING star fills, by position — not value arithmetic.
    for (let i = 0; i < 3; i++) {
      expect(
        screen.getByTestId(`sv-rating-item-q7s-${i}`).props.accessibilityState
          ?.checked
      ).toBe(true);
    }
    fireEvent.press(screen.getByTestId('sv-rating-item-q7s-0'));
    expect(question.value).toBe('low');
    expect(
      screen.getByTestId('sv-rating-item-q7s-0').props.accessibilityState
        ?.checked
    ).toBe(true);
    expect(
      screen.getByTestId('sv-rating-item-q7s-1').props.accessibilityState
        ?.checked
    ).toBe(false);
  });
});

describe('RatingQuestion -- group accessibility (review round 1)', () => {
  it('the item row exposes radiogroup semantics with the question label (core a11y_input_ariaRole, question_rating.ts:975-977)', () => {
    const { question } = createRatingQuestion('q11', {
      title: 'Rate the service',
      isRequired: true,
    });
    render(<RatingQuestion question={question} creator={{}} />);
    const row = screen.getByTestId('sv-rating-row-q11');
    expect(row.props.accessibilityRole).toBe('radiogroup');
    expect(row.props.accessibilityLabel).toBe('Rate the service');
    // Items keep their individual radio + checked semantics.
    const first = screen.getByTestId('sv-rating-item-q11-0');
    expect(first.props.accessibilityRole).toBe('radio');
    expect(first.props.accessibilityState?.checked).toBe(false);
  });

  it('an explicit ariaLabel (a11y_input_ariaLabel) wins over the title fallback', () => {
    const { question } = createRatingQuestion('q12', {
      title: 'Visible title',
      titleLocation: 'hidden',
    });
    render(<RatingQuestion question={question} creator={{}} />);
    const row = screen.getByTestId('sv-rating-row-q12');
    const q = question as unknown as { a11y_input_ariaLabel: string | null };
    // titleLocation hidden -> core supplies the label itself; whatever it
    // computes is what the row must expose (no re-derivation).
    expect(row.props.accessibilityLabel).toBe(
      q.a11y_input_ariaLabel ?? 'Visible title'
    );
  });
});

describe('RatingQuestion -- smileys mode (rateType: "smileys")', () => {
  it('renders smiley items via RNIcon using getItemSmileyIconName', () => {
    const { question } = createRatingQuestion('q8', {
      rateType: 'smileys',
      rateMax: 5,
    });
    render(<RatingQuestion question={question} creator={{}} />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`sv-rating-item-q8-${i}`)).toBeTruthy();
    }
    const item0 = screen.getByTestId('sv-rating-item-q8-0');
    fireEvent.press(item0);
    expect(question.value).toBe(1);
    expect(item0.props.accessibilityState?.checked).toBe(true);
  });
});

describe('RatingQuestion -- read-only', () => {
  it('isDisplayMode disables press and setValueFromClick never fires', () => {
    const { question } = createRatingQuestion('q9');
    render(
      <RatingQuestion question={question} creator={{}} isDisplayMode={true} />
    );
    const item = screen.getByTestId('sv-rating-item-q9-0');
    expect(item.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(item);
    expect(question.value).toBeUndefined();
  });
});

describe('RatingQuestion -- item-dispatch miss (renderAs: "dropdown", deferred to M2)', () => {
  afterEach(() => {
    setDiagnosticHandler(undefined);
  });

  it('never throws; renders the row with no items; reports an element-wrapper-missing diagnostic', () => {
    const diagnostics: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => diagnostics.push(payload));
    const { question } = createRatingQuestion('q10', { renderAs: 'dropdown' });
    expect(question.itemComponent).toBe('sv-rating-dropdown-item');
    expect(() =>
      render(<RatingQuestion question={question} creator={{}} />)
    ).not.toThrow();
    expect(screen.getByTestId('sv-rating-q10')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-item-q10-0')).toBeNull();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'element-wrapper-missing',
        componentName: 'sv-rating-dropdown-item',
        reason: 'rating-item-component',
      }),
    ]);
  });
});

describe('RatingQuestion — icon-only item labels (task 1.16)', () => {
  it('star items are named by the localized item text (icon child is a11y-hidden)', () => {
    const { question } = createRatingQuestion('q-star-lbl', {
      rateType: 'stars',
      rateMax: 3,
    });
    render(<RatingQuestion question={question} creator={{}} />);
    expect(
      screen.getByTestId('sv-rating-item-q-star-lbl-0').props.accessibilityLabel
    ).toBe('1');
  });

  it('smiley items are named by the localized item text', () => {
    const { question } = createRatingQuestion('q-sm-lbl', {
      rateType: 'smileys',
      rateMax: 3,
    });
    render(<RatingQuestion question={question} creator={{}} />);
    expect(
      screen.getByTestId('sv-rating-item-q-sm-lbl-1').props.accessibilityLabel
    ).toBe('2');
  });
});
