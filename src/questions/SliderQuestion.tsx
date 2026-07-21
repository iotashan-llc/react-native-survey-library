/**
 * `slider` question (task 4.4) — RN port of survey-react-ui's
 * `SurveyQuestionSlider` (reactquestion_slider.tsx).
 *
 * DESIGN (probe-verified, model-authoritative — invariant 6):
 *
 * All value math is the CORE model's. The renderer only reads
 * `renderedValue`/`getPercent`/`getTrackPercentLeft|Right`/`getTooltipValue`
 * and commits through `setSliderValue`, snapping/clamping/range-spacing via
 * `getClosestToStepValue` + `ensureMin|MaxRangeBorders` — it never
 * reimplements clamping, step-snapping, or allowSwap. `setSliderValue`
 * self-gates on `isAllowToChange()` (readOnly/disabled/preview), so a
 * read-only commit is a no-op at the model layer.
 *
 * SINGLE mode wraps the batteries-included `@react-native-community/slider`
 * (native, single-thumb, LAZY-REQUIRED inside the isolated `SliderSingleControl`
 * hooks child — invariant 7). Continuous `onValueChange` is a VISUAL draft
 * (local state only, mirroring web mutating `renderedValue` in place during
 * drag); `onSlidingComplete` commits ONCE via `setSliderValue`. When the peer
 * is absent (`loadSliderLib()` → null: jest, or a consumer who has not
 * installed it) the control degrades to an accessible +/- stepper
 * (`SliderSingleStepper`) that commits through the SAME primitive — operable
 * and screen-reader-friendly, never a crash (invariant 9).
 *
 * RANGE mode is a custom dual-thumb track. LAYER 1 (shipped, fully
 * jest-tested): each thumb is an a11y `adjustable` with +/- steppers that
 * compute `[lo,hi]` through `getClosestToStepValue` + `ensureMin|MaxRangeBorders`
 * (spacing + allowSwap enforcement) then `setSliderValue` — so range is fully
 * operable without fine drag. LAYER 2 (enhancement, DEVICE GATE): each thumb
 * wraps in a react-native-gesture-handler `Gesture.Pan()` (reusing ranking's
 * `loadRankingDragLibs`), mapping horizontal translation to a value and
 * committing ONCE on release; absent the peers (jest) the thumb renders
 * verbatim (Layer 1 only). The fine drag is verified on the New-Arch example
 * via maestro (project MEMORY), not in jest.
 *
 * Tooltip is an RN View bubble above a thumb (`getTooltipValue(i)`):
 * `'never'` hides it, `'always'` always shows it, `'auto'` shows it during
 * drag/focus (RN has no hover — documented in DIFFERENCES).
 */
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type {
  Base,
  ItemValue,
  LocalizableString,
  Question,
} from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { composeStyles } from '../theme-rn/recipes/types';
import type { SliderRecipe } from '../theme-rn/recipes/slider';
import type { SliderStyleOverrides } from '../theme-rn/overrides';
import { loadRankingDragLibs } from './RankingQuestion';

/** A rendered scale label (SliderLabelItemValue slice). */
interface SliderLabel extends ItemValue {
  value: number;
  locText: LocalizableString;
  showValue?: boolean;
}

/** The slice of `QuestionSliderModel` the renderer consumes (never
 * re-derived — invariant 6). */
interface SliderModel extends Question {
  name: string;
  sliderType: 'single' | 'range';
  step: number;
  renderedMin: number;
  renderedMax: number;
  renderedValue: number[];
  tooltipVisibility: 'auto' | 'always' | 'never';
  tooltipFormat: string;
  allowSwap: boolean;
  showLabels: boolean;
  renderedLabels: SliderLabel[];
  isInputReadOnly: boolean;
  setSliderValue(value: number | number[]): void;
  getClosestToStepValue(value: number): number;
  ensureMinRangeBorders(newValue: number, inputNumber: number): number;
  ensureMaxRangeBorders(newValue: number, inputNumber: number): number;
  getPercent(value: number): number;
  getTrackPercentLeft(): number;
  getTrackPercentRight(): number;
  getTooltipValue(tooltipNumber: number): string;
}

