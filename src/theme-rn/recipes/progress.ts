/**
 * Progress-bar recipe (task 1.8, design: docs/design/0.7-metrics-fixture.md,
 * "Progress bar" row added by this task). Fixture harvested from
 * `default-theme/blocks/sd-progress.scss`: `.sd-progress` (track),
 * `.sd-progress__bar` (fill), `.sd-progress__text` (label). Every metric
 * is FORMULA-first from resolved tokens per the fixture's header rule.
 *
 * v1 scope (task 1.8): the PERCENTAGE-bar variant only -- the same visual
 * recipe upstream's `SurveyProgress` uses for every `progressBarType`
 * except `"buttons"` (obsolete) and the TOC extension, both documented
 * deferred at the component layer (`SurveyProgressBar.tsx`). No legal-
 * state enumeration is needed here (unlike item/button): the bar has
 * exactly one visual state, parameterized only by the model's own
 * `progressValue` percentage.
 */
import { StyleSheet } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcSize,
  calcFontSize,
  calcLineHeight,
  resolveColorVar,
} from './tokenLookup';
import type { BuildContext } from './types';

export interface ProgressRecipe {
  fragments: {
    /** `.sd-progress` -- the track. */
    track: ViewStyle;
    /** `.sd-progress__bar` -- the filled portion (width set at render time from `progressValue`). */
    bar: ViewStyle;
    /** `.sd-progress__text` -- the percentage/page label. */
    text: TextStyle;
  };
}

export function buildProgressRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): ProgressRecipe {
  const sink = buildCtx?.diagnostics;
  const fragments = StyleSheet.create({
    track: {
      height: calcSize(resolved, 0.25),
      backgroundColor: resolveColorVar(resolved, '--sjs-border-light', sink)
        .css,
      overflow: 'hidden',
    },
    bar: {
      height: '100%',
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-primary-backcolor',
        sink
      ).css,
    },
    text: {
      fontSize: calcFontSize(resolved, 0.75),
      lineHeight: calcLineHeight(resolved, 1),
      fontWeight: '600',
      color: resolveColorVar(
        resolved,
        '--sjs-general-dim-forecolor-light',
        sink
      ).css,
      paddingVertical: calcSize(resolved, 1),
      paddingHorizontal: calcSize(resolved, 1.5),
    },
  });

  return { fragments };
}
