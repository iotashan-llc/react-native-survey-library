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
 * - Mode is keyed on `question.renderAs`, NOT on VM presence: core
 *   RETAINS a previously-built `dropdownListModel` after a runtime
 *   `renderAs = "select"` switch. `"select"` has no native RN analog, so
 *   the control degrades to a non-interactive value display + a deferred
 *   diagnostic (PR #29 review r1 #1, r2 #1).
 * - Value text is rendered defensively: a persisted value ABSENT from
 *   the current choices has no `selectedItemLocText`, so the renderer
 *   never passes `undefined` to `renderLocString` — it falls back to the
 *   raw value string, then the placeholder (PR #29 review r2 #1).
 * - Reactivity: the question and its `dropdownListModel` are state
 *   elements; the VM re-emits `ariaExpanded` on open/close, driving the
 *   control's live expansion state. The popupModel is NOT a state
 *   element (shared with the overlay host — adding it corrupts the
 *   render-guard's cross-observer counters).
 * - Popup bridge is QUESTION-scoped and RECONCILED from commit
 *   lifecycles: `componentDidMount`/`componentDidUpdate` re-register when
 *   the (popup, stack) identity changes; unmount unsubscribes FIRST,
 *   then closes in a try/finally (PR #29 review r1 #3, r2 #3).
 * - "Other (describe)" opens a choice comment (`isShowingChoiceComment`)
 *   that QuestionChrome does NOT render for dropdown. It renders through
 *   `DropdownOtherComment`, a child KEYED BY QUESTION IDENTITY: the
 *   adapter is constructed/disposed in an effect (commit-safe, never
 *   during render), the input is CONTROLLED, and the key forces a
 *   remount on a question swap so no native draft bleeds across
 *   questions (PR #29 review r1 #2, r2 #2, r3 #2/#3).
 * - a11y: the control mirrors core's INPUT aria surface
 *   (`vm.ariaInputRole ?? vm.ariaQuestionRole` — `combobox` under the
 *   default `searchEnabled`), the question label, `vm.ariaExpanded`
 *   (a STRING `'true'|'false'`) for open state, and `vm.clearCaption`
 *   for the localized clear label (PR #29 review r1 #4, r2 #4).
 * - Diagnostics (select-mode, custom-component-miss) are RECORDED in
 *   render (cleared fresh each render) and FLUSHED from mount/update,
 *   deduped per QUESTION IDENTITY + key via a WeakMap — never reported
 *   from the render phase (repo React 19 commit-phase rule; PR #29
 *   review r2 #6, r3 #4).
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
import { Helpers } from '../core/facade';
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
  // core's INPUT aria surface (dropdown-base.tsx). ariaExpanded is a
  // STRING ('true' | 'false'), NOT a boolean.
  ariaInputRole?: AccessibilityRole | string;
  ariaQuestionRole?: AccessibilityRole | string;
  ariaExpanded?: string;
  clearCaption?: string;
}

interface DropdownQuestionModelLike extends Question {
  dropdownListModel?: DropdownListModelLike;
  renderAs: string;
  allowClear: boolean;
  showInputFieldComponent: boolean;
  inputFieldComponentName: string;
  showSelectedItemLocText: boolean;
  selectedItemLocText?: import('../core/facade').LocalizableString;
  isInputReadOnly: boolean;
  readOnlyText: string;
  isShowingChoiceComment: boolean;
  otherText: string;
  otherPlaceholder: string;
  otherValue?: unknown;
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

// Module-scoped so dedup survives unmount/remount of the SAME core
// Question (or two renderer instances over one question) — an
// instance-local map would re-report on remount (PR #29 review r4 #3).
const reportedDropdownDiagnostics = new WeakMap<Question, Set<string>>();

/**
 * "Other (describe)" comment input. Owns its `OtherCommentDraftAdapter`
 * in an effect (constructed/disposed in the commit phase, never during
 * render — a suspended/abandoned render must not leak a subscription)
 * and renders a CONTROLLED `TextInput`. Rendered with
 * `key={question.uniqueId}` (immutable, unlike the mutable `id`) so a
 * question prop swap fully remounts it: fresh adapter, fresh value, no
 * native draft carried from the previous question (PR #29 review r3
 * #2/#3, r4 #2).
 */
function DropdownOtherComment(props: {
  question: Question;
}): React.JSX.Element {
  const { question } = props;
  const q = question as unknown as DropdownQuestionModelLike;
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const adapterRef = React.useRef<OtherCommentDraftAdapter | null>(null);
  React.useEffect(() => {
    const adapter = new OtherCommentDraftAdapter({
      question,
      onRenderedValueChange: bump,
    });
    adapterRef.current = adapter;
    bump(); // reflect the adapter's initial value now it exists
    return () => {
      adapter.dispose();
      adapterRef.current = null;
    };
  }, [question]);
  const adapter = adapterRef.current;
  // Before the effect runs (first commit), source the initial value from
  // the model so an existing comment shows without a flash — using the
  // adapter's SurveyJS-empty semantics (Helpers.isValueEmpty), not a raw
  // String(), so an empty/NaN/object value matches the adapter's '' and
  // avoids a one-frame flip (PR #29 review r4 #4).
  const value = adapter
    ? adapter.renderedValue
    : Helpers.isValueEmpty(q.otherValue)
      ? ''
      : String(q.otherValue);
  return (
    <TextInput
      testID="sv-dropdown-other"
      accessibilityLabel={q.otherText}
      placeholder={q.otherPlaceholder || undefined}
      editable={!q.isInputReadOnly}
      value={value}
      onChangeText={(text) => adapter?.handleChangeText(text)}
      onBlur={() => adapter?.handleBlur()}
      multiline
      style={localStyles.other}
    />
  );
}

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

  // Commit-phase diagnostic buffers (never reported from render). Cleared
  // fresh each render; the originating question travels with them so a
  // prop swap can't cross-suppress. Dedup is per-question-identity.
  private pendingSelectMiss: string | undefined;
  private pendingComponentMiss: string | undefined;
  private pendingMissQuestion: Question | undefined;

  private readonly controlRef =
    React.createRef<React.ComponentRef<typeof Pressable>>();

  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected getStateElements(): Base[] {
    // Question AND view model: allowClear/readOnly/placeholder/
    // isShowingChoiceComment change on the QUESTION; list state AND
    // ariaExpanded (the VM re-emits it on open/close) change on the VM.
    // Select mode is non-interactive — the VM (if it lingers) is unused.
    if (this.isSelectMode) return [this.questionBase];
    const model = this.dropdown.dropdownListModel as unknown as
      Base | undefined;
    return model ? [this.questionBase, model] : [this.questionBase];
  }

  private get dropdown(): DropdownQuestionModelLike {
    return this.questionBase as unknown as DropdownQuestionModelLike;
  }

  private get isSelectMode(): boolean {
    return this.dropdown.renderAs === 'select';
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.reconcile();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.reconcile();
  }

  componentWillUnmount(): void {
    const reg = this.registration;
    this.registration = null;
    this.registeredPopup = null;
    this.registeredStack = null;
    try {
      // Unsubscribe the reactive base FIRST so the semantic-close
      // visibility change below can't drive setState during unmount.
      super.componentWillUnmount();
    } finally {
      reg?.unregister();
    }
  }

  /** Commit-phase reconciliation: popup bridge identity + deferred
   * diagnostics. (The Other-comment adapter lifecycle lives in the
   * `DropdownOtherComment` child, keyed by question identity.) */
  private reconcile(): void {
    this.reconcileRegistration();
    this.flushDiagnostics();
  }

  /** Register/re-register the popup bridge when the (popup, stack)
   * identity changes — a question or OverlayContext prop swap retargets
   * the reactive base, and the old registration must not linger. Select
   * mode never registers (no interactive sheet). */
  private reconcileRegistration(): void {
    const stack = this.props.stack ?? null;
    const popup = this.isSelectMode
      ? null
      : (this.dropdown.dropdownListModel?.popupModel ?? null);
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

  private flushDiagnostics(): void {
    const question = this.pendingMissQuestion;
    if (!question) return;
    let reported = reportedDropdownDiagnostics.get(question);
    if (!reported) {
      reported = new Set<string>();
      reportedDropdownDiagnostics.set(question, reported);
    }
    if (this.pendingSelectMiss && !reported.has('select')) {
      reported.add('select');
      reportDiagnostic({
        code: 'dropdown-select-mode-unsupported',
        questionName: this.pendingSelectMiss,
      });
    }
    if (this.pendingComponentMiss) {
      const key = `component:${this.pendingComponentMiss}`;
      if (!reported.has(key)) {
        reported.add(key);
        reportDiagnostic({
          code: 'dropdown-input-component-missing',
          questionName: this.dropdown.name,
          componentName: this.pendingComponentMiss,
        });
      }
    }
  }

  /** Selected-value text, defensive against an unmatched persisted value
   * (no `selectedItemLocText`): loc string → raw value → placeholder. */
  private renderSelectedText(): React.JSX.Element {
    const question = this.dropdown;
    const loc = question.selectedItemLocText;
    if (loc) {
      return (
        <View testID="sv-dropdown-value">
          {SurveyElementBase.renderLocString(loc, undefined, 'dd-value')}
        </View>
      );
    }
    const raw = question.isEmpty()
      ? ''
      : String((question as { value?: unknown }).value ?? '');
    if (raw) return <Text testID="sv-dropdown-value">{raw}</Text>;
    return (
      <Text testID="sv-dropdown-placeholder">
        {question.locPlaceholder?.renderedHtml || ''}
      </Text>
    );
  }

  /** The interactive control's selected-value display. `vm` is present
   * (control mode only). */
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
      // Custom component named but unregistered: record for a deferred
      // diagnostic + fall back to the localized value text (never an
      // empty placeholder).
      this.pendingComponentMiss = question.inputFieldComponentName;
      return this.renderSelectedText();
    }
    if (question.showSelectedItemLocText) {
      return this.renderSelectedText();
    }
    if (vm.inputStringRendered) {
      return <Text testID="sv-dropdown-value">{vm.inputStringRendered}</Text>;
    }
    return (
      <Text testID="sv-dropdown-placeholder">{vm.placeholderRendered}</Text>
    );
  }

  /** `renderAs:"select"` (no interactive sheet): non-interactive value
   * display + a deferred diagnostic — never crash the survey. */
  private renderSelectModeFallback(): React.JSX.Element {
    this.pendingSelectMiss = this.dropdown.name;
    return (
      <View style={localStyles.row} testID="sv-dropdown-select-fallback">
        {this.renderSelectedText()}
      </View>
    );
  }

  private renderControl(vm: DropdownListModelLike): React.JSX.Element {
    const question = this.dropdown;
    const readOnly = question.isInputReadOnly;
    const showClear = question.allowClear && !question.isEmpty() && !readOnly;
    // a11y: mirror core's INPUT aria surface (combobox under the default
    // searchEnabled; falls to the question role when search is disabled/
    // read-only), not a hardcoded button.
    const roleCandidate = vm.ariaInputRole ?? vm.ariaQuestionRole;
    const accessibilityRole: AccessibilityRole =
      roleCandidate &&
      KNOWN_ACCESSIBILITY_ROLES.has(roleCandidate as AccessibilityRole)
        ? (roleCandidate as AccessibilityRole)
        : 'button';
    const label =
      question.locTitle?.renderedHtml || question.title || question.name;
    return (
      <View style={localStyles.row}>
        <Pressable
          ref={this.controlRef}
          testID="sv-dropdown-control"
          accessibilityRole={accessibilityRole}
          accessibilityLabel={label}
          accessibilityState={{
            disabled: readOnly,
            // ariaExpanded is a STRING ('true' | 'false').
            expanded: vm.ariaExpanded === 'true',
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
            accessibilityLabel={vm.clearCaption || 'Clear'}
            onPress={() => vm.onClear(noopEvent)}
            style={localStyles.clear}
          >
            <Text>✕</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.dropdown;
    const vm = question.dropdownListModel;
    // Clear the deferred-diagnostic buffers fresh each render so an
    // abandoned render can't leak a stale miss into a later commit; the
    // originating question travels with the buffers for per-identity
    // dedup (PR #29 review r3 #4).
    this.pendingSelectMiss = undefined;
    this.pendingComponentMiss = undefined;
    this.pendingMissQuestion = this.questionBase;
    // Mode is keyed on renderAs (a lingering VM after a runtime switch is
    // NOT a reliable signal). The Other-comment input renders in BOTH
    // modes when the "Other" choice is selected.
    const top =
      this.isSelectMode || !vm
        ? this.renderSelectModeFallback()
        : this.renderControl(vm);
    return (
      <View style={localStyles.container}>
        {top}
        {question.isShowingChoiceComment ? (
          <DropdownOtherComment
            key={String(
              (this.questionBase as unknown as { uniqueId: number }).uniqueId
            )}
            question={this.questionBase}
          />
        ) : null}
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
