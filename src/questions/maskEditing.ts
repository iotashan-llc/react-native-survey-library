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
 * the PRE-edit caret) and turns it into core's `ITextInputParams`. RN's
 * `TextInput.onChangeText` gives none of that — only the POST-edit text.
 * `computeTextEditDiff` reconstructs the same shape from a
 * (prevValue, nextValue, prevSelection) triple via a common-prefix/
 * common-suffix diff (the same family of heuristic every RN masked-input
 * library uses, since RN has no `beforeinput`): the shared prefix/suffix
 * bound the edited range in `prevValue`; whatever's left in `nextValue`
 * between those bounds is `insertedChars` (`null` for a pure deletion,
 * matching DOM `event.data` on delete). Direction (`forward`/`backward`)
 * only matters to a mask's `processInput` when NOTHING was inserted (pure
 * deletion) and can't be recovered from text alone (deleting "d" from
 * "abcdef" at index 3 looks identical whether Backspace or Delete produced
 * it) — `prevSelection` (tracked by the caller via `TextInput.
 * onSelectionChange`, one edit behind) disambiguates: a collapsed cursor
 * sitting at the deleted range's END means Backspace; at its START means
 * Delete-forward. Unknown/ambiguous cases default to `'forward'`, matching
 * `ITextInputParams`'s own default (mask/input_element_adapter.ts
 * `createArgs`: `'backward'` is only ever set explicitly).
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
 * Reconstructs core's `ITextInputParams` from a bare (prevValue, nextValue,
 * prevSelection) triple. `prevSelection` is the selection BEFORE this edit
 * (the caller's last `onSelectionChange` reading, which — because RN fires
 * `onChangeText` before the POST-edit `onSelectionChange` — is still the
 * pre-edit value at call time); pass `null` when none is known yet (first
 * edit of a session).
 */
export function computeTextEditDiff(
  prevValue: string,
  nextValue: string,
  prevSelection: MaskSelection | null
): MaskInputParams {
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
 */
export function applyMaskedEdit(
  mask: MaskLike,
  prevValue: string,
  prevSelection: MaskSelection | null,
  nextValue: string
): MaskInputResult {
  const args = computeTextEditDiff(prevValue, nextValue, prevSelection);
  const result = mask.processInput(args);
  return { value: result.value, caretPosition: result.caretPosition };
}