// ————————————————————————————————————————————————————————————————
// Single-mode capability loader (lazy-required; absent → stepper Layer 1)
// ————————————————————————————————————————————————————————————————

type SliderComponent = React.ComponentType<Record<string, unknown>>;

let cachedSliderLib: SliderComponent | null | undefined;

/**
 * Lazy-require `@react-native-community/slider` (invariant 7). Returns null
 * when the peer is unavailable (jest, or a consumer who has not installed the
 * batteries-included peer) — the caller then renders the stepper fallback.
 * Memoized so the resolve cost is paid once.
 */
export function loadSliderLib(): SliderComponent | null {
  if (cachedSliderLib !== undefined) return cachedSliderLib;
  try {
    const mod = require('@react-native-community/slider');
    const comp = mod?.default ?? mod?.Slider;
    cachedSliderLib =
      typeof comp === 'function' || typeof comp === 'object'
        ? ((comp as SliderComponent) ?? null)
        : null;
  } catch {
    cachedSliderLib = null;
  }
  return cachedSliderLib;
}

interface SliderChildProps {
  question: SliderModel;
  recipe: SliderRecipe;
  slots?: SliderStyleOverrides;
}

// ————————————————————————————————————————————————————————————————
// Single mode — community slider (draft/commit) + stepper fallback
// ————————————————————————————————————————————————————————————————

interface SliderSingleControlProps extends SliderChildProps {
  SliderComp: SliderComponent;
  /** Materialized by the class INSIDE its render guard — reading the lazy
   * `renderedValue` getter here (a child rendered after the guard closes)
   * would fire the model's array-changed notification during React's render
   * phase and setState mid-render (0.4 render-purity). */
  renderedValue: number[];
  onCommit(value: number): void;
}

function SliderSingleControl(
  props: SliderSingleControlProps
): React.JSX.Element {
  const { question, recipe, SliderComp, renderedValue, onCommit } = props;
  const [draft, setDraft] = React.useState<number | null>(null);
  const [active, setActive] = React.useState(false);
  const committed = renderedValue[0] ?? question.renderedMin;
  const value = draft ?? committed;
  const readOnly = question.isInputReadOnly;
  const showTooltip =
    question.tooltipVisibility === 'always' ||
    (question.tooltipVisibility === 'auto' && active);
  // During drag the model value is not yet committed (`getTooltipValue` reads
  // `renderedValue`), so the tooltip must format the DRAFT via the same core
  // path core's getTooltipValue uses (step-snap → formatNumber → tooltipFormat).
  const tooltipText =
    draft == null
      ? question.getTooltipValue(0)
      : question.tooltipFormat.replace(
          '{0}',
          String(
            parseFloat(
              (question.step
                ? question.getClosestToStepValue(draft)
                : draft
              ).toFixed(4)
            )
          )
        );

  return (
    <View style={recipe.fragments.track}>
      {showTooltip ? (
        <View
          testID={`sv-slider-tooltip-${question.name}-0`}
          style={[
            recipe.fragments.tooltip,
            {
              left: `${question.getPercent(value)}%`,
              // Center the bubble over the thumb (shift left by half its width).
              transform: [{ translateX: '-50%' }],
            },
          ]}
        >
          <Text style={recipe.fragments.tooltipText}>{tooltipText}</Text>
        </View>
      ) : null}
      <SliderComp
        testID={`sv-slider-input-${question.name}`}
        style={localStyles.fullWidth}
        minimumValue={question.renderedMin}
        maximumValue={question.renderedMax}
        step={question.step || undefined}
        value={value}
        disabled={readOnly}
        minimumTrackTintColor={recipe.minTrackColor}
        maximumTrackTintColor={recipe.maxTrackColor}
        thumbTintColor={recipe.thumbColor}
        onValueChange={(v: number) => {
          setDraft(v);
          if (question.tooltipVisibility === 'auto') setActive(true);
        }}
        onSlidingStart={() => setActive(true)}
        onSlidingComplete={(v: number) => {
          setDraft(null);
          setActive(false);
          onCommit(v);
        }}
      />
    </View>
  );
}

