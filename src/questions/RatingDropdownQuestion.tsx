/**
 * rating `displayMode:"dropdown"` (task 2.5a) — RN counterpart of
 * survey-react-ui's rating-dropdown renderer route, built on the shared
 * `OverlayControlBase` (2.5 R6). Design:
 * docs/design/2.5-rating-dropdown-buttongroup-overflow-plan.md
 * ("RECONCILED" R1/R4/R7/R8).
 *
 * - Public API is `displayMode` (R8): core maps `'dropdown'`/`'buttons'`
 *   to `renderAs` at load AND on runtime change
 *   (`updateRenderAsBasedOnDisplayMode`). The descriptor table's
 *   renderer-route row (("rating","dropdown") → "sv-rating-dropdown",
 *   same mechanism as boolean 1.13) makes `getComponentName()` resolve
 *   this component and `isDefaultRendering()` go false, so the EXISTING
 *   SurveyRowElement dispatch routes here — no new dispatch code (R1).
 * - The overlay rows come from the SAME dropdownListModel + sv-list/
 *   ListPicker popup dropdown/tagbox use (`popupModel.
 *   contentComponentName === 'sv-list'`). Core stamps
 *   `sv-rating-dropdown-item` on EVERY list action in dropdown mode
 *   (probe-verified 2026-07-19), and the min/max actions additionally
 *   carry a `description` LocalizableString (minRateDescription/
 *   maxRateDescription) — upstream registers that key as the LIST ROW
 *   content (title + optional description). The RN counterpart is
 *   `RatingDropdownItemContent` below, registered through the
 *   descriptor table's element route (external review C3; before that
 *   the title-only ListPicker fallback silently dropped the
 *   descriptions). The COLLAPSED display renders here directly.
 * - Collapsed value (R7): core's `readOnlyText` when read-only →
 *   `selectedItemLocText` via the LocString renderer → the core
 *   placeholder (`vm.placeholderRendered`). Same fold as
 *   ButtonGroupQuestion's compact control (rating has no
 *   input-component tier either — upstream's rating-dropdown-item
 *   renders the loc text directly).
 * - Mode is keyed on `question.renderAs` (isOverlayMode), never on VM
 *   presence: core RETAINS the lazily-built `dropdownListModel` after a
 *   runtime flip back to buttons (R5). Outside overlay mode this
 *   component renders an inert placeholder View — through the real
 *   dispatch chain a renderAs flip re-routes to the "rating" template
 *   row (RatingQuestion) on the same render pass, so that branch is
 *   only reachable when the class is mounted directly.
 * - Render purity (M1, 6c1eb79 pattern): render, `getStateElements`,
 *   and `getOverlayPopup` read ONLY the non-creating
 *   `dropdownListModelValue` backing field. The CREATING
 *   `dropdownListModel` getter is touched exclusively by the DEFERRED
 *   (one-microtask) ensure scheduled from the commit lifecycles —
 *   rating has no measurement seam, and core's displayMode→renderAs
 *   mapping never constructs the VM itself, so nothing else would.
 *   Probe-verified: construction fires 7 property notifications ON THE
 *   QUESTION, so a synchronous componentDidMount construction would
 *   land in this component's own fresh subscription inside the
 *   mount-commit window (0.4 D4 dev invariant). Consequence: in
 *   dropdown mode the collapsed control appears one microtask after
 *   mount (the inert placeholder renders for that single tick).
 * - a11y mirrors core's INPUT aria surface through the base's shared
 *   opener bundle (R6): rating-dropdown has no search input
 *   (`searchEnabled` false), so the role clamp falls to
 *   `ariaQuestionRole` — `combobox`; `vm.ariaExpanded` is a STRING
 *   ('true' | 'false') the VM re-emits on open/close; the label is the
 *   base's title fold.
 * - Clear: the base's shared clear gate (`allowClear` +
 *   `clearCaption` + `onClear(overlayNoopEvent)`; R6).
 */
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type {
  Base,
  LocalizableString,
  PopupModel,
  Question,
} from '../core/facade';
import { getResponsivenessMeasurer } from '../core/processResponsiveness';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { OverlayControlBase } from '../reactivity/OverlayControlBase';
import type { OverlayControlProps } from '../reactivity/OverlayControlBase';
import { OverlayContext } from '../overlay/OverlayContext';

