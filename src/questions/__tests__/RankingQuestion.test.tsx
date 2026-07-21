/**
 * `ranking` question (task 4.1) — RN port of survey-react-ui's
 * `SurveyQuestionRanking` (reactquestion_ranking.tsx). Reorder is driven
 * entirely THROUGH the core model (dragDropRankingChoices.reorderRankedItem
 * + setValue, and handleKeydownSelectToRank) so value/events stay 100%
 * core-correct — the RN renderer never reimplements the ordering array.
 *
 * The fine drag gesture (gesture-handler Pan + reanimated) is a documented
 * DEVICE GATE (jest has neither library nor a UI thread); these suites lock
 * the model-driven paths that ARE unit-testable: render order, the a11y
 * move-up/move-down reorder, selectToRank area moves, max/min gating, empty
 * state, and the read-only guard.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { RankingQuestion } from '../RankingQuestion';
import { loadRankingDragLibs } from '../RankingQuestion';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import { UnsupportedQuestion } from '../../components/UnsupportedQuestion';
import { resolveQuestionDispatchKey } from '../../factories/dispatch-key';

function makeRanking(
  extra: Record<string, unknown> = {},
  name = 'r'
): Question {
  const model = new Model({
    elements: [{ type: 'ranking', name, choices: ['a', 'b', 'c'], ...extra }],
  });
  return model.getQuestionByName(name)!;
}

function renderRanking(question: Question) {
  return render(<RankingQuestion question={question} creator={{}} />);
}

/** survey-core value arrays are not plain `Array` instances (toEqual would
 * report "serializes to the same string") — compare the spread copy. */
function vals(question: Question): unknown[] {
  return Array.from((question.value ?? []) as unknown[]);
}

describe('ranking — dispatch (supported, never the fallback)', () => {
  it('resolves the "ranking" dispatch key and a real registered component', () => {
    const question = makeRanking();
    expect(resolveQuestionDispatchKey(question)).toBe('ranking');
    const element = RNQuestionFactory.createQuestion('ranking', {
      question,
      creator: {},
    });
    expect(element).not.toBeNull();
    expect(element!.type).not.toBe(UnsupportedQuestion);
  });
});

describe('ranking — default mode rendering + order', () => {
  it('renders one row per visible choice, not the unsupported fallback', () => {
    const question = makeRanking();
    renderRanking(question);
    expect(screen.getByTestId('sv-ranking-r')).toBeTruthy();
    for (const label of ['a', 'b', 'c']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByTestId('sv-ranking-item-r-0')).toBeTruthy();
    expect(screen.getByTestId('sv-ranking-item-r-2')).toBeTruthy();
  });

  it('renders rows in the model value order with 1-based rank numbers', () => {
    const question = makeRanking();
    act(() => {
      question.value = ['c', 'a', 'b'];
    });
    renderRanking(question);
    expect(
      within(screen.getByTestId('sv-ranking-item-r-0')).getByText('c')
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('sv-ranking-item-r-1')).getByText('a')
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('sv-ranking-number-r-0')).getByText('1')
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('sv-ranking-number-r-2')).getByText('3')
    ).toBeTruthy();
  });
});

describe('ranking — a11y move reorder drives the model (value + re-render lock)', () => {
  it('move-down on index 0 reorders through core and updates value AND the rendered order', () => {
    const question = makeRanking();
    act(() => {
      question.value = ['a', 'b', 'c'];
    });
    renderRanking(question);
    fireEvent.press(screen.getByTestId('sv-ranking-movedown-r-0'));
    // Core commit: value swapped.
    expect(vals(question)).toEqual(['b', 'a', 'c']);
    // The array-changed notification MUST reach the subscriber and repaint
    // the new order (probe concern #1 — a silent no-notification would
    // strand the UI).
    expect(
      within(screen.getByTestId('sv-ranking-item-r-0')).getByText('b')
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('sv-ranking-item-r-1')).getByText('a')
    ).toBeTruthy();
  });

  it('move-up on index 2 reorders the last item upward', () => {
    const question = makeRanking();
    act(() => {
      question.value = ['a', 'b', 'c'];
    });
    renderRanking(question);
    fireEvent.press(screen.getByTestId('sv-ranking-moveup-r-2'));
    expect(vals(question)).toEqual(['a', 'c', 'b']);
  });

  it('a first move from an empty (untouched) ranking establishes the value', () => {
    const question = makeRanking();
    expect(question.isEmpty()).toBe(true);
    renderRanking(question);
    fireEvent.press(screen.getByTestId('sv-ranking-movedown-r-0'));
    expect(vals(question)).toEqual(['b', 'a', 'c']);
  });

  it('move-up is disabled on the first row, move-down on the last row', () => {
    const question = makeRanking();
    act(() => {
      question.value = ['a', 'b', 'c'];
    });
    renderRanking(question);
    expect(
      screen.getByTestId('sv-ranking-moveup-r-0').props.accessibilityState
        ?.disabled
    ).toBe(true);
    expect(
      screen.getByTestId('sv-ranking-movedown-r-2').props.accessibilityState
        ?.disabled
    ).toBe(true);
    // Pressing a boundary control is a no-op (never mutates value).
    act(() => {
      question.value = ['a', 'b', 'c'];
    });
    fireEvent.press(screen.getByTestId('sv-ranking-moveup-r-0'));
    expect(vals(question)).toEqual(['a', 'b', 'c']);
  });

  it('a read-only question blocks the move controls (value unchanged)', () => {
    const question = makeRanking({ readOnly: true });
    act(() => {
      question.value = ['a', 'b', 'c'];
    });
    renderRanking(question);
    fireEvent.press(screen.getByTestId('sv-ranking-movedown-r-0'));
    expect(vals(question)).toEqual(['a', 'b', 'c']);
  });
});

