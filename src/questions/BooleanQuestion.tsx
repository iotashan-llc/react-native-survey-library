/**
 * `boolean` question type (task 1.13, design: docs/IMPLEMENTATION-PLAN.md
 * row 1.13 "boolean (switch + checkbox/radio modes)"). Three components,
 * one per survey-core `renderAs` mode, mirroring survey-react-ui's split
 * across boolean.tsx / boolean-checkbox.tsx / boolean-radio.tsx
 * (question_boolean.ts, verified against v2.5.33):
 *
 * - `BooleanQuestion` — the default (`renderAs: "default"`) native
 *   `Switch`. Dispatch: `isDefaultRendering()` is true (no renderer
 *   registered for "default"), so the key is `getTemplate() === "boolean"`
 *   (template route).
 * - `BooleanCheckboxQuestion` — `renderAs: "checkbox"`. Dispatch key
 *   `"sv-boolean-checkbox"`, resolved via
 *   `RendererFactory.getRendererByQuestion()` (renderer route) — mirrors
 *   upstream's own registration
 *   (`RendererFactory.Instance.registerRenderer("boolean", "checkbox",
 *   "sv-boolean-checkbox")`, boolean-checkbox.tsx).
 * - `BooleanRadioQuestion` — `renderAs: "radio"`. Dispatch key
 *   `"sv-boolean-radio"`, same mechanism (boolean-radio.tsx).
 *
 * Binding contract: ALWAYS `question.booleanValue`
 * (`QuestionBooleanModel.booleanValue`, question_boolean.ts) — never raw
 * `question.value` juggling. The getter maps `value === getValueTrue()`
 * to `true`/`false`/`null` (null = unanswered = indeterminate,
 * `isIndeterminate` == `isEmpty()`); the setter maps a boolean back
 * through `getValueTrue()`/`getValueFalse()` (so a custom
 * `valueTrue`/`valueFalse` pair is honored automatically) and no-ops
 * under readOnly/design mode. `BooleanRadioQuestion` is the one exception
 * — like upstream's `boolean-radio.tsx`, it sets `question.value` directly
 * to `getValueTrue()`/`getValueFalse()` (the radio item IS one of those
 * two values, not an arbitrary boolean), guarded by `isInputReadOnly`.
 *
 * Documented RN delta (switch mode): upstream's web slider has
 * click-POSITION semantics (`onSwitchClickModel` computes left/right half
 * via `event.offsetX`) and two separate clickable label spans
 * (`onLabelClick`). RN's native `Switch` is a single two-state control
 * with one `onValueChange(boolean)` callback — there is no faithful
 * analog of "click the right third of the track" or "click the left
 * label to force false". This component still surfaces
 * `labelTrue`/`labelFalse` as flanking, non-interactive locstring labels
 * (`locLabelLeft`/`locLabelRight`, which already encode `swapOrder`) and
 * represents `isIndeterminate` via `accessibilityState.checked: 'mixed'`
 * (RN's `AccessibilityState.checked` accepts `boolean | 'mixed'`,
 * mirroring the question's `a11y_input_ariaRole: 'switch'` +
 * indeterminate aria-checked semantics) — the Switch itself always
 * renders visually "off" (`value={false}`) while indeterminate, same as
 * an unset native checkbox has no visual indeterminate affordance either.
 */
