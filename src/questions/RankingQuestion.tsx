/**
 * `ranking` question (task 4.1) — RN port of survey-react-ui's
 * `SurveyQuestionRanking` (reactquestion_ranking.tsx).
 *
 * DESIGN (probe-verified, phased & model-authoritative):
 *
 * LAYER 1 (shipped, fully jest-tested) — reorder is driven ENTIRELY through
 * the core model so value/events/onValueChanged stay 100% core-correct; the
 * renderer never reimplements the ordering array (invariant 6 spirit for
 * behavior):
 *   - Default mode renders `renderedRankingChoices` as a column of rows
 *     (drag-handle icon · 1-based `getNumberByIndex` badge · item text).
 *     Accessible MOVE-UP / MOVE-DOWN controls call the model's OWN reorder
 *     primitive `dragDropRankingChoices.reorderRankedItem(q, i, j)` then
 *     `q.setValue()` — the zero-`setTimeout` path (core's `handleKeydown`
 *     would also schedule a `focusItem` timer that only queries the null RN
 *     `domNode`; the direct primitive avoids that dangling timer — probe
 *     concern #3).
 *   - selectToRank mode renders two Views from `renderedUnRankingChoices` /
 *     `renderedRankingChoices`; select/unselect + in-ranked reorder go
 *     through `handleKeydownSelectToRank(evt, item, key, isNeedFocus=false)`
 *     which gates max/enabled itself (`checkMaxSelectedChoicesUnreached` /
 *     `canStartDragDueItemEnabled`) — never a hand-rolled length check
 *     (probe concern #4). RN chooses VERTICAL stacking itself (screens are
 *     narrow); it does NOT read `renderedSelectToRankAreasLayout`, because
 *     the facade never sets `IsMobile` (probe).
 *
 * LAYER 2 (enhancement, DEVICE GATE) — the fine drag wraps each row in a
 * react-native-gesture-handler `Gesture.Pan()` + reanimated shared-value
 * translateY, both LAZY-REQUIRED inside the isolated `RankingDragRow` hooks
 * component (the ChoiceItemRow / DropdownOtherComment precedent: a plain
 * function child nested in the class-reactive renderer honors invariant 7's
 * lazy-require + A3). On release it COMMITS ONCE via the same
 * `reorderRankedItem`+`setValue` primitive — it does NOT reproduce web's
 * continuous per-`dragOver` model splices (those fight the shared-value
 * animation). When the libs are absent (jest, or a consumer who has not
 * installed the peers) `RankingDragRow` degrades to Layer 1 — so all model
 * paths run in jest with no new mocks; the gesture itself is verified on the
 * New-Arch example via maestro (project MEMORY).
 *
 * A drop-placeholder / dragging "ghost" has NO ported analog yet: RN's
 * commit-once drag never sets core's model-driven `currentDropTarget`, so
 * that styling is deferred to the Layer-2 device-gate work (the recipe
 * carries no dead ghost fragment).
 */
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Base, ItemValue, Question } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { SurveyThemeContext } from '../theme-rn/provider';
import { getItemVariant, queueUnknownTokens } from '../theme-rn/bridge';
import { composeStyles } from '../theme-rn/recipes/types';
import { selectRankingItemStyles } from '../theme-rn/recipes/ranking';
import { RNIcon } from '../components/RNIcon';

/** Minimal shape of `DragDropRankingChoices` the renderer drives. */
interface RankingDragDrop {
  reorderRankedItem(
    question: unknown,
    fromIndex: number,
    toIndex: number
  ): void;
}

/** The slice of `QuestionRankingModel` the renderer consumes (never
 * re-derived — invariant 6). */
interface RankingModel extends Question {
  selectToRankEnabled: boolean;
  renderedRankingChoices: ItemValue[];
  renderedUnRankingChoices: ItemValue[];
  rankingChoices: ItemValue[];
  isInputReadOnly: boolean;
  dragDropRankingChoices?: RankingDragDrop;
  dragDropSvgIcon: string;
  getNumberByIndex(index: number): string;
  getItemClass(item: ItemValue): string;
  getItemEnabled(item: ItemValue): boolean;
  checkMaxSelectedChoicesUnreached(): boolean;
  setValue(): void;
  handleKeydownSelectToRank(
    event: unknown,
    item: ItemValue,
    hardKey?: string,
    isNeedFocus?: boolean
  ): void;
  isEmpty(): boolean;
  locSelectToRankEmptyRankedAreaText?: unknown;
  locSelectToRankEmptyUnrankedAreaText?: unknown;
}

