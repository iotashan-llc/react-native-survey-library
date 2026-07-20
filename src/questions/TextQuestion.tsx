/**
 * Task 1.10 — the `text` question: all 13 `inputType`s -> native
 * renderers/fallbacks, masks, min/max/step, maxLength (A5). Design:
 * docs/design/1.9-draft-commit.md (the DraftCommitAdapter this component
 * wires — commit timing, external-write sync, masked-blur-only policy are
 * ALL that adapter's contract, not re-derived here) +
 * docs/design/1.2-lifecycle-bridge.md ("question.focusIn() ... in web this
 * is driven by a DOM focus-bubble handler; the RN bridge must call it on
 * native focus") + docs/design/0.7-theme-rn.md / 0.7-metrics-fixture.md
 * (the `input` recipe, consumed via `selectInputStyles`).
 *
 * Component responsibilities beyond the adapter (1.9 explicitly defers
 * these here):
 * - `inputType` -> RN `TextInput` props (inputTypeMapping.ts).
 * - Per-keystroke mask formatting + caret restoration (maskEditing.ts) —
 *   the RN analog of web's `InputElementAdapter`: `onChangeText` gives
 *   only the post-edit text, so `computeTextEditDiff` reconstructs core's
 *   `ITextInputParams` from (prevValue, nextValue, lastKnownSelection),
 *   `question.maskInstance.processInput` reuses core's OWN mask logic
 *   (masks are never reimplemented — A5), and the result feeds the
 *   adapter's `handleChangeText` (keeping the draft in MASKED space, per
 *   the 1.9 design) plus a controlled `selection` prop restoring the
 *   caret core's mask says it should be at.
 * - maxLength/placeholder/autocomplete/readOnly/error styling from the
 *   model.
 * - The character counter (web's `CharacterCounterComponent` —
 *   `question.characterCounter` is a SEPARATE reactive `Base`; subscribed
 *   here via `getStateElements()`, since `QuestionElementBase`'s inherited
 *   `getStateElement()` only covers the question itself).
 *
 * `min`/`max`/`step`/`renderedMin`/`renderedMax`/`renderedStep` have no RN
 * `TextInput` equivalent (they're HTML attribute-level native-validation-UI
 * hints with no native-mobile-widget analog for a plain text field) — core
 * still enforces the underlying min/max/step VALUE validation at commit
 * time (`onCheckForErrors`; isValueLessMin/isValueGreaterMax/
 * isStepNumberIncorrect), unaffected by whether the browser also renders a
 * spinner/slider affordance. Documented in docs/DIFFERENCES.md.
 */
import * as React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { TextInputSelectionChangeEvent } from 'react-native';
import type { Base, Question, QuestionTextModel } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import type { SurveyElementBaseState } from '../reactivity/SurveyElementBase';
import { DraftCommitAdapter } from '../inputs/DraftCommitAdapter';
import { applyMaskedEdit } from './maskEditing';
import type { MaskSelection, MaskLike } from './maskEditing';
import {
  isDateTimeFallbackType,
  isDateTimeFallbackTextValid,
} from './dateTimeFallback';
import { reportDateTimeFallbackInvalidDiscardedOnce } from '../diagnostics';
import { mapInputTypeToRNProps, mapAutoComplete } from './inputTypeMapping';
import { composeStyles } from '../theme-rn/recipes/types';
import { selectInputStyles } from '../theme-rn/recipes/input';
import type { InputCounterSize } from '../theme-rn/recipes/input';
import { buildBodyTextStyle } from '../theme-rn/recipes/bodyText';

export type TextQuestionProps = QuestionElementBaseProps;

interface TextQuestionState extends SurveyElementBaseState {
  controlledSelection?: MaskSelection;
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
});

export class TextQuestion extends QuestionElementBase<
  TextQuestionProps,
  TextQuestionState
