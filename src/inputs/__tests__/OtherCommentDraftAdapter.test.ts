/**
 * Task 1.12 — draft/commit adapter for the "other" item comment input on
 * checkbox/radiogroup (design parallel to 1.9's `DraftCommitAdapter`, but
 * scoped to `question.otherValue` — the select-base surface backing the
 * "Other (describe)" free-text field — instead of `question.value`/
 * `inputValue`). Verified upstream semantics (survey-core v2.5.33
 * question_baseselect.ts `getOtherTextAreaOptions`/`onOtherValueInput`/
 * `onOtherValueChange`, lines ~300-317, 1868-1881): typing commits only
 * when `question.isInputTextUpdate`; the change/blur-equivalent commit is
 * unconditional. Unlike the primary text/comment adapter, upstream does
 * NOT wire `onTextAreaFocus`/`onTextAreaBlur` for the "other" item's text
 * area at all (no `question.onFocus/onBlur` call here — intentionally not
 * ported).
 */
import { Model } from '../../core/facade';
import type { QuestionCheckboxModel } from '../../core/facade';
import { OtherCommentDraftAdapter } from '../OtherCommentDraftAdapter';

function checkboxWithOther(questionProps: Record<string, unknown> = {}): {
  model: Model;
  question: QuestionCheckboxModel;
} {
  const model = new Model({
    elements: [
      {
        type: 'checkbox',
        name: 'q1',
        choices: ['a', 'b'],
        showOtherItem: true,
        ...questionProps,
      },
    ],
  });
  const question = model.getQuestionByName('q1') as QuestionCheckboxModel;
  question.clickItemHandler(question.otherItem, true);
  return { model, question };
}

describe('OtherCommentDraftAdapter', () => {
  it('initializes renderedValue from question.otherValue', () => {
    const { question } = checkboxWithOther();
    question.otherValue = 'preset';
    const adapter = new OtherCommentDraftAdapter({ question });
    expect(adapter.renderedValue).toBe('preset');
  });

  it('empty otherValue formats to ""', () => {
    const { question } = checkboxWithOther();
    const adapter = new OtherCommentDraftAdapter({ question });
    expect(adapter.renderedValue).toBe('');
  });

  it('onBlur mode (default): typing does not commit otherValue; blur commits', () => {
    const { question } = checkboxWithOther();
    const adapter = new OtherCommentDraftAdapter({ question });
    adapter.handleChangeText('typed');
    expect(question.otherValue).toBeFalsy();
    expect(adapter.renderedValue).toBe('typed');
    adapter.handleBlur();
    expect(question.otherValue).toBe('typed');
  });

  it('onTyping mode (survey-level): commits per keystroke', () => {
    const { model, question } = checkboxWithOther();
    (model as unknown as { textUpdateMode: string }).textUpdateMode =
      'onTyping';
    const adapter = new OtherCommentDraftAdapter({ question });
    adapter.handleChangeText('a');
    expect(question.otherValue).toBe('a');
  });

  it('external otherValue writes sync into the draft', () => {
    const { question } = checkboxWithOther();
    const onChange = jest.fn();
    const adapter = new OtherCommentDraftAdapter({
      question,
      onRenderedValueChange: onChange,
    });
    question.otherValue = 'from outside';
    expect(adapter.renderedValue).toBe('from outside');
    expect(onChange).toHaveBeenCalled();
  });

  it('self-echo does not spuriously fire onRenderedValueChange again', () => {
    const { question } = checkboxWithOther();
    const adapter = new OtherCommentDraftAdapter({ question });
    adapter.handleChangeText('same');
    const onChange = jest.fn();
    (
      adapter as unknown as { onRenderedValueChange?: () => void }
    ).onRenderedValueChange = onChange;
    adapter.handleBlur();
    expect(question.otherValue).toBe('same');
  });

  it('dispose() unregisters the model subscription', () => {
    const { question } = checkboxWithOther();
    const onChange = jest.fn();
    const adapter = new OtherCommentDraftAdapter({
      question,
      onRenderedValueChange: onChange,
    });
    adapter.dispose();
    question.otherValue = 'after dispose';
    expect(onChange).not.toHaveBeenCalled();
    expect(adapter.renderedValue).toBe('');
  });
});
