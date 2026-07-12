/**
 * Default-manifest tests (design: docs/design/0.6-theme-core.md, test
 * plan #2; codex review major 5). Presets can't cover these — the 40 real
 * presets shadow all 82 `preset-base` keys, but the registry has ~244
 * entries total; this exercises EVERY registry default directly,
 * standalone from any theme: dereference it against the no-theme cascade
 * environment and parse it under its own grammar, requiring zero
 * diagnostics (or membership in the pinned expected-unresolvable set).
 */
import { REGISTRY, type RegistryEntry } from '../registry';
import { DEFAULTS } from '../defaults';
import { resolveTheme } from '../resolve';
import { evaluateVarExpression } from '../helpers';
import {
  parseColor,
  parseLength,
  parseFontWeight,
  parseKeyword,
  parseNumber,
  parseShadow,
  parseCalc,
  parseString,
  tryParseLength,
  type ThemeDiagnostic,
} from '../parse';

/**
 * Names whose default chain genuinely terminates on the fallbackless
 * --sjs-default-font-family runtime hook — unresolvable in the pure
 * no-theme cascade BY DESIGN (web falls to font-family: inherit). Pinned
 * explicitly so any OTHER entry becoming unresolvable fails the test.
 */
const EXPECTED_UNRESOLVABLE = new Set([
  '--font-family',
  '--sjs-font-family',
  '--sjs-font-editorfont-family',
  '--sjs-font-headerdescription-family',
  '--sjs-font-headertitle-family',
  '--sjs-font-pagedescription-family',
  '--sjs-font-pagetitle-family',
  '--sjs-font-questiondescription-family',
  '--sjs-font-questiontitle-family',
  '--sjs-font-surveydescription-family',
  '--sjs-font-surveytitle-family',
]);

function parseUnderGrammar(
  entry: RegistryEntry,
  value: string
): ThemeDiagnostic[] {
  const g = entry.grammar;
  switch (g.kind) {
    case 'color':
      return parseColor(value, 'transparent', entry.name).diagnostics;
    case 'length':
      return parseLength(value, '0px', entry.name).diagnostics;
    case 'fontWeight':
      return parseFontWeight(value, '400', entry.name).diagnostics;
    case 'keyword':
      return parseKeyword(value, g.allowed, String(g.allowed[0]), entry.name)
        .diagnostics;
    case 'number':
      return parseNumber(value, { min: g.min, max: g.max }, '0', entry.name)
        .diagnostics;
    case 'shadow':
      return parseShadow(value, '0px 0px 0px 0px rgba(0,0,0,0)', entry.name)
        .diagnostics;
    case 'calc': {
      const calc = parseCalc(value);
      if (calc && tryParseLength(calc.operand) !== undefined) return [];
      if (tryParseLength(value) !== undefined) return [];
      return [
        {
          code: 'theme-core/invalid-calc',
          variable: entry.name,
          message: 'calc-grammar default did not resolve to a number',
          value,
        },
      ];
    }
    case 'string':
      return parseString(value, 'fallback', entry.name).diagnostics;
  }
}

describe('every registry default dereferences + parses under its own grammar with zero diagnostics (codex review major 5)', () => {
  const entries = Object.values(REGISTRY).filter((e) => e.class !== 'web-only');

  it.each(entries.map((e) => [e.name, e] as const))('%s', (_name, entry) => {
    if (entry.default === null) {
      // Fallbackless runtime hooks — only --sjs-default-font-family is
      // expected outside web-only; anything else appearing here is a
      // regression.
      expect(entry.name).toBe('--sjs-default-font-family');
      return;
    }
    const { value } = evaluateVarExpression(DEFAULTS, entry.default);
    if (value === undefined) {
      expect(EXPECTED_UNRESOLVABLE.has(entry.name)).toBe(true);
      return;
    }
    expect(EXPECTED_UNRESOLVABLE.has(entry.name)).toBe(false);
    expect(parseUnderGrammar(entry, value)).toEqual([]);
  });

  it('context-dependent ACCENT defaults also dereference + parse cleanly', () => {
    for (const entry of Object.values(REGISTRY)) {
      if (entry.accentDefault === undefined) continue;
      const { value } = evaluateVarExpression(DEFAULTS, entry.accentDefault);
      expect(value).toBeDefined();
      expect(parseUnderGrammar(entry, value as string)).toEqual([]);
    }
  });

  it('DEFAULTS omits exactly the null-default entries', () => {
    for (const entry of Object.values(REGISTRY)) {
      if (entry.default === null) {
        expect(DEFAULTS[entry.name]).toBeUndefined();
      } else {
        expect(DEFAULTS[entry.name]).toBe(entry.default);
      }
    }
  });
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
