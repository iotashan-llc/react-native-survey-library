/**
 * Variable classification registry (design: docs/design/0.6-theme-core.md,
 * "Variable registry" + "Module layout" — registry.ts). Every `--sjs-*`
 * (and legacy non-namespaced alias) name consumed anywhere in
 * `default-theme/**\/*.scss` gets exactly one entry: a class, a bounded
 * parse grammar, a default (raw, possibly `var()`/`calc()`-shaped
 * expression string — or null for names consumed without any fallback or
 * declaration), an optional accent-context default, optional per-consumer
 * alternate expressions, and a `file:line` source ref.
 *
 * The DATA lives in `./registry-data.ts` — a generated-once, reviewed,
 * maintained TypeScript artifact (see scripts/generate-registry-data.mjs)
 * that is INDEPENDENT of the test-only extraction fixture
 * (`__fixtures__/scss-defaults.json`). This module must never import that
 * JSON: `__tests__/registry-vs-fixture.test.ts` exhaustively compares the
 * two independent artifacts, which is only meaningful while they stay
 * independent (codex review critical 1).
 *
 * Classification:
 * 1. non-`--sjs-` names — **legacy aliases** (`--primary`, `--base-unit`,
 *    `--font-family`, `--lbr-*`, ...): only ever appear NESTED inside an
 *    `--sjs-*` entry's fallback chain; that nesting IS their definition.
 * 2. Three header colors are **context-dependent** (header.scss:6,10,
 *    164-199): different fallback chains under the accent-background
 *    header context — exposed as normal default + `accentDefault`; 0.7
 *    selects per context via `helpers.ts#evaluateVarExpression`.
 * 3. An explicitly-enumerated prefix set of animation/motion/runtime-
 *    machinery keys is **web-only** — no CSS transition cascade or inline
 *    style-state machinery to replicate in RN; registered only so the
 *    exhaustiveness check covers them (documented non-goal).
 * 4. The 82 names present in every one of the 40 `survey-core/themes`
 *    preset objects are **preset-base**, with hand-enumerated grammars.
 * 5. Everything else is **semantic-derived** — SCSS variables defined as
 *    expressions over other variables; grammar assigned from the SHAPE of
 *    the default (calc dialect / terminalized literal), reviewed at
 *    generation (codex review major 5 — no suffix-only heuristics).
 */
import { REGISTRY_DATA } from './registry-data';

export { REGISTRY_DATA, MULTI_DEFAULT_JUSTIFICATIONS } from './registry-data';

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

/** One per-consumer alternate fallback expression (codex review major 4). */
export interface AlternateDefault {
  expression: string;
  source: string;
}

/** Shape of the generated rows in registry-data.ts. */
export interface RegistryDataEntry {
  name: string;
  class: VariableClass;
  grammar: GrammarSpec;
  /**
   * Raw default expression/literal, or null when the variable is consumed
   * by the SCSS without any fallback or declaration anywhere (pure
   * runtime hook — unresolvable in the no-theme cascade).
   */
  default: string | null;
  /** Only present for context-dependent entries. */
  accentDefault?: string;
  /** Distinct per-consumer fallback expressions at other use sites. */
  alternates?: AlternateDefault[];
  source: string;
}

export type RegistryEntry = RegistryDataEntry;

export const REGISTRY: Readonly<Record<string, RegistryEntry>> = Object.freeze(
  Object.fromEntries(REGISTRY_DATA.map((entry) => [entry.name, entry]))
);

export const PRESET_BASE_NAMES: readonly string[] = REGISTRY_DATA.filter(
  (entry) => entry.class === 'preset-base'
).map((entry) => entry.name);

if (PRESET_BASE_NAMES.length !== 82) {
  throw new Error(
    `PRESET_BASE_NAMES must have exactly 82 entries, has ${PRESET_BASE_NAMES.length}`
  );
}

export function getRegistryEntry(name: string): RegistryEntry | undefined {
  return REGISTRY[name];
}