/** The slice of core's `DropdownListModel` this control consumes. */
interface RatingDropdownListModelLike {
  popupModel: PopupModel;
  onClick(): void;
  onClear(event: { preventDefault(): void; stopPropagation(): void }): void;
  placeholderRendered: string;
  // core's INPUT aria surface. ariaExpanded is a STRING
  // ('true' | 'false'), NOT a boolean.
  ariaInputRole?: string;
  ariaQuestionRole?: string;
  ariaExpanded?: string;
  clearCaption?: string;
}

interface RatingDropdownModelLike extends Question {
  renderAs: string;
  /** Public API. `"auto"` mounts the flip-back measurement seam below;
   * `"dropdown"` (always collapsed) never does (task 2.5c). */
  displayMode: string;
  allowClear: boolean;
  isInputReadOnly: boolean;
  readOnlyText: string;
  showSelectedItemLocText: boolean;
  selectedItemLocText?: LocalizableString;
  /** Lazy CREATING getter — creates only while `renderAs === 'dropdown'`;
   * core retains the instance after a flip back (R5). Touched only
   * OUTSIDE render (the deferred ensure below — render purity). */
  dropdownListModel?: RatingDropdownListModelLike;
  /** Core's NON-CREATING backing field — the only VM read that render,
   * `getStateElements`, and `getOverlayPopup` ever make. Watchlisted as
   * `QuestionRatingModel.dropdownListModelValue`. */
  dropdownListModelValue?: RatingDropdownListModelLike;
}

export interface RatingDropdownQuestionElementProps extends QuestionElementBaseProps {}

/** The slice of a core rating list action `RatingDropdownItemContent`
 * consumes: the localized title every action carries, plus the
 * `description` LocalizableString present ONLY on the min/max actions
 * (from minRateDescription/maxRateDescription — probe-verified). */
export interface RatingDropdownItemContentProps {
  item: {
    id?: string | number;
    title: string;
    description?: LocalizableString;
  };
}

/** Overlay row content for `sv-rating-dropdown-item` (external review
 * C3) — the RN counterpart of web's registered rating-dropdown-item
 * (survey-react-ui components/rating/rating-dropdown-item.tsx: title +
 * optional description). ListPicker dispatches each row's
 * `item.component` through `RNElementFactory`; the row itself stays
 * ListPicker's (press/a11y/recipe state) — this is content only, same
 * split as `ListItemGroupContent`. Title-only when no description. */
export function RatingDropdownItemContent(
  props: RatingDropdownItemContentProps
): React.JSX.Element {
  const item = props.item;
  return (
    <View testID={`sv-rating-dropdown-item-${item.id}`}>
      <Text>{item.title}</Text>
      {item.description ? (
        <View testID={`sv-rating-dropdown-item-description-${item.id}`}>
          {SurveyElementBase.renderLocString(
            item.description,
            undefined,
            'rating-dd-item-description',
            'choice'
          )}
        </View>
      ) : null}
    </View>
  );
}

/** OverlayContext binding for the renderer-route descriptor row (R4 —
 * class components spend their single contextType on the theme; same
 * pattern as DropdownQuestionElement). The row MUST point here, not at
 * the class: without the stack the opener would toggle the PopupModel
 * with no RN Modal registered. */
export function RatingDropdownQuestionElement(
  props: RatingDropdownQuestionElementProps
): React.JSX.Element {
  const stack = React.useContext(OverlayContext);
  return (
    <RatingDropdownQuestion
      question={props.question}
      creator={props.creator}
      stack={stack ?? undefined}
    />
  );
}

