/**
 * Overlay recipe (task 2.1). Fixture: `default-theme/blocks/sv-popup.scss`
 * — `.sv-popup--modal-popup` (backdrop `$background-semitransparent`,
 * dialog container `$background-dim-light`, corner calcCornerRadius(2),
 * body padding calcSize(4)), menu/overlay containers (`$background-dim`,
 * corner calcCornerRadius(1)), footer bar padding calcSize(1). Shadows
 * come from the shared shadow tokens; the sheet is bottom-anchored
 * full-width (mobile `--overlay` behavior — RN owns the geometry, no
 * coordinate model).
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcCornerRadius,
  calcFontSize,
  calcSize,
  resolveColorVar,
} from './tokenLookup';
import type { BuildContext } from './types';

export interface OverlayRecipe {
  fragments: {
    /** Full-screen dimmed backdrop (`$background-semitransparent`). */
    backdrop: ViewStyle;
    /** Bottom sheet panel (menu family). */
    sheet: ViewStyle;
    /** Centered dialog card (modal family). */
    dialog: ViewStyle;
    /** Dialog/sheet body padding. */
    body: ViewStyle;
    /** Title text. */
    title: TextStyle;
    /** Footer action bar. */
    footer: ViewStyle;
  };
}

export function buildOverlayRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): OverlayRecipe {
  const sink = buildCtx?.diagnostics;
  // `$background-semitransparent` has no `--sjs-*` token (same situation
  // as item.ts's checkedDisabledReserved note) — the standard scrim is
  // hand-authored per the fixture-header rule (sv-popup.scss:99, 75%
  // black scrim in the default theme family).
  const backdrop = 'rgba(0, 0, 0, 0.75)';
  const sheetBackground = resolveColorVar(
    resolved,
    '--sjs-general-backcolor-dim',
    sink
  ).css;
  const dialogBackground = resolveColorVar(
    resolved,
    '--sjs-general-backcolor-dim-light',
    sink
  ).css;
  const foreground = resolveColorVar(
    resolved,
    '--sjs-general-forecolor',
    sink
  ).css;

  const fragments = StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: backdrop,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: sheetBackground,
      borderTopStartRadius: calcCornerRadius(resolved, 1),
      borderTopEndRadius: calcCornerRadius(resolved, 1),
      maxHeight: '80%',
    },
    dialog: {
      backgroundColor: dialogBackground,
      borderRadius: calcCornerRadius(resolved, 2),
      alignSelf: 'center',
      marginVertical: calcSize(resolved, 8),
      maxWidth: '90%',
      minWidth: '60%',
    },
    body: {
      padding: calcSize(resolved, 4),
    },
    title: {
      fontSize: calcFontSize(resolved, 1.25),
      fontWeight: '600',
      color: foreground,
      paddingHorizontal: calcSize(resolved, 4),
      paddingTop: calcSize(resolved, 3),
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      padding: calcSize(resolved, 1),
      gap: calcSize(resolved, 1),
    },
  });

  return { fragments };
}
