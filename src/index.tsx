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
} from './components/UnsupportedQuestion';
export { setDiagnosticHandler, reportDiagnostic } from './diagnostics';
export type { DiagnosticHandler, DiagnosticPayload } from './diagnostics';

export const LIBRARY_NAME = '@iotashan-llc/react-native-survey-library';
