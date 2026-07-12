/**
 * Aggregate recipe tests (design test plan #1): "Recipe validity across
 * ALL 40 themes (build every exemplar recipe from every theme -- no
 * invalid styles, budget respected); curated golden snapshots for
 * DefaultLight/SharpDark/ContrastLight/LayeredDark/ThreeDimensionalLight."
 */
import { buildRecipes } from '../index';
import { resolveTheme } from '../../../theme-core/resolve';
import * as themesFacade from '../../../core/themes';
import { THEME_MANIFEST } from '../../../core/themes';
import type { ITheme } from '../../../core/facade';

function getManifestTheme(name: string): ITheme {
  const theme = (themesFacade as unknown as Record<string, ITheme | undefined>)[
    name
  ];
  if (!theme) throw new Error(`manifest name ${name} did not resolve`);
  return theme;
}

function assertNoInvalidNumbers(value: unknown, path: string): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoInvalidNumbers(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      assertNoInvalidNumbers(v, `${path}.${key}`);
    }
  }
}

describe('buildRecipes — validity across all 40 themes x both platforms, budget respected', () => {
  const platforms = [
    { os: 'ios' as const },
    { os: 'android' as const, apiLevel: 34 },
    { os: 'android' as const, apiLevel: 21 },
  ];

  // Coarse guard against a REAL per-recipe regression, not one-time
  // module-load/JIT warmup cost -- the very first `buildRecipes` call in
  // a cold process pays require()/JIT overhead unrelated to the recipe
  // logic itself (observed: ~87ms cold vs ~5-7ms warm). Warm up once so
  // every timed measurement below reflects steady-state cost.
  beforeAll(() => {
    buildRecipes(resolveTheme(undefined), { platform: { os: 'ios' } });
  });

  it.each(THEME_MANIFEST)(
    '%s: every exemplar recipe builds without throwing, no NaN/invalid numbers, under budget',
    (name) => {
      const resolved = resolveTheme(getManifestTheme(name));
      for (const platform of platforms) {
        const start = performance.now();
        const recipes = buildRecipes(resolved, { platform });
        const elapsed = performance.now() - start;
        assertNoInvalidNumbers(recipes, 'recipes');
        // Coarse guard (design: "< 5ms per recipe on CI hardware") --
        // budgeted per the WHOLE aggregate (5 recipes) to stay generous
        // on shared CI hardware while still catching a real regression.
        expect(elapsed).toBeLessThan(25);
      }
    }
  );
});

describe('curated recipe golden snapshots', () => {
  it.each([
    'DefaultLight',
    'SharpDark',
    'ContrastLight',
    'LayeredDark',
    'ThreeDimensionalLight',
  ])('%s: recipes build to a stable snapshot (iOS)', (name) => {
    const resolved = resolveTheme(getManifestTheme(name));
    const recipes = buildRecipes(resolved, { platform: { os: 'ios' } });
    expect(recipes).toMatchSnapshot();
  });
});
