/**
 * Task 1.12 — checkbox question (design: docs/design/0.7-theme-rn.md,
 * item recipe + bridge; docs/design/0.5-factories.md, descriptor table).
 * Upstream analog: `SurveyQuestionSelectbase` (survey-react-ui
 * reactquestion_selectbase.tsx) dispatched for the `checkbox` type via
 * `question.itemComponent`. Scope note: same body-only split AND the
 * same 1.7 handoff contract as `Comment` (see that file's header): the
 * `getStateElement()` self-subscription here is redundant-but-safe under
 * `QuestionChrome` (0.4 D2 model-scoped render guard; locked by the
 * "inside QuestionChrome" test) and may be delegated by the 1.1/1.4
 * dispatcher task.
 *
 * Selection goes through `question.clickItemHandler(item, checked)` /
 * `question.isItemSelected(item)` — core's own select/deselect/selectAll/
 * none-exclusivity/other-tracking logic (question_baseselect.ts,
 * question_checkbox.ts) is never re-implemented here; this component only
 * computes the boolean it hands to `clickItemHandler` (toggle = NOT
 * currently selected) and lets the model do the rest (selectAll
 * toggle-all, none exclusivity via `removeNoneItemsValues`, other
 * tracking via `onItemSelected`/`onItemDeselected` all verified upstream
 * and exercised by this component's tests, not duplicated).
 *
 * Columns: "simple flex-wrap columns v1" per the task brief — `colCount`
 * drives a flat N-column flex-wrap grid, NOT upstream's
 * `getColumnsWithColumnItemFlow`/`getColumnsWithRowItemFlow`
 * redistribution (a documented v1 simplification, matching the item
 * ordering simplification below).
 *
 * Item ordering: iterates `question.visibleChoices` directly (which
 * already includes selectAll/none/other per `addNonChoicesItems`), not
 * upstream's `bodyItems`/`footItems` split (which moves "other" to a
 * trailing "foot" section in some configurations) — documented v1
 * simplification.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { Base, ItemValue } from '../core/facade';
import type { QuestionCheckboxModel } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { ChoiceItemRow } from './ChoiceItemRow';

export type CheckboxProps = QuestionElementBaseProps;

export class Checkbox extends QuestionElementBase<CheckboxProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get checkbox(): QuestionCheckboxModel {
    return this.questionBase as QuestionCheckboxModel;
  }

  private handleItemPress = (item: ItemValue): void => {
    const question = this.checkbox;
    const checked = !question.isItemSelected(item);
    question.clickItemHandler(item, checked);
  };

  protected renderElement(): React.JSX.Element {
    const question = this.checkbox;
    const colCount = question.colCount ?? 1;
    const containerStyle =
      colCount === 0
        ? { flexDirection: 'row' as const, flexWrap: 'wrap' as const }
        : colCount > 1
          ? { flexDirection: 'row' as const, flexWrap: 'wrap' as const }
          : { flexDirection: 'column' as const };

    return (
      <View
        testID="checkbox-items"
        // Core's checkbox input role is "group" (a11y_input_ariaRole,
        // question_checkbox.ts:760-762) — RN has no group role, so the
        // container carries the question label only; items keep their
        // individual checkbox/checked semantics (task 1.16, documented in
        // docs/DIFFERENCES.md).
        accessibilityLabel={
          (question as unknown as { a11y_input_ariaLabel: string | null })
            .a11y_input_ariaLabel ?? question.processedTitle
        }
        style={containerStyle}
      >
        {question.visibleChoices.map((item) => (
          <View
            key={item.uniqueId}
            style={colCount > 1 ? { width: `${100 / colCount}%` } : undefined}
          >
            <ChoiceItemRow
              question={question}
              item={item}
              shape="checkbox"
              checked={question.isItemSelected(item)}
              addOn={
                item === question.selectAllItem
                  ? 'selectAll'
                  : item === question.noneItem
                    ? 'none'
                    : undefined
              }
              onPress={() => this.handleItemPress(item)}
              otherInputTestID={
                question.otherItem && item === question.otherItem
                  ? 'checkbox-other-input'
                  : undefined
              }
            />
          </View>
        ))}
      </View>
    );
  }
}
