/**
 * Grammar-level tests (design: docs/design/0.6-theme-core.md, test plan
 * #4). Every grammar is a bounded, full-match parser: valid input parses
 * to a typed value with zero diagnostics; anything that doesn't
 * full-match falls back to a caller-supplied fallback value plus exactly
 * one diagnostic. Nothing here ever throws.
 */
import {
  parseColor,
  parseLength,
  parseFontWeight,
  parseKeyword,
  parseNumber,
  parseShadow,
  parseCalc,
  parseString,
} from '../parse';

describe('parseColor', () => {
  it('parses rgba() with integer channels and float alpha', () => {
    const { value, diagnostics } = parseColor(
      'rgba(25, 179, 148, 0.1)',
      '#000',
      'x'
    );
    expect(value).toEqual({ r: 25, g: 179, b: 148, a: 0.1 });
    expect(diagnostics).toHaveLength(0);
  });

  it('accepts a bare-int alpha (real preset shape: rgba(20, 164, 139, 1))', () => {
    const { value, diagnostics } = parseColor(
      'rgba(20, 164, 139, 1)',
      '#000',
      'x'
    );
    expect(value).toEqual({ r: 20, g: 164, b: 139, a: 1 });
    expect(diagnostics).toHaveLength(0);
  });

  it('parses rgb() defaulting alpha to 1', () => {
    const { value, diagnostics } = parseColor('rgb(1, 2, 3)', '#000', 'x');
    expect(value).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(diagnostics).toHaveLength(0);
  });

  it('parses 6-digit hex', () => {
    const { value } = parseColor('#19b394', '#000', 'x');
    expect(value).toEqual({ r: 0x19, g: 0xb3, b: 0x94, a: 1 });
  });

  it('parses 3-digit hex (nibble-doubled)', () => {
    const { value } = parseColor('#0af', '#000', 'x');
    expect(value).toEqual({ r: 0x00, g: 0xaa, b: 0xff, a: 1 });
  });

  it('parses 8-digit hex (trailing alpha)', () => {
    const { value } = parseColor('#19b39480', '#000', 'x');
    expect(value.r).toBe(0x19);
    expect(value.g).toBe(0xb3);
    expect(value.b).toBe(0x94);
    expect(value.a).toBeCloseTo(0x80 / 255, 5);
  });

  it('parses 4-digit hex (nibble-doubled incl. alpha)', () => {
    const { value } = parseColor('#0af8', '#000', 'x');
    expect(value.a).toBeCloseTo(0x88 / 255, 5);
  });

  it('parses hsl()/hsla()', () => {
    const { value, diagnostics } = parseColor('hsl(0, 100%, 50%)', '#000', 'x');
    expect(value.r).toBe(255);
    expect(value.g).toBe(0);
    expect(value.b).toBe(0);
    expect(diagnostics).toHaveLength(0);
  });

  it('parses the transparent keyword', () => {
    const { value } = parseColor('transparent', '#000', 'x');
    expect(value).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('falls back + diagnoses on garbage, never throws', () => {
    const { value, diagnostics } = parseColor(
      'not-a-color',
      'rgba(1,2,3,1)',
      'x'
    );
    expect(value).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.variable).toBe('x');
  });

  it('rejects partial-match garbage (trailing junk)', () => {
    const { diagnostics } = parseColor(
      'rgba(1,2,3,1) extra',
      'rgba(1,2,3,1)',
      'x'
    );
    expect(diagnostics).toHaveLength(1);
  });

  it('clamps out-of-range alpha with a diagnostic', () => {
    const { value, diagnostics } = parseColor(
      'rgba(1,2,3,5)',
      'rgba(0,0,0,1)',
      'x'
    );
    expect(value.a).toBe(1);
    expect(diagnostics).toHaveLength(1);
  });
});

describe('parseLength', () => {
  it('parses a finite float px length', () => {
    expect(parseLength('1.5px', '0px', 'x').value).toBe(1.5);
  });

  it('parses 0px', () => {
    expect(parseLength('0px', '1px', 'x').value).toBe(0);
  });

  it('accepts bare 0 (no unit) as zero', () => {
    const { value, diagnostics } = parseLength('0', '1px', 'x');
    expect(value).toBe(0);
    expect(diagnostics).toHaveLength(0);
  });

  it('falls back on a non-px unit', () => {
    const { value, diagnostics } = parseLength('1em', '2px', 'x');
    expect(value).toBe(2);
    expect(diagnostics).toHaveLength(1);
  });

  it('falls back on a non-zero bare number', () => {
    const { diagnostics } = parseLength('5', '2px', 'x');
    expect(diagnostics).toHaveLength(1);
  });
});

describe('parseFontWeight', () => {
  it('parses a numeric weight 1-1000', () => {
    expect(parseFontWeight('600', '400', 'x').value).toBe(600);
  });

  it('maps the normal keyword to 400 exactly', () => {
    expect(parseFontWeight('normal', '700', 'x').value).toBe(400);
  });

  it('maps the bold keyword to 700 exactly', () => {
    expect(parseFontWeight('bold', '400', 'x').value).toBe(700);
  });

  it('keeps lighter/bolder as relative keywords (not exact-mappable)', () => {
    expect(parseFontWeight('lighter', '400', 'x').value).toBe('lighter');
    expect(parseFontWeight('bolder', '400', 'x').value).toBe('bolder');
  });

  it('falls back outside the 1-1000 range', () => {
    const { value, diagnostics } = parseFontWeight('1200', '400', 'x');
    expect(value).toBe(400);
    expect(diagnostics).toHaveLength(1);
  });

  it('falls back on garbage', () => {
    const { value, diagnostics } = parseFontWeight('extra-bold', '400', 'x');
    expect(value).toBe(400);
    expect(diagnostics).toHaveLength(1);
  });
});

describe('parseKeyword', () => {
  const allowed = ['none', 'uppercase', 'lowercase', 'capitalize'] as const;

  it('parses a member of the closed union', () => {
    expect(parseKeyword('uppercase', allowed, 'none', 'x').value).toBe(
      'uppercase'
    );
  });

  it('falls back on any string outside the union — not "any trimmed string"', () => {
    const { value, diagnostics } = parseKeyword(
      'sideways',
      allowed,
      'none',
      'x'
    );
    expect(value).toBe('none');
    expect(diagnostics).toHaveLength(1);
  });
});

describe('parseNumber', () => {
  it('parses a finite float', () => {
    expect(parseNumber('0.5', {}, '1', 'x').value).toBe(0.5);
  });

  it('clamps to the per-key max with a diagnostic', () => {
    const { value, diagnostics } = parseNumber(
      '2',
      { min: 0, max: 1 },
      '1',
      'x'
    );
    expect(value).toBe(1);
    expect(diagnostics).toHaveLength(1);
  });

  it('clamps to the per-key min with a diagnostic', () => {
    const { value, diagnostics } = parseNumber(
      '-2',
      { min: 0, max: 1 },
      '1',
      'x'
    );
    expect(value).toBe(0);
    expect(diagnostics).toHaveLength(1);
  });

  it('falls back on non-numeric input', () => {
    const { value, diagnostics } = parseNumber('abc', {}, '1', 'x');
    expect(value).toBe(1);
    expect(diagnostics).toHaveLength(1);
  });
});

describe('parseShadow', () => {
  it('parses a single-layer shadow (2-value + color)', () => {
    const { value, diagnostics } = parseShadow(
      '0px 1px 2px 0px rgba(0, 0, 0, 0.15)',
      '',
      'x'
    );
    expect(diagnostics).toHaveLength(0);
    expect(value).toEqual([
      {
        inset: false,
        offsetX: 0,
        offsetY: 1,
        blurRadius: 2,
        spreadRadius: 0,
        color: { r: 0, g: 0, b: 0, a: 0.15 },
      },
    ]);
  });

  it('parses inset shadows (real preset case: shadow-inner)', () => {
    const { value } = parseShadow(
      'inset 0px 1px 2px 0px rgba(0, 0, 0, 0.15)',
      '',
      'x'
    );
    expect(value[0]!.inset).toBe(true);
  });

  it('parses real multi-layer LayeredDark shadow-small (3 layers, no inset)', () => {
    const raw =
      '0px 0px 0px 1px rgba(255, 255, 255, 0.1),0px 8px 16px 0px rgba(0, 0, 0, 0.15),0px 2px 4px 0px rgba(0, 0, 0, 0.2)';
    const { value, diagnostics } = parseShadow(raw, '', 'x');
    expect(diagnostics).toHaveLength(0);
    expect(value).toHaveLength(3);
    expect(value.every((l) => l.inset === false)).toBe(true);
    expect(value[1]!).toEqual({
      inset: false,
      offsetX: 0,
      offsetY: 8,
      blurRadius: 16,
      spreadRadius: 0,
      color: { r: 0, g: 0, b: 0, a: 0.15 },
    });
  });

  it('parses real LayeredDark shadow-medium: inset-in-medium + no-inset-inner mixed within meaning (both real cases exist across presets)', () => {
    const raw =
      'inset 0px 0px 0px 1px rgba(255, 255, 255, 0.05),0px 2px 6px 0px rgba(0, 0, 0, 0.2)';
    const { value, diagnostics } = parseShadow(raw, '', 'x');
    expect(diagnostics).toHaveLength(0);
    expect(value[0]!.inset).toBe(true);
    expect(value[1]!.inset).toBe(false);
  });

  it('rejects full-garbage with fallback + diagnostic (never partial-match)', () => {
    const { value, diagnostics } = parseShadow(
      'not a shadow at all',
      '0px 1px 2px 0px rgba(0,0,0,0.1)',
      'x'
    );
    expect(diagnostics).toHaveLength(1);
    expect(value).toHaveLength(1);
    expect(value[0]!.offsetY).toBe(1);
  });

  it('rejects a layer with a trailing garbage token (partial-match)', () => {
    const { diagnostics } = parseShadow(
      '0px 1px 2px 0px rgba(0,0,0,0.1) bogus',
      '0px 1px 2px 0px rgba(0,0,0,0.1)',
      'x'
    );
    expect(diagnostics).toHaveLength(1);
  });
});

describe('parseCalc', () => {
  it('parses the SCSS-emitted dialect with redundant inner parens', () => {
    expect(parseCalc('calc(1.5 * (8px))')).toEqual({
      multiplier: 1.5,
      operand: '8px',
    });
  });

  it('parses a var()-shaped operand verbatim (dereferenced by the caller)', () => {
    expect(parseCalc('calc(4 * (var(--sjs-font-size, 16px)))')).toEqual({
      multiplier: 4,
      operand: 'var(--sjs-font-size, 16px)',
    });
  });

  it('returns null for anything outside the dialect (e.g. addition, no parens)', () => {
    expect(parseCalc('calc(1px + 2px)')).toBeNull();
    expect(parseCalc('calc(2 * 8px)')).toBeNull();
    expect(parseCalc('8px')).toBeNull();
  });
});

describe('parseString', () => {
  it('passes through a non-empty value verbatim', () => {
    const { value, diagnostics } = parseString('Arial, sans-serif', 'x', 'v');
    expect(value).toBe('Arial, sans-serif');
    expect(diagnostics).toHaveLength(0);
  });

  it('falls back on an empty value', () => {
    const { value, diagnostics } = parseString('   ', 'fallback', 'v');
    expect(value).toBe('fallback');
    expect(diagnostics).toHaveLength(1);
  });
});
