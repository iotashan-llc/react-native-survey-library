/**
 * The one place inside this library allowed to import `survey-core`
 * directly (design: docs/design/0.3-core-facade.md). Every other module
 * must import survey-core exports through this file; ESLint enforces it
 * (`no-restricted-imports` / `no-restricted-syntax` on `survey-core` and
 * `survey-core/*`, scoped to `src/**` with this file excepted).
 *
 * ECMAScript evaluates module requests in source-occurrence order,
 * including `export … from` requests — so the `import './shim'` request
 * below (first occurrence) evaluates before the `export * from
 * 'survey-core'` request pulls survey-core in, applying the shim before
 * survey-core's require-time code runs. Babel's CJS output (what every RN
 * consumer and Jest actually run) preserves that order; the packaged-entry
 * tests (`test:packaged`) execute the emitted artifacts as the regression
 * proof for this, rather than relying on the ECMAScript ordering claim
 * alone.
 */
import './shim';

export * from 'survey-core';

// 1.2 amendment (design: docs/design/1.2-lifecycle-bridge.md, piece 3):
// with survey-core now evaluated, hand its `settings` singleton back to
// the shim so it can stub `settings.environment` (defense-in-depth
// behind the lifecycle bridge — the bridge cancels the scroll funnel
// before core's unguarded destructure; the stub's NARROW contract makes
// destructures of the environment object itself survivable — DOM-only
// paths that dereference its undefined fields stay unsupported, see
// shim.ts). Import statements above are hoisted ahead of this call in
// every module system this library ships under (ESM order and Babel's
// CJS interop alike), so the shim's global patches still precede
// survey-core's require-time code, and this statement runs strictly
// after both.
import { settings, _setIsTouch } from 'survey-core';
import { applySurveyCoreShims } from './shim';

applySurveyCoreShims(settings);

// 2.1 device-mode adapter (design D3): RN aliases window===global with no
// touch-event/matchMedia surface, so core's IsTouch computes FALSE and
// DropdownListModel picks DESKTOP popup behavior (search availability,
// tagbox cancel-rollback). `_setIsTouch(true)` is the pinned-2.5.33 seam
// (utils/devices.ts "for tests" — watchlisted; behaviorally covered by
// the 2.1 suites). Idempotent, applied once at facade evaluation.
_setIsTouch(true);