// ————————————————————————————————————————————————————————————————
// Layer 2 capability loader (lazy-required; absent in jest → Layer 1)
// ————————————————————————————————————————————————————————————————

interface RankingDragLibs {
  Gesture: { Pan(): unknown };
  GestureDetector: React.ComponentType<{
    gesture: unknown;
    children: React.ReactNode;
  }>;
  reanimated: {
    default: { View: React.ComponentType<Record<string, unknown>> };
    useSharedValue<T>(v: T): { value: T };
    useAnimatedStyle(
      fn: () => Record<string, unknown>
    ): Record<string, unknown>;
    runOnJS<T extends (...args: never[]) => unknown>(fn: T): T;
  };
}

let cachedDragLibs: RankingDragLibs | null | undefined;

/**
 * Lazy-require gesture-handler + reanimated (invariant 7). Returns null when
 * either peer is unavailable (jest, or a consumer who has not installed the
 * batteries-included peers) — the caller then renders Layer 1. Memoized so
 * the resolve cost is paid once.
 */
export function loadRankingDragLibs(): RankingDragLibs | null {
  if (cachedDragLibs !== undefined) return cachedDragLibs;
  try {
    const gh = require('react-native-gesture-handler');
    const reanimated = require('react-native-reanimated');
    if (
      !gh?.Gesture?.Pan ||
      !gh?.GestureDetector ||
      !reanimated?.useSharedValue ||
      !reanimated?.default?.View
    ) {
      cachedDragLibs = null;
      return null;
    }
    cachedDragLibs = {
      Gesture: gh.Gesture,
      GestureDetector: gh.GestureDetector,
      reanimated,
    };
  } catch {
    cachedDragLibs = null;
  }
  return cachedDragLibs;
}

// ————————————————————————————————————————————————————————————————
// Layer 2 drag wrapper — isolated hooks component (falls back to Layer 1)
// ————————————————————————————————————————————————————————————————

/**
 * Clamp a reorder target to the legal band. `lowerBound` defaults to 0 —
 * ranking has no locked region, so any slot (index 0 included) is reachable.
 * The matrixdynamic drag consumer passes `lockedRowCount` so a dragged row
 * never crosses ABOVE the locked leading band (core's `canInsertIntoThisRow`
 * forbids a drop at/above a locked row); the target clamps to the top of the
 * unlocked band instead.
 */
export function clampReorderTarget(
  index: number,
  delta: number,
  count: number,
  lowerBound = 0
): number {
  return Math.max(lowerBound, Math.min(count - 1, index + delta));
}

interface RankingDragRowProps {
  enabled: boolean;
  index: number;
  count: number;
  rowHeight: number;
  /** Lowest legal target index (0 for ranking; lockedRowCount for matrix). */
  lowerBound?: number;
  onReorder(fromIndex: number, toIndex: number): void;
  children: React.ReactNode;
}

/**
 * Wraps a row in a Pan gesture + reanimated translateY when the capability
 * libs are present; otherwise renders the child verbatim (Layer 1). The
 * gesture COMMITS ONCE on release via `onReorder` — no continuous model
 * mutation. This component is the reusable "drag-reorder primitive"
 * (matrixdynamic row-reorder, task 4.3, reuses it).
 */
export function RankingDragRow(props: RankingDragRowProps): React.JSX.Element {
  const {
    enabled,
    index,
    count,
    rowHeight,
    lowerBound = 0,
    onReorder,
    children,
  } = props;
  const libs = enabled ? loadRankingDragLibs() : null;
  if (!libs) return <>{children}</>;
  return (
    <RankingDragRowActive
      libs={libs}
      index={index}
      count={count}
      rowHeight={rowHeight}
      lowerBound={lowerBound}
      onReorder={onReorder}
    >
      {children}
    </RankingDragRowActive>
  );
}

interface RankingDragRowActiveProps {
  libs: RankingDragLibs;
  index: number;
  count: number;
  rowHeight: number;
  lowerBound: number;
  onReorder(fromIndex: number, toIndex: number): void;
  children: React.ReactNode;
}

