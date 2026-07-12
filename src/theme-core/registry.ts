/**
 * Variable classification registry (design: docs/design/0.6-theme-core.md,
 * "Variable registry" + "Module layout" — registry.ts). Every `--sjs-*`
 * (and legacy non-namespaced alias) name consumed anywhere in
 * `default-theme/**\/*.scss` gets exactly one entry here: a class, a
 * bounded parse grammar, a default (raw, possibly `var()`/`calc()`-shaped
 * expression string), and a `file:line` source ref — all sourced from
 * `scss-defaults.json`, the committed output of
 * `scripts/extract-scss-defaults.mjs` (an independent, mechanical
 * extraction of the reference checkout's SCSS — see that script's own
 * header comment). `__tests__/registry-vs-fixture.test.ts` exhaustively
 * checks this file never drifts from the fixture.
 *
 * Classification rules (mechanical, not per-entry judgment calls — kept
 * that way deliberately so ~230 entries stay auditable):
 *
 * 1. A name that does NOT start with `--sjs-` is a **legacy alias** (the
 *    pre-`--sjs-` custom-property names a theme author could set
 *    directly, e.g. `--primary`) — these only ever appear NESTED inside
 *    an `--sjs-*` entry's own fallback chain; the extractor lifts them
 *    into their own top-level fixture entries.
 * 2. Three names are **context-dependent**: `--sjs-header-backcolor` and
 *    the header title/description colors — declared with a DIFFERENT
 *    fallback under `.sv-header__background-color--accent` than in the
 *    normal (non-accent) header context (header.scss:6/10, :164-199).
 *    Exposed as raw + both context defaults; 0.7 selects per
 *    `backgroundKind` via `helpers.ts#evaluateVarExpression`.
 * 3. A fixed, explicitly-enumerated set of ~60 animation/motion keys
 *    (`--sjs-row-*`, `--sjs-expand-*`, `--sjs-collapse-*`,
 *    `--sjs-ranking-*`, `--sjs-element-*`, `--sjs-matrix-row-*`,
 *    `--sjs-matrix-detail-row-*`, `--sjs-pd-tab-*`, `--sjs-pd-list-*`,
 *    `--sjs-transition-duration`) is **web-only** — RN has no CSS
 *    transition cascade to replicate; ignored per the design's own
 *    documented non-goal, kept in the registry only so the
 *    registry-vs-fixture exhaustiveness check covers them.
 * 4. Exactly the 82 names that appear in every one of the 40
 *    `survey-core/themes` preset objects (verified against
 *    `themes/default-light.ts`) are **preset-base**.
 * 5. Everything else is **semantic-derived** — SCSS variables defined as
 *    expressions over other variables (editor/panel colors, the extra
 *    font-family/weight/color/size tokens beyond the 82, `--sjs-article-
 *    font-<size>-fontSize`, etc.). Their registry default is re-evaluated
 *    post-overlay exactly like every other entry (the resolver's `var()`
 *    dereference step 2 already operates over the FULL overlaid
 *    environment for every entry uniformly — see resolve.ts); the only
 *    entries needing genuinely different resolver handling are the 7
 *    tagged `grammar: { kind: 'calc' }` below (the SCSS-emitted
 *    `calc(<n> * (<operand>))` dialect), which resolve.ts recognizes and
 *    evaluates via `parse.ts#parseCalc` after dereferencing.
 *
 * Grammar assignment mirrors each variable's CSS *meaning*, inferred by
 * name suffix with a small set of explicit overrides for the genuinely
 * ambiguous cases (keyword unions, the calc-shaped size tokens).
 */
import scssDefaultsFixture from './scss-defaults.json';

export type VariableClass =
  | 'preset-base'
  | 'semantic-derived'
  | 'context-dependent'
  | 'web-only'
  | 'legacy-alias';

/** Expected-format grammar per key (design: "registry.ts ... + expected-format grammar per key"). */
export type GrammarSpec =
  | { kind: 'color' }
  | { kind: 'length' }
  | { kind: 'fontWeight' }
  | { kind: 'keyword'; allowed: readonly string[] }
  | { kind: 'number'; min?: number; max?: number }
  | { kind: 'shadow' }
  | { kind: 'calc' }
  | { kind: 'string' };

export interface RegistryEntry {
  name: string;
  class: VariableClass;
  grammar: GrammarSpec;
  /** Raw default expression/literal. For context-dependent entries, this is the NORMAL (non-accent) context default. */
  default: string;
  /** Only present for context-dependent entries. */
  accentDefault?: string;
  source: string;
}

