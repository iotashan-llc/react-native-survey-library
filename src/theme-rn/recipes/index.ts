/**
 * `buildRecipes(resolved, buildCtx)` — the provider's single entry point
 * (design: docs/design/0.7-theme-rn.md, "Recipes — build/select split").
 * Aggregates the exemplar recipes; per-component recipes beyond these
 * are each component task's own responsibility (design ownership table).
 * Task 1.8 adds `progress` (nav/progress bar); task 1.14 adds `rating`.
 */
import type { ResolvedTheme } from '../../theme-core/resolve';
import type { BuildContext } from './types';
import { buildItemRecipe, type ItemRecipe } from './item';
import { buildInputRecipe, type InputRecipe } from './input';
import { buildButtonRecipe, type ButtonRecipe } from './button';
import { buildProgressRecipe, type ProgressRecipe } from './progress';
import { buildRatingRecipe, type RatingRecipe } from './rating';
import {
  buildQuestionTitleRecipe,
  type QuestionTitleRecipe,
} from './questionTitle';
import {
  buildUnsupportedQuestionRecipe,
  type UnsupportedQuestionRecipe,
} from './unsupportedQuestion';
import { buildHeaderRecipe, type HeaderRecipe } from './header';

export interface Recipes {
  item: ItemRecipe;
  input: InputRecipe;
  button: ButtonRecipe;
  questionTitle: QuestionTitleRecipe;
  unsupportedQuestion: UnsupportedQuestionRecipe;
  /** Basic survey header (task 1.6). */
  header: HeaderRecipe;
  /** Percentage progress bar (task 1.8). */
  progress: ProgressRecipe;
  /** Rating question button-row items (task 1.14). */
  rating: RatingRecipe;
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
    header: buildHeaderRecipe(resolved, buildCtx),
    progress: buildProgressRecipe(resolved, buildCtx),
    rating: buildRatingRecipe(resolved, buildCtx),
  };
}

export * from './types';
export * from './item';
export * from './input';
export * from './button';
export * from './questionTitle';
export * from './unsupportedQuestion';
export * from './header';
export * from './progress';
export * from './rating';
