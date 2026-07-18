/**
 * Shared, non-throwing diagnostic seam (design: docs/design/0.5-factories.md,
 * "Diagnostics"). One handler registration + one safe dispatch path, reused
 * by independent mechanisms across the library:
 *
 * - `reportUnsupportedQuestionTypeOnce` — once per (question, dispatchKey):
 *   a `WeakMap<Question, Set<string>>` (a question that later misses a
 *   DIFFERENT key legitimately re-emits; survives StrictMode's harmless
 *   double-invocation of a class component's commit lifecycles because the
 *   key is already recorded by the second pass).
 * - `reportCustomWidgetIgnoredOnce` — once per question, full stop: a
 *   `WeakSet<Question>`, called from `QuestionElementBase`'s mounted-hook
 *   reconcile (RN divergence: DOM custom widgets are won't-support: see
 *   docs/design/0.5-factories.md "Upstream shape").
 * - `<SanitizedHtml>` (design: docs/design/0.9-html-strategy.md) forwards
 *   both the sanitizer's own resource-bound/attribute diagnostics and its
 *   press-time link-revalidation no-ops through this same seam — no second,
 *   parallel dev-warning mechanism.
 *
 * `reportDiagnostic` wraps the registered handler in try/catch — a
 * throwing consumer handler is logged once (`console.error`) and can never
 * break the library's non-throwing rendering guarantee.
 */
import type { Question } from './core/facade';

export interface UnsupportedQuestionTypePayload {
  code: 'unsupported-question-type';
  questionType: string;
  dispatchKey: string;
  template: string;
  componentName: string;
  name: string | undefined;
}

export interface CustomWidgetIgnoredPayload {
  code: 'custom-widget-ignored';
  questionType: string;
  name: string | undefined;
  widgetName: string | undefined;
}

/**
 * theme-rn's bridge (design: docs/design/0.7-theme-rn.md, "Hybrid bridge")
 * — a css-class token present on a live getter's output that no known
 * schema entry (live value or canonical alias) accounts for. Queued
 * during render, flushed post-commit through this seam (dev-only, deduped
 * per (question, token) for the question's lifetime).
 */
export interface UnknownCssTokenPayload {
  code: 'theme-rn-unknown-css-token';
  token: string;
  questionName: string | undefined;
  questionType: string;
}

/**
 * theme-core's resolver diagnostics AND theme-rn's shadow-mapper
 * diagnostics (design: docs/design/0.7-theme-rn.md, "Provider" —
 * "0.6 resolver diagnostics emitted in a post-commit effect via the 0.5
 * seam") — both are returned as pure data by their producing modules and
 * forwarded here by `SurveyThemeProvider`, never called directly from
 * theme-core/shadows.ts (keeps those modules observably pure).
 */
export interface ThemeDiagnosticPayload {
  code: 'theme-diagnostic';
  diagnosticCode: string;
  variable: string | undefined;
  message: string;
  value: string | undefined;
}

/** Forwarded verbatim from `sanitizeHtml`'s own returned diagnostics
 * (design: docs/design/0.9-html-strategy.md, resource-bounds table +
 * "duplicate attributes ... + diagnostic"). `sanitizeCode` is
 * `SanitizeDiagnosticCode` from `./security/sanitize-html` — typed as
 * `string` here rather than imported, so this shared module has no
 * dependency on the security module's internals. */
export interface SanitizedHtmlDiagnosticPayload {
  code: 'sanitized-html-diagnostic';
  sanitizeCode: string;
  detail: string;
}

/** Emitted when `<SanitizedHtml>`'s anchor `onPress` drops a press instead
 * of forwarding it — invalid/re-validation-failed href, or no `onLinkPress`
 * host callback was provided (design: "no host callback = no-op + dev
 * diagnostic"). */
export interface SanitizedHtmlLinkPressDroppedPayload {
  code: 'sanitized-html-link-press-dropped';
  reason: string;
}

/**
 * Native lifecycle bridge diagnostics (design:
 * docs/design/1.2-lifecycle-bridge.md — registry lookup fallbacks). All
 * non-throwing no-op paths, surfaced dev-only, deduped by the emitting
 * module:
 * - `target-unregistered` — scroll request for a model with no registered
 *   handle and no page fallback (once per model instance).
 * - `no-scroll-host` — a scroll request arrived before/without the Survey
 *   root registering its ScrollView host (once per survey instance).
 * - `allow-override-ignored` — a consumer `onScrollToTop` handler tried to
 *   reassign `options.allow` after the bridge locked it false; the write
 *   was ignored (once per install). Scroll ownership is the bridge's —
 *   consumers suppress the native scroll via the `onScrollRequest` seam.
 */
