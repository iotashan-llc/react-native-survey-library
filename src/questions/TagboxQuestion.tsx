/**
 * `tagbox` question (task 2.4) — the MULTI-SELECT sibling of `dropdown`,
 * over the same 2.1 overlay primitives. Plan:
 * docs/design/2.4-tagbox-plan.md.
 *
 * Shares 2.3's overlay machinery (bridge register/reconcile,
 * opener-focus, unsubscribe-then-close teardown, combobox a11y with the
 * STRING `ariaExpanded` + the title-label fold, and the clear gate)
 * via `OverlayControlBase` (task 2.5 R6).
 * Tagbox-specific (PR #30 review r1):
 * - `question.value` is an ARRAY. Chips come from the PUBLIC
 *   `question.selectedChoices` (ItemValues — excludes the synthetic
 *   Select-All action `getSelectedActions()` would include, and carries
 *   the real per-item value/text/renderedId for any storage shape).
 * - A chip's ✕ removes just that item through core:
 *   `dropdownListModel.deselectItem(choice.value)` (operates on
 *   `renderedValue` with core's data-shape translation — a raw
 *   `value.filter` breaks under `valuePropertyName` / Other storage).
 * - Adding: overlay row taps toggle membership via core's
 *   `listModel.onItemClick`; the sheet stays open (core doesn't hide the
 *   popup per-select). The 2.1 ListPicker is unchanged.
 * - Mode is keyed on `question.renderAs`, NOT VM presence: core builds
 *   `dropdownListModel` for a tagbox regardless of `renderAs`, so
 *   `"select"` degrades to a non-interactive chips display + diagnostic.
 * - "Other (describe)" reuses the dropdown's `DropdownOtherComment`
 *   child (keyed by question identity).
 * - a11y: the labeled combobox opener is a SEPARATE Pressable from the
 *   chips — chip remove buttons are independently-focusable siblings,
 *   not nested inside the accessible opener (RN groups descendants of an
 *   accessible Pressable).
 * - Render purity (2.5fu backport of the 2.5 discipline): render,
 *   `getStateElements`, and the base's `getOverlayPopup` read ONLY the
 *   non-creating `dropdownListModelValue` backing field. The CREATING
 *   `dropdownListModel` getter is touched exclusively by the DEFERRED
 *   (one-microtask) ensure scheduled from the commit lifecycles
 *   (StrictMode-safe: the unmount latch resets on every (re)mount) and
 *   by event handlers (chip remove). Until the ensure runs, a VM-free
 *   pending frame renders chips + placeholder (both question-level,
 *   probe-verified non-creating) for a single tick — the committed
 *   value never blinks. Select mode never constructs: core's tagbox
 *   getter has NO renderAs gate, so this renderer discipline is the
 *   only thing keeping a select-mode mount construction-free.
 */
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AccessibilityRole } from 'react-native';
import type { Base, Question } from '../core/facade';
import { Helpers } from '../core/facade';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { OverlayControlBase } from '../reactivity/OverlayControlBase';
import type { OverlayControlProps } from '../reactivity/OverlayControlBase';
import { OverlayContext } from '../overlay/OverlayContext';
import { DropdownOtherComment } from './DropdownQuestion';
import { reportDiagnostic } from '../diagnostics';

interface SelectedChoiceLike {
  value: unknown;
  text: string;
  renderedId: string | number;
}

interface TagboxListModelLike {
  popupModel: InstanceType<typeof import('../core/facade').PopupModel>;
  onClick(): void;
  onClear(event: { preventDefault(): void; stopPropagation(): void }): void;
  deselectItem(value: unknown): void;
  placeholderRendered: string;
  ariaInputRole?: AccessibilityRole | string;
  ariaQuestionRole?: AccessibilityRole | string;
  ariaExpanded?: string;
  clearCaption?: string;
}

interface TagboxQuestionModelLike extends Question {
  /** Lazy CREATING getter — unlike dropdown's, core gates it on NOTHING
   * (it constructs even in select mode), so the renderer's discipline is
   * the only gate. Touched only OUTSIDE render (the deferred ensure and
   * the chip-remove/press event handlers — render purity). */
  dropdownListModel?: TagboxListModelLike;
  /** Core's NON-CREATING backing field — the only VM read that render,
   * `getStateElements`, and the base's `getOverlayPopup` ever make.
   * Watchlisted as the `dropdownListModelValue` backing field
   * (question_tagbox.ts). */
  dropdownListModelValue?: TagboxListModelLike;
  renderAs: string;
  allowClear: boolean;
  isInputReadOnly: boolean;
  isOtherSelected: boolean;
  selectedChoices: SelectedChoiceLike[];
  selectedItemLocText?: import('../core/facade').LocalizableString;
}

const reportedTagboxSelectMode = new WeakMap<Question, boolean>();

export interface TagboxQuestionElementProps extends QuestionElementBaseProps {}

/** OverlayContext binding (class components spend their contextType on
 * the theme — same pattern as DropdownQuestionElement). */
