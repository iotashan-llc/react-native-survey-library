/**
 * The vendored cascade table (design: docs/design/0.6-theme-core.md,
 * "Module layout" — defaults.ts): a flat `name -> raw default` map (both
 * terminal literals and unevaluated expressions, per the "Default-table
 * contract"), derived from `registry.ts`'s per-entry `default` field.
 *
 * Kept as a thin derivation (rather than a second hand-maintained table)
 * deliberately: registry.ts is the single source of truth for what a
 * variable's default IS (it's already reviewed against
 * `scss-defaults.json` by `registry-vs-fixture.test.ts`) —
 * duplicating that data here would only create a second place it could
 * drift from the SCSS ground truth.
 *
 * `resolve.ts` step 1 overlays `theme.cssVariables` on top of this table
 * to build the complete cascade environment (`rawVariables`) that step 2's
 * `var()` dereference operates over.
 */
import { REGISTRY } from './registry';

export const DEFAULTS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(REGISTRY).map(([name, entry]) => [name, entry.default])
  )
);

/**
 * Context-dependent entries (header colors/background) additionally have
 * an accent-context default — exposed separately since `DEFAULTS` only
 * carries the single "normal context" value used to seed `rawVariables`.
 */
export const ACCENT_DEFAULTS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(REGISTRY)
      .filter(([, entry]) => entry.accentDefault !== undefined)
      .map(([name, entry]) => [name, entry.accentDefault as string])
  )
);