describe('ranking — selectToRank two-area mode', () => {
  it('renders separate ranked/unranked areas; all choices start unranked', () => {
    const question = makeRanking({ selectToRankEnabled: true });
    renderRanking(question);
    expect(screen.getByTestId('sv-ranking-selecttorank-r')).toBeTruthy();
    expect(screen.getByTestId('sv-ranking-unranked-r-a')).toBeTruthy();
    expect(screen.getByTestId('sv-ranking-unranked-r-c')).toBeTruthy();
    expect(screen.queryByTestId('sv-ranking-ranked-r-0')).toBeNull();
  });

  it('selecting an unranked item moves it into the ranked area and updates value', () => {
    const question = makeRanking({ selectToRankEnabled: true });
    renderRanking(question);
    fireEvent.press(screen.getByTestId('sv-ranking-select-r-b'));
    expect(vals(question)).toEqual(['b']);
    // 'b' now lives in the ranked area (index 0), out of the unranked area.
    expect(screen.getByTestId('sv-ranking-ranked-r-0')).toBeTruthy();
    expect(screen.queryByTestId('sv-ranking-unranked-r-b')).toBeNull();
  });

  it('unselecting a ranked item returns it to the unranked area', () => {
    const question = makeRanking({ selectToRankEnabled: true });
    act(() => {
      question.value = ['a', 'b'];
    });
    renderRanking(question);
    fireEvent.press(screen.getByTestId('sv-ranking-unselect-r-0'));
    expect(vals(question)).toEqual(['b']);
    expect(screen.getByTestId('sv-ranking-unranked-r-a')).toBeTruthy();
  });

  it('maxSelectedChoices gates selection through the model (never a hand-rolled length check)', () => {
    const question = makeRanking({
      selectToRankEnabled: true,
      maxSelectedChoices: 1,
    });
    renderRanking(question);
    fireEvent.press(screen.getByTestId('sv-ranking-select-r-a'));
    expect(vals(question)).toEqual(['a']);
    // Second selection is refused by checkMaxSelectedChoicesUnreached.
    fireEvent.press(screen.getByTestId('sv-ranking-select-r-b'));
    expect(vals(question)).toEqual(['a']);
  });

  it('reorders within the ranked area via arrow-key move (handleKeydownSelectToRank)', () => {
    const question = makeRanking({ selectToRankEnabled: true });
    act(() => {
      question.value = ['a', 'b', 'c'];
    });
    renderRanking(question);
    fireEvent.press(screen.getByTestId('sv-ranking-movedown-r-0'));
    expect(vals(question)).toEqual(['b', 'a', 'c']);
  });
});

describe('ranking — drag gesture is a device gate', () => {
  it('gesture-handler + reanimated are absent in jest, so Layer-1 renders (no throw, move controls present)', () => {
    // Documents the gate: the fine drag needs a UI thread + native libs,
    // verified on the New-Arch example via maestro, not here.
    expect(loadRankingDragLibs()).toBeNull();
    const question = makeRanking();
    expect(() => renderRanking(question)).not.toThrow();
    expect(screen.getByTestId('sv-ranking-movedown-r-0')).toBeTruthy();
  });
});
