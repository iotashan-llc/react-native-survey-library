/**
 * Task 1.12 — draft/commit adapter for the select-base "other" item
 * comment input (checkbox/radiogroup's "Other (describe)" free-text
 * field). Sibling to 1.9's `DraftCommitAdapter` (docs/design/
 * 1.9-draft-commit.md) — same draft/commit shape, deliberately NOT reused
 * as a `DraftCommitAdapter` `kind` because the model surface differs
 * (`question.otherValue`, backed by the `comment` property — see
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
 * - `question.otherValue` getter/setter (question_baseselect.ts:412-434)
 *   is backed by `question.comment` (a `setPropertyValue("comment", …)`
 *   write — question.ts:1894-1899), so subscribing to the `"comment"`
 *   property name via `registerFunctionOnPropertiesValueChanged` mirrors
 *   1.9's `"value"` subscription for the primary adapter.
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
      ['comment'],
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
      ['comment'],
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
