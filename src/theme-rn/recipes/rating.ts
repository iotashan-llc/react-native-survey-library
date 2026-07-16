/**
 * Rating-question recipe (task 1.14, design:
 * docs/design/0.7-metrics-fixture.md, "Rating item" row added by this
 * task). Fixture harvested from `default-theme/blocks/sd-rating.scss`:
 * `.sd-rating__item` (numbers/labels "pill" shape), `.sd-rating__item-
 * smiley` (circular smiley wrapper), `.sd-rating__item-star` (bare icon,
 * no wrapper background states -- selection is an icon swap, handled at
 * the component layer). Follows the SAME build/select-split discipline as
 * `item.ts`/`button.ts`: atomic `StyleSheet.create`'d fragments compose
 * (array-style, later-wins) into EXACTLY the fixture's legal states.
 *
 * Legal states -- 11 tuples, mirroring `item.ts`'s precedence cascade
 * (readOnly > preview > pressed(gated) > focused > error > base), each
 * paired with an orthogonal `selected` boolean EXCEPT `pressed` (upstream
 * `--allowhover:hover` has no documented selected variant, same as
 * `item.ts`'s pressed tuple): base(+selected) x2, readOnly(+selected) x2,
 * preview(+selected) x2, error(+selected) x2, focused(+selected) x2,
 * pressed x1.
 *
 * Documented RN deltas (v1 scope, task 1.8/1.14 framing):
 * - `rateColorMode: "scale"`/`scaleColorMode: "colored"` per-item
 *   gradient coloring (`getItemStyle`'s `--sd-rating-item-color`
 *   interpolation) is NOT ported -- selected/unselected use the flat
 *   tokens above only. A gradient embellishment, not core functionality;
 *   revisit if a future task asks for exact color-scale fidelity.
 * - `rateDescriptionLocation` "top"/"bottom"/"topBottom" absolute
 *   positioning is not ported -- only the default "leftRight" (flanking,
 *   in natural flex flow) is supported.
 * - The star item's dual-SVG partial-fill overlay (`sv-star`/`sv-star-2`
 *   clip animation) collapses to a discrete unfilled/filled icon swap
 *   (component layer, RNIcon) -- no recipe fragment needed for stars
 *   beyond `starIconSize`.
 * - "disabled" (as opposed to readOnly) is RESERVED/unreachable for a
 *   rating item, same convention as `item.ts`'s `checkedDisabledReserved`
 *   (`--background-semitransparent` in `.sd-rating__item--selected
 *   .sd-rating__item--disabled` has no `--sjs-*`-prefixed form to resolve
 *   through `resolveColorVar` anyway).
 */
import { StyleSheet } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcSize, calcFontSize, resolveColorVar } from './tokenLookup';
import { mapShadowForPlatform, composeShadowLayers } from '../shadows';
import { reportShadowResult } from './types';
import type { BuildContext } from './types';

/** RAW state inputs -- the selector normalizes to a legal tuple (same discipline as `item.ts`/`button.ts`). */
export interface RatingItemStateInput {
  selected: boolean;
  /** Live Pressable state -- gated by `allowHover && !readOnly` IN the selector, same as `item.ts`. */
  pressed: boolean;
  focused: boolean;
  readOnly: boolean;
  preview: boolean;
  error: boolean;
  allowHover: boolean;
}

export type RatingItemStateKind =
  'base' | 'readOnly' | 'preview' | 'error' | 'focused' | 'pressed';

export interface RatingItemLegalState {
  kind: RatingItemStateKind;
  /** `pressed` never carries `selected` -- mirrors `item.ts`'s pressed tuple. */
  selected: boolean;
}

/**
 * Precedence cascade identical in shape to `item.ts`'s
 * `resolveItemLegalState`: readOnly > preview > pressed(gated) > focused >
 * error > base.
 */
export function resolveRatingItemLegalState(
  input: RatingItemStateInput
): RatingItemLegalState {
  if (input.readOnly) return { kind: 'readOnly', selected: input.selected };
  if (input.preview) return { kind: 'preview', selected: input.selected };
  if (input.pressed && input.allowHover)
    return { kind: 'pressed', selected: false };
  if (input.focused) return { kind: 'focused', selected: input.selected };
  if (input.error) return { kind: 'error', selected: input.selected };
  return { kind: 'base', selected: input.selected };
}

export interface RatingPillFragments {
  base: TextStyle;
  selected: TextStyle;
  readOnly: TextStyle;
  selectedReadOnly: TextStyle;
  preview: TextStyle;
  selectedPreview: TextStyle;
  error: TextStyle;
  focused: TextStyle;
  selectedFocused: TextStyle;
  pressed: TextStyle;
}

export interface RatingSmileyFragments {
  base: ViewStyle;
  selected: ViewStyle;
  readOnly: ViewStyle;
  selectedReadOnly: ViewStyle;
  preview: ViewStyle;
  selectedPreview: ViewStyle;
  error: ViewStyle;
  focused: ViewStyle;
  selectedFocused: ViewStyle;
  pressed: ViewStyle;
}

