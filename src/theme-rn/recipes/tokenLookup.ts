/**
 * Shared token-formula helpers (design: docs/design/0.7-metrics-fixture.md
 * — every recipe metric is FORMULA-first, computed from `resolved`
 * tokens, never a hardcoded literal). `resolveColorVar` extends
 * `resolved.tokens.colors`'s 34 first-class preset-base color tokens to
 * ANY `--sjs-*` color variable the metrics fixture names (e.g.
 * `--sjs-editor-background`, a semantic-derived variable NOT promoted to
 * a first-class `ResolvedTheme` field) — reusing `resolved.rawVariables` +
 * 0.6's own `evaluateVarExpression`/`parseColor`, exactly the pattern
 * 0.6's helpers.ts documents for 0.7's "context-dependent lookups". No
 * re-parsing of theme-core's grammar: this calls the SAME parser 0.6
 * uses, just against a variable name that wasn't worth a dedicated
 * `ResolvedTheme` field.
 */
import { evaluateVarExpression } from '../../theme-core/helpers';
import { parseColor } from '../../theme-core/parse';
import type { ThemeDiagnostic } from '../../theme-core/parse';
import { REGISTRY } from '../../theme-core/registry';
import type { ResolvedTheme, ColorToken } from '../../theme-core/resolve';
import type { RecipeBuildDiagnostic } from './types';

function toCamelCase(sjsName: string): string {
  return sjsName
    .replace(/^--sjs-/, '')
    .replace(/-([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
}

interface ColorVarCacheEntry {
  token: ColorToken;
  /** Replayed into the caller's sink on every (cached) lookup — memoization must never swallow diagnostics (codex impl-review major 6). */
  diagnostics: ThemeDiagnostic[];
}

const colorVarCache = new WeakMap<
  ResolvedTheme,
  Map<string, ColorVarCacheEntry>
>();

/**
 * `calcSize(n)` = n x baseUnit (design 0.7-metrics-fixture.md header formula).
 */
export function calcSize(resolved: ResolvedTheme, n: number): number {
  return n * resolved.tokens.baseUnit;
}

/** `calcFontSize(n)`/`calcLineHeight(n)` = n x base --sjs-font-size. */
export function calcFontSize(resolved: ResolvedTheme, n: number): number {
  return n * resolved.tokens.typography.base.fontSize;
}
export const calcLineHeight = calcFontSize;

/** `calcCornerRadius(n)` = n x --sjs-corner-radius. */
export function calcCornerRadius(resolved: ResolvedTheme, n: number): number {
  return n * resolved.tokens.cornerRadius;
}

/**
 * Resolves ANY `--sjs-*` color variable: the fast path returns the
 * already-resolved first-class token when one exists (34 preset-base
 * color tokens); otherwise dereferences on-demand against
 * `resolved.rawVariables` (memoized per `resolved` + variable name, since
 * `resolved` is treated as an immutable snapshot for the provider's
 * cache-entry lifetime).
 *
 * REGISTRY-AWARE (codex impl-review major 6): an invalid/unresolvable
 * value falls back to the variable's registry default RE-EVALUATED against
 * the post-overlay environment (mirroring 0.6 `resolveEntry`'s
 * `dereferenceDefault` rule) — never a silent `transparent` — and the
 * failure emits `ThemeDiagnostic`s into the optional `diagnosticsSink`
 * (recipes thread `BuildContext.diagnostics` here; the provider flushes
 * post-commit). The fallback's own dereference diagnostics are merged
 * only when the fallback is actually used, keeping clean paths silent.
 * Cached lookups REPLAY their recorded diagnostics into the sink so
 * memoization never swallows them.
 */
export function resolveColorVar(
  resolved: ResolvedTheme,
  sjsName: string,
  diagnosticsSink?: RecipeBuildDiagnostic[]
): ColorToken {
  const key = toCamelCase(sjsName);
  const firstClass = resolved.tokens.colors[key];
  if (firstClass) return firstClass;

  let cache = colorVarCache.get(resolved);
  if (!cache) {
    cache = new Map();
    colorVarCache.set(resolved, cache);
  }
  const cached = cache.get(sjsName);
  if (cached) {
    diagnosticsSink?.push(...cached.diagnostics);
    return cached.token;
  }

  const diagnostics: ThemeDiagnostic[] = [];
  const { value, diagnostics: derefDiagnostics } = evaluateVarExpression(
    resolved.rawVariables,
    `var(${sjsName})`
  );

  // Post-overlay registry default (the fallback handed to parseColor must
  // itself be dereferenced — registry defaults are usually var() chains).
  const fallbackDiagnostics: ThemeDiagnostic[] = [];
  const registryDefault = REGISTRY[sjsName]?.default;
  let fallback = 'transparent';
  if (registryDefault) {
    const fb = evaluateVarExpression(resolved.rawVariables, registryDefault);
    fallbackDiagnostics.push(...fb.diagnostics);
    fallback = fb.value ?? 'transparent';
  }

  const parsedResult = parseColor(value ?? fallback, fallback, sjsName);
  const failed = value === undefined || parsedResult.diagnostics.length > 0;
  if (failed) {
    diagnostics.push(...derefDiagnostics);
    diagnostics.push(...parsedResult.diagnostics);
    diagnostics.push(...fallbackDiagnostics);
  }

  const parsed = parsedResult.value;
  const token: ColorToken = {
    ...parsed,
    css: `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${parsed.a})`,
  };
  cache.set(sjsName, { token, diagnostics });
  diagnosticsSink?.push(...diagnostics);
  return token;
}
