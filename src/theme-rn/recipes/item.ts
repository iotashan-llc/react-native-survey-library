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

/** Mutually-exclusive add-ons composing with base/checked (fixture: "none/selectAll"); no distinct visual delta documented, so they participate in state ENUMERATION only. */
export type ItemAddOn = 'none' | 'selectAll';

/**
 * RAW state inputs (bridge flags + native interaction state). The
 * selector — not the caller — normalizes these to one of the fixture's
 * 12 legal tuples, INCLUDING the hover gate (`allowHover && !readOnly`;
 * codex impl-review major 2: the gate lives here, and arbitrary boolean
 * Cartesians can no longer select an unenumerated combination).
 */
export interface ItemStateInput {
  checked: boolean;
  /** Live Pressable state — gated by `allowHover && !readOnly` IN the selector. */
  pressed: boolean;
  focused: boolean;
  readOnly: boolean;
  preview: boolean;
  error: boolean;
  /** Upstream affordance gate (`itemHover` class: `!disabled && !checked && !designMode`) — the bridge's `hover` flag. */
  allowHover: boolean;
  addOn?: ItemAddOn;
}

/**
 * The fixture's EXACT 12 legal tuples ("Legal-state enumerations": base ·
 * checked · readOnly · checked+readOnly · preview · checked+preview ·
 * error · checked+error · pressed(gated) · focused · checked+focused ·
 * none/selectAll) as a discriminated union — base×checked(+addOn) = 3,
 * readOnly×2, preview×2, error×2, pressed×1 (the gate implies !checked
 * upstream), focused×2.
 */
export type ItemLegalState =
  | { kind: 'base'; checked: boolean; addOn?: ItemAddOn }
  | { kind: 'readOnly'; checked: boolean }
  | { kind: 'preview'; checked: boolean }
  | { kind: 'error'; checked: boolean }
  | { kind: 'pressed' }
  | { kind: 'focused'; checked: boolean };

export type ItemShape = 'checkbox' | 'radio';

/**
 * Selected styles are returned per SLOT — the container (row layout) and
 * the decorator (checkbox/radio box) are different native views and must
 * never share one style array (codex impl-review major 2: "separate
 * container vs decorator slot mixing").
 */
export interface ItemSelectedStyles {
  container: ViewStyle[];
  decorator: ViewStyle[];
}

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
 * Normalizes raw flags to EXACTLY one of the fixture's 12 legal tuples.
 * Precedence follows the upstream cascade for pairwise conflicts:
 * readOnly (doubled-specificity readonly rules + gate) > preview
 * (doubled-specificity) > pressed (hover selector, highest specificity,
 * gated `allowHover && !readOnly`) > focused > error > base. The hover
 * gate is enforced HERE (codex impl-review major 2), and the pressed
 * tuple carries no `checked` (upstream `allowHover` already excludes
 * checked items).
 */
export function resolveItemLegalState(input: ItemStateInput): ItemLegalState {
  if (input.readOnly) return { kind: 'readOnly', checked: input.checked };
  if (input.preview) return { kind: 'preview', checked: input.checked };
  if (input.pressed && input.allowHover) return { kind: 'pressed' };
  if (input.focused) return { kind: 'focused', checked: input.checked };
  if (input.error) return { kind: 'error', checked: input.checked };
  return { kind: 'base', checked: input.checked, addOn: input.addOn };
}

/**
 * Array composition per SLOT, later wins (design: "zero object allocation
 * beyond the composed array" — now one array per slot). The decorator
 * composition is an EXHAUSTIVE map over the legal-state union — there is
 * no path that composes an unenumerated combination.
 */
export function selectItemStyles(
  recipe: ItemRecipe,
  input: ItemStateInput,
  _mode: { narrow: boolean; rtl: boolean },
  shape: ItemShape
): ItemSelectedStyles {
  const f = recipe.fragments;
  const state = resolveItemLegalState(input);
  const decorator: ViewStyle[] = [
    f.decoratorBase,
    shape === 'radio' ? f.decoratorRadiusRadio : f.decoratorRadiusCheckbox,
  ];
  switch (state.kind) {
    case 'base':
      // addOn ('none'/'selectAll') participates in enumeration only — no
      // documented visual delta (fixture).
      if (state.checked) decorator.push(f.decoratorChecked);
      break;
    case 'readOnly':
      if (state.checked) decorator.push(f.decoratorChecked);
      decorator.push(f.decoratorReadOnly);
      break;
    case 'preview':
      if (state.checked) decorator.push(f.decoratorChecked);
      decorator.push(f.decoratorPreview);
      break;
    case 'error':
      if (state.checked) decorator.push(f.decoratorChecked);
      decorator.push(f.decoratorError);
      break;
    case 'pressed':
      decorator.push(f.decoratorPressed);
      break;
    case 'focused':
      if (state.checked) decorator.push(f.decoratorChecked);
      decorator.push(f.decoratorFocused);
      break;
  }
  return { container: [f.container], decorator };
}

export function selectIconFill(
  recipe: ItemRecipe,
  variant: Pick<
    ItemStateInput,
    'checked' | 'focused' | 'readOnly' | 'preview'
  >
): string {
  if (variant.preview) return recipe.iconFills.preview;
  if (!variant.checked) return recipe.iconFills.unchecked;
  if (variant.readOnly) return recipe.iconFills.checkedReadOnly;
  if (variant.focused) return recipe.iconFills.checkedFocused;
  return recipe.iconFills.checked;
}
