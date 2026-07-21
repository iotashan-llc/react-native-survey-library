/**
 * `rating` question type (task 1.14, design: docs/IMPLEMENTATION-PLAN.md
 * row 1.14 "rating -- button rows: numbers/stars/smileys"). RN port of
 * survey-react-ui's `SurveyQuestionRating` (reactquestion_rating.tsx) +
 * its three item components (`rating-item.tsx`/`rating-item-star.tsx`/
 * `rating-item-smiley.tsx`), verified against the installed survey-core
 * build.
 *
 * Dispatch (mirrors upstream exactly): `RatingQuestion` registers under
 * the template key `"rating"` (the default button-row rendering);
 * `displayMode: "dropdown"` routes through the `sv-rating-dropdown`
 * renderer-route row to `RatingDropdownQuestion` (task 2.5a) and never
 * reaches this component. Per-item rendering here dispatches through
 * `RNElementFactory` under `question.itemComponent` (`"sv-rating-item"`
 * labels/numbers, `"sv-rating-item-star"` stars,
 * `"sv-rating-item-smiley"` smileys; a dispatch miss on an unregistered
 * name falls through to the shared unsupported-item fallback below,
 * same non-throwing contract as the top-level factory (invariant 9)) --
 * an internal-to-question factory concept with no upstream
 * `RendererFactory` involvement, but reusing `RNElementFactory` here
 * (rather than a private switch) preserves upstream's own
 * consumer-extensibility hook: a host can register a replacement item
 * component under one of these keys.
 *
 * Selection: `question.setValueFromClick(value)` (question_rating.ts) --
 * consumed as-is (invariant 6): it already handles the
 * click-again-to-clear toggle and the `isReadOnlyAttr` no-op guard.
 *
 * Documented RN deltas (v1 scope):
 * - No hover/highlight machinery (`onItemMouseIn`/`onItemMouseOut`) --
 *   upstream ITSELF no-ops these under `IsTouch` (survey-core
 *   `utils/utils.ts`), so an always-touch RN runtime already exercises
 *   upstream's own no-hover code path; nothing is lost.
 * - `rateColorMode`/`scaleColorMode` per-item gradient coloring is not
 *   ported (theme-rn/recipes/rating.ts doc comment).
 * - `rateDescriptionLocation` "top"/"bottom"/"topBottom" absolute
 *   positioning is not ported -- only the default "leftRight" (flanking
 *   text, natural flex flow) renders.
 * - The star item's dual-SVG partial-fill overlay collapses to a single
 *   RNIcon styled by the recipe's `starIconStyles` fill/stroke mapping
 *   (unselected outline / selected primary fill, web parity; the alt
 *   icon only on selected+focused); "filled up to the selected value"
 *   (`getItemClass`'s `isStar` branch) is ported for BOTH branches:
 *   numeric compare on auto-generated scales, `rateValues`-position
 *   compare for custom values (upstream's `useRateValues()` is `private`,
 *   so its one-line body is mirrored from the same public properties --
 *   `rateValues.length && !autoGenerate`).
 * - Overflow: upstream's `.sd-rating { overflow-x: auto }` maps to a
 *   horizontal `ScrollView` (a layout choice, not a re-derivation of any
 *   core visibility/state logic -- `rootWrappable`/`itemSmallMode`'s
 *   wrap-vs-scroll switch is not replicated).
 */
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type {
  Base,
  QuestionRatingModel,
  RenderedRatingItem,
} from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { RNElementFactory } from '../factories/ElementFactory';
import { reportDiagnostic } from '../diagnostics';
import { RNIcon } from '../components/RNIcon';
import {
  selectRatingPillStyles,
  selectRatingSmileyStyles,
  selectRatingSmileyIconFill,
  selectRatingStarIconStyle,
  resolveRatingItemLegalState,
} from '../theme-rn/recipes/rating';
import type { RatingItemStateInput } from '../theme-rn/recipes/rating';
import { composeStyles } from '../theme-rn/recipes/types';
import { partitionButtonStyles } from '../components/ActionButton';
import { SurveyThemeContext } from '../theme-rn/provider';

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export interface RatingItemComponentProps {
  question: QuestionRatingModel;
  item: RenderedRatingItem;
  index: number;
  onPress: (value: unknown) => void;
  isDisplayMode: boolean;
}

/**
 * Shared raw-state derivation -- same "style vs interaction" split
 * BooleanQuestion documents (`baseItemState`): `readOnly`/`preview` here
 * are the STYLE variants (`isReadOnlyStyle`/`isPreviewStyle`); Pressable
 * `disabled`/`accessibilityState.disabled` instead follow
 * `isInputReadOnly` (interaction gating), read separately by each item
 * component below.
 */
function baseRatingState(
  question: QuestionRatingModel
): Omit<RatingItemStateInput, 'selected' | 'pressed' | 'focused'> {
  return {
    readOnly: question.isReadOnlyStyle,
    preview: question.isPreviewStyle,
    // `hasCssError()` is `protected` on `Question` -- not reachable from a
    // component; same documented limitation as BooleanQuestion's
    // `baseItemState`.
    error: false,
    allowHover: !question.isReadOnlyStyle && !question.isPreviewStyle,
  };
}

