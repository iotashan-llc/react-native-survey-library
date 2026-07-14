/**
 * Row recipe (task 1.4 — composition). Hand-authored geometry metrics from
 * survey-core v2.5.33 SCSS per A7 ("per-component metrics absent from
 * theme JSON are hand-authored from v2.5.33 SCSS, source documented per
 * token"):
 *
 * - `default-theme/blocks/sd-row.scss`
 *   - `.sd-row` — `display:flex; flex-direction:row; width:100%;
 *     margin-top: var(--sd-base-vertical-padding)` (panel-inner rows);
 *   - `.sd-row.sd-page__row` — `margin-top: calcSize(2)` (page rows);
 *   - `.sd-row:first-of-type` — `margin-top: 0`;
 *   - `.sd-row--multiple` — `flex-wrap: wrap; row-gap;` + the gutter
 *     technique: row `margin-left: -g; width: calc(100% + g)`, each
 *     element wrapper `padding-left: g`. The `%`-base widening this
 *     implies (percentBase = rowWidth + g) is the WIDTH RESOLVER caller
 *     contract (docs/design/1.3-width-resolver.md D4) — the component
 *     passes this recipe's `gutter` into `resolveRowWidths`.
 *   - `.sd-page__row.sd-row--multiple` — page gutter `calcSize(-2)`
 *     margin / `calcSize(2)` element padding (base-unit-derived, NOT
 *     `--sd-base-padding`, so it does not change in narrow mode);
 *     `row-gap: calcSize(2)` from the base `.sd-row--multiple` rule.
 *   - `.sd-panel:not(.sd-panel--as-page) .sd-row--multiple` — inner
 *     gutter `var(--sd-base-padding)`, `row-gap:
 *     var(--sd-base-vertical-padding)`.
 *   - `.sd-row--compact` variants — compact (panelless) page rows use the
 *     SAME `--sd-base-padding`/`--sd-base-vertical-padding` metrics as
 *     panel-inner rows; the component selects the `inner` variant for
 *     them (`survey.isCompact`).
 * - `default-theme/default.m600.scss:6-14` —
 *   `--sd-base-padding: calc(5*base-unit)` (mobile/narrow: `3*`),
 *   `--sd-base-vertical-padding: calc(4*base-unit)` (narrow: `2*`).
 *
 * `narrow` is a SELECT-time input (types.ts: "narrow/rtl are SELECT-time
 * inputs"), so the recipe prebuilds both normal and narrow variants and
 * `selectRowVariant` picks at render time — zero allocation beyond the
 * lookup (the "legal states only" enumeration precedent from the item
 * recipe: page/pageNarrow/inner/innerNarrow are the four legal tuples).
 *
 * Narrow variants are STACKED (`stacked: true`): multi-element rows
 * collapse to a column of full-width children separated by the variant
 * rowGap. The DOM ends up in the same state emergently — each element's
 * `min-width: min(100%, var(--min-width))` forces `flex-wrap` onto one
 * line per element and `flex-grow: 1` fills each line — but that path
 * needs CSS `min()`/`%` at layout time; the RN resolver is all-numeric,
 * so the collapse is an explicit mode instead (see DIFFERENCES.md,
 * "Narrow-mode multi-element rows stack explicitly").
 *
 * Not carried (documented): `.sd-row--enter/--leave` animations (the
 * renderer never calls `enableOnElementRerenderedEvent()`, so core's row
 * animations are disallowed headless — 1.3 design "verified upstream
 * facts"), `.sd-panel--as-page` row overrides (paneldynamic renderAs
 * page, M2/M3), `.sv-skeleton-element` lazy-rendering skeletons
 * (`survey.lazyRendering` is DOM-scroll-driven; see DIFFERENCES.md).
 */
import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcSize } from './tokenLookup';
import type { BuildContext } from './types';

