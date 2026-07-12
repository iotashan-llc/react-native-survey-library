/**
 * Golden + invariance-canary tests across all 40 real presets (design:
 * docs/design/0.6-theme-core.md, test plan #1, #3; codex review minor
 * 11). A legitimate upstream SCSS/preset value change SHOULD fail its
 * named golden — that's the intended workflow (review, re-bless via
 * `jest -u`, changelog note), not brittleness.
 *
 * Snapshot layout (kept compact deliberately): the common no-theme
 * environment — `resolveTheme(undefined)` INCLUDING its full
 * rawVariables cascade table — is snapshotted exactly ONCE; each of the
 * 40 preset goldens is a projection that OMITS rawVariables, because a
 * preset's rawVariables is by construction `DEFAULTS ⊕ preset
 * cssVariables` — the first operand is pinned by the undefined-golden and
 * the second is upstream-versioned input, so repeating the merged table
 * 40 times adds ~1MB of snapshot without adding coverage.
 */
import { resolveTheme, type ResolvedTheme } from '../resolve';
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

/** Per-preset golden projection: everything except the merged rawVariables table. */
function projectForGolden(
  resolved: ResolvedTheme
): Omit<ResolvedTheme, 'rawVariables'> {
  const projected: Partial<ResolvedTheme> = { ...resolved };
  delete projected.rawVariables;
  return projected as Omit<ResolvedTheme, 'rawVariables'>;
}

describe('golden: resolveTheme(undefined)', () => {
  it('matches the committed snapshot (full, including the rawVariables cascade table)', () => {
    expect(resolveTheme(undefined)).toMatchSnapshot();
  });
});

describe('golden: all 40 survey-core theme presets (compact projection)', () => {
  it.each(THEME_MANIFEST)('%s resolves to a stable snapshot', (name) => {
    const theme = getManifestTheme(name);
    expect(projectForGolden(resolveTheme(theme))).toMatchSnapshot();
  });
});

describe('invariance canaries across all 40 presets', () => {
  const defaultLightResolved = resolveTheme(getManifestTheme('DefaultLight'));
  const referenceKeySet = Object.keys(
    getManifestTheme('DefaultLight').cssVariables ?? {}
  ).sort();

  it.each(THEME_MANIFEST)(
    '%s: cssVariables key SET identical to DefaultLight (not just the count)',
    (name) => {
      const theme = getManifestTheme(name);
      expect(Object.keys(theme.cssVariables ?? {}).sort()).toEqual(
        referenceKeySet
      );
    }
  );

  it.each(THEME_MANIFEST)(
    '%s: baseUnit 8, cornerRadius 4, 34 color tokens, articleFont VALUES identical across themes',
    (name) => {
      const resolved = resolveTheme(getManifestTheme(name));
      expect(resolved.tokens.baseUnit).toBe(8);
      expect(resolved.tokens.cornerRadius).toBe(4);
      expect(Object.keys(resolved.tokens.colors)).toHaveLength(34);
      // Cross-theme article-font VALUE equality (design: "articleFont
      // preset-props identical" — every preset ships the same
      // article-font block, so the resolved tokens must deep-equal
      // DefaultLight's, fontSize included).
      expect(resolved.tokens.articleFont).toEqual(
        defaultLightResolved.tokens.articleFont
      );
    }
  );

  it.each(THEME_MANIFEST)(
    '%s: zero diagnostics (every real preset value is well-formed)',
    (name) => {
      const resolved = resolveTheme(getManifestTheme(name));
      expect(resolved.diagnostics).toEqual([]);
    }
  );
});
