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

export type DiagnosticPayload =
  | UnsupportedQuestionTypePayload
  | CustomWidgetIgnoredPayload
  | SanitizedHtmlDiagnosticPayload
  | SanitizedHtmlLinkPressDroppedPayload;

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