export class RatingDropdownQuestion extends OverlayControlBase<OverlayControlProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected getStateElements(): Base[] {
    // Question AND view model: allowClear/readOnly/placeholder change on
    // the QUESTION; ariaExpanded re-emits on the VM (open/close). Read
    // through the NON-CREATING backing field: this runs from render
    // (getRenderedElements) AND the commit lifecycles, and must never be
    // a construction point (render purity; construction lives in the
    // deferred ensure below).
    if (!this.isOverlayMode()) return [this.questionBase];
    const vm = this.rating.dropdownListModelValue as unknown as
      Base | undefined;
    return vm ? [this.questionBase, vm] : [this.questionBase];
  }

  private get rating(): RatingDropdownModelLike {
    return this.questionBase as unknown as RatingDropdownModelLike;
  }

  /** Overlay-mode gate for `OverlayControlBase` — keyed on `renderAs`
   * (core retains the VM after a runtime flip back to buttons; R5). */
  protected isOverlayMode(): boolean {
    return this.rating.renderAs === 'dropdown';
  }

  // ——— displayMode:"auto" flip-BACK measurement seam (task 2.5c) ———
  // When an "auto" rating is collapsed, RatingQuestion has unmounted, so
  // the buttons ScrollView that measures the intrinsic required width is
  // gone. The required width RatingQuestion measured before the collapse
  // is carried on the shared per-question measurer; the collapsed control
  // only needs the live available width, so its always-mounted wrapper's
  // onLayout feeds that and CORE flips renderAs back to "default" (→ the
  // dispatch swaps back to the buttons view) once it fits again. Only
  // mounted while `displayMode === 'auto'`, so `"dropdown"` (always
  // collapsed) renders exactly the 2.5a control with no measurement.
  private handleWrapperLayout = (event: LayoutChangeEvent): void => {
    getResponsivenessMeasurer(
      this.questionBase as unknown as Question
    ).reportAvailableWidth(event.nativeEvent.layout.width);
  };

  // `getOverlayPopup` is the base default: the NON-CREATING
  // `dropdownListModelValue?.popupModel` read (2.5fu backport made the
  // default itself non-creating, so the former override collapsed).
  // Construction belongs to the deferred ensure below exclusively.

  // ——— Deferred VM materialization (M1 render purity) ———
  // Rating has NO measurement seam (unlike buttongroup's onLayout /
  // onContentSizeChange handlers), and core's displayMode→renderAs
  // mapping does NOT construct the VM (probe-verified 2026-07-19: a
  // runtime displayMode flip only sets renderAs; `onBeforeSetCompactRenderer`
  // runs from processResponsiveness, which rating-dropdown never drives).
  // So the component must materialize the VM itself — but NOT
  // synchronously in componentDidMount: `new DropdownListModel(question)`
  // fires 7 property notifications ON THE QUESTION (visibleChoices,
  // errors, cssRoot/Header/Content/Description/Error — probe-verified),
  // which would land in this component's own just-made subscription
  // inside the mount-commit window and trip the 0.4 D4 dev invariant.
  // Deferred one microtask, the construction lands outside render and
  // outside any commit; until it runs the component renders the inert
  // placeholder View for that single tick.
  private ensureScheduled = false;
  private ensureUnmounted = false;

  componentDidMount(): void {
    super.componentDidMount();
    // React 19 StrictMode (dev) replays the mount lifecycles on the SAME
    // instance (didMount → willUnmount → didMount): clear the unmount
    // latch on every (re)mount or the deferred ensure below would bail
    // forever after the simulated unmount (external review C1). A
    // still-pending microtask from the pre-replay didMount re-checks all
    // conditions itself, so leaving `ensureScheduled` untouched is safe
    // in either interleaving.
    this.ensureUnmounted = false;
    this.scheduleEnsureOverlayViewModel();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    // Covers the runtime buttons→dropdown flip when this class is hosted
    // directly (through real Survey dispatch a renderAs flip REMOUNTS the
    // element, landing in componentDidMount above) and a question prop
    // swap to a dropdown-mode rating.
    this.scheduleEnsureOverlayViewModel();
  }

  componentWillUnmount(): void {
    this.ensureUnmounted = true;
    super.componentWillUnmount();
  }

  private scheduleEnsureOverlayViewModel(): void {
    const question = this.rating;
    if (!this.isOverlayMode() || question.dropdownListModelValue) return;
    if (this.ensureScheduled) return;
    this.ensureScheduled = true;
    queueMicrotask(() => {
      this.ensureScheduled = false;
      if (this.ensureUnmounted) return;
      if (!this.isOverlayMode() || this.rating.dropdownListModelValue) return;
      // The CREATING getter — re-render only if it actually materialized
      // (the forceUpdate is deliberate: construction notifications alone
      // are core-version incidentals, not a re-render contract).
      if (this.rating.dropdownListModel) this.forceUpdate();
    });
  }

  /** Collapsed value (R7): readOnlyText → selected item locText →
   * placeholder. `showSelectedItemLocText` already excludes readOnly,
   * so the order is safe. */
  private renderCollapsedValue(
    vm: RatingDropdownListModelLike
  ): React.JSX.Element {
    const question = this.rating;
    if (question.isInputReadOnly && question.readOnlyText) {
      return (
        <Text testID="sv-rating-dropdown-readonly">
          {question.readOnlyText}
        </Text>
      );
    }
    if (question.showSelectedItemLocText && question.selectedItemLocText) {
      return (
        <View testID="sv-rating-dropdown-value">
          {SurveyElementBase.renderLocString(
            question.selectedItemLocText,
            undefined,
            'rating-dd-value',
            'choice'
          )}
        </View>
      );
    }
    return (
      <Text testID="sv-rating-dropdown-placeholder">
        {vm.placeholderRendered}
      </Text>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.rating;
    // NON-CREATING read (render purity): in dropdown mode the VM is
    // materialized by the deferred ensure (one microtask after the mount/
    // update commit) — until then this renders the inert placeholder View
    // below for a single tick. Outside dropdown mode the branch is only
    // reachable when the class is mounted outside the dispatch chain (a
    // runtime mode flip re-routes dispatch to the "rating" template row).
    const vm = this.isOverlayMode()
      ? question.dropdownListModelValue
      : undefined;
    const readOnly = question.isInputReadOnly;
    const inner = !vm ? (
      <View
        style={localStyles.row}
        testID={`sv-rating-dropdown-fallback-${question.name}`}
      />
    ) : (
      <View style={localStyles.row}>
        <Pressable
          ref={this.controlRef}
          testID={`sv-rating-dropdown-${question.name}`}
          // a11y: the shared base bundle (combobox role clamp,
          // title-label fold, STRING ariaExpanded → boolean; R6).
          {...this.buildOverlayOpenerA11y(vm)}
          disabled={readOnly}
          onPress={readOnly ? undefined : () => vm.onClick()}
          style={localStyles.control}
        >
          {this.renderCollapsedValue(vm)}
          <Text accessibilityElementsHidden style={localStyles.chevron}>
            {'▾'}
          </Text>
        </Pressable>
        {this.renderOverlayClear(
          vm,
          `sv-rating-dropdown-clear-${question.name}`
        )}
      </View>
    );
    // displayMode:"auto" wraps the collapsed control in the always-mounted
    // flip-back measure wrapper; displayMode:"dropdown" renders the 2.5a
    // control directly (never measures, never flips back).
    if (question.displayMode !== 'auto') return inner;
    return (
      <View
        testID={`sv-rating-measure-wrapper-${question.name}`}
        onLayout={this.handleWrapperLayout}
        style={localStyles.measureWrapper}
      >
        {inner}
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  // The always-mounted flip-back measure wrapper (displayMode:"auto"
  // only): reports the live available width via onLayout while collapsed.
  measureWrapper: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center' },
  control: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: { marginStart: 8 },
});