function RankingDragRowActive(
  props: RankingDragRowActiveProps
): React.JSX.Element {
  const { libs, index, count, rowHeight, lowerBound, onReorder, children } =
    props;
  const { reanimated, Gesture, GestureDetector } = libs;
  const translateY = reanimated.useSharedValue(0);
  const commit = (delta: number): void => {
    const to = clampReorderTarget(index, delta, count, lowerBound);
    if (to !== index) onReorder(index, to);
  };
  const pan = (
    (
      Gesture.Pan() as unknown as {
        onUpdate(fn: (e: { translationY: number }) => void): unknown;
        onEnd(fn: () => void): unknown;
      }
    ).onUpdate((event) => {
      'worklet';
      translateY.value = event.translationY;
    }) as { onEnd(fn: () => void): unknown }
  ).onEnd(() => {
    'worklet';
    const delta = Math.round(translateY.value / (rowHeight || 1));
    translateY.value = 0;
    reanimated.runOnJS(commit)(delta);
  });
  const animatedStyle = reanimated.useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const AnimatedView = reanimated.default.View;
  return (
    <GestureDetector gesture={pan}>
      <AnimatedView style={animatedStyle}>{children}</AnimatedView>
    </GestureDetector>
  );
}

// ————————————————————————————————————————————————————————————————
// Presentational row (native interaction state) — a plain hooks child
// ————————————————————————————————————————————————————————————————

type RowArea = 'default' | 'ranked' | 'unranked';

interface RankingRowProps {
  question: RankingModel;
  item: ItemValue;
  /** Index within its area's rendered list (used for reorder + numbering). */
  index: number;
  area: RowArea;
  count: number;
  /** The question name (testID namespace). */
  name: string;
  /** Stable per-row key: index (default/ranked) or item value (unranked). */
  keyId: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSelect?: () => void;
  onUnselect?: () => void;
}

