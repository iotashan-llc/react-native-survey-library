/**
 * Task 1.10 — the RN analog of web's `InputElementAdapter` (mask/
 * input_element_adapter.ts): computes the `ITextInputParams` core's own
 * `IInputMask.processInput` expects from a bare (prevValue, nextValue,
 * prevSelection) triple, since RN `TextInput.onChangeText` fires with the
 * post-edit text only — no `beforeinput`-shaped diff, no DOM `inputType`.
 * See docs/design/1.9-draft-commit.md, "Masked questions: the draft lives
 * in MASKED space" for why the draft this feeds must already be
 * mask-shaped.
 */
import { computeTextEditDiff, applyMaskedEdit } from '../maskEditing';
import type { MaskLike } from '../maskEditing';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';

describe('computeTextEditDiff', () => {
  it('append at the end: no selection needed', () => {
    expect(computeTextEditDiff('123', '1234', null)).toEqual({
      prevValue: '123',
      selectionStart: 3,
      selectionEnd: 3,
      insertedChars: '4',
      inputDirection: 'forward',
    });
  });

  it('insert in the middle (cursor mid-string)', () => {
    expect(computeTextEditDiff('14', '124', { start: 1, end: 1 })).toEqual({
      prevValue: '14',
      selectionStart: 1,
      selectionEnd: 1,
      insertedChars: '2',
      inputDirection: 'forward',
    });
  });

  it('backspace at a collapsed cursor deletes the char BEFORE it (backward)', () => {
    expect(computeTextEditDiff('1234', '123', { start: 4, end: 4 })).toEqual({
      prevValue: '1234',
      selectionStart: 3,
      selectionEnd: 4,
      insertedChars: null,
      inputDirection: 'backward',
    });
  });

  it('forward-delete at a collapsed cursor deletes the char AFTER it (forward)', () => {
    expect(computeTextEditDiff('1234', '234', { start: 0, end: 0 })).toEqual({
      prevValue: '1234',
      selectionStart: 0,
      selectionEnd: 1,
      insertedChars: null,
      inputDirection: 'forward',
    });
  });

  it('replacing a selected range with typed text', () => {
    expect(
      computeTextEditDiff('hello world', 'hello there', {
        start: 6,
        end: 11,
      })
    ).toEqual({
      prevValue: 'hello world',
      selectionStart: 6,
      selectionEnd: 11,
      insertedChars: 'there',
      inputDirection: 'forward',
    });
  });

  it('deleting a non-collapsed selection (no typed replacement)', () => {
    expect(
      computeTextEditDiff('hello world', 'hello ', { start: 6, end: 11 })
    ).toEqual({
      prevValue: 'hello world',
      selectionStart: 6,
      selectionEnd: 11,
      insertedChars: null,
      inputDirection: 'forward',
    });
  });

  it('no known previous selection: deletion defaults to forward direction', () => {
    expect(computeTextEditDiff('1234', '123', null)).toEqual({
      prevValue: '1234',
      selectionStart: 3,
      selectionEnd: 4,
      insertedChars: null,
      inputDirection: 'forward',
    });
  });

  it('clearing the whole field via backspace at the end', () => {
    expect(computeTextEditDiff('1234', '', { start: 4, end: 4 })).toEqual({
      prevValue: '1234',
      selectionStart: 0,
      selectionEnd: 4,
      insertedChars: null,
      inputDirection: 'backward',
    });
  });

  it('typing into an empty field', () => {
    expect(computeTextEditDiff('', 'a', { start: 0, end: 0 })).toEqual({
      prevValue: '',
      selectionStart: 0,
      selectionEnd: 0,
      insertedChars: 'a',
      inputDirection: 'forward',
    });
  });

  it('repeated-character ambiguity still yields a valid, minimal diff', () => {
    // "aaa" -> "aaaa": prefix/suffix heuristic must not throw or produce
    // an out-of-range slice.
    const result = computeTextEditDiff('aaa', 'aaaa', { start: 3, end: 3 });
    expect(result.insertedChars).toBe('a');
    expect(result.selectionStart).toBe(3);
    expect(result.selectionEnd).toBe(3);
  });
});

