/**
 * Task 1.10 — the RN analog of web's `InputElementAdapter`
 * (mask/input_element_adapter.ts). Design: docs/design/1.9-draft-commit.md
 * ("Masked questions: the draft lives in MASKED space, and commits are
 * blur-only" + "Cursor/selection acknowledgment") explicitly defers this
 * work to 1.10: "per-keystroke mask formatting of `TextInput` text is
 * 1.10's component concern (its analog of `InputElementAdapter`, via
 * `maskInstance.processInput` + selection management)".
 *
 * Web's `InputElementAdapter` gets a rich DOM `beforeinput` event
 * (`event.data`, `event.inputType`, `selectionStart/End` already reflecting
 * the PRE-edit caret) and turns it into core's `ITextInputParams`
 * (`createArgs`, mask/input_element_adapter.ts:76-96). RN's
 * `TextInput.onChangeText` gives none of that — only the POST-edit text.
 * `computeTextEditDiff` reconstructs the same shape from a
 * (prevValue, nextValue, prevSelection) triple.
 *
 * The PRE-EDIT SELECTION is authoritative wherever it can be (review
 * round 2): a bare common-prefix/common-suffix diff cannot tell WHICH of
 * several identical characters an edit touched — deleting either "1" of
 * "1123" yields the same "123", but web's `createArgs` would send
 * different `selectionStart/End` for the two edits, and a mask's caret
 * placement depends on it. So each edit is first interpreted THROUGH the
 * tracked selection (`prevSelection`, the caller's last
 * `onSelectionChange` reading — still pre-edit at `onChangeText` time
 * because RN fires the post-edit selection event afterwards), mirroring
 * `createArgs` shapes exactly:
 *  - non-collapsed [s,e): a replacement of that range (typed text or
 *    deletion);
 *  - collapsed caret P, shorter text: Backspace ([P-d,P), `backward`) or
 *    forward-Delete ([P,P+d), `forward`);
 *  - collapsed caret P, longer text: an insertion at P.
 * An interpretation is used only when replaying it over `prevValue`
 * reproduces `nextValue` EXACTLY — stale or inconsistent selections (the
 * reading is one edit behind by construction) fail that check and fall
 * back to the canonical prefix/suffix diff, which remains correct
 * whenever the edit is textually unambiguous. Direction defaults to
 * `'forward'`, matching `ITextInputParams` (`'backward'` is only ever set
 * explicitly, exactly like `createArgs`).
 *
 * `MaskLike`/`MaskInputParams` are LOCAL structural types — deliberately
 * not imported from survey-core: `IInputMask`/`ITextInputParams`
 * (mask/mask_utils.ts) are not part of the public package entry (verified:
 * absent from every `node_modules/survey-core/typings/entries/**`
 * barrel), only reachable as an unexported type on
 * `QuestionTextModel.maskInstance`'s return position. TypeScript's
 * structural typing makes a same-shaped local interface assignable
 * without needing that name, and callers pass `question.maskInstance`
 * (inferred, unnamed) straight through the `MaskLike` parameter.
 */

export interface MaskSelection {
  start: number;
  end: number;
}

/** Structural mirror of survey-core's `ITextInputParams` (mask/mask_utils.ts). */
export interface MaskInputParams {
  prevValue: string;
  selectionStart: number;
  selectionEnd: number;
  insertedChars: string | null;
  inputDirection?: 'forward' | 'backward';
}

/** Structural mirror of survey-core's `IMaskedInputResult` (mask/mask_utils.ts). */
export interface MaskInputResult {
  value: string;
  caretPosition: number;
}

