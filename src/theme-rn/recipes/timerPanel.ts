/**
 * Survey timer-panel recipe (task 5.7a). Fixture: upstream
 * `default-theme/blocks/sd-timer.scss` — `.sd-timer` (clock badge),
 * `.sd-timer--top`/`--bottom` (placement spacing), `.sd-timer__text-container`,
 * `.sd-timer__text--major`, `.sd-timer__text--minor`, plus `.sd-body__timer`
 * (`timerRoot`, the plain-text root used when the css has NO `clockTimerRoot`,
 * i.e. `showTimerAsClock === false`).
 *
 * Documented RN deltas (DIFFERENCES.md → "Survey timer panel"):
 * - Upstream's clock badge is a `position: fixed`, 144px circle with an SVG
 *   progress ring (`.sd-timer__progress`, `icon-timercircle`). RN renders an
 *   INLINE, centered text badge in the shell's top/bottom slot — no fixed
 *   positioning, and the SVG progress ring is OMITTED (text-only). The clock
 *   MAJOR/MINOR values are read straight from the model
 *   (`timerModel.clockMajorText`/`clockMinorText`); no timing math is
 *   recomputed here.
 * - The circular-badge metrics keyed off `--sd-timer-size` (32px major font
 *   at the 144px default) are re-expressed FORMULA-first from resolved theme
 *   tokens: major = `calcFontSize(2)` (2 × base = 32 at the default),
 *   minor/plain = `calcFontSize(1)`.
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcSize,
  calcFontSize,
  calcLineHeight,
  resolveColorVar,
} from './tokenLookup';
import type { BuildContext } from './types';

export interface TimerPanelRecipe {
  fragments: {
    /** `.sd-timer` — the inline clock badge container (centered). */
    root: ViewStyle;
    /** `.sd-timer--top` — spacing when rendered above the pages. */
    rootTop: ViewStyle;
    /** `.sd-timer--bottom` — spacing when rendered below the nav. */
    rootBottom: ViewStyle;
    /** `.sd-timer__text-container` — the major/minor text column. */
    textContainer: ViewStyle;
    /** `.sd-timer__text--major` — the primary clock value (mm:ss). */
    majorText: TextStyle;
    /** `.sd-timer__text--minor` — the secondary clock value. */
    minorText: TextStyle;
    /** `.sd-body__timer` (`timerRoot`) — the plain `timerInfoText` root used
     * when the active css has no `clockTimerRoot` (`showTimerAsClock` false). */
    text: TextStyle;
  };
}

export function buildTimerPanelRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): TimerPanelRecipe {
  const sink = buildCtx?.diagnostics;
  const primary = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;
  const secondary = resolveColorVar(
    resolved,
    '--sjs-general-dim-forecolor-light',
    sink
  ).css;

  const fragments = StyleSheet.create({
    root: {
      // .sd-timer: a self-contained badge; RN flows it inline and centers
      // it horizontally (upstream's `position: fixed` is not portable).
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: calcSize(resolved, 1),
      paddingHorizontal: calcSize(resolved, 2),
    },
    rootTop: {
      // .sd-timer--top { margin-top: calcSize(4) }.
      marginTop: calcSize(resolved, 4),
      marginBottom: calcSize(resolved, 1),
    },
    rootBottom: {
      // .sd-timer--bottom spacing (the fixed-position offsets collapse to a
      // simple top margin in the inline flow).
      marginTop: calcSize(resolved, 2),
    },
    textContainer: {
      // .sd-timer__text-container { flex-direction: column; align-items: center }.
      flexDirection: 'column',
      alignItems: 'center',
      rowGap: calcSize(resolved, 0.5),
    },
    majorText: {
      // .sd-timer__text--major { font-weight: 700; color: $primary;
      // font-size: calc(--sd-timer-size / 144 * 32) = 32 at the default }.
      fontSize: calcFontSize(resolved, 2),
      lineHeight: calcLineHeight(resolved, 2.5),
      fontWeight: '700',
      color: primary,
    },
    minorText: {
      // .sd-timer__text--minor { font-size: calcFontSize(1); font-weight: 600;
      // color: secondary }.
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      fontWeight: '600',
      color: secondary,
    },
    text: {
      // .sd-body__timer — the plain, full-sentence timerInfoText.
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      fontWeight: '600',
      color: primary,
      textAlign: 'center',
    },
  });

  return { fragments };
}
