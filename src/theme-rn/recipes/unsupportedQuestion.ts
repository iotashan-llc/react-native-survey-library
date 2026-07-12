/**
 * UnsupportedQuestion recipe (design ownership table: "UnsupportedQuestion
 * themed recipe (promised in 0.5) | 0.7 -- recipe + wiring in the
 * component"; docs/design/0.7-metrics-fixture.md, "UnsupportedQuestion" --
 * "No upstream analog -- composed from tokens, source = this fixture.").
 * Neutral panel using question-container tokens.
 */
import { StyleSheet } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcSize, calcLineHeight, resolveColorVar } from './tokenLookup';
import {
  buildQuestionTitleRecipe,
  type QuestionTitleRecipe,
} from './questionTitle';

export interface UnsupportedQuestionRecipe {
  fragments: {
    panel: ViewStyle;
    message: TextStyle;
    errorAccentBar: ViewStyle;
  };
  title: QuestionTitleRecipe;
}

export function buildUnsupportedQuestionRecipe(
  resolved: ResolvedTheme
): UnsupportedQuestionRecipe {
  const fragments = StyleSheet.create({
    panel: {
      backgroundColor: resolveColorVar(resolved, '--sjs-editor-background').css,
      borderWidth: 1,
      borderColor: resolveColorVar(resolved, '--sjs-border-default').css,
      borderRadius: resolved.tokens.typography.editorCornerRadius,
      padding: calcSize(resolved, 2),
    },
    message: {
      fontFamily: resolved.tokens.typography.editor.fontFamily || undefined,
      fontSize: resolved.tokens.typography.editor.fontSize,
      lineHeight: calcLineHeight(resolved, 1.5),
      color: resolveColorVar(resolved, '--sjs-general-forecolor').css,
    },
    errorAccentBar: {
      width: 3,
      backgroundColor: resolveColorVar(resolved, '--sjs-special-red').css,
    },
  });

  return { fragments, title: buildQuestionTitleRecipe(resolved) };
}