/** One prebuilt geometry tuple (page/pageNarrow/inner/innerNarrow). */
export interface RowVariantStyles {
  /** Base row: flex row, stretch, inter-row marginTop. */
  row: ViewStyle;
  /** First-row override: marginTop 0 (`.sd-row:first-of-type`). */
  rowFirst: ViewStyle;
  /**
   * First-row override when the container rendered a page header directly
   * above the rows: `.sd-page__title/.sd-page__description ~
   * .sd-row.sd-page__row:not(.sd-row--compact)` -> `calcSize(3)`; the
   * compact sibling rule keeps `--sd-base-vertical-padding` (which the
   * inner variants carry, since compact page rows select `inner`).
   * Beats `:first-of-type`'s zeroing exactly as the SCSS specificity does.
   */
  rowFirstAfterHeader: ViewStyle;
  /**
   * Multi-element add-on. Non-stacked: wrap + rowGap + `marginStart:
   * -gutter`. Stacked (narrow): `flexDirection: 'column'` + rowGap —
   * children stack full-width; no widening, no wrap.
   */
  rowMultiple: ViewStyle;
  /**
   * Per-element wrapper add-on for multi rows: `paddingStart: gutter`.
   * Empty for stacked variants (a stacked child owns its full line — the
   * DOM's wrapped line nets to full content width because the row's
   * `-g` margin cancels the element's `g` padding).
   */
  elementWrapperMultiple: ViewStyle;
  /**
   * The gutter g in dp — ALSO the width resolver's `gutter` input. For
   * stacked variants this stays the SCSS-derived metric for reference,
   * but the component never feeds it to the resolver while stacking.
   */
  gutter: number;
  /** Vertical gap between wrapped lines / stacked children (dp). */
  rowGap: number;
  /**
   * Narrow variants collapse multi-element rows into a vertical stack of
   * full-width children. The DOM reaches the same end state EMERGENTLY on
   * narrow screens (each element's `min-width: min(100%, 300px)` forces
   * `flex-wrap` onto one line per element, and `flex-grow: 1` fills each
   * line); RN's resolver produces all-numeric widths, so the collapse is
   * an explicit select-time mode instead (see DIFFERENCES.md).
   */
  stacked: boolean;
}

export type RowVariantContext = 'page' | 'inner';

export interface RowRecipe {
  variants: {
    page: RowVariantStyles;
    pageNarrow: RowVariantStyles;
    inner: RowVariantStyles;
    innerNarrow: RowVariantStyles;
  };
}

function buildVariant(
  gutter: number,
  rowGap: number,
  marginTop: number,
  afterHeaderMarginTop: number,
  stacked: boolean
): RowVariantStyles {
  const fragments = StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      marginTop,
    },
    rowFirst: {
      marginTop: 0,
    },
    rowFirstAfterHeader: {
      marginTop: afterHeaderMarginTop,
    },
    rowMultiple: stacked
      ? {
          flexDirection: 'column',
          rowGap,
        }
      : {
          flexWrap: 'wrap',
          rowGap,
          marginStart: -gutter,
        },
    elementWrapperMultiple: stacked
      ? {}
      : {
          paddingStart: gutter,
        },
  });
  return {
    row: fragments.row,
    rowFirst: fragments.rowFirst,
    rowFirstAfterHeader: fragments.rowFirstAfterHeader,
    rowMultiple: fragments.rowMultiple,
    elementWrapperMultiple: fragments.elementWrapperMultiple,
    gutter,
    rowGap,
    stacked,
  };
}

export function buildRowRecipe(
  resolved: ResolvedTheme,
  _buildCtx: BuildContext
): RowRecipe {
  // Page rows: gutter/rowGap/marginTop all calcSize(2) — base-unit-derived,
  // identical in narrow mode (sd-row.scss `.sd-page__row` rules).
  const pageMetric = calcSize(resolved, 2);
  // Header-adjacent first page row: calcSize(3) (sd-row.scss
  // `.sd-page__title/.sd-page__description ~ .sd-row.sd-page__row:not(
  // .sd-row--compact)`), base-unit-derived, identical in narrow mode.
  const afterHeaderMetric = calcSize(resolved, 3);
  // Inner rows: --sd-base-padding / --sd-base-vertical-padding
  // (default.m600.scss:6-7; narrow overrides :13-14). Their after-header
  // margin stays --sd-base-vertical-padding (the `~ .sd-page__row
  // .sd-row--compact` rule) — same value as the base marginTop.
  const basePadding = calcSize(resolved, 5);
  const baseVertical = calcSize(resolved, 4);
  const basePaddingNarrow = calcSize(resolved, 3);
  const baseVerticalNarrow = calcSize(resolved, 2);

  return {
    variants: {
      page: buildVariant(
        pageMetric,
        pageMetric,
        pageMetric,
        afterHeaderMetric,
        false
      ),
      pageNarrow: buildVariant(
        pageMetric,
        pageMetric,
        pageMetric,
        afterHeaderMetric,
        true
      ),
      inner: buildVariant(
        basePadding,
        baseVertical,
        baseVertical,
        baseVertical,
        false
      ),
      innerNarrow: buildVariant(
        basePaddingNarrow,
        baseVerticalNarrow,
        baseVerticalNarrow,
        baseVerticalNarrow,
        true
      ),
    },
  };
}

/** Render-time variant pick — the four legal (context, narrow) tuples. */
export function selectRowVariant(
  recipe: RowRecipe,
  context: RowVariantContext,
  narrow: boolean
): RowVariantStyles {
  if (context === 'page') {
    return narrow ? recipe.variants.pageNarrow : recipe.variants.page;
  }
  return narrow ? recipe.variants.innerNarrow : recipe.variants.inner;
}
