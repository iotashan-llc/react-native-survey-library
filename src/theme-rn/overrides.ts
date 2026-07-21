/**
 * A12 consumer style-override surface (design ownership table: "A12
 * consumer style-override types (per-component slot overrides, precedence:
 * recipe < theme < consumer override) + cache participation | 0.7";
 * codex impl-review major 8 — the surface must be PUBLIC, distributed
 * through `SurveyThemeProvider`, and exported from the package root).
 *
 * Each component exposes named SLOTS typed as RN `StyleProp`s. The merge
 * order is `composeStyles`' documented precedence: the recipe fragment is
 * the base, a future theme-JSON layer refines it, and the consumer's
 * override here always wins last. Component wiring is per-port; the 0.7
 * exemplar consumer is `UnsupportedQuestion`.
 *
 * The provider memoizes its context value on the styles object's
 * IDENTITY (standard React practice for style props — `StyleProp` values
 * are commonly registered style objects/arrays where deep comparison is
 * neither cheap nor meaningful). Hosts should hoist the object rather
 * than inline a fresh literal per render.
 */
import type { StyleProp, ViewStyle, TextStyle, ImageStyle } from 'react-native';

export interface ItemStyleOverrides {
  container?: StyleProp<ViewStyle>;
  decorator?: StyleProp<ViewStyle>;
  label?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
}

export interface InputStyleOverrides {
  control?: StyleProp<TextStyle>;
  characterCounter?: StyleProp<TextStyle>;
}

export interface ButtonStyleOverrides {
  button?: StyleProp<TextStyle>;
}

export interface QuestionTitleStyleOverrides {
  title?: StyleProp<TextStyle>;
  number?: StyleProp<TextStyle>;
  numberGutter?: StyleProp<ViewStyle>;
  requiredMark?: StyleProp<TextStyle>;
}

export interface UnsupportedQuestionStyleOverrides {
  panel?: StyleProp<ViewStyle>;
  message?: StyleProp<TextStyle>;
  errorAccentBar?: StyleProp<ViewStyle>;
}

/** `QuestionChrome` (task 1.7) — title/description/errors/comment wrapper. */
export interface QuestionChromeStyleOverrides {
  description?: StyleProp<TextStyle>;
  errorPanel?: StyleProp<ViewStyle>;
  errorItem?: StyleProp<TextStyle>;
  commentArea?: StyleProp<ViewStyle>;
  commentLabel?: StyleProp<TextStyle>;
  commentInput?: StyleProp<TextStyle>;
}

/** Task 1.5 (`ActionButton`): the Pressable container, the icon, and the title text. */
export interface ActionButtonStyleOverrides {
  container?: StyleProp<ViewStyle>;
  icon?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
}

/** Basic survey header slots (task 1.6). */
export interface HeaderStyleOverrides {
  root?: StyleProp<ViewStyle>;
  titleBlock?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  logo?: StyleProp<ViewStyle>;
  logoImage?: StyleProp<ImageStyle>;
}

/** Nav button row slots (task 1.8: `SurveyNavigation`). */
export interface NavigationStyleOverrides {
  root?: StyleProp<ViewStyle>;
}

/** Percentage progress-bar slots (task 1.8: `SurveyProgressBar`). */
export interface ProgressStyleOverrides {
  track?: StyleProp<ViewStyle>;
  bar?: StyleProp<ViewStyle>;
  text?: StyleProp<TextStyle>;
}

/** Survey-state frame slots (task 1.8: `SurveyStateFrame` -- completed/completedBefore/loading/empty). */
export interface SurveyStateStyleOverrides {
  completed?: StyleProp<ViewStyle>;
  completedBefore?: StyleProp<ViewStyle>;
  loading?: StyleProp<ViewStyle>;
  empty?: StyleProp<ViewStyle>;
}

