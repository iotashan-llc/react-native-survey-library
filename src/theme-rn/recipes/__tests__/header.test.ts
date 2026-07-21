/**
 * Survey-header recipe tests (task 1.6). Fixture: upstream
 * `default-theme/blocks/sd-title.scss` (`.sd-title.sd-container-modern__title`
 * + `.sd-header__text`), `mixins.scss` `survey_title`/`survey_description`
 * (lines 187-197), `variables.scss` surveytitle/surveydescription fallback
 * chains (lines 65-71), and `default.m600.scss`'s `--mobile` MODIFIER
 * tier (lines 11-16: page padding calc(2 * base-unit); lines 32-38:
 * `.sd-title.sd-container-modern__title { flex-direction: column }` +
 * `.sd-header__text { min-width: 100% }`) — RN IS the mobile context, so
 * the mobile-modifier rules are the fixture, not the base m600 tier
 * (which still lays the header out as a desktop row with 24dp padding).
 * Every metric is FORMULA-first from resolved tokens
 * (0.7-metrics-fixture.md rule), never a hardcoded literal.
 */
import { resolveTheme } from '../../../theme-core/resolve';
import { buildHeaderRecipe } from '../header';
import { resolveColorVar } from '../tokenLookup';

const resolved = resolveTheme(undefined);

describe('buildHeaderRecipe — formulas from resolved tokens', () => {
  const recipe = buildHeaderRecipe(resolved);

  it('root: COLUMN layout (mobile modifier), centered, gap calcSize(4)=32, padding calcSize(2)=16 (mobile --sd-page-vertical-padding)', () => {
    expect(recipe.fragments.root.flexDirection).toBe('column');
    expect(recipe.fragments.root.alignItems).toBe('center');
    expect(recipe.fragments.root.gap).toBe(32);
    expect(recipe.fragments.root.padding).toBe(16);
  });

  it('root: the upstream `box-shadow: 0px 2px 0px $primary` accent maps to a 2dp bottom border in primary', () => {
    expect(recipe.fragments.root.borderBottomWidth).toBe(2);
    expect(recipe.fragments.root.borderBottomColor).toBe(
      resolveColorVar(resolved, '--sjs-primary-backcolor').css
    );
  });

  it('textBlock: column, gap calcSize(1)=8, grows and shrinks (sd-header__text flex-grow: 1), minWidth 100% (mobile modifier)', () => {
    expect(recipe.fragments.textBlock.flexDirection).toBe('column');
    expect(recipe.fragments.textBlock.gap).toBe(8);
    expect(recipe.fragments.textBlock.flexGrow).toBe(1);
    expect(recipe.fragments.textBlock.flexShrink).toBe(1);
    expect(recipe.fragments.textBlock.minWidth).toBe('100%');
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

describe('buildHeaderRecipe — advanced cover (task 5.6)', () => {
  const recipe = buildHeaderRecipe(resolved);

  it('content: grid container padding calcSize(5)=40, rowGap calcSize(1.5)=12, flexGrow 1 (.sv-header__content)', () => {
    expect(recipe.cover.content.padding).toBe(40);
    expect(recipe.cover.content.rowGap).toBe(12);
    expect(recipe.cover.content.flexGrow).toBe(1);
  });

  it('row: 1fr/1fr/1fr flex row, columnGap calcSize(6)=48, shares the content height (flex 1)', () => {
    expect(recipe.cover.row.flexDirection).toBe('row');
    expect(recipe.cover.row.columnGap).toBe(48);
    expect(recipe.cover.row.flex).toBe(1);
  });

  it('cell: 1fr column flexbox with rowGap calcSize(1)=8 (.sv-header__cell content stacking)', () => {
    expect(recipe.cover.cell.flex).toBe(1);
    expect(recipe.cover.cell.flexDirection).toBe('column');
    expect(recipe.cover.cell.rowGap).toBe(8);
  });

  it('title: header_title mixin — fontSize 2x base = 32, lineHeight 1.25x = 40, weight 700, color = resolved header title color', () => {
    expect(recipe.cover.title.fontSize).toBe(32);
    expect(recipe.cover.title.lineHeight).toBe(40);
    expect(recipe.cover.title.fontWeight).toBe('700');
    expect(recipe.cover.title.color).toBe(
      resolved.header.colors.resolved.titleColor.css
    );
  });

  it('description: header_description mixin — LITERAL 20px default, lineHeight 1.5x = 30, weight 400, color = resolved header description color', () => {
    expect(recipe.cover.description.fontSize).toBe(20);
    expect(recipe.cover.description.lineHeight).toBe(30);
    expect(recipe.cover.description.fontWeight).toBe('400');
    expect(recipe.cover.description.color).toBe(
      resolved.header.colors.resolved.descriptionColor.css
    );
  });

  it('coverOverlap: mobile-tier metrics — paddingBottom calcSize(2)=16, marginBottom -calcSize(5)=-40', () => {
    expect(recipe.coverOverlap.paddingBottom).toBe(16);
    expect(recipe.coverOverlap.marginBottom).toBe(-40);
  });

  it('coverBackgroundColor: undefined for a header-less theme (backgroundKind none → transparent)', () => {
    expect(recipe.coverBackgroundColor).toBeUndefined();
  });

  it('coverBackgroundColor: resolves a custom --sjs-header-backcolor to a concrete color', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-header-backcolor': 'rgba(1, 2, 3, 1)' },
    });
    const customRecipe = buildHeaderRecipe(custom);
    expect(customRecipe.coverBackgroundColor).toBe(
      custom.header.colors.resolved.backgroundColor.css
    );
    expect(customRecipe.coverBackgroundColor).toBe('rgba(1, 2, 3, 1)');
  });

  it('coverBackgroundColor: resolves the accent var(--sjs-primary-backcolor) to the concrete primary color (RN cannot render a raw CSS var)', () => {
    const accent = resolveTheme({
      cssVariables: {
        '--sjs-header-backcolor': 'var(--sjs-primary-backcolor)',
      },
    });
    const accentRecipe = buildHeaderRecipe(accent);
    expect(accentRecipe.coverBackgroundColor).toBe(
      resolveColorVar(accent, '--sjs-primary-backcolor').css
    );
    expect(accentRecipe.coverBackgroundColor).not.toContain('var(');
  });
});

describe('buildRecipes aggregation', () => {
  it('exposes the header recipe on the shared Recipes bag', async () => {
    const { buildRecipes } = await import('../index');
    const recipes = buildRecipes(resolved, { platform: { os: 'ios' } });
    expect(recipes.header.fragments.root.flexDirection).toBe('column');
  });
});
