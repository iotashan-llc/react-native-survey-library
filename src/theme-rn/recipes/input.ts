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

export interface InputVariant {
  focused: boolean;
  readOnly: boolean;
  preview: boolean;
  error: boolean;
  counter: boolean;
  counterBig: boolean;
}

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
      lineHeight: calcLineHeight(resolved, 1.5),
      fontFamily: resolved.tokens.typography.editor.fontFamily || undefined,
      fontWeight: String(
        resolved.tokens.typography.editor.fontWeight
      ) as TextStyle['fontWeight'],
      fontSize: resolved.tokens.typography.editor.fontSize,
      color: resolveColorVar(resolved, '--sjs-font-editorfont-color', sink)
        .css,
      backgroundColor: resolveColorVar(resolved, '--sjs-editor-background', sink)
        .css,
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
      backgroundColor: resolveColorVar(resolved, '--sjs-special-red-light', sink)
        .css,
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
      right: calcSize(resolved, 2),
      bottom: calcSize(resolved, 1.5),
    },
    focusedCounterPadding: {
      paddingRight: calcSize(resolved, 8),
    },
    focusedCounterPaddingBig: {
      paddingRight: calcSize(resolved, 11),
    },
    disabledReserved: {
      opacity: 0.25,
    },
  });

  return { fragments };
}

export function selectInputStyles(
  recipe: InputRecipe,
  variant: InputVariant,
  _mode: { narrow: boolean; rtl: boolean }
): TextStyle[] {
  const f = recipe.fragments;
  const styles: TextStyle[] = [f.base];
  if (variant.error) styles.push(f.error);
  if (variant.focused) styles.push(f.focused);
  if (variant.counter) styles.push(f.focusedCounterPadding);
  if (variant.counterBig) styles.push(f.focusedCounterPaddingBig);
  // preview/readOnly compose LAST -- they win layout/shadow overrides
  // regardless of error/focused (fixture: preview zeroes radius/padding
  // unconditionally; readOnly removes the shadow unconditionally).
  if (variant.preview) styles.push(f.preview);
  if (variant.readOnly) styles.push(f.readOnly);
  return styles;
}
