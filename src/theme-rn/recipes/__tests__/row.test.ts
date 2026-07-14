/**
 * Row recipe (task 1.4 — composition): row/element-wrapper geometry
 * metrics hand-authored from survey-core v2.5.33 SCSS (A7: "per-component
 * metrics absent from theme JSON are hand-authored from v2.5.33 SCSS,
 * source documented per token").
 *
 * Sources:
 * - `default-theme/blocks/sd-row.scss` — `.sd-row` (flex row, width 100%,
 *   margin-top `--sd-base-vertical-padding`; page rows `calcSize(2)`;
 *   first row 0), `.sd-row--multiple` (flex-wrap, row-gap, the gutter
 *   technique: row `margin-left: -g; width: calc(100% + g)` + per-element
 *   `padding-left: g`), `.sd-page__row.sd-row--multiple` (page gutter =
 *   `calcSize(2)`), `.sd-panel:not(--as-page) .sd-row--multiple` (inner
 *   gutter = `--sd-base-padding`), `.sd-row--compact` variants (compact
 *   page rows use the inner metrics).
 * - `default-theme/default.m600.scss:6-14` — `--sd-base-padding` =
 *   `calc(5*base-unit)` (narrow/mobile: 3), `--sd-base-vertical-padding`
 *   = `calc(4*base-unit)` (narrow: 2).
 */
import { resolveTheme } from '../../../theme-core/resolve';
import { buildRowRecipe, selectRowVariant } from '../row';
import type { RowRecipe } from '../row';

const BUILD_CTX = { platform: { os: 'ios' as const } };

function defaultRecipe(): RowRecipe {
  return buildRowRecipe(resolveTheme(undefined), BUILD_CTX);
}

describe('row recipe — variants (default theme, base unit 8)', () => {
  it('page variant: gutter calcSize(2)=16, rowGap 16, marginTop 16', () => {
    const { variants } = defaultRecipe();
    expect(variants.page.gutter).toBe(16);
    expect(variants.page.rowGap).toBe(16);
    expect(variants.page.row.marginTop).toBe(16);
  });

  it('pageNarrow variant: page gutter is calcSize(2) regardless of narrow (sd-row.scss `.sd-page__row.sd-row--multiple` uses base-unit, not --sd-base-padding)', () => {
    const { variants } = defaultRecipe();
    expect(variants.pageNarrow.gutter).toBe(16);
    expect(variants.pageNarrow.rowGap).toBe(16);
    expect(variants.pageNarrow.row.marginTop).toBe(16);
  });

  it('inner variant (panel rows / compact page rows): gutter --sd-base-padding=40, rowGap --sd-base-vertical-padding=32, marginTop 32', () => {
    const { variants } = defaultRecipe();
    expect(variants.inner.gutter).toBe(40);
    expect(variants.inner.rowGap).toBe(32);
    expect(variants.inner.row.marginTop).toBe(32);
  });

  it('innerNarrow variant: gutter 3*unit=24, rowGap 2*unit=16, marginTop 16 (default.m600.scss mobile overrides)', () => {
    const { variants } = defaultRecipe();
    expect(variants.innerNarrow.gutter).toBe(24);
    expect(variants.innerNarrow.rowGap).toBe(16);
    expect(variants.innerNarrow.row.marginTop).toBe(16);
  });

  it('metrics scale with a custom --sjs-base-unit (4px): page gutter 8, inner gutter 20, innerNarrow 12', () => {
    const resolved = resolveTheme({
      cssVariables: { '--sjs-base-unit': '4px' },
    } as never);
    const { variants } = buildRowRecipe(resolved, BUILD_CTX);
    expect(variants.page.gutter).toBe(8);
    expect(variants.inner.gutter).toBe(20);
    expect(variants.innerNarrow.gutter).toBe(12);
  });
});

