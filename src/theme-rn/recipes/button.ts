/**
 * Button recipe (design: docs/design/0.7-metrics-fixture.md, "Button --
 * sd-button.scss"). 13 fixture-locked legal states: base · pressed ·
 * focused · disabled · small(composes) · action · actionPressed ·
 * action+focused · actionDisabled · danger · dangerPressed(=danger) ·
 * danger+focused · dangerDisabled. Pressed/focused are native interaction
 * state (design: "stays component-owned"); `variant`/`small`/`disabled`
 * are model/usage-site-derived.
 */
import { StyleSheet } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcSize,
  calcFontSize,
  calcLineHeight,
  calcCornerRadius,
  resolveColorVar,
} from './tokenLookup';
import { mapShadowForPlatform, composeShadowLayers } from '../shadows';
import type { BuildContext } from './types';

export type ButtonKind = 'default' | 'action' | 'danger';

export interface ButtonVariant {
  pressed: boolean;
  focused: boolean;
  disabled: boolean;
  small: boolean;
  variant: ButtonKind;
}

export interface ButtonRecipe {
  fragments: {
    base: TextStyle;
    small: ViewStyle;
    pressedDefault: ViewStyle;
    focused: ViewStyle;
    disabled: TextStyle;
    action: TextStyle;
    actionPressed: ViewStyle;
    actionDisabled: TextStyle;
    danger: TextStyle;
    dangerDisabled: TextStyle;
  };
}

export function buildButtonRecipe(
  resolved: ResolvedTheme,
  buildCtx: BuildContext
): ButtonRecipe {
  const focusRing = mapShadowForPlatform(
    composeShadowLayers(resolved.tokens.shadows.smallReset, [
      {
        inset: false,
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadRadius: 2,
        color: resolveColorVar(resolved, '--sjs-primary-backcolor'),
      },
    ]),
    buildCtx.platform
  );
  const baseShadow = mapShadowForPlatform(
    resolved.tokens.shadows.small,
    buildCtx.platform
  );

  const fragments = StyleSheet.create({
    base: {
      paddingVertical: calcSize(resolved, 2),
      paddingHorizontal: calcSize(resolved, 6),
      borderRadius: calcCornerRadius(resolved, 1),
      fontFamily: resolved.tokens.typography.base.fontFamily || undefined,
      fontWeight: '600',
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: resolveColorVar(resolved, '--sjs-primary-backcolor').css,
      backgroundColor: resolveColorVar(resolved, '--sjs-question-background')
        .css,
      boxShadow: baseShadow.boxShadow,
    },
    small: {
      paddingVertical: calcSize(resolved, 1.5),
      paddingHorizontal: calcSize(resolved, 4),
      flexGrow: 1,
    },
    pressedDefault: {
      backgroundColor: resolveColorVar(resolved, '--sjs-general-backcolor-dark')
        .css,
    },
    focused: {
      boxShadow: focusRing.boxShadow,
    },
    disabled: {
      color: resolveColorVar(resolved, '--sjs-general-forecolor').css,
      opacity: 0.25,
    },
    action: {
      backgroundColor: resolveColorVar(resolved, '--sjs-primary-backcolor').css,
      color: resolveColorVar(resolved, '--sjs-primary-forecolor').css,
    },
    actionPressed: {
      backgroundColor: resolveColorVar(resolved, '--sjs-primary-backcolor-dark')
        .css,
    },
    actionDisabled: {
      color: resolveColorVar(resolved, '--sjs-primary-forecolor-light').css,
      opacity: 0.25,
    },
    danger: {
      backgroundColor: resolveColorVar(resolved, '--sjs-special-red').css,
      color: resolveColorVar(resolved, '--sjs-primary-forecolor').css,
    },
    dangerDisabled: {
      color: resolveColorVar(resolved, '--sjs-special-red-forecolor').css,
      opacity: 0.25,
    },
  });

  return { fragments };
}

export function selectButtonStyles(
  recipe: ButtonRecipe,
  variant: ButtonVariant,
  _mode: { narrow: boolean; rtl: boolean }
): TextStyle[] {
  const f = recipe.fragments;
  const styles: TextStyle[] = [f.base];
  if (variant.small) styles.push(f.small);

  if (variant.variant === 'action') {
    styles.push(f.action);
    if (variant.pressed) styles.push(f.actionPressed);
    if (variant.focused) styles.push(f.focused);
    if (variant.disabled) styles.push(f.actionDisabled);
    return styles;
  }
  if (variant.variant === 'danger') {
    styles.push(f.danger);
    // dangerPressed === danger: no distinct fragment (fixture: "unchanged").
    if (variant.focused) styles.push(f.focused);
    if (variant.disabled) styles.push(f.dangerDisabled);
    return styles;
  }

  if (variant.pressed) styles.push(f.pressedDefault);
  if (variant.focused) styles.push(f.focused);
  if (variant.disabled) styles.push(f.disabled);
  return styles;
}
