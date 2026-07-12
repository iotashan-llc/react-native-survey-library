/**
 * Renderer-relevant survey-core API-surface watchlist + classified-drift
 * diff (design: docs/design/0.8-parity-harness.md, A12). Mirrors 0.5's
 * `factories/manifest.ts` pattern: a committed, hand-curated table + a
 * pure diff function (unit-tested with synthetic fixtures) + a live
 * harvester exercised by `src/core/__tests__/api-surface.test.ts` against
 * the actually-installed survey-core.
 *
 * Scope: every survey-core class/singleton member this library's SOURCE
 * (production code and its own tests) currently imports through the
 * facade and calls — NOT a full enumeration of survey-core's public API.
 * A member outside this table is, by construction, out of scope and
 * never surfaced. Extend `API_SURFACE_WATCHLIST` whenever a later
 * milestone starts calling a NEW survey-core member.
 *
 * Deliberately excluded (see design doc): `Serializer.getChildrenClasses`
 * and `ComponentCollection.Instance.add`/`.remove`, already exercised
 * live by 0.5's `manifest.test.ts` — not duplicated here. Also excluded:
 * `IPropertyValueChangedEvent`/`IPropertyArrayValueChangedEvent` — type-only
 * interfaces, erased at runtime, nothing to reflect on; their real shape
 * is exercised behaviorally by 0.4's `SurveyElementBase.test.tsx`.
 */
import type * as FacadeModule from './facade';

export type MemberKind = 'method' | 'accessor';
export type HarvestedKind = MemberKind | 'missing';

export interface WatchedApiMember {
  /** Stable id for reporting, e.g. "Base.addOnPropertyValueChangedCallback". */
  id: string;
  /** Property key to look up on the resolved host. */
  member: string;
  expectedKind: MemberKind;
  /**
   * Resolves the prototype (or singleton) object `member` should be found
   * on. Wrapped in try/catch by `harvestApiSurface` — a resolver that
   * throws (e.g. because the top-level export itself is gone) is reported
   * as `'missing'`, never a crash.
   */
  resolveHost: (sc: typeof FacadeModule) => unknown;
  /** Why the renderer depends on this member (design-doc traceability). */
  reason: string;
}

export interface HarvestedApiMember {
  id: string;
  kind: HarvestedKind;
}

export interface ApiDriftReport {
  /** Watched member is gone — the renderer's call/read site would throw. */
  breaking: string[];
  /** Watched member is still present but its shape changed — needs a look. */
  relevant: string[];
}

/**
 * Walks the prototype chain from `host` looking for an OWN property
 * descriptor named `member` — ownership is not always where you'd guess
 * (e.g. `Question.prototype.getTemplate`'s own property actually lives on
 * `Base.prototype`; `Question.prototype.name` is owned by an intermediate
 * `SurveyElement` class) — a leaf-only check would false-positive
 * "missing" on legitimately-inherited members.
 */
function descriptorKind(host: unknown, member: string): HarvestedKind {
  let current: object | null = host as object | null;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, member);
    if (descriptor) {
      if (typeof descriptor.value === 'function') return 'method';
      if (typeof descriptor.get === 'function') return 'accessor';
      return 'accessor';
    }
    current = Object.getPrototypeOf(current);
  }
  return 'missing';
}

/**
 * Reflects on the survey-core resolved through the facade `sc` at call
 * time, reporting each watched member's CURRENT kind (or `'missing'`).
 * Pure with respect to `sc` — reads only, never mutates.
 */
export function harvestApiSurface(
  sc: typeof FacadeModule,
  watchlist: readonly WatchedApiMember[] = API_SURFACE_WATCHLIST
): HarvestedApiMember[] {
  return watchlist.map((entry) => {
    let host: unknown;
    try {
      host = entry.resolveHost(sc);
    } catch {
      return { id: entry.id, kind: 'missing' as const };
    }
    if (host === null || host === undefined) {
      return { id: entry.id, kind: 'missing' as const };
    }
    return { id: entry.id, kind: descriptorKind(host, entry.member) };
  });
}

/**
 * Pure classification: no survey-core access, unit-testable with
 * synthetic fixtures. `breaking` = watched member gone; `relevant` =
 * present but shape changed. Anything not on `watchlist` never appears —
 * that's the "irrelevant" bucket, enforced by scope rather than logic.
 */
