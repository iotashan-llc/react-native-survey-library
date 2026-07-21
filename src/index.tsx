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
export { QuestionChrome } from './components/QuestionChrome';
export { PanelDynamicQuestion } from './questions/PanelDynamicQuestion';
export {
  MatrixQuestion,
  MatrixQuestionElement,
} from './questions/MatrixQuestion';
export {
  MatrixDropdownQuestion,
  MatrixDropdownQuestionElement,
} from './questions/MatrixDropdownQuestion';
export {
  MatrixDynamicQuestion,
  MatrixDynamicQuestionElement,
} from './questions/MatrixDynamicQuestion';
export {
  MatrixTableBase,
  MatrixTable,
  MatrixChoiceCell,
} from './components/matrix/MatrixTableBase';
export { CustomQuestion } from './questions/CustomQuestion';
export { CompositeQuestion } from './questions/CompositeQuestion';
export type { QuestionChromeProps } from './components/QuestionChrome';
export { setDiagnosticHandler, reportDiagnostic } from './diagnostics';
export type {
  DiagnosticHandler,
  DiagnosticPayload,
  LifecycleDiagnosticPayload,
  SurveyRootDiagnosticPayload,
  SurveyJsonBlockedUrlPayload,
  DialogAdapterDisplacedPayload,
  DialogAdapterEnableWhileMountedPayload,
  DialogNoHostPayload,
  DropdownSelectModeUnsupportedPayload,
  DropdownInputComponentMissingPayload,
  TagboxSelectModeUnsupportedPayload,
} from './diagnostics';

// The <Survey> root (design: docs/design/1.1-survey-root.md; A11, A12) —
// json XOR model, pre-model URL preflight, applyTheme, owned-model
// dispose, SurveyRefHandle, compiler-derived event props.
// `preflightSurveyJson` is exported for hosts on the `model` path (which
// is documented trusted/prevalidated): they can run the same A11
// preflight over their json before constructing the model themselves.
export { Survey } from './survey/Survey';
export type {
  SurveyProps,
  SurveyOwnProps,
  SurveyRefHandle,
  SurveyScrollToElementEvent,
} from './survey/Survey';
export type { SurveyModelEventProps } from './survey/event-props';
// Host opt-in link events (invariant 8): <Survey onLinkPress> provides
// this context; every SanitizedHtml sink surfaces policy-validated link
// presses as {url, context, origin, scheme} events — the HOST decides
// navigation (e.g. Linking.openURL). Without a handler, anchors render
// as plain text.
export { LinkPressContext } from './security/LinkPressContext';
export type {
  SurveyLinkPressContext,
  SurveyLinkPressEvent,
  SurveyLinkPressHandler,
} from './security/LinkPressContext';
export { preflightSurveyJson } from './security/json-preflight';
export type {
  PreflightDiagnostic,
  PreflightResult,
} from './security/json-preflight';
// choicesByUrl request-time gate (A11 follow-through) — armed
// automatically by <Survey>; these exports let hosts on the `model` path
// opt their OWN construction into the same request-time + end-URL
// redirect enforcement (see docs/DIFFERENCES.md).
export {
  installChoicesByUrlGate,
  registerModelUriPolicy,
  unregisterModelUriPolicy,
  runWithConstructionUriPolicy,
} from './security/choices-gate';

// Native lifecycle bridge (design: docs/design/1.2-lifecycle-bridge.md,
// A15) — the per-survey ref/layout registry, the onScrollToTop
// interception bridge, and the context 1.1's <Survey> provides them
// through. Components register ElementHandles via the 0.4 mounted hooks.
export { createLifecycleRegistry } from './lifecycle/registry';
export { installLifecycleBridge } from './lifecycle/bridge';
export { LifecycleContext } from './lifecycle/LifecycleContext';
export type { LifecycleContextValue } from './lifecycle/LifecycleContext';
export type {
  ElementHandle,
  LifecycleBridgeOptions,
  LifecycleRegistry,
  RegistrableElement,
  ResolvedScrollTarget,
  ScrollHostHandle,
  ScrollHostViewport,
  ScrollRequestInfo,
  TargetMeasurement,
} from './lifecycle/types';

// Task 1.6 — LocalizableString renderer + basic survey header.
export { SurveyLocStringViewer } from './components/LocStringViewer';
export type { SurveyLocStringViewerProps } from './components/LocStringViewer';
export { SurveyHeader } from './components/SurveyHeader';
export type { SurveyHeaderProps } from './components/SurveyHeader';
export { LogoImage } from './components/LogoImage';
export type { LogoImageProps } from './components/LogoImage';

