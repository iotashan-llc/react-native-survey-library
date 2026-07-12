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
import { mapShadowForPlatform, composeShadowLayers } from '../shadows';
import { reportShadowResult } from './types';
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
  const sink = buildCtx.diagnostics;
  const decoratorSize = calcSize(resolved, 3);
  // Base decorator carries the inner shadow verbatim (sd-item.scss:20:
  // `box-shadow: $shadow-inner, 0 0 0 0px $primary` — the 0-spread primary
  // layer is a web transition anchor, invisible; not carried per the
  // fixture's no-transition policy).
  const innerShadow = mapShadowForPlatform(
    resolved.tokens.shadows.inner,
    buildCtx.platform
  );
  reportShadowResult(buildCtx, '--sjs-shadow-inner', innerShadow);
  // Focus = innerReset + 2dp primary ring (sd-item.scss:46:
  // `box-shadow: $shadow-inner-reset, 0 0 0 2px $primary`) — composed,
  // not the bare ring (codex impl-review major 1).
  const focusRing = mapShadowForPlatform(
    composeShadowLayers(resolved.tokens.shadows.innerReset, [
      {
        inset: false,
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadRadius: 2,
        color: resolveColorVar(resolved, '--sjs-primary-backcolor', sink),
      },
    ]),
    buildCtx.platform
  );
  reportShadowResult(buildCtx, '--sjs-shadow-inner-reset', focusRing);

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
      backgroundColor: resolveColorVar(resolved, '--sjs-editor-background', sink)
        .css,
      boxShadow: innerShadow.boxShadow,
      elevation: innerShadow.elevation,
    },
    decoratorRadiusCheckbox: {
      borderRadius: calcCornerRadius(resolved, 0.5),
    },
    decoratorRadiusRadio: {
      borderRadius: decoratorSize / 2,
    },
    decoratorChecked: {
      backgroundColor: resolveColorVar(resolved, '--sjs-primary-backcolor', sink)
        .css,
      // sd-item.scss:40: `.sd-item--checked .sd-item__decorator { box-shadow: none }`
      boxShadow: [],
      elevation: 0,
    },
    decoratorReadOnly: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-general-backcolor-dark',
        sink
      ).css,
      boxShadow: [],
      elevation: 0,
    },
    decoratorPreview: {
      backgroundColor: 'transparent',
      boxShadow: [],
      elevation: 0,
    },
    decoratorError: {
      backgroundColor: resolveColorVar(resolved, '--sjs-special-red-light', sink)
        .css,
    },
    decoratorFocused: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-question-background',
        sink
      ).css,
      boxShadow: focusRing.boxShadow,
      elevation: focusRing.elevation,
    },
    decoratorPressed: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-general-backcolor-dim-dark',
        sink
      ).css,
    },
    label: {
      fontFamily: resolved.tokens.typography.editor.fontFamily || undefined,
      fontWeight: String(
        resolved.tokens.typography.editor.fontWeight
      ) as TextStyle['fontWeight'],
      fontSize: resolved.tokens.typography.editor.fontSize,
      lineHeight: resolved.tokens.typography.editorLineHeight,
      color: resolveColorVar(resolved, '--sjs-font-questiontitle-color', sink)
        .css,
    },
    rowMode: {
      flexDirection: 'row',
      columnGap: calcSize(resolved, 4),
    },
    labelStack: {
      gap: calcSize(resolved, 1),
    },
    description: {
      // Logical START padding (RTL-aware; codex impl-review major 7) —
      // the fixture's "description.paddingLeft" is web-LTR phrasing; RN's
      // start/end resolve per I18nManager.isRTL at layout.
      paddingStart: calcSize(resolved, 4),
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
      checked: resolveColorVar(resolved, '--sjs-primary-forecolor', sink).css,
      checkedFocused: resolveColorVar(resolved, '--sjs-primary-backcolor', sink)
        .css,
      checkedReadOnly: resolveColorVar(resolved, '--sjs-general-forecolor', sink)
        .css,
      checkedDisabledReserved: resolveColorVar(
        resolved,
        '--sjs-border-default',
        sink
      ).css,
      preview: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
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
