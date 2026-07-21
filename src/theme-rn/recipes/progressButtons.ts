/**
 * Progress-buttons recipe (task 5.7c). Fixture harvested from upstream
 * `default-theme/blocks/sd-progress-buttons.scss`:
 * - `.sd-progress-buttons` — the column container:
 *   `padding: calcSize(4) calcSize(5) calcSize(2)`, `flex-direction: column`.
 * - `.sd-progress-buttons__list` — the horizontal `li` row (`flex-direction:
 *   row`), each `li` a centered column step.
 * - `.sd-progress-buttons__button` — the numbered circle: `border-radius:
 *   50%`, `color: $background-dim` (the number), a `$foreground-dim-light`
 *   content fill (base). `--passed`: circle bg `$primary`; `--current`:
 *   circle bg `$primary-foreground`, border `$primary`, number `$primary`.
 * - `.sd-progress-buttons__page-title` — the step title: `calcFontSize(0.75)`
 *   weight 600, `$font-pagetitle-color` (mapped to `$foreground`).
 * - `.sd-progress-buttons__footer .sd-progress-buttons__page-title` — the
 *   footer progress text: `$foreground-dim-light`.
 *
 * A model-state token approach (invariant 6): the component reads
 * `ProgressButtons.getListElementCss(index)` (the CssClassBuilder string)
 * and composes the `--passed`/`--current` fragments — never re-deriving
 * page-passed/current logic. `stepNonClickable` follows the model's own
 * `isListElementClickable`.
 *
 * RN responsivity deviation (documented in DIFFERENCES.md → "Progress
 * buttons"): the DOM `ProgressButtonsResponsivityManager` (width
 * measurement → scroll arrows + hide-titles) is replaced by a horizontal
 * `ScrollView` (native touch-scroll); step titles are shown whenever the
 * model's `showItemTitles` is true (no width-driven auto-collapse, no
 * scroll-arrow affordance).
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

export interface ProgressButtonsRecipe {
  fragments: {
    /** `.sd-progress-buttons` — the column container. */
    root: ViewStyle;
    /** `.sd-progress-buttons__list` — the horizontal step row (ScrollView content). */
    list: ViewStyle;
    /** A single `li` step — centered column. */
    step: ViewStyle;
    /** Non-clickable step (model `isListElementClickable` false) — dimmed. */
    stepNonClickable: ViewStyle;
    /** `.sd-progress-buttons__button` — the base numbered circle. */
    circle: ViewStyle;
    /** `--passed` circle. */
    circlePassed: ViewStyle;
    /** `--current` circle. */
    circleCurrent: ViewStyle;
    /** The circle's number text (base). */
    number: TextStyle;
    /** `--passed` number color. */
    numberPassed: TextStyle;
    /** `--current` number color. */
    numberCurrent: TextStyle;
    /** `.sd-progress-buttons__page-title` — the per-step title. */
    title: TextStyle;
    /** `.sd-progress-buttons__footer` — the footer row (progress text). */
    footer: ViewStyle;
    /** The footer's progress-text label. */
    footerText: TextStyle;
  };
}

export function buildProgressButtonsRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): ProgressButtonsRecipe {
  const sink = buildCtx?.diagnostics;
  const primary = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;
  const primaryForecolor = resolveColorVar(
    resolved,
    '--sjs-primary-forecolor',
    sink
  ).css;
  const primaryLight = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor-light',
    sink
  ).css;
  const dim = resolveColorVar(
    resolved,
    '--sjs-general-dim-forecolor-light',
    sink
  ).css;
  const backgroundDim = resolveColorVar(
    resolved,
    '--sjs-general-backcolor-dim',
    sink
  ).css;
  const foreground = resolveColorVar(
    resolved,
    '--sjs-general-forecolor',
    sink
  ).css;

  const fragments = StyleSheet.create({
    root: {
      // .sd-progress-buttons { padding: calcSize(4) calcSize(5) calcSize(2);
      // flex-direction: column }.
      flexDirection: 'column',
      paddingTop: calcSize(resolved, 4),
      paddingBottom: calcSize(resolved, 2),
      paddingHorizontal: calcSize(resolved, 5),
    },
    list: {
      // .sd-progress-buttons__list { flex-direction: row; ... }.
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    step: {
      // Each `li`: centered column, comfortable native touch width.
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingHorizontal: calcSize(resolved, 1.5),
      minWidth: calcSize(resolved, 9),
    },
    stepNonClickable: {
      // .sd-progress-buttons__list-element--nonclickable.
      opacity: 0.5,
    },
    circle: {
      // .sd-progress-buttons__button { border-radius: 50%; ... }.
      width: calcSize(resolved, 3),
      height: calcSize(resolved, 3),
      borderRadius: calcSize(resolved, 1.5),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: calcSize(resolved, 0.25),
      borderColor: 'transparent',
      backgroundColor: dim,
    },
    circlePassed: {
      // --passed: circle background $primary.
      backgroundColor: primary,
      borderColor: primary,
    },
    circleCurrent: {
      // --current: background $primary-foreground, border $primary.
      backgroundColor: primaryLight,
      borderColor: primary,
    },
    number: {
      // .sd-progress-buttons__button { color: $background-dim;
      // font-size: calcFontSize(0.75); font-weight: 600 }.
      fontSize: calcFontSize(resolved, 0.75),
      lineHeight: calcLineHeight(resolved, 1),
      fontWeight: '600',
      color: backgroundDim,
    },
    numberPassed: {
      color: primaryForecolor,
    },
    numberCurrent: {
      color: primary,
    },
    title: {
      // .sd-progress-buttons__page-title { font-size: calcFontSize(0.75);
      // font-weight: 600; color: $font-pagetitle-color (~$foreground) }.
      fontSize: calcFontSize(resolved, 0.75),
      lineHeight: calcLineHeight(resolved, 1),
      fontWeight: '600',
      color: foreground,
      textAlign: 'center',
      marginTop: calcSize(resolved, 1),
    },
    footer: {
      // .sd-progress-buttons__footer { justify-content: flex-end }.
      alignItems: 'flex-end',
      marginTop: calcSize(resolved, 1),
    },
    footerText: {
      // .sd-progress-buttons__footer .sd-progress-buttons__page-title
      // { color: $foreground-dim-light }.
      fontSize: calcFontSize(resolved, 0.75),
      lineHeight: calcLineHeight(resolved, 1),
      fontWeight: '600',
      color: dim,
    },
  });

  return { fragments };
}
