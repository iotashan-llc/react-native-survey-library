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
 * - `renderAs: "select"` has NO `dropdownListModel` (core builds the
 *   overlay model only for the default popup rendering) — the control
 *   degrades to a non-interactive value display + a diagnostic rather
 *   than dereferencing the missing model (PR #29 review, major #1).
 * - Reactivity: BOTH the question and its `dropdownListModel` are state
 *   elements (question-level props — allowClear, readOnly, placeholder,
 *   isShowingChoiceComment — live on the question; the VM does not
 *   forward them).
 * - Popup bridge is QUESTION-scoped and RECONCILED: mount registers
 *   `dropdownListModel.popupModel` into the OverlayContext stack with
 *   the control as opener (focus restoration); `componentDidUpdate`
 *   reconciles when the (popup, stack) identity changes (question/stack
 *   prop swap); unmount unsubscribes FIRST, then semantically closes,
 *   in a try/finally so teardown always completes (PR #29 review,
 *   major #3).
 * - "Other (describe)" opens a choice comment (`isShowingChoiceComment`)
 *   that QuestionChrome does NOT render for dropdown; the control hosts
 *   its own comment `TextInput` backed by the shared
 *   `OtherCommentDraftAdapter` (PR #29 review, major #2).
 * - a11y: the collapsed control mirrors core's INPUT aria surface
 *   (`vm.ariaInputRole` — `combobox` under the default `searchEnabled`,
 *   `vm.ariaExpanded` for open state), not the question surface (PR #29
 *   review, major #4).
 * - Clear: `dropdownListModel.onClear(event)` — core dereferences only
 *   preventDefault/stopPropagation (synthetic no-ops).
 */
import * as React from 'react';
import {
  findNodeHandle,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AccessibilityRole } from 'react-native';
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
import { OtherCommentDraftAdapter } from '../inputs/OtherCommentDraftAdapter';
import { reportDiagnostic } from '../diagnostics';

interface DropdownListModelLike {
  popupModel: InstanceType<typeof import('../core/facade').PopupModel>;
  onClick(): void;
  onClear(event: { preventDefault(): void; stopPropagation(): void }): void;
  placeholderRendered: string;
  inputStringRendered: string;
  getSelectedAction(): unknown;
  ariaInputRole?: AccessibilityRole | string;
  ariaExpanded?: boolean;
}

interface DropdownQuestionModelLike extends Question {
  dropdownListModel?: DropdownListModelLike;
  allowClear: boolean;
  showInputFieldComponent: boolean;
  inputFieldComponentName: string;
  showSelectedItemLocText: boolean;
  selectedItemLocText: import('../core/facade').LocalizableString;
  isInputReadOnly: boolean;
  readOnlyText: string;
  isShowingChoiceComment: boolean;
  otherText: string;
  otherPlaceholder: string;
  clearCaption?: string;
}

const noopEvent = {
  preventDefault: () => undefined,
  stopPropagation: () => undefined,
};

const KNOWN_ACCESSIBILITY_ROLES = new Set<AccessibilityRole>([
  'button',
  'combobox',
  'menu',
  'list',
]);

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
  private registeredPopup: DropdownListModelLike['popupModel'] | null = null;
  private registeredStack: OverlayStack<OverlayPayload> | null = null;
  private otherAdapter: OtherCommentDraftAdapter | null = null;
  private selectModeReported = false;

  private readonly controlRef =
    React.createRef<React.ComponentRef<typeof Pressable>>();

  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected getStateElements(): Base[] {
    // Question AND view model: allowClear/readOnly/placeholder/
    // isShowingChoiceComment change on the QUESTION; list state AND
    // ariaExpanded (the VM re-emits it on open/close) change on the VM
    // (plan fold 4 + PR #29 review major #4). The popupModel is NOT a
    // state element — it is SHARED with the overlay host/bridge, and
    // adding it to the render-guard set corrupts the cross-observer
    // suppression counters. `renderAs:"select"` has no VM.
    const model = this.dropdown.dropdownListModel as unknown as
      Base | undefined;
    return model ? [this.questionBase, model] : [this.questionBase];
  }

  private get dropdown(): DropdownQuestionModelLike {
    return this.questionBase as unknown as DropdownQuestionModelLike;
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.reconcileRegistration();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.reconcileRegistration();
  }

  componentWillUnmount(): void {
    const reg = this.registration;
    this.registration = null;
    this.registeredPopup = null;
    this.registeredStack = null;
    const adapter = this.otherAdapter;
    this.otherAdapter = null;
    try {
      // Unsubscribe the reactive base FIRST so the semantic-close
      // visibility change below can't drive setState during unmount.
      super.componentWillUnmount();
    } finally {
      reg?.unregister();
      adapter?.dispose();
    }
  }

  /** Register/re-register the popup bridge when the (popup, stack)
   * identity changes — a question or OverlayContext prop swap retargets
   * the reactive base, and the old registration must not linger. */
  private reconcileRegistration(): void {
    const stack = this.props.stack ?? null;
    const popup = this.dropdown.dropdownListModel?.popupModel ?? null;
    if (popup === this.registeredPopup && stack === this.registeredStack) {
      return;
    }
    this.registration?.unregister();
    this.registration = null;
    this.registeredPopup = popup;
    this.registeredStack = stack;
    if (stack && popup) {
      this.registration = registerPopup(popup, stack, {
        openerHandle: () => findNodeHandle(this.controlRef.current) ?? null,
      });
    }
  }

  private getOtherAdapter(): OtherCommentDraftAdapter {
    if (!this.otherAdapter) {
      this.otherAdapter = new OtherCommentDraftAdapter({
        question: this.questionBase,
      });
    }
    return this.otherAdapter;
  }

  /** The selected value display. `vm` is guaranteed present by the
   * caller (select-mode branches earlier). */
  private renderValue(vm: DropdownListModelLike): React.JSX.Element {
    const question = this.dropdown;
    // Render-order fold (plan round-2 A): component → selected locText
    // → inputStringRendered → placeholder.
    if (question.showInputFieldComponent) {
      if (
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
      // Custom component named but unregistered: don't silently show an
      // empty placeholder — report + fall back to the localized value
      // text (PR #29 review, minor #6).
      reportDiagnostic({
        code: 'dropdown-input-component-missing',
        questionName: question.name,
        componentName: question.inputFieldComponentName,
      });
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

  /** `renderAs:"select"` (no overlay VM): non-interactive value display
   * + one-shot diagnostic — never crash the survey (PR #29 review,
   * major #1). */
  private renderSelectModeFallback(): React.JSX.Element {
    const question = this.dropdown;
    if (!this.selectModeReported) {
      this.selectModeReported = true;
      reportDiagnostic({
        code: 'dropdown-select-mode-unsupported',
        questionName: question.name,
      });
    }
    const text = question.isEmpty()
      ? question.locPlaceholder?.renderedHtml || ''
      : undefined;
    return (
      <View style={localStyles.row} testID="sv-dropdown-select-fallback">
        {text !== undefined ? (
          <Text testID="sv-dropdown-placeholder">{text}</Text>
        ) : (
          <View testID="sv-dropdown-value">
            {SurveyElementBase.renderLocString(
              question.selectedItemLocText,
              undefined,
              'dd-value'
            )}
          </View>
        )}
      </View>
    );
  }

  private renderOtherComment(): React.JSX.Element {
    const question = this.dropdown;
    const adapter = this.getOtherAdapter();
    return (
      <TextInput
        testID="sv-dropdown-other"
        accessibilityLabel={question.otherText}
        placeholder={question.otherPlaceholder || undefined}
        editable={!question.isInputReadOnly}
        defaultValue={adapter.renderedValue}
        onChangeText={(text) => adapter.handleChangeText(text)}
        onBlur={() => adapter.handleBlur()}
        multiline
        style={localStyles.other}
      />
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.dropdown;
    const vm = question.dropdownListModel;
    if (!vm) return this.renderSelectModeFallback();

    const readOnly = question.isInputReadOnly;
    const showClear = question.allowClear && !question.isEmpty() && !readOnly;
    // a11y: mirror core's INPUT aria surface (combobox under the default
    // searchEnabled), not the question surface (PR #29 review, major #4).
    const roleCandidate = vm.ariaInputRole;
    const accessibilityRole: AccessibilityRole =
      roleCandidate &&
      KNOWN_ACCESSIBILITY_ROLES.has(roleCandidate as AccessibilityRole)
        ? (roleCandidate as AccessibilityRole)
        : 'button';
    const label =
      question.locTitle?.renderedHtml || question.title || question.name;
    return (
      <View style={localStyles.container}>
        <View style={localStyles.row}>
          <Pressable
            ref={this.controlRef}
            testID="sv-dropdown-control"
            accessibilityRole={accessibilityRole}
            accessibilityLabel={label}
            accessibilityState={{
              disabled: readOnly,
              expanded: vm.ariaExpanded === true,
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
              this.renderValue(vm)
            )}
            <Text accessibilityElementsHidden style={localStyles.chevron}>
              {'▾'}
            </Text>
          </Pressable>
          {showClear ? (
            <Pressable
              testID="sv-dropdown-clear"
              accessibilityRole="button"
              accessibilityLabel={question.clearCaption || 'Clear'}
              onPress={() => vm.onClear(noopEvent)}
              style={localStyles.clear}
            >
              <Text>✕</Text>
            </Pressable>
          ) : null}
        </View>
        {question.isShowingChoiceComment ? this.renderOtherComment() : null}
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center' },
  control: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: { marginLeft: 8 },
  clear: { marginLeft: 8, padding: 4 },
  other: { marginTop: 8 },
});
