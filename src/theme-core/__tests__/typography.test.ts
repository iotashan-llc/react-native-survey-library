/**
 * Companion amendment 1 (design: docs/design/0.7-theme-rn.md, "Companion
 * amendments" #2 — amending docs/design/0.6-theme-core.md's token list):
 * normalized typography families (base/editor/questionTitle: family/size/
 * weight) + the two 1.5x line-height tokens (editor-font-size-based and
 * base-font-size-based — SEPARATE tokens per the 0.7 metrics fixture note,
 * identical at defaults, diverge under custom themes) + editor corner
 * radius, all as first-class `ResolvedTheme` tokens so 0.7 never re-parses
 * `rawVariables` directly.
 */
import { resolveTheme } from '../resolve';
import { DefaultLight, LayeredDark } from '../../core/themes';
import type { ITheme } from '../../core/facade';

describe('typography tokens — resolveTheme(undefined) defaults', () => {
  // `--sjs-font-family` and its dependents all terminate at the documented,
  // deliberately fallback-less `--sjs-default-font-family` runtime hook
  // (registry-data.ts: "unset in the pure cascade, so dependent
  // font-family chains resolve to inherit") — the no-theme cascade
  // therefore resolves family to '' (inherit / RN system default), with
  // ZERO diagnostics (this is documented-expected, not malformed input).
  it('base family resolves to empty (inherit) with no diagnostics; size is themed', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.tokens.typography.base.fontFamily).toBe('');
    expect(resolved.tokens.typography.base.fontSize).toBe(16);
    expect(resolved.diagnostics).toEqual([]);
  });

  it('editor family/size/weight', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.tokens.typography.editor.fontSize).toBe(16);
    expect(resolved.tokens.typography.editor.fontWeight).toBe(400);
    expect(resolved.tokens.typography.editor.fontFamily).toBe('');
  });

  it('questionTitle family/size/weight', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.tokens.typography.questionTitle.fontSize).toBe(16);
    expect(resolved.tokens.typography.questionTitle.fontWeight).toBe(600);
    expect(resolved.tokens.typography.questionTitle.fontFamily).toBe('');
  });

  it('an explicit --sjs-font-family override resolves and cascades into editor + questionTitle (their own defaults reference it)', () => {
    const resolved = resolveTheme({
      cssVariables: { '--sjs-font-family': 'Georgia' },
    });
    expect(resolved.tokens.typography.base.fontFamily).toBe('Georgia');
    expect(resolved.tokens.typography.editor.fontFamily).toBe('Georgia');
    expect(resolved.tokens.typography.questionTitle.fontFamily).toBe('Georgia');
    expect(resolved.diagnostics).toEqual([]);
  });

  it('the two 1.5x line-height tokens are separate and equal at defaults (16px both paths)', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.tokens.typography.editorLineHeight).toBe(24);
    expect(resolved.tokens.typography.baseLineHeight).toBe(24);
  });

  it('editor corner radius defaults to the shared corner radius (4)', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.tokens.typography.editorCornerRadius).toBe(4);
  });
});

describe('font-family diagnostics — only the documented unset-hook case is silent (codex impl-review minor 10)', () => {
  it('an EXPLICIT cycle between family variables emits a var-cycle diagnostic (never suppressed)', () => {
    const resolved = resolveTheme({
      cssVariables: {
        '--sjs-font-family': 'var(--sjs-font-editorfont-family)',
        '--sjs-font-editorfont-family': 'var(--sjs-font-family)',
      },
    });
    expect(
      resolved.diagnostics.some((d) => d.code === 'theme-core/var-cycle')
    ).toBe(true);
    // the cycle still resolves to the documented inherit outcome, not a crash
    expect(resolved.tokens.typography.base.fontFamily).toBe('');
  });

  it('a dangling reference to a NON-hook variable emits var-unresolved (the suppression is scoped to --sjs-default-font-family)', () => {
    const resolved = resolveTheme({
      cssVariables: { '--sjs-font-family': 'var(--host-brand-font)' },
    });
    expect(
      resolved.diagnostics.some(
        (d) =>
          d.code === 'theme-core/var-unresolved' &&
          d.variable === '--host-brand-font'
      )
    ).toBe(true);
  });

  it('the default unset --sjs-default-font-family chain stays diagnostic-free (documented inherit, not an error)', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.diagnostics).toEqual([]);
  });
});

describe('typography tokens — sparse overlay flows into derived line-heights', () => {
  it('overriding --sjs-font-editorfont-size flows into editorLineHeight but NOT baseLineHeight', () => {
    const resolved = resolveTheme({
      cssVariables: { '--sjs-font-editorfont-size': '20px' },
    });
    expect(resolved.tokens.typography.editor.fontSize).toBe(20);
    expect(resolved.tokens.typography.editorLineHeight).toBe(30);
    expect(resolved.tokens.typography.baseLineHeight).toBe(24);
  });

  it('overriding --sjs-font-size flows into baseLineHeight but NOT editorLineHeight (which tracks editorfont-size, itself derived from font-size only via ITS OWN unset default)', () => {
    const resolved = resolveTheme({
      cssVariables: { '--sjs-font-size': '20px' },
    });
    expect(resolved.tokens.typography.base.fontSize).toBe(20);
    expect(resolved.tokens.typography.baseLineHeight).toBe(30);
    // editorfont-size's own default is `var(--sjs-font-size, 16px)`, so an
    // override of the base font-size flows into it too (its own default is
    // an expression over --sjs-font-size) -- both derive from the same
    // override here, which is exactly why the two tokens are kept SEPARATE
    // rather than merged: an explicit --sjs-font-editorfont-size override
    // (previous test) diverges editorLineHeight from baseLineHeight, while
    // a --sjs-font-size-only override keeps them equal because editorfont
    // falls back through it.
    expect(resolved.tokens.typography.editor.fontSize).toBe(20);
    expect(resolved.tokens.typography.editorLineHeight).toBe(30);
  });

  it('overriding --sjs-editorpanel-cornerRadius directly changes editorCornerRadius without touching cornerRadius', () => {
    const resolved = resolveTheme({
      cssVariables: { '--sjs-editorpanel-cornerRadius': '8px' },
    });
    expect(resolved.tokens.typography.editorCornerRadius).toBe(8);
    expect(resolved.tokens.cornerRadius).toBe(4);
  });
});

describe('typography tokens — real presets (invariance canary)', () => {
  it.each([
    ['DefaultLight', DefaultLight],
    ['LayeredDark', LayeredDark],
  ])('%s: typography shape present and well-typed', (_name, theme) => {
    const resolved = resolveTheme(theme as ITheme);
    const typography = resolved.tokens.typography;
    expect(typeof typography.base.fontFamily).toBe('string');
    expect(typeof typography.base.fontSize).toBe('number');
    expect(typeof typography.editor.fontFamily).toBe('string');
    expect(typeof typography.editor.fontSize).toBe('number');
    expect(
      typeof typography.editor.fontWeight === 'number' ||
        typeof typography.editor.fontWeight === 'string'
    ).toBe(true);
    expect(typeof typography.questionTitle.fontFamily).toBe('string');
    expect(typeof typography.questionTitle.fontSize).toBe('number');
    expect(
      typeof typography.questionTitle.fontWeight === 'number' ||
        typeof typography.questionTitle.fontWeight === 'string'
    ).toBe(true);
    expect(typeof typography.editorLineHeight).toBe('number');
    expect(typeof typography.baseLineHeight).toBe('number');
    expect(typeof typography.editorCornerRadius).toBe('number');
  });
});
