/**
 * `buttongroup` question (task 2.9) — RN port of survey-react-ui's
 * `SurveyQuestionButtonGroup` (reactquestion_buttongroup.tsx).
 *
 * Core owns EVERYTHING per item through its own `ButtonGroupItemModel`
 * view-model (question_buttongroup.ts:193-256): value, caption
 * (LocalizableString), icon name/size, `showCaption`, `selected`
 * (`question.isItemSelected`), `readOnly` (`isInputReadOnly ||
 * !item.isEnabled`), and `onChange()` → `question.selectItem(item)` —
 * invariant 6: this component constructs the VM per render and consumes
 * it, never re-deriving selection/enable logic.
 *
 * Overflow-to-dropdown (`buttongroup-dropdown.tsx`, driven by the width
 * shrink observer) is task 2.5 — v1 renders the wrapped button row only
 * (documented in DIFFERENCES).
 *
 * a11y follows the 1.16 pattern: container radiogroup + question label;
 * items radio + checked/disabled state (single-select semantics).
 */
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ButtonGroupItemModel } from '../core/facade';
import type { Base, ItemValue, LocalizableString } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { RNIcon } from '../components/RNIcon';

interface ButtonGroupQuestionModel {
  name: string;
  visibleChoices: ItemValue[];
  processedTitle: string;
  a11y_input_ariaLabel?: string | null;
}

interface ButtonGroupItemVM {
  value: unknown;
  iconName: string | undefined;
  iconSize: number;
  caption: LocalizableString;
  showCaption: boolean;
  selected: boolean;
  readOnly: boolean;
  onChange(): void;
}

export class ButtonGroupQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get buttonGroup(): ButtonGroupQuestionModel {
    return this.questionBase as unknown as ButtonGroupQuestionModel;
  }

  private renderItem(
    item: ItemValue,
    index: number,
    isLast: boolean
  ): React.JSX.Element {
    const question = this.buttonGroup;
    const recipe = this.themeContext.recipes.buttonGroup;
    // Core's own per-item view-model — constructed per render, exactly
    // like upstream's React item component does.
    const vm = new (
      ButtonGroupItemModel as unknown as new (
        q: unknown,
        i: ItemValue,
        idx: number
      ) => ButtonGroupItemVM
    )(this.questionBase, item, index);
    const styles = recipe.select({
      selected: vm.selected,
      disabled: vm.readOnly,
    });
    return (
      <Pressable
        key={`${question.name}-${index}`}
        testID={`sv-buttongroup-item-${question.name}-${index}`}
        accessibilityRole="radio"
        accessibilityState={{ checked: vm.selected, disabled: vm.readOnly }}
        disabled={vm.readOnly}
        onPress={() => vm.onChange()}
        style={[styles.item, isLast ? null : recipe.fragments.itemDivider]}
      >
        {vm.iconName ? (
          <RNIcon iconName={vm.iconName} size={vm.iconSize} />
        ) : null}
        {vm.showCaption ? (
          <Text
            style={[
              ...styles.caption,
              vm.iconName ? recipe.fragments.captionAfterIcon : null,
            ]}
          >
            {SurveyElementBase.renderLocString(vm.caption)}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.buttonGroup;
    const recipe = this.themeContext.recipes.buttonGroup;
    const choices = question.visibleChoices;
    return (
      <View
        testID={`sv-buttongroup-${question.name}`}
        accessibilityRole="radiogroup"
        accessibilityLabel={
          question.a11y_input_ariaLabel ?? question.processedTitle
        }
        style={recipe.fragments.container}
      >
        {choices.map((item, index) =>
          this.renderItem(item, index, index === choices.length - 1)
        )}
      </View>
    );
  }
}
