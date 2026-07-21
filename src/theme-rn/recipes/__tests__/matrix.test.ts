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
    // 3.3b polish: a square visual target — minWidth rides the same
    // calcSize(4) formula as minHeight so the visual box grows where the
    // intrinsic actions column allows (hitSlop on the Pressable bridges
    // the rest to the 44pt/48dp platform minimums).
    expect(f.minWidth as number).toBeGreaterThan(0);
    expect(f.minWidth).toBe(f.minHeight);
    // Icon metrics ride the recipe (never component literals): the 16dp
    // glyph family (expanddetails-16x16 / collapsedetails-16x16) sized
    // from the base unit, tinted with the general forecolor token.
    expect(recipe.detailIconSize).toBeGreaterThan(0);
    expect(typeof recipe.detailIconColor).toBe('string');
    expect(recipe.detailIconColor.length).toBeGreaterThan(0);
  });

  it('exposes the 3.4 matrixdynamic add/remove/placeholder fragments + remove-icon metrics', () => {
    for (const key of [
      'addRowButton',
      'addRowText',
      'removeRowButton',
      'placeholder',
      'placeholderText',
    ] as const) {
      expect(recipe.fragments[key]).toBeDefined();
    }
    // The remove button mirrors the detail toggle's square visual target
    // inside the intrinsic actions column.
    const remove = flat(recipe.fragments.removeRowButton);
    expect(remove.alignItems).toBe('center');
    expect(remove.justifyContent).toBe('center');
    expect(remove.minWidth).toBe(remove.minHeight);
    expect(remove.minWidth as number).toBeGreaterThan(0);
    // Accent-toned add caption (token-derived, never a literal).
    const addText = flat(recipe.fragments.addRowText);
    expect(typeof addText.color).toBe('string');
    // delete-24x24 glyph metrics ride the recipe.
    expect(recipe.removeIconSize).toBeGreaterThan(0);
    expect(typeof recipe.removeIconColor).toBe('string');
    expect(recipe.removeIconColor.length).toBeGreaterThan(0);
  });

  it('exposes the 4.3 row-reorder drag-handle fragment + drag-icon metrics', () => {
    // The drag handle centers the move-up arrow / drag glyph / move-down
    // arrow in the intrinsic drag column (same square target as the other
    // action affordances).
    const handle = flat(recipe.fragments.dragHandle);
    expect(handle.alignItems).toBe('center');
    expect(handle.justifyContent).toBe('center');
    expect(handle.minWidth).toBe(handle.minHeight);
    expect(handle.minWidth as number).toBeGreaterThan(0);
    // The arrow glyph text is token-tinted (never a literal color).
    const arrow = flat(recipe.fragments.dragArrowText);
    expect(typeof arrow.color).toBe('string');
    // icon-drag-24x24 glyph metrics ride the recipe.
    expect(recipe.dragIconSize).toBeGreaterThan(0);
    expect(typeof recipe.dragIconColor).toBe('string');
    expect(recipe.dragIconColor.length).toBeGreaterThan(0);
  });

  it('exposes the 3.1b mobile stacked-card fragments (§3b/§3d)', () => {
    for (const key of [
      'card',
      'cardTitle',
      'cardRow',
      'cardLabel',
      'cardValue',
      'cardActions',
      'cardDetail',
      'totalsCard',
      'totalsCardTitle',
    ] as const) {
      expect(recipe.fragments[key]).toBeDefined();
    }
    // The card is a bordered, rounded, padded container.
    const card = flat(recipe.fragments.card);
    expect(card.borderWidth as number).toBeGreaterThan(0);
    expect(card.borderRadius as number).toBeGreaterThan(0);
    expect(typeof card.borderColor).toBe('string');
    // The column label rides the dim secondary tone (token-derived).
    const label = flat(recipe.fragments.cardLabel);
    expect(typeof label.color).toBe('string');
    // The totals summary card takes the band emphasis background.
    const totals = flat(recipe.fragments.totalsCard);
    expect(typeof totals.backgroundColor).toBe('string');
    // Card actions sit at the foot in a row.
    const actions = flat(recipe.fragments.cardActions);
    expect(actions.flexDirection).toBe('row');
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
