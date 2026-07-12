/**
 * Text-input recipe (design: docs/design/0.7-metrics-fixture.md, "Text
 * input -- sd-input.scss"). 9 fixture-locked legal states: base · focused
 * · readOnly · previewVariant · error · error+focused · counter ·
 * counterBig · disabledReserved.
 */
import { StyleSheet } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcSize,
  calcFontSize,
  calcLineHeight,
  resolveColorVar,
} from './tokenLookup';
import { mapShadowForPlatform, composeShadowLayers } from '../shadows';
import { reportShadowResult } from './types';
import type { BuildContext } from './types';

export type InputCounterSize = 'normal' | 'big';

/**
 * RAW state inputs — the selector normalizes these to EXACTLY one of the
 * fixture's 9 legal tuples (codex impl-review major 2).
 */
export interface InputStateInput {
  focused: boolean;
  readOnly: boolean;
  preview: boolean;
  error: boolean;
  /** Character-counter reservation size; the reserved end padding is a FOCUSED-state behavior (fixture: "focused reserved end padding"). */
  counter?: InputCounterSize;
  /** Reserved — unreachable for text getters (dead upstream branch); honored only for hosts appending the class manually. */
  disabled?: boolean;
}

/**
 * The fixture's EXACT 9 legal tuples ("Legal-state enumerations": base ·
 * focused · readOnly · previewVariant · error · error+focused · counter ·
 * counterBig · disabledReserved) as a discriminated union — base(1),
 * focused×counter(3), readOnly(1), preview(1), error×focused(2),
 * disabledReserved(1).
 */
export type InputLegalState =
  | { kind: 'base' }
  | { kind: 'focused'; counter?: InputCounterSize }
  | { kind: 'readOnly' }
  | { kind: 'preview' }
  | { kind: 'error'; focused: boolean }
  | { kind: 'disabledReserved' };

export interface InputRecipe {
  fragments: {
    base: TextStyle;
    focused: ViewStyle;
    readOnly: ViewStyle;
    preview: ViewStyle;
    error: ViewStyle;
    characterCounter: TextStyle;
    focusedCounterPadding: ViewStyle;
    focusedCounterPaddingBig: ViewStyle;
    /** Reserved -- unreachable for text getters (dead upstream branch). */
    disabledReserved: TextStyle;
  };
}

export function buildInputRecipe(
  resolved: ResolvedTheme,
  buildCtx: BuildContext
): InputRecipe {
  const sink = buildCtx.diagnostics;
  const innerShadow = mapShadowForPlatform(
    resolved.tokens.shadows.inner,
    buildCtx.platform
  );
  reportShadowResult(buildCtx, '--sjs-shadow-inner', innerShadow);
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
    base: {
      paddingVertical: calcSize(resolved, 1.5),
      paddingHorizontal: calcSize(resolved, 2),
      // EDITOR line-height token (1.5 x editor font-size) — NOT the
      // base-font calcLineHeight path; identical at defaults, diverges
      // under a theme overriding only one of the two font-size tokens
      // (fixture header; codex impl-review major 5).
      lineHeight: resolved.tokens.typography.editorLineHeight,
      fontFamily: resolved.tokens.typography.editor.fontFamily || undefined,
      fontWeight: String(
        resolved.tokens.typography.editor.fontWeight
      ) as TextStyle['fontWeight'],
      fontSize: resolved.tokens.typography.editor.fontSize,
      color: resolveColorVar(resolved, '--sjs-font-editorfont-color', sink).css,
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-editor-background',
        sink
      ).css,
      borderRadius: resolved.tokens.typography.editorCornerRadius,
      // BOTH shadow channels always mapped: boxShadow on iOS/Android>=28,
      // the mapper's elevation on the Android <28 fallback tier (codex
      // impl-review major 1 — elevation was previously computed then
      // discarded).
      boxShadow: innerShadow.boxShadow,
      elevation: innerShadow.elevation,
    },
    focused: {
      boxShadow: focusRing.boxShadow,
      elevation: focusRing.elevation,
    },
    readOnly: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-general-backcolor-dark',
        sink
      ).css,
      color: resolveColorVar(resolved, '--sjs-general-forecolor', sink).css,
      // No-shadow state clears BOTH channels so no platform tier leaks a
      // shadow (codex impl-review major 1).
      boxShadow: [],
      elevation: 0,
    },
    preview: {
      backgroundColor: 'transparent',
      boxShadow: [],
      elevation: 0,
      borderBottomWidth: 1,
      borderBottomColor: resolveColorVar(
        resolved,
        '--sjs-general-forecolor',
        sink
      ).css,
      borderRadius: 0,
      paddingHorizontal: 0,
    },
    error: {
      backgroundColor: resolveColorVar(
        resolved,
        '--sjs-special-red-light',
        sink
      ).css,
    },
    characterCounter: {
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: resolveColorVar(
        resolved,
        '--sjs-font-editorfont-placeholdercolor',
        sink
      ).css,
      position: 'absolute',
      // Logical END offset/padding (RTL-aware; codex impl-review major 7)
      // — RN resolves start/end per I18nManager.isRTL at layout, so RTL
      // needs no separate fragment.
      end: calcSize(resolved, 2),
      bottom: calcSize(resolved, 1.5),
    },
    focusedCounterPadding: {
      paddingEnd: calcSize(resolved, 8),
    },
    focusedCounterPaddingBig: {
      paddingEnd: calcSize(resolved, 11),
    },
    disabledReserved: {
      opacity: 0.25,
    },
  });

  return { fragments };
}

/**
 * Normalizes raw flags to EXACTLY one of the fixture's 9 legal tuples.
 * Precedence: disabledReserved (host-appended, whole-control override) >
 * readOnly > preview (both zero the interactive affordances
 * unconditionally per the fixture) > error(±focused) > focused(+counter)
 * > base. The counter reservation only exists WITH focus ("focused
 * reserved end padding").
 */
export function resolveInputLegalState(
  input: InputStateInput
): InputLegalState {
  if (input.disabled) return { kind: 'disabledReserved' };
  if (input.readOnly) return { kind: 'readOnly' };
  if (input.preview) return { kind: 'preview' };
  if (input.error) return { kind: 'error', focused: input.focused };
  if (input.focused) return { kind: 'focused', counter: input.counter };
  return { kind: 'base' };
}

/**
 * Exhaustive composition map over the legal-state union — no path can
 * compose an unenumerated combination (codex impl-review major 2).
 */
export function selectInputStyles(
  recipe: InputRecipe,
  input: InputStateInput,
  _mode: { narrow: boolean; rtl: boolean }
): TextStyle[] {
  const f = recipe.fragments;
  const state = resolveInputLegalState(input);
  const styles: TextStyle[] = [f.base];
  switch (state.kind) {
    case 'base':
      break;
    case 'focused':
      styles.push(f.focused);
      if (state.counter === 'normal') styles.push(f.focusedCounterPadding);
      if (state.counter === 'big') styles.push(f.focusedCounterPaddingBig);
      break;
    case 'readOnly':
      styles.push(f.readOnly);
      break;
    case 'preview':
      styles.push(f.preview);
      break;
    case 'error':
      styles.push(f.error);
      if (state.focused) styles.push(f.focused);
      break;
    case 'disabledReserved':
      styles.push(f.disabledReserved);
      break;
  }
  return styles;
}