function RankingRow(props: RankingRowProps): React.JSX.Element {
  const { question, item, index, area, count, name, keyId } = props;
  const rowTestID =
    area === 'unranked'
      ? `sv-ranking-unranked-${name}-${keyId}`
      : area === 'ranked'
        ? `sv-ranking-ranked-${name}-${keyId}`
        : `sv-ranking-item-${name}-${keyId}`;
  const { recipes, styles: overrides } = React.useContext(SurveyThemeContext);
  const recipe = recipes.ranking;
  const slots = overrides.ranking;

  const variant = getItemVariant(question, question.getItemClass(item));
  React.useEffect(() => {
    queueUnknownTokens(question, variant.unknownTokens);
  });

  const enabled = question.getItemEnabled(item);
  const readOnly = question.isInputReadOnly;
  const state = {
    disabled: !enabled,
    readOnly: variant.variant.readOnly ?? false,
    preview: variant.variant.preview ?? false,
    error: variant.variant.error ?? false,
  };
  const styles = selectRankingItemStyles(recipe, state);
  const controlsDisabled = readOnly || !enabled;
  // Unranked "add" gates on the SAME model check core's select path uses
  // (`checkMaxSelectedChoicesUnreached`) so a11y/disabled match behavior at
  // max. Core also flips `item.enabled` at max via its enable-condition
  // cycle; this makes the RN contract explicit rather than relying on it.
  const selectDisabled =
    controlsDisabled ||
    (area === 'unranked' && !question.checkMaxSelectedChoicesUnreached());

  const numberText =
    area === 'unranked' ? '' : question.getNumberByIndex(index);
  const canMoveUp = !controlsDisabled && index > 0;
  const canMoveDown = !controlsDisabled && index < count - 1;

  const dragIcon = resolveHandleIcon(question.dragDropSvgIcon);

  return (
    <View
      testID={rowTestID}
      style={composeStyles(styles.item, { override: slots?.item })}
      accessibilityLabel={item.text}
    >
      <View
        style={composeStyles(recipe.fragments.handle, {
          override: slots?.handle,
        })}
      >
        {dragIcon ? (
          <RNIcon
            iconName={dragIcon}
            size={recipe.handleIconSize}
            fill={recipe.handleIconFill(state)}
          />
        ) : null}
      </View>
      <View
        testID={`sv-ranking-number-${name}-${keyId}`}
        style={composeStyles(styles.rankNumber, {
          override: slots?.rankNumber,
        })}
      >
        <Text
          style={composeStyles(recipe.fragments.rankNumberText, {
            override: slots?.rankNumberText,
          })}
        >
          {numberText || '—'}
        </Text>
      </View>
      {SurveyElementBase.renderLocString(
        item.locText,
        composeStyles(styles.label, { override: slots?.label }),
        `label-${index}`,
        'choice'
      )}
      {area === 'unranked' ? (
        <Pressable
          testID={`sv-ranking-select-${name}-${keyId}`}
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.text} to ranking`}
          accessibilityState={{ disabled: selectDisabled }}
          disabled={selectDisabled}
          onPress={props.onSelect}
          style={localStyles.control}
        >
          <Text accessibilityElementsHidden>{'＋'}</Text>
        </Pressable>
      ) : (
        <View style={localStyles.controls}>
          <Pressable
            testID={`sv-ranking-moveup-${name}-${keyId}`}
            accessibilityRole="button"
            accessibilityLabel={`Move ${item.text} up`}
            accessibilityState={{ disabled: !canMoveUp }}
            disabled={!canMoveUp}
            onPress={props.onMoveUp}
            style={localStyles.control}
          >
            <Text accessibilityElementsHidden>{'▲'}</Text>
          </Pressable>
          <Pressable
            testID={`sv-ranking-movedown-${name}-${keyId}`}
            accessibilityRole="button"
            accessibilityLabel={`Move ${item.text} down`}
            accessibilityState={{ disabled: !canMoveDown }}
            disabled={!canMoveDown}
            onPress={props.onMoveDown}
            style={localStyles.control}
          >
            <Text accessibilityElementsHidden>{'▼'}</Text>
          </Pressable>
          {area === 'ranked' ? (
            <Pressable
              testID={`sv-ranking-unselect-${name}-${keyId}`}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.text} from ranking`}
              accessibilityState={{ disabled: readOnly }}
              disabled={readOnly}
              onPress={props.onUnselect}
              style={localStyles.control}
            >
              <Text accessibilityElementsHidden>{'✕'}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Core's `dragDropSvgIcon` is a DOM sprite ref (`#icon-drag-24x24`); strip
 * the `#` for RNIcon's name resolver (mirrors ChoiceItemRow's check icon). */
function resolveHandleIcon(svgIcon: string | undefined): string {
  const raw = svgIcon ?? '';
  const name = raw.startsWith('#') ? raw.slice(1) : raw;
  return name || 'icon-drag-24x24';
}

// ————————————————————————————————————————————————————————————————
// The class-reactive question renderer
// ————————————————————————————————————————————————————————————————

export interface RankingQuestionProps extends QuestionElementBaseProps {}

export class RankingQuestion extends QuestionElementBase<RankingQuestionProps> {
  private get ranking(): RankingModel {
    return this.questionBase as unknown as RankingModel;
  }

  protected getStateElement(): Base {
    return this.questionBase;
  }

  /** Subscribe to the question (reorder mutates its `rankingChoices`
   * propertyArray → array-changed notification → repaint) AND every rendered
   * item (a `choicesEnableIf` flip notifies the ITEM). */
  protected getStateElements(): Base[] {
    const q = this.ranking;
    const items = q.selectToRankEnabled
      ? [...q.renderedRankingChoices, ...q.renderedUnRankingChoices]
      : q.renderedRankingChoices;
    return [this.questionBase, ...(items as unknown as Base[])];
  }

  /** Default-mode reorder via the model's OWN primitive (zero setTimeout). */
  private reorder = (fromIndex: number, toIndex: number): void => {
    const q = this.ranking;
    if (q.isInputReadOnly || !q.dragDropRankingChoices) return;
    if (toIndex < 0 || toIndex >= q.rankingChoices.length) return;
    if (fromIndex === toIndex) return;
    q.dragDropRankingChoices.reorderRankedItem(q, fromIndex, toIndex);
    q.setValue();
  };

  private makeKeyEvent(): { preventDefault(): void } {
    return { preventDefault(): void {} };
  }

  private selectToRankKey(item: ItemValue, key: string): void {
    // Model gates max/enabled/direction itself; isNeedFocus=false avoids the
    // dangling focusItem timer (probe concern #3).
    this.ranking.handleKeydownSelectToRank(
      this.makeKeyEvent(),
      item,
      key,
      false
    );
  }

  protected renderElement(): React.JSX.Element {
    const q = this.ranking;
    return q.selectToRankEnabled
      ? this.renderSelectToRank()
      : this.renderDefault();
  }

  private renderDefault(): React.JSX.Element {
    const q = this.ranking;
    const choices = q.renderedRankingChoices;
    return (
      <View testID={`sv-ranking-${q.name}`} accessibilityLabel={q.title}>
        {choices.map((item, index) => (
          <RankingDragRow
            key={`${q.name}-${itemKey(item, index)}`}
            enabled={!q.isInputReadOnly}
            index={index}
            count={choices.length}
            rowHeight={ROW_HEIGHT}
            onReorder={this.reorder}
          >
            <RankingRow
              question={q}
              item={item}
              index={index}
              area="default"
              count={choices.length}
              name={q.name}
              keyId={String(index)}
              onMoveUp={() => this.reorder(index, index - 1)}
              onMoveDown={() => this.reorder(index, index + 1)}
            />
          </RankingDragRow>
        ))}
      </View>
    );
  }

  private renderSelectToRank(): React.JSX.Element {
    const q = this.ranking;
    const ranked = q.renderedRankingChoices;
    const unranked = q.renderedUnRankingChoices;
    const { recipes } = this.themeContext;
    return (
      <View
        testID={`sv-ranking-selecttorank-${q.name}`}
        accessibilityLabel={q.title}
      >
        {/* Unranked area (RN stacks vertically; screens are narrow). */}
        <View testID={`sv-ranking-unranked-area-${q.name}`}>
          {unranked.length === 0 ? (
            // Web parity: the FROM/unranked container empty renders
            // `locSelectToRankEmptyRankedAreaText` ("All choices are
            // selected for ranking") — the core property names are
            // deliberately counterintuitive (reactquestion_ranking.tsx).
            <Text testID={`sv-ranking-unranked-empty-${q.name}`}>
              {locText(q.locSelectToRankEmptyRankedAreaText)}
            </Text>
          ) : (
            unranked.map((item, index) => (
              <RankingRow
                key={`u-${itemKey(item, index)}`}
                question={q}
                item={item}
                index={index}
                area="unranked"
                count={unranked.length}
                name={q.name}
                keyId={String(item.value)}
                onSelect={() => this.selectToRankKey(item, ' ')}
              />
            ))
          )}
        </View>
        <View
          testID={`sv-ranking-divider-${q.name}`}
          style={recipes.ranking.fragments.areaDivider}
        />
        {/* Ranked area. */}
        <View testID={`sv-ranking-ranked-area-${q.name}`}>
          {ranked.length === 0 ? (
            // Web parity: the TO/ranked container empty renders
            // `locSelectToRankEmptyUnrankedAreaText` ("Drag choices here to
            // rank them").
            <Text testID={`sv-ranking-ranked-empty-${q.name}`}>
              {locText(q.locSelectToRankEmptyUnrankedAreaText)}
            </Text>
          ) : (
            // Fine drag is DISABLED in selectToRank v1: the two-area
            // multi-slot drop-index math (mapping a Pan target to the right
            // slot across both areas) is unverified on-device, and a naive
            // single-slot mapping collapses a multi-slot drag to one step.
            // Button reorder (move-up/down) is the affordance here; the Pan
            // wrapper stays on default single-list ranking only (DIFFERENCES).
            ranked.map((item, index) => (
              <RankingRow
                key={`r-${itemKey(item, index)}`}
                question={q}
                item={item}
                index={index}
                area="ranked"
                count={ranked.length}
                name={q.name}
                keyId={String(index)}
                onMoveUp={() => this.selectToRankKey(item, 'ArrowUp')}
                onMoveDown={() => this.selectToRankKey(item, 'ArrowDown')}
                onUnselect={() => this.selectToRankKey(item, ' ')}
              />
            ))
          )}
        </View>
      </View>
    );
  }
}

const ROW_HEIGHT = 48;

function itemKey(item: ItemValue, index: number): string {
  const value = (item as { value?: unknown }).value;
  return value === undefined || value === null ? String(index) : String(value);
}

function locText(loc: unknown): string {
  const rendered = (loc as { renderedHtml?: string } | undefined)?.renderedHtml;
  return typeof rendered === 'string' ? rendered : '';
}

const localStyles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center' },
  control: { paddingHorizontal: 8, paddingVertical: 6 },
});
