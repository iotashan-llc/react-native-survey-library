/**
 * Task 1.12 — radiogroup question. Sibling of `Checkbox` — same scope,
 * bridge/recipe usage, v1 simplifications, AND 1.7 handoff contract (see
 * that file's header and `Comment`'s: the `getStateElement()`
 * self-subscription is redundant-but-safe under `QuestionChrome` and may
 * be delegated by the 1.1/1.4 dispatcher task); the only real difference
 * is the click contract: radiogroup's `clickItemHandler(item)` is
 * single-arg (select-only; the base `selectItem` —
 * question_baseselect.ts:929 — always sets `renderedValue = item.value`,
 * no toggle-off), vs. checkbox's two-arg toggle form.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { Base, ItemValue } from '../core/facade';
import type { QuestionRadiogroupModel } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { ChoiceItemRow } from './ChoiceItemRow';

export type RadiogroupProps = QuestionElementBaseProps;

export class Radiogroup extends QuestionElementBase<RadiogroupProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get radiogroup(): QuestionRadiogroupModel {
    return this.questionBase as QuestionRadiogroupModel;
  }

  private handleItemPress = (item: ItemValue): void => {
    this.radiogroup.clickItemHandler(item);
  };

  protected renderElement(): React.JSX.Element {
    const question = this.radiogroup;
    const colCount = question.colCount ?? 1;
    const containerStyle =
      colCount === 0
        ? { flexDirection: 'row' as const, flexWrap: 'wrap' as const }
        : colCount > 1
          ? { flexDirection: 'row' as const, flexWrap: 'wrap' as const }
          : { flexDirection: 'column' as const };

    return (
      <View testID="radiogroup-items" style={containerStyle}>
        {question.visibleChoices.map((item) => (
          <View
            key={item.uniqueId}
            style={colCount > 1 ? { width: `${100 / colCount}%` } : undefined}
          >
            <ChoiceItemRow
              question={question}
              item={item}
              shape="radio"
              checked={question.isItemSelected(item)}
              addOn={item === question.noneItem ? 'none' : undefined}
              onPress={() => this.handleItemPress(item)}
              otherInputTestID={
                question.otherItem && item === question.otherItem
                  ? 'radiogroup-other-input'
                  : undefined
              }
            />
          </View>
        ))}
      </View>
    );
  }
}
