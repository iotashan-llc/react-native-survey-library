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

/** RAW state inputs — the selector normalizes to a legal tuple (codex impl-review major 2). */
export interface ButtonStateInput {
  pressed: boolean;
  focused: boolean;
  disabled: boolean;
  small: boolean;
  variant: ButtonKind;
}

export type ButtonInteractionState = 'base' | 'pressed' | 'focused' | 'disabled';

/**
 * The fixture's EXACT 13 legal tuples ("Legal-state enumerations": base ·
 * pressed · focused · disabled · small(composes) · action · actionPressed
 * · action+focused · actionDisabled · danger · dangerPressed(=danger) ·
 * danger+focused · dangerDisabled): 3 variants × 4 interaction states,
 * with `small` composing orthogonally as the 13th enumeration entry.
 */
export interface ButtonLegalState {
  variant: ButtonKind;
  state: ButtonInteractionState;
  small: boolean;
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

/**
 * Normalizes raw flags to EXACTLY one legal tuple. Precedence: disabled >
 * pressed > focused > base (a disabled button cannot be interacted with;
 * an actively-pressed button's press visual wins over its focus ring for
 * the duration of the press — the fixture enumerates no pressed+focused
 * tuple).
 */
export function resolveButtonLegalState(
  input: ButtonStateInput
): ButtonLegalState {
  const state: ButtonInteractionState = input.disabled
    ? 'disabled'
    : input.pressed
      ? 'pressed'
      : input.focused
        ? 'focused'
        : 'base';
  return { variant: input.variant, state, small: input.small };
}

/**
 * Exhaustive composition map over the legal-state union (codex
 * impl-review major 2). `small` composes orthogonally right after base.
 */
export function selectButtonStyles(
  recipe: ButtonRecipe,
  input: ButtonStateInput,
  _mode: { narrow: boolean; rtl: boolean }
): TextStyle[] {
  const f = recipe.fragments;
  const legal = resolveButtonLegalState(input);
  const styles: TextStyle[] = [f.base];
  if (legal.small) styles.push(f.small);

  switch (legal.variant) {
    case 'action':
      styles.push(f.action);
      switch (legal.state) {
        case 'base':
          break;
        case 'pressed':
          styles.push(f.actionPressed);
          break;
        case 'focused':
          styles.push(f.focused);
          break;
        case 'disabled':
          styles.push(f.actionDisabled);
          break;
      }
      break;
    case 'danger':
      styles.push(f.danger);
      switch (legal.state) {
        case 'base':
        case 'pressed':
          // dangerPressed === danger: no distinct fragment (fixture: "unchanged").
          break;
        case 'focused':
          styles.push(f.focused);
          break;
        case 'disabled':
          styles.push(f.dangerDisabled);
          break;
      }
      break;
    case 'default':
      switch (legal.state) {
        case 'base':
          break;
        case 'pressed':
          styles.push(f.pressedDefault);
          break;
        case 'focused':
          styles.push(f.focused);
          break;
        case 'disabled':
          styles.push(f.disabled);
          break;
      }
      break;
  }
  return styles;
}