// Task 1.8 — navigation bar, percentage progress bar, and the completed/
// completedBefore/loading/empty survey-state frame. Standalone exports:
// the 1.1 `<Survey>` shell (unmerged branch) is expected to mount these
// directly.
export { SurveyNavigation } from './components/SurveyNavigation';
export type { SurveyNavigationProps } from './components/SurveyNavigation';
export { SurveyProgressBar } from './components/SurveyProgressBar';
export type { SurveyProgressBarProps } from './components/SurveyProgressBar';
// task 5.7c — the progress-buttons step nav (routed by SurveyProgressBar
// for progressBarType "buttons"/"pages") and the notifier toast (mounted
// by the <Survey> shell). Exported for hosts mounting the shell directly.
export { SurveyProgressButtons } from './components/SurveyProgressButtons';
export type { SurveyProgressButtonsProps } from './components/SurveyProgressButtons';
export { SurveyNotifier } from './components/SurveyNotifier';
export type { SurveyNotifierProps } from './components/SurveyNotifier';
export { SurveyStateFrame } from './components/SurveyStateFrame';
export type { SurveyStateFrameProps } from './components/SurveyStateFrame';
// text question (task 1.10, A5) — the DraftCommitAdapter it wires
// (task 1.9) lives at './inputs/DraftCommitAdapter'.
export { TextQuestion } from './questions/TextQuestion';
// overlay primitives (task 2.1, A9): the presenter seam is the public
// injection point; stack/bridge internals stay library-side until the
// consumer API stabilizes with 2.3.
export { OverlayPresenterContext } from './overlay/OverlayPresenterContext';
// dialog adapter (task 2.2): consumer-facing enablement switch; the
// dispatcher itself installs/restores with Survey mounts.
export { setDialogAdapterEnabled } from './overlay/dialog-adapter';
export type {
  OverlayPresenter,
  OverlayPresenterProps,
} from './overlay/OverlayPresenterContext';
// buttongroup question (task 2.9; the OverlayContext element wrapper is
// the 2.5b compact mode's Modal bridge — export BOTH, same as dropdown/
// tagbox: the raw class alone renders a compact opener with no sheet).
export {
  ButtonGroupQuestion,
  ButtonGroupQuestionElement,
} from './questions/ButtonGroupQuestion';
// image question (task 2.10).
export { ImageQuestion } from './questions/ImageQuestion';
export { ImagePickerQuestion } from './questions/ImagePickerQuestion';
export { MultipleTextQuestion } from './questions/MultipleTextQuestion';
export {
  DropdownQuestion,
  DropdownQuestionElement,
} from './questions/DropdownQuestion';
export {
  TagboxQuestion,
  TagboxQuestionElement,
} from './questions/TagboxQuestion';
// rating displayMode:"dropdown" (task 2.5a) — the fourth overlay
// consumer; export BOTH, same as dropdown/tagbox/buttongroup (the raw
// class alone renders an opener with no Modal bridged).
export {
  RatingDropdownQuestion,
  RatingDropdownQuestionElement,
} from './questions/RatingDropdownQuestion';
export type { ImageQuestionProps } from './questions/ImageQuestion';
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
  QuestionChromeStyleOverrides,
  ActionButtonStyleOverrides,
  HeaderStyleOverrides,
  NavigationStyleOverrides,
  ProgressStyleOverrides,
  SurveyStateStyleOverrides,
  RatingStyleOverrides,
  ButtonGroupStyleOverrides,
  ListItemStyleOverrides,
} from './theme-rn/overrides';
export type { NormalizedBackground } from './theme-rn/background';

// Task 1.5 (design: docs/design/1.5-icon-actionbutton.md, A15 icons half)
// — the shared icon + action-button primitives. `RNIcon` is the ONLY
// module allowed to import `react-native-svg` (ESLint-enforced) and
// lazy-requires it, so importing the package root does not eagerly pull
// the SVG renderer in.
export { RNIcon, RNICON_DEFAULT_SIZE } from './components/RNIcon';
export type { RNIconProps } from './components/RNIcon';
export {
  ActionButton,
  partitionButtonStyles,
  nativeActionEvent,
} from './components/ActionButton';
export type {
  ActionButtonProps,
  PartitionedButtonStyles,
} from './components/ActionButton';
export { resolveIconXml } from './components/icon-resolution';
export type { ResolvedIconXml } from './components/icon-resolution';
export { sanitizeIconSvg } from './security/sanitize-svg';
export type {
  SanitizeSvgResult,
  SvgSanitizeDiagnostic,
  SvgSanitizeDiagnosticCode,
} from './security/sanitize-svg';

// Security (design: docs/design/0.9-html-strategy.md, A10/A11) — the
// central URI policy and the single-parse HTML sanitizer AST pipeline.
// `SanitizedHtml` (the ONLY file allowed to import `@native-html/render`
// — ESLint-enforced) lazily requires it, so importing this package's
// index does not eagerly pull the renderer in either.
export { SanitizedHtml } from './components/SanitizedHtml';
export type {
  SanitizedHtmlProps,
  LinkPressValidationMeta,
} from './components/SanitizedHtml';
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
