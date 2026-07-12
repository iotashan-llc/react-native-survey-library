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
import type { ResolvedTheme, ColorToken } from '../../theme-core/resolve';

function toCamelCase(sjsName: string): string {
  return sjsName
    .replace(/^--sjs-/, '')
    .replace(/-([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
}

const colorVarCache = new WeakMap<ResolvedTheme, Map<string, ColorToken>>();

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
 */
export function resolveColorVar(
  resolved: ResolvedTheme,
  sjsName: string
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
  if (cached) return cached;

  const { value } = evaluateVarExpression(
    resolved.rawVariables,
    `var(${sjsName})`
  );
  const parsed = parseColor(value ?? 'transparent', 'transparent', sjsName)
    .value;
  const token: ColorToken = {
    ...parsed,
    css: `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${parsed.a})`,
  };
  cache.set(sjsName, token);
  return token;
}
