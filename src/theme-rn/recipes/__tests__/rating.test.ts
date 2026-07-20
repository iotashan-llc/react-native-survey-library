/**
 * Rating recipe tests (task 1.14, design:
 * docs/design/0.7-metrics-fixture.md, "Rating item"). Fixture:
 * `default-theme/blocks/sd-rating.scss`.
 */
import { resolveTheme } from '../../../theme-core/resolve';
import { resolveColorVar } from '../tokenLookup';
import {
  buildRatingRecipe,
  resolveRatingItemLegalState,
  selectRatingPillStyles,
  selectRatingSmileyStyles,
  selectRatingSmileyIconFill,
  selectRatingStarIconStyle,
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

describe('starIconStyles -- web `.sd-rating__item-star svg` fill/stroke contract (sd-rating.scss:392-550)', () => {
  const recipe = buildRatingRecipe(resolved);
  const border = resolveColorVar(resolved, '--sjs-border-default').css;
  const primary = resolveColorVar(resolved, '--sjs-primary-backcolor').css;
  const foreground = resolveColorVar(resolved, '--sjs-general-forecolor').css;
  const redLight = resolveColorVar(resolved, '--sjs-special-red-light').css;

  it('unselected (base): OUTLINE -- fill transparent, stroke $border (--sjs-border-default), stroke-width 2', () => {
    expect(recipe.starIconStyles.unselected).toEqual({
      fill: 'transparent',
      stroke: border,
      strokeWidth: 2,
    });
  });

  it('selected: FILLED -- fill $primary (--sjs-primary-backcolor), stroke transparent', () => {
    expect(recipe.starIconStyles.selected).toEqual({
      fill: primary,
      stroke: 'transparent',
      strokeWidth: 2,
    });
  });

  it('readOnly: outline stroke $border / fill none; selected+readOnly: fill $foreground / stroke none', () => {
    expect(recipe.starIconStyles.readOnly).toEqual({
      fill: 'none',
      stroke: border,
      strokeWidth: 2,
    });
    expect(recipe.starIconStyles.selectedReadOnly).toEqual({
      fill: foreground,
      stroke: 'none',
      strokeWidth: 2,
    });
  });

  it('preview: stroke $foreground width 1 / fill none; selected+preview: fill $foreground / stroke none (width 1 inherited from the --preview rule)', () => {
    expect(recipe.starIconStyles.preview).toEqual({
      fill: 'none',
      stroke: foreground,
      strokeWidth: 1,
    });
    expect(recipe.starIconStyles.selectedPreview).toEqual({
      fill: foreground,
      stroke: 'none',
      strokeWidth: 1,
    });
  });

  it('error: fill $red-light / stroke none (single rule -- no --selected.--error combo in the fixture)', () => {
    expect(recipe.starIconStyles.error).toEqual({
      fill: redLight,
      stroke: 'none',
      strokeWidth: 2,
    });
  });

  it('focused (:focus-within, non-preview): stroke $primary / fill transparent; selected+focused: both $primary', () => {
    expect(recipe.starIconStyles.focused).toEqual({
      fill: 'transparent',
      stroke: primary,
      strokeWidth: 2,
    });
    expect(recipe.starIconStyles.selectedFocused).toEqual({
      fill: primary,
      stroke: primary,
      strokeWidth: 2,
    });
  });

  it('the unselected outline is visibly distinct from the selected fill (the device-observed bug: all stars solid)', () => {
    expect(recipe.starIconStyles.unselected.fill).toBe('transparent');
    expect(recipe.starIconStyles.selected.fill).not.toBe('transparent');
    expect(recipe.starIconStyles.unselected.stroke).not.toBe('transparent');
  });
});

describe('selectRatingStarIconStyle -- legal-state selection', () => {
  const recipe = buildRatingRecipe(resolved);

  it('base: unselected -> unselected style; selected -> selected style', () => {
    expect(selectRatingStarIconStyle(recipe, input())).toBe(
      recipe.starIconStyles.unselected
    );
    expect(selectRatingStarIconStyle(recipe, input({ selected: true }))).toBe(
      recipe.starIconStyles.selected
    );
  });

  it('readOnly (+selected) beats preview/focused/error', () => {
    expect(
      selectRatingStarIconStyle(
        recipe,
        input({ readOnly: true, preview: true, focused: true, error: true })
      )
    ).toBe(recipe.starIconStyles.readOnly);
    expect(
      selectRatingStarIconStyle(
        recipe,
        input({ selected: true, readOnly: true, focused: true })
      )
    ).toBe(recipe.starIconStyles.selectedReadOnly);
  });

  it('preview (+selected)', () => {
    expect(selectRatingStarIconStyle(recipe, input({ preview: true }))).toBe(
      recipe.starIconStyles.preview
    );
    expect(
      selectRatingStarIconStyle(
        recipe,
        input({ selected: true, preview: true })
      )
    ).toBe(recipe.starIconStyles.selectedPreview);
  });

  it('focused (+selected) beats error (fixture: the :focus-within rule is later AND more specific than --error)', () => {
    expect(
      selectRatingStarIconStyle(recipe, input({ focused: true, error: true }))
    ).toBe(recipe.starIconStyles.focused);
    expect(
      selectRatingStarIconStyle(
        recipe,
        input({ selected: true, focused: true })
      )
    ).toBe(recipe.starIconStyles.selectedFocused);
  });

  it('error applies regardless of selected', () => {
    expect(selectRatingStarIconStyle(recipe, input({ error: true }))).toBe(
      recipe.starIconStyles.error
    );
    expect(
      selectRatingStarIconStyle(recipe, input({ selected: true, error: true }))
    ).toBe(recipe.starIconStyles.error);
  });

  it('pressed (gated, never selected): falls back to the unselected base style (no :active rule in the fixture)', () => {
    expect(
      selectRatingStarIconStyle(
        recipe,
        input({ pressed: true, selected: true })
      )
    ).toBe(recipe.starIconStyles.unselected);
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