interface SliderStepperButtonProps {
  recipe: SliderRecipe;
  testID: string;
  label: string;
  glyph: string;
  disabled: boolean;
  onPress(): void;
}

function SliderStepperButton(
  props: SliderStepperButtonProps
): React.JSX.Element {
  const { recipe, testID, label, glyph, disabled, onPress } = props;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        recipe.fragments.stepperButton,
        disabled ? recipe.fragments.stepperButtonDisabled : null,
      ]}
    >
      <Text style={recipe.fragments.stepperGlyph} accessibilityElementsHidden>
        {glyph}
      </Text>
    </Pressable>
  );
}

interface SliderSingleStepperProps extends SliderChildProps {
  renderedValue: number[];
  onStep(direction: 1 | -1): void;
}

function SliderSingleStepper(
  props: SliderSingleStepperProps
): React.JSX.Element {
  const { question, recipe, renderedValue, onStep } = props;
  const now = renderedValue[0] ?? question.renderedMin;
  const min = question.renderedMin;
  const max = question.renderedMax;
  const readOnly = question.isInputReadOnly;
  return (
    <View
      testID={`sv-slider-stepper-${question.name}`}
      style={recipe.fragments.stepperRow}
      accessibilityRole="adjustable"
      accessibilityLabel={question.title}
      accessibilityValue={{ min, max, now }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (readOnly) return;
        onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1);
      }}
    >
      <SliderStepperButton
        recipe={recipe}
        testID={`sv-slider-stepper-dec-${question.name}`}
        label={`Decrease ${question.title}`}
        glyph={'−'}
        disabled={readOnly || now <= min}
        onPress={() => onStep(-1)}
      />
      <Text
        testID={`sv-slider-stepper-value-${question.name}`}
        style={recipe.fragments.stepperValue}
      >
        {String(now)}
      </Text>
      <SliderStepperButton
        recipe={recipe}
        testID={`sv-slider-stepper-inc-${question.name}`}
        label={`Increase ${question.title}`}
        glyph={'＋'}
        disabled={readOnly || now >= max}
        onPress={() => onStep(1)}
      />
    </View>
  );
}

// ————————————————————————————————————————————————————————————————
// Range mode — custom dual-thumb track (Layer 1 steppers + Layer 2 drag)
// ————————————————————————————————————————————————————————————————

interface SliderRangeBodyProps extends SliderChildProps {
  /** Materialized by the class inside its render guard (see
   * SliderSingleControlProps.renderedValue). */
  renderedValue: number[];
  onStep(index: number, direction: 1 | -1): void;
  onDragCommit(index: number, value: number): void;
}

