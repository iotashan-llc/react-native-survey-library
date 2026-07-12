/**
 * Test plan #5 (var() graph) + spacing helper (design:
 * docs/design/0.6-theme-core.md, "Module layout" — helpers.ts).
 */
import { spacing, evaluateVarExpression } from '../helpers';

describe('spacing', () => {
  it('is a pure multiply, no memoization', () => {
    expect(spacing(8, 1)).toBe(8);
    expect(spacing(8, 1.5)).toBe(12);
    expect(spacing(8, 0)).toBe(0);
  });
});

describe('evaluateVarExpression', () => {
  it('returns a plain literal unchanged', () => {
    const { value, diagnostics } = evaluateVarExpression({}, 'rgba(1,2,3,1)');
    expect(value).toBe('rgba(1,2,3,1)');
    expect(diagnostics).toHaveLength(0);
  });

  it('dereferences a single var() against rawVariables', () => {
    const raw = { '--a': 'rgba(1,1,1,1)' };
    const { value, diagnostics } = evaluateVarExpression(raw, 'var(--a, #fff)');
    expect(value).toBe('rgba(1,1,1,1)');
    expect(diagnostics).toHaveLength(0);
  });

  it('uses the fallback when the referenced variable is entirely absent', () => {
    const { value, diagnostics } = evaluateVarExpression(
      {},
      'var(--missing, #fff)'
    );
    expect(value).toBe('#fff');
    expect(diagnostics).toHaveLength(0);
  });

  it('walks an alias chain deeper than 4 hops (no arbitrary hop cap)', () => {
    const raw = {
      '--a': 'var(--b)',
      '--b': 'var(--c)',
      '--c': 'var(--d)',
      '--d': 'var(--e)',
      '--e': 'var(--f, terminal)',
    };
    const { value, diagnostics } = evaluateVarExpression(raw, 'var(--a)');
    expect(value).toBe('terminal');
    expect(diagnostics).toHaveLength(0);
  });

  it('resolves the real --sjs-base-unit -> --base-unit legacy alias edge', () => {
    const raw = {
      '--sjs-base-unit': 'var(--base-unit, 8px)',
      '--base-unit': '8px',
    };
    const { value } = evaluateVarExpression(raw, 'var(--sjs-base-unit, 8px)');
    expect(value).toBe('8px');
  });

  it('resolves nested var() inside a fallback', () => {
    const raw = { '--b': 'nested-value' };
    const { value } = evaluateVarExpression(
      {},
      'var(--missing, var(--b, fallback-literal))'
    );
    expect(value).toBe('fallback-literal');
    const withB = evaluateVarExpression(raw, 'var(--missing, var(--b, x))');
    expect(withB.value).toBe('nested-value');
  });

  it('splits the fallback at the first TOP-LEVEL comma (paren-aware) — real rgba() fallback case', () => {
    const { value } = evaluateVarExpression(
      {},
      'var(--sjs-primary-backcolor-light, var(--primary-light, rgba(25, 179, 148, 0.1)))'
    );
    expect(value).toBe('rgba(25, 179, 148, 0.1)');
  });

  it('detects a cycle: cycle members become invalid, then the fallback applies', () => {
    const raw = {
      '--a': 'var(--b)',
      '--b': 'var(--a)',
    };
    const { value, diagnostics } = evaluateVarExpression(
      raw,
      'var(--a, safe-fallback)'
    );
    expect(value).toBe('safe-fallback');
    expect(diagnostics.some((d) => d.code === 'theme-core/var-cycle')).toBe(
      true
    );
  });

  it('a cyclic variable with no fallback anywhere is unresolved (undefined) + diagnosed', () => {
    const raw = {
      '--a': 'var(--b)',
      '--b': 'var(--a)',
    };
    const { value, diagnostics } = evaluateVarExpression(raw, 'var(--a)');
    expect(value).toBeUndefined();
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('resolves the real accent-header case (backgroundColor === var(--sjs-primary-backcolor) literal)', () => {
    const raw: Record<string, string> = {
      '--sjs-header-backcolor': 'var(--sjs-primary-backcolor)',
      '--sjs-primary-backcolor': 'rgba(25, 179, 148, 1)',
    };
    const { value } = evaluateVarExpression(
      raw,
      raw['--sjs-header-backcolor']!
    );
    expect(value).toBe('rgba(25, 179, 148, 1)');
  });

  it('substitutes multiple var() occurrences within one larger expression (e.g. a calc operand)', () => {
    const raw = { '--sjs-font-size': '16px' };
    const { value } = evaluateVarExpression(
      raw,
      'calc(4 * (var(--sjs-font-size, 16px)))'
    );
    expect(value).toBe('calc(4 * (16px))');
  });
});
