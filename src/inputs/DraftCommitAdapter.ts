/**
 * Task 1.9 — text draft/commit adapter (A5). Design:
 * docs/design/1.9-draft-commit.md — read it first; every rule here mirrors
 * a verified upstream path (survey-core / survey-react-ui v2.5.33,
 * file:line refs in the doc). This class is the controlled-component
 * successor to web's uncontrolled `SurveyQuestionUncontrolledElement`
 * (reactquestion_element.tsx:283-320): RN `TextInput` is controlled
 * (invariant 3), so the DOM input's own text buffer becomes the explicit
 * `draft` owned here.
 *
 * Pure logic: imports only from the facade (survey-core). No react-native,
 * no React. Consumed by 1.10 (text) / 1.11 (comment) components via the
 * 0.4 reactive base — components wire TextInput events to the handle*
 * methods and render `value={adapter.renderedValue}`.
 *
 * The load-bearing rules (all verified upstream, none invented):
 *
 * - Commit timing is `question.isInputTextUpdate`, read LIVE per event
 *   (question.ts:2705-2707) — it folds survey `textUpdateMode` (default
 *   "onBlur"), the per-question override, AND the `isTextValue()` gate
 *   (e.g. inputType "email" stays blur-commit even under "onTyping").
 *   Core has NO debounce in the onTyping path; neither do we.
 *
 * - A commit is core's own guarded write, per question kind:
 *   text → `inputValue` setter (mask pipeline comes free —
 *   question_text.ts:348-367, 722-728); textbase/comment → `value`
 *   (question_comment.ts getTextAreaOptions). Expressions, validation
 *   (checkErrorsMode), onValueChanged, and the onTyping
 *   `locNotification:"text"` auto-advance skip are all model-side
 *   consequences of that write — zero duplication here.
 *
 * - External-change policy mirrors web's `updateDomElement`
 *   (reactquestion_element.tsx:299-309), which has NO focus check: on any
 *   model notification, if the model text stops loosely-equaling the
 *   draft (`Helpers.isTwoValueEquals(model, draft, false, true, false)`),
 *   the draft is overwritten — external writes win even mid-typing.
 *   Self-echo (own commit) loosely-equals the draft, so typing never
 *   clobbers itself; mask/`onValueChanging`-transformed commits DO
 *   rewrite the draft, exactly as web rewrites the DOM buffer.
 *
 * - Focus/blur call the PUBLIC core handlers (`question.onFocus/onBlur`,
 *   question.ts:1639-1652) with a synthetic `{target:{value: draft}}`
 *   event so the visited-empty-field validation arming
 *   (`isFocusEmpty`/`validateVisitedEmptyFields`) keeps web timing. The
 *   draft is committed BEFORE `onBlur` and the synthetic event is built
 *   AFTER that commit (the sync pass may have rewritten the draft to the
 *   transformed text), so the handler's internal `updateValueOnEvent`
 *   no-ops on its equality guard instead of re-committing stale text.
 *
 * Deliberate divergences from web (design doc "Deliberate divergences"):
 * no `inputType:"color"` `_isValueChanged` guard, no `_isWaitingForEnter`
 * IME-keyup dance, no 1ms composition timer — all DOM-event-shape
 * workarounds with no RN equivalent; RN `onChangeText` is the single
 * canonical text signal and delivers IME-composed updates itself.
 */
import { Helpers } from '../core/facade';
import type { Question } from '../core/facade';
import { reportMaskedOnTypingDowngradedOnce } from '../diagnostics';

/**
 * Which model surface a commit writes (and the draft reads).
 * - `'inputValue'`: `QuestionTextModel.inputValue` — the masked-rendering
 *   pipeline (what web's `SurveyQuestionText.getValueCore` reads).
 * - `'value'`: plain `question.value` (comment/textbase — what core's own
 *   `TextAreaModel.getTextValue` reads).
 */
export type DraftCommitKind = 'inputValue' | 'value';