function SliderRangeBody(props: SliderRangeBodyProps): React.JSX.Element {
  const { question, recipe, slots, renderedValue, onStep, onDragCommit } =
    props;
  const [trackWidth, setTrackWidth] = React.useState(0);
  const value = renderedValue;
  const readOnly = question.isInputReadOnly;

  const onLayout = (event: LayoutChangeEvent): void => {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && width !== trackWidth) setTrackWidth(width);
  };

  return (
    <View>
      <View
        testID={`sv-slider-track-${question.name}`}
        style={composeStyles(recipe.fragments.track, {
          override: slots?.track,
        })}
        onLayout={onLayout}
      >
        <View style={recipe.fragments.inactiveBar} />
        <View
          style={[
            recipe.fragments.activeBar,
            {
              left: `${question.getTrackPercentLeft()}%`,
              right: `${question.getTrackPercentRight()}%`,
            },
            slots?.activeBar,
          ]}
        />
        {value.map((thumbValue, index) => (
          <SliderRangeThumb
            key={index}
            question={question}
            recipe={recipe}
            slots={slots}
            index={index}
            value={thumbValue}
            trackWidth={trackWidth}
            readOnly={readOnly}
            onStep={onStep}
            onDragCommit={onDragCommit}
          />
        ))}
      </View>
      <View style={localStyles.steppers}>
        {value.map((thumbValue, index) => (
          <View key={index} style={localStyles.stepperGroup}>
            <SliderStepperButton
              recipe={recipe}
              testID={`sv-slider-thumb-dec-${question.name}-${index}`}
              label={`Decrease ${question.title} thumb ${index + 1}`}
              glyph={'−'}
              disabled={readOnly}
              onPress={() => onStep(index, -1)}
            />
            <Text
              testID={`sv-slider-thumb-value-${question.name}-${index}`}
              style={recipe.fragments.stepperValue}
            >
              {String(thumbValue)}
            </Text>
            <SliderStepperButton
              recipe={recipe}
              testID={`sv-slider-thumb-inc-${question.name}-${index}`}
              label={`Increase ${question.title} thumb ${index + 1}`}
              glyph={'＋'}
              disabled={readOnly}
              onPress={() => onStep(index, 1)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

interface SliderRangeThumbProps extends SliderChildProps {
  index: number;
  value: number;
  trackWidth: number;
  readOnly: boolean;
  onStep(index: number, direction: 1 | -1): void;
  onDragCommit(index: number, value: number): void;
}

function SliderRangeThumb(props: SliderRangeThumbProps): React.JSX.Element {
  const {
    question,
    recipe,
    slots,
    index,
    value,
    trackWidth,
    readOnly,
    onStep,
  } = props;
  const [active, setActive] = React.useState(false);
  const dragLibs = readOnly ? null : loadRankingDragLibs();
  const showTooltip =
    question.tooltipVisibility === 'always' ||
    (question.tooltipVisibility === 'auto' && active);

  const thumb = (
    <View
      testID={`sv-slider-thumb-${question.name}-${index}`}
      accessibilityRole="adjustable"
      accessibilityLabel={`${question.title} thumb ${index + 1}`}
      accessibilityValue={{
        min: question.renderedMin,
        max: question.renderedMax,
        now: value,
      }}
      // The `adjustable` role promises VoiceOver/TalkBack swipe-to-adjust; wire
      // the native adjust actions to the SAME model path as the +/- steppers.
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (readOnly) return;
        onStep(index, event.nativeEvent.actionName === 'increment' ? 1 : -1);
      }}
      style={[
        recipe.fragments.thumb,
        active ? recipe.fragments.thumbFocused : null,
        { left: `${question.getPercent(value)}%` },
        slots?.thumb as StyleProp<ViewStyle>,
      ]}
    >
      {showTooltip ? (
        <View
          testID={`sv-slider-tooltip-${question.name}-${index}`}
          style={[
            recipe.fragments.tooltip,
            slots?.tooltip as StyleProp<ViewStyle>,
          ]}
        >
          <Text style={recipe.fragments.tooltipText}>
            {question.getTooltipValue(index)}
          </Text>
        </View>
      ) : null}
    </View>
  );

  // Layer 2 (device gate): absent in jest → thumb renders verbatim (Layer 1).
  if (!dragLibs || trackWidth <= 0) return thumb;
  return (
    <SliderThumbDrag
      libs={dragLibs}
      question={question}
      index={index}
      value={value}
      trackWidth={trackWidth}
      onActiveChange={setActive}
      onDragCommit={props.onDragCommit}
    >
      {thumb}
    </SliderThumbDrag>
  );
}

interface SliderThumbDragProps {
  libs: NonNullable<ReturnType<typeof loadRankingDragLibs>>;
  question: SliderModel;
  index: number;
  value: number;
  trackWidth: number;
  onActiveChange(active: boolean): void;
  onDragCommit(index: number, value: number): void;
  children: React.ReactNode;
}

/**
 * Layer-2 fine drag (DEVICE GATE — gesture-handler + reanimated, absent in
 * jest). Horizontal Pan translates the thumb visually via a shared value and
 * commits ONCE on release: the release translation maps to a value delta
 * (`translationX / trackWidth × scale`) added to the thumb's current value,
 * committed through the model (`onDragCommit` → `setSliderValue`). No
 * continuous per-frame model mutation (that would fight the shared-value
 * animation) — same commit-once posture as ranking's Pan wrapper.
 */
function SliderThumbDrag(props: SliderThumbDragProps): React.JSX.Element {
  const {
    libs,
    question,
    index,
    value,
    trackWidth,
    onActiveChange,
    onDragCommit,
    children,
  } = props;
  const { reanimated, Gesture, GestureDetector } = libs;
  const translateX = reanimated.useSharedValue(0);
  const scale = question.renderedMax - question.renderedMin;
  const commit = (translation: number): void => {
    const delta = (translation / (trackWidth || 1)) * scale;
    onDragCommit(index, value + delta);
  };
  const pan = (
    (
      Gesture.Pan() as unknown as {
        onBegin(fn: () => void): unknown;
        onUpdate(fn: (e: { translationX: number }) => void): unknown;
        onEnd(fn: () => void): unknown;
      }
    ).onUpdate((event) => {
      'worklet';
      translateX.value = event.translationX;
    }) as { onEnd(fn: () => void): unknown }
  ).onEnd(() => {
    'worklet';
    const translation = translateX.value;
    translateX.value = 0;
    reanimated.runOnJS(onActiveChange)(false);
    reanimated.runOnJS(commit)(translation);
  });
  const animatedStyle = reanimated.useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const AnimatedView = reanimated.default.View;
  return (
    <GestureDetector gesture={pan}>
      <AnimatedView style={animatedStyle}>{children}</AnimatedView>
    </GestureDetector>
  );
}

// ————————————————————————————————————————————————————————————————
// The class-reactive question renderer
// ————————————————————————————————————————————————————————————————

export interface SliderQuestionProps extends QuestionElementBaseProps {}

export class SliderQuestion extends QuestionElementBase<SliderQuestionProps> {
  private get slider(): SliderModel {
    return this.questionBase as unknown as SliderModel;
  }

  protected getStateElement(): Base {
    return this.questionBase;
  }

  /** Subscribe to the question (value/track changes) AND every rendered
   * label (a label-text change notifies the ITEM). */
  protected getStateElements(): Base[] {
    const q = this.slider;
    const labels = q.showLabels ? (q.renderedLabels as unknown as Base[]) : [];
    return [this.questionBase, ...labels];
  }

  /** Single-mode commit: snap+clamp through the model, then write value. */
  private commitSingle = (raw: number): void => {
    const q = this.slider;
    q.setSliderValue(q.getClosestToStepValue(raw));
  };

  private stepSingle = (direction: 1 | -1): void => {
    const q = this.slider;
    if (q.isInputReadOnly) return;
    const current = q.renderedValue[0] ?? q.renderedMin;
    this.commitSingle(current + direction * (q.step || 1));
  };

  /** Range a11y stepper: snap + spacing/allowSwap enforcement via the model. */
  private stepThumb = (index: number, direction: 1 | -1): void => {
    const q = this.slider;
    if (q.isInputReadOnly) return;
    const current = q.renderedValue[index] ?? q.renderedMin;
    this.commitThumb(index, current + direction * (q.step || 1));
  };

  /** Range drag commit (Layer 2 device gate) — same model path as the stepper. */
  private dragThumb = (index: number, raw: number): void => {
    this.commitThumb(index, raw);
  };

  private commitThumb(index: number, raw: number): void {
    const q = this.slider;
    if (q.isInputReadOnly) return;
    // Mirrors core `handleOnChange`: `ensureMaxRangeBorders` always applies,
    // but `ensureMinRangeBorders` (which blocks a thumb from crossing its
    // neighbor / breaching the min gap) is enforced ONLY when swapping is
    // disallowed. `allowSwap` is a core DEFAULT of true and is forced false
    // by a `minRangeLength`, so this single check honors both the swap and
    // the clamp cases. When swapping is allowed the thumbs may cross; sorting
    // reorders the value array afterwards (core `handlePointerUp`).
    let next = q.getClosestToStepValue(raw);
    next = q.ensureMaxRangeBorders(next, index);
    if (!q.allowSwap) {
      next = q.ensureMinRangeBorders(next, index);
    }
    const arr = q.renderedValue.slice();
    arr[index] = next;
    arr.sort((a, b) => a - b);
    q.setSliderValue(arr);
  }

  protected renderElement(): React.JSX.Element {
    const q = this.slider;
    // Materialize the lazy `renderedValue` array HERE, inside the class's
    // render guard, so its first-read array-changed notification is
    // suppressed (isRendering) instead of firing during a child's render and
    // triggering a setState mid-render (0.4 render-purity, D2).
    const renderedValue = q.renderedValue;
    const { recipes, styles: overrides } = this.themeContext;
    const recipe = recipes.slider;
    const slots = overrides.slider;
    return (
      <View
        testID={`sv-slider-${q.name}`}
        accessibilityLabel={q.title}
        style={composeStyles(recipe.fragments.container, {
          override: slots?.container,
        })}
      >
        {q.sliderType === 'range'
          ? this.renderRange(recipe, slots, renderedValue)
          : this.renderSingle(recipe, slots, renderedValue)}
        {q.showLabels ? this.renderLabels(recipe, slots) : null}
      </View>
    );
  }

  private renderSingle(
    recipe: SliderRecipe,
    slots: SliderStyleOverrides | undefined,
    renderedValue: number[]
  ): React.JSX.Element {
    const q = this.slider;
    const SliderComp = loadSliderLib();
    if (!SliderComp) {
      return (
        <SliderSingleStepper
          question={q}
          recipe={recipe}
          slots={slots}
          renderedValue={renderedValue}
          onStep={this.stepSingle}
        />
      );
    }
    return (
      <SliderSingleControl
        question={q}
        recipe={recipe}
        slots={slots}
        SliderComp={SliderComp}
        renderedValue={renderedValue}
        onCommit={this.commitSingle}
      />
    );
  }

  private renderRange(
    recipe: SliderRecipe,
    slots: SliderStyleOverrides | undefined,
    renderedValue: number[]
  ): React.JSX.Element {
    return (
      <SliderRangeBody
        question={this.slider}
        recipe={recipe}
        slots={slots}
        renderedValue={renderedValue}
        onStep={this.stepThumb}
        onDragCommit={this.dragThumb}
      />
    );
  }

  private renderLabels(
    recipe: SliderRecipe,
    slots: SliderStyleOverrides | undefined
  ): React.JSX.Element {
    const q = this.slider;
    const labels = q.renderedLabels;
    return (
      <View style={recipe.fragments.labelsRow}>
        {labels.map((item, index) => {
          const labelValue = item.value;
          const showValue = !!item.showValue;
          return (
            <View
              key={`${q.name}-label-${index}`}
              testID={`sv-slider-label-${q.name}-${index}`}
              style={[
                recipe.fragments.label,
                { left: `${q.getPercent(labelValue)}%` },
                slots?.label as StyleProp<ViewStyle>,
              ]}
            >
              <View style={recipe.fragments.labelTick} />
              {showValue ? (
                <>
                  <Text style={recipe.fragments.labelValueText}>
                    {String(labelValue)}
                  </Text>
                  {SurveyElementBase.renderLocString(
                    item.locText,
                    recipe.fragments.labelText,
                    `lblsec-${index}`,
                    'choice'
                  )}
                </>
              ) : (
                SurveyElementBase.renderLocString(
                  item.locText,
                  recipe.fragments.labelText,
                  `lbl-${index}`,
                  'choice'
                )
              )}
            </View>
          );
        })}
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  fullWidth: { width: '100%' },
  steppers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 24,
    rowGap: 8,
  },
  stepperGroup: { flexDirection: 'row', alignItems: 'center', columnGap: 8 },
});