// ---------------------------------------------------------------------------
// The 82 names present in every survey-core theme preset's `cssVariables`
// (verified against `survey-core/src/themes/default-light.ts`) — built
// with an EXPLICIT grammar per name (not the name-suffix heuristic used
// for the ~150 non-preset entries below) since several of these 82 names
// don't carry a grammar-revealing suffix at all (`--sjs-special-red`,
// `--sjs-general-backcolor-dim`, `--sjs-border-default`, ...) and a
// suffix-only heuristic silently misclassified them in an earlier
// revision (caught by the 34-color-keys invariance-canary test).
// ---------------------------------------------------------------------------
const COLOR: GrammarSpec = { kind: 'color' };
const LENGTH: GrammarSpec = { kind: 'length' };
const SHADOW: GrammarSpec = { kind: 'shadow' };
const FONT_WEIGHT: GrammarSpec = { kind: 'fontWeight' };
const KEYWORD_TEXT_CASE: GrammarSpec = {
  kind: 'keyword',
  allowed: ['none', 'uppercase', 'lowercase', 'capitalize'],
};
const KEYWORD_TEXT_DECORATION: GrammarSpec = {
  kind: 'keyword',
  allowed: ['none', 'underline', 'overline', 'line-through'],
};
const KEYWORD_FONT_STYLE: GrammarSpec = {
  kind: 'keyword',
  allowed: ['normal', 'italic', 'oblique'],
};
const KEYWORD_FONT_STRETCH: GrammarSpec = {
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

const PRESET_BASE_COLOR_NAMES: readonly string[] = [
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

const PRESET_BASE_LENGTH_NAMES: readonly string[] = [
  '--sjs-base-unit',
  '--sjs-corner-radius',
];

const PRESET_BASE_SHADOW_NAMES: readonly string[] = [
  '--sjs-shadow-small',
  '--sjs-shadow-small-reset',
  '--sjs-shadow-medium',
  '--sjs-shadow-large',
  '--sjs-shadow-inner',
  '--sjs-shadow-inner-reset',
];

const ARTICLE_PROP_GRAMMAR: Record<string, GrammarSpec> = {
  textDecoration: KEYWORD_TEXT_DECORATION,
  fontWeight: FONT_WEIGHT,
  fontStyle: KEYWORD_FONT_STYLE,
  fontStretch: KEYWORD_FONT_STRETCH,
  letterSpacing: LENGTH,
  lineHeight: LENGTH,
  paragraphIndent: LENGTH,
  textCase: KEYWORD_TEXT_CASE,
};

const ARTICLE_SIZES = [
  'xx-large',
  'x-large',
  'large',
  'medium',
  'default',
] as const;

const PRESET_BASE_GRAMMAR: Record<string, GrammarSpec> = {
  ...Object.fromEntries(PRESET_BASE_COLOR_NAMES.map((n) => [n, COLOR])),
  ...Object.fromEntries(PRESET_BASE_LENGTH_NAMES.map((n) => [n, LENGTH])),
  ...Object.fromEntries(PRESET_BASE_SHADOW_NAMES.map((n) => [n, SHADOW])),
  ...Object.fromEntries(
    ARTICLE_SIZES.flatMap((size) =>
      Object.entries(ARTICLE_PROP_GRAMMAR).map(([prop, grammar]) => [
        `--sjs-article-font-${size}-${prop}`,
        grammar,
      ])
    )
  ),
};

export const PRESET_BASE_NAMES: readonly string[] =
  Object.keys(PRESET_BASE_GRAMMAR);

if (PRESET_BASE_NAMES.length !== 82) {
  throw new Error(
    `PRESET_BASE_NAMES must have exactly 82 entries, has ${PRESET_BASE_NAMES.length}`
  );
}

// ---------------------------------------------------------------------------
// Context-dependent header colors (header.scss:6,10,164-199) — declared with
// DIFFERENT fallbacks under the accent-background header context.
// ---------------------------------------------------------------------------
const CONTEXT_DEPENDENT: Record<
  string,
  { normal: string; accent: string; grammar: GrammarSpec }
> = {
  '--sjs-header-backcolor': {
    normal: 'transparent',
    accent: 'var(--sjs-primary-backcolor, var(--primary, #19b394))',
    grammar: { kind: 'color' },
  },
  '--sjs-font-headertitle-color': {
    normal:
      'var(--sjs-font-pagetitle-color, var(--sjs-general-dim-forecolor, rgba(0, 0, 0, 0.91)))',
    accent: 'var(--sjs-primary-forecolor, var(--primary-foreground, #fff))',
    grammar: { kind: 'color' },
  },
  '--sjs-font-headerdescription-color': {
    normal:
      'var(--sjs-font-pagedescription-color, var(--sjs-general-dim-forecolor-light, rgba(0, 0, 0, 0.45)))',
    accent: 'var(--sjs-primary-forecolor, var(--primary-foreground, #fff))',
    grammar: { kind: 'color' },
  },
};

// ---------------------------------------------------------------------------
// Web-only (motion/runtime) keys — RN has no CSS transition cascade;
// ignored, kept in the registry only for exhaustiveness against the fixture.
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
];

function isWebOnly(name: string): boolean {
  return WEB_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// The `calc(<n> * (<operand>))`-shaped entries (design point 4's "calc"
// grammar) — need dereference-then-recompute, not a direct grammar parse.
// ---------------------------------------------------------------------------
const CALC_SHAPED_NAMES = new Set<string>([
  '--sjs-article-font-xx-large-fontSize',
  '--sjs-article-font-x-large-fontSize',
  '--sjs-article-font-large-fontSize',
  '--sjs-article-font-medium-fontSize',
  '--sjs-font-headertitle-size',
  '--sjs-font-headerdescription-size',
]);
// `--sjs-article-font-default-fontSize`'s SCSS default is `#{$font-size}`
// (no multiplier — mixins.scss's articleDefaultFont doesn't call
// calcFontSize) so it resolves as a plain length, not a calc().

function inferGrammar(name: string): GrammarSpec {
  // The 82 preset-base names have an explicit, non-heuristic grammar
  // (several don't carry a grammar-revealing suffix at all — see the
  // comment above PRESET_BASE_COLOR_NAMES).
  const presetGrammar = PRESET_BASE_GRAMMAR[name];
  if (presetGrammar) return presetGrammar;

  if (CALC_SHAPED_NAMES.has(name)) return { kind: 'calc' };
  if (isWebOnly(name)) return { kind: 'string' };

  // Beyond the 82, the remaining `--sjs-article-font-*-<prop>`-shaped
  // names don't exist (only the default-size fontSize does, handled by
  // the length branch below), so no keyword-suffix check is needed here.
  if (name.endsWith('fontWeight') || name.endsWith('-weight')) {
    return { kind: 'fontWeight' };
  }
  if (name.endsWith('family') || name === '--sjs-default-font-family') {
    return { kind: 'string' };
  }
  if (
    name.endsWith('backcolor') ||
    name.endsWith('forecolor') ||
    name.endsWith('hovercolor') ||
    /-color$/i.test(name) ||
    name === '--primary' ||
    name === '--primary-foreground' ||
    name === '--primary-foreground-disabled' ||
    name === '--secondary' ||
    name === '--background' ||
    name === '--background-dim' ||
    name === '--background-dim-light' ||
    name === '--background-semitransparent' ||
    name === '--foreground' ||
    name === '--border' ||
    name === '--red' ||
    name === '--green' ||
    name === '--blue-light' ||
    name.endsWith('-light') ||
    name.endsWith('-dark') ||
    name === '--sjs-border-25-overlay' ||
    name === '--sjs-border-inside' ||
    name === '--lbr-dialog-screen-color'
  ) {
    return { kind: 'color' };
  }
  if (name.includes('shadow')) return { kind: 'shadow' };
  if (
    name.includes('cornerRadius') ||
    name === '--sjs-base-unit' ||
    name === '--base-unit' ||
    name === '--sjs-corner-radius' ||
    name.endsWith('Size') ||
    name.endsWith('-size') ||
    name.endsWith('letterSpacing') ||
    name.endsWith('lineHeight') ||
    name.endsWith('paragraphIndent')
  ) {
    return { kind: 'length' };
  }
  return { kind: 'string' };
}

function classify(name: string): VariableClass {
  if (!name.startsWith('--sjs-')) return 'legacy-alias';
  if (name in CONTEXT_DEPENDENT) return 'context-dependent';
  if (isWebOnly(name)) return 'web-only';
  if (PRESET_BASE_NAMES.includes(name)) return 'preset-base';
  return 'semantic-derived';
}

interface FixtureVariable {
  name: string;
  rawDefault: string;
  source: string;
  occurrences: { rawDefault: string; source: string }[];
}

interface Fixture {
  variables: FixtureVariable[];
}

const fixture = scssDefaultsFixture as Fixture;

function buildRegistry(): Record<string, RegistryEntry> {
  const registry: Record<string, RegistryEntry> = {};
  for (const v of fixture.variables) {
    const contextEntry = CONTEXT_DEPENDENT[v.name];
    if (contextEntry) {
      registry[v.name] = {
        name: v.name,
        class: 'context-dependent',
        grammar: contextEntry.grammar,
        default: contextEntry.normal,
        accentDefault: contextEntry.accent,
        source: v.source,
      };
      continue;
    }
    registry[v.name] = {
      name: v.name,
      class: classify(v.name),
      grammar: inferGrammar(v.name),
      default: v.rawDefault,
      source: v.source,
    };
  }
  // The 3 context-dependent names are always present as fixture entries
  // (variables.scss defines their "normal SCSS variable" default too), so
  // the loop above already covers them — this is just a defensive
  // exhaustiveness guard for the registry-vs-fixture test.
  for (const name of Object.keys(CONTEXT_DEPENDENT)) {
    if (!registry[name]) {
      throw new Error(`context-dependent entry ${name} missing from fixture`);
    }
  }
  return registry;
}

export const REGISTRY: Record<string, RegistryEntry> = buildRegistry();

export function getRegistryEntry(name: string): RegistryEntry | undefined {
  return REGISTRY[name];
}
