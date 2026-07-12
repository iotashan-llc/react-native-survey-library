/**
 * Question title + number recipe (design: docs/design/0.7-metrics-fixture.md,
 * "Question title + number -- sd-element.scss"). 4 fixture-locked legal
 * states for the TITLE selector (base/required/errorTone/collapsed); the
 * number slot is unconditional (always present, not part of the
 * enumeration -- the component applies `number`/`numberGutter` directly).
 * `required` carries no title-style delta of its own (fixture: the
 * required mark is appended CONTENT, not a title restyle) -- it is still
 * a recognized selector tuple so the component's presence check for
 * "should I render the requiredMark span" has a single source of truth.
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcSize,
  calcFontSize,
  calcLineHeight,
  resolveColorVar,
} from './tokenLookup';
import type { BuildContext } from './types';

export interface QuestionTitleVariant {
  required: boolean;
  errorTone: boolean;
  collapsed: boolean;
}

export interface QuestionTitleRecipe {
  fragments: {
    title: TextStyle;
    errorTone: TextStyle;
    collapsed: TextStyle;
    requiredMark: TextStyle;
    number: TextStyle;
    numberGutter: ViewStyle;
  };
}

export function buildQuestionTitleRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): QuestionTitleRecipe {
  const sink = buildCtx?.diagnostics;
  const titleFontSize = resolved.tokens.typography.questionTitle.fontSize;

  const fragments = StyleSheet.create({
    title: {
      fontSize: titleFontSize,
      fontWeight: String(
        resolved.tokens.typography.questionTitle.fontWeight
      ) as TextStyle['fontWeight'],
      fontFamily:
        resolved.tokens.typography.questionTitle.fontFamily || undefined,
      color: resolveColorVar(resolved, '--sjs-font-questiontitle-color', sink)
        .css,
      lineHeight: 1.5 * titleFontSize,
    },
    errorTone: {
      color: resolveColorVar(resolved, '--sjs-special-red-forecolor', sink).css,
    },
    collapsed: {
      opacity: 0.7,
    },
    requiredMark: {
      // Upstream: `.sd-question__required-text { color: $red }` =
      // --sjs-special-red (sd-question.scss:136-138) — NOT the
      // -forecolor token, which is the ON-red foreground (default white)
      // and would render the mark invisible on light themes (codex
      // impl-review major 7).
      color: resolveColorVar(resolved, '--sjs-special-red', sink).css,
    },
    number: {
      fontSize: calcFontSize(resolved, 0.75),
      lineHeight: calcLineHeight(resolved, 1),
      color: resolveColorVar(resolved, '--sjs-general-forecolor-light', sink)
        .css,
      paddingTop: calcSize(resolved, 0.625),
      paddingBottom: calcSize(resolved, 0.375),
      // Logical END padding (fixture: "number.paddingEnd") — RN resolves
      // start/end per I18nManager.isRTL at layout, so RTL needs no
      // separate fragment (codex impl-review major 7).
      paddingEnd: calcSize(resolved, 1),
    },
    numberGutter: {
      width: calcSize(resolved, 5),
      flexDirection: 'row',
    },
  });

  return { fragments };
}

export function selectQuestionTitleStyles(
  recipe: QuestionTitleRecipe,
  variant: QuestionTitleVariant
): TextStyle[] {
  const f = recipe.fragments;
  const styles: TextStyle[] = [f.title];
  if (variant.collapsed) styles.push(f.collapsed);
  if (variant.errorTone) styles.push(f.errorTone);
  return styles;
}