describe('applyMaskedEdit', () => {
  it('delegates to mask.processInput with the computed diff and returns {value, caretPosition}', () => {
    const calls: unknown[] = [];
    const mask: MaskLike = {
      processInput: (args) => {
        calls.push(args);
        return { value: 'MASKED', caretPosition: 6 };
      },
    };
    const result = applyMaskedEdit(mask, '123', { start: 3, end: 3 }, '1234');
    expect(result).toEqual({ value: 'MASKED', caretPosition: 6 });
    expect(calls).toEqual([
      {
        prevValue: '123',
        selectionStart: 3,
        selectionEnd: 3,
        insertedChars: '4',
        inputDirection: 'forward',
      },
    ]);
  });

  function createMaskedQuestion(pattern: string): Question {
    const model = new Model({
      elements: [
        {
          type: 'text',
          name: 'q1',
          maskType: 'pattern',
          maskSettings: { pattern },
        },
      ],
    });
    const question = model.getQuestionByName('q1') as Question | null;
    if (!question) throw new Error('fixture question missing');
    return question;
  }

  it('real core pattern mask (999-999): incremental digit-by-digit typing formats live, including the auto-inserted literal separator', () => {
    const question = createMaskedQuestion('999-999');
    const mask = (question as unknown as { maskInstance: MaskLike })
      .maskInstance;

    let draft = '';
    let selection: { start: number; end: number } | null = { start: 0, end: 0 };
    const type = (nextRaw: string): void => {
      const r = applyMaskedEdit(mask, draft, selection, nextRaw);
      draft = r.value;
      selection = { start: r.caretPosition, end: r.caretPosition };
    };

    type('1');
    // Unfilled regex slots render as the mask's placeholder char ("_",
    // settings.maskSettings default) — verified against the real core
    // mask, not assumed.
    expect(draft).toBe('1__-___');
    type('12');
    expect(draft).toBe('12_-___');
    type('123');
    // Third digit completes the left group; the literal "-" separator is
    // already visible via the placeholder fill, not freshly inserted.
    expect(draft).toBe('123-___');
    type('123-4');
    expect(draft).toBe('123-4__');
  });

  it('real core pattern mask: mid-string edit (insert a digit before the separator) reformats the whole value', () => {
    const question = createMaskedQuestion('999-999');
    const mask = (question as unknown as { maskInstance: MaskLike })
      .maskInstance;

    // Start from a completed left group + one right-group digit.
    const start = applyMaskedEdit(mask, '', null, '1');
    let draft = applyMaskedEdit(mask, start.value, null, '12').value;
    draft = applyMaskedEdit(mask, draft, null, '123').value; // "123-___"
    draft = applyMaskedEdit(mask, draft, { start: 4, end: 4 }, '123-4').value;
    expect(draft).toBe('123-4__');

    // Insert "9" between the "1" and "2" (cursor was at index 1) — every
    // digit right of the insertion point shifts, and the last one that no
    // longer fits the (fixed 6-digit) pattern drops off the end.
    const edited = applyMaskedEdit(
      mask,
      draft,
      { start: 1, end: 1 },
      '19' + draft.slice(1)
    );
    expect(edited).toEqual({ value: '192-34_', caretPosition: 2 });
  });

  it('real core pattern mask: backspace over a fixed separator skips it first, then a second backspace deletes the preceding digit', () => {
    const question = createMaskedQuestion('999-999');
    const mask = (question as unknown as { maskInstance: MaskLike })
      .maskInstance;
    const draft = applyMaskedEdit(mask, '', null, '123').value; // "123-___"
    expect(draft).toBe('123-___');

    // Backspace with cursor collapsed right after the literal "-"
    // (index 4): the raw TextInput would delete that literal char,
    // producing "123___"; the mask reformats it right back to "123-___"
    // (the literal isn't a real content position) and only repositions
    // the caret to just BEFORE the separator (index 3) — a skip-over, not
    // a content change.
    const skip = applyMaskedEdit(
      mask,
      draft,
      { start: 4, end: 4 },
      draft.slice(0, 3) + draft.slice(4)
    );
    expect(skip).toEqual({ value: '123-___', caretPosition: 3 });

    // A second backspace, now from the skipped-to position (3), deletes
    // the actual digit "3".
    const deleted = applyMaskedEdit(
      mask,
      skip.value,
      { start: 3, end: 3 },
      skip.value.slice(0, 2) + skip.value.slice(3)
    );
    expect(deleted.value).toBe('12_-___');
  });
});
