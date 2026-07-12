/**
 * Pure standalone helpers (design: docs/design/0.6-theme-core.md, "Module
 * layout" — helpers.ts). Two independent exports:
 *
 * - `spacing(baseUnit, multiplier)` — the RN equivalent of SCSS's
 *   `calcSize()` mixin, without memoization (callers that need caching own
 *   that themselves; keeping this a bare multiply keeps it trivially
 *   pure/testable).
 * - `evaluateVarExpression(rawVariables, expr)` — the tri-state
 *   (white/grey/black) DFS `var()` dereference engine (design's
 *   "Resolution algorithm" step 2). `resolve.ts` uses this to dereference
 *   every registry entry's raw value against the full cascade
 *   environment; 0.7 reuses it directly for context-dependent lookups
 *   (e.g. header colors keyed by `backgroundKind`).
 *
 * Dereference semantics, matching the design exactly:
 *  - Bounded by graph size (memoized per name within one call), not an
 *    arbitrary hop cap — verified by the > 4-hop alias-chain test.
 *  - Cycle members are marked invalid FIRST: on a grey-revisit, every
 *    variable on the active DFS stack from the revisited name onward (the
 *    actual cycle members — a non-member that merely REFERS into the
 *    cycle sits earlier on the stack and is spared) enters a permanent
 *    invalid set BEFORE any fallback evaluation, and an invalid member is
 *    never overwritten during unwind — a member's own internal
 *    `var(--x, fallback)` fallback cannot revive it; only a REFERRING
 *    (outside-the-cycle) expression's fallback applies. This is the CSS
 *    cascade's "computed value of a custom property that's part of a
 *    cycle is the guaranteed-invalid value" rule.
 *  - A `var(--x, fallback)` call's fallback is split at the first
 *    TOP-LEVEL comma (paren-aware); nested `var()` calls inside a
 *    fallback are themselves recursively dereferenced.
 *  - Multiple `var()` occurrences within a single larger expression (e.g.
 *    a `calc()` operand, or a multi-token shadow value) are all
 *    substituted — dereferencing operates on the whole string, not just a
 *    bare `var(...)` call.
 */
import type { ThemeDiagnostic } from './parse';

export type RawVariables = Record<string, string>;

export interface VarEvalResult {
  value: string | undefined;
  diagnostics: ThemeDiagnostic[];
}

/** Pure spacing helper — the RN equivalent of SCSS's `calcSize()`. No memoization. */
export function spacing(baseUnit: number, multiplier: number): number {
  return baseUnit * multiplier;
}

type VarNodeState = 'grey' | 'black';

interface DerefContext {
  rawVariables: RawVariables;
  state: Map<string, VarNodeState>;
  resolved: Map<string, string | undefined>;
  diagnostics: ThemeDiagnostic[];
  /** Active DFS stack — the chain of names currently being resolved. */
  stack: string[];
  /** Names proven to be cycle members: permanently guaranteed-invalid. */
  invalid: Set<string>;
}

function findMatchingParen(text: string, openIndex: number): number {
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

/** Splits a `var(...)`-call's argument list at the first TOP-LEVEL comma. */
function splitVarArgs(argsText: string): [string, string | undefined] {
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

function resolveVarName(name: string, ctx: DerefContext): string | undefined {
  if (ctx.invalid.has(name)) return undefined;

  const state = ctx.state.get(name);
  if (state === 'grey') {
    // Grey-revisit = cycle. Every name on the active DFS stack from the
    // first occurrence of `name` onward IS a member of this cycle; a
    // non-member that merely refers INTO the cycle sits earlier on the
    // stack and keeps its own fallback. Mark all members invalid BEFORE
    // any unwind so no member's internal fallback can revive it.
    const start = ctx.stack.indexOf(name);
    const members = ctx.stack.slice(start === -1 ? 0 : start);
    for (const member of members) {
      ctx.invalid.add(member);
      ctx.resolved.set(member, undefined);
    }
    ctx.diagnostics.push({
      code: 'theme-core/var-cycle',
      variable: name,
      message: `cyclic variable reference involving ${members.join(' -> ')}; all members treated as invalid`,
    });
    return undefined;
  }
  if (state === 'black') {
    return ctx.resolved.get(name);
  }

  const raw = ctx.rawVariables[name];
  if (raw === undefined) {
    ctx.state.set(name, 'black');
    ctx.resolved.set(name, undefined);
    return undefined;
  }

  ctx.state.set(name, 'grey');
  ctx.stack.push(name);
  const result = substitute(raw, ctx);
  ctx.stack.pop();
  ctx.state.set(name, 'black');
  if (ctx.invalid.has(name)) {
    // This name was proven a cycle member while its own value was being
    // computed — the computed result (possibly revived via an internal
    // fallback during unwind) must NOT overwrite guaranteed-invalid.
    ctx.resolved.set(name, undefined);
    return undefined;
  }
  ctx.resolved.set(name, result);
  return result;
}

/**
 * Substitutes every top-level `var(--name[, fallback])` call found in
 * `expr`, recursively. Returns `undefined` if any `var()` call within
 * `expr` fails to resolve (its variable is invalid/missing AND it has no
 * usable fallback) — a partially-substituted string with a dangling
 * unresolved reference isn't a meaningful terminal value.
 */
function substitute(expr: string, ctx: DerefContext): string | undefined {
  const openIndex = expr.indexOf('var(');
  if (openIndex === -1) return expr;
  const callOpen = openIndex + 3;
  const closeIndex = findMatchingParen(expr, callOpen);
  if (closeIndex === -1) return expr;

  const before = expr.slice(0, openIndex);
  const inner = expr.slice(callOpen + 1, closeIndex);
  const after = expr.slice(closeIndex + 1);

  const [name, fallback] = splitVarArgs(inner);
  const resolvedName = resolveVarName(name, ctx);

  let varResult: string | undefined;
  if (resolvedName !== undefined) {
    varResult = resolvedName;
  } else if (fallback !== undefined) {
    varResult = substitute(fallback, ctx);
  } else {
    varResult = undefined;
    ctx.diagnostics.push({
      code: 'theme-core/var-unresolved',
      variable: name,
      message: `variable ${name} is unresolved and has no fallback`,
    });
  }

  if (varResult === undefined) return undefined;

  // `before` cannot itself contain "var(" (openIndex was the first
  // occurrence), so this call is a no-op — kept for symmetry/safety.
  const resolvedBefore = substitute(before, ctx);
  const resolvedAfter = substitute(after, ctx);
  if (resolvedBefore === undefined || resolvedAfter === undefined) {
    return undefined;
  }
  return resolvedBefore + varResult + resolvedAfter;
}

export function evaluateVarExpression(
  rawVariables: RawVariables,
  expr: string
): VarEvalResult {
  const ctx: DerefContext = {
    rawVariables,
    state: new Map(),
    resolved: new Map(),
    diagnostics: [],
    stack: [],
    invalid: new Set(),
  };
  const value = substitute(expr, ctx);
  return { value, diagnostics: ctx.diagnostics };
}
