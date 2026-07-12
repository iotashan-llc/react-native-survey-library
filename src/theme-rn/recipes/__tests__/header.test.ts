/**
 * Survey-header recipe tests (task 1.6). Fixture: upstream
 * `default-theme/blocks/sd-title.scss` (`.sd-title.sd-container-modern__title`
 * + `.sd-header__text`), `mixins.scss` `survey_title`/`survey_description`
 * (lines 187-197), `variables.scss` surveytitle/surveydescription fallback
 * chains (lines 65-71), and `default.m600.scss:8` for the page padding —
 * RN IS the mobile context, so the m600 value is the fixture, not the
 * desktop one. Every metric is FORMULA-first from resolved tokens
 * (0.7-metrics-fixture.md rule), never a hardcoded literal.
 */
import { resolveTheme } from '../../../theme-core/resolve';
import { buildHeaderRecipe } from '../header';
import { resolveColorVar } from '../tokenLookup';

const resolved = resolveTheme(undefined);

describe('buildHeaderRecipe — formulas from resolved tokens', () => {
  const recipe = buildHeaderRecipe(resolved);

  it('root: row layout, centered, gap calcSize(4)=32, padding calcSize(3)=24 (m600 fixture)', () => {
    expect(recipe.fragments.root.flexDirection).toBe('row');
    expect(recipe.fragments.root.alignItems).toBe('center');
    expect(recipe.fragments.root.gap).toBe(32);
    expect(recipe.fragments.root.padding).toBe(24);
  });

  it('root: the upstream `box-shadow: 0px 2px 0px $primary` accent maps to a 2dp bottom border in primary', () => {
    expect(recipe.fragments.root.borderBottomWidth).toBe(2);
    expect(recipe.fragments.root.borderBottomColor).toBe(
      resolveColorVar(resolved, '--sjs-primary-backcolor').css
    );
  });

  it('textBlock: column, gap calcSize(1)=8, grows and shrinks (sd-header__text flex-grow: 1)', () => {
    expect(recipe.fragments.textBlock.flexDirection).toBe('column');
    expect(recipe.fragments.textBlock.gap).toBe(8);
    expect(recipe.fragments.textBlock.flexGrow).toBe(1);
    expect(recipe.fragments.textBlock.flexShrink).toBe(1);
  });

  it('title: fontSize 2x base = 32, lineHeight 1.25x = 40, weight 700, color = $primary fallback (survey_title mixin + variables.scss:66-67)', () => {
    expect(recipe.fragments.title.fontSize).toBe(32);
    expect(recipe.fragments.title.lineHeight).toBe(40);
    expect(recipe.fragments.title.fontWeight).toBe('700');
    expect(recipe.fragments.title.color).toBe(
      resolveColorVar(resolved, '--sjs-primary-backcolor').css
    );
  });

  it('description: fontSize = base = 16, lineHeight 1.5x = 24, weight 400, color = $foreground-light fallback (survey_description mixin + variables.scss:70-71)', () => {
    expect(recipe.fragments.description.fontSize).toBe(16);
    expect(recipe.fragments.description.lineHeight).toBe(24);
    expect(recipe.fragments.description.fontWeight).toBe('400');
    expect(recipe.fragments.description.color).toBe(
      resolveColorVar(resolved, '--sjs-general-forecolor-light').css
    );
  });

  it('logoImage: marginTop calcSize(1)=8 (sd-title.scss `.sd-logo__image`)', () => {
    expect(recipe.fragments.logoImage.marginTop).toBe(8);
  });

  it('a theme surveytitle-size override flows into the title formula', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-font-surveytitle-size': '24px' },
    });
    const customRecipe = buildHeaderRecipe(custom);
    expect(customRecipe.fragments.title.fontSize).toBe(24);
    expect(customRecipe.fragments.title.lineHeight).toBe(30);
  });

  it('a theme surveytitle-color override wins over the $primary fallback', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-font-surveytitle-color': 'rgba(10, 20, 30, 1)' },
    });
    const customRecipe = buildHeaderRecipe(custom);
    expect(customRecipe.fragments.title.color).toBe(
      resolveColorVar(custom, '--sjs-font-surveytitle-color').css
    );
    expect(customRecipe.fragments.title.color).not.toBe(
      resolveColorVar(custom, '--sjs-primary-backcolor').css
    );
  });
});

describe('buildRecipes aggregation', () => {
  it('exposes the header recipe on the shared Recipes bag', async () => {
    const { buildRecipes } = await import('../index');
    const recipes = buildRecipes(resolved, { platform: { os: 'ios' } });
    expect(recipes.header.fragments.root.flexDirection).toBe('row');
  });
});
