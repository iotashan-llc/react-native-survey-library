/**
 * Signature-pad recipe (task 5.1). Fixtures: `default-theme/blocks/
 * sd-signaturepad.scss` (canvas border/background, placeholder text, clear
 * control) resolved through the metrics-fixture formula helpers — never a
 * hardcoded literal (design 0.7-metrics-fixture).
 *
 * Per invariant 6 the recipe owns ONLY presentation tokens; the canvas
 * DIMENSIONS (`signatureWidth`/`signatureHeight`) and the pen/background
 * COLORS come from the core model at render time — the recipe supplies only
 * the token DEFAULTS the model falls back to when `penColor`/`backgroundColor`
 * are unset (web: penColor || theme primary || "#1ab394"; background ||
 * general backcolor || "#ffffff").
 */
import { StyleSheet } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcFontSize, calcSize, resolveColorVar } from './tokenLookup';
import type { BuildContext } from './types';

export interface SignatureRecipe {
  fragments: {
    /** `.sd-signaturepad` root column. */
    container: ViewStyle;
    /** `.sd-signaturepad__canvas` bordered box (dimensions set inline from the model). */
    canvas: ViewStyle;
    /** `.sd-signaturepad__placeholder` overlay (absolute; pointerEvents none). */
    placeholder: ViewStyle;
    /** Placeholder text. */
    placeholderText: TextStyle;
    /** `.sd-signaturepad__clear-button`. */
    clearButton: ViewStyle;
    /** Clear-button caption. */
    clearButtonText: TextStyle;
    /** Read-only / fallback stored-signature `<Image>` (dimensions set inline). */
    image: ImageStyle;
    /** Fallback (peer-absent) container. */
    fallback: ViewStyle;
    /** Fallback message text. */
    fallbackText: TextStyle;
  };
  /** Pen color the model falls back to when `penColor` is unset (theme primary). */
  defaultPenColor: string;
  /** Background the model falls back to when `backgroundColor` is unset. */
  defaultBackgroundColor: string;
}

export function buildSignatureRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): SignatureRecipe {
  const sink = buildCtx?.diagnostics;
  const primary = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;
  const backcolor = resolveColorVar(
    resolved,
    '--sjs-general-backcolor',
    sink
  ).css;
  const border = resolveColorVar(resolved, '--sjs-border-default', sink).css;
  const fontTitle = resolveColorVar(
    resolved,
    '--sjs-font-questiontitle-color',
    sink
  ).css;
  const fontDesc = resolveColorVar(
    resolved,
    '--sjs-font-questiondescription-color',
    sink
  ).css;

  const fontSize = calcFontSize(resolved, 1);
  const radius = calcSize(resolved, 0.5);

  const fragments = StyleSheet.create({
    container: {
      alignSelf: 'flex-start',
      rowGap: calcSize(resolved, 0.5),
    },
    canvas: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: radius,
      overflow: 'hidden',
    },
    placeholder: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      padding: calcSize(resolved, 1),
    },
    placeholderText: {
      color: fontDesc,
      fontSize,
      textAlign: 'center',
    },
    clearButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: calcSize(resolved, 1),
      paddingVertical: calcSize(resolved, 0.5),
      borderRadius: radius,
      borderWidth: 1,
      borderColor: border,
    },
    clearButtonText: {
      color: fontTitle,
      fontSize,
    },
    image: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: radius,
      backgroundColor: backcolor,
    },
    fallback: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: radius,
      padding: calcSize(resolved, 1),
      rowGap: calcSize(resolved, 0.5),
    },
    fallbackText: {
      color: fontDesc,
      fontSize,
    },
  });

  return {
    fragments,
    defaultPenColor: primary,
    defaultBackgroundColor: backcolor,
  };
}
