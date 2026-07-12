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
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';

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

/** Per-component slot overrides distributed via `SurveyThemeProvider`'s `styles` prop and `SurveyThemeContext`'s `styles` field. */
export interface SurveyComponentStyles {
  item?: ItemStyleOverrides;
  input?: InputStyleOverrides;
  button?: ButtonStyleOverrides;
  questionTitle?: QuestionTitleStyleOverrides;
  unsupportedQuestion?: UnsupportedQuestionStyleOverrides;
}

/** Stable default so an omitted `styles` prop never churns the provider's memoized context value. */
export const EMPTY_COMPONENT_STYLES: SurveyComponentStyles = Object.freeze({});
