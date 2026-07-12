#!/usr/bin/env node
/**
 * One-time generator for `src/theme-core/registry-data.ts` (design:
 * docs/design/0.6-theme-core.md, "Variable registry"; codex review
 * critical 1). Reads the TEST-ONLY extraction fixture
 * (`src/theme-core/__fixtures__/scss-defaults.json`) plus the explicit,
 * reviewed classification/grammar rules below and emits the SHIPPED
 * registry data as a maintained TypeScript file.
 *
 * The point of this indirection: the production registry must be an
 * INDEPENDENT artifact from the extraction fixture, so
 * `registry-vs-fixture.test.ts` compares two independent derivations
 * rather than the same JSON to itself. This script is run manually, its
 * output REVIEWED, then committed; on a survey-core band bump both the
 * fixture (extract-scss-defaults.mjs) and this file are regenerated and
 * the diff re-reviewed. The emitted file is the source of truth at
 * runtime — it never imports the JSON.
 *
 * Grammar assignment is explicit + shape-driven (codex review major 5 —
 * no name-suffix-only heuristic):
 *  - the 82 preset-base names carry a hand-enumerated grammar table;
 *  - web-only names are permissive strings (ignored by design);
 *  - everything else takes its grammar from the SHAPE of its default:
 *    calc-dialect raw default -> calc; otherwise the default is
 *    TERMINALIZED through the fixture graph and the terminal literal
 *    classified (color / px-length / calc). Name-based rules are used
 *    only where shape is genuinely ambiguous (bare-number font weights,
 *    font-family lists).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const FIXTURE_PATH = join(
  REPO_ROOT,
  'src',
  'theme-core',
  '__fixtures__',
  'scss-defaults.json'
);
const OUTPUT_PATH = join(REPO_ROOT, 'src', 'theme-core', 'registry-data.ts');

// ---------------------------------------------------------------------------
// Classification rules (reviewed)
// ---------------------------------------------------------------------------

const WEB_ONLY_PREFIXES = [
  '--sjs-transition-duration',
  '--sjs-row-',
  '--sjs-expand-',
  '--sjs-collapse-',
  '--sjs-ranking-',
  '--sjs-element-',
  '--sjs-matrix-row-',
  '--sjs-matrix-detail-row-',
  '--sjs-pd-tab-',
  '--sjs-pd-list-',
  // Slider/list runtime machinery (postcss workaround hooks, per-item
  // inline-style state) — component-internal, not theme tokens.
  '--sjs-postcss-fix-',
  '--sjs-range-slider-',
  '--sjs-list-item-',
];

const isWebOnly = (name) =>
  WEB_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix));

/** header.scss:6,10,164-199 — declared with DIFFERENT fallbacks under the accent-background header context. */
const CONTEXT_DEPENDENT = {
  '--sjs-header-backcolor': {
    normal: 'transparent',
    accent: 'var(--sjs-primary-backcolor, var(--primary, #19b394))',
  },
  '--sjs-font-headertitle-color': {
    normal:
      'var(--sjs-font-pagetitle-color, var(--sjs-general-dim-forecolor, rgba(0, 0, 0, 0.91)))',
    accent: 'var(--sjs-primary-forecolor, var(--primary-foreground, #fff))',
  },
  '--sjs-font-headerdescription-color': {
    normal:
      'var(--sjs-font-pagedescription-color, var(--sjs-general-dim-forecolor-light, rgba(0, 0, 0, 0.45)))',
    accent: 'var(--sjs-primary-forecolor, var(--primary-foreground, #fff))',
  },
};

// ---------------------------------------------------------------------------
// The 82 preset-base names with explicit grammars (verified against
// survey-core/src/themes/default-light.ts)
// ---------------------------------------------------------------------------

const KEYWORD_TEXT_CASE = {
  kind: 'keyword',
  allowed: ['none', 'uppercase', 'lowercase', 'capitalize'],
};
const KEYWORD_TEXT_DECORATION = {
  kind: 'keyword',
  allowed: ['none', 'underline', 'overline', 'line-through'],
};
const KEYWORD_FONT_STYLE = {
  kind: 'keyword',
  allowed: ['normal', 'italic', 'oblique'],
};
const KEYWORD_FONT_STRETCH = {
  kind: 'keyword',
  allowed: [
    'normal',
    'ultra-condensed',
    'extra-condensed',
    'condensed',
    'semi-condensed',
    'semi-expanded',
    'expanded',
    'extra-expanded',
    'ultra-expanded',
  ],
};