export interface LifecycleDiagnosticPayload {
  code: 'lifecycle-diagnostic';
  lifecycleCode:
    'target-unregistered' | 'no-scroll-host' | 'allow-override-ignored';
  elementName: string | undefined;
  elementType: string | undefined;
}

/**
 * Survey root prop-contract diagnostics (design:
 * docs/design/1.1-survey-root.md, "Props (A12)" — XOR enforcement is
 * non-throwing per invariant 9):
 * - `conflicting-props` — both `json` and `model` passed; `model` wins.
 * - `missing-model` — neither passed; nothing renders (1.8 refines the
 *   empty state).
 * Reported once per condition TRANSITION, not per render.
 */
export interface SurveyRootDiagnosticPayload {
  code: 'survey-root-diagnostic';
  rootCode: 'conflicting-props' | 'missing-model';
}

/** Forwarded verbatim from `preflightSurveyJson`'s returned diagnostics
 * (design: docs/design/1.1-survey-root.md, "Pre-model URL preflight
 * (A11)"). `context` is `UriContext` from `./security/uri-policy` — typed
 * as `string` here, same decoupling rationale as
 * `SanitizedHtmlDiagnosticPayload.sanitizeCode`. */
export interface SurveyJsonBlockedUrlPayload {
  code: 'survey-json-blocked-url';
  path: string;
  context: string;
  reason: string;
}

/** Emitted (once per resolved key — dedupe owned by
 * `components/icon-resolution.ts`) when an icon name resolves to no raw
 * SVG in any source (consumer registries, bundled V2 set). The component
 * renders null — never throws (design:
 * docs/design/1.5-icon-actionbutton.md, invariant-9 spirit). */
export interface UnknownIconPayload {
  code: 'unknown-icon';
  /** The name as passed to the component/Action model, pre-resolution. */
  iconName: string;
  /** The canonical unprefixed registry key it resolved to. */
  resolvedKey: string;
}

/** Forwarded from `sanitizeIconSvg`'s returned diagnostics — once per raw
 * string (the sanitize cache and this dedupe share that key). Same
 * decoupling as `SanitizedHtmlDiagnosticPayload`: `sanitizeCode` is
 * `SvgSanitizeDiagnosticCode` from `./security/sanitize-svg`, typed as
 * `string` here so this shared module has no dependency on the security
 * module's internals. */
export interface IconSvgDiagnosticPayload {
  code: 'icon-svg-diagnostic';
  sanitizeCode: string;
  iconKey: string;
  detail: string;
}

/** Emitted when a bare-`Image` consumer's URI fails the central URI
 * policy (context `'image'`) and the image is dropped fail-closed
 * (invariant 8). `source` names the renderer surface — `'survey-logo'`
 * (task 1.6); later bare-Image ports (image question, imagepicker) add
 * their own. Reported from commit lifecycles, deduped per URI. */
export interface ImageUriBlockedPayload {
  code: 'image-uri-blocked';
  source: string;
  uri: string;
  reason: string;
}

/** Emitted when a survey-core wrapper dispatch
 * (`getElementWrapperComponentName`, upstream's host extension surface)
 * names an element key `RNElementFactory` has no registration for — the
 * slot renders NOTHING (fail-closed: never a guessed default component
 * fed possibly-transformed wrapper data), the surrounding survey
 * survives (invariant 9). `reason` is the core wrapper reason
 * (`'logo-image'`, ...). Reported from commit lifecycles, deduped per
 * componentName per host instance. */
export interface ElementWrapperMissingPayload {
  code: 'element-wrapper-missing';
  componentName: string;
  reason: string;
}

/**
 * Emitted (once per question) by the 1.9 draft/commit adapter when a
 * masked text question requested per-keystroke commits (`textUpdateMode:
 * "onTyping"`, survey- or question-level) but gets blur-commit instead.
 * Core itself downgrades masked questions to blur-commit on every
 * platform (`QuestionTextModel.getIsInputTextUpdate`,
 * question_text.ts:619-621); the adapter enforces the same gate
 * explicitly and surfaces WHY typing isn't committing live (design:
 * docs/design/1.9-draft-commit.md). Per-keystroke mask formatting
 * arrives with 1.10's text input component.
 */
