/**
 * Slider recipe (task 4.4). Fixtures: `default-theme/blocks/sd-slider.scss`
 * (path/thumb/tooltip/label geometry) resolved through the metrics-fixture
 * formula helpers — never a hardcoded literal (design 0.7-metrics-fixture).
 *
 * Per invariant 6 the recipe owns ONLY presentation tokens; every VALUE and
 * POSITION (track fill %, thumb %, tooltip text, step-snapping) comes from
 * the core model at render time. The single-thumb community slider consumes
 * three flat colors (`minTrackColor`/`maxTrackColor`/`thumbColor`); the
 * custom range track + thumbs + tooltip + labels consume the `fragments`.
 *
 * The web `--sjs-postcss-fix-slider-*` variables are Chrome range-input
 * shims with no RN analog; RN sizes the path/thumb from the same base-unit
 * multiples the fixture uses (path height 0.5×, thumb 4×) and colors the
 * fill/thumb from the primary token (web's default path-color-filled), the
 * inactive path from the default border, matching the shipped look.
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcFontSize,
  calcLineHeight,
  calcSize,
  resolveColorVar,
} from './tokenLookup';
import type { BuildContext } from './types';

export interface SliderRecipe {
  fragments: {
    /** `.sds-slider` root column. */
    container: ViewStyle;
    /** The custom range track lane (holds inactive path + fill + thumbs). */
    track: ViewStyle;
    /** `.sd-slider__path` inactive full-width bar. */
    inactiveBar: ViewStyle;
    /** `.sd-slider__range-track` active fill (positioned by left/right %). */
    activeBar: ViewStyle;
    /** `.sd-slider__thumb` circle (positioned by left %). */
    thumb: ViewStyle;
    /** `--focused .sd-slider__thumb` ring. */
    thumbFocused: ViewStyle;
    /** `.sd-slider__tooltip` bubble above a thumb. */
    tooltip: ViewStyle;
    /** `.sd-slider__tooltip-value` text. */
    tooltipText: TextStyle;
    /** `.sd-slider__labels` row. */
    labelsRow: ViewStyle;
    /** A single `.sd-slider__label` (positioned by getPercent(value) %). */
    label: ViewStyle;
    /** `.sd-slider__label-tick` mark. */
    labelTick: ViewStyle;
    /** `.sd-slider__label-text`. */
    labelText: TextStyle;
    /** `.sd-slider__label-text--secondary` (showValue numeric line). */
    labelValueText: TextStyle;
    /** Layer-1 stepper row (single-mode fallback + inline a11y). */
    stepperRow: ViewStyle;
    /** A stepper +/- button. */
    stepperButton: ViewStyle;
    /** A disabled stepper button. */
    stepperButtonDisabled: ViewStyle;
    /** The stepper +/- glyph. */
    stepperGlyph: TextStyle;
    /** The stepper's current-value text. */
    stepperValue: TextStyle;
  };
  /** Community single-thumb slider flat colors. */
  minTrackColor: string;
  maxTrackColor: string;
  thumbColor: string;
  /** Thumb diameter (dp) — also the community slider's effective hit size. */
  thumbSize: number;
}

export function buildSliderRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): SliderRecipe {
  const sink = buildCtx?.diagnostics;
  const primary = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;
  const backcolor = resolveColorVar(
    resolved,
    '--sjs-general-backcolor',
    sink
  ).css;
  const border = resolveColorVar(resolved, '--sjs-border-default', sink).css;
  const fontTitle = resolveColorVar(
    resolved,
    '--sjs-font-questiontitle-color',
    sink
  ).css;
  const fontDesc = resolveColorVar(
    resolved,
    '--sjs-font-questiondescription-color',
    sink
  ).css;

  const pathHeight = calcSize(resolved, 0.5); // sd-slider.scss path-height
  const thumbSize = calcSize(resolved, 3); // touch-friendly thumb
  const fontSize = calcFontSize(resolved, 1);
  const smallFontSize = calcFontSize(resolved, 0.75);

  const fragments = StyleSheet.create({
    container: {
      alignSelf: 'stretch',
      paddingVertical: calcSize(resolved, 1),
    },
    track: {
      height: thumbSize,
      justifyContent: 'center',
      marginHorizontal: thumbSize / 2,
    },
    inactiveBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: pathHeight,
      borderRadius: pathHeight / 2,
      backgroundColor: border,
    },
    activeBar: {
      position: 'absolute',
      height: pathHeight,
      borderRadius: pathHeight / 2,
      backgroundColor: primary,
    },
    thumb: {
      position: 'absolute',
      width: thumbSize,
      height: thumbSize,
      borderRadius: thumbSize / 2,
      marginLeft: -thumbSize / 2,
      backgroundColor: backcolor,
      borderWidth: calcSize(resolved, 0.25),
      borderColor: primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbFocused: {
      borderColor: primary,
      borderWidth: calcSize(resolved, 0.5),
    },
    tooltip: {
      position: 'absolute',
      bottom: thumbSize + calcSize(resolved, 0.5),
      alignSelf: 'center',
      backgroundColor: primary,
      paddingHorizontal: calcSize(resolved, 0.75),
      paddingVertical: calcSize(resolved, 0.25),
      borderRadius: calcSize(resolved, 0.5),
    },
    tooltipText: {
      color: backcolor,
      fontSize: smallFontSize,
    },
    labelsRow: {
      height: calcLineHeight(resolved, 2),
      marginTop: calcSize(resolved, 0.5),
      marginHorizontal: thumbSize / 2,
    },
    label: {
      position: 'absolute',
      alignItems: 'center',
      marginLeft: -calcSize(resolved, 2),
      width: calcSize(resolved, 4),
    },
    labelTick: {
      width: 1,
      height: calcSize(resolved, 0.5),
      backgroundColor: border,
      marginBottom: calcSize(resolved, 0.25),
    },
    labelText: {
      color: fontDesc,
      fontSize: smallFontSize,
      textAlign: 'center',
    },
    labelValueText: {
      color: fontTitle,
      fontSize: smallFontSize,
      fontWeight: '600',
      textAlign: 'center',
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: calcSize(resolved, 1),
    },
    stepperButton: {
      width: calcSize(resolved, 4),
      height: calcSize(resolved, 4),
      borderRadius: calcSize(resolved, 0.5),
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperButtonDisabled: {
      opacity: 0.4,
    },
    stepperGlyph: {
      color: fontTitle,
      fontSize,
      lineHeight: fontSize + calcSize(resolved, 0.5),
    },
    stepperValue: {
      color: fontTitle,
      fontSize,
      minWidth: calcSize(resolved, 6),
      textAlign: 'center',
    },
  });

  return {
    fragments,
    minTrackColor: primary,
    maxTrackColor: border,
    thumbColor: primary,
    thumbSize,
  };
}
