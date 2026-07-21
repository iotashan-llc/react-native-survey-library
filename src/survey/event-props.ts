/**
 * A12 event-prop surface + runtime wiring (design:
 * docs/design/1.1-survey-root.md, "Event props — derived, not
 * hand-listed").
 *
 * Upstream's `updateSurvey` (reactSurvey.tsx) wires any `on*` prop whose
 * model member has `.add` — mechanically, untyped, and it LEAKS host-model
 * subscriptions on unmount. This module ports the mechanism with two
 * corrections: the surface is compiler-derived (below), and
 * `wireModelEventProps(model, current, {})` fully unwires on
 * unmount/model-swap (0.4 deterministic-unsubscribe ethos).
 */
import type { SurveyModel } from '../core/facade';

/**
 * Every `on*` member of `SurveyModel` whose value is EventBase-shaped
 * (`add`/`remove`) becomes an optional prop typed as that event's exact
 * handler. Derived by the COMPILER from the installed survey-core — this
 * is A12's "event props derived from actual EventBase members"; upstream
 * drift surfaces as type errors, never silent gaps. (`never`-typed
 * handler params exploit method-position bivariance to match every
 * `EventBase<T, O>` instantiation.)
 */
export type SurveyModelEventProps = {
  [
    K in keyof SurveyModel as K extends `on${string}`
      ? SurveyModel[K] extends {
          add(handler: never): void;
          remove(handler: never): void;
        }
        ? K
        : never
      : never
  ]?: SurveyModel[K] extends { add(handler: infer H): void } ? H : never;
};

export type ModelEventHandler = (sender: unknown, options: unknown) => void;
export type ExtractedEventProps = Readonly<Record<string, ModelEventHandler>>;

interface EventLike {
  add(handler: ModelEventHandler): void;
  remove(handler: ModelEventHandler): void;
}

function asEventLike(value: unknown): EventLike | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as EventLike).add === 'function' &&
    typeof (value as EventLike).remove === 'function'
  ) {
    return value as EventLike;
  }
  return null;
}

/**
 * Filters a props record down to the model-event candidates: `on*` keys
 * with function values. `onScrollToElement` and `onLinkPress` are
 * EXCLUDED — RN-level props (the 1.2 bridge consult seam and the
 * `LinkPressContext` link-event seam respectively), not model events.
 */
export function extractModelEventProps(
  props: Record<string, unknown>
): ExtractedEventProps {
  const out: Record<string, ModelEventHandler> = {};
  for (const key of Object.keys(props)) {
    if (
      !key.startsWith('on') ||
      key === 'onScrollToElement' ||
      key === 'onLinkPress'
    )
      continue;
    const value = props[key];
    if (typeof value === 'function') {
      out[key] = value as ModelEventHandler;
    }
  }
  return out;
}

/**
 * Identity-diffed add/remove against the model's EventBase members.
 * Consumer functions are subscribed RAW so remove-by-identity works.
 * `wireModelEventProps(model, current, {})` = full unwire.
 */
export function wireModelEventProps(
  model: SurveyModel,
  prev: ExtractedEventProps,
  next: ExtractedEventProps
): void {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const host = model as unknown as Record<string, unknown>;
  for (const key of keys) {
    const previous = prev[key];
    const upcoming = next[key];
    if (previous === upcoming) continue;
    const event = asEventLike(host[key]);
    if (!event) continue;
    if (previous) event.remove(previous);
    if (upcoming) event.add(upcoming);
  }
}
