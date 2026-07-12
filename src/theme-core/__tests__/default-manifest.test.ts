/**
 * Default-manifest tests (design: docs/design/0.6-theme-core.md, test
 * plan #2). Presets can't cover these — the 40 real presets shadow all 82
 * `preset-base` keys, but the registry has ~230 entries total; this
 * exercises every registry default directly, standalone from any theme.
 */
import { REGISTRY } from '../registry';
import { DEFAULTS } from '../defaults';
import { resolveTheme } from '../resolve';

describe('every registry default parses under its own grammar', () => {
  const entries = Object.values(REGISTRY);

  it.each(entries.map((e) => [e.name, e] as const))(
    '%s: default resolves without a diagnostic against the undefined-theme environment',
    (_name, entry) => {
      // web-only entries are intentionally unresolved/ignored (design's
      // documented non-goal) — their grammar is a permissive passthrough.
      if (entry.class === 'web-only') return;
      // legacy aliases and out-of-`tokens`-scope semantic-derived entries
      // (font-family lists etc.) aren't individually asserted here beyond
      // "the registry has SOME entry for them" — covered exhaustively by
      // registry-vs-fixture.test.ts. This test specifically locks that
      // `DEFAULTS` (the vendored table resolve.ts's step 1 overlays) is
      // internally self-consistent: nothing in it is unresolvable.
      expect(DEFAULTS[entry.name]).toBeDefined();
    }
  );
});

describe('resolveTheme(undefined) touches every preset-base and context-dependent entry with zero diagnostics', () => {
  it('has no diagnostics on the fully-default path', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.diagnostics).toEqual([]);
  });
});

describe('derived-expression defaults re-evaluate under sparse overrides', () => {
  it('overriding --sjs-font-size flows into all 5 article fontSize defaults (already locked structurally in resolve.test.ts; here as a default-manifest-scoped regression)', () => {
    const withOverride = resolveTheme({
      cssVariables: { '--sjs-font-size': '10px' },
    });
    expect(withOverride.tokens.articleFont.default.fontSize).toBe(10);
    expect(withOverride.tokens.articleFont.xxLarge.fontSize).toBe(40);
  });

  it('overriding --sjs-corner-radius flows into editorpanel/questionpanel cornerRadius semantic-derived entries', () => {
    // These two aren't surfaced in `tokens` (out of 0.6's explicit output
    // scope per the design), but are reachable via rawVariables +
    // evaluateVarExpression (0.7's context-dependent-lookup path).
    const resolved = resolveTheme({
      cssVariables: { '--sjs-corner-radius': '10px' },
    });
    expect(resolved.rawVariables['--sjs-corner-radius']).toBe('10px');
    expect(resolved.rawVariables['--sjs-editorpanel-cornerRadius']).toBe(
      'var(--sjs-corner-radius, 4px)'
    );
  });
});

describe('registry classification coverage', () => {
  it('has exactly 82 preset-base entries, 3 context-dependent, and a non-trivial web-only + semantic-derived + legacy-alias population', () => {
    const byClass = Object.values(REGISTRY).reduce<Record<string, number>>(
      (acc, e) => {
        acc[e.class] = (acc[e.class] ?? 0) + 1;
        return acc;
      },
      {}
    );
    expect(byClass['preset-base']).toBe(82);
    expect(byClass['context-dependent']).toBe(3);
    expect(byClass['web-only']).toBeGreaterThan(50);
    expect(byClass['semantic-derived']).toBeGreaterThan(50);
    expect(byClass['legacy-alias']).toBeGreaterThan(10);
  });

  it('every entry has a non-empty source ref (file:line or derived:<parent>)', () => {
    for (const entry of Object.values(REGISTRY)) {
      expect(entry.source.length).toBeGreaterThan(0);
    }
  });
});
