/**
 * Task 1.11 — comment question (design: docs/design/1.9-draft-commit.md
 * for the draft/commit adapter this wraps; docs/design/0.7-theme-rn.md for
 * the `input` recipe + bridge `getControlVariant` extraction reused here).
 * Real `Model` + `QuestionCommentModel` via the facade (no mocks) per
 * project convention (see UnsupportedQuestion.test.tsx).
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import { Comment } from '../Comment';
import { QuestionChrome } from '../QuestionChrome';
import { resolveTheme } from '../../theme-core/resolve';
import { buildInputRecipe } from '../../theme-rn/recipes/input';

function createComment(
  props: Record<string, unknown> = {},
  name = 'q1'
): Question {
  const model = new Model({
    elements: [{ type: 'comment', name, ...props }],
  });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return question;
}

/**
 * Sizing constants derived from the DEFAULT theme's own input recipe (not
 * hardcoded pixels): RN heights are border-box — a fixed/min height
 * INCLUDES the padding — so N content lines need
 * `N * lineHeight + top+bottom padding` (codex PR-18 review minor 4).
 */
function defaultInputMetrics(): {
  lineHeight: number;
  verticalPadding: number;
} {
  const base = StyleSheet.flatten(
    buildInputRecipe(resolveTheme(undefined), { platform: { os: 'ios' } })
      .fragments.base
  ) as { lineHeight?: number; paddingVertical?: number };
  return {
    lineHeight: base.lineHeight ?? 0,
    verticalPadding: (base.paddingVertical ?? 0) * 2,
  };
}

function flatInputStyle(): Record<string, unknown> {
  return StyleSheet.flatten(
    screen.getByTestId('comment-input').props.style as never
  ) as Record<string, unknown>;
}

describe('Comment', () => {
  it('renders a multiline TextInput reflecting the question value', () => {
    const question = createComment({ defaultValue: 'hello' });
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByDisplayValue('hello');
    expect(input.props.multiline).toBe(true);
  });

  it('onBlur mode (default): typing does not commit; blur commits', () => {
    const question = createComment();
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    fireEvent.changeText(input, 'typed text');
    expect(question.value).toBeFalsy();
    fireEvent(input, 'blur');
    expect(question.value).toBe('typed text');
  });

  it('onTyping mode (survey-level): commits per keystroke', () => {
    const question = createComment();
    (question.survey as unknown as { textUpdateMode: string }).textUpdateMode =
      'onTyping';
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    fireEvent.changeText(input, 'a');
    expect(question.value).toBe('a');
  });

  it('acceptCarriageReturn:false strips newlines from typed text', () => {
    const question = createComment({ acceptCarriageReturn: false });
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    fireEvent.changeText(input, 'line1\nline2');
    fireEvent(input, 'blur');
    expect(question.value).toBe('line1line2');
  });

  it('acceptCarriageReturn:true (default) keeps newlines', () => {
    const question = createComment();
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    fireEvent.changeText(input, 'line1\nline2');
    fireEvent(input, 'blur');
    expect(question.value).toBe('line1\nline2');
  });

  it('renders a character counter when maxLength is set, updating as the user types', () => {
    const question = createComment({ maxLength: 20 });
    render(<Comment question={question} creator={{}} />);
    expect(screen.getByText('0/20')).toBeTruthy();
    const input = screen.getByTestId('comment-input');
    fireEvent.changeText(input, 'hello');
    expect(screen.getByText('5/20')).toBeTruthy();
  });

  it('renders no character counter when maxLength is unset', () => {
    const question = createComment();
    render(<Comment question={question} creator={{}} />);
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull();
  });

  it('external model changes sync into the input while idle', () => {
    const question = createComment();
    render(<Comment question={question} creator={{}} />);
    act(() => {
      question.value = 'from outside';
    });
    expect(screen.getByDisplayValue('from outside')).toBeTruthy();
  });

  it('readOnly question renders a non-editable input', () => {
    const question = createComment({ readOnly: true, defaultValue: 'x' });
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    expect(input.props.editable).toBe(false);
  });

  it('autosize: onContentSizeChange grows the input height when autoGrow is enabled (content height + recipe vertical padding)', () => {
    const { verticalPadding } = defaultInputMetrics();
    const question = createComment({ autoGrow: true });
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 300, height: 300 } },
    });
    // RN height is border-box: the reported CONTENT height needs the
    // recipe's vertical padding added on top.
    expect(flatInputStyle().height).toBe(300 + verticalPadding);
  });

  it('default rows (4): minHeight reserves 4 content lines PLUS the recipe vertical padding', () => {
    const { lineHeight, verticalPadding } = defaultInputMetrics();
    const question = createComment();
    render(<Comment question={question} creator={{}} />);
    expect(flatInputStyle().minHeight).toBe(4 * lineHeight + verticalPadding);
  });

  it('rows: N drives the minimum height (N lines + padding)', () => {
    const { lineHeight, verticalPadding } = defaultInputMetrics();
    const question = createComment({ rows: 2 });
    render(<Comment question={question} creator={{}} />);
    expect(flatInputStyle().minHeight).toBe(2 * lineHeight + verticalPadding);
  });

  it('autosize never shrinks below the rows minimum (below-minimum content event clamps)', () => {
    const { lineHeight, verticalPadding } = defaultInputMetrics();
    const question = createComment({ autoGrow: true });
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 300, height: 10 } },
    });
    expect(flatInputStyle().height).toBe(4 * lineHeight + verticalPadding);
  });

  it('calls question.focusIn() on native focus (bridge contract)', () => {
    const question = createComment();
    const focusInSpy = jest.spyOn(question, 'focusIn');
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    fireEvent(input, 'focus');
    expect(focusInSpy).toHaveBeenCalled();
  });

  /**
   * 1.7 boundary guard (codex PR-18 review, missed-surface 1): the merged
   * `QuestionChrome` ALSO subscribes to the question via
   * `getStateElement()`. Two observers of one model are safe by design —
   * the 0.4 D2 render guard lives ON the model and each observer has its
   * own callback identity — but this test locks the composed behavior the
   * 1.1/1.4 dispatcher will ship: typing + blur inside chrome commits
   * exactly ONCE, and focusIn fires exactly ONCE (the leaf owns it;
   * chrome never calls focusIn).
   */
  it('inside QuestionChrome: one commit per blur and one focusIn per focus (no double-subscription side effects)', () => {
    const question = createComment();
    const model = question.survey as unknown as Model;
    let valueChangedCount = 0;
    model.onValueChanged.add(() => {
      valueChangedCount += 1;
    });
    const focusInSpy = jest.spyOn(question, 'focusIn');
    render(
      <QuestionChrome question={question} creator={{}}>
        <Comment question={question} creator={{}} />
      </QuestionChrome>
    );
    const input = screen.getByTestId('comment-input');
    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'typed under chrome');
    fireEvent(input, 'blur');
    expect(question.value).toBe('typed under chrome');
    expect(valueChangedCount).toBe(1);
    expect(focusInSpy).toHaveBeenCalledTimes(1);
  });
});
