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
 *   checkbox `choices`, `Model.dispose`, the shim smoke test's
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
  {
    id: 'SurveyModel.onScrollToTop',
    member: 'onScrollToTop',
    // Assigned in the SurveyModel constructor (`this.addEvent()`), so an
    // OWN data property on each INSTANCE — probed on a minimal empty
    // model, same pattern as the QuestionCustomWidget probe above.
    expectedKind: 'data',
    resolveHost: (sc) => new sc.Model(undefined),
    reason:
      'The lifecycle bridge subscribes the single scroll/focus funnel here (design 1.2-lifecycle-bridge, A15).',
  },
  // Task 1.5 (design: docs/design/1.5-icon-actionbutton.md) — RNIcon's
  // resolution seams. Runtime kinds verified against the installed
  // v2.5.33 package.
  // The two module-LEVEL members resolve off the facade namespace, where
  // babel's `export * from 'survey-core'` re-exports every binding as a
  // GETTER — so their kind through the facade is 'accessor', regardless
  // of the member's kind on survey-core's own exports object.
  {
    id: 'getIconNameFromProxy',
    member: 'getIconNameFromProxy',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc,
    reason:
      "RNIcon's ONLY name-mapping path (settings.customIcons remap + renamedIcons legacy/size-suffix mapping) — components/icon-resolution.ts.",
  },
  {
    id: 'SvgThemeSets',
    member: 'SvgThemeSets',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc,
    reason:
      'Raw consumer icon strings stored by SvgRegistry.registerIcon — icon-resolution lookup path 1.',
  },
  {
    id: 'settings.customIcons',
    member: 'customIcons',
    expectedKind: 'data',
    resolveHost: (sc) => sc.settings,
    reason:
      'The icon-replacement remap getIconNameFromProxy consults; documented consumer surface for icon swaps.',
  },
  {
    id: 'SvgIconRegistry.icons',
    member: 'icons',
    expectedKind: 'data',
    resolveHost: (sc) => sc.SvgRegistry,
    reason:
      'Symbol-wrapped consumer registrations — icon-resolution lookup path 2 (unwrapped back to <svg>).',
  },
  {
    id: 'SvgIconRegistry.onIconsChanged',
    member: 'onIconsChanged',
    expectedKind: 'data',
    resolveHost: (sc) => sc.SvgRegistry,
    reason:
      "RNIcon's registry-liveness subscription (late registerIcons() calls re-render mounted icons).",
  },
  {
    id: 'EventBase.add',
    member: 'add',
    expectedKind: 'method',
    resolveHost: (sc) => sc.EventBase.prototype,
    reason:
      "Lifecycle bridge install subscribes onScrollToTop; RNIcon's onIconsChanged subscribe (componentDidMount).",
  },
  {
    id: 'EventBase.remove',
    member: 'remove',
    expectedKind: 'method',
    resolveHost: (sc) => sc.EventBase.prototype,
    reason:
      "Lifecycle bridge uninstall unsubscribes onScrollToTop; RNIcon's onIconsChanged unsubscribe (componentWillUnmount).",
  },
  {
    id: 'Question.focusIn',
    member: 'focusIn',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Question.prototype,
    reason:
      'Focus-event ownership contract: components fire it from their native input onFocus (ElementHandle.focusFirst contract; web drives this from a DOM focus-bubble handler).',
  },
  {
    id: 'Question.inputId',
    member: 'inputId',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Question.prototype,
    reason:
      "Focus-intent discrimination depends on the panel-expand caller passing id: q.inputId (distinct from question.id) — the bridge treats only elementId === question.id as focus intent (design 1.2-lifecycle-bridge, 'Focus-intent discrimination').",
  },
  {
    id: 'Question.page',
    member: 'page',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Question.prototype,
    reason:
      "Registry owning-page fallback: resolveScrollTarget reads `.page` off an unregistered question to fall back to its registered page handle (design 1.2-lifecycle-bridge, 'Lookup order').",
  },
  {
    id: 'PanelModel.page',
    member: 'page',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.PanelModel.prototype,
    reason:
      'Registry owning-page fallback for registered panels (same lookup order as Question.page).',
  },
  {
    id: 'SurveyModel.focusQuestionInfo',
    member: 'focusQuestionInfo',
    // PRIVATE in the TS declarations (called via cast) but a plain
    // prototype method at runtime — this row is the drift gate for that
    // documented private-API dependency (review round 2 #3).
    expectedKind: 'method',
    resolveHost: (sc) => sc.SurveyModel.prototype,
    reason:
      "1.1's render-complete seam mirrors afterRenderPage (survey.ts:5514-5519): while focusingQuestionInfo is parked it calls focusQuestionInfo() to execute the cross-page focus (design 1.2-lifecycle-bridge, 'Cross-page focus').",
  },
  {
    id: 'SurveyModel.scrollToTopOnPageChange',
    member: 'scrollToTopOnPageChange',
    expectedKind: 'method',
    resolveHost: (sc) => sc.SurveyModel.prototype,
    reason:
      "The other branch of 1.1's render-complete seam: no parked focus → scrollToTopOnPageChange() re-enters the funnel with the page shape.",
  },
  {
    id: 'settings.environment',
    member: 'environment',
    // A data field on the settings singleton — undefined in RN until the
    // facade's 1.2 stub fills it (the key itself is always present).
    expectedKind: 'data',
    resolveHost: (sc) => sc.settings,
    reason:
      "The shim's 1.2 amendment stubs it so destructures of the environment object itself survive (NARROW contract — DOM-only field dereferences stay unsupported; design 1.2-lifecycle-bridge, piece 3).",
  },
  // Task 1.5 — the Action members ActionButton binds (accessor entries
  // resolve through BaseAction.prototype via descriptorKind's prototype
  // walk).
  {
    id: 'Action.doAction',
    member: 'doAction',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Action.prototype,
    reason: "ActionButton's onPress path (DOM-shaped event shim).",
  },
  {
    id: 'Action.doMouseDown',
    member: 'doMouseDown',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Action.prototype,
    reason:
      "ActionButton's onPressIn path (mouse-vs-keyboard focus-origin bookkeeping).",
  },
  {
    id: 'Action.doFocus',
    member: 'doFocus',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Action.prototype,
    reason: "ActionButton's onFocus path.",
  },
  {
    id: 'Action.getTooltip',
    member: 'getTooltip',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Action.prototype,
    reason:
      "ActionButton's accessibilityLabel (tooltip || title — covers icon-only buttons).",
  },
  {
    id: 'Action.hasTitle',
    member: 'hasTitle',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason:
      'Model-owned show-title logic ActionButton consumes (never re-derives, invariant 6).',
  },
  {
    id: 'Action.isVisible',
    member: 'isVisible',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason:
      "ActionButton's canRender gate (visible && mode not in {popup, removed}).",
  },
  {
    id: 'Action.disabled',
    member: 'disabled',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason:
      "ActionButton's Pressable disabled + accessibilityState.disabled + recipe disabled input.",
  },
  {
    id: 'Action.iconName',
    member: 'iconName',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason: "ActionButton's RNIcon dispatch.",
  },
  {
    id: 'Action.iconSize',
    member: 'iconSize',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason: "ActionButton's RNIcon size (model default 24).",
  },
  {
    id: 'Action.locTitle',
    member: 'locTitle',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason:
      "ActionButton's title rendering through the inherited renderLocString seam (1.6 upgrades it).",
  },
  // Codex review minor 6: every directly-consumed Action member belongs
  // on the watchlist — runtime kinds verified against installed v2.5.33.
  {
    id: 'Action.active',
    member: 'active',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason:
      "ActionButton's accessibilityState.selected (semantic selection/active flag).",
  },
  {
    id: 'Action.pressed',
    member: 'pressed',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason:
      "ActionButton's pressed VISUAL input (ORed with native pressIn state; never surfaced as selection).",
  },
  {
    id: 'Action.ariaChecked',
    member: 'ariaChecked',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason: "ActionButton's accessibilityState.checked.",
  },
  {
    id: 'Action.ariaExpanded',
    member: 'ariaExpanded',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason: "ActionButton's accessibilityState.expanded.",
  },
  {
    id: 'Action.ariaRole',
    member: 'ariaRole',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason: "ActionButton's accessibilityRole mapping.",
  },
  {
    id: 'Action.ariaLabelledBy',
    member: 'ariaLabelledBy',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason:
      "ActionButton's accessibilityLabelledBy (Android nativeID relationship).",
  },
  {
    id: 'Action.disableTabStop',
    member: 'disableTabStop',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Action.prototype,
    reason: "ActionButton's Pressable focusable gate.",
  },

  // Task 1.6 — LocalizableString renderer + basic survey header.
  {
    id: 'LocalizableString.defaultRenderer',
    member: 'defaultRenderer',
    expectedKind: 'data',
    // Static field on the class itself, not the prototype.
    resolveHost: (sc) => sc.LocalizableString,
    reason:
      "The descriptor table's sv-string-viewer element row must stay equal to core's default renderer key (LocStringViewer.test).",
  },
  {
    id: 'LocalizableString.onStringChanged',
    member: 'onStringChanged',
    expectedKind: 'data',
    // Instance field (initializer, not on the prototype) — probe instance;
    // the constructor only assigns fields (localizablestring.ts:66-69),
    // side-effect-free with a null owner.
    resolveHost: (sc) => new sc.LocalizableString(null as never),
    reason:
      "SurveyLocStringViewer's subscription lifecycle (components/LocStringViewer.tsx).",
  },
  {
    id: 'LocalizableString.hasHtml',
    member: 'hasHtml',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.LocalizableString.prototype,
    reason: 'SurveyLocStringViewer branches plain-Text vs SanitizedHtml on it.',
  },
  {
    id: 'LocalizableString.allowLineBreaks',
    member: 'allowLineBreaks',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.LocalizableString.prototype,
    reason:
      "SurveyLocStringViewer's single-line newline collapsing (upstream --multiline parity).",
  },
  {
    id: 'LocalizableString.renderAs',
    member: 'renderAs',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.LocalizableString.prototype,
    reason:
      "SurveyElementBase.renderLocString's factory dispatch key (reactivity/SurveyElementBase.tsx).",
  },
  {
    id: 'LocalizableString.renderAsData',
    member: 'renderAsData',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.LocalizableString.prototype,
    reason:
      "SurveyElementBase.renderLocString's dispatched model prop (reactivity/SurveyElementBase.tsx).",
  },
  {
    id: 'Model.renderedHasHeader',
    member: 'renderedHasHeader',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "SurveyHeader's render gate (components/SurveyHeader.tsx).",
  },
  {
    id: 'Model.renderedHasTitle',
    member: 'renderedHasTitle',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "SurveyHeader's title-block gate.",
  },
  {
    id: 'Model.renderedHasDescription',
    member: 'renderedHasDescription',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "SurveyHeader's description gate.",
  },
  {
    id: 'Model.renderedHasLogo',
    member: 'renderedHasLogo',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "SurveyHeader's logo gate.",
  },
  {
    id: 'Model.isLogoBefore',
    member: 'isLogoBefore',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: 'SurveyHeader logo/text ordering.',
  },
  {
    id: 'Model.isLogoAfter',
    member: 'isLogoAfter',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: 'SurveyHeader logo/text ordering.',
  },
  {
    id: 'Model.locTitle',
    member: 'locTitle',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: 'SurveyHeader title rendering + LogoImage accessibilityLabel.',
  },
  {
    id: 'Model.locDescription',
    member: 'locDescription',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: 'SurveyHeader description rendering.',
  },
  {
    id: 'Model.locLogo',
    member: 'locLogo',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "LogoImage's URI source (components/LogoImage.tsx).",
  },
  {
    id: 'Model.renderedLogoWidth',
    member: 'renderedLogoWidth',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "LogoImage's numeric width.",
  },
  {
    id: 'Model.renderedLogoHeight',
    member: 'renderedLogoHeight',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "LogoImage's numeric height.",
  },
  {
    id: 'Model.logoFit',
    member: 'logoFit',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "LogoImage's resizeMode mapping.",
  },
  {
    id: 'Model.getElementWrapperComponentName',
    member: 'getElementWrapperComponentName',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Model.prototype,
    reason:
      "SurveyHeader's logo wrapper dispatch key (host extension surface).",
  },
  {
    id: 'Model.getElementWrapperComponentData',
    member: 'getElementWrapperComponentData',
    expectedKind: 'method',
    resolveHost: (sc) => sc.Model.prototype,
    reason:
      "SurveyHeader's logo wrapper data (host-transformable via onElementWrapperComponentData).",
  },
  {
    id: 'Model.navigationBar',
    member: 'navigationBar',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason:
      'SurveyNavigation (task 1.8) maps navigationBar.visibleActions onto ActionButton, per invariant 6 (visibility consumed, never re-derived).',
  },
  {
    id: 'ActionContainer.visibleActions',
    member: 'visibleActions',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.ActionContainer.prototype,
    reason:
      'SurveyNavigation (task 1.8) subscribes navigationBar for add/remove reactivity and renders exactly this filtered list.',
  },
  {
    id: 'BaseAction.id',
    member: 'id',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.BaseAction.prototype,
    reason:
      "SurveyNavigation (task 1.8) keys each ActionButton and maps the Complete button's variant (sd-btn--action) off this id.",
  },
  {
    id: 'Model.showProgressBar',
    member: 'showProgressBar',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "SurveyProgressBar's (task 1.8) render gate.",
  },
  {
    id: 'Model.progressValue',
    member: 'progressValue',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "SurveyProgressBar's (task 1.8) fill-width percentage.",
  },
  {
    id: 'Model.progressText',
    member: 'progressText',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "SurveyProgressBar's (task 1.8) label text.",
  },
  {
    id: 'Model.progressBarAriaLabel',
    member: 'progressBarAriaLabel',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "SurveyProgressBar's (task 1.8) accessibilityLabel.",
  },
  {
    id: 'Model.progressBarType',
    member: 'progressBarType',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason:
      "SurveyProgressBar's (review round 1) percentage-family guard: buttons/TOC types render null + diagnostic.",
  },
  {
    id: 'settings.legacyProgressBarView',
    member: 'legacyProgressBarView',
    expectedKind: 'data',
    resolveHost: (sc) => sc.settings,
    reason:
      'Input to the mirrored pages->buttons progress routing (private progressBarComponentName, survey.ts:2942-2949).',
  },
  {
    id: 'surveyCss.currentType',
    member: 'currentType',
    expectedKind: 'data',
    resolveHost: (sc) => (sc as { surveyCss?: unknown }).surveyCss,
    reason: 'Second input to the mirrored pages->buttons progress routing.',
  },
  {
    id: 'Model.state',
    member: 'state',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: "SurveyStateFrame's (task 1.8) state dispatch switch.",
  },
  {
    id: 'Model.showCompletedPage',
    member: 'showCompletedPage',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason:
      "SurveyStateFrame's (task 1.8) completed-render gate (upstream's own).",
  },
  {
    id: 'Model.processedCompletedHtml',
    member: 'processedCompletedHtml',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason:
      'SurveyStateFrame (task 1.8): fed to SanitizedHtml, author JSON sink.',
  },
  {
    id: 'Model.processedCompletedBeforeHtml',
    member: 'processedCompletedBeforeHtml',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: 'SurveyStateFrame (task 1.8): fed to SanitizedHtml.',
  },
  {
    id: 'Model.processedLoadingHtml',
    member: 'processedLoadingHtml',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason: 'SurveyStateFrame (task 1.8): fed to SanitizedHtml.',
  },
  {
    id: 'Model.locEmptySurveyText',
    member: 'locEmptySurveyText',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Model.prototype,
    reason:
      "SurveyStateFrame's (task 1.8) empty-state text, routed through the reactive locstring viewer (task 1.6 seam).",
  },
  {
    id: 'Question.isReadOnlyStyle',
    member: 'isReadOnlyStyle',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Question.prototype,
    reason:
      "RatingQuestion's (task 1.14) baseRatingState -- STYLE readOnly variant (isReadOnlyStyle), distinct from interaction gating (isInputReadOnly); same split BooleanQuestion documents.",
  },
  {
    id: 'Question.isPreviewStyle',
    member: 'isPreviewStyle',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.Question.prototype,
    reason: "RatingQuestion's (task 1.14) baseRatingState preview variant.",
  },
  {
    id: 'QuestionRatingModel.itemComponent',
    member: 'itemComponent',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason:
      'RatingQuestion (task 1.14) dispatches per-item rendering through RNElementFactory under this key.',
  },
  {
    id: 'QuestionRatingModel.renderedRateItems',
    member: 'renderedRateItems',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason: 'RatingQuestion (task 1.14) iterates this to render items.',
  },
  {
    id: 'QuestionRatingModel.hasMinLabel',
    member: 'hasMinLabel',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason: 'RatingQuestion (task 1.14) min-label render gate.',
  },
  {
    id: 'QuestionRatingModel.hasMaxLabel',
    member: 'hasMaxLabel',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason: 'RatingQuestion (task 1.14) max-label render gate.',
  },
  {
    id: 'QuestionRatingModel.locMinRateDescription',
    member: 'locMinRateDescription',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason: 'RatingQuestion (task 1.14) flanking min-description locstring.',
  },
  {
    id: 'QuestionRatingModel.locMaxRateDescription',
    member: 'locMaxRateDescription',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason: 'RatingQuestion (task 1.14) flanking max-description locstring.',
  },
  {
    id: 'QuestionRatingModel.setValueFromClick',
    member: 'setValueFromClick',
    expectedKind: 'method',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason:
      'RatingQuestion (task 1.14) item-press handler -- consumed as-is (toggle-to-clear + readOnly guard, invariant 6).',
  },
  {
    id: 'QuestionRatingModel.rateValues',
    member: 'rateValues',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason:
      "Star fill-up-to position semantics (review round 1) mirror upstream's private useRateValues() from this public property.",
  },
  {
    id: 'QuestionRatingModel.autoGenerate',
    member: 'autoGenerate',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason:
      'Second half of the mirrored useRateValues() body (rateValues.length && !autoGenerate).',
  },
  {
    id: 'QuestionRatingModel.a11y_input_ariaLabel',
    member: 'a11y_input_ariaLabel',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason:
      "Rating radiogroup row's accessibilityLabel source (review round 1; falls back to processedTitle).",
  },
  {
    id: 'QuestionRatingModel.itemStarIcon',
    member: 'itemStarIcon',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason: "RatingStarItem's (task 1.14) unfilled icon name.",
  },
  {
    id: 'QuestionRatingModel.itemStarIconAlt',
    member: 'itemStarIconAlt',
    expectedKind: 'accessor',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason: "RatingStarItem's (task 1.14) filled icon name.",
  },
  {
    id: 'QuestionRatingModel.getItemSmileyIconName',
    member: 'getItemSmileyIconName',
    expectedKind: 'method',
    resolveHost: (sc) => sc.QuestionRatingModel.prototype,
    reason: "RatingSmileyItem's (task 1.14) icon-name resolution.",
  },
];
