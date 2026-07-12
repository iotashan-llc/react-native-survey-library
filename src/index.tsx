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

export const LIBRARY_NAME = '@iotashan-llc/react-native-survey-library';