describe('row recipe — fragment shapes', () => {
  it('row base fragment: flexDirection row, stretch, carries the variant marginTop', () => {
    const { variants } = defaultRecipe();
    for (const variant of [
      variants.page,
      variants.pageNarrow,
      variants.inner,
      variants.innerNarrow,
    ]) {
      expect(variant.row.flexDirection).toBe('row');
      expect(variant.row.alignSelf).toBe('stretch');
    }
  });

  it('rowFirst fragment overrides marginTop to 0 (`.sd-row:first-of-type`)', () => {
    const { variants } = defaultRecipe();
    expect(variants.page.rowFirst.marginTop).toBe(0);
    expect(variants.inner.rowFirst.marginTop).toBe(0);
  });

  it('rowFirstAfterHeader fragment: page calcSize(3)=24 (`.sd-page__title/.sd-page__description ~ .sd-row.sd-page__row:not(--compact)`); inner keeps --sd-base-vertical-padding (32 / narrow 16, the `~ .sd-page__row.sd-row--compact` rule)', () => {
    const { variants } = defaultRecipe();
    expect(variants.page.rowFirstAfterHeader.marginTop).toBe(24);
    expect(variants.pageNarrow.rowFirstAfterHeader.marginTop).toBe(24);
    expect(variants.inner.rowFirstAfterHeader.marginTop).toBe(32);
    expect(variants.innerNarrow.rowFirstAfterHeader.marginTop).toBe(16);
  });

  it('rowMultiple fragment (non-narrow): wrap + rowGap + the DOM gutter technique (marginStart -g; % base widening is the resolver caller contract)', () => {
    const { variants } = defaultRecipe();
    expect(variants.page.rowMultiple.flexWrap).toBe('wrap');
    expect(variants.page.rowMultiple.rowGap).toBe(16);
    expect(variants.page.rowMultiple.marginStart).toBe(-16);
    expect(variants.inner.rowMultiple.marginStart).toBe(-40);
    expect(variants.page.stacked).toBe(false);
    expect(variants.inner.stacked).toBe(false);
  });

  it('narrow variants STACK: rowMultiple collapses to a column (no wrap, no negative margin) with the variant rowGap between stacked children', () => {
    const { variants } = defaultRecipe();
    for (const variant of [variants.pageNarrow, variants.innerNarrow]) {
      expect(variant.stacked).toBe(true);
      expect(variant.rowMultiple.flexDirection).toBe('column');
      expect(variant.rowMultiple.marginStart).toBeUndefined();
      expect(variant.rowMultiple.flexWrap).toBeUndefined();
    }
    expect(variants.pageNarrow.rowMultiple.rowGap).toBe(16);
    expect(variants.innerNarrow.rowMultiple.rowGap).toBe(16);
  });

  it('elementWrapperMultiple fragment: logical paddingStart g (`.sd-row--multiple > div { padding-left: g }`); stacked narrow variants carry NO gutter padding (full-width children)', () => {
    const { variants } = defaultRecipe();
    expect(variants.page.elementWrapperMultiple.paddingStart).toBe(16);
    expect(variants.inner.elementWrapperMultiple.paddingStart).toBe(40);
    expect(
      variants.pageNarrow.elementWrapperMultiple.paddingStart
    ).toBeUndefined();
    expect(
      variants.innerNarrow.elementWrapperMultiple.paddingStart
    ).toBeUndefined();
  });
});

describe('selectRowVariant', () => {
  it("('page', narrow=false) → page; ('page', true) → pageNarrow; ('inner', false) → inner; ('inner', true) → innerNarrow", () => {
    const recipe = defaultRecipe();
    expect(selectRowVariant(recipe, 'page', false)).toBe(recipe.variants.page);
    expect(selectRowVariant(recipe, 'page', true)).toBe(
      recipe.variants.pageNarrow
    );
    expect(selectRowVariant(recipe, 'inner', false)).toBe(
      recipe.variants.inner
    );
    expect(selectRowVariant(recipe, 'inner', true)).toBe(
      recipe.variants.innerNarrow
    );
  });
});

describe('buildRecipes integration', () => {
  it('the provider-level buildRecipes() exposes the row recipe', () => {
    // Deferred require keeps the recipes index out of the picture for the
    // unit tests above if this one fails first.
    const { buildRecipes } = require('../index') as {
      buildRecipes: typeof import('../index').buildRecipes;
    };
    const recipes = buildRecipes(resolveTheme(undefined), BUILD_CTX);
    expect(recipes.row.variants.page.gutter).toBe(16);
  });
});
