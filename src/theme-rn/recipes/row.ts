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
  /** Multi-element add-on: wrap + rowGap + `marginStart: -gutter`. */
  rowMultiple: ViewStyle;
  /** Per-element wrapper add-on for multi rows: `paddingStart: gutter`. */
  elementWrapperMultiple: ViewStyle;
  /** The gutter g in dp — ALSO the width resolver's `gutter` input. */
  gutter: number;
  /** Vertical gap between wrapped lines (dp). */
  rowGap: number;
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
  marginTop: number
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
    rowMultiple: {
      flexWrap: 'wrap',
      rowGap,
      marginStart: -gutter,
    },
    elementWrapperMultiple: {
      paddingStart: gutter,
    },
  });
  return {
    row: fragments.row,
    rowFirst: fragments.rowFirst,
    rowMultiple: fragments.rowMultiple,
    elementWrapperMultiple: fragments.elementWrapperMultiple,
    gutter,
    rowGap,
  };
}

export function buildRowRecipe(
  resolved: ResolvedTheme,
  _buildCtx: BuildContext
): RowRecipe {
  // Page rows: gutter/rowGap/marginTop all calcSize(2) — base-unit-derived,
  // identical in narrow mode (sd-row.scss `.sd-page__row` rules).
  const pageMetric = calcSize(resolved, 2);
  // Inner rows: --sd-base-padding / --sd-base-vertical-padding
  // (default.m600.scss:6-7; narrow overrides :13-14).
  const basePadding = calcSize(resolved, 5);
  const baseVertical = calcSize(resolved, 4);
  const basePaddingNarrow = calcSize(resolved, 3);
  const baseVerticalNarrow = calcSize(resolved, 2);

  const page = buildVariant(pageMetric, pageMetric, pageMetric);
  return {
    variants: {
      page,
      pageNarrow: buildVariant(pageMetric, pageMetric, pageMetric),
      inner: buildVariant(basePadding, baseVertical, baseVertical),
      innerNarrow: buildVariant(
        basePaddingNarrow,
        baseVerticalNarrow,
        baseVerticalNarrow
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
