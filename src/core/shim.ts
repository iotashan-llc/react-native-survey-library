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

/**
 * The shape of survey-core's `settings` singleton this shim cares about
 * (structural — declared locally so this module keeps its zero-imports
 * invariant).
 */
interface SurveyCoreSettingsLike {
  environment?: unknown;
}

function noop(): void {}

/**
 * Applies the survey-core environment shim. Idempotent: safe to call
 * more than once, and never overrides anything that already exists
 * (patches only what's missing).
 *
 * Global patches (no argument needed): a no-op `addEventListener`/
 * `removeEventListener` pair on `global` — see the module banner.
 *
 * 1.2 amendment (design: docs/design/1.2-lifecycle-bridge.md, piece 3):
 * when survey-core's `settings` singleton is PASSED IN, additionally
 * stubs `settings.environment` — an object whose mount fields are all
 * `undefined`.
 *
 * NARROW CONTRACT (review round 2 #6): the stub protects EXACTLY the
 * destructures of the environment OBJECT ITSELF — the scroll funnel's
 * `const { rootElement } = settings.environment` (survey.ts:5872,
 * downstream optional-chained: `surveyRootElement?.querySelector`
 * skips) and dom-utils' `const { root } = settings.environment`
 * (getElement with a non-string argument never touches `root`). It does
 * NOT make DOM-only paths safe: drag-drop dereferences
 * `settings.environment.root.documentElement`
 * (dragdrop/dom-adapter.ts) and popup mounting calls
 * `getElement(settings.environment.popupMountContainer).appendChild`
 * (popup-view-model.ts) — both still throw on the undefined fields and
 * remain UNSUPPORTED (this renderer never enters them: no DnD, native
 * popups instead of DOM popups; negative tripwires in
 * environment-stub.test.ts pin that reality). The parameter keeps this
 * module import-free: the FACADE (the one module allowed to import
 * survey-core) passes `settings` after survey-core evaluates; the
 * self-invocation below stays global-only, which is why the `/shim`
 * subpath remains zero-core-import for consumers who import survey-core
 * before the renderer.
 */
export function applySurveyCoreShims(
  surveyCoreSettings?: SurveyCoreSettingsLike
): void {
  const target = globalThis as unknown as PatchableGlobal;

  if (typeof target.addEventListener !== 'function') {
    target.addEventListener = noop;
  }
  if (typeof target.removeEventListener !== 'function') {
    target.removeEventListener = noop;
  }

  if (surveyCoreSettings) {
    // `??=`: a consumer-supplied environment (set before the facade
    // evaluated) is never clobbered. Never define `document` (0.3
    // invariant unchanged — its absence routes survey-core into its
    // SSR-safe paths).
    surveyCoreSettings.environment ??= {
      root: undefined,
      rootElement: undefined,
      popupMountContainer: undefined,
      svgMountContainer: undefined,
      stylesSheetsMountContainer: undefined,
    };
  }
}

applySurveyCoreShims();
