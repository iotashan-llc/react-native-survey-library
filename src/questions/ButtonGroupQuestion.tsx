/**
 * `buttongroup` question (task 2.9) — RN port of survey-react-ui's
 * `SurveyQuestionButtonGroup` (reactquestion_buttongroup.tsx).
 *
 * Core owns EVERYTHING per item through its own `ButtonGroupItemModel`
 * view-model (question_buttongroup.ts:193-256) — invariant 6: the VM is
 * constructed per render (same as upstream's item component) and
 * consumed, never re-derived.
 *
 * Review round 1 deltas:
 * - Each item is its OWN reactive component subscribed to its
 *   `ItemValue` (upstream gives the item as the state element too —
 *   reactquestion_buttongroup.tsx:47-65): `choicesEnableIf` flips notify
 *   the ITEM, not the question.
 * - Items render inside a horizontal ScrollView — the web baseline is
 *   `overflow-x: auto` + nowrap (sv-buttongroup.scss:3-10), NOT a
 *   wrapped row.
 * - The caption locstring renders DIRECTLY (renderLocString takes the
 *   caption style) — an HTML caption resolves to SanitizedHtml, which
 *   must not nest inside a Text.
 * - Every item carries `accessibilityLabel` from its caption even when
 *   `showCaption` is false (icon-only items need a name).
 * - Icon fill follows the recipe's state mapping (foreground-light /
 *   primary selected / foreground disabled).
 *
 * Overflow-to-dropdown (buttongroup-dropdown.tsx) is task 2.5. Error
 * association (`hasErrors`/`describedBy`) has no RN aria equivalent —
 * errors surface through question chrome (same documented limitation as
 * rating).
 */
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ButtonGroupItemModel } from '../core/facade';
import type { Base, ItemValue, LocalizableString } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { RNIcon } from '../components/RNIcon';
import { composeStyles } from '../theme-rn/recipes/types';

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

interface ButtonGroupItemRowProps {
  question: Base;
  questionName: string;
  item: ItemValue;
  index: number;
  isLast: boolean;
}

/** Per-item reactive row — state elements: the ITEM (enableIf flips
 * notify it) and the question (selection changes). */
class ButtonGroupItemRow extends SurveyElementBase<ButtonGroupItemRowProps> {
  protected getStateElement(): Base | null {
    return this.props.item as unknown as Base;
  }

  protected getStateElements(): Base[] {
    return [this.props.item as unknown as Base, this.props.question];
  }

  protected renderElement(): React.JSX.Element {
    const { question, questionName, item, index, isLast } = this.props;
    const { recipes, styles: overrides } = this.themeContext;
    const recipe = recipes.buttonGroup;
    const slots = overrides.buttonGroup;
    const vm = new (
      ButtonGroupItemModel as unknown as new (
        q: unknown,
        i: ItemValue,
        idx: number
      ) => ButtonGroupItemVM
    )(question, item, index);
    const state = { selected: vm.selected, disabled: vm.readOnly };
    const styles = recipe.select(state);
    return (
      <Pressable
        testID={`sv-buttongroup-item-${questionName}-${index}`}
        accessibilityRole="radio"
        // Named by the caption ALWAYS — icon-only items included.
        accessibilityLabel={vm.caption.renderedHtml}
        accessibilityState={{ checked: vm.selected, disabled: vm.readOnly }}
        disabled={vm.readOnly}
        onPress={() => vm.onChange()}
        style={[
          ...composeStyles(styles.item[0]!, { override: slots?.item }),
          ...styles.item.slice(1),
          isLast ? null : recipe.fragments.itemDivider,
        ]}
      >
        {vm.iconName ? (
          <RNIcon
            iconName={vm.iconName}
            size={vm.iconSize}
            fill={recipe.iconFill(state)}
          />
        ) : null}
        {vm.showCaption
          ? SurveyElementBase.renderLocString(
              vm.caption,
              [
                ...styles.caption,
                vm.iconName ? recipe.fragments.captionAfterIcon : null,
                slots?.caption,
              ],
              `caption-${index}`
            )
          : null}
      </Pressable>
    );
  }
}

export class ButtonGroupQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get buttonGroup(): ButtonGroupQuestionModel {
    return this.questionBase as unknown as ButtonGroupQuestionModel;
  }

  protected renderElement(): React.JSX.Element {
    const question = this.buttonGroup;
    const { recipes, styles: overrides } = this.themeContext;
    const recipe = recipes.buttonGroup;
    const slots = overrides.buttonGroup;
    const choices = question.visibleChoices;
    return (
      <ScrollView
        testID={`sv-buttongroup-scroll-${question.name}`}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <View
          testID={`sv-buttongroup-${question.name}`}
          accessibilityRole="radiogroup"
          accessibilityLabel={
            question.a11y_input_ariaLabel ?? question.processedTitle
          }
          style={composeStyles(recipe.fragments.container, {
            override: slots?.container,
          })}
        >
          {choices.map((item, index) => (
            <ButtonGroupItemRow
              key={`${question.name}-${index}`}
              question={this.questionBase}
              questionName={question.name}
              item={item}
              index={index}
              isLast={index === choices.length - 1}
            />
          ))}
        </View>
      </ScrollView>
    );
  }
}
