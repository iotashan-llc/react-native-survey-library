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
 * Overflow-to-dropdown (task 2.5b, design R1-R5 in
 * docs/design/2.5-rating-dropdown-buttongroup-overflow-plan.md):
 * - CORE decides the threshold. The renderer only measures and feeds
 *   `Question.processResponsiveness(requiredWidth, availableWidth)`
 *   (protected in typings — isolated in ONE module-level cast, R3);
 *   core applies the ±2 deadband and flips `renderAs` to its
 *   `getCompactRenderAs()` ('dropdown') / back to 'default'.
 * - Measurement (R2, strengthened by the review-findings pass): the
 *   ALWAYS-mounted wrapper View reports the live available width via
 *   onLayout in BOTH modes; the row renders inside an always-mounted
 *   measure host — visible in row mode, hidden while compact (absolute,
 *   opacity 0, pointerEvents none, a11y-hidden on both platforms) — so
 *   the ScrollView's onContentSizeChange keeps caching the intrinsic
 *   REQUIRED width in BOTH modes. That makes flip-back possible even
 *   when the question MOUNTS already compact (renderAs is serialized)
 *   and keeps the cache fresh when content changes while compact.
 * - Caller gates: both widths known/finite/positive, ROUNDED before the
 *   adapter (web scrollWidth is integral; core rounds only
 *   availableWidth — compat-pinned), pair-changed dedupe, and never in
 *   design mode (web's needResponsiveness gate lives caller-side too).
 * - Dispatch stays on the 'buttongroup' TEMPLATE row in both modes (R1:
 *   no RendererFactory registration — `isDefaultRendering()` stays true
 *   and `getTemplate()` is 'buttongroup'); this component self-branches
 *   on `question.renderAs`.
 * - Compact control (R5/R7): extends `OverlayControlBase`
 *   (`isOverlayMode` keyed on renderAs — core RETAINS the lazy
 *   `dropdownListModel` after flip-back, so VM presence is not mode);
 *   collapsed value = readOnlyText → selected item locText →
 *   `placeholderRendered`, mirroring DropdownQuestion's fold minus the
 *   input-component tier (buttongroup has none upstream). Opener a11y
 *   (role clamp + title-label fold + STRING ariaExpanded → boolean) is
 *   the base's shared bundle (R6); the compact control renders NO clear
 *   affordance (unchanged behavior — the base's clear gate is not
 *   called here).
 * - Render purity (review-findings pass): render, `getStateElements`,
 *   and `getOverlayPopup` read ONLY the non-creating
 *   `dropdownListModelValue` backing field. The CREATING
 *   `dropdownListModel` getter is touched exclusively OUTSIDE render —
 *   by core's own processResponsiveness flip path, or by
 *   `ensureCompactViewModel` in the measurement handlers when a
 *   question mounts already compact (that keeps VM construction — which
 *   fires core property notifications — out of render AND out of the
 *   mount-commit window, where subscribed item rows would flag it).
 *
 * Error association (`hasErrors`/`describedBy`) has no RN aria
 * equivalent — errors surface through question chrome (same documented
 * limitation as rating).
 */
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { ButtonGroupItemModel } from '../core/facade';
import type {
  Base,
  ItemValue,
  LocalizableString,
  PopupModel,
  Question,
} from '../core/facade';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { OverlayControlBase } from '../reactivity/OverlayControlBase';
import type { OverlayControlProps } from '../reactivity/OverlayControlBase';
import { OverlayContext } from '../overlay/OverlayContext';
import { RNIcon } from '../components/RNIcon';
import { composeStyles } from '../theme-rn/recipes/types';

/** The compact control's slice of core's `DropdownListModel`. */
interface ButtonGroupListVM {
  onClick(): void;
  placeholderRendered: string;
  popupModel?: PopupModel;
  ariaInputRole?: string;
  ariaQuestionRole?: string;
  /** A STRING ('true' | 'false'), same as dropdown. */
  ariaExpanded?: string;
}

interface ButtonGroupQuestionModel {
  name: string;
  visibleChoices: ItemValue[];
  renderAs: string;
  isDesignMode: boolean;
  isInputReadOnly: boolean;
  readOnlyText: string;
  showSelectedItemLocText: boolean;
  selectedItemLocText?: LocalizableString;
  /** Lazy CREATING getter — touched only OUTSIDE render (compat test;
   * render-purity contract in the header comment). */
  dropdownListModel?: ButtonGroupListVM;
  /** Core's NON-CREATING backing field — the only VM read that render,
   * `getStateElements`, and `getOverlayPopup` ever make. Watchlisted as
   * `QuestionButtonGroupModel.dropdownListModelValue`. */
  dropdownListModelValue?: ButtonGroupListVM;
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

/**
 * THE single protected-API cast (design R3). Core's
 * `Question.processResponsiveness` owns the compact decision (±2
 * deadband; it rounds availableWidth but NOT requiredWidth — the caller
 * pre-rounds both). Watchlisted as `Question.processResponsiveness`;
 * behavior pinned in core/__tests__/process-responsiveness-compat.test.ts.
 */
function callProcessResponsiveness(
  question: Question,
  requiredWidth: number,
  availableWidth: number
): boolean {
  return (
    question as unknown as {
      processResponsiveness(r: number, a: number): boolean;
    }
  ).processResponsiveness(requiredWidth, availableWidth);
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
        style={composeStyles(
          [...styles.item, ...(isLast ? [] : [recipe.fragments.itemDivider])],
          { override: slots?.item }
        )}
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
              composeStyles(
                [
                  ...styles.caption,
                  ...(vm.iconName ? [recipe.fragments.captionAfterIcon] : []),
                ],
                { override: slots?.caption }
              ),
              `caption-${index}`
            )
          : null}
      </Pressable>
    );
  }
}

