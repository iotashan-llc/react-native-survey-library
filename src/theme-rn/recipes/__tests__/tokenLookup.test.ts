import { resolveTheme } from '../../../theme-core/resolve';
import {
  calcSize,
  calcFontSize,
  calcCornerRadius,
  resolveColorVar,
} from '../tokenLookup';

describe('tokenLookup — formula helpers (design: 0.7-metrics-fixture.md header formulas)', () => {
  const resolved = resolveTheme(undefined);

  it('calcSize(n) = n x baseUnit (8 default)', () => {
    expect(calcSize(resolved, 1.5)).toBe(12);
    expect(calcSize(resolved, 3)).toBe(24);
  });

  it('calcFontSize(n) = n x base font-size (16 default)', () => {
    expect(calcFontSize(resolved, 0.75)).toBe(12);
    expect(calcFontSize(resolved, 1.5)).toBe(24);
  });

  it('calcCornerRadius(n) = n x cornerRadius (4 default)', () => {
    expect(calcCornerRadius(resolved, 0.5)).toBe(2);
  });

  it('resolveColorVar fast-paths an existing first-class preset-base color token', () => {
    const token = resolveColorVar(resolved, '--sjs-primary-backcolor');
    expect(token).toEqual(resolved.tokens.colors.primaryBackcolor);
  });

  it('resolveColorVar dereferences a semantic-derived variable not promoted to a first-class field', () => {
    const token = resolveColorVar(resolved, '--sjs-editor-background');
    expect(typeof token.css).toBe('string');
    expect(token.css).toMatch(/^rgba\(/);
    expect(Number.isFinite(token.r)).toBe(true);
  });

  it('resolveColorVar reflects a theme override of the underlying variable', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-general-backcolor-dim-light': 'rgba(9, 9, 9, 1)' },
    });
    const token = resolveColorVar(custom, '--sjs-editor-background');
    expect(token.css).toBe('rgba(9, 9, 9, 1)');
  });
});

describe('resolveColorVar — registry-aware fallback + diagnostics (codex impl-review major 6)', () => {
  it('an INVALID override falls back to the post-overlay registry default, NOT transparent, and emits a diagnostic', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-editor-background': 'not-a-color' },
    });
    const sink: import('../../../theme-core/parse').ThemeDiagnostic[] = [];
    const token = resolveColorVar(custom, '--sjs-editor-background', sink);
    // Registry default chain: var(--sjs-general-backcolor-dim-light,
    // var(--background-dim-light, #f9f9f9)) -> #f9f9f9 at defaults.
    expect(token.css).toBe('rgba(249, 249, 249, 1)');
    expect(sink.length).toBeGreaterThan(0);
    expect(sink.some((d) => d.variable === '--sjs-editor-background')).toBe(
      true
    );
  });

  it('an invalid override whose registry default is itself overridden falls back to the POST-OVERLAY default', () => {
    const custom = resolveTheme({
      cssVariables: {
        '--sjs-editor-background': 'garbage',
        '--sjs-general-backcolor-dim-light': 'rgba(7, 7, 7, 1)',
      },
    });
    const sink: import('../../../theme-core/parse').ThemeDiagnostic[] = [];
    const token = resolveColorVar(custom, '--sjs-editor-background', sink);
    expect(token.css).toBe('rgba(7, 7, 7, 1)');
    expect(sink.length).toBeGreaterThan(0);
  });

  it('the memoized second lookup REPLAYS its diagnostics into a fresh sink (cache does not swallow)', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-editor-background': 'not-a-color' },
    });
    const first: import('../../../theme-core/parse').ThemeDiagnostic[] = [];
    resolveColorVar(custom, '--sjs-editor-background', first);
    const second: import('../../../theme-core/parse').ThemeDiagnostic[] = [];
    resolveColorVar(custom, '--sjs-editor-background', second);
    expect(second).toEqual(first);
    expect(second.length).toBeGreaterThan(0);
  });

  it('a clean resolution emits NO diagnostics', () => {
    const clean = resolveTheme(undefined);
    const sink: import('../../../theme-core/parse').ThemeDiagnostic[] = [];
    resolveColorVar(clean, '--sjs-editor-background', sink);
    resolveColorVar(clean, '--sjs-primary-backcolor', sink);
    expect(sink).toEqual([]);
  });
});