const PRESET_BASE_COLOR_NAMES = [
  '--sjs-general-backcolor',
  '--sjs-general-backcolor-dark',
  '--sjs-general-backcolor-dim',
  '--sjs-general-backcolor-dim-light',
  '--sjs-general-backcolor-dim-dark',
  '--sjs-general-forecolor',
  '--sjs-general-forecolor-light',
  '--sjs-general-dim-forecolor',
  '--sjs-general-dim-forecolor-light',
  '--sjs-primary-backcolor',
  '--sjs-primary-backcolor-light',
  '--sjs-primary-backcolor-dark',
  '--sjs-primary-forecolor',
  '--sjs-primary-forecolor-light',
  '--sjs-secondary-backcolor',
  '--sjs-secondary-backcolor-light',
  '--sjs-secondary-backcolor-semi-light',
  '--sjs-secondary-forecolor',
  '--sjs-secondary-forecolor-light',
  '--sjs-border-light',
  '--sjs-border-default',
  '--sjs-border-inside',
  '--sjs-special-red',
  '--sjs-special-red-light',
  '--sjs-special-red-forecolor',
  '--sjs-special-green',
  '--sjs-special-green-light',
  '--sjs-special-green-forecolor',
  '--sjs-special-blue',
  '--sjs-special-blue-light',
  '--sjs-special-blue-forecolor',
  '--sjs-special-yellow',
  '--sjs-special-yellow-light',
  '--sjs-special-yellow-forecolor',
];

const PRESET_BASE_GRAMMAR = {
  ...Object.fromEntries(
    PRESET_BASE_COLOR_NAMES.map((n) => [n, { kind: 'color' }])
  ),
  '--sjs-base-unit': { kind: 'length' },
  '--sjs-corner-radius': { kind: 'length' },
  '--sjs-shadow-small': { kind: 'shadow' },
  '--sjs-shadow-small-reset': { kind: 'shadow' },
  '--sjs-shadow-medium': { kind: 'shadow' },
  '--sjs-shadow-large': { kind: 'shadow' },
  '--sjs-shadow-inner': { kind: 'shadow' },
  '--sjs-shadow-inner-reset': { kind: 'shadow' },
  ...Object.fromEntries(
    ['xx-large', 'x-large', 'large', 'medium', 'default'].flatMap((size) =>
      Object.entries({
        textDecoration: KEYWORD_TEXT_DECORATION,
        fontWeight: { kind: 'fontWeight' },
        fontStyle: KEYWORD_FONT_STYLE,
        fontStretch: KEYWORD_FONT_STRETCH,
        letterSpacing: { kind: 'length' },
        lineHeight: { kind: 'length' },
        paragraphIndent: { kind: 'length' },
        textCase: KEYWORD_TEXT_CASE,
      }).map(([prop, grammar]) => [
        `--sjs-article-font-${size}-${prop}`,
        grammar,
      ])
    )
  ),
};

if (Object.keys(PRESET_BASE_GRAMMAR).length !== 82) {
  throw new Error(
    `PRESET_BASE_GRAMMAR must have exactly 82 entries, has ${Object.keys(PRESET_BASE_GRAMMAR).length}`
  );
}

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

const COLOR_SHAPE_RE =
  /^(rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}$|transparent$)/;
const LENGTH_SHAPE_RE = /^(-?(?:\d+\.?\d*|\.\d+)px|0)$/;
const CALC_SHAPE_RE = /^calc\(/;

function findMatchingParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitVarArgs(argsText) {
  let depth = 0;
  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      return [argsText.slice(0, i).trim(), argsText.slice(i + 1).trim()];
    }
  }
  return [argsText.trim(), undefined];
}

/** Substitutes var() chains against the fixture defaults to a terminal literal (or null). */
function terminalize(expr, byName, seen = new Set()) {
  if (expr === null || expr === undefined) return null;
  const openIndex = expr.indexOf('var(');
  if (openIndex === -1) return expr;
  const closeIndex = findMatchingParen(expr, openIndex + 3);
  if (closeIndex === -1) return null;
  const [name, fallback] = splitVarArgs(
    expr.slice(openIndex + 4, closeIndex)
  );
  let resolved = null;
  if (!seen.has(name) && byName.has(name)) {
    resolved = terminalize(
      byName.get(name).rawDefault,
      byName,
      new Set([...seen, name])
    );
  }
  if (resolved === null && fallback !== undefined) {
    resolved = terminalize(fallback, byName, seen);
  }
  if (resolved === null) return null;
  const before = expr.slice(0, openIndex);
  const after = terminalize(expr.slice(closeIndex + 1), byName, seen);
  if (after === null) return null;
  return before + resolved + after;
}

function classify(name) {
  if (!name.startsWith('--sjs-')) return 'legacy-alias';
  if (CONTEXT_DEPENDENT[name]) return 'context-dependent';
  if (isWebOnly(name)) return 'web-only';
  if (PRESET_BASE_GRAMMAR[name]) return 'preset-base';
  return 'semantic-derived';
}