export interface ButtonGroupQuestionElementProps extends QuestionElementBaseProps {}

/** OverlayContext binding for the descriptor route (class components
 * spend their single contextType on the theme — same pattern as
 * DropdownQuestionElement). The 'buttongroup' template row points HERE
 * in both modes (R1). */
export function ButtonGroupQuestionElement(
  props: ButtonGroupQuestionElementProps
): React.JSX.Element {
  const stack = React.useContext(OverlayContext);
  return (
    <ButtonGroupQuestion
      question={props.question}
      creator={props.creator}
      stack={stack ?? undefined}
    />
  );
}

export class ButtonGroupQuestion extends OverlayControlBase<OverlayControlProps> {
  // ——— 2.5b measurement cache (R2/R3) ———
  // Keyed to the question identity: a prop swap resets the REQUIRED
  // cache + dedupe pair (stale content width must not compact the new
  // question). The live AVAILABLE width survives the swap on purpose —
  // the wrapper's geometry is question-independent and RN only fires
  // onLayout on change, so resetting it would deadlock measurement.
  private measuredQuestion: Base | null = null;
  private cachedRequiredWidth: number | null = null;
  private liveAvailableWidth: number | null = null;
  private lastCalledRequired: number | null = null;
  private lastCalledAvailable: number | null = null;

  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected getStateElements(): Base[] {
    // Compact mode adds the VM (ariaExpanded re-emits on open/close) —
    // read through the NON-CREATING backing field: this runs from the
    // commit lifecycles, but must never be a construction point (render
    // purity; construction lives in ensureCompactViewModel / core's
    // flip path).
    if (!this.isCompactMode) return [this.questionBase];
    const vm = this.buttonGroup.dropdownListModelValue as unknown as
      Base | undefined;
    return vm ? [this.questionBase, vm] : [this.questionBase];
  }

  private get buttonGroup(): ButtonGroupQuestionModel {
    return this.questionBase as unknown as ButtonGroupQuestionModel;
  }

  private get isCompactMode(): boolean {
    return this.buttonGroup.renderAs === 'dropdown';
  }

  /** Overlay-mode gate for `OverlayControlBase` — keyed on `renderAs`,
   * never on VM presence (core RETAINS the VM after flip-back, R5). */
  protected isOverlayMode(): boolean {
    return this.isCompactMode;
  }

  /** NON-CREATING override of the base default (which reads the lazy
   * CREATING getter): reconcile runs in the commit phase, and VM
   * construction there would fire core property notifications into
   * already-subscribed observers mid-commit. Construction belongs to
   * `ensureCompactViewModel` / core's flip path exclusively. */
  protected getOverlayPopup(): PopupModel | null {
    return this.buttonGroup.dropdownListModelValue?.popupModel ?? null;
  }

  /** Materializes the lazy VM when a question is ALREADY compact but the
   * VM does not exist yet — the remount-while-compact case (`renderAs`
   * is serialized; core's flip path never ran, so nothing else would
   * ever construct it). Called from the measurement handlers (event
   * context — never render, never the mount commit). The forceUpdate is
   * deliberate: construction notifications alone are core-version
   * incidentals, not a re-render contract. */
  private ensureCompactViewModel(): void {
    const question = this.buttonGroup;
    if (!this.isCompactMode || question.dropdownListModelValue) return;
    // The CREATING getter — re-render only if it actually materialized.
    if (question.dropdownListModel) this.forceUpdate();
  }

  /** Finite, rounded, positive — or null (never fed to the adapter). */
  private static normalizeWidth(width: number): number | null {
    if (!Number.isFinite(width)) return null;
    const rounded = Math.round(width);
    return rounded > 0 ? rounded : null;
  }

  private syncMeasurementTarget(): void {
    if (this.measuredQuestion === this.questionBase) return;
    this.measuredQuestion = this.questionBase;
    this.cachedRequiredWidth = null;
    this.lastCalledRequired = null;
    this.lastCalledAvailable = null;
  }

  private handleWrapperLayout = (event: LayoutChangeEvent): void => {
    this.syncMeasurementTarget();
    this.ensureCompactViewModel();
    const width = ButtonGroupQuestion.normalizeWidth(
      event.nativeEvent.layout.width
    );
    if (width === null) return;
    this.liveAvailableWidth = width;
    this.maybeProcessResponsiveness();
  };

