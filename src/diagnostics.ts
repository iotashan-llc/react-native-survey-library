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

export type DiagnosticPayload =
  | UnsupportedQuestionTypePayload
  | CustomWidgetIgnoredPayload
  | UnknownCssTokenPayload
  | ThemeDiagnosticPayload
  | SanitizedHtmlDiagnosticPayload
  | SanitizedHtmlLinkPressDroppedPayload
  | UnknownIconPayload
  | IconSvgDiagnosticPayload
  | ImageUriBlockedPayload
  | ElementWrapperMissingPayload
  | MaskedOnTypingDowngradedPayload
  | DateTimeFallbackInvalidDiscardedPayload;

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
