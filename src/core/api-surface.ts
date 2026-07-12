/**
 * Renderer-relevant survey-core API-surface watchlist + classified-drift
 * diff (design: docs/design/0.8-parity-harness.md, A12). Mirrors 0.5's
 * `factories/manifest.ts` pattern: a committed, hand-curated table + a
 * pure diff function (unit-tested with synthetic fixtures) + a live
 * harvester exercised by `src/core/__tests__/api-surface.test.ts` against
 * the actually-installed survey-core.
 *
 * Scope: every survey-core class/singleton member this library's
 * PRODUCTION source binds to through the facade, plus two explicitly
 * named cross-cutting design-contract/test-infrastructure observables
 * (`Model.getQuestionByName` — the universal fixture lookup every suite
 * builds on; `Base.hasActiveUISubscribers` — the ONLY observable of 0.4's
 * subscription-leak contract). NOT a full enumeration of survey-core's
 * public API. A member outside this table is, by construction, out of
 * scope and never surfaced. Extend `API_SURFACE_WATCHLIST` whenever a
 * later milestone's PRODUCTION code starts binding to a NEW survey-core
 * member.
 *
 * Deliberately excluded (see design doc for the full rationale):
 * - `Serializer.getChildrenClasses`, `ComponentCollection.Instance.add`/
 *   `.remove` — already exercised live by 0.5's `manifest.test.ts`.
 * - `IPropertyValueChangedEvent`/`IPropertyArrayValueChangedEvent` —
 *   type-only interfaces, erased at runtime, nothing to reflect on; their
 *   real shape is exercised behaviorally by 0.4's tests.
 * - Fixture-CHOICE test bindings (`Question.indent`/`readOnly`,
 *   checkbox `choices`, the shim smoke test's
 *   `getValue`/`setValue`/`state`/`currentPageNo`/`completeLastPage`,
 *   `CustomWidgetCollection.Instance.clear`/`.addCustomWidget`) — each is
 *   read/written by exactly one suite that fails loudly on its own if the
 *   member drifts; they are interchangeable exercise props, not renderer
 *   dependencies.
 *
 * Two documented limits of the mechanism itself:
 * - `member` is a plain `string`: no current renderer binding is
 *   Symbol-keyed. If a future binding reads a Symbol-keyed member, widen
 *   `WatchedApiMember.member` (and the walk) then.
 * - Signature/semantic changes WITHIN a surviving function (arity,
 *   argument meaning, return shape) are invisible to this reflection gate
 *   by design — the behavioral suites (0.3 shim smoke, 0.4 reactivity,
 *   0.5 registration) own those.
 */
import type * as FacadeModule from './facade';

export type MemberKind = 'method' | 'accessor' | 'data';
export type HarvestedKind = MemberKind | 'setter-only' | 'missing';

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
 *
 * Every descriptor shape maps to a DISTINCT kind — there is no default
 * bucket. A descriptor is either an accessor descriptor (get/set) or a
 * data descriptor (value), never both:
 * - getter present (with or without a setter) -> `'accessor'`
 * - setter WITHOUT a getter -> `'setter-only'` (reads yield undefined)
 * - function-valued data descriptor -> `'method'`
 * - any other data descriptor (including `value: undefined`) -> `'data'`
 * A catch-all here would let a real downgrade (accessor replaced by a
 * plain data property or a setter-only stub) masquerade as an unchanged
 * accessor and keep the live gate green.
 */
