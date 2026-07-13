/**
 * Question-chrome recipe (design: docs/design/0.7-theme-rn.md, "Per-component
 * recipes beyond the 4+1 exemplars | each component task"; task 1.7).
 * Backs `QuestionChrome` (src/components/QuestionChrome.tsx) — the
 * title/description/errors/comment wrapper every question renders inside.
 * Not part of the 0.7 metrics-fixture's "4+1 exemplars", but built the same
 * way: `StyleSheet.create`'d atomic fragments, formulas over `resolved`
 * tokens, never a literal.
 *
 * Sources (survey-core v2.5.33 default-theme SCSS, hand-harvested the same
 * way as the 0.7 fixture):
 *  - `sd-error.scss` (.sd-error / .sd-error__item) — error panel + message.
 *  - `sd-question.scss` (.sd-question__comment-area, .sd-element__erbox /
 *    .sd-question__erbox--below-question spacing).
 *  - `sd-description.scss` (.sd-description).
 *
 * Documented approximation: `$font-questiondescription-family/-size` and
 * `$font-questiondescription-weight` have NO normalized `ResolvedTheme`
 * typography field (unlike `questionTitle`, added as a 0.7 companion
 * amendment) — adding one is a `theme-core` (0.6, `CORE`) surface change
 * disproportionate to this component task. Both description vars default
 * to the SAME base-font tokens as `$font-family`/`$font-size`
 * (variables.scss) with only weight (400) and color differing, so
 * description text reuses `resolved.tokens.typography.base` for
 * family/size, a literal `400` for weight (the SCSS default), and the
 * existing `resolveColorVar` escape hatch (tokenLookup.ts's documented
 * "context-dependent lookup" seam) for the description-specific color var.
 * Diverges only under a theme overriding ONLY the description-specific
 * family/size/weight vars while leaving the base ones alone.
 */
import { StyleSheet } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcSize,
  calcFontSize,
  calcLineHeight,
  calcCornerRadius,
  resolveColorVar,
} from './tokenLookup';
import type { BuildContext } from './types';

export interface QuestionChromeRecipe {
  fragments: {
    /** `.sd-description` — question description (under-title or under-input; same style either way, only placement differs). */
    description: TextStyle;
    /** `.sd-error` base — shared by above/below placement. */
    errorPanel: ViewStyle;
    /** `.sd-element__erbox--above-element` / `.sd-question--title-top>.sd-question__erbox--above-question` spacing. */
    errorPanelAbove: ViewStyle;
    /** `.sd-question__erbox--below-question` spacing. */
    errorPanelBelow: ViewStyle;
    /** `.sd-error__item` — one error/warning message line. */
    errorItem: TextStyle;
    /** `.sd-question__comment-area` container. */
    commentArea: ViewStyle;
    /** `.sd-question__comment-area` text (the `commentText` caption). */
    commentLabel: TextStyle;
  };
}

export function buildQuestionChromeRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): QuestionChromeRecipe {
  const sink = buildCtx?.diagnostics;
  const baseFamily = resolved.tokens.typography.base.fontFamily || undefined;
  const baseSize = resolved.tokens.typography.base.fontSize;

  const fragments = StyleSheet.create({
    description: {
      fontFamily: baseFamily,
      fontSize: baseSize,
      fontWeight: '400',
      lineHeight: calcLineHeight(resolved, 1.5),
      color: resolveColorVar(
        resolved,
        '--sjs-font-questiondescription-color',
        sink
      ).css,
    },
    errorPanel: {
      paddingVertical: calcSize(resolved, 1),
      paddingHorizontal: calcSize(resolved, 1.5),
      borderRadius: calcCornerRadius(resolved, 1),
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-special-red-light',
        sink
      ).css,
      gap: calcSize(resolved, 0.5),
    },
    errorPanelAbove: {
      marginBottom: calcSize(resolved, 1),
    },
    errorPanelBelow: {
      marginTop: calcSize(resolved, 1),
    },
    errorItem: {
      color: resolveColorVar(resolved, '--sjs-special-red', sink).css,
      fontSize: calcFontSize(resolved, 0.75),
      lineHeight: calcLineHeight(resolved, 1),
      fontWeight: '600',
    },
    commentArea: {
      marginTop: calcSize(resolved, 2),
      gap: calcSize(resolved, 1),
    },
    commentLabel: {
      fontFamily: baseFamily,
      fontSize: calcFontSize(resolved, 1),
      color: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
    },
  });

  return { fragments };
}