export interface MaskedOnTypingDowngradedPayload {
  code: 'masked-on-typing-downgraded';
  questionType: string;
  name: string | undefined;
  maskType: string;
}

/**
 * Emitted (once per question) by 1.10's text component when unparseable
 * text typed into a `time`/`month`/`week` plain-text fallback is
 * DISCARDED at commit (committed as empty — web parity: those native
 * widgets read as `""` on `badInput`). Unlike `date`/`datetime-local`
 * (which route through core's public `onKeyUp` ->
 * `dateValidationMessage` and surface a real "Invalid input" error),
 * these three have NO sanctioned core error seam (core's
 * `isDateInputType` covers only date/datetime-local,
 * question_text.ts:570-572) — this diagnostic is the only signal the
 * host gets. See docs/DIFFERENCES.md, "Text input inputType fallbacks".
 */
export interface DateTimeFallbackInvalidDiscardedPayload {
  code: 'datetime-fallback-invalid-discarded';
  questionType: string;
  name: string | undefined;
  inputType: string;
}

/**
 * Task 1.4's forwarding edge for the width resolver's pure-data
 * diagnostics (design: docs/design/1.3-width-resolver.md, D4 — "1.4's row
 * component forwards them post-commit through the seam with a new
 * `layout-diagnostic` payload code added there, deduped per (element,
 * offending value) at the forwarding edge"). `layoutCode`/`property` are
 * `WidthDiagnosticCode`/`WidthProperty` from `./layout/width-resolver`,
 * typed as `string` here (same decoupling rationale as
 * `SanitizedHtmlDiagnosticPayload.sanitizeCode`).
 */
export interface LayoutDiagnosticPayload {
  code: 'layout-diagnostic';
  layoutCode: string;
  property: string;
  /** The offending raw width value, stringified verbatim. */
  value: string;
  elementName: string | undefined;
  elementType: string;
  message: string;
}

/**
 * Task 1.8 (review round 1): `SurveyProgressBar` supports only the
 * percentage `progressBarType` family; the buttons/TOC variants render a
 * materially different component tree and are deferred. Rendering the
 * percentage visual for them would be misleading, so the component
 * returns null and reports this instead (invariant 9's spirit: honest,
 * non-throwing degradation).
 */
export interface ProgressBarTypeUnsupportedPayload {
  code: 'progress-bar-type-unsupported';
  /** The authored `progressBarType`. */
  progressBarType: string;
  /** The EFFECTIVE upstream route after the pages->buttons conversion
   * (private `progressBarComponentName`, survey.ts:2942-2949). */
  effectiveType: string;
  message: string;
}

/**
 * Task 2.10: the `image` question renders only `renderedMode === "image"`
 * in v1 — `"video"` is deferred (media task) and `"youtube"` is a
 * documented won't-support. Rendering nothing + reporting beats a
 * misleading empty frame (invariant 9's honest-degradation spirit).
 */
export interface ImageContentModeUnsupportedPayload {
  code: 'image-content-mode-unsupported';
  questionName: string;
  contentMode: string;
}

/** 2.8a paneldynamic — a non-list `displayMode` (carousel/tab/progress) is
 * not yet supported (tasks 2.8b/2.8c); the list renderer degrades to an
 * unsupported fallback + this diagnostic rather than a broken frame. */
export interface PanelDynamicModeUnsupportedPayload {
  code: 'paneldynamic-mode-unsupported';
  questionName: string;
  displayMode: string;
}

/** 2.2 dialog adapter — a consumer `settings.showDialog` was displaced
 * while Surveys are mounted (restored on last unmount; design
 * 2.2-dialog-adapter D2). */
export interface DialogAdapterDisplacedPayload {
  code: 'dialog-adapter-displaced-show-dialog';
}

/** 2.2 dialog adapter — `setDialogAdapterEnabled` called while dialog
 * hosts are live (pre-mount configuration only; the call no-ops). */
export interface DialogAdapterEnableWhileMountedPayload {
  code: 'dialog-adapter-enable-while-mounted';
  requested: boolean;
}

/** 2.2 dialog adapter — a core dialog arrived with no mounted Survey
 * host; resolved as cancel (fail-safe, design 2.2-dialog-adapter D3). */
export interface DialogNoHostPayload {
  code: 'dialog-no-host';
  componentName?: string;
}

