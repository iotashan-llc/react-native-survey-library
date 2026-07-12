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