import * as React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { Base, LocalizableString } from '../core/facade';
import { QuestionBooleanModel } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { resolveColorVar } from '../theme-rn/recipes/tokenLookup';
import { selectItemStyles } from '../theme-rn/recipes/item';
import type { ItemStateInput } from '../theme-rn/recipes/item';

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchLabel: {
    paddingHorizontal: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioGroup: {
    flexDirection: 'row',
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

/** Shared helper: never reach into `question.booleanValue`/`.value` from a fixed decorator/label recipe fragment without going through this — keeps the "same item recipe" contract obvious across checkbox and radio. */
function baseItemState(
  question: QuestionBooleanModel
): Omit<ItemStateInput, 'checked'> {
  return {
    pressed: false,
    focused: false,
    readOnly: question.isReadOnlyStyle,
    preview: question.isPreviewStyle,
    // `hasCssError()` is `protected` on `Question` — not reachable from a
    // component; error-state theming for boolean choice items is
    // deferred (no public accessor exists yet at this layer).
    error: false,
    allowHover: !question.isReadOnlyStyle && !question.isPreviewStyle,
  };
}

export class BooleanQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get booleanQuestion(): QuestionBooleanModel {
    return this.questionBase as QuestionBooleanModel;
  }

  private handleValueChange = (value: boolean): void => {
    this.booleanQuestion.booleanValue = value;
  };

  protected renderElement(): React.JSX.Element {
    const question = this.booleanQuestion;
    const { resolved } = this.themeContext;
    const isChecked = question.booleanValue === true;
    const disabled = this.isDisplayMode;
    const trackColorTrue = resolveColorVar(
      resolved,
      '--sjs-primary-backcolor'
    ).css;
    const trackColorFalse = resolveColorVar(
      resolved,
      '--sjs-border-default'
    ).css;
    const thumbColor = resolveColorVar(resolved, '--sjs-general-backcolor').css;
    return (
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>
          {this.renderLocString(question.locLabelLeft)}
        </Text>
        <Switch
          testID={`sv-boolean-switch-${question.name}`}
          value={isChecked}
          onValueChange={this.handleValueChange}
          disabled={disabled}
          trackColor={{ false: trackColorFalse, true: trackColorTrue }}
          thumbColor={thumbColor}
          accessibilityRole="switch"
          accessibilityState={{
            disabled,
            checked: question.isIndeterminate ? 'mixed' : isChecked,
          }}
        />
        <Text style={styles.switchLabel}>
          {this.renderLocString(question.locLabelRight)}
        </Text>
      </View>
    );
  }
}

export class BooleanCheckboxQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get booleanQuestion(): QuestionBooleanModel {
    return this.questionBase as QuestionBooleanModel;
  }

  private handleToggle = (): void => {
    const question = this.booleanQuestion;
    if (question.isInputReadOnly) return;
    question.booleanValue = !question.booleanValue;
  };

  protected renderElement(): React.JSX.Element {
    const question = this.booleanQuestion;
    const { recipes, mode } = this.themeContext;
    const checked = question.booleanValue === true;
    const input: ItemStateInput = {
      checked,
      ...baseItemState(question),
    };
    const selected = selectItemStyles(recipes.item, input, mode, 'checkbox');
    return (
      <Pressable
        testID={`sv-boolean-checkbox-${question.name}`}
        accessibilityRole="checkbox"
        accessibilityState={{
          checked: question.isIndeterminate ? 'mixed' : checked,
          disabled: input.readOnly,
        }}
        onPress={this.handleToggle}
        style={[styles.checkboxRow, ...selected.container]}
      >
        <View style={selected.decorator} />
        <Text style={recipes.item.fragments.label}>
          {question.title || question.name}
        </Text>
      </Pressable>
    );
  }
}

export class BooleanRadioQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get booleanQuestion(): QuestionBooleanModel {
    return this.questionBase as QuestionBooleanModel;
  }

  private renderRadioItem(
    value: unknown,
    locText: LocalizableString,
    key: 'true' | 'false'
  ): React.JSX.Element {
    const question = this.booleanQuestion;
    const { recipes, mode } = this.themeContext;
    const checked = question.value === value;
    const input: ItemStateInput = {
      checked,
      ...baseItemState(question),
    };
    const selected = selectItemStyles(recipes.item, input, mode, 'radio');
    return (
      <Pressable
        key={key}
        testID={`sv-boolean-radio-${question.name}-${key}`}
        accessibilityRole="radio"
        accessibilityState={{ checked, disabled: input.readOnly }}
        onPress={() => {
          if (question.isInputReadOnly) return;
          question.value = value;
        }}
        style={[styles.radioItem, ...selected.container]}
      >
        <View style={selected.decorator} />
        <Text style={recipes.item.fragments.label}>
          {this.renderLocString(locText)}
        </Text>
      </Pressable>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.booleanQuestion;
    const falseItem = this.renderRadioItem(
      question.getValueFalse(),
      question.locLabelFalse,
      'false'
    );
    const trueItem = this.renderRadioItem(
      question.getValueTrue(),
      question.locLabelTrue,
      'true'
    );
    return (
      <View style={styles.radioGroup}>
        {question.swapOrder ? [trueItem, falseItem] : [falseItem, trueItem]}
      </View>
    );
  }
}
