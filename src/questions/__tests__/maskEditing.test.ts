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

describe('computeTextEditDiff: selection-aware reconstruction (ambiguous edits)', () => {
  // A prefix/suffix diff alone cannot tell WHICH of several identical
  // characters an edit touched — different edits produce indistinguishable
  // text but different core `processInput` args (web's `createArgs` gets
  // the authoritative pre-edit selection from the DOM,
  // mask/input_element_adapter.ts:76-96). When the tracked pre-edit
  // selection is CONSISTENT with the observed text change, it is
  // authoritative; the canonical diff is only the fallback.

  it('backspace deleting the FIRST of two identical chars is located by the pre-edit caret', () => {
    // "1123" -> "123" is textually ambiguous (either "1" could have been
    // deleted); the collapsed caret at 1 proves it was a backspace over
    // index 0. The canonical prefix/suffix diff would blame [1,2).
    expect(computeTextEditDiff('1123', '123', { start: 1, end: 1 })).toEqual({
      prevValue: '1123',
      selectionStart: 0,
      selectionEnd: 1,
      insertedChars: null,
      inputDirection: 'backward',
    });
  });

  it('mid-string backspace in a repeated run: the caret disambiguates against the prefix/suffix heuristic', () => {
    // "aa-aa" -> "aa-a" with caret at 4: backspace deleted index 3 (the
    // FIRST "a" of the second pair); the canonical diff would say [4,5).
    expect(computeTextEditDiff('aa-aa', 'aa-a', { start: 4, end: 4 })).toEqual({
      prevValue: 'aa-aa',
      selectionStart: 3,
      selectionEnd: 4,
      insertedChars: null,
      inputDirection: 'backward',
    });
  });

  it('deletion ambiguous between backspace and forward-delete resolves to backspace', () => {
    // "aabb" caret 1 -> "abb": deleting [0,1) (backspace) and [1,2)
    // (forward-delete) BOTH reproduce the text — RN cannot see the key.
    // Backspace wins the tie: mobile soft keyboards effectively have no
    // forward-delete.
    expect(computeTextEditDiff('aabb', 'abb', { start: 1, end: 1 })).toEqual({
      prevValue: 'aabb',
      selectionStart: 0,
      selectionEnd: 1,
      insertedChars: null,
      inputDirection: 'backward',
    });
  });

  it('unambiguous forward-delete inside a repeated run', () => {
    // Caret 2 in "aabb" -> "aab": only forward-delete of [2,3) fits
    // (backspace over [1,2) would have produced "abb").
    expect(computeTextEditDiff('aabb', 'aab', { start: 2, end: 2 })).toEqual({
      prevValue: 'aabb',
      selectionStart: 2,
      selectionEnd: 3,
      insertedChars: null,
      inputDirection: 'forward',
    });
  });

  it('typing over a selection whose replacement equals its neighbors keeps the SELECTION as the edit range', () => {
    // "1111" select [1,3) type "1" -> "111": the canonical diff calls this
    // a pure deletion at the END ([3,4), insertedChars null); the actual
    // edit was a replacement — and a mask must see the typed char.
    expect(computeTextEditDiff('1111', '111', { start: 1, end: 3 })).toEqual({
      prevValue: '1111',
      selectionStart: 1,
      selectionEnd: 3,
      insertedChars: '1',
      inputDirection: 'forward',
    });
  });

  it('collapsed-caret insertion inside a repeated run inserts AT the caret', () => {
    // "111-111" caret 2, type "1": canonical prefix would slide the
    // insertion to index 3.
    expect(
      computeTextEditDiff('111-111', '1111-111', { start: 2, end: 2 })
    ).toEqual({
      prevValue: '111-111',
      selectionStart: 2,
      selectionEnd: 2,
      insertedChars: '1',
      inputDirection: 'forward',
    });
  });

  it('a stale selection inconsistent with the edit falls back to the canonical diff', () => {
    // {1,1} cannot explain "abc" -> "c" (neither backspace [0,1) nor
    // forward-delete [1,3) reproduces the result from that caret).
    expect(computeTextEditDiff('abc', 'c', { start: 1, end: 1 })).toEqual({
      prevValue: 'abc',
      selectionStart: 0,
      selectionEnd: 2,
      insertedChars: null,
      inputDirection: 'forward',
    });
  });

  it('an out-of-range selection is clamped before the consistency check', () => {
    expect(computeTextEditDiff('abcd', 'abcde', { start: 9, end: 9 })).toEqual({
      prevValue: 'abcd',
      selectionStart: 4,
      selectionEnd: 4,
      insertedChars: 'e',
      inputDirection: 'forward',
    });
  });

  it('equal-length collapsed-caret replacement (autocorrect shape) uses the canonical diff', () => {
    // delta 0 with a collapsed caret has no single-edit interpretation
    // anchored to the caret; the canonical window is the honest answer.
    expect(computeTextEditDiff('abcd', 'abxd', { start: 3, end: 3 })).toEqual({
      prevValue: 'abcd',
      selectionStart: 2,
      selectionEnd: 3,
      insertedChars: 'x',
      inputDirection: 'forward',
    });
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

  it('repeated-digit backspace produces the EXACT args web createArgs would — caret lands on the deleted slot, not the canonical one', () => {
    const question = createMaskedQuestion('999-999');
    const mask = (question as unknown as { maskInstance: MaskLike })
      .maskInstance;

    // Web reference: backspace at collapsed caret 2 => createArgs yields
    // {selectionStart: 1, selectionEnd: 2, backward}
    // (mask/input_element_adapter.ts:83-89).
    const expected = mask.processInput({
      prevValue: '111-111',
      selectionStart: 1,
      selectionEnd: 2,
      insertedChars: null,
      inputDirection: 'backward',
    });

    // RN observes only the post-edit text "11-111" — ambiguous across all
    // three leading "1"s; the tracked pre-edit caret {2,2} resolves it.
    const result = applyMaskedEdit(
      mask,
      '111-111',
      { start: 2, end: 2 },
      '11-111'
    );
    expect(result).toEqual({
      value: expected.value,
      caretPosition: expected.caretPosition,
    });
    // Regression pin: the canonical prefix/suffix diff would have sent
    // selectionStart 2 and left the caret at 2.
    expect(result.caretPosition).toBe(1);
  });

  it('replacement selection over repeated digits matches the web-args result exactly', () => {
    const question = createMaskedQuestion('999-999');
    const mask = (question as unknown as { maskInstance: MaskLike })
      .maskInstance;

    const expected = mask.processInput({
      prevValue: '111-111',
      selectionStart: 0,
      selectionEnd: 3,
      insertedChars: '9',
      inputDirection: 'forward',
    });
    const result = applyMaskedEdit(
      mask,
      '111-111',
      { start: 0, end: 3 },
      '9-111'
    );
    expect(result).toEqual({
      value: expected.value,
      caretPosition: expected.caretPosition,
    });
  });
});

describe('applyMaskedEdit: post-format maxLength cap (upstream setInputValue semantics)', () => {
  // Web's InputElementAdapter.setInputValue truncates every formatted
  // value to the input's maxLength BEFORE writing it back
  // (mask/input_element_adapter.ts:8-12) — RN's native `maxLength` prop
  // can't do this (it caps the RAW edit before the mask restores
  // literals/placeholders), so the cap lives at this boundary instead.
  function patternMask(): MaskLike {
    const model = new Model({
      elements: [
        {
          type: 'text',
          name: 'q1',
          maskType: 'pattern',
          maskSettings: { pattern: '999-999' },
        },
      ],
    });
    const question = model.getQuestionByName('q1') as unknown as {
      maskInstance: MaskLike;
    };
    return question.maskInstance;
  }

  it('a formatted value expanding past maxLength is truncated; parity with the raw result up to the cap', () => {
    const mask = patternMask();
    const uncapped = mask.processInput({
      prevValue: '',
      selectionStart: 0,
      selectionEnd: 0,
      insertedChars: '1',
      inputDirection: 'forward',
    });
    // "1" formats to "1__-___" (7 chars); a maxLength of 5 caps it.
    const result = applyMaskedEdit(mask, '', { start: 0, end: 0 }, '1', 5);
    expect(uncapped.value.length).toBeGreaterThan(5);
    expect(result.value).toBe(uncapped.value.slice(0, 5));
  });

  it('the caret is clamped into the capped value', () => {
    const mask = patternMask();
    // Appending at the end of an already-capped draft: processInput's
    // caret can land past the cap.
    const result = applyMaskedEdit(
      mask,
      '123-4',
      { start: 5, end: 5 },
      '123-45',
      5
    );
    expect(result.value.length).toBeLessThanOrEqual(5);
    expect(result.caretPosition).toBeLessThanOrEqual(result.value.length);
  });

  it('deletion keeps parity with the raw processInput result up to the cap', () => {
    const mask = patternMask();
    const expected = mask.processInput({
      prevValue: '123-4',
      selectionStart: 4,
      selectionEnd: 5,
      insertedChars: null,
      inputDirection: 'backward',
    });
    const result = applyMaskedEdit(
      mask,
      '123-4',
      { start: 5, end: 5 },
      '123-',
      5
    );
    expect(result.value).toBe(expected.value.slice(0, 5));
    expect(result.caretPosition).toBeLessThanOrEqual(result.value.length);
  });

  it('no maxLength: unbounded (existing behavior unchanged)', () => {
    const mask = patternMask();
    const result = applyMaskedEdit(mask, '', { start: 0, end: 0 }, '1');
    expect(result.value).toBe('1__-___');
  });
});