/**
 * Structural view of the question members this adapter touches beyond the
 * `Question` base type. `inputValue` / `updateRemainingCharacterCounter`
 * exist on `QuestionTextModel` / `QuestionTextBase`; both reads are
 * feature-guarded so a bare `Question` (or a future wrapper) degrades
 * gracefully.
 */
type TextLikeQuestion = Question & {
  inputValue?: string;
  updateRemainingCharacterCounter?: (newValue: string) => void;
  /** QuestionTextModel's mask discriminator; `"none"` = no mask. */
  maskType?: string;
  /** QuestionTextBase's per-question override: "default"|"onBlur"|"onTyping". */
  textUpdateMode?: string;
};

/** Which handle* method is attempting the commit. */
export type DraftCommitTrigger = 'typing' | 'blur' | 'submit';

export interface DraftCommitAdapterOptions {
  /** A text-like question (text / comment / textbase descendant). */
  question: Question;
  /**
   * Commit-surface override for wrappers whose type name doesn't reflect
   * the write path (e.g. multipletext items, task 2.6). Default:
   * `question.isDescendantOf('text') ? 'inputValue' : 'value'`.
   */
  kind?: DraftCommitKind;
  /**
   * Fired whenever `renderedValue` changes for ANY reason — typing or
   * model sync. Draft-only changes (onBlur-mode typing) are invisible to
   * the model by design, so the host component re-renders off this, not
   * off the 0.4 base's model subscription.
   */
  onRenderedValueChange?: () => void;
  /**
   * Pre-commit guard seam (1.10, review round 2): maps the draft text to
   * what actually commits, or returns `undefined` to SKIP this commit
   * attempt entirely (no write, no notification — the draft is never
   * touched). Runs on every commit ATTEMPT, before the equality guard.
   *
   * The consumer: date/time plain-text fallback types, where web's
   * native widgets guarantee value-or-empty (`""` on `badInput`) and an
   * unparseable `month` string passed into core's `correctValueType`
   * THROWS (question_text.ts:668-685) — the 1.10 component maps invalid
   * text to `""` at blur/submit and skips mid-typing commits so onTyping
   * mode neither commits garbage nor wipes the in-progress draft via the
   * model-sync pass.
   */
  transformCommitText?: (
    text: string,
    trigger: DraftCommitTrigger
  ) => string | undefined;
  /**
   * Display-shaping seam (1.10, review round 3): maps model text to what
   * the draft RENDERS, applied at construction and on every
   * model-to-draft sync. The consumer: masked questions' post-format
   * maxLength cap — upstream truncates in `setInputValue` during adapter
   * construction and mask-property updates (input_element_adapter.ts:
   * 19-26,33-37), not only on edits, so the edit-path cap alone leaves
   * default/externally-written values uncapped.
   */
  formatDisplayText?: (text: string) => string;
}

/**
 * Instance-unique registration keys: two adapters must never clobber each
 * other's `registerFunctionOnPropertiesValueChanged` slot on a shared
 * question (core replaces the handler when name+key match).
 */
let nextSubscriptionId = 0;

export class DraftCommitAdapter {
  private readonly question: TextLikeQuestion;
  private readonly kind: DraftCommitKind;
  private readonly onRenderedValueChange: (() => void) | undefined;
  private readonly transformCommitText:
    | ((text: string, trigger: DraftCommitTrigger) => string | undefined)
    | undefined;
  private readonly formatDisplayText: ((text: string) => string) | undefined;
  private readonly subscribedNames: string[];
  private readonly subscriptionKey: string;
  private draft: string;
  private editing = false;
  private disposed = false;

