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
    | 'target-unregistered'
    | 'no-scroll-host'
    | 'allow-override-ignored';
  elementName: string | undefined;
  elementType: string | undefined;
}

export type DiagnosticPayload =
  | UnsupportedQuestionTypePayload
  | CustomWidgetIgnoredPayload
  | UnknownCssTokenPayload
  | ThemeDiagnosticPayload
  | SanitizedHtmlDiagnosticPayload
  | SanitizedHtmlLinkPressDroppedPayload
  | LifecycleDiagnosticPayload;

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

const customWidgetIgnoredEmitted = new WeakSet<Question>();

export function reportCustomWidgetIgnoredOnce(
  question: Question,
  payload: CustomWidgetIgnoredPayload
): void {
  if (customWidgetIgnoredEmitted.has(question)) return;
  customWidgetIgnoredEmitted.add(question);
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