export function diffApiSurface(
  watchlist: readonly WatchedApiMember[],
  harvested: readonly HarvestedApiMember[]
): ApiDriftReport {
  const harvestedById = new Map(harvested.map((h) => [h.id, h.kind]));
  const breaking: string[] = [];
  const relevant: string[] = [];
  for (const entry of watchlist) {
    const liveKind = harvestedById.get(entry.id) ?? 'missing';
    if (liveKind === entry.expectedKind) continue;
    const message = `${entry.id}: expected ${entry.expectedKind}, found ${liveKind} (${entry.reason})`;
    if (liveKind === 'missing') {
      breaking.push(message);
    } else {
      relevant.push(message);
    }
  }
  return { breaking: breaking.sort(), relevant: relevant.sort() };
}

export const API_SURFACE_WATCHLIST: readonly WatchedApiMember[] = [
  {
    id: 'Base.addOnPropertyValueChangedCallback',
    member: 'addOnPropertyValueChangedCallback',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Base.prototype,
    reason:
      'SurveyElementBase subscribes to model property-value-changed notifications (design 0.4-reactive-base).',
  },
  {
    id: 'Base.removeOnPropertyValueChangedCallback',
    member: 'removeOnPropertyValueChangedCallback',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Base.prototype,
    reason: 'SurveyElementBase unsubscribes on unmount/element swap.',
  },
  {
    id: 'Base.addOnArrayChangedCallback',
    member: 'addOnArrayChangedCallback',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Base.prototype,
    reason:
      'SurveyElementBase subscribes to array-valued property change notifications.',
  },
  {
    id: 'Base.removeOnArrayChangedCallback',
    member: 'removeOnArrayChangedCallback',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Base.prototype,
    reason: 'SurveyElementBase unsubscribes on unmount/element swap.',
  },
  {
    id: 'Question.getTemplate',
    member: 'getTemplate',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Question.prototype,
    reason:
      'Dispatch-key resolution + UnsupportedQuestion diagnostics (design 0.5-factories).',
  },
  {
    id: 'Question.getComponentName',
    member: 'getComponentName',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Question.prototype,
    reason: 'Renderer-route dispatch key resolution (design 0.5-factories).',
  },
  {
    id: 'Question.isDefaultRendering',
    member: 'isDefaultRendering',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Question.prototype,
    reason:
      'Selects the template vs. renderer dispatch route (design 0.5-factories).',
  },
  {
    id: 'Question.getType',
    member: 'getType',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Question.prototype,
    reason:
      'Diagnostics payloads (unsupported-question-type, custom-widget-ignored).',
  },
  {
    id: 'Question.customWidget',
    member: 'customWidget',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Question.prototype,
    reason:
      "QuestionElementBase's mounted-hook custom-widget-ignored diagnostic (design 0.5-factories, RN divergence).",
  },
  {
    id: 'Question.isInputReadOnly',
    member: 'isInputReadOnly',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Question.prototype,
    reason: 'QuestionElementBase.isDisplayMode fallback.',
  },
  {
    id: 'Question.name',
    member: 'name',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Question.prototype,
    reason: 'Diagnostics payload `name` field.',
  },
  {
    id: 'Model.getQuestionByName',
    member: 'getQuestionByName',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Model.prototype,
    reason:
      'Universal fixture + consumer lookup path exercised throughout the test suite.',
  },
  {
    id: 'LocalizableString.renderedHtml',
    member: 'renderedHtml',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.LocalizableString.prototype,
    reason: 'SurveyElementBase.renderLocString fallback rendering.',
  },
  {
    id: 'RendererFactory.registerRenderer',
    member: 'registerRenderer',
    expectedKind: 'method',
    resolveHost: (sc) => sc.RendererFactory.Instance,
    reason: 'register-all.ts renderer-route dual registration.',
  },
  {
    id: 'RendererFactory.unregisterRenderer',
    member: 'unregisterRenderer',
    expectedKind: 'method',
    resolveHost: (sc) => sc.RendererFactory.Instance,
    reason:
      'Test cleanup for renderer-route registration (register-all.test.tsx).',
  },
];