export interface RatingRecipe {
  fragments: {
    /** `.sd-rating fieldset` -- the item row. */
    row: ViewStyle;
    /** `.sd-rating__min-text`/`.sd-rating__max-text` (leftRight/default placement only -- see module doc). */
    minMaxText: TextStyle;
    /** `.sd-rating__item` -- numbers/labels "pill" shape. */
    pill: RatingPillFragments;
    /** `.sd-rating__item-smiley` -- circular smiley wrapper. */
    smiley: RatingSmileyFragments;
  };
  /** `.sd-rating__item-star` -- `width`/`height: calcSize(6)`, no wrapper background states. */
  starIconSize: number;
  smileyIconFills: {
    unselected: string;
    selected: string;
    readOnly: string;
    selectedReadOnly: string;
    preview: string;
    selectedPreview: string;
    error: string;
  };
}

export function buildRatingRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): RatingRecipe {
  const sink = buildCtx?.diagnostics;
  const platform = buildCtx?.platform ?? { os: 'ios' as const };
  const ctx: BuildContext = buildCtx ?? { platform };

  const baseShadow = mapShadowForPlatform(
    resolved.tokens.shadows.small,
    platform
  );
  reportShadowResult(ctx, '--sjs-shadow-small', baseShadow);
  const smallResetShadow = mapShadowForPlatform(
    resolved.tokens.shadows.smallReset,
    platform
  );
  reportShadowResult(ctx, '--sjs-shadow-small-reset', smallResetShadow);
  const focusRing = mapShadowForPlatform(
    composeShadowLayers(resolved.tokens.shadows.smallReset, [
      {
        inset: false,
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadRadius: 2,
        color: resolveColorVar(resolved, '--sjs-primary-backcolor', sink),
      },
    ]),
    platform
  );
  const selectedFocusRing = mapShadowForPlatform(
    composeShadowLayers(resolved.tokens.shadows.smallReset, [
      {
        inset: true,
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadRadius: 4,
        color: resolveColorVar(resolved, '--sjs-general-backcolor', sink),
      },
      {
        inset: false,
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadRadius: 2,
        color: resolveColorVar(resolved, '--sjs-primary-backcolor', sink),
      },
    ]),
    platform
  );

  const pill = StyleSheet.create({
    base: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-question-background',
        sink
      ).css,
      borderRadius: calcSize(resolved, 12.5),
      paddingVertical: calcSize(resolved, 0.5),
      paddingHorizontal: calcSize(resolved, 2.5),
      minHeight: calcSize(resolved, 6),
      minWidth: calcSize(resolved, 6),
      alignItems: 'center',
      justifyContent: 'center',
      color: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
      fontSize: calcFontSize(resolved, 1),
      boxShadow: baseShadow.boxShadow,
      elevation: baseShadow.elevation,
    },
    selected: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-primary-backcolor',
        sink
      ).css,
      color: resolveColorVar(resolved, '--sjs-primary-forecolor', sink).css,
      fontWeight: '600',
      boxShadow: [],
      elevation: 0,
    },
    readOnly: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: resolveColorVar(resolved, '--sjs-border-inside', sink).css,
      boxShadow: [],
      elevation: 0,
      color: resolveColorVar(resolved, '--sjs-general-forecolor-light', sink)
        .css,
    },
    selectedReadOnly: {
      borderColor: resolveColorVar(resolved, '--sjs-general-forecolor', sink)
        .css,
      color: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
    },
    preview: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: 'transparent',
      boxShadow: [],
      elevation: 0,
      color: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
    },
    selectedPreview: {
      borderColor: resolveColorVar(resolved, '--sjs-general-forecolor', sink)
        .css,
      color: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
    },
    error: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-special-red-light',
        sink
      ).css,
      boxShadow: [],
      elevation: 0,
    },
    focused: {
      boxShadow: focusRing.boxShadow,
      elevation: focusRing.elevation,
    },
    selectedFocused: {
      boxShadow: selectedFocusRing.boxShadow,
      elevation: selectedFocusRing.elevation,
    },
    pressed: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-general-backcolor-dark',
        sink
      ).css,
    },
  });

  const smiley = StyleSheet.create({
    base: {
      borderRadius: calcSize(resolved, 12.5),
      padding: calcSize(resolved, 1.25),
      minWidth: calcSize(resolved, 6),
      minHeight: calcSize(resolved, 6),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: resolveColorVar(resolved, '--sjs-border-default', sink).css,
      boxShadow: smallResetShadow.boxShadow,
      elevation: smallResetShadow.elevation,
    },
    selected: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-primary-backcolor',
        sink
      ).css,
      borderColor: resolveColorVar(resolved, '--sjs-primary-backcolor', sink)
        .css,
    },
    readOnly: {
      borderColor: resolveColorVar(resolved, '--sjs-border-default', sink).css,
    },
    selectedReadOnly: {
      borderColor: resolveColorVar(resolved, '--sjs-general-forecolor', sink)
        .css,
      backgroundColor: 'transparent',
    },
    preview: {
      borderWidth: 1,
      borderColor: resolveColorVar(resolved, '--sjs-general-forecolor', sink)
        .css,
    },
    selectedPreview: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-general-forecolor',
        sink
      ).css,
    },
    error: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-special-red-light',
        sink
      ).css,
      borderColor: 'transparent',
    },
    focused: {
      borderWidth: 0,
      boxShadow: focusRing.boxShadow,
      elevation: focusRing.elevation,
    },
    selectedFocused: {
      borderWidth: 0,
      boxShadow: selectedFocusRing.boxShadow,
      elevation: selectedFocusRing.elevation,
    },
    pressed: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-general-backcolor-dark',
        sink
      ).css,
      borderColor: resolveColorVar(resolved, '--sjs-border-default', sink).css,
    },
  });

  const fragments = {
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: calcSize(resolved, 1),
    },
    minMaxText: {
      fontSize: calcFontSize(resolved, 1),
      color: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
      paddingHorizontal: calcSize(resolved, 1),
    },
    pill,
    smiley,
  };

  return {
    fragments,
    starIconSize: calcSize(resolved, 6),
    smileyIconFills: {
      unselected: resolveColorVar(resolved, '--sjs-border-default', sink).css,
      selected: resolveColorVar(resolved, '--sjs-primary-forecolor', sink).css,
      readOnly: resolveColorVar(resolved, '--sjs-border-default', sink).css,
      selectedReadOnly: resolveColorVar(
        resolved,
        '--sjs-general-forecolor',
        sink
      ).css,
      preview: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
      selectedPreview: resolveColorVar(
        resolved,
        '--sjs-general-backcolor',
        sink
      ).css,
      error: resolveColorVar(resolved, '--sjs-general-forecolor-light', sink)
        .css,
    },
  };
}

