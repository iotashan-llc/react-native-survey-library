/**
 * survey-core environment shim (design: docs/design/0.3-core-facade.md).
 *
 * React Native aliases `window === global`, so survey-core's SSR guard
 * (`DomWindowHelper.isAvailable()` = `typeof window !== "undefined"`)
 * passes inside React Native even though there is no real DOM. That routes
 * require-time code in `dragdrop/dom-adapter.ts` into
 * `window.addEventListener("touchmove", ...)`, which throws because
 * React Native's global has no `addEventListener`.
 *
 * This module patches ONLY that gap — a no-op `addEventListener` /
 * `removeEventListener` pair on `global` — and nothing else:
 *
 * - No `document` is ever defined. Its absence is what routes survey-core
 *   into its already-SSR-safe paths (see `settings.ts`'s environment
 *   ternary); defining it would do the opposite of what we want.
 * - No ResizeObserver/MutationObserver/IntersectionObserver stub. The
 *   unguarded `new ResizeObserver` call sites (`scroll.ts#setRootElement`,
 *   `survey.ts#afterRenderSurvey`) sit on DOM-render entry points this
 *   library's renderer must never call; a global no-op observer would make
 *   feature-detection succeed while callbacks never fire, which is worse
 *   than leaving it absent.
 *
 * This module has zero imports and must stay that way — it needs to be
 * safely requirable before anything else, including survey-core itself.
 */

type PatchableGlobal = Record<string, unknown>;

function noop(): void {}

/**
 * Applies the survey-core environment shim to `global`. Idempotent: safe
 * to call more than once, and never overrides a global that already
 * exists (patches only what's missing).
 */
export function applySurveyCoreShims(): void {
  const target = globalThis as unknown as PatchableGlobal;

  if (typeof target.addEventListener !== 'function') {
    target.addEventListener = noop;
  }
  if (typeof target.removeEventListener !== 'function') {
    target.removeEventListener = noop;
  }
}

applySurveyCoreShims();
