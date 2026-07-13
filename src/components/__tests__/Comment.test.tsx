/**
 * Task 1.11 — comment question (design: docs/design/1.9-draft-commit.md
 * for the draft/commit adapter this wraps; docs/design/0.7-theme-rn.md for
 * the `input` recipe + bridge `getControlVariant` extraction reused here).
 * Real `Model` + `QuestionCommentModel` via the facade (no mocks) per
 * project convention (see UnsupportedQuestion.test.tsx).
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import { Comment } from '../Comment';

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

  it('autosize: onContentSizeChange grows the input height when autoGrow is enabled', () => {
    const question = createComment({ autoGrow: true });
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 300, height: 120 } },
    });
    expect(input.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 120 })])
    );
  });

  it('calls question.focusIn() on native focus (bridge contract)', () => {
    const question = createComment();
    const focusInSpy = jest.spyOn(question, 'focusIn');
    render(<Comment question={question} creator={{}} />);
    const input = screen.getByTestId('comment-input');
    fireEvent(input, 'focus');
    expect(focusInSpy).toHaveBeenCalled();
  });
});
