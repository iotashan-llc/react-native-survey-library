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
