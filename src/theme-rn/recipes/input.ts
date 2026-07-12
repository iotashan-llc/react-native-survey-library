/**
 * Text-input recipe (design: docs/design/0.7-metrics-fixture.md, "Text
 * input -- sd-input.scss"). 9 fixture-locked legal states: base · focused
 * · readOnly · previewVariant · error · error+focused · counter ·
 * counterBig · disabledReserved.
 */
import { StyleSheet } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcSize, calcFontSize, calcLineHeight, resolveColorVar } from './tokenLookup';
import { mapShadowForPlatform, composeShadowLayers } from '../shadows';
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
  const innerShadow = mapShadowForPlatform(
    resolved.tokens.shadows.inner,
    buildCtx.platform
  );
  const innerResetShadow = mapShadowForPlatform(
    resolved.tokens.shadows.innerReset,
    buildCtx.platform
  );
  const focusRing = mapShadowForPlatform(
    composeShadowLayers(resolved.tokens.shadows.innerReset, [
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
      color: resolveColorVar(resolved, '--sjs-font-editorfont-color').css,
      backgroundColor: resolveColorVar(resolved, '--sjs-editor-background').css,
      borderRadius: resolved.tokens.typography.editorCornerRadius,
      boxShadow: innerShadow.boxShadow,
    },
    focused: {
      boxShadow: focusRing.boxShadow,
    },
    readOnly: {
      backgroundColor: resolveColorVar(resolved, '--sjs-general-backcolor-dark')
        .css,
      color: resolveColorVar(resolved, '--sjs-general-forecolor').css,
      boxShadow: [],
    },
    preview: {
      backgroundColor: 'transparent',
      boxShadow: [],
      borderBottomWidth: 1,
      borderBottomColor: resolveColorVar(resolved, '--sjs-general-forecolor')
        .css,
      borderRadius: 0,
      paddingHorizontal: 0,
    },
    error: {
      backgroundColor: resolveColorVar(resolved, '--sjs-special-red-light').css,
    },
    characterCounter: {
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: resolveColorVar(
        resolved,
        '--sjs-font-editorfont-placeholdercolor'
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