function grammarFor(name, variableClass, rawDefault, byName) {
  const preset = PRESET_BASE_GRAMMAR[name];
  if (preset) return preset;
  if (variableClass === 'web-only') return { kind: 'string' };
  if (variableClass === 'context-dependent') return { kind: 'color' };
  if (rawDefault === null) return { kind: 'string' };
  // Bare-number weights and font-family lists are shape-ambiguous — the
  // only two name-based rules outside the preset table.
  if (name.endsWith('-weight') || name.endsWith('fontWeight')) {
    return { kind: 'fontWeight' };
  }
  if (name.endsWith('-family')) return { kind: 'string' };
  // Shape-driven: raw calc dialect first, then the terminalized literal.
  if (CALC_SHAPE_RE.test(rawDefault.trim())) return { kind: 'calc' };
  const terminal = terminalize(rawDefault, byName);
  if (terminal !== null) {
    const t = terminal.trim();
    if (COLOR_SHAPE_RE.test(t)) return { kind: 'color' };
    if (LENGTH_SHAPE_RE.test(t)) return { kind: 'length' };
    if (CALC_SHAPE_RE.test(t)) return { kind: 'calc' };
  }
  return { kind: 'string' };
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function main() {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const byName = new Map(fixture.variables.map((v) => [v.name, v]));

  const entries = [];
  const justifications = {};

  for (const v of fixture.variables) {
    const variableClass = classify(v.name);
    const grammar = grammarFor(v.name, variableClass, v.rawDefault, byName);
    const context = CONTEXT_DEPENDENT[v.name];

    const entry = {
      name: v.name,
      class: variableClass,
      grammar,
      default: context ? context.normal : v.rawDefault,
      source: v.source,
    };
    if (context) entry.accentDefault = context.accent;

    // Per-use fallback divergence (codex review major 4): every distinct
    // non-primary occurrence expression is exposed for 0.7's per-consumer
    // recipes; non-context-dependent divergent names additionally need an
    // explicit justification (asserted by registry-vs-fixture.test.ts).
    const distinct = [
      ...new Map(
        v.occurrences
          .filter(
            (o) => o.rawDefault !== null && o.rawDefault !== entry.default
          )
          .map((o) => [o.rawDefault, o])
      ).values(),
    ];
    if (variableClass === 'context-dependent') {
      const nonContext = distinct.filter(
        (o) =>
          o.rawDefault !== context.normal && o.rawDefault !== context.accent
      );
      if (nonContext.length > 0) {
        entry.alternates = nonContext.map((o) => ({
          expression: o.rawDefault,
          source: o.source,
        }));
      }
    } else if (distinct.length > 0) {
      entry.alternates = distinct.map((o) => ({
        expression: o.rawDefault,
        source: o.source,
      }));
      if (variableClass !== 'web-only') {
        justifications[v.name] =
          'variables.scss (or the first-declared) default is canonical for token resolution; the divergent per-consumer fallback(s) are component-local styling choices that 0.7 style recipes evaluate per consumer via the exposed alternates.';
      }
    }

    entries.push(entry);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const header = `/**
 * GENERATED by scripts/generate-registry-data.mjs from the extraction
 * fixture at src/theme-core/__fixtures__/scss-defaults.json — then
 * REVIEWED and committed as the maintained, shipped source of truth
 * (design: docs/design/0.6-theme-core.md, "Variable registry").
 *
 * Do not hand-edit values casually: regenerate (extract-scss-defaults.mjs
 * first, then this generator) on a survey-core version-band bump and
 * re-review the diff. This module must NEVER import the JSON fixture —
 * the fixture is the TEST-ONLY oracle and
 * __tests__/registry-vs-fixture.test.ts exhaustively compares the two
 * independent artifacts.
 *
 * Entry semantics:
 *  - \`default: null\` = the variable is consumed by default-theme SCSS but
 *    never given a fallback or declaration anywhere (e.g.
 *    --sjs-default-font-family — an optional runtime hook; unset in the
 *    pure cascade, so dependent font-family chains resolve to inherit).
 *  - \`accentDefault\` = the accent-header-context chain for the three
 *    context-dependent header colors (header.scss:6,10,164-199).
 *  - \`alternates\` = distinct per-consumer fallback expressions found at
 *    OTHER use sites (codex review major 4) — exposed for 0.7 recipes;
 *    non-web-only names with alternates carry an entry in
 *    MULTI_DEFAULT_JUSTIFICATIONS.
 */
import type { RegistryDataEntry } from './registry';

`;

  const dataLiteral = JSON.stringify(entries, null, 2)
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .trim();

  const justificationsLiteral = JSON.stringify(justifications, null, 2);

  const body = `export const REGISTRY_DATA: readonly RegistryDataEntry[] = [
  ${dataLiteral}
];

/**
 * Explicit review rationale for every non-web-only, non-context-dependent
 * name whose fixture occurrences carry MORE THAN ONE distinct fallback
 * expression (codex review major 4) — enforced exhaustively by
 * __tests__/registry-vs-fixture.test.ts.
 */
export const MULTI_DEFAULT_JUSTIFICATIONS: Readonly<Record<string, string>> =
  ${justificationsLiteral};
`;

  writeFileSync(OUTPUT_PATH, header + body);
  console.log(
    `Wrote ${entries.length} entries (${Object.keys(justifications).length} multi-default justifications) -> ${relative(REPO_ROOT, OUTPUT_PATH)}`
  );
}

main();