/** Structural mirror of survey-core's `IInputMask` (mask/mask_utils.ts) — only the member this module calls. */
export interface MaskLike {
  processInput(args: MaskInputParams): {
    value: string;
    caretPosition: number;
    cancelPreventDefault?: boolean;
  };
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLength(a: string, b: string, maxLen: number): number {
  let j = 0;
  while (j < maxLen && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return j;
}

/**
 * Tries to interpret the (prevValue -> nextValue) edit as an operation
 * anchored at the pre-edit selection, mirroring web `createArgs` shapes.
 * Returns `null` when no anchored interpretation reproduces `nextValue`
 * exactly (stale selection, or an edit shape — e.g. autocorrect — with no
 * caret-anchored single-edit reading).
 */
function interpretEditAtSelection(
  prevValue: string,
  nextValue: string,
  prevSelection: MaskSelection
): MaskInputParams | null {
  const clamp = (n: number): number =>
    Math.max(0, Math.min(n, prevValue.length));
  const s = clamp(Math.min(prevSelection.start, prevSelection.end));
  const e = clamp(Math.max(prevSelection.start, prevSelection.end));
  const delta = nextValue.length - prevValue.length;

  const matches = (start: number, end: number, inserted: string): boolean =>
    prevValue.slice(0, start) + inserted + prevValue.slice(end) === nextValue;

  if (s !== e) {
    // Replacement of the selected range (typed text, or plain deletion).
    const insertedLen = delta + (e - s);
    if (insertedLen >= 0) {
      const inserted = nextValue.slice(s, s + insertedLen);
      if (matches(s, e, inserted)) {
        return {
          prevValue,
          selectionStart: s,
          selectionEnd: e,
          insertedChars: insertedLen > 0 ? inserted : null,
          inputDirection: 'forward',
        };
      }
    }
    return null;
  }

  if (delta < 0) {
    const d = -delta;
    // Backspace: deletes [P-d, P) — web createArgs widens a collapsed
    // deleteContentBackward to selectionStart-1. Checked FIRST: inside a
    // repeated-character run both readings can fit the text, and RN can't
    // see the key — backspace wins the tie because mobile soft keyboards
    // effectively have no forward-delete.
    if (s - d >= 0 && matches(s - d, s, '')) {
      return {
        prevValue,
        selectionStart: s - d,
        selectionEnd: s,
        insertedChars: null,
        inputDirection: 'backward',
      };
    }
    // Forward delete: deletes [P, P+d) — createArgs widens
    // deleteContentForward to selectionEnd+1.
    if (s + d <= prevValue.length && matches(s, s + d, '')) {
      return {
        prevValue,
        selectionStart: s,
        selectionEnd: s + d,
        insertedChars: null,
        inputDirection: 'forward',
      };
    }
    return null;
  }

  if (delta > 0) {
    // Insertion at the caret.
    const inserted = nextValue.slice(s, s + delta);
    if (matches(s, s, inserted)) {
      return {
        prevValue,
        selectionStart: s,
        selectionEnd: s,
        insertedChars: inserted,
        inputDirection: 'forward',
      };
    }
    return null;
  }

  // delta === 0 with a collapsed caret: no caret-anchored single-edit
  // interpretation (an equal-length replacement — autocorrect — has no
  // anchor here); the canonical diff handles it.
  return null;
}

/**
 * Reconstructs core's `ITextInputParams` from a bare (prevValue, nextValue,
 * prevSelection) triple. `prevSelection` is the selection BEFORE this edit
 * (the caller's last `onSelectionChange` reading, which — because RN fires
 * `onChangeText` before the POST-edit `onSelectionChange` — is still the
 * pre-edit value at call time); pass `null` when none is known yet (first
 * edit of a session). A consistent pre-edit selection is AUTHORITATIVE
 * (repeated-character edits are textually ambiguous); the prefix/suffix
 * diff below is the fallback for unknown/stale selections.
 */
export function computeTextEditDiff(
  prevValue: string,
  nextValue: string,
  prevSelection: MaskSelection | null
): MaskInputParams {
  if (prevSelection) {
    const anchored = interpretEditAtSelection(
      prevValue,
      nextValue,
      prevSelection
    );
    if (anchored) return anchored;
  }
  const prefixLen = commonPrefixLength(prevValue, nextValue);
  const maxSuffix = Math.min(
    prevValue.length - prefixLen,
    nextValue.length - prefixLen
  );
  const suffixLen = commonSuffixLength(prevValue, nextValue, maxSuffix);
  const selectionStart = prefixLen;
  const selectionEnd = prevValue.length - suffixLen;
  const insertedSlice = nextValue.slice(
    prefixLen,
    nextValue.length - suffixLen
  );
  const insertedChars = insertedSlice.length > 0 ? insertedSlice : null;

  let inputDirection: 'forward' | 'backward' = 'forward';
  if (
    !insertedChars &&
    prevSelection &&
    prevSelection.start === prevSelection.end
  ) {
    if (prevSelection.start === selectionEnd) {
      inputDirection = 'backward';
    } else if (prevSelection.start === selectionStart) {
      inputDirection = 'forward';
    }
  }

  return {
    prevValue,
    selectionStart,
    selectionEnd,
    insertedChars,
    inputDirection,
  };
}

/**
 * Runs the mask's `processInput` (core's own formatting logic — no
 * re-implementation here, per A5) over the computed diff and returns just
 * the two fields the component needs: the new mask-shaped text (fed to the
 * draft/commit adapter's `handleChangeText`, keeping the draft in MASKED
 * space per the 1.9 design) and the caret position to restore via
 * `TextInput`'s controlled `selection` prop.
 *
 * `maxLength` applies web's post-format display-length cap
 * (`InputElementAdapter.setInputValue`, mask/input_element_adapter.ts:
 * 8-12): `processInput` can restore literals/placeholders past the raw
 * edit's length, and the formatted value must be truncated at the native
 * boundary — the DOM does this via the element's own `maxLength`; RN's
 * `maxLength` prop can't (it caps the RAW edit BEFORE formatting), so the
 * component omits the native prop for masked inputs and the cap lives
 * here. The caret is clamped into the capped value (the DOM clamps
 * `setSelectionRange` implicitly).
 */
export function applyMaskedEdit(
  mask: MaskLike,
  prevValue: string,
  prevSelection: MaskSelection | null,
  nextValue: string,
  maxLength?: number
): MaskInputResult {
  const args = computeTextEditDiff(prevValue, nextValue, prevSelection);
  const result = mask.processInput(args);
  let value = result.value;
  let caretPosition = result.caretPosition;
  if (maxLength !== undefined && maxLength >= 0 && value.length > maxLength) {
    value = value.slice(0, maxLength);
  }
  caretPosition = Math.max(0, Math.min(caretPosition, value.length));
  return { value, caretPosition };
}
