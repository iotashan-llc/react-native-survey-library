/**
 * Native lifecycle bridge — shared types (design:
 * docs/design/1.2-lifecycle-bridge.md, A15).
 *
 * These types are the API contract between:
 * - `<Survey>` (task 1.1): installs the bridge, registers the ScrollView
 *   scroll host, and provides the registry via `LifecycleContext`;
 * - focusable components (1.5/1.7+): register `ElementHandle`s from the
 *   0.4 captured-pair mounted hooks (`QuestionElementBase.
 *   onQuestionMounted`/`onQuestionWillUnmount`);
 * - the bridge itself (`installLifecycleBridge`): intercepts
 *   `survey.onScrollToTop` and drives native scroll + focus through the
 *   registered handles.
 */
import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { Base, PageModel, PanelModel, Question } from '../core/facade';

/**
 * Consumer-facing scroll consultation (design doc, piece 2 "Consumer
 * parity" — the "1.1-level event prop that the bridge consults"). 1.1's
 * `<Survey onScrollToElement>` prop is built on this seam.
 */
export interface ScrollRequestInfo {
  /** The model whose handle the bridge resolved (page when falling back). */
  element: Base;
  /**
   * The question the funnel entry carried, if any. NOTE: non-null does
   * NOT imply focus intent — `panel.expand()` also fires with a question
   * attached but is scroll-only; the bridge discriminates focus intent
   * separately (caller shape: `elementId === question.id`).
   */
  question: Question | null;
  page: PageModel | null;
  /** True when the exact target was unregistered and its page matched. */
  viaPageFallback: boolean;
}

/**
 * Models that may own a registered native container. Keyed by model
 * INSTANCE (never by name — names are not unique across pages/panels and
 * a model swap must not leak stale handles).
 */
export type RegistrableElement = Question | PanelModel | PageModel;

/**
 * A registered element's native surface.
 *
 * - `containerRef` — the question/panel/page container `<View>`; the
 *   scroll host measures it to compute the scroll target.
 * - `focusFirst` — supplied by input-bearing components only
 *   (`TextInput.focus()` etc.). Returns whether focus was INITIATED
 *   (the input exists and `.focus()` was called); the bridge falls back
 *   to `a11yFocus` when absent or `false`.
 *
 *   FOCUS-EVENT OWNERSHIP CONTRACT: the bridge never calls
 *   `question.focusIn()` — a synchronous return value cannot prove the
 *   async native focus landed. The component that implements
 *   `focusFirst` MUST fire `question.focusIn()` from its input's actual
 *   `onFocus` handler (web parity: survey-react-ui drives focusIn from
 *   the bubbling DOM focus event). Fire it from `onFocus` ONLY — never
 *   from `focusFirst` itself — so programmatic focus (bridge-initiated)
 *   and user taps both fire it exactly once per focus, with no
 *   double-fire when the bridge initiates and the native event follows.
 * - `a11yFocus` — accessibility focus on the container
 *   (`AccessibilityInfo.setAccessibilityFocus`) so screen readers land on
 *   e.g. an errored non-input question. Not an input focus: no focusIn.
 */
export interface ElementHandle {
  containerRef: RefObject<View | null>;
  focusFirst?: () => boolean;
  a11yFocus?: () => void;
}

/** A measured scroll target, in scroll-host content coordinates. */
export interface TargetMeasurement {
  y: number;
  height: number;
}

/** The scroll host's current visible window, in content coordinates. */
export interface ScrollHostViewport {
  offsetY: number;
  height: number;
}

/**
 * The Survey root's ScrollView, registered once per survey by 1.1.
 * Nested scroll hosts (paneldynamic internal lists) are M2+ (design doc,
 * "What the bridge deliberately does NOT do").
 *
 * - `measureTarget` resolves `null` when the target can't be measured
 *   (unmounted between request and measure) — the bridge treats that as a
 *   skipped scroll, never a throw.
 * - `getViewport` powers the `scrollIfVisible` semantic (skip the scroll
 *   when the target is already fully visible); a host that can't report
 *   its viewport returns `null` and the bridge scrolls unconditionally.
 */
export interface ScrollHostHandle {
  scrollTo(y: number, animated: boolean): void;
  measureTarget(
    containerRef: RefObject<View | null>
  ): Promise<TargetMeasurement | null>;
  getViewport(): ScrollHostViewport | null;
}

/**
 * Result of the registry's scroll-target lookup (design doc, "Lookup
 * order"): exact model instance → its `page` (question not registered,
 * e.g. virtualized away) → `null` (+ once-per-instance diagnostic).
 */
export interface ResolvedScrollTarget {
  /** The model whose handle was resolved (the page when falling back). */
  element: Base;
  handle: ElementHandle;
  /** True when the exact element was unregistered and its page matched. */
  viaPageFallback: boolean;
}

/**
 * Per-survey-instance ref/layout registry (design doc, piece 1). Created
 * by `<Survey>` (via `createLifecycleRegistry`) and provided through
 * `LifecycleContext`; cleared on uninstall (model-swap safety — 0.4's D1
 * pattern at the survey level).
 */
export interface LifecycleRegistry {
  /**
   * Registers an element's native handle; returns the deregister
   * function (called from the 0.4 unmount hook). Re-registering the same
   * instance replaces the handle; a stale deregister (captured before a
   * replacement) must not remove the newer handle.
   */
  registerElement(el: RegistrableElement, handle: ElementHandle): () => void;
  /**
   * Registers THE scroll host (one per survey); returns the deregister
   * function. A second registration replaces the first (last wins) —
   * same stale-deregister rule as `registerElement`.
   */
  registerScrollHost(handle: ScrollHostHandle): () => void;
  /** Exact-instance lookup (no page fallback). */
  getHandle(el: Base): ElementHandle | undefined;
  getScrollHost(): ScrollHostHandle | undefined;
  /**
   * Full lookup-order resolution (exact → page fallback → null). Emits
   * the `target-unregistered` diagnostic (dev-only, once per instance)
   * on a null result for a non-null input.
   */
  resolveScrollTarget(el: Base | null | undefined): ResolvedScrollTarget | null;
  /** Drops all handles + the scroll host (bridge uninstall path). */
  clear(): void;
}

/** Tuning knobs for the bridge (design doc, piece 2). */
export interface LifecycleBridgeOptions {
  /**
   * RN `scrollTo` has no completion callback; focus-intent completion
   * runs after this bounded settle delay (documented approximation).
   * Default 300.
   */
  scrollSettleMs?: number;
  /** Subtracted from the measured target y (sticky header room). Default 0. */
  topInset?: number;
  /**
   * Consulted before every native scroll (design doc, "Consumer
   * parity"). Return `false` to suppress the NATIVE SCROLL ONLY —
   * focus-intent completion STILL RUNS on suppression (focusFirst /
   * a11yFocus initiation; `question.focusIn()` stays component-owned per
   * the `ElementHandle.focusFirst` contract; pinned semantics: web's
   * closest analog is "scroll suppressed but focus happens"). Return
   * `true` (or omit the callback) for the normal scroll path. A throwing
   * callback is contained (logged) and treated as `true`.
   */
  onScrollRequest?: (info: ScrollRequestInfo) => boolean;
}