/**
 * Array composition per shape, later wins (same discipline as
 * `selectItemStyles`/`selectButtonStyles`) -- exhaustive over the legal-
 * state union.
 */
export function selectRatingPillStyles(
  recipe: RatingRecipe,
  input: RatingItemStateInput
): TextStyle[] {
  const f = recipe.fragments.pill;
  const state = resolveRatingItemLegalState(input);
  const styles: TextStyle[] = [f.base];
  switch (state.kind) {
    case 'base':
      if (state.selected) styles.push(f.selected);
      break;
    case 'readOnly':
      styles.push(f.readOnly);
      if (state.selected) styles.push(f.selectedReadOnly);
      break;
    case 'preview':
      styles.push(f.preview);
      if (state.selected) styles.push(f.selectedPreview);
      break;
    case 'error':
      if (state.selected) styles.push(f.selected);
      styles.push(f.error);
      break;
    case 'focused':
      if (state.selected) {
        styles.push(f.selected, f.selectedFocused);
      } else {
        styles.push(f.focused);
      }
      break;
    case 'pressed':
      styles.push(f.pressed);
      break;
  }
  return styles;
}

export function selectRatingSmileyStyles(
  recipe: RatingRecipe,
  input: RatingItemStateInput
): ViewStyle[] {
  const f = recipe.fragments.smiley;
  const state = resolveRatingItemLegalState(input);
  const styles: ViewStyle[] = [f.base];
  switch (state.kind) {
    case 'base':
      if (state.selected) styles.push(f.selected);
      break;
    case 'readOnly':
      styles.push(f.readOnly);
      if (state.selected) styles.push(f.selectedReadOnly);
      break;
    case 'preview':
      styles.push(f.preview);
      if (state.selected) styles.push(f.selectedPreview);
      break;
    case 'error':
      if (state.selected) styles.push(f.selected);
      styles.push(f.error);
      break;
    case 'focused':
      if (state.selected) {
        styles.push(f.selected, f.selectedFocused);
      } else {
        styles.push(f.focused);
      }
      break;
    case 'pressed':
      styles.push(f.pressed);
      break;
  }
  return styles;
}

/** Mirrors `item.ts`'s `selectIconFill` -- smiley icon fill per legal state. */
export function selectRatingSmileyIconFill(
  recipe: RatingRecipe,
  input: Pick<
    RatingItemStateInput,
    'selected' | 'readOnly' | 'preview' | 'error'
  >
): string {
  const fills = recipe.smileyIconFills;
  if (input.error) return fills.error;
  if (input.preview)
    return input.selected ? fills.selectedPreview : fills.preview;
  if (input.readOnly)
    return input.selected ? fills.selectedReadOnly : fills.readOnly;
  return input.selected ? fills.selected : fills.unselected;
}
