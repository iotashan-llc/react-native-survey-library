/**
 * Ranking recipe (task 4.1). Fixtures:
 * `default-theme/blocks/sv-ranking.scss` + `sd-ranking.scss`.
 *
 * Per invariant 6 the recipe owns ONLY:
 *  - model-derived tokens the bridge extracts from `question.getItemClass`
 *    (rank-number readOnly/preview/error backgrounds, the disabled label
 *    opacity — `.sv-ranking-item--readonly/--preview/--error` +
 *    `.sv-ranking-item--disabled .sv-ranking-item__text`), and
 *  - the native drop-placeholder ("ghost" — `.sv-ranking-item__ghost`),
 *    which is interaction state the component drives on drag.
 *
 * The component owns pressed/focused/dragging shadow — those are NOT here
 * (same split as the item/buttonGroup recipes). Rank-number FOCUS outline
 * and the web move-up/move-down keyframe animations have no ported analog
 * (documented in DIFFERENCES.md, ranking).
 *
 * Legal rank-number states: base / readOnly / preview / error. Precedence
 * follows the fixture cascade: error > preview > readOnly > base (the
 * `--error`/`--preview`/`--readonly` rules are increasingly specific and
 * the error rule is authored last).
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcFontSize,
  calcLineHeight,
  calcSize,
  resolveColorVar,
} from './tokenLookup';
import type { BuildContext } from './types';

/**
 * RAW model-state inputs (bridge flags) plus the component-owned native
 * `ghost` (drop-placeholder). `disabled` is the reachable label-opacity
 * family (`.sv-ranking-item--disabled .sv-ranking-item__text`, reachable
 * via `choicesEnableIf` unlike the base select item). `readOnly`/`preview`/
 * `error` drive the rank-number badge only.
 */
export interface RankingItemStateInput {
  disabled: boolean;
  readOnly: boolean;
  preview: boolean;
  error: boolean;
  /** Native drop-placeholder while a drag hovers this row (component-owned). */
  ghost: boolean;
}

export interface RankingRecipe {
  fragments: {
    /** `.sv-ranking` root column. */
    container: ViewStyle;
    /** `.sv-ranking-item__content` — the row (handle · index · text). */
    item: ViewStyle;
    /** `.sv-ranking-item__ghost` — drop-placeholder shown while dragging over. */
    itemGhost: ViewStyle;
    /** `.sv-ranking-item__icon-container` — drag-handle box. */
    handle: ViewStyle;
    /** `.sv-ranking-item__index` badge base (circle). */
    rankNumber: ViewStyle;
    /** `--readonly .sv-ranking-item__index` background. */
    rankNumberReadOnly: ViewStyle;
    /** `--preview .sv-ranking-item__index` (transparent + foreground border). */
    rankNumberPreview: ViewStyle;
    /** `--error .sv-ranking-item__index` (red-light). */
    rankNumberError: ViewStyle;
    /** The number text inside the badge. */
    rankNumberText: TextStyle;
    /** `.sv-ranking-item__text`. */
    label: TextStyle;
    /** `.sv-ranking-item--disabled .sv-ranking-item__text` (opacity .25). */
    labelDisabled: TextStyle;
    /** `.sv-ranking__container` — a selectToRank area. */
    area: ViewStyle;
    /** `.sv-ranking__containers-divider` (RN vertical stack → 1px rule). */
    areaDivider: ViewStyle;
    /** `.sv-ranking__container-placeholder` empty-area text. */
    placeholder: TextStyle;
  };
  handleIconSize: number;
  select(input: RankingItemStateInput): {
    item: ViewStyle[];
    rankNumber: ViewStyle[];
    label: TextStyle[];
  };
  handleIconFill(input: RankingItemStateInput): string;
}

