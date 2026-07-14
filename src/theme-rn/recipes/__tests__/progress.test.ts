/**
 * Progress-bar recipe tests (task 1.8, design:
 * docs/design/0.7-metrics-fixture.md, "Progress bar"). Fixture:
 * `default-theme/blocks/sd-progress.scss`.
 */
import { resolveTheme } from '../../../theme-core/resolve';
import { buildProgressRecipe } from '../progress';

const resolved = resolveTheme(undefined);

describe('buildProgressRecipe -- formulas from resolved tokens', () => {
  const recipe = buildProgressRecipe(resolved);

  it('track: height calcSize(0.25)=2, background border-light, overflow hidden', () => {
    expect(recipe.fragments.track.height).toBe(2);
    expect(recipe.fragments.track.overflow).toBe('hidden');
    expect(recipe.fragments.track.backgroundColor).toEqual(expect.any(String));
  });

  it('bar: full height, background primary-backcolor', () => {
    expect(recipe.fragments.bar.height).toBe('100%');
    expect(recipe.fragments.bar.backgroundColor).toEqual(expect.any(String));
  });

  it('text: fontSize calcFontSize(0.75)=12, lineHeight calcLineHeight(1)=16, fontWeight 600', () => {
    expect(recipe.fragments.text.fontSize).toBe(12);
    expect(recipe.fragments.text.lineHeight).toBe(16);
    expect(recipe.fragments.text.fontWeight).toBe('600');
  });

  it('text: paddingVertical calcSize(1)=8, paddingHorizontal calcSize(1.5)=12', () => {
    expect(recipe.fragments.text.paddingVertical).toBe(8);
    expect(recipe.fragments.text.paddingHorizontal).toBe(12);
  });

  it('track height tracks a custom --sjs-base-unit (formula-first, not hardcoded)', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-base-unit': '10px' },
    });
    const customRecipe = buildProgressRecipe(custom);
    expect(customRecipe.fragments.track.height).toBe(2.5);
  });
});
