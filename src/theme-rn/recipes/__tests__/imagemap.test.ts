/**
 * Image-map recipe (task 5.4). Fixtures: `default-theme/blocks/
 * sd-imagemap.scss` — idle shapes are transparent/0-stroke; the SELECTED
 * highlight uses `--sjs-primary-backcolor-light` (fill) +
 * `--sjs-primary-backcolor` (stroke) + 1px, resolved through the metrics
 * fixture (never a hardcoded literal). The recipe owns ONLY the token
 * DEFAULTS the model's per-area/per-question color props fall back to.
 */
import { buildImageMapRecipe } from '../imagemap';
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

const CTX = { platform: { os: 'ios' as const } };

describe('buildImageMapRecipe', () => {
  it('idle shapes default to transparent fill/stroke with zero stroke width', () => {
    const resolved = resolveTheme(getManifestTheme('DefaultLight'));
    const recipe = buildImageMapRecipe(resolved, CTX);
    expect(recipe.idleFill).toBe('transparent');
    expect(recipe.idleStroke).toBe('transparent');
    expect(recipe.idleStrokeWidth).toBe(0);
  });

  it('the selected highlight resolves to concrete non-transparent colors + a positive stroke width', () => {
    const resolved = resolveTheme(getManifestTheme('DefaultLight'));
    const recipe = buildImageMapRecipe(resolved, CTX);
    expect(typeof recipe.selectedFill).toBe('string');
    expect(recipe.selectedFill).not.toBe('transparent');
    expect(recipe.selectedFill.length).toBeGreaterThan(0);
    expect(recipe.selectedStroke).not.toBe('transparent');
    expect(recipe.selectedStrokeWidth).toBeGreaterThan(0);
  });

  it('builds valid string colors across ALL 40 themes (no undefined/empty)', () => {
    for (const name of THEME_MANIFEST) {
      const resolved = resolveTheme(getManifestTheme(name));
      const recipe = buildImageMapRecipe(resolved, CTX);
      for (const key of ['selectedFill', 'selectedStroke'] as const) {
        expect(typeof recipe[key]).toBe('string');
        expect(recipe[key].length).toBeGreaterThan(0);
      }
    }
  });
});
