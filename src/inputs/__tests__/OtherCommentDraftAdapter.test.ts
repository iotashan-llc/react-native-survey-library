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

function checkboxWithOther(
  questionProps: Record<string, unknown> = {},
  surveyProps: Record<string, unknown> = {}
): {
  model: Model;
  question: QuestionCheckboxModel;
} {
  const model = new Model({
    ...surveyProps,
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

  /**
   * `getStoreOthersAsComment()` matrix (codex PR-18 review major 1):
   * core stores the other text in the `comment` property when
   * storeOthersAsComment is TRUE (the default), but in the `otherValue`
   * property — with the text ALSO replacing the "other" slot inside
   * `question.value` — when FALSE (question_baseselect.ts:412-438,
   * 507-509: `getCommentPropertyValue(otherItem)` returns "comment" vs
   * "otherValue"). The adapter must stay live in BOTH modes.
   */
  describe.each([
    ['storeOthersAsComment: true (default)', { storeOthersAsComment: true }],
    ['storeOthersAsComment: false', { storeOthersAsComment: false }],
  ])('%s', (_label, surveyProps) => {
    it('initializes renderedValue from a preset otherValue', () => {
      const { question } = checkboxWithOther({}, surveyProps);
      question.otherValue = 'preset';
      const adapter = new OtherCommentDraftAdapter({ question });
      expect(adapter.renderedValue).toBe('preset');
    });

    it('external otherValue writes sync into the draft (adapter never goes stale)', () => {
      const { question } = checkboxWithOther({}, surveyProps);
      const onChange = jest.fn();
      const adapter = new OtherCommentDraftAdapter({
        question,
        onRenderedValueChange: onChange,
      });
      question.otherValue = 'from outside';
      expect(adapter.renderedValue).toBe('from outside');
      expect(onChange).toHaveBeenCalled();
    });

    it('onBlur mode (default): typing stays draft-only; blur commits', () => {
      const { question } = checkboxWithOther({}, surveyProps);
      const adapter = new OtherCommentDraftAdapter({ question });
      adapter.handleChangeText('typed');
      expect(question.otherValue).toBeFalsy();
      expect(adapter.renderedValue).toBe('typed');
      adapter.handleBlur();
      expect(question.otherValue).toBe('typed');
    });

    it('onTyping mode (survey-level): commits per keystroke', () => {
      // Text deliberately NOT colliding with a real choice value: in
      // storeOthersAsComment:false mode the committed text lands inside
      // question.value, and core collapses a value that matches an
      // existing choice onto that choice (renderedValueFromDataCore) —
      // web behaves identically through onOtherValueInput.
      const { model, question } = checkboxWithOther({}, surveyProps);
      (model as unknown as { textUpdateMode: string }).textUpdateMode =
        'onTyping';
      const adapter = new OtherCommentDraftAdapter({ question });
      adapter.handleChangeText('z');
      expect(question.otherValue).toBe('z');
    });
  });

  it('storeOthersAsComment:false — a commit lands in question.value (other slot replaced by the text), never a "-Comment" data key', () => {
    const { model, question } = checkboxWithOther(
      {},
      { storeOthersAsComment: false }
    );
    const adapter = new OtherCommentDraftAdapter({ question });
    adapter.handleChangeText('custom text');
    adapter.handleBlur();
    expect(question.otherValue).toBe('custom text');
    expect(Array.from(question.value as unknown[])).toContain('custom text');
    // The comment DATA slot stays empty — the text lives in the value
    // itself in this mode (question.comment's getter mirrors otherValue
    // via the selectbase getQuestionComment override, so assert the data
    // layer, not the getter).
    expect(
      (model.data as Record<string, unknown>)['q1-Comment']
    ).toBeUndefined();
  });
});
