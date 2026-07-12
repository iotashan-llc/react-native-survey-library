/**
 * `buildRecipes(resolved, buildCtx)` — the provider's single entry point
 * (design: docs/design/0.7-theme-rn.md, "Recipes — build/select split").
 * Aggregates the 4+1 exemplar recipes; per-component recipes beyond these
 * are each component task's own responsibility (design ownership table).
 */
import type { ResolvedTheme } from '../../theme-core/resolve';
import type { BuildContext } from './types';
import { buildItemRecipe, type ItemRecipe } from './item';
import { buildInputRecipe, type InputRecipe } from './input';
import { buildButtonRecipe, type ButtonRecipe } from './button';
import {
  buildQuestionTitleRecipe,
  type QuestionTitleRecipe,
} from './questionTitle';
import {
  buildUnsupportedQuestionRecipe,
  type UnsupportedQuestionRecipe,
} from './unsupportedQuestion';

export interface Recipes {
  item: ItemRecipe;
  input: InputRecipe;
  button: ButtonRecipe;
  questionTitle: QuestionTitleRecipe;
  unsupportedQuestion: UnsupportedQuestionRecipe;
}

export function buildRecipes(
  resolved: ResolvedTheme,
  buildCtx: BuildContext
): Recipes {
  return {
    item: buildItemRecipe(resolved, buildCtx),
    input: buildInputRecipe(resolved, buildCtx),
    button: buildButtonRecipe(resolved, buildCtx),
    questionTitle: buildQuestionTitleRecipe(resolved, buildCtx),
    unsupportedQuestion: buildUnsupportedQuestionRecipe(resolved, buildCtx),
  };
}

export * from './types';
export * from './item';
export * from './input';
export * from './button';
export * from './questionTitle';
export * from './unsupportedQuestion';