  private handleContentSizeChange = (contentWidth: number): void => {
    this.syncMeasurementTarget();
    this.ensureCompactViewModel();
    const width = ButtonGroupQuestion.normalizeWidth(contentWidth);
    if (width === null) return;
    this.cachedRequiredWidth = width;
    this.maybeProcessResponsiveness();
  };

  /** The caller-side gates (R3): both widths known, design mode never
   * compacts (web parity: `needResponsiveness()` excludes design mode
   * BEFORE core's threshold runs), and only CHANGED pairs call through
   * — RN re-fires layout on unrelated re-renders. */
  private maybeProcessResponsiveness(): void {
    const required = this.cachedRequiredWidth;
    const available = this.liveAvailableWidth;
    if (required === null || available === null) return;
    if (this.buttonGroup.isDesignMode) return;
    if (
      required === this.lastCalledRequired &&
      available === this.lastCalledAvailable
    ) {
      return;
    }
    this.lastCalledRequired = required;
    this.lastCalledAvailable = available;
    callProcessResponsiveness(
      this.questionBase as unknown as Question,
      required,
      available
    );
  }

  private renderCompactValue(vm: ButtonGroupListVM): React.JSX.Element {
    const question = this.buttonGroup;
    // Same fold as DropdownQuestion minus the input-component tier
    // (buttongroup has none upstream): readOnlyText → selected item
    // locText → placeholder. `showSelectedItemLocText` already excludes
    // readOnly, so the order is safe.
    if (question.isInputReadOnly && question.readOnlyText) {
      return (
        <Text testID="sv-buttongroup-readonly">{question.readOnlyText}</Text>
      );
    }
    if (question.showSelectedItemLocText && question.selectedItemLocText) {
      return (
        <View testID="sv-buttongroup-value">
          {SurveyElementBase.renderLocString(
            question.selectedItemLocText,
            undefined,
            'bg-value'
          )}
        </View>
      );
    }
    return (
      <Text testID="sv-buttongroup-placeholder">{vm.placeholderRendered}</Text>
    );
  }

  private renderCompactControl(vm: ButtonGroupListVM): React.JSX.Element {
    const question = this.buttonGroup;
    const readOnly = question.isInputReadOnly;
    return (
      <Pressable
        ref={this.controlRef}
        testID={`sv-buttongroup-dropdown-${question.name}`}
        // a11y: the shared base bundle (combobox role clamp,
        // title-label fold, STRING ariaExpanded → boolean; R6).
        {...this.buildOverlayOpenerA11y(vm)}
        disabled={readOnly}
        onPress={readOnly ? undefined : () => vm.onClick()}
        style={localStyles.control}
      >
        {this.renderCompactValue(vm)}
        <Text accessibilityElementsHidden style={localStyles.chevron}>
          {'▾'}
        </Text>
      </Pressable>
    );
  }

  private renderRow(): React.JSX.Element {
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
        onContentSizeChange={this.handleContentSizeChange}
      >
        <View
          testID={`sv-buttongroup-${question.name}`}
          accessibilityRole="radiogroup"
          // Same core title fold the base uses for the compact opener —
          // the row is the non-overlay surface of the same question.
          accessibilityLabel={this.resolveOpenerLabel()}
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

  protected renderElement(): React.JSX.Element {
    const question = this.buttonGroup;
    // NON-CREATING read (render purity): a question that mounts already
    // compact renders the row until the first measurement event
    // materializes the VM via ensureCompactViewModel.
    const vm = this.isCompactMode ? question.dropdownListModelValue : undefined;
    const compact = !!vm;
    // The wrapper is ALWAYS mounted (R2): it keeps reporting the live
    // available width in BOTH modes. The measure host below keeps the
    // row — and with it the ScrollView's content-size events — mounted
    // in BOTH modes too: visible in row mode, hidden (absolute,
    // opacity 0, no touch, a11y-hidden) while compact, so flip-back
    // works after a remount-while-compact and the REQUIRED cache stays
    // fresh when content changes while compact.
    return (
      <View
        testID={`sv-buttongroup-wrapper-${question.name}`}
        onLayout={this.handleWrapperLayout}
        style={localStyles.wrapper}
      >
        {vm ? this.renderCompactControl(vm) : null}
        <View
          testID={`sv-buttongroup-measure-${question.name}`}
          style={compact ? localStyles.hiddenRow : undefined}
          accessibilityElementsHidden={compact}
          importantForAccessibility={compact ? 'no-hide-descendants' : 'auto'}
        >
          {this.renderRow()}
        </View>
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  wrapper: { alignSelf: 'stretch' },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: { marginLeft: 8 },
  /** Compact-mode measure host: mounted for measurement only —
   * invisible, untouchable, and (with the paired a11y props) hidden
   * from both platforms' accessibility trees. */
  hiddenRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
});
