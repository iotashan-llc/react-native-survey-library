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
import { reportShadowResult } from './types';
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
  const sink = buildCtx.diagnostics;
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
    buildCtx.platform
  );
  reportShadowResult(buildCtx, '--sjs-shadow-small-reset', focusRing);
  const baseShadow = mapShadowForPlatform(
    resolved.tokens.shadows.small,
    buildCtx.platform
  );
  reportShadowResult(buildCtx, '--sjs-shadow-small', baseShadow);

  const fragments = StyleSheet.create({
    base: {
      paddingVertical: calcSize(resolved, 2),
      paddingHorizontal: calcSize(resolved, 6),
      borderRadius: calcCornerRadius(resolved, 1),
      fontFamily: resolved.tokens.typography.base.fontFamily || undefined,
      fontWeight: '600',
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: resolveColorVar(resolved, '--sjs-primary-backcolor', sink).css,
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-question-background',
        sink
      ).css,
      // BOTH shadow channels (codex impl-review major 1).
      boxShadow: baseShadow.boxShadow,
      elevation: baseShadow.elevation,
    },
    small: {
      paddingVertical: calcSize(resolved, 1.5),
      paddingHorizontal: calcSize(resolved, 4),
      flexGrow: 1,
    },
    pressedDefault: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-general-backcolor-dark',
        sink
      ).css,
    },
    focused: {
      boxShadow: focusRing.boxShadow,
      elevation: focusRing.elevation,
    },
    disabled: {
      color: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
      opacity: 0.25,
    },
    action: {
      backgroundColor: resolveColorVar(resolved, '--sjs-primary-backcolor', sink)
        .css,
      color: resolveColorVar(resolved, '--sjs-primary-forecolor', sink).css,
    },
    actionPressed: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-primary-backcolor-dark',
        sink
      ).css,
    },
    actionDisabled: {
      color: resolveColorVar(resolved, '--sjs-primary-forecolor-light', sink)
        .css,
      opacity: 0.25,
    },
    danger: {
      backgroundColor: resolveColorVar(resolved, '--sjs-special-red', sink).css,
      color: resolveColorVar(resolved, '--sjs-primary-forecolor', sink).css,
    },
    dangerDisabled: {
      color: resolveColorVar(resolved, '--sjs-special-red-forecolor', sink).css,
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
