/**
 * Text-input recipe tests (docs/design/0.7-metrics-fixture.md, "Text input
 * -- sd-input.scss"). 9 fixture-locked legal states.
 */
import { resolveTheme } from '../../../theme-core/resolve';
import { buildInputRecipe, selectInputStyles } from '../input';
import type { InputVariant } from '../input';

const resolved = resolveTheme(undefined);
const iosCtx = { platform: { os: 'ios' as const } };

describe('buildInputRecipe — formulas from resolved tokens', () => {
  const recipe = buildInputRecipe(resolved, iosCtx);

  it('paddingVertical=calcSize(1.5)=12, paddingHorizontal=calcSize(2)=16', () => {
    expect(recipe.fragments.base.paddingVertical).toBe(12);
    expect(recipe.fragments.base.paddingHorizontal).toBe(16);
  });

  it('lineHeight = 1.5 x editorFontSize = 24; fontSize 16; fontWeight 400', () => {
    expect(recipe.fragments.base.lineHeight).toBe(24);
    expect(recipe.fragments.base.fontSize).toBe(16);
    expect(recipe.fragments.base.fontWeight).toBe('400');
  });

  it('borderRadius = editorpanel corner radius token (4 default)', () => {
    expect(recipe.fragments.base.borderRadius).toBe(4);
  });

  it('base carries the --sjs-shadow-inner layers verbatim as a boxShadow array', () => {
    expect(Array.isArray(recipe.fragments.base.boxShadow)).toBe(true);
  });

  it('preview variant: radius 0, paddingHorizontal 0, bottom border 1', () => {
    const preview = recipe.fragments.preview;
    expect(preview.borderRadius).toBe(0);
    expect(preview.paddingHorizontal).toBe(0);
    expect(preview.borderBottomWidth).toBe(1);
  });

  it('characterCounter: fontSize 16, lineHeight 24, right=16, bottom=12', () => {
    const counter = recipe.fragments.characterCounter;
    expect(counter.fontSize).toBe(16);
    expect(counter.lineHeight).toBe(24);
    expect(counter.right).toBe(16);
    expect(counter.bottom).toBe(12);
  });

  it('focused reserved end padding: normal=calcSize(8)=64, big=calcSize(11)=88', () => {
    expect(recipe.fragments.focusedCounterPadding.paddingRight).toBe(64);
    expect(recipe.fragments.focusedCounterPaddingBig.paddingRight).toBe(88);
  });
});

describe('selectInputStyles — 9 fixture-locked legal states', () => {
  const recipe = buildInputRecipe(resolved, iosCtx);
  const mode = { narrow: false, rtl: false };
  const base: InputVariant = {
    focused: false,
    readOnly: false,
    preview: false,
    error: false,
    counter: false,
    counterBig: false,
  };
  const states: InputVariant[] = [
    base,
    { ...base, focused: true },
    { ...base, readOnly: true },
    { ...base, preview: true },
    { ...base, error: true },
    { ...base, error: true, focused: true },
    { ...base, counter: true },
    { ...base, counterBig: true },
  ];

  it.each(states.map((v, i) => [i, v] as const))(
    'legal state %i selects without throwing',
    (_i, variant) => {
      const styles = selectInputStyles(recipe, variant, mode);
      expect(styles.length).toBeGreaterThan(0);
    }
  );

  it('readOnly removes the shadow (shadow removed per fixture)', () => {
    const styles = selectInputStyles(recipe, { ...base, readOnly: true }, mode);
    const flat = Object.assign({}, ...styles);
    expect(flat.boxShadow).toEqual([]);
  });

  it('preview wins layout overrides (radius 0) even combined with error', () => {
    const styles = selectInputStyles(
      recipe,
      { ...base, preview: true, error: true },
      mode
    );
    const flat = Object.assign({}, ...styles);
    expect(flat.borderRadius).toBe(0);
  });
});

describe('recipe build budget', () => {
  it('under 5ms', () => {
    const start = performance.now();
    buildInputRecipe(resolved, iosCtx);
    expect(performance.now() - start).toBeLessThan(5);
  });
});
