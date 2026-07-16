/**
 * Task 1.12 — draft/commit adapter for the select-base "other" item
 * comment input (checkbox/radiogroup's "Other (describe)" free-text
 * field). Sibling to 1.9's `DraftCommitAdapter` (docs/design/
 * 1.9-draft-commit.md) — same draft/commit shape, deliberately NOT reused
 * as a `DraftCommitAdapter` `kind` because the model surface differs
 * (`question.otherValue`, whose backing store is mode-dependent — see
 * verified upstream facts below) and 1.9's adapter is scoped to `value`/
 * `inputValue` only.
 *
 * Verified upstream (survey-core v2.5.33 question_baseselect.ts):
 * - `getOtherTextAreaOptions` (lines ~300-317) wires `onTextAreaInput` ->
 *   `onOtherValueInput` and `onTextAreaChange` -> `onOtherValueChange`,
 *   but — unlike the primary comment/text `getTextAreaOptions` —
 *   deliberately wires NEITHER `onTextAreaFocus` NOR `onTextAreaBlur`. So
 *   this adapter never calls `question.onFocus`/`onBlur` (nothing to
 *   mirror).
 * - `onOtherValueInput` (line 1868): commits only when
 *   `question.isInputTextUpdate` (the same live-read gate 1.9 uses).
 * - `onOtherValueChange` (line 1873): unconditional commit — the
 *   RN mirror is `handleBlur` (web's `<textarea>` `onChange` fires via
 *   `TextAreaModel.onTextAreaBlur`, which calls `onTextAreaChange` FIRST;
 *   see utils/text-area.ts:100-104).
 * - `question.otherValue`'s storage is MODE-DEPENDENT (codex PR-18 review
 *   major 1; question_baseselect.ts:412-438, 507-509): when
 *   `getStoreOthersAsComment()` is true (the default), the getter/setter
 *   are backed by the `comment` property (`setPropertyValue("comment",…)`
 *   — question.ts:1894-1899); when FALSE, they are backed by the
 *   `otherValue` property (`otherValueCore`), with the text ALSO replacing
 *   the "other" slot inside `question.value`. Core's own text area
 *   subscribes to exactly one name via `getCommentPropertyValue(otherItem)`
 *   ("comment" vs "otherValue"), but that mode can change at RUNTIME
 *   (survey-level `storeOthersAsComment` is a live property), so this
 *   adapter subscribes to BOTH names — `syncFromModel` is predicate-guarded
 *   and reads `question.otherValue` (the mode-folding getter), making the
 *   extra subscription a harmless no-op in whichever mode is inactive.
 */
import { Helpers } from '../core/facade';
import type { Question } from '../core/facade';

type OtherValueQuestion = Question & {
  otherValue?: string;
};

export interface OtherCommentDraftAdapterOptions {
  /** A select-base question exposing `otherValue`/`isInputTextUpdate` (checkbox/radiogroup). */
  question: Question;
  /** Fired whenever `renderedValue` changes for any reason (typing or model sync). */
  onRenderedValueChange?: () => void;
}

let nextSubscriptionId = 0;

/**
 * Both possible backing stores for `otherValue` (see header): "comment"
 * when getStoreOthersAsComment() is true, "otherValue" when false. The
 * mode is live-switchable, so both are subscribed for the adapter's
 * lifetime and unregistered together.
 */
const SUBSCRIBED_NAMES = ['comment', 'otherValue'];

export class OtherCommentDraftAdapter {
  private readonly question: OtherValueQuestion;
  private readonly onRenderedValueChange: (() => void) | undefined;
  private readonly subscriptionKey: string;
  private draft: string;
  private disposed = false;

  constructor(options: OtherCommentDraftAdapterOptions) {
    this.question = options.question as OtherValueQuestion;
    this.onRenderedValueChange = options.onRenderedValueChange;
    this.subscriptionKey = `__rnOtherCommentDraft${++nextSubscriptionId}`;
    this.draft = this.formatValue(this.question.otherValue);
    this.question.registerFunctionOnPropertiesValueChanged(
      SUBSCRIBED_NAMES,
      this.syncFromModel,
      this.subscriptionKey
    );
  }

  public get renderedValue(): string {
    return this.draft;
  }

  /** Wire to the "other" comment `TextInput.onChangeText`. */
  public handleChangeText(text: string): void {
    if (this.disposed) return;
    this.setDraft(text);
    if (this.question.isInputTextUpdate) {
      this.commit(text);
    }
  }

  /** Wire to the "other" comment `TextInput.onBlur`. Commits unconditionally (web change-event parity). */
  public handleBlur(): void {
    if (this.disposed) return;
    this.commit(this.draft);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.question.unRegisterFunctionOnPropertiesValueChanged(
      SUBSCRIBED_NAMES,
      this.subscriptionKey
    );
  }

  private syncFromModel = (): void => {
    if (this.disposed) return;
    const modelText = this.question.otherValue;
    if (!Helpers.isTwoValueEquals(modelText, this.draft, false, true, false)) {
      this.setDraft(this.formatValue(modelText));
    }
  };

  private commit(text: string): void {
    if (
      !Helpers.isTwoValueEquals(
        this.question.otherValue,
        text,
        false,
        true,
        false
      )
    ) {
      this.question.otherValue = text;
    }
  }

  private formatValue(value: unknown): string {
    if (Helpers.isValueEmpty(value)) return '';
    return String(value);
  }

  private setDraft(next: string): void {
    if (next === this.draft) return;
    this.draft = next;
    this.onRenderedValueChange?.();
  }
}
