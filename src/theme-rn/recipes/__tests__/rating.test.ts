/**
 * Rating recipe tests (task 1.14, design:
 * docs/design/0.7-metrics-fixture.md, "Rating item"). Fixture:
 * `default-theme/blocks/sd-rating.scss`.
 */
import { resolveTheme } from '../../../theme-core/resolve';
import {
  buildRatingRecipe,
  resolveRatingItemLegalState,
  selectRatingPillStyles,
  selectRatingSmileyStyles,
  selectRatingSmileyIconFill,
} from '../rating';
import type { RatingItemStateInput } from '../rating';

const resolved = resolveTheme(undefined);

function input(
  overrides: Partial<RatingItemStateInput> = {}
): RatingItemStateInput {
  return {
    selected: false,
    pressed: false,
    focused: false,
    readOnly: false,
    preview: false,
    error: false,
    allowHover: true,
    ...overrides,
  };
}

describe('resolveRatingItemLegalState -- precedence cascade', () => {
  it('readOnly wins over preview/pressed/focused/error', () => {
    expect(
      resolveRatingItemLegalState(
        input({ readOnly: true, preview: true, focused: true, error: true })
      )
    ).toEqual({ kind: 'readOnly', selected: false });
  });

  it('pressed is gated by allowHover && !readOnly, and carries no selected', () => {
    expect(
      resolveRatingItemLegalState(input({ pressed: true, selected: true }))
    ).toEqual({ kind: 'pressed', selected: false });
    expect(
      resolveRatingItemLegalState(
        input({ pressed: true, allowHover: false, selected: true })
      )
    ).toEqual({ kind: 'base', selected: true });
  });

  it('focused wins over error', () => {
    expect(
      resolveRatingItemLegalState(input({ focused: true, error: true }))
    ).toEqual({ kind: 'focused', selected: false });
  });

  it('base + selected is the default tuple', () => {
    expect(resolveRatingItemLegalState(input({ selected: true }))).toEqual({
      kind: 'base',
      selected: true,
    });
  });
});

describe('buildRatingRecipe -- formulas from resolved tokens', () => {
  const recipe = buildRatingRecipe(resolved);

  it('pill.base: borderRadius calcSize(12.5)=100, minWidth/minHeight calcSize(6)=48, fontSize calcFontSize(1)=16', () => {
    expect(recipe.fragments.pill.base.borderRadius).toBe(100);
    expect(recipe.fragments.pill.base.minWidth).toBe(48);
    expect(recipe.fragments.pill.base.minHeight).toBe(48);
    expect(recipe.fragments.pill.base.fontSize).toBe(16);
  });

  it('smiley.base: borderRadius calcSize(12.5)=100, minWidth/minHeight calcSize(6)=48, borderWidth 2', () => {
    expect(recipe.fragments.smiley.base.borderRadius).toBe(100);
    expect(recipe.fragments.smiley.base.minWidth).toBe(48);
    expect(recipe.fragments.smiley.base.borderWidth).toBe(2);
  });

  it('starIconSize: calcSize(6)=48', () => {
    expect(recipe.starIconSize).toBe(48);
  });

  it('row: flexDirection row, gap calcSize(1)=8', () => {
    expect(recipe.fragments.row.flexDirection).toBe('row');
    expect(recipe.fragments.row.gap).toBe(8);
  });

  it('formulas track a custom --sjs-base-unit (formula-first, not hardcoded)', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-base-unit': '10px' },
    });
    const customRecipe = buildRatingRecipe(custom);
    expect(customRecipe.starIconSize).toBe(60);
  });
});

describe('selectRatingPillStyles -- exhaustive composition', () => {
  const recipe = buildRatingRecipe(resolved);

  it('base (unselected): only the base fragment', () => {
    const styles = selectRatingPillStyles(recipe, input());
    expect(styles).toEqual([recipe.fragments.pill.base]);
  });

  it('selected: base + selected', () => {
    const styles = selectRatingPillStyles(recipe, input({ selected: true }));
    expect(styles).toEqual([
      recipe.fragments.pill.base,
      recipe.fragments.pill.selected,
    ]);
  });

  it('selected + readOnly composes base + readOnly + selectedReadOnly', () => {
    const styles = selectRatingPillStyles(
      recipe,
      input({ selected: true, readOnly: true })
    );
    expect(styles).toEqual([
      recipe.fragments.pill.base,
      recipe.fragments.pill.readOnly,
      recipe.fragments.pill.selectedReadOnly,
    ]);
  });

  it('selected + focused composes base + selected + selectedFocused (not the bare focus ring)', () => {
    const styles = selectRatingPillStyles(
      recipe,
      input({ selected: true, focused: true })
    );
    expect(styles).toEqual([
      recipe.fragments.pill.base,
      recipe.fragments.pill.selected,
      recipe.fragments.pill.selectedFocused,
    ]);
  });

  it('pressed (gated): base + pressed only, selected ignored', () => {
    const styles = selectRatingPillStyles(
      recipe,
      input({ pressed: true, selected: true })
    );
    expect(styles).toEqual([
      recipe.fragments.pill.base,
      recipe.fragments.pill.pressed,
    ]);
  });
});

describe('selectRatingSmileyStyles -- exhaustive composition', () => {
  const recipe = buildRatingRecipe(resolved);

  it('selected + preview composes base + preview + selectedPreview', () => {
    const styles = selectRatingSmileyStyles(
      recipe,
      input({ selected: true, preview: true })
    );
    expect(styles).toEqual([
      recipe.fragments.smiley.base,
      recipe.fragments.smiley.preview,
      recipe.fragments.smiley.selectedPreview,
    ]);
  });
});

describe('selectRatingSmileyIconFill', () => {
  const recipe = buildRatingRecipe(resolved);

  it('unselected -> unselected fill; selected -> selected fill', () => {
    expect(
      selectRatingSmileyIconFill(recipe, {
        selected: false,
        readOnly: false,
        preview: false,
        error: false,
      })
    ).toBe(recipe.smileyIconFills.unselected);
    expect(
      selectRatingSmileyIconFill(recipe, {
        selected: true,
        readOnly: false,
        preview: false,
        error: false,
      })
    ).toBe(recipe.smileyIconFills.selected);
  });

  it('error wins over everything else', () => {
    expect(
      selectRatingSmileyIconFill(recipe, {
        selected: true,
        readOnly: true,
        preview: true,
        error: true,
      })
    ).toBe(recipe.smileyIconFills.error);
  });
});
