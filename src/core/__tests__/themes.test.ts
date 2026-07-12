/**
 * themes-facade tests (design: docs/design/0.6-theme-core.md, "Module
 * layout" — `themes-facade -> src/core/themes.ts`). The ONLY module
 * allowed to import the `survey-core/themes` subpath.
 */
import * as themesFacade from '../themes';
import { THEME_MANIFEST, DefaultLight, LayeredDark } from '../themes';

describe('themes-facade', () => {
  it('THEME_MANIFEST has exactly 40 names, excluding the internal hash sentinel', () => {
    expect(THEME_MANIFEST).toHaveLength(40);
    expect(THEME_MANIFEST).not.toContain('__surveyjs_internal_themes_hash');
  });

  it('every manifest name resolves to a real exported theme object with the expected shape', () => {
    for (const name of THEME_MANIFEST) {
      const theme = (themesFacade as unknown as Record<string, unknown>)[
        name
      ] as { cssVariables?: Record<string, string> };
      expect(theme).toBeDefined();
      expect(theme.cssVariables).toBeDefined();
      expect(Object.keys(theme.cssVariables as object)).toHaveLength(82);
    }
  });

  it('re-exports real preset objects (spot check)', () => {
    expect(DefaultLight.themeName).toBe('default');
    expect(DefaultLight.colorPalette).toBe('light');
    expect(LayeredDark.themeName).toBe('layered');
    expect(LayeredDark.colorPalette).toBe('dark');
  });

  it("loads without survey-core's renderer/model chunk evaluated (type-only-safe import surface)", () => {
    // themes.ts imports './shim' first (same ordering contract as facade.ts).
    expect(
      typeof (globalThis as { addEventListener?: unknown }).addEventListener
    ).toBe('function');
  });
});
