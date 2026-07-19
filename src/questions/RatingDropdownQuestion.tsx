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
 *   contentComponentName === 'sv-list'`). `question.itemComponent`
 *   (`sv-rating-dropdown-item`) is web's COLLAPSED selected-value
 *   display, not an overlay row — nothing is registered for it; the
 *   collapsed display renders here directly.
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
import type {
  Base,
  LocalizableString,
  PopupModel,
  Question,
} from '../core/facade';
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
  allowClear: boolean;
  isInputReadOnly: boolean;
  readOnlyText: string;
  showSelectedItemLocText: boolean;
  selectedItemLocText?: LocalizableString;
  /** Lazy: the getter CREATES only while `renderAs === 'dropdown'`;
   * core retains the instance after a flip back (R5). */
  dropdownListModel?: RatingDropdownListModelLike;
}

export interface RatingDropdownQuestionElementProps extends QuestionElementBaseProps {}

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
    // the QUESTION; ariaExpanded re-emits on the VM (open/close). Outside
    // overlay mode the lazy getter is never touched (it would not create
    // — but keeping the surface minimal is the rule).
    if (!this.isOverlayMode()) return [this.questionBase];
    const vm = this.rating.dropdownListModel as unknown as Base | undefined;
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
            'rating-dd-value'
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
    // The getter CREATES the VM on first access in dropdown mode (core's
    // own lazy construction); a runtime mode flip re-routes dispatch to
    // the "rating" template row, so the inert branch below is only
    // reachable when the class is mounted outside the dispatch chain.
    const vm = this.isOverlayMode() ? question.dropdownListModel : undefined;
    if (!vm) {
      return (
        <View
          style={localStyles.row}
          testID={`sv-rating-dropdown-fallback-${question.name}`}
        />
      );
    }
    const readOnly = question.isInputReadOnly;
    return (
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
});
