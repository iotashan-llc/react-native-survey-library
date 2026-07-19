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
 * - Popup bridge lifecycle (register/reconcile/teardown), `controlRef`,
 *   the combobox role clamp, the opener a11y bundle (title-label fold +
 *   STRING `ariaExpanded` → boolean conversion), and the clear gate
 *   (`allowClear`/`clearCaption`/`onClear`) live in `OverlayControlBase`
 *   (task 2.5 R6); this class supplies `isOverlayMode`
 *   (`renderAs !== 'select'`) and `flushOverlayDiagnostics` (PR #29
 *   review r1 #3, r2 #3).
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
 * - Render purity (2.5fu backport of the 2.5 discipline): render,
 *   `getStateElements`, and the base's `getOverlayPopup` read ONLY the
 *   non-creating `dropdownListModelValue` backing field. The CREATING
 *   `dropdownListModel` getter is touched exclusively by the DEFERRED
 *   (one-microtask) ensure scheduled from the commit lifecycles
 *   (StrictMode-safe: the unmount latch resets on every (re)mount).
 *   Until it runs, a VM-free pending frame renders the question-level
 *   R7 fold (readOnlyText → selectedItemLocText → raw value →
 *   placeholder — probe-verified non-creating) for a single tick.
 *   Select mode never constructs (core's `useDropdownList` gate never
 *   would either).
 * - Clear: `dropdownListModel.onClear(event)` — core dereferences only
 *   preventDefault/stopPropagation (synthetic no-ops).
 */
import * as React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AccessibilityRole } from 'react-native';
import type { Base, Question } from '../core/facade';
import { Helpers } from '../core/facade';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { OverlayControlBase } from '../reactivity/OverlayControlBase';
import type { OverlayControlProps } from '../reactivity/OverlayControlBase';
import { RNElementFactory } from '../factories/ElementFactory';
import { OverlayContext } from '../overlay/OverlayContext';
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
  /** Lazy CREATING getter — core gates it on `useDropdownList`
   * (`renderAs !== 'select'`), so select mode never constructs. Touched
   * only OUTSIDE render (the deferred ensure — render purity). */
  dropdownListModel?: DropdownListModelLike;
  /** Core's NON-CREATING backing field — the only VM read that render,
   * `getStateElements`, and the base's `getOverlayPopup` ever make.
   * Watchlisted as the `dropdownListModelValue` backing field
   * (question_dropdown.ts). */
  dropdownListModelValue?: DropdownListModelLike;
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
export function DropdownOtherComment(props: {
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

interface DropdownQuestionProps extends OverlayControlProps {}

export class DropdownQuestion extends OverlayControlBase<DropdownQuestionProps> {
  // Commit-phase diagnostic buffers (never reported from render). Cleared
  // fresh each render; the originating question travels with them so a
  // prop swap can't cross-suppress. Dedup is per-question-identity.
  private pendingSelectMiss: string | undefined;
  private pendingComponentMiss: string | undefined;
  private pendingMissQuestion: Question | undefined;

  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected getStateElements(): Base[] {
    // Question AND view model: allowClear/readOnly/placeholder/
    // isShowingChoiceComment change on the QUESTION; list state AND
    // ariaExpanded (the VM re-emits it on open/close) change on the VM.
    // Select mode is non-interactive — the VM (if it lingers) is unused.
    // Read through the NON-CREATING backing field: this runs from render
    // (getRenderedElements) AND the commit lifecycles, and must never be
    // a construction point (render purity; construction lives in the
    // deferred ensure below).
    if (this.isSelectMode) return [this.questionBase];
    const model = this.dropdown.dropdownListModelValue as unknown as
      Base | undefined;
    return model ? [this.questionBase, model] : [this.questionBase];
  }

  private get dropdown(): DropdownQuestionModelLike {
    return this.questionBase as unknown as DropdownQuestionModelLike;
  }

  private get isSelectMode(): boolean {
    return this.dropdown.renderAs === 'select';
  }

  /** Overlay-mode gate for `OverlayControlBase` — keyed on `renderAs`
   * (a lingering VM after a runtime `renderAs:"select"` switch is NOT a
   * reliable signal; R5). Select mode never registers a sheet. */
  protected isOverlayMode(): boolean {
    return !this.isSelectMode;
  }

  // ——— Deferred VM materialization (2.5fu render-purity backport) ———
  // Core's creating getter fires construction property notifications ON
  // THE QUESTION, so a synchronous construction in render OR the
  // mount-commit window would land in this component's own fresh
  // subscription and trip the 0.4 D4 dev invariant (probe-verified for
  // rating/buttongroup; same DropdownListModel construction path).
  // Deferred one microtask, construction lands outside render and
  // outside any commit; until it runs the component renders the VM-free
  // pending frame below for that single tick. Select mode never
  // schedules (and core's `useDropdownList` gate never constructs there
  // anyway).
  private ensureScheduled = false;
  private ensureUnmounted = false;

  componentDidMount(): void {
    super.componentDidMount();
    // React 19 StrictMode (dev) replays the mount lifecycles on the SAME
    // instance (didMount → willUnmount → didMount): clear the unmount
    // latch on every (re)mount or the deferred ensure below would bail
    // forever after the simulated unmount (mirror of external review
    // C1). A still-pending microtask from the pre-replay didMount
    // re-checks all conditions itself, so leaving `ensureScheduled`
    // untouched is safe in either interleaving.
    this.ensureUnmounted = false;
    this.scheduleEnsureOverlayViewModel();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    // Covers a question prop swap and a runtime select → overlay
    // renderAs flip (this class self-branches on renderAs — no remount).
    this.scheduleEnsureOverlayViewModel();
  }

  componentWillUnmount(): void {
    this.ensureUnmounted = true;
    super.componentWillUnmount();
  }

  private scheduleEnsureOverlayViewModel(): void {
    const question = this.dropdown;
    if (!this.isOverlayMode() || question.dropdownListModelValue) return;
    if (this.ensureScheduled) return;
    this.ensureScheduled = true;
    queueMicrotask(() => {
      this.ensureScheduled = false;
      if (this.ensureUnmounted) return;
      if (!this.isOverlayMode() || this.dropdown.dropdownListModelValue) {
        return;
      }
      // The CREATING getter — re-render only if it actually materialized
      // (the forceUpdate is deliberate: construction notifications alone
      // are core-version incidentals, not a re-render contract).
      if (this.dropdown.dropdownListModel) this.forceUpdate();
    });
  }

  /** Deferred diagnostics, flushed by the base from the commit phase.
   * (The Other-comment adapter lifecycle lives in the
   * `DropdownOtherComment` child, keyed by question identity.) */
  protected flushOverlayDiagnostics(): void {
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

  /** The one-microtask pre-materialization frame (render purity): the
   * VM does not exist yet, so render the R7 fold from QUESTION-level
   * members only — probe-verified NON-creating: `isInputReadOnly`,
   * `readOnlyText`, `selectedItemLocText`, `value`, `locPlaceholder` —
   * NEVER `showSelectedItemLocText` (its fold evaluates the CREATING
   * getter once a value is set) and never the custom input-component
   * tier (it needs `vm.getSelectedAction()`; it appears one tick later
   * with the real control). Non-interactive for the single tick; no
   * diagnostics (this is overlay mode, not the select fallback). */
  private renderPendingControl(): React.JSX.Element {
    const question = this.dropdown;
    return (
      <View style={localStyles.row} testID="sv-dropdown-control-pending">
        {question.isInputReadOnly && question.readOnlyText ? (
          <Text testID="sv-dropdown-readonly">{question.readOnlyText}</Text>
        ) : (
          this.renderSelectedText()
        )}
        <Text accessibilityElementsHidden style={localStyles.chevron}>
          {'▾'}
        </Text>
      </View>
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
    return (
      <View style={localStyles.row}>
        <Pressable
          ref={this.controlRef}
          testID="sv-dropdown-control"
          // a11y: core's INPUT aria surface (combobox role clamp, the
          // title-label fold, STRING ariaExpanded → boolean) — the
          // shared base bundle (R6).
          {...this.buildOverlayOpenerA11y(vm)}
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
        {this.renderOverlayClear(vm, 'sv-dropdown-clear')}
      </View>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.dropdown;
    // NON-CREATING read (render purity): in overlay mode the VM is
    // materialized by the deferred ensure (one microtask after the
    // mount/update commit) — until then the VM-free pending frame below
    // renders for a single tick.
    const vm = this.isSelectMode ? undefined : question.dropdownListModelValue;
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
    const top = this.isSelectMode
      ? this.renderSelectModeFallback()
      : vm
        ? this.renderControl(vm)
        : this.renderPendingControl();
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
  other: { marginTop: 8 },
});