  constructor(options: DraftCommitAdapterOptions) {
    this.question = options.question as TextLikeQuestion;
    this.kind =
      options.kind ??
      (this.question.isDescendantOf('text') ? 'inputValue' : 'value');
    this.onRenderedValueChange = options.onRenderedValueChange;
    this.transformCommitText = options.transformCommitText;
    this.formatDisplayText = options.formatDisplayText;
    this.subscriptionKey = `__rnDraftCommit${++nextSubscriptionId}`;
    this.draft = this.formatValue(this.readModelText());
    // The same public seam core's own TextAreaModel uses (text-area.ts:
    // 76-78). "value" backs Question.value (question.ts:1888-1893);
    // "_inputValue" is QuestionTextModel's masked-rendering @property —
    // it updates AFTER the "value" notification inside the same
    // synchronous call (question.ts:2834-2843), so the second firing
    // corrects the rendering; syncFromModel is idempotent.
    this.subscribedNames =
      this.kind === 'inputValue' ? ['value', '_inputValue'] : ['value'];
    this.question.registerFunctionOnPropertiesValueChanged(
      this.subscribedNames,
      this.syncFromModel,
      this.subscriptionKey
    );
  }

  /** The controlled `TextInput` value — always the draft (kept model-synced while idle). */
  public get renderedValue(): string {
    return this.draft;
  }

  /** True between handleFocus and handleBlur. Informational (the sync policy does NOT branch on it — web doesn't either). */
  public get isEditing(): boolean {
    return this.editing;
  }

  /** Wire to `TextInput.onChangeText`. */
  public handleChangeText(text: string): void {
    if (this.disposed) return;
    this.setDraft(text);
    // Web updates the counter on every keystroke in both modes
    // (question_text.ts:748,763; question_comment.ts onInput).
    this.question.updateRemainingCharacterCounter?.(text);
    if (this.hasActiveMask()) {
      // Masked questions are blur-commit ONLY. Core already enforces this
      // model-side on every platform (QuestionTextModel.
      // getIsInputTextUpdate returns false whenever a mask is active —
      // question_text.ts:619-621), so `isInputTextUpdate` below can never
      // be true here today; this explicit gate makes the 1.9 contract
      // independent of that core internal, and the once-per-question
      // diagnostic tells a host that asked for onTyping WHY typing isn't
      // committing live. Per-keystroke mask formatting (core's
      // InputElementAdapter role: processInput + selection management) is
      // 1.10's component concern.
      if (this.isOnTypingRequested()) {
        reportMaskedOnTypingDowngradedOnce(this.question, {
          code: 'masked-on-typing-downgraded',
          questionType: this.question.getType(),
          name: this.question.name,
          maskType: this.question.maskType ?? '',
        });
      }
      return;
    }
    if (this.question.isInputTextUpdate) {
      this.commit(text, 'typing');
    }
  }

  /** Wire to `TextInput.onFocus`. */
  public handleFocus(): void {
    if (this.disposed) return;
    this.editing = true;
    // Arms visited-empty-field validation (isFocusEmpty, question.ts:
    // 1650-1652) and, for text, refreshes the counter.
    this.question.onFocus(this.syntheticEvent());
  }

  /** Wire to `TextInput.onBlur`. Commits in BOTH modes (web blur parity). */
  public handleBlur(): void {
    if (this.disposed) return;
    this.commit(this.draft, 'blur');
    // Built AFTER the commit, from the MODEL (see syntheticEvent): the
    // handler's internal updateValueOnEvent must see the settled value
    // and no-op — committing is exclusively this.commit's job.
    this.question.onBlur(this.syntheticEvent());
    this.editing = false;
  }

  /**
   * Wire to `TextInput.onSubmitEditing`. Web parity: Enter keyup commits
   * in BOTH modes (question_text.ts:749-764).
   */
  public handleSubmitEditing(): void {
    if (this.disposed) return;
    this.commit(this.draft, 'submit');
  }