/** 2.3 dropdown — a `renderAs: "select"` dropdown has no
 * `dropdownListModel` (the overlay/touch view model core builds only for
 * the default popup rendering), so there is no interactive sheet to open.
 * The RN control degrades to a non-interactive value display + this
 * diagnostic rather than crashing on the missing model. */
export interface DropdownSelectModeUnsupportedPayload {
  code: 'dropdown-select-mode-unsupported';
  questionName: string;
}

/** 2.3 dropdown — `showInputFieldComponent` named a custom item
 * component (`inputFieldComponentName`) that is not registered in
 * RNElementFactory, so the selected value falls back to its localized
 * text instead of the custom renderer. */
export interface DropdownInputComponentMissingPayload {
  code: 'dropdown-input-component-missing';
  questionName: string;
  componentName: string;
}

/** 2.4 tagbox — a `renderAs: "select"` tagbox has no native RN
 * multi-`<select>` analog; the control degrades to a non-interactive
 * chips display + this diagnostic. (Unlike dropdown, core builds the VM
 * regardless of renderAs, so the mode is keyed on `renderAs`, not VM
 * presence.) */
export interface TagboxSelectModeUnsupportedPayload {
  code: 'tagbox-select-mode-unsupported';
  questionName: string;
}

export type DiagnosticPayload =
  | UnsupportedQuestionTypePayload
  | CustomWidgetIgnoredPayload
  | DropdownSelectModeUnsupportedPayload
  | DropdownInputComponentMissingPayload
  | TagboxSelectModeUnsupportedPayload
  | DialogAdapterDisplacedPayload
  | DialogAdapterEnableWhileMountedPayload
  | DialogNoHostPayload
  | UnknownCssTokenPayload
  | ThemeDiagnosticPayload
  | SanitizedHtmlDiagnosticPayload
  | SanitizedHtmlLinkPressDroppedPayload
  | LifecycleDiagnosticPayload
  | SurveyRootDiagnosticPayload
  | SurveyJsonBlockedUrlPayload
  | UnknownIconPayload
  | IconSvgDiagnosticPayload
  | ImageUriBlockedPayload
  | ElementWrapperMissingPayload
  | MaskedOnTypingDowngradedPayload
  | DateTimeFallbackInvalidDiscardedPayload
  | LayoutDiagnosticPayload
  | ProgressBarTypeUnsupportedPayload
  | ImageContentModeUnsupportedPayload
  | PanelDynamicModeUnsupportedPayload;

export type DiagnosticHandler = (payload: DiagnosticPayload) => void;

function defaultDiagnosticHandler(payload: DiagnosticPayload): void {
  // Dev-only by default (round-2 review #12): production builds stay silent
  // unless the host registers its own handler via `setDiagnosticHandler`, so
  // the library never spams `console.warn` in a shipped app — matching what
  // DIFFERENCES.md promises for dropped-link/sanitizer diagnostics.
  if (typeof __DEV__ === 'boolean' && !__DEV__) return;
  console.warn(`[react-native-survey-library] ${payload.code}`, payload);
}

let currentHandler: DiagnosticHandler = defaultDiagnosticHandler;

/** Pass `undefined` to restore the default `console.warn`-based handler. */
export function setDiagnosticHandler(
  handler: DiagnosticHandler | undefined
): void {
  currentHandler = handler ?? defaultDiagnosticHandler;
}

export function reportDiagnostic(payload: DiagnosticPayload): void {
  try {
    currentHandler(payload);
  } catch (error) {
    // Contained: a throwing consumer handler must never propagate into a
    // render/commit lifecycle and break the non-throwing guarantee.
    console.error(
      '[react-native-survey-library] diagnostic handler threw; continuing',
      error
    );
  }
}

const unsupportedQuestionTypeEmitted = new WeakMap<Question, Set<string>>();

export function reportUnsupportedQuestionTypeOnce(
  question: Question,
  payload: UnsupportedQuestionTypePayload
): void {
  let emittedKeys = unsupportedQuestionTypeEmitted.get(question);
  if (!emittedKeys) {
    emittedKeys = new Set<string>();
    unsupportedQuestionTypeEmitted.set(question, emittedKeys);
  }
  if (emittedKeys.has(payload.dispatchKey)) return;
  emittedKeys.add(payload.dispatchKey);
  reportDiagnostic(payload);
}

/**
 * Dedupe registry for `reportLayoutDiagnosticOnce` — keyed per ELEMENT
 * (any survey element object: question or panel), with a composite
 * `(layoutCode, property, value)` inner key. `property` participates
 * because the SAME junk value can legitimately offend on two different
 * properties (e.g. a user width echoed into a calc'd minWidth) and each
 * is separately actionable.
 */