function descriptorKind(host: unknown, member: string): HarvestedKind {
  let current: object | null = host as object | null;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, member);
    if (descriptor) {
      if (typeof descriptor.get === 'function') return 'accessor';
      if (typeof descriptor.set === 'function') return 'setter-only';
      if (typeof descriptor.value === 'function') return 'method';
      return 'data';
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
 * synthetic fixtures. Anything not on `watchlist` never appears — that's
 * the "irrelevant" bucket, enforced by scope rather than logic.
 *
 * `breaking` — the watched member's read/call contract is structurally
 * dead at the binding site:
 * - `'missing'`: the call/read would throw or the member is simply gone.
 * - `'setter-only'`: every read yields undefined — the binding is dead
 *   even though a descriptor still exists.
 * - `'data'` where computed behavior was expected (`method`/`accessor`):
 *   a method call site throws (`x.f is not a function`); an accessor read
 *   silently returns a frozen/undefined value with the getter's logic
 *   gone — silent misbehavior, treated at breaking severity.
 *
 * `relevant` — the member survives WITH computed/callable behavior but in
 * a different shape (method <-> accessor swaps, or an expected plain data
 * member that became computed): the binding won't structurally die, but a
 * human needs to review the call/read site.
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
    const isBreaking =
      liveKind === 'missing' ||
      liveKind === 'setter-only' ||
      (liveKind === 'data' && entry.expectedKind !== 'data');
    if (isBreaking) {
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
    id: 'Question.title',
    member: 'title',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Question.prototype,
    reason:
      "UnsupportedQuestion's default presentation heading (components/UnsupportedQuestion.tsx).",
  },
  {
    id: 'QuestionCustomWidget.name',
    member: 'name',
    // A TS constructor parameter-property: an OWN data property on each
    // INSTANCE, not on the prototype — so the host is a freshly
    // constructed probe instance. Verified side-effect-free against the
    // installed package: the constructor only assigns instance fields and
    // does NOT register into CustomWidgetCollection.
    expectedKind: 'data',
    resolveHost: (sc) =>
      new sc.QuestionCustomWidget('__api-surface-probe__', {}),
    reason:
      "QuestionElementBase's custom-widget-ignored diagnostic reads widget.name (reactivity/QuestionElementBase.tsx).",
  },
  {
    id: 'Base.hasActiveUISubscribers',
    member: 'hasActiveUISubscribers',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Base.prototype,
    reason:
      "The ONLY observable of 0.4's subscription-leak contract — SurveyElementBase's subscribe/unsubscribe tests are built entirely on this getter (design 0.4-reactive-base).",
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
  // ------------------------------------------------------------------
  // Task 1.1 <Survey> root bindings (design: docs/design/1.1-survey-root.md).
  // NOT listed despite being production bindings: `SurveyModel.
  // renderCallback` (write-only assignment) and `SurveyModel.
  // pageComponent` (read with `|| 'sv-page'` fallback) — both are bare
  // TS field declarations with NO runtime descriptor on the prototype OR
  // a fresh instance (verified against 2.5.33), so reflection would
  // report a false 'missing'; the Survey behavioral suites own them.
  // ------------------------------------------------------------------
  {
    id: 'SurveyModel.applyTheme',
    member: 'applyTheme',
    expectedKind: 'method',
    resolveHost: (sc) => sc.SurveyModel.prototype,
    reason:
      "<Survey>'s theme prop keeps model-side derived state consistent (design 1.1-survey-root, 'Theme').",
  },
  {
    id: 'SurveyModel.scrollToTopOnPageChange',
    member: 'scrollToTopOnPageChange',
    expectedKind: 'method',
    resolveHost: (sc) => sc.SurveyModel.prototype,
    reason:
      "The page-change render-complete call that re-enters the scroll funnel (design 1.2-lifecycle-bridge, 'Sequencing').",
  },
  {
    id: 'SurveyModel.state',
    member: 'state',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.SurveyModel.prototype,
    reason: "Survey root's running/starting vs completion-state render switch.",
  },
  {
    id: 'SurveyModel.activePage',
    member: 'activePage',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.SurveyModel.prototype,
    reason:
      'Page dispatch target + page-change detection in SurveyRoot.componentDidUpdate.',
  },
  {
    id: 'SurveyModel.focusQuestion',
    member: 'focusQuestion',
    expectedKind: 'method',
    resolveHost: (sc) => sc.SurveyModel.prototype,
    reason: 'SurveyRefHandle.focusQuestion delegate.',
  },
  {
    id: 'SurveyModel.setIsMobile',
    member: 'setIsMobile',
    expectedKind: 'method',
    resolveHost: (sc) => sc.SurveyModel.prototype,
    reason:
      "Responsive ownership: root onLayout width < 600 -> setIsMobile (design 0.7-theme-rn, 'Responsive ownership').",
  },
  {
    id: 'SurveyModel.dispose',
    member: 'dispose',
    expectedKind: 'method',
    resolveHost: (sc) => sc.SurveyModel.prototype,
    reason:
      'Owned-model dispose on unmount/json-swap (promoted from the fixture-exclusion list: production binds it as of 1.1).',
  },
  {
    id: 'Base.isDisposed',
    member: 'isDisposed',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Base.prototype,
    reason:
      'Dispose idempotence guard + StrictMode remount-simulation recovery (design 1.1-survey-root).',
  },
  {
    id: 'Helpers.isTwoValueEquals',
    member: 'isTwoValueEquals',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Helpers,
    reason:
      'json prop deep-equality change detection (upstream reactSurvey.tsx parity).',
  },
  {
    id: 'EventBase.add',
    member: 'add',
    expectedKind: 'method',
    resolveHost: (sc) => sc.EventBase.prototype,
    reason:
      "Event-prop wiring subscribes consumer handlers (design 1.1-survey-root, 'Event props').",
  },
  {
    id: 'EventBase.remove',
    member: 'remove',
    expectedKind: 'method',
    resolveHost: (sc) => sc.EventBase.prototype,
    reason:
      'Event-prop wiring unsubscribes on identity swap/model swap/unmount.',
  },
];
