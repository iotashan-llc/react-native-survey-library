// Re-exporting from the facade (never from 'survey-core' directly) is what
// makes the renderer-first import-order contract work: importing anything
// from this package applies the survey-core environment shim before
// survey-core itself is evaluated (design: docs/design/0.3-core-facade.md).
export * from './core/facade';

// Side-effect import: the registrar (design: docs/design/0.5-factories.md,
// "Registration & packaging") walks the descriptor table and registers
// every `supported` row into RNQuestionFactory/RNElementFactory. This is
// the ONLY side-effecting import in this file — it must come after the
// facade re-export above so the shim is already applied — and is why this
// file (plus its `lib/module` build output) is listed in package.json's
// `sideEffects` array.
import './factories/register-all';

export { RNQuestionFactory } from './factories/QuestionFactory';
export { RNElementFactory } from './factories/ElementFactory';
export {
  createUnsupportedQuestion,
  setUnsupportedQuestionRenderer,
  UnsupportedQuestion,
} from './components/UnsupportedQuestion';
export type {
  UnsupportedMissInfo,
  UnsupportedQuestionProps,
  UnsupportedQuestionRenderer,
} from './components/UnsupportedQuestion';
export { setDiagnosticHandler, reportDiagnostic } from './diagnostics';
export type { DiagnosticHandler, DiagnosticPayload } from './diagnostics';

// text question (task 1.10, A5) — the DraftCommitAdapter it wires
// (task 1.9) lives at './inputs/DraftCommitAdapter'.
export { TextQuestion } from './questions/TextQuestion';
export type { TextQuestionProps } from './questions/TextQuestion';
export { DraftCommitAdapter } from './inputs/DraftCommitAdapter';
export type {
  DraftCommitAdapterOptions,
  DraftCommitKind,
} from './inputs/DraftCommitAdapter';

// theme-core (design: docs/design/0.6-theme-core.md) — the pure
// ITheme -> tokens resolver plus its standalone helpers. theme-rn (0.7)
// consumes ResolvedTheme; hosts may also call resolveTheme directly.
export { resolveTheme } from './theme-core/resolve';
export type {
  ResolvedTheme,
  ThemeTokens,
  ThemeMeta,
  ThemeBackground,
  ThemeHeader,
  HeaderBackgroundKind,
  ColorToken,
  ArticleFontToken,
  ArticleFontTokens,
  ShadowTokens,
  ThemeDiagnostic,
} from './theme-core/resolve';
export { spacing, evaluateVarExpression } from './theme-core/helpers';
export type { RawVariables, VarEvalResult } from './theme-core/helpers';
export type {
  ShadowLayer,
  ParsedColor,
  FontWeightValue,
} from './theme-core/parse';

// theme-rn (design: docs/design/0.7-theme-rn.md) — the provider, its
// context, and the A12 consumer style-override surface (codex impl-review
// major 8: the override types must be PUBLIC, not internal-only).
export { SurveyThemeProvider, SurveyThemeContext } from './theme-rn/provider';
export type {
  SurveyThemeProviderProps,
  SurveyThemeContextValue,
  ThemeMode,
} from './theme-rn/provider';
export { composeStyles } from './theme-rn/recipes/types';
export type {
  StyleOverrideLayers,
  RecipeBuildDiagnostic,
  RecipeBuildPlatform,
  BuildContext,
} from './theme-rn/recipes/types';
export type { Recipes } from './theme-rn/recipes';
export type {
  SurveyComponentStyles,
  ItemStyleOverrides,
  InputStyleOverrides,
  ButtonStyleOverrides,
  QuestionTitleStyleOverrides,
  UnsupportedQuestionStyleOverrides,
} from './theme-rn/overrides';
export type { NormalizedBackground } from './theme-rn/background';

// Security (design: docs/design/0.9-html-strategy.md, A10/A11) — the
// central URI policy and the single-parse HTML sanitizer AST pipeline.
// `SanitizedHtml` (the ONLY file allowed to import `@native-html/render`
// — ESLint-enforced) lazily requires it, so importing this package's
// index does not eagerly pull the renderer in either.
export { SanitizedHtml } from './components/SanitizedHtml';
export type { SanitizedHtmlProps } from './components/SanitizedHtml';
export {
  sanitizeHtml,
  DEFAULT_RESOURCE_BOUNDS,
} from './security/sanitize-html';
export type {
  SanitizeHtmlConfig,
  SanitizeHtmlResult,
  SanitizeDiagnostic,
  SanitizeDiagnosticCode,
  ResourceBounds,
} from './security/sanitize-html';
export {
  validateUri,
  lintChoicesByUrlTemplate,
  requiresManualRedirect,
} from './security/uri-policy';
export type {
  UriContext,
  UriPolicyConfig,
  UriValidationResult,
  UriValidationOk,
  UriValidationFail,
  ChoicesByUrlLintResult,
} from './security/uri-policy';

export const LIBRARY_NAME = '@iotashan-llc/react-native-survey-library';
