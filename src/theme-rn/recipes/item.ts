/**
 * Choice-item recipe (design: docs/design/0.7-theme-rn.md, "Recipes";
 * docs/design/0.7-metrics-fixture.md, "Choice item (checkbox/radio)").
 * `sd-item.scss`/`sd-checkbox.scss`/`sd-selectbase.scss` — checkbox/radio/
 * imagepicker/etc. choice items. ~9 atomic `StyleSheet.create`'d
 * fragments compose (array-style, later-wins) into EXACTLY the fixture's
 * 12 legal states — never a blind Cartesian table.
 */
import { StyleSheet } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcSize, calcCornerRadius, resolveColorVar } from './tokenLookup';
import { mapShadowForPlatform } from '../shadows';
import type { BuildContext } from './types';

export interface ItemVariant {
  checked: boolean;
  /** Gate (`allowHover && !readOnly`) is the CALLER's responsibility (design: "allowHover && !readOnly precedence enforced in the selector" — enforced by the component passing `pressed: false` when the gate fails, not re-derived here). */
  pressed: boolean;
  focused: boolean;
  readOnly: boolean;
  preview: boolean;
  error: boolean;
  /** Mutually-exclusive add-on composing with base/checked (fixture: "none/selectAll"); no distinct visual delta documented, so it participates in state ENUMERATION only. */
  none?: boolean;
}

export type ItemShape = 'checkbox' | 'radio';

export interface ItemRecipe {
  fragments: {
    container: ViewStyle;
    decoratorBase: ViewStyle;
    decoratorRadiusCheckbox: ViewStyle;
    decoratorRadiusRadio: ViewStyle;
    decoratorChecked: ViewStyle;
    decoratorReadOnly: ViewStyle;
    decoratorPreview: ViewStyle;
    decoratorError: ViewStyle;
    decoratorFocused: ViewStyle;
    decoratorPressed: ViewStyle;
    label: TextStyle;
    rowMode: ViewStyle;
    labelStack: ViewStyle;
    description: TextStyle;
    /** Reserved -- unreachable for select-item getters per the bridge reachability table (fixture: "label.opacity -- DISABLED class family"). Kept for a future live consumer, never selected by this module's own states. */
    labelDisabledReserved: TextStyle;
  };
  iconSize: number;
  iconFills: {
    unchecked: string;
    checked: string;
    checkedFocused: string;
    checkedReadOnly: string;
    /** Reserved -- disabled unreachable for select items (see labelDisabledReserved). */
    checkedDisabledReserved: string;
    preview: string;
  };
}

export function buildItemRecipe(
  resolved: ResolvedTheme,
  buildCtx: BuildContext
): ItemRecipe {
  const decoratorSize = calcSize(resolved, 3);
  const focusRing = mapShadowForPlatform(
    [
      {
        inset: false,
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadRadius: 2,
        color: resolveColorVar(resolved, '--sjs-primary-backcolor'),
      },
    ],
    buildCtx.platform
  );

  const fragments = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: calcSize(resolved, 1.5),
      gap: calcSize(resolved, 1),
    },
    decoratorBase: {
      width: decoratorSize,
      height: decoratorSize,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: resolveColorVar(resolved, '--sjs-editor-background').css,
    },
    decoratorRadiusCheckbox: {
      borderRadius: calcCornerRadius(resolved, 0.5),
    },
    decoratorRadiusRadio: {
      borderRadius: decoratorSize / 2,
    },
    decoratorChecked: {
      backgroundColor: resolveColorVar(resolved, '--sjs-primary-backcolor').css,
    },
    decoratorReadOnly: {
      backgroundColor: resolveColorVar(resolved, '--sjs-general-backcolor-dark')
        .css,
      boxShadow: [],
    },
    decoratorPreview: {
      backgroundColor: 'transparent',
      boxShadow: [],
    },
    decoratorError: {
      backgroundColor: resolveColorVar(resolved, '--sjs-special-red-light').css,
    },
    decoratorFocused: {
      backgroundColor: resolveColorVar(resolved, '--sjs-question-background')
        .css,
      boxShadow: focusRing.boxShadow,
    },
    decoratorPressed: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-general-backcolor-dim-dark'
      ).css,
    },
    label: {
      fontFamily: resolved.tokens.typography.editor.fontFamily || undefined,
      fontWeight: String(resolved.tokens.typography.editor.fontWeight) as TextStyle['fontWeight'],
      fontSize: resolved.tokens.typography.editor.fontSize,
      lineHeight: resolved.tokens.typography.editorLineHeight,
      color: resolveColorVar(resolved, '--sjs-font-questiontitle-color').css,
    },
    rowMode: {
      flexDirection: 'row',
      columnGap: calcSize(resolved, 4),
    },
    labelStack: {
      gap: calcSize(resolved, 1),
    },
    description: {
      paddingLeft: calcSize(resolved, 4),
    },
    labelDisabledReserved: {
      opacity: 0.25,
    },
  });

  return {
    fragments,
    iconSize: calcSize(resolved, 2),
    iconFills: {
      unchecked: 'transparent',
      checked: resolveColorVar(resolved, '--sjs-primary-forecolor').css,
      checkedFocused: resolveColorVar(resolved, '--sjs-primary-backcolor').css,
      checkedReadOnly: resolveColorVar(resolved, '--sjs-general-forecolor').css,
      checkedDisabledReserved: resolveColorVar(resolved, '--sjs-border-default')
        .css,
      preview: resolveColorVar(resolved, '--sjs-general-forecolor').css,
    },
  };
}

/**
 * Array composition, later wins (design: "zero object allocation beyond
 * the composed array"). `readOnly` is composed AFTER `checked` so its
 * background wins over checked's per the fixture ("state.readOnly =
 * background-dark, no shadow" applies regardless of checked).
 */
export function selectItemStyles(
  recipe: ItemRecipe,
  variant: ItemVariant,
  _mode: { narrow: boolean; rtl: boolean },
  shape: ItemShape
): ViewStyle[] {
  const f = recipe.fragments;
  const styles: ViewStyle[] = [
    f.container,
    f.decoratorBase,
    shape === 'radio' ? f.decoratorRadiusRadio : f.decoratorRadiusCheckbox,
  ];
  if (variant.checked) styles.push(f.decoratorChecked);
  if (variant.preview) styles.push(f.decoratorPreview);
  if (variant.error) styles.push(f.decoratorError);
  if (variant.pressed) styles.push(f.decoratorPressed);
  if (variant.focused) styles.push(f.decoratorFocused);
  // readOnly last among state fragments: wins the background regardless
  // of checked/preview/error/pressed/focused, per the fixture.
  if (variant.readOnly) styles.push(f.decoratorReadOnly);
  return styles;
}

export function selectIconFill(
  recipe: ItemRecipe,
  variant: Pick<ItemVariant, 'checked' | 'focused' | 'readOnly'> & {
    preview: boolean;
  }
): string {
  if (variant.preview) return recipe.iconFills.preview;
  if (!variant.checked) return recipe.iconFills.unchecked;
  if (variant.readOnly) return recipe.iconFills.checkedReadOnly;
  if (variant.focused) return recipe.iconFills.checkedFocused;
  return recipe.iconFills.checked;
}
