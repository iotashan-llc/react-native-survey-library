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
    /** `.sd-description` — question description base (both placements). */
    description: TextStyle;
    /** `.sd-element__header .sd-description` — under-title spacing: `0.25 * --sd-base-vertical-padding - 0.5*baseUnit` = calcSize(0.5) at the regular (>=600) tier. */
    descriptionUnderTitle: TextStyle;
    /** `.sd-question__description--under-input` — `padding-top: 0.375 * --sd-base-vertical-padding` = calcSize(1.5) at the regular tier. */
    descriptionUnderInput: TextStyle;
    /** `.sd-error` base — red error tone, shared by above/below placement. */
    errorPanel: ViewStyle;
    /** `.sd-element__erbox--above-element` / `.sd-question--title-top>.sd-question__erbox--above-question` spacing. */
    errorPanelAbove: ViewStyle;
    /** `.sd-question__erbox--below-question` spacing. */
    errorPanelBelow: ViewStyle;
    /** `.sd-error--warning` panel tone (sd-error.scss:26-32). */
    errorPanelWarning: ViewStyle;
    /** `.sd-error--info` panel tone (sd-error.scss:34-38). */
    errorPanelInfo: ViewStyle;
    /** `.sd-error__item` — one message line, red error tone. */
    errorItem: TextStyle;
    /** `.sd-error--warning .sd-error__item` item color. */
    errorItemWarning: TextStyle;
    /** `.sd-error--info .sd-error__item` item color. */
    errorItemInfo: TextStyle;
    /** `.sd-question--left` — header+content row (`flex-direction: row; column-gap: calcSize(3)`). */
    titleLeftRow: ViewStyle;
    /** `.sd-question__header--location--left` — `margin-top: calcSize(1.5)`. */
    headerLeft: ViewStyle;
    /** `.sd-question__content--left` — `flex: 1`. */
    contentLeft: ViewStyle;
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
    // --sd-base-vertical-padding = 4*baseUnit at the regular (>=600) tier
    // (default.m600.scss:7; the 2*baseUnit value on :14 is the --mobile
    // override — narrow-tier variants are deferred with the rest of the
    // chrome's narrow handling). Formulas below are pre-multiplied:
    // 0.25*4 - 0.5 = 0.5; 0.375*4 = 1.5.
    descriptionUnderTitle: {
      marginTop: calcSize(resolved, 0.5),
    },
    descriptionUnderInput: {
      paddingTop: calcSize(resolved, 1.5),
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
    // Tone panels/items use the SAME semantic tokens upstream's SCSS names
    // (sd-error.scss:26-38); the registry carries their upstream fallback
    // chains (--sjs-special-yellow-light / --sjs-secondary-backcolor /
    // --sjs-special-blue(-light)), so themed overrides of either the
    // semantic var or its fallback flow through resolveColorVar.
    errorPanelWarning: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-semantic-yellow-background-10',
        sink
      ).css,
    },
    errorPanelInfo: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-semantic-blue-background-10',
        sink
      ).css,
    },
    errorItem: {
      color: resolveColorVar(resolved, '--sjs-special-red', sink).css,
      fontSize: calcFontSize(resolved, 0.75),
      lineHeight: calcLineHeight(resolved, 1),
      fontWeight: '600',
    },
    errorItemWarning: {
      color: resolveColorVar(
        resolved,
        '--sjs-semantic-yellow-background-500',
        sink
      ).css,
    },
    errorItemInfo: {
      color: resolveColorVar(
        resolved,
        '--sjs-semantic-blue-background-500',
        sink
      ).css,
    },
    titleLeftRow: {
      flexDirection: 'row',
      columnGap: calcSize(resolved, 3),
    },
    headerLeft: {
      marginTop: calcSize(resolved, 1.5),
    },
    contentLeft: {
      flex: 1,
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
