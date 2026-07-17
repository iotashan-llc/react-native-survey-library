/**
 * `dropdown` question (task 2.3) — RN port of survey-react-ui's
 * `SurveyQuestionDropdownBase` (dropdown-base.tsx) over the 2.1
 * overlay primitives. Plan: docs/design/2.3-dropdown-plan.md v4.
 *
 * - Under the facade's `_setIsTouch(true)` core takes the touch path
 *   (`displayMode='overlay'`, popup search via `setSearchEnabled` on
 *   open); web's inline filter input carries `inputMode='none'` on
 *   touch, so the RN control renders VALUE TEXT — component dispatch
 *   (`showInputFieldComponent`), `selectedItemLocText`,
 *   `inputStringRendered`, then placeholder (plan round-2 fold A).
 * - Reactivity: BOTH the question and its `dropdownListModel` are state
 *   elements (question-level props — allowClear, readOnly, placeholder
 *   — live on the question; the VM does not forward them).
 * - Popup bridge is QUESTION-scoped: mount registers
 *   `dropdownListModel.popupModel` into the OverlayContext stack with
 *   the control as opener (focus restoration); unmount = semantic
 *   close. Selection/search/lazy-load all run inside the 2.1
 *   ListPicker ('sv-list' content dispatch).
 * - Clear: `dropdownListModel.onClear(event)` — core dereferences only
 *   preventDefault/stopPropagation (synthetic no-ops).
 */
import * as React from 'react';
import {
  findNodeHandle,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Base, Question } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { RNElementFactory } from '../factories/ElementFactory';
import { OverlayContext } from '../overlay/OverlayContext';
import { registerPopup } from '../overlay/popup-bridge';
import type {
  OverlayPayload,
  PopupRegistration,
} from '../overlay/popup-bridge';
import type { OverlayStack } from '../overlay/stack';

interface DropdownListModelLike {
  popupModel: InstanceType<typeof import('../core/facade').PopupModel>;
  onClick(): void;
  onClear(event: { preventDefault(): void; stopPropagation(): void }): void;
  placeholderRendered: string;
  inputStringRendered: string;
  getSelectedAction(): unknown;
  ariaQuestionExpanded?: 'true' | 'false';
}

interface DropdownQuestionModelLike extends Question {
  dropdownListModel: DropdownListModelLike;
  allowClear: boolean;
  showInputFieldComponent: boolean;
  inputFieldComponentName: string;
  showSelectedItemLocText: boolean;
  selectedItemLocText: import('../core/facade').LocalizableString;
  isInputReadOnly: boolean;
  readOnlyText: string;
}

const noopEvent = {
  preventDefault: () => undefined,
  stopPropagation: () => undefined,
};

export interface DropdownQuestionElementProps extends QuestionElementBaseProps {}

/** OverlayContext binding (class components already spend their single
 * contextType on the theme — same pattern as ListPickerElement). */
export function DropdownQuestionElement(
  props: DropdownQuestionElementProps
): React.JSX.Element {
  const stack = React.useContext(OverlayContext);
  return (
    <DropdownQuestion
      question={props.question}
      creator={props.creator}
      stack={stack ?? undefined}
    />
  );
}

interface DropdownQuestionProps extends QuestionElementBaseProps {
  stack?: OverlayStack<OverlayPayload>;
}

export class DropdownQuestion extends QuestionElementBase<DropdownQuestionProps> {
  private registration: PopupRegistration | null = null;

  private readonly controlRef =
    React.createRef<React.ComponentRef<typeof Pressable>>();

  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected getStateElements(): Base[] {
    // Question AND view model: allowClear/readOnly/placeholder change on
    // the QUESTION; popup/list state changes on the VM (plan fold 4).
    const vm = this.dropdown.dropdownListModel as unknown as Base;
    return vm ? [this.questionBase, vm] : [this.questionBase];
  }

  private get dropdown(): DropdownQuestionModelLike {
    return this.questionBase as unknown as DropdownQuestionModelLike;
  }

  componentDidMount(): void {
    super.componentDidMount();
    const stack = this.props.stack;
    const popup = this.dropdown.dropdownListModel?.popupModel;
    if (stack && popup) {
      this.registration = registerPopup(popup, stack, {
        openerHandle: () => findNodeHandle(this.controlRef.current) ?? null,
      });
    }
  }

  componentWillUnmount(): void {
    this.registration?.unregister();
    this.registration = null;
    super.componentWillUnmount();
  }

  private renderValue(): React.JSX.Element {
    const question = this.dropdown;
    const vm = question.dropdownListModel;
    // Render-order fold (plan round-2 A): component → selected locText
    // → inputStringRendered → placeholder.
    if (
      question.showInputFieldComponent &&
      RNElementFactory.isElementRegistered(question.inputFieldComponentName)
    ) {
      return (
        <View testID="sv-dropdown-value-component">
          {RNElementFactory.createElement(question.inputFieldComponentName, {
            item: vm.getSelectedAction(),
            question,
          })}
        </View>
      );
    }
    if (question.showSelectedItemLocText) {
      return (
        <View testID="sv-dropdown-value">
          {SurveyElementBase.renderLocString(
            question.selectedItemLocText,
            undefined,
            'dd-value'
          )}
        </View>
      );
    }
    if (vm.inputStringRendered) {
      return <Text testID="sv-dropdown-value">{vm.inputStringRendered}</Text>;
    }
    return (
      <Text testID="sv-dropdown-placeholder">{vm.placeholderRendered}</Text>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.dropdown;
    const vm = question.dropdownListModel;
    const readOnly = question.isInputReadOnly;
    const showClear = question.allowClear && !question.isEmpty() && !readOnly;
    return (
      <View style={localStyles.row}>
        <Pressable
          ref={this.controlRef}
          testID="sv-dropdown-control"
          accessibilityRole="button"
          accessibilityState={{
            disabled: readOnly,
            expanded: vm.ariaQuestionExpanded === 'true',
          }}
          disabled={readOnly}
          onPress={readOnly ? undefined : () => vm.onClick()}
          style={localStyles.control}
        >
          {readOnly &&
          !question.showInputFieldComponent &&
          question.readOnlyText ? (
            <Text testID="sv-dropdown-readonly">{question.readOnlyText}</Text>
          ) : (
            this.renderValue()
          )}
          <Text accessibilityElementsHidden style={localStyles.chevron}>
            {'▾'}
          </Text>
        </Pressable>
        {showClear ? (
          <Pressable
            testID="sv-dropdown-clear"
            accessibilityRole="button"
            onPress={() => vm.onClear(noopEvent)}
            style={localStyles.clear}
          >
            <Text>✕</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  control: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: { marginLeft: 8 },
  clear: { marginLeft: 8, padding: 4 },
});