export function TagboxQuestionElement(
  props: TagboxQuestionElementProps
): React.JSX.Element {
  const stack = React.useContext(OverlayContext);
  return (
    <TagboxQuestion
      question={props.question}
      creator={props.creator}
      stack={stack ?? undefined}
    />
  );
}

interface TagboxQuestionProps extends OverlayControlProps {}

export class TagboxQuestion extends OverlayControlBase<TagboxQuestionProps> {
  private pendingSelectMiss = false;

  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected getStateElements(): Base[] {
    // Keep the VM as a state element in BOTH modes WHEN IT EXISTS (a
    // select-mode fallback with a lingering VM from a runtime flip must
    // not go stale — PR #30 review r2 #2; select mode only suppresses
    // overlay registration + interaction, not reactivity). Read through
    // the NON-CREATING backing field: this runs from render
    // (getRenderedElements) AND the commit lifecycles, and must never be
    // a construction point (render purity). A select-mode MOUNT never
    // builds a VM at all — placeholder reactivity then rides the
    // question's own property notifications (r2 #2 stays pinned green).
    const model = this.tagbox.dropdownListModelValue as unknown as
      Base | undefined;
    return model ? [this.questionBase, model] : [this.questionBase];
  }

  private get tagbox(): TagboxQuestionModelLike {
    return this.questionBase as unknown as TagboxQuestionModelLike;
  }

  private get isSelectMode(): boolean {
    return this.tagbox.renderAs === 'select';
  }

  /** Overlay-mode gate for `OverlayControlBase` — keyed on `renderAs`
   * (select mode never registers an overlay; non-interactive). */
  protected isOverlayMode(): boolean {
    return !this.isSelectMode;
  }