  /** Unregisters the model subscription (mirrors TextAreaModel.dispose). */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.question.unRegisterFunctionOnPropertiesValueChanged(
      this.subscribedNames,
      this.subscriptionKey
    );
  }

  /**
   * The updateDomElement mirror (reactquestion_element.tsx:299-309), with
   * `draft ≡ control.value`: overwrite the draft whenever the model text
   * stops loosely-equaling it — focused or not. Loose equality is web's
   * exact predicate (`false, true, false` = keep order, case-sensitive,
   * no trim, numbers ↔ numeric strings equal), so a numeric model value
   * never clobbers its own string draft, and a self-echo never moves it.
   */
  private syncFromModel = (): void => {
    if (this.disposed) return;
    const modelText = this.readModelText();
    if (!Helpers.isTwoValueEquals(modelText, this.draft, false, true, false)) {
      this.setDraft(this.formatValue(modelText));
    }
  };

  /**
   * Core's own guarded commit, per kind:
   * - text: `if (!baseEquals(value, text)) inputValue = text` — mirrors
   *   `QuestionTextModel.updateValueOnEvent` (question_text.ts:722-728);
   *   base equality is `doNotConvertNumbers: true` (base.ts:1627-1634).
   * - value: `if (!Helpers.isTwoValueEquals(value, text, false, true,
   *   false)) value = text` — mirrors comment's `updateQuestionValue`
   *   (question_comment.ts getTextAreaOptions).
   */
  private commit(rawText: string, trigger: DraftCommitTrigger): void {
    let text = rawText;
    if (this.transformCommitText) {
      const transformed = this.transformCommitText(rawText, trigger);
      if (transformed === undefined) return; // guard says: skip this attempt
      text = transformed;
    }
    const question = this.question;
    if (this.kind === 'inputValue') {
      const equal = Helpers.checkIfValuesEqual(question.value, text, {
        ignoreOrder: false,
        caseSensitive: true,
        trimStrings: false,
        doNotConvertNumbers: true,
      });
      if (!equal) {
        question.inputValue = text;
      }
    } else {
      if (!Helpers.isTwoValueEquals(question.value, text, false, true, false)) {
        question.value = text;
      }
    }
  }

  private hasActiveMask(): boolean {
    return (
      this.kind === 'inputValue' &&
      typeof this.question.maskType === 'string' &&
      this.question.maskType !== 'none'
    );
  }

  /**
   * What the host ASKED for (as opposed to `isInputTextUpdate`, the
   * effective mode after core's gates): the question-level override wins,
   * else the survey default (question_textbase.ts:74-78 resolution order).
   * Used only to decide whether the masked-downgrade diagnostic applies.
   */
  private isOnTypingRequested(): boolean {
    const mode = this.question.textUpdateMode;
    if (mode === 'onTyping') return true;
    if (mode === 'onBlur') return false;
    const survey = this.question.survey as {
      isUpdateValueTextOnTyping?: boolean;
    } | null;
    return survey?.isUpdateValueTextOnTyping === true;
  }

  private readModelText(): unknown {
    return this.kind === 'inputValue'
      ? this.question.inputValue
      : this.question.value;
  }

  /** Web's `getValue` + DOM string coercion: empty → "", else String(v). */
  private formatValue(value: unknown): string {
    const text = Helpers.isValueEmpty(value) ? '' : String(value);
    return this.formatDisplayText ? this.formatDisplayText(text) : text;
  }

  private setDraft(next: string): void {
    if (next === this.draft) return;
    this.draft = next;
    this.onRenderedValueChange?.();
  }

  /**
   * The DOM-event shape core's public handlers destructure
   * (`event.target.value`; `validationMessage` reads as undefined, which
   * the date-validation path tolerates). The value is the SETTLED MODEL
   * text, not the draft: core's `onBlurCore` runs its own
   * `updateValueOnEvent(event)` (question_text.ts:820-825), and a
   * model-equal value makes that a guaranteed equality no-op. Feeding the
   * draft instead would let that internal path COMMIT it — normally
   * harmless (post-commit the two loosely agree), but a commit-guard
   * skip/rewrite (`transformCommitText`) leaves draft ≠ model on purpose,
   * and the guarded text must not sneak into the model through core's
   * blur handler.
   */
  private syntheticEvent(): { target: { value: string } } {
    return { target: { value: this.formatValue(this.readModelText()) } };
  }
}
