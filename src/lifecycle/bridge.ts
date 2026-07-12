/**
 * Native lifecycle bridge — interception core (design:
 * docs/design/1.2-lifecycle-bridge.md, piece 2; A15).
 *
 * Subscribes `survey.onScrollToTop` — the SINGLE funnel for every scroll
 * request in survey-core (invalid-submit error focus, `focusQuestion()`,
 * page-change scroll, panel expand) — and takes native ownership:
 * `options.allow = false` ALWAYS (core never reaches its DOM block or the
 * unguarded `settings.environment` destructure), then asynchronously
 * resolves the target through the registry, scrolls the registered host,
 * and completes focus intent (`question` non-null on the event) via the
 * handle's `focusFirst`/`a11yFocus` + `question.focusIn()`.
 *
 * `<Survey>` (1.1) owns the call sites: install on mount/model-swap,
 * uninstall on swap-out/unmount.
 *
 * NOTE: skeleton commit — signature is the 1.1 API contract; the handler
 * lands in this task's red-green cycle.
 */
import type { SurveyModel } from '../core/facade';
import type { LifecycleBridgeOptions, LifecycleRegistry } from './types';

/**
 * Installs the bridge on `survey`; returns the uninstall function
 * (removes the subscription and clears the registry — post-uninstall
 * events from the old model are inert).
 */
export function installLifecycleBridge(
  _survey: SurveyModel,
  _registry: LifecycleRegistry,
  _options?: LifecycleBridgeOptions
): () => void {
  return () => {};
}