  // ——— Deferred VM materialization (2.5fu render-purity backport) ———
  // Core's creating getter fires construction property notifications ON
  // THE QUESTION, so a synchronous construction in render OR the
  // mount-commit window would land in this component's own fresh
  // subscription and trip the 0.4 D4 dev invariant (probe-verified for
  // rating/buttongroup; tagbox constructs the same DropdownListModel
  // family). Deferred one microtask, construction lands outside render
  // and outside any commit; until it runs the component renders the
  // VM-free pending frame below (chips + placeholder — no regression)
  // for that single tick. Select mode never schedules — and since the
  // tagbox creating getter has NO renderAs gate in core, this renderer
  // discipline is what keeps a select-mode mount construction-free.
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
    const question = this.tagbox;
    if (!this.isOverlayMode() || question.dropdownListModelValue) return;
    if (this.ensureScheduled) return;
    this.ensureScheduled = true;
    queueMicrotask(() => {
      this.ensureScheduled = false;
      if (this.ensureUnmounted) return;
      if (!this.isOverlayMode() || this.tagbox.dropdownListModelValue) {
        return;
      }
      // The CREATING getter — re-render only if it actually materialized
      // (the forceUpdate is deliberate: construction notifications alone
      // are core-version incidentals, not a re-render contract).
      if (this.tagbox.dropdownListModel) this.forceUpdate();
    });
  }

  protected flushOverlayDiagnostics(): void {
    if (!this.pendingSelectMiss) return;
    const q = this.questionBase;
    if (reportedTagboxSelectMode.get(q)) return;
    reportedTagboxSelectMode.set(q, true);
    reportDiagnostic({
      code: 'tagbox-select-mode-unsupported',
      questionName: this.tagbox.name,
    });
  }

  private removeValue(value: unknown): void {
    // Remove through core so it translates the data shape (valuePropertyName,
    // Other storage) — a raw value.filter would miss those.
    this.tagbox.dropdownListModel?.deselectItem(value);
  }

  /** One chip PER `renderedValue` entry (the normalized primitive array
   * core's `deselectItem` operates on). Each entry is matched to a
   * `selectedChoices` item for its display text/id; an UNMATCHED entry
   * (persisted value absent from choices, under keepIncorrectValues) gets
   * a raw chip — so a mixed matched/unmatched value never hides stored
   * data, and valuePropertyName storage objects never leak as
   * `[object Object]` (PR #30 review r2 #3, r3 #1/#2). Removal always
   * passes the `renderedValue` entry to `deselectItem`. `interactive`
   * adds the ✕. */
  private renderChips(interactive: boolean): React.JSX.Element[] {
    const question = this.tagbox;
    const removable = interactive && !question.isInputReadOnly;
    const rendered = question.renderedValue;
    const entries = Array.isArray(rendered) ? rendered : [];
    const choices = question.selectedChoices;
    return entries.map((entry, i) => {
      // Case-sensitive, no-trim match — isTwoValueEquals DEFAULTS are
      // case-insensitive + trim, which would false-match distinct values
      // like 'A'/'a' that selectedChoices keeps separate (PR #30 review
      // r4). Args: (a, b, ignoreOrder=false, caseSensitive=true, trim=false).
      const choice = choices.find((c) =>
        Helpers.isTwoValueEquals(c.value, entry, false, true, false)
      );
      if (choice) {
        return this.renderChip(
          String(choice.renderedId),
          entry,
          choice.text,
          removable
        );
      }
      return this.renderChip(
        `raw-${i}-${String(entry)}`,
        entry,
        String(entry),
        removable
      );
    });
  }

  private renderChip(
    key: string,
    value: unknown,
    text: string,
    removable: boolean
  ): React.JSX.Element {
    return (
      <View
        key={key}
        testID={`sv-tagbox-chip-${String(value)}`}
        style={localStyles.chip}
      >
        <Text style={localStyles.chipText}>{text}</Text>
        {removable ? (
          <Pressable
            testID={`sv-tagbox-chip-remove-${String(value)}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${text}`}
            onPress={() => this.removeValue(value)}
            style={localStyles.chipRemove}
          >
            <Text>✕</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  /** `renderAs:"select"` (no native multi-select): non-interactive chips
   * display + a deferred one-shot diagnostic. Placeholder only when the
   * value is genuinely empty (PR #30 review r2 #3) — rendered through
   * the LocString viewer, which subscribes to the loc string itself: a
   * select-mode MOUNT never constructs the VM (render-purity backport),
   * so the placeholder can no longer ride a VM state-element
   * subscription and must stay live on its own (r2 #2). */
  private renderSelectTop(): React.JSX.Element {
    this.pendingSelectMiss = true;
    const question = this.tagbox;
    return (
      <View testID="sv-tagbox-select-fallback" style={localStyles.chipsRow}>
        {question.isEmpty() ? (
          <View testID="sv-tagbox-placeholder">
            {question.locPlaceholder ? (
              SurveyElementBase.renderLocString(
                question.locPlaceholder,
                undefined,
                'tb-select-placeholder'
              )
            ) : (
              <Text>{''}</Text>
            )}
          </View>
        ) : (
          this.renderChips(false)
        )}
      </View>
    );
  }

  /** The one-microtask pre-materialization frame (render purity): the
   * VM does not exist yet, so render everything QUESTION-level — chips
   * come from `renderedValue`/`selectedChoices` and the placeholder from
   * `locPlaceholder` (probe-verified non-creating) — so the committed
   * value never blinks. Chip removal stays live (`deselectItem` runs in
   * an event handler, outside render). The opener a11y bundle, press
   * handler, and clear affordance need the VM and appear one tick later
   * with the real interactive control. No diagnostics (this is overlay
   * mode, not the select fallback). */
  private renderPendingTop(): React.JSX.Element {
    const question = this.tagbox;
    return (
      <View testID="sv-tagbox-pending" style={localStyles.chipsRow}>
        {question.isEmpty() ? (
          // Same self-subscribing viewer treatment as the select fallback
          // (r2 #2) — never raw renderedHtml text (external review 2.5fu).
          <View testID="sv-tagbox-placeholder">
            {question.locPlaceholder ? (
              SurveyElementBase.renderLocString(
                question.locPlaceholder,
                undefined,
                'tb-pending-placeholder'
              )
            ) : (
              <Text>{''}</Text>
            )}
          </View>
        ) : (
          this.renderChips(true)
        )}
      </View>
    );
  }

  private renderInteractive(vm: TagboxListModelLike): React.JSX.Element {
    const question = this.tagbox;
    const readOnly = question.isInputReadOnly;
    const empty = question.isEmpty();
    return (
      <View style={localStyles.row}>
        {/* Chips are SIBLINGS of the accessible opener so their remove
            buttons stay independently focusable (RN groups descendants of
            an accessible Pressable). */}
        <View style={localStyles.chipsRow}>
          {this.renderChips(true)}
          <Pressable
            ref={this.controlRef}
            testID="sv-tagbox-control"
            // a11y: the shared base bundle (combobox role clamp,
            // title-label fold, STRING ariaExpanded → boolean; R6).
            {...this.buildOverlayOpenerA11y(vm)}
            disabled={readOnly}
            onPress={readOnly ? undefined : () => vm.onClick()}
            style={localStyles.opener}
          >
            {empty ? (
              <Text testID="sv-tagbox-placeholder" style={localStyles.flex}>
                {vm.placeholderRendered}
              </Text>
            ) : null}
            <Text accessibilityElementsHidden style={localStyles.chevron}>
              {'▾'}
            </Text>
          </Pressable>
        </View>
        {this.renderOverlayClear(vm, 'sv-tagbox-clear')}
      </View>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.tagbox;
    this.pendingSelectMiss = false;
    // NON-CREATING read (render purity): in overlay mode the VM is
    // materialized by the deferred ensure (one microtask after the
    // mount/update commit) — until then the VM-free pending frame below
    // renders for a single tick.
    const vm = this.isSelectMode ? undefined : question.dropdownListModelValue;
    // Mode-specific top; the "Other" comment renders beneath in BOTH modes
    // (select-mode Other still needs its editor — PR #30 review r2 #1).
    const top = this.isSelectMode
      ? this.renderSelectTop()
      : vm
        ? this.renderInteractive(vm)
        : this.renderPendingTop();
    return (
      <View style={localStyles.container}>
        {top}
        {question.isOtherSelected ? (
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
  chipsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  opener: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 48,
  },
  flex: { flex: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
  },
  chipText: { marginRight: 4 },
  chipRemove: { padding: 2 },
  chevron: { marginLeft: 8 },
});