/** Rating-question slots (task 1.14: `RatingQuestion` + item components). */
export interface RatingStyleOverrides {
  root?: StyleProp<ViewStyle>;
  row?: StyleProp<ViewStyle>;
  minMaxText?: StyleProp<TextStyle>;
  pillItem?: StyleProp<TextStyle>;
  smileyItem?: StyleProp<ViewStyle>;
}

/** Button-group slots (task 2.9: `ButtonGroupQuestion`). */
export interface ButtonGroupStyleOverrides {
  container?: StyleProp<ViewStyle>;
  item?: StyleProp<ViewStyle>;
  caption?: StyleProp<TextStyle>;
}

/** Ranking-question slots (task 4.1: `RankingQuestion`). */
export interface RankingStyleOverrides {
  item?: StyleProp<ViewStyle>;
  handle?: StyleProp<ViewStyle>;
  rankNumber?: StyleProp<ViewStyle>;
  rankNumberText?: StyleProp<TextStyle>;
  label?: StyleProp<TextStyle>;
}

/** Slider-question slots (task 4.4: `SliderQuestion`). */
export interface SliderStyleOverrides {
  container?: StyleProp<ViewStyle>;
  track?: StyleProp<ViewStyle>;
  activeBar?: StyleProp<ViewStyle>;
  thumb?: StyleProp<ViewStyle>;
  tooltip?: StyleProp<ViewStyle>;
  label?: StyleProp<ViewStyle>;
}

/** Signature-pad slots (task 5.1: `SignaturePadQuestion`). */
export interface SignatureStyleOverrides {
  container?: StyleProp<ViewStyle>;
  canvas?: StyleProp<ViewStyle>;
  placeholder?: StyleProp<ViewStyle>;
  clearButton?: StyleProp<ViewStyle>;
  image?: StyleProp<ImageStyle>;
}

/** Image-map slots (task 5.4: `ImageMapQuestion`). */
export interface ImageMapStyleOverrides {
  container?: StyleProp<ViewStyle>;
  imageBox?: StyleProp<ViewStyle>;
  image?: StyleProp<ImageStyle>;
  fallback?: StyleProp<ViewStyle>;
}

/** List-picker slots (task 2.1: `ListPicker`). */
export interface ListItemStyleOverrides {
  row?: StyleProp<ViewStyle>;
  text?: StyleProp<TextStyle>;
  searchInput?: StyleProp<TextStyle>;
}

/** Survey timer-panel slots (task 5.7a: `SurveyTimerPanel`). */
export interface TimerPanelStyleOverrides {
  root?: StyleProp<ViewStyle>;
  majorText?: StyleProp<TextStyle>;
  minorText?: StyleProp<TextStyle>;
  text?: StyleProp<TextStyle>;
}

/** Per-component slot overrides distributed via `SurveyThemeProvider`'s `styles` prop and `SurveyThemeContext`'s `styles` field. */
export interface SurveyComponentStyles {
  item?: ItemStyleOverrides;
  input?: InputStyleOverrides;
  button?: ButtonStyleOverrides;
  questionTitle?: QuestionTitleStyleOverrides;
  unsupportedQuestion?: UnsupportedQuestionStyleOverrides;
  questionChrome?: QuestionChromeStyleOverrides;
  actionButton?: ActionButtonStyleOverrides;
  header?: HeaderStyleOverrides;
  navigation?: NavigationStyleOverrides;
  progress?: ProgressStyleOverrides;
  surveyState?: SurveyStateStyleOverrides;
  rating?: RatingStyleOverrides;
  buttonGroup?: ButtonGroupStyleOverrides;
  ranking?: RankingStyleOverrides;
  slider?: SliderStyleOverrides;
  signature?: SignatureStyleOverrides;
  imagemap?: ImageMapStyleOverrides;
  listItem?: ListItemStyleOverrides;
  timerPanel?: TimerPanelStyleOverrides;
}

/** Stable default so an omitted `styles` prop never churns the provider's memoized context value. */
export const EMPTY_COMPONENT_STYLES: SurveyComponentStyles = Object.freeze({});
