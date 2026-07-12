/**
 * Golden + invariance-canary tests across all 40 real presets (design:
 * docs/design/0.6-theme-core.md, test plan #1, #3). A stable serialized
 * snapshot per named preset (via the themes-facade manifest) plus a
 * `resolveTheme(undefined)` golden. A legitimate upstream SCSS/preset
 * value change SHOULD fail its named golden — that's the intended
 * workflow (review, re-bless via `jest -u`, changelog note), not
 * brittleness.
 */
import { resolveTheme } from '../resolve';
import * as themesFacade from '../../core/themes';
import { THEME_MANIFEST } from '../../core/themes';
import type { ITheme } from '../../core/facade';

function getManifestTheme(name: string): ITheme {
  const theme = (themesFacade as unknown as Record<string, ITheme | undefined>)[
    name
  ];
  if (!theme)
    throw new Error(`manifest name ${name} did not resolve to a theme export`);
  return theme;
}

describe('golden: resolveTheme(undefined)', () => {
  it('matches the committed snapshot', () => {
    expect(resolveTheme(undefined)).toMatchSnapshot();
  });
});

describe('golden: all 40 survey-core theme presets', () => {
  it.each(THEME_MANIFEST)('%s resolves to a stable snapshot', (name) => {
    const theme = getManifestTheme(name);
    expect(resolveTheme(theme)).toMatchSnapshot();
  });
});

describe('invariance canaries across all 40 presets', () => {
  it.each(THEME_MANIFEST)(
    '%s: 82-key preset set, baseUnit 8, cornerRadius 4, articleFont preset-props well-typed',
    (name) => {
      const theme = getManifestTheme(name);
      expect(Object.keys(theme.cssVariables ?? {})).toHaveLength(82);

      const resolved = resolveTheme(theme);
      expect(resolved.tokens.baseUnit).toBe(8);
      expect(resolved.tokens.cornerRadius).toBe(4);
      expect(Object.keys(resolved.tokens.colors)).toHaveLength(34);

      for (const size of [
        'xxLarge',
        'xLarge',
        'large',
        'medium',
        'default',
      ] as const) {
        const token = resolved.tokens.articleFont[size];
        expect(Number.isFinite(token.fontSize)).toBe(true);
        expect(Number.isFinite(token.letterSpacing)).toBe(true);
        expect(Number.isFinite(token.lineHeight)).toBe(true);
        expect(Number.isFinite(token.paragraphIndent)).toBe(true);
        expect(['none', 'uppercase', 'lowercase', 'capitalize']).toContain(
          token.textCase
        );
        expect(['none', 'underline', 'overline', 'line-through']).toContain(
          token.textDecoration
        );
      }
    }
  );

  it.each(THEME_MANIFEST)(
    '%s: zero diagnostics (every real preset value is well-formed)',
    (name) => {
      const theme = getManifestTheme(name);
      const resolved = resolveTheme(theme);
      expect(resolved.diagnostics).toEqual([]);
    }
  );
});