const layoutDiagnosticEmitted = new WeakMap<object, Set<string>>();

export function reportLayoutDiagnosticOnce(
  element: object,
  payload: LayoutDiagnosticPayload
): void {
  let emittedKeys = layoutDiagnosticEmitted.get(element);
  if (!emittedKeys) {
    emittedKeys = new Set<string>();
    layoutDiagnosticEmitted.set(element, emittedKeys);
  }
  const key = `${payload.layoutCode}|${payload.property}|${payload.value}`;
  if (emittedKeys.has(key)) return;
  emittedKeys.add(key);
  reportDiagnostic(payload);
}

const customWidgetIgnoredEmitted = new WeakSet<Question>();

export function reportCustomWidgetIgnoredOnce(
  question: Question,
  payload: CustomWidgetIgnoredPayload
): void {
  if (customWidgetIgnoredEmitted.has(question)) return;
  customWidgetIgnoredEmitted.add(question);
  reportDiagnostic(payload);
}

/** Once per QUESTION, full stop (same dedup shape as
 * `reportCustomWidgetIgnoredOnce`): adapter replacement/recreation on the
 * same question must not re-emit. */
const maskedOnTypingDowngradedEmitted = new WeakSet<Question>();

export function reportMaskedOnTypingDowngradedOnce(
  question: Question,
  payload: MaskedOnTypingDowngradedPayload
): void {
  if (maskedOnTypingDowngradedEmitted.has(question)) return;
  maskedOnTypingDowngradedEmitted.add(question);
  reportDiagnostic(payload);
}

/** Once per question (same dedup shape as the masked-downgrade report):
 * every discarded keystroke/blur repeating the same host-visible fact
 * must not spam the handler. */
const dateTimeFallbackInvalidDiscardedEmitted = new WeakSet<Question>();

export function reportDateTimeFallbackInvalidDiscardedOnce(
  question: Question,
  payload: DateTimeFallbackInvalidDiscardedPayload
): void {
  if (dateTimeFallbackInvalidDiscardedEmitted.has(question)) return;
  dateTimeFallbackInvalidDiscardedEmitted.add(question);
  reportDiagnostic(payload);
}

/**
 * RN's Metro (and jest's react-native preset) define the `__DEV__`
 * global; declared module-locally (same pattern as
 * `reactivity/SurveyElementBase.tsx`) so the dev-only unknown-css-token
 * seam typechecks without widening the library's ambient types.
 */
declare const __DEV__: boolean | undefined;

function isDevMode(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/**
 * theme-rn's bridge unknown-token seam (design: docs/design/0.7-theme-rn.md,
 * "Hybrid bridge" point 4 — "No diagnostics during render: the component
 * queues `unknownTokens` and flushes post-commit ... through the guarded
 * seam, deduped module-wide via `WeakMap<Question, Set<token>>`
 * (dev-only)"). Two WeakMaps: PENDING (queued this render pass, not yet
 * reported) and EMITTED (already reported once, ever, for this question —
 * survives across StrictMode's double-invoked commit phases so a token
 * queued/flushed twice in the same pass still only reports once; a later,
 * genuinely different token still reports).
 */
const unknownCssTokenPending = new WeakMap<Question, Set<string>>();
const unknownCssTokenEmitted = new WeakMap<Question, Set<string>>();

export function queueUnknownCssToken(question: Question, token: string): void {
  if (!isDevMode()) return;
  let pending = unknownCssTokenPending.get(question);
  if (!pending) {
    pending = new Set<string>();
    unknownCssTokenPending.set(question, pending);
  }
  pending.add(token);
}

export function flushUnknownCssTokenDiagnostics(question: Question): void {
  if (!isDevMode()) return;
  const pending = unknownCssTokenPending.get(question);
  if (!pending || pending.size === 0) return;
  let emitted = unknownCssTokenEmitted.get(question);
  if (!emitted) {
    emitted = new Set<string>();
    unknownCssTokenEmitted.set(question, emitted);
  }
  pending.forEach((token) => {
    if (emitted?.has(token)) return;
    emitted?.add(token);
    reportDiagnostic({
      code: 'theme-rn-unknown-css-token',
      token,
      questionName: question.name,
      questionType: question.getType(),
    });
  });
  pending.clear();
}