function isPillOrSmileySelected(
  question: QuestionRatingModel,
  item: RenderedRatingItem
): boolean {
  return question.value === item.value;
}

/**
 * Upstream's `useRateValues()` (question_rating.ts:209-211) is `private`;
 * this mirrors its one-line body from the same PUBLIC properties it
 * reads. Both members sit on the api-surface watchlist.
 */
function usesCustomRateValues(question: QuestionRatingModel): boolean {
  const q = question as unknown as {
    rateValues: unknown[];
    autoGenerate: boolean;
  };
  return q.rateValues.length > 0 && !q.autoGenerate;
}

/**
 * "Filled up to the selected value" (`getItemClass`'s `isStar` branch,
 * question_rating.ts:771-777): numeric compare when the scale is
 * auto-generated; POSITION in `rateValues` when custom values are used
 * (review round 1 -- a later string-valued choice fills every preceding
 * star; upstream compares `rateValues` indices, loose-equality match).
 */
function isStarSelected(
  question: QuestionRatingModel,
  item: RenderedRatingItem
): boolean {
  const value = question.value as unknown;
  if (usesCustomRateValues(question)) {
    // `RatingItem extends ItemValue`: rendered items ARE the rateValues
    // entries, so upstream compares `rateValues.indexOf(item)` directly.
    const rateValues = (
      question as unknown as {
        rateValues: { value: unknown }[];
      }
    ).rateValues;
    // eslint-disable-next-line eqeqeq
    const selected = rateValues.filter((i) => i.value == value)[0];
    if (selected === undefined) return false;
    return (
      rateValues.indexOf(selected) >=
      rateValues.indexOf(item as unknown as (typeof rateValues)[number])
    );
  }
  if (typeof value === 'number' && typeof item.value === 'number') {
    return value >= item.value;
  }
  return value === item.value;
}

export function RatingPillItem(
  props: RatingItemComponentProps
): React.JSX.Element {
  const { question, item, index, onPress, isDisplayMode } = props;
  const { recipes, styles: overrideStyles } =
    React.useContext(SurveyThemeContext);
  const [pressed, setPressed] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const inputReadOnly = question.isInputReadOnly || isDisplayMode;
  const selected = isPillOrSmileySelected(question, item);
  const input: RatingItemStateInput = {
    selected,
    pressed,
    focused,
    ...baseRatingState(question),
  };
  const selection = selectRatingPillStyles(recipes.rating, input);
  const { container, text } = partitionButtonStyles(selection);
  const handlePress = (_event: GestureResponderEvent): void => {
    if (inputReadOnly) return;
    onPress(item.value);
  };
  return (
    <Pressable
      testID={`sv-rating-item-${question.name}-${index}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: inputReadOnly }}
      disabled={inputReadOnly}
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={composeStyles(container, {
        override: overrideStyles.rating?.pillItem,
      })}
    >
      <Text style={text}>{item.text}</Text>
    </Pressable>
  );
}

export function RatingStarItem(
  props: RatingItemComponentProps
): React.JSX.Element {
  const { question, item, index, onPress, isDisplayMode } = props;
  const { recipes } = React.useContext(SurveyThemeContext);
  const [focused, setFocused] = React.useState(false);
  const inputReadOnly = question.isInputReadOnly || isDisplayMode;
  const selected = isStarSelected(question, item);
  const input: RatingItemStateInput = {
    selected,
    // No `:active` styling exists for stars in the fixture -- pressed is
    // not tracked (selectRatingStarIconStyle maps it to unselected anyway).
    pressed: false,
    focused,
    ...baseRatingState(question),
  };
  // Web parity (`.sd-rating__item-star svg`, sd-rating.scss:392-550): the
  // icon's fill/stroke come from the recipe's class-token mapping --
  // unselected stars are an OUTLINE (transparent fill + border-color
  // stroke), selected stars fill with primary. The `sv-star-2` alt icon
  // appears only on selected+focused (web
  // `--selected:not(--preview):focus-within` reveal) -- the legal-state
  // resolver already excludes readOnly/preview from `focused`, matching
  // the `:not(--preview)` guard (readOnly items are `disabled` in RN and
  // can't focus at all).
  const iconStyle = selectRatingStarIconStyle(recipes.rating, input);
  const legalState = resolveRatingItemLegalState(input);
  const showAltIcon = legalState.kind === 'focused' && legalState.selected;
  const handlePress = (_event: GestureResponderEvent): void => {
    if (inputReadOnly) return;
    onPress(item.value);
  };
  return (
    <Pressable
      testID={`sv-rating-item-${question.name}-${index}`}
      accessibilityRole="radio"
      // Icon-only control: the RNIcon child is accessibility-hidden, so
      // the item text (localized rate value) names the radio (task 1.16).
      accessibilityLabel={item.text}
      accessibilityState={{ checked: selected, disabled: inputReadOnly }}
      disabled={inputReadOnly}
      onPress={handlePress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <RNIcon
        testID={`sv-rating-star-icon-${question.name}-${index}`}
        iconName={
          showAltIcon ? question.itemStarIconAlt : question.itemStarIcon
        }
        size={recipes.rating.starIconSize}
        fill={iconStyle.fill}
        stroke={iconStyle.stroke}
        strokeWidth={iconStyle.strokeWidth}
      />
    </Pressable>
  );
}

export function RatingSmileyItem(
  props: RatingItemComponentProps
): React.JSX.Element {
  const { question, item, index, onPress, isDisplayMode } = props;
  const { recipes, styles: overrideStyles } =
    React.useContext(SurveyThemeContext);
  const [pressed, setPressed] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const inputReadOnly = question.isInputReadOnly || isDisplayMode;
  const selected = isPillOrSmileySelected(question, item);
  const baseState = baseRatingState(question);
  const input: RatingItemStateInput = {
    selected,
    pressed,
    focused,
    ...baseState,
  };
  const selection = selectRatingSmileyStyles(recipes.rating, input);
  const fill = selectRatingSmileyIconFill(recipes.rating, {
    selected,
    readOnly: baseState.readOnly,
    preview: baseState.preview,
    error: baseState.error,
  });
  const handlePress = (_event: GestureResponderEvent): void => {
    if (inputReadOnly) return;
    onPress(item.value);
  };
  return (
    <Pressable
      testID={`sv-rating-item-${question.name}-${index}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: inputReadOnly }}
      disabled={inputReadOnly}
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      // Icon-only control (smiley): named by the localized item text.
      accessibilityLabel={item.text}
      style={composeStyles(selection, {
        override: overrideStyles.rating?.smileyItem,
      })}
    >
      <RNIcon
        iconName={question.getItemSmileyIconName(item)}
        fill={fill}
        size={recipes.rating.starIconSize / 2}
      />
    </Pressable>
  );
}

