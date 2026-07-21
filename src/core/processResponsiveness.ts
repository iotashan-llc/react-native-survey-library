/**
 * Shared responsiveness adapter (design R3, tasks 2.5b buttongroup +
 * 2.5c rating auto-collapse).
 *
 * CORE owns the compact decision. `Question.processResponsiveness`
 * (protected in the typings) applies the ±2 deadband, rounds
 * availableWidth but NOT requiredWidth, and flips `renderAs` between its
 * `getCompactRenderAs()` and `getDesktopRenderAs()`. It is gated by the
 * question's OWN `displayMode`/`supportResponsiveness`, so `"buttons"` and
 * `"dropdown"` ratings never flip and only `"auto"` flips both directions
 * — the renderer just measures and feeds; it never decides.
 *
 * This module is the ONE place the protected-API cast lives (R3 — "do not
 * re-cast"); ButtonGroupQuestion and the rating renderers both import
 * `callProcessResponsiveness` from here. Behavior is pinned in
 * `core/__tests__/process-responsiveness-compat.test.ts`.
 *
 * No survey-core runtime import — only the `Question` TYPE from the facade
 * (the import contract governs runtime survey-core access; a type-only
 * import carries no runtime edge).
 */
import type { Question } from './facade';

/**
 * THE single protected-API cast. Core's `Question.processResponsiveness`
 * owns the compact decision; the caller pre-rounds both widths (core
 * rounds only availableWidth). Watchlisted as
 * `Question.processResponsiveness`.
 */
export function callProcessResponsiveness(
  question: Question,
  requiredWidth: number,
  availableWidth: number
): boolean {
  return (
    question as unknown as {
      processResponsiveness(r: number, a: number): boolean;
    }
  ).processResponsiveness(requiredWidth, availableWidth);
}

/** Finite, rounded, positive — or null (never fed to the adapter). */
function normalizeWidth(width: number): number | null {
  if (!Number.isFinite(width)) return null;
  const rounded = Math.round(width);
  return rounded > 0 ? rounded : null;
}

/**
 * Measurement → `processResponsiveness` engine shared by the rating
 * auto-collapse renderers. It replicates buttongroup 2.5b's caller-side
 * gates — both widths known, rounded before the call, changed-pair
 * dedupe, design mode never compacts, and invalid-width invalidation (an
 * invalid sample of either dimension CLEARS that dimension + the dedupe
 * pair so processing PAUSES until a fresh valid sample arrives instead of
 * running with stale geometry; deadlock-safe because invalid→valid is a
 * real layout change that RN re-fires).
 *
 * WHY a class carried per-question (see the WeakMap below) rather than
 * per-component like buttongroup: the rating dispatch splits into two
 * components — `RatingQuestion` (buttons) and `RatingDropdownQuestion`
 * (collapsed) — and an auto-collapse SWAPS them. A component-local cache
 * would die with the unmounting component, so the cached required + live
 * available widths live on a per-QUESTION measurer that survives the swap
 * — the two-component analog of buttongroup's single self-branching
 * instance. RatingQuestion establishes the required width from its visible
 * ScrollView; the collapsed control reuses that carried value and only
 * measures the live available width, so a widen flips back without a fresh
 * content event (buttongroup's "cached required width" pin).
 */
export class ResponsivenessMeasurer {
  private cachedRequiredWidth: number | null = null;
  private liveAvailableWidth: number | null = null;
  private lastCalledRequired: number | null = null;
  private lastCalledAvailable: number | null = null;

  constructor(private readonly question: Question) {}

  /** The live viewport width from the always-mounted wrapper's onLayout. */
  reportAvailableWidth(rawWidth: number): void {
    const width = normalizeWidth(rawWidth);
    if (width === null) {
      this.liveAvailableWidth = null;
      this.resetDedupe();
      return;
    }
    this.liveAvailableWidth = width;
    this.maybeProcess();
  }

  /** The intrinsic row width from the buttons ScrollView's
   * onContentSizeChange (buttons view only — carried for the collapsed
   * control's flip-back). */
  reportRequiredWidth(rawWidth: number): void {
    const width = normalizeWidth(rawWidth);
    if (width === null) {
      this.cachedRequiredWidth = null;
      this.resetDedupe();
      return;
    }
    this.cachedRequiredWidth = width;
    this.maybeProcess();
  }

  private resetDedupe(): void {
    this.lastCalledRequired = null;
    this.lastCalledAvailable = null;
  }

  private maybeProcess(): void {
    const required = this.cachedRequiredWidth;
    const available = this.liveAvailableWidth;
    if (required === null || available === null) return;
    // Design mode never compacts (web parity: `needResponsiveness()`
    // excludes design mode; core's `processResponsiveness` itself does NOT
    // — probe-verified — so the gate is caller-side, as in buttongroup).
    if ((this.question as unknown as { isDesignMode?: boolean }).isDesignMode) {
      return;
    }
    if (
      required === this.lastCalledRequired &&
      available === this.lastCalledAvailable
    ) {
      return;
    }
    this.lastCalledRequired = required;
    this.lastCalledAvailable = available;
    callProcessResponsiveness(this.question, required, available);
  }
}

const measurers = new WeakMap<Question, ResponsivenessMeasurer>();

/**
 * The per-question measurer (created on first use). Keyed by question
 * identity so the cached widths survive the RatingQuestion ↔
 * RatingDropdownQuestion swap and are GC'd with the question.
 */
export function getResponsivenessMeasurer(
  question: Question
): ResponsivenessMeasurer {
  let measurer = measurers.get(question);
  if (!measurer) {
    measurer = new ResponsivenessMeasurer(question);
    measurers.set(question, measurer);
  }
  return measurer;
}
