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
import {
  buildQuestionChromeRecipe,
  type QuestionChromeRecipe,
} from './questionChrome';
import { buildHeaderRecipe, type HeaderRecipe } from './header';
import { buildRowRecipe, type RowRecipe } from './row';
import { buildButtonGroupRecipe, type ButtonGroupRecipe } from './buttonGroup';
import { buildOverlayRecipe, type OverlayRecipe } from './overlay';
import { buildListItemRecipe, type ListItemRecipe } from './listItem';
import { buildMatrixRecipe, type MatrixRecipe } from './matrix';
import { buildRankingRecipe, type RankingRecipe } from './ranking';
import { buildSliderRecipe, type SliderRecipe } from './slider';
import { buildSignatureRecipe, type SignatureRecipe } from './signature';
import { buildImageMapRecipe, type ImageMapRecipe } from './imagemap';
import { buildTimerPanelRecipe, type TimerPanelRecipe } from './timerPanel';
import { buildProgressTocRecipe, type ProgressTocRecipe } from './progressToc';

export interface Recipes {
  item: ItemRecipe;
  input: InputRecipe;
  button: ButtonRecipe;
  questionTitle: QuestionTitleRecipe;
  unsupportedQuestion: UnsupportedQuestionRecipe;
  /** Question chrome wrapper (task 1.7). */
  questionChrome: QuestionChromeRecipe;
  /** Basic survey header (task 1.6). */
  header: HeaderRecipe;
  /** Percentage progress bar (task 1.8). */
  progress: ProgressRecipe;
  /** Rating question button-row items (task 1.14). */
  rating: RatingRecipe;
  /** Row/element composition geometry (task 1.4). */
  row: RowRecipe;
  /** Button-group items (task 2.9). */
  buttonGroup: ButtonGroupRecipe;
  /** Overlay host: backdrop/sheet/dialog/title/footer (task 2.1). */
  overlay: OverlayRecipe;
  /** List-picker rows/search/empty (task 2.1). */
  listItem: ListItemRecipe;
  /** Matrix-family grid primitive: gridlines/header/row-header/data/footer/detail (task 3.1a). */
  matrix: MatrixRecipe;
  /** Ranking item row: handle/rank-number/label + selectToRank areas (task 4.1). */
  ranking: RankingRecipe;
  /** Slider track/thumb/tooltip/label + single-mode stepper fallback (task 4.4). */
  slider: SliderRecipe;
  /** Signature-pad canvas/placeholder/clear + read-only image + fallback (task 5.1). */
  signature: SignatureRecipe;
  /** Image-map base image + svg-hotspot idle/selected color defaults + fallback (task 5.4). */
  imagemap: ImageMapRecipe;
  /** Survey timer panel: clock badge (major/minor) + plain-text root (task 5.7a). */
  timerPanel: TimerPanelRecipe;
  /** Table-of-contents: side-column container + mobile hamburger toggle (task 5.7b). */
  progressToc: ProgressTocRecipe;
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
    questionChrome: buildQuestionChromeRecipe(resolved, buildCtx),
    header: buildHeaderRecipe(resolved, buildCtx),
    progress: buildProgressRecipe(resolved, buildCtx),
    rating: buildRatingRecipe(resolved, buildCtx),
    row: buildRowRecipe(resolved, buildCtx),
    buttonGroup: buildButtonGroupRecipe(resolved, buildCtx),
    overlay: buildOverlayRecipe(resolved, buildCtx),
    listItem: buildListItemRecipe(resolved, buildCtx),
    matrix: buildMatrixRecipe(resolved, buildCtx),
    ranking: buildRankingRecipe(resolved, buildCtx),
    slider: buildSliderRecipe(resolved, buildCtx),
    signature: buildSignatureRecipe(resolved, buildCtx),
    imagemap: buildImageMapRecipe(resolved, buildCtx),
    timerPanel: buildTimerPanelRecipe(resolved, buildCtx),
    progressToc: buildProgressTocRecipe(resolved, buildCtx),
  };
}

export * from './types';
export * from './item';
export * from './input';
export * from './button';
export * from './questionTitle';
export * from './unsupportedQuestion';
export * from './questionChrome';
export * from './header';
export * from './progress';
export * from './rating';
export * from './row';
export * from './buttonGroup';
export * from './overlay';
export * from './listItem';
export * from './matrix';
export * from './ranking';
export * from './slider';
export * from './signature';
export * from './imagemap';
export * from './timerPanel';
export * from './progressToc';
