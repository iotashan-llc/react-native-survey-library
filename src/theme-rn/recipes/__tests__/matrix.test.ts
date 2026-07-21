/**
 * Matrix recipe (task M3 3.1a) — the presentational `MatrixGrid`
 * primitive's grid-line / header / row-header / data / footer fragments,
 * authored from v2.5.33 matrix SCSS (invariant 4). This is the 3.1a
 * SUBSET (grid geometry + gridlines); the model-state fragments
 * (checked/error/card/add-remove buttons) are added by later M3 phases.
 */
import { StyleSheet } from 'react-native';
import { resolveTheme } from '../../../theme-core/resolve';
import { buildMatrixRecipe } from '../matrix';
import { buildRecipes } from '../index';

const CTX = { platform: { os: 'ios' as const } };

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

describe('matrix recipe — build shape', () => {
  const resolved = resolveTheme(undefined);
  const recipe = buildMatrixRecipe(resolved, CTX);

  it('exposes the 3.1a grid fragments', () => {
    for (const key of [
      'grid',
      'headerCell',
      'headerText',
      'rowHeaderCell',
      'dataCell',
      'footerCell',
      'detailCell',
      'cellText',
    ] as const) {
      expect(recipe.fragments[key]).toBeDefined();
    }
  });

  it('every fragment flattens to finite numbers / string colors (never NaN)', () => {
    for (const style of Object.values(recipe.fragments)) {
      const f = flat(style);
      for (const v of Object.values(f)) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });

  it('cells draw gridlines (data cell carries a bottom+end border width and color)', () => {
    const f = flat(recipe.fragments.dataCell);
    expect(f.borderBottomWidth).toBeGreaterThan(0);
    expect(f.borderEndWidth).toBeGreaterThan(0);
    expect(typeof f.borderColor).toBe('string');
  });

  it('exposes the 3.3b detail-toggle fragment + icon metrics (formula-first, token colors)', () => {
    // The detail-toggle cell (3.3b) centers the expand/collapse RNIcon
    // inside the intrinsic actions column with a real hit target.
    const f = flat(recipe.fragments.detailToggle);
    expect(f.alignItems).toBe('center');
    expect(f.justifyContent).toBe('center');
    expect(f.minHeight as number).toBeGreaterThan(0);
    // Icon metrics ride the recipe (never component literals): the 16dp
    // glyph family (expanddetails-16x16 / collapsedetails-16x16) sized
    // from the base unit, tinted with the general forecolor token.
    expect(recipe.detailIconSize).toBeGreaterThan(0);
    expect(typeof recipe.detailIconColor).toBe('string');
    expect(recipe.detailIconColor.length).toBeGreaterThan(0);
  });
});

describe('matrix recipe — wired into the aggregate Recipes', () => {
  it('buildRecipes(...).matrix is defined', () => {
    const resolved = resolveTheme(undefined);
    const recipes = buildRecipes(resolved, CTX);
    expect(recipes.matrix).toBeDefined();
    expect(recipes.matrix.fragments.dataCell).toBeDefined();
  });
});
