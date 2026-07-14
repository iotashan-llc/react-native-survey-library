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
import { mapInputTypeToRNProps, mapAutoComplete } from './inputTypeMapping';
import { composeStyles } from '../theme-rn/recipes/types';
import { selectInputStyles } from '../theme-rn/recipes/input';
import type { InputCounterSize } from '../theme-rn/recipes/input';

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
        text
      );
      this.lastKnownSelection = {
        start: result.caretPosition,
        end: result.caretPosition,
      };
      this.setState({ controlledSelection: this.lastKnownSelection });
      // Blur-commit-only for masked questions is the ADAPTER's contract
      // (hasActiveMask() there, independent of this component) — this
      // call only supplies the properly mask-shaped draft; it never
      // re-decides commit timing.
      this.adapter.handleChangeText(result.value);
    } else {
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
  };

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
    this.adapter.handleBlur();
    this.lastKnownSelection = null;
    this.setState({ controlledSelection: undefined });
    this.forceUpdate();
  };

  private handleSubmitEditing = (): void => {
    this.adapter.handleSubmitEditing();
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
    const { recipes, styles: overrides, mode } = this.themeContext;

    const inputType = question.inputType || 'text';
    const rnProps = mapInputTypeToRNProps(inputType);
    const autoCompleteProps = mapAutoComplete(question.autocomplete);

    const readOnly = question.isReadOnlyStyle;
    const preview = question.isPreviewStyle;
    const hasError = question.currentErrorCount > 0;
    const focused = this.adapter.isEditing;
    const editable = !this.isDisplayMode && !preview;

    const rawMaxLength = question.getMaxLength();
    const maxLength =
      typeof rawMaxLength === 'number' && rawMaxLength > 0
        ? rawMaxLength
        : undefined;
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
          maxLength={maxLength}
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