> {
  private adapter: DraftCommitAdapter;
  /** The question the CURRENT `adapter` is bound to — recreation trigger on prop swap (mirrors 0.4's model-swap pattern). */
  private adapterQuestion: Question;
  /**
   * The selection BEFORE the in-flight edit — tracked from
   * `onSelectionChange`, which (RN fires it AFTER `onChangeText` settles)
   * still holds the pre-edit value at the time the next `onChangeText`
   * fires. `null` until the first selection reading arrives.
   */
  private lastKnownSelection: MaskSelection | null = null;
  /**
   * `React.ElementRef<typeof TextInput>`, not the `TextInput` class type
   * itself: RN's New-Arch codegen gives the `ref` callback prop a
   * distinct internal instance type (`_TextInputInstance`) that isn't
   * nominally identical to the exported `TextInput` class — `ElementRef`
   * resolves to whatever that actual accepted type is.
   */
  private nativeInputRef: React.ElementRef<typeof TextInput> | null = null;

  constructor(props: TextQuestionProps) {
    super(props);
    this.state = {};
    this.adapterQuestion = props.question;
    this.adapter = this.createAdapter(props.question);
  }

  private createAdapter(question: Question): DraftCommitAdapter {
    return new DraftCommitAdapter({
      question,
      // Draft-only changes (onBlur-mode typing, masked live formatting)
      // are invisible to the model subscription below — this is the
      // adapter's dedicated re-render seam (design: 1.9-draft-commit.md
      // "Draft change notifications").
      onRenderedValueChange: () => this.forceUpdate(),
      // Post-format maxLength cap for masked DISPLAY text on construction
      // and model-to-draft sync — upstream setInputValue truncates there
      // too (input_element_adapter.ts:19-26,33-37); the edit path applies
      // the same cap inside applyMaskedEdit (handleChangeText).
      formatDisplayText: (text) => {
        const q = question as unknown as QuestionTextModel;
        if (!this.hasActiveMask(q)) return text;
        const maxLength = this.resolveMaxLength(q);
        return maxLength !== undefined && text.length > maxLength
          ? text.slice(0, maxLength)
          : text;
      },
      // Pre-commit guard for the date/time plain-text fallback types
      // (dateTimeFallback.ts). Web's native widgets guarantee
      // value-or-empty ("" on badInput) — and for `month`, core's own
      // `correctValueType` THROWS on unparseable text (question_text.ts:
      // 668-685; `datetime-local` does too under settings.storeUtcDates),
      // so invalid text must never reach the model:
      // - typing: SKIP the commit (an in-progress partial like "2024-0"
      //   isn't an error yet, and a ""-commit would let the model-sync
      //   pass wipe the user's draft mid-edit under onTyping);
      // - blur/submit: commit "" (web parity — the DOM reads "" while
      //   badInput), with the once-per-question diagnostic for the types
      //   that get no core error surface (time/month/week; see
      //   syncDateValidationMessage for why date/datetime-local do).
      transformCommitText: (text, trigger) => {
        const q = question as unknown as QuestionTextModel;
        const inputType = q.inputType || 'text';
        if (!isDateTimeFallbackType(inputType)) return text;
        if (this.hasActiveMask(q)) return text; // the mask owns the text shape
        if (isDateTimeFallbackTextValid(inputType, text)) return text;
        if (trigger === 'typing') return undefined;
        if (inputType !== 'date' && inputType !== 'datetime-local') {
          reportDateTimeFallbackInvalidDiscardedOnce(question, {
            code: 'datetime-fallback-invalid-discarded',
            questionType: question.getType(),
            name: question.name,
            inputType,
          });
        }
        return '';
      },
    });
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    if (this.props.question !== this.adapterQuestion) {
      this.adapter.dispose();
      this.adapterQuestion = this.props.question;
      this.adapter = this.createAdapter(this.props.question);
      this.lastKnownSelection = null;
      this.setState({ controlledSelection: undefined });
    }
  }

  componentWillUnmount(): void {
    super.componentWillUnmount();
    this.adapter.dispose();
  }

  /**
   * Subscribes the question AND its separate `characterCounter` Base
   * (web's `CharacterCounterComponent` does the same via its own
   * `getStateElement`) — `QuestionElementBase`'s default `getStateElement`
   * only covers the question itself.
   */
  protected getStateElements(): Base[] {
    const question = this.questionBase as unknown as {
      characterCounter?: Base;
    };
    const elements: Base[] = [this.questionBase];
    if (question.characterCounter) elements.push(question.characterCounter);
    return elements;
  }

  private hasActiveMask(question: QuestionTextModel): boolean {
    return !!question.maskType && question.maskType !== 'none';
  }

  private handleChangeText = (text: string): void => {
    const question = this.questionBase as unknown as QuestionTextModel;
    if (this.hasActiveMask(question)) {
      const prevValue = this.adapter.renderedValue;
      const mask = question.maskInstance as unknown as MaskLike;
      const result = applyMaskedEdit(
        mask,
        prevValue,
        this.lastKnownSelection,
        text,
        // Web's post-format display-length cap (InputElementAdapter.
        // setInputValue) — the native maxLength prop is OMITTED for
        // masked inputs (see renderElement), so this is the only cap.
        this.resolveMaxLength(question)
      );
      this.lastKnownSelection = {
        start: result.caretPosition,
        end: result.caretPosition,
      };
      if (result.value !== text) {
        // The mask reshaped the edit — restore the caret core computed,
        // for exactly ONE frame (released again in handleSelectionChange).
        // When the mask accepted the native edit verbatim there is
        // nothing to restore, and leaving `selection` untouched keeps the
        // input native-owned: RN 0.86 exposes no composition events
        // (web's keyCode-229/compositionupdate guards have no analog), so
        // never fighting the native caret outside an actual reformat is
        // the closest available IME-composition guard. Documented in
        // docs/DIFFERENCES.md.
        this.setState({ controlledSelection: this.lastKnownSelection });
      }
      // Blur-commit-only for masked questions is the ADAPTER's contract
      // (hasActiveMask() there, independent of this component) — this
      // call only supplies the properly mask-shaped draft; it never
      // re-decides commit timing.
      this.adapter.handleChangeText(result.value);
    } else {
      // Stamped BEFORE the adapter runs: a VALID onTyping commit (truthy
      // setNewValue) then clears the message core-side; an INVALID one is
      // skipped by the commit guard and leaves it set.
      this.syncDateValidationMessage(question, text);
      this.adapter.handleChangeText(text);
    }
  };

  private handleSelectionChange = (
    event: TextInputSelectionChangeEvent
  ): void => {
    this.lastKnownSelection = {
      start: event.nativeEvent.selection.start,
      end: event.nativeEvent.selection.end,
    };
    // One-shot release of the masked caret restoration: as soon as the
    // native layer reports ANY selection after a forced frame, control
    // returns to it. The input is never left permanently
    // selection-controlled (IME safety — see handleChangeText).
    if (this.state.controlledSelection) {
      this.setState({ controlledSelection: undefined });
    }
  };

  /** `getMaxLength()` returns null when unlimited. */
  private resolveMaxLength(question: QuestionTextModel): number | undefined {
    const raw = question.getMaxLength();
    return typeof raw === 'number' && raw > 0 ? raw : undefined;
  }

  /**
   * The RN replacement for the browser-computed `validationMessage` web
   * feeds core through `onKeyUp` (question_text.ts:749-766): for core's
   * `isDateInputType` set (`date`/`datetime-local` only —
   * question_text.ts:570-572) the format verdict on what the user TYPED
   * is stamped into `dateValidationMessage` through that same PUBLIC
   * handler, and core's own `onCheckForErrors` then surfaces it as a
   * validation error (question_text.ts:496-498). The synthetic event's
   * `target.value` is the SETTLED model text, never the draft: core's
   * internal `updateValueOnEvent` equality-guards against the model, so
   * this call can never commit anything — commits stay the adapter's job
   * (invariant 3). `time`/`month`/`week` have no core seam
   * (`isDateInputType` excludes them; `updateDateValidationMessage`
   * no-ops): their invalid input is discarded by the adapter's commit
   * guard with a structured diagnostic instead. Masked questions are
   * exempt — the mask owns the text shape.
   */
  private syncDateValidationMessage(
    question: QuestionTextModel,
    typedText: string
  ): void {
    const inputType = question.inputType || 'text';
    if (inputType !== 'date' && inputType !== 'datetime-local') return;
    if (this.hasActiveMask(question)) return;
    const valid = isDateTimeFallbackTextValid(inputType, typedText);
    const modelValue = question.inputValue as unknown;
    const settled =
      modelValue === undefined || modelValue === null ? '' : String(modelValue);
    question.onKeyUp({
      keyCode: 0,
      target: {
        value: settled,
        validationMessage: valid ? '' : question.invalidInputErrorText,
      },
    });
  }

  private handleFocus = (): void => {
    this.adapter.handleFocus();
    // RN replacement for web's DOM focus-bubble handler (design:
    // docs/design/1.2-lifecycle-bridge.md — "question.focusIn() ... in
    // web this is driven by a DOM focus-bubble handler; the RN bridge
    // must call it on native focus"). A plain, always-safe public core
    // API call, independent of the 1.2 lifecycle registry (not yet on
    // this branch) — fires `onFocusInQuestion` and sets
    // `survey.lastActiveQuestion`.
    this.questionBase.focusIn();
    // Focused-style change (recipe legal state) alone doesn't touch the
    // model or the draft, so neither the inherited model subscription nor
    // the adapter's onRenderedValueChange would re-render for it.
    this.forceUpdate();
  };

  private handleBlur = (): void => {
    const question = this.questionBase as unknown as QuestionTextModel;
    const typedText = this.adapter.renderedValue;
    this.adapter.handleBlur();
    // Stamped AFTER the adapter: core's own onBlurCore clears
    // dateValidationMessage (the adapter's synthetic blur event carries
    // no validationMessage) and a truthy commit clears it via setNewValue
    // — the RN-side verdict on what was typed must land last to survive
    // until validation runs.
    this.syncDateValidationMessage(question, typedText);
    this.lastKnownSelection = null;
    this.setState({ controlledSelection: undefined });
    this.forceUpdate();
  };

  private handleSubmitEditing = (): void => {
    const question = this.questionBase as unknown as QuestionTextModel;
    const typedText = this.adapter.renderedValue;
    this.adapter.handleSubmitEditing();
    // Same post-commit ordering rationale as handleBlur.
    this.syncDateValidationMessage(question, typedText);
  };

  private setInputRef = (
    instance: React.ElementRef<typeof TextInput> | null
  ): void => {
    this.nativeInputRef = instance;
    this.setNativeElement(instance);
  };

  /**
   * `ElementHandle`-shaped focus method (design:
   * docs/design/1.2-lifecycle-bridge.md, `ElementHandle.focusFirst`) —
   * ready for the 1.2 lifecycle bridge's registry to call once it lands on
   * this branch (`src/lifecycle/registry.ts` doesn't exist here yet, so
   * there is nothing to register WITH); exposed now so that integration is
   * additive, not a TextQuestion change. Returns whether focus was
   * requested (`TextInput.focus()` has no synchronous success signal).
   */
  public focusFirst = (): boolean => {
    if (!this.nativeInputRef) return false;
    // Under the strict-API generated types (tsconfig customCondition
    // `react-native-strict-api`), `ElementRef<typeof TextInput>` is
    // `TextInputInstance extends ReactNativeElement`, which declares
    // `focus()` directly — no cast needed.
    this.nativeInputRef.focus();
    return true;
  };

  protected renderElement(): React.JSX.Element {
    const question = this.questionBase as unknown as QuestionTextModel;
    const { recipes, styles: overrides, mode, resolved } = this.themeContext;

    // Read-only plain-text mode (web's `isReadOnlyRenderDiv()` —
    // question_text.ts: `isReadOnly && settings.readOnly.textRenderMode ===
    // "div"`). Web renders the committed value inside a bare `<div>`
    // (reactquestion_text.tsx `renderInput`); the RN analog is a plain
    // `Text` with the value — never a disabled `TextInput`. The text
    // question's value is user-entered plain text (never a
    // `LocalizableString`), so it renders directly through `inputValue`
    // (web parity — the masked display value when a mask is active),
    // not through the LocString viewer.
    if (question.isReadOnlyRenderDiv()) {
      const value = question.inputValue;
      // Chrome-free, but theme-styled: RN text has no CSS inheritance, so
      // the plain read-only Text carries the shared body-text foreground/
      // typography explicitly (codex FIX 2) — no border/padding chrome.
      return (
        <Text
          testID={`${question.name}-readonly-text`}
          style={buildBodyTextStyle(resolved)}
        >
          {value == null ? '' : String(value)}
        </Text>
      );
    }

    const inputType = question.inputType || 'text';
    const rnProps = mapInputTypeToRNProps(inputType);
    const autoCompleteProps = mapAutoComplete(question.autocomplete);

    const readOnly = question.isReadOnlyStyle;
    const preview = question.isPreviewStyle;
    const hasError = question.currentErrorCount > 0;
    const focused = this.adapter.isEditing;
    const editable = !this.isDisplayMode && !preview;

    const maxLength = this.resolveMaxLength(question);
    const hasMask = this.hasActiveMask(question);
    const counterText = maxLength
      ? question.characterCounter?.remainingCharacterCounter
      : undefined;
    const counterSize: InputCounterSize | undefined = maxLength
      ? maxLength > 99
        ? 'big'
        : 'normal'
      : undefined;

    const style = selectInputStyles(
      recipes.input,
      {
        focused,
        readOnly,
        preview,
        error: hasError,
        counter: focused ? counterSize : undefined,
      },
      mode
    );

    return (
      <View style={styles.wrapper}>
        <TextInput
          ref={this.setInputRef}
          testID={`${question.name}-input`}
          accessibilityLabel={question.title || question.name}
          value={this.adapter.renderedValue}
          onChangeText={this.handleChangeText}
          onFocus={this.handleFocus}
          onBlur={this.handleBlur}
          onSubmitEditing={this.handleSubmitEditing}
          onSelectionChange={this.handleSelectionChange}
          selection={this.state.controlledSelection}
          editable={editable}
          placeholder={question.renderedPlaceholder}
          // Masked: the native prop caps the RAW edit BEFORE the mask can
          // restore literals/placeholders (blocking legitimate mid-string
          // edits); web instead truncates the FORMATTED value
          // (InputElementAdapter.setInputValue) — applyMaskedEdit applies
          // that same post-format cap in handleChangeText.
          maxLength={hasMask ? undefined : maxLength}
          style={composeStyles(style, { override: overrides.input?.control })}
          {...rnProps}
          {...autoCompleteProps}
        />
        {counterText ? (
          <Text style={recipes.input.fragments.characterCounter}>
            {counterText}
          </Text>
        ) : null}
      </View>
    );
  }
}