export class RatingQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get ratingQuestion(): QuestionRatingModel {
    return this.questionBase as QuestionRatingModel;
  }

  private handlePress = (value: unknown): void => {
    this.ratingQuestion.setValueFromClick(value);
  };

  /** Set during render on an item-dispatch miss (an unregistered custom
   * `itemComponent`), reported from the commit lifecycles below (0.7's
   * "no diagnostics during render" rule -- same pattern SurveyHeader's
   * wrapper-miss diagnostic uses), deduped per componentName for this
   * instance's lifetime. Never throws (invariant 9): a miss simply omits
   * that item from the row. */
  private pendingItemDispatchMiss: string | undefined;
  private lastReportedItemDispatchMiss: string | undefined;

  componentDidMount(): void {
    super.componentDidMount();
    this.flushItemDispatchMissDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushItemDispatchMissDiagnostic();
  }

  private flushItemDispatchMissDiagnostic(): void {
    const miss = this.pendingItemDispatchMiss;
    if (!miss || this.lastReportedItemDispatchMiss === miss) return;
    this.lastReportedItemDispatchMiss = miss;
    reportDiagnostic({
      code: 'element-wrapper-missing',
      componentName: miss,
      reason: 'rating-item-component',
    });
  }

  private renderItem(
    item: RenderedRatingItem,
    index: number
  ): React.JSX.Element | null {
    const question = this.ratingQuestion;
    const rendered = RNElementFactory.createElement<
      RatingItemComponentProps & { key: string }
    >(question.itemComponent, {
      key: `${question.name}-${index}`,
      question,
      item,
      index,
      onPress: this.handlePress,
      isDisplayMode: this.isDisplayMode,
    });
    if (!rendered) {
      this.pendingItemDispatchMiss = question.itemComponent;
    }
    return rendered;
  }

  protected renderElement(): React.JSX.Element {
    const question = this.ratingQuestion;
    const { recipes } = this.themeContext;
    const fragments = recipes.rating.fragments;
    this.pendingItemDispatchMiss = undefined;
    const minText = question.hasMinLabel
      ? this.renderLocString(
          question.locMinRateDescription,
          fragments.minMaxText,
          undefined,
          'choice'
        )
      : null;
    const maxText = question.hasMaxLabel
      ? this.renderLocString(
          question.locMaxRateDescription,
          fragments.minMaxText,
          undefined,
          'choice'
        )
      : null;
    return (
      <View style={styles.root} testID={`sv-rating-${question.name}`}>
        {minText}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            testID={`sv-rating-row-${question.name}`}
            // Core defines the rating input's role as radiogroup
            // (a11y_input_ariaRole, question_rating.ts:975-977); items
            // keep their individual radio/checked semantics. RN has no
            // aria-required/aria-invalid analog -- required/invalid
            // surface through the rendered error text instead
            // (documented in docs/DIFFERENCES.md).
            accessibilityRole="radiogroup"
            accessibilityLabel={
              (question as unknown as { a11y_input_ariaLabel: string | null })
                .a11y_input_ariaLabel ?? question.processedTitle
            }
            style={fragments.row}
          >
            {question.renderedRateItems.map((item, index) =>
              this.renderItem(item, index)
            )}
          </View>
        </ScrollView>
        {maxText}
      </View>
    );
  }
}
