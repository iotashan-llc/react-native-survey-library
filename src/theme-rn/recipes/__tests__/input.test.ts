/**
 * Text-input recipe tests (docs/design/0.7-metrics-fixture.md, "Text input
 * -- sd-input.scss"). 9 fixture-locked legal states.
 */
import { StyleSheet } from 'react-native';
import { resolveTheme } from '../../../theme-core/resolve';
import { buildInputRecipe, selectInputStyles } from '../input';
import type { InputVariant } from '../input';
import type { RecipeBuildDiagnostic } from '../types';

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

  it('base lineHeight tracks the EDITOR font-size token, not the base font-size (codex impl-review major 5: identical at defaults, diverges under override)', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-font-editorfont-size': '20px' },
    });
    const customRecipe = buildInputRecipe(custom, iosCtx);
    // editorLineHeight = 1.5 x 20 = 30; the base-font path would say 24.
    expect(customRecipe.fragments.base.lineHeight).toBe(30);
    expect(customRecipe.fragments.base.lineHeight).toBe(
      custom.tokens.typography.editorLineHeight
    );
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

  it('characterCounter: fontSize 16, lineHeight 24, end=16 (logical, RTL-aware), bottom=12', () => {
    const counter = recipe.fragments.characterCounter;
    expect(counter.fontSize).toBe(16);
    expect(counter.lineHeight).toBe(24);
    expect(counter.end).toBe(16);
    expect((counter as { right?: number }).right).toBeUndefined();
    expect(counter.bottom).toBe(12);
  });

  it('focused reserved END padding (logical, RTL-aware): normal=calcSize(8)=64, big=calcSize(11)=88 (codex impl-review major 7)', () => {
    expect(recipe.fragments.focusedCounterPadding.paddingEnd).toBe(64);
    expect(recipe.fragments.focusedCounterPaddingBig.paddingEnd).toBe(88);
    expect(
      (recipe.fragments.focusedCounterPadding as { paddingRight?: number })
        .paddingRight
    ).toBeUndefined();
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

describe('shadow channel plumbing — elevation applied, no-shadow states clear BOTH (codex impl-review major 1)', () => {
  const android21 = { platform: { os: 'android' as const, apiLevel: 21 } };

  it('Android <28: base carries the mapper elevation (boxShadow undefined)', () => {
    const recipe = buildInputRecipe(resolved, android21);
    const flat = StyleSheet.flatten(recipe.fragments.base);
    expect(flat.boxShadow).toBeUndefined();
    expect(typeof flat.elevation).toBe('number');
    expect(flat.elevation).toBeGreaterThan(0);
  });

  it('Android <28: focused carries the focus-ring elevation', () => {
    const recipe = buildInputRecipe(resolved, android21);
    const flat = StyleSheet.flatten(recipe.fragments.focused);
    expect(typeof flat.elevation).toBe('number');
  });

  it('readOnly clears BOTH channels (boxShadow [] and elevation 0) so no tier leaks a shadow', () => {
    for (const ctx of [iosCtx, android21]) {
      const recipe = buildInputRecipe(resolved, ctx);
      const flat = StyleSheet.flatten([
        recipe.fragments.base,
        recipe.fragments.readOnly,
      ]);
      expect(flat.boxShadow).toEqual([]);
      expect(flat.elevation).toBe(0);
    }
  });

  it('preview clears BOTH channels', () => {
    for (const ctx of [iosCtx, android21]) {
      const recipe = buildInputRecipe(resolved, ctx);
      const flat = StyleSheet.flatten([
        recipe.fragments.base,
        recipe.fragments.preview,
      ]);
      expect(flat.boxShadow).toEqual([]);
      expect(flat.elevation).toBe(0);
    }
  });

  it('Android 28: inset inner shadow is dropped and the diagnostic reaches the BuildContext sink with the token variable', () => {
    const diagnostics: RecipeBuildDiagnostic[] = [];
    buildInputRecipe(resolved, {
      platform: { os: 'android', apiLevel: 28 },
      diagnostics,
    });
    const dropped = diagnostics.filter(
      (d) => d.code === 'theme-rn/android-shadow-inset-dropped'
    );
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped[0]?.variable).toBe('--sjs-shadow-inner');
  });

  it('Android <28: elevation-fallback diagnostics reach the sink', () => {
    const diagnostics: RecipeBuildDiagnostic[] = [];
    buildInputRecipe(resolved, {
      platform: { os: 'android', apiLevel: 21 },
      diagnostics,
    });
    expect(
      diagnostics.some(
        (d) => d.code === 'theme-rn/android-shadow-elevation-fallback'
      )
    ).toBe(true);
  });

  it('iOS: zero android shadow diagnostics', () => {
    const diagnostics: RecipeBuildDiagnostic[] = [];
    buildInputRecipe(resolved, { platform: { os: 'ios' }, diagnostics });
    expect(
      diagnostics.filter((d) => d.code.startsWith('theme-rn/android'))
    ).toEqual([]);
  });

  it('an invalid color-var override surfaces its diagnostic through the same sink (registry-aware lookup)', () => {
    const broken = resolveTheme({
      cssVariables: { '--sjs-editor-background': 'not-a-color' },
    });
    const diagnostics: RecipeBuildDiagnostic[] = [];
    buildInputRecipe(broken, { platform: { os: 'ios' }, diagnostics });
    expect(
      diagnostics.some((d) => d.variable === '--sjs-editor-background')
    ).toBe(true);
  });
});

describe('recipe build budget', () => {
  it('under 5ms', () => {
    const start = performance.now();
    buildInputRecipe(resolved, iosCtx);
    expect(performance.now() - start).toBeLessThan(5);
  });
});