export function buildRankingRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): RankingRecipe {
  const sink = buildCtx?.diagnostics;
  const primary = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;
  const primaryLight = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor-light',
    sink
  ).css;
  const foreground = resolveColorVar(
    resolved,
    '--sjs-general-forecolor',
    sink
  ).css;
  const foregroundLight = resolveColorVar(
    resolved,
    '--sjs-general-forecolor-light',
    sink
  ).css;
  const fontTitle = resolveColorVar(
    resolved,
    '--sjs-font-questiontitle-color',
    sink
  ).css;
  const fontDesc = resolveColorVar(
    resolved,
    '--sjs-font-questiondescription-color',
    sink
  ).css;
  const border = resolveColorVar(resolved, '--sjs-border-default', sink).css;
  const backcolorDark = resolveColorVar(
    resolved,
    '--sjs-general-backcolor-dark',
    sink
  ).css;
  const backcolorDim = resolveColorVar(
    resolved,
    '--sjs-general-backcolor-dim',
    sink
  ).css;
  const redLight = resolveColorVar(
    resolved,
    '--sjs-special-red-light',
    sink
  ).css;

  const badgeSize = calcSize(resolved, 5); // __index width/height
  const handleSize = calcSize(resolved, 3); // __icon-container
  const fontSize = calcFontSize(resolved, 1);

  const fragments = StyleSheet.create({
    container: {
      alignSelf: 'stretch',
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: calcSize(resolved, 1),
      paddingVertical: calcSize(resolved, 0.5),
      borderRadius: calcSize(resolved, 12.5),
    },
    itemGhost: {
      backgroundColor: backcolorDim,
      borderRadius: calcSize(resolved, 12.5),
      height: badgeSize,
    },
    handle: {
      width: handleSize,
      height: handleSize,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: calcSize(resolved, 1),
    },
    rankNumber: {
      width: badgeSize,
      height: badgeSize,
      borderRadius: badgeSize / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primaryLight,
      borderWidth: calcSize(resolved, 0.25),
      borderColor: 'transparent',
    },
    rankNumberReadOnly: {
      backgroundColor: backcolorDark,
    },
    rankNumberPreview: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: foreground,
    },
    rankNumberError: {
      backgroundColor: redLight,
    },
    rankNumberText: {
      color: fontTitle,
      fontSize,
      lineHeight: calcLineHeight(resolved, 1.5),
      fontWeight: '600',
    },
    label: {
      color: fontTitle,
      fontSize,
      lineHeight: calcLineHeight(resolved, 1.5),
      marginHorizontal: calcSize(resolved, 2),
      paddingVertical: calcSize(resolved, 1),
      flexShrink: 1,
    },
    labelDisabled: {
      opacity: 0.25,
    },
    area: {
      flexGrow: 1,
      flexBasis: 0,
    },
    areaDivider: {
      height: 1,
      backgroundColor: border,
      marginVertical: calcSize(resolved, 3),
    },
    placeholder: {
      color: fontDesc,
      textAlign: 'center',
      paddingVertical: calcSize(resolved, 0.5),
    },
  });

  return {
    fragments,
    handleIconSize: handleSize,
    select(input: RankingItemStateInput) {
      const item: ViewStyle[] = [fragments.item];
      if (input.ghost) item.push(fragments.itemGhost);
      const rankNumber: ViewStyle[] = [fragments.rankNumber];
      // Fixture precedence: error > preview > readOnly > base.
      if (input.error) rankNumber.push(fragments.rankNumberError);
      else if (input.preview) rankNumber.push(fragments.rankNumberPreview);
      else if (input.readOnly) rankNumber.push(fragments.rankNumberReadOnly);
      const label: TextStyle[] = [fragments.label];
      if (input.disabled) label.push(fragments.labelDisabled);
      return { item, rankNumber, label };
    },
    handleIconFill(input: RankingItemStateInput) {
      // `.sv-ranking-item__icon` fill is $primary; the disabled/readonly
      // rules HIDE the icon in web — RN keeps it visible but dimmed
      // ($foreground-light, the mobile icon fill from the fixture).
      if (input.disabled || input.readOnly) return foregroundLight;
      return primary;
    },
  };
}

export function selectRankingItemStyles(
  recipe: RankingRecipe,
  input: RankingItemStateInput
): { item: ViewStyle[]; rankNumber: ViewStyle[]; label: TextStyle[] } {
  return recipe.select(input);
}

/** Free-function mirror (parity with rating's `selectRating*` fns). */
export function rankingHandleIconFill(
  recipe: RankingRecipe,
  input: RankingItemStateInput
): string {
  return recipe.handleIconFill(input);
}
