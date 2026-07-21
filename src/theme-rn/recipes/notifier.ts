/**
 * Notifier (toast) recipe (task 5.7c). Fixture harvested from upstream
 * `default-theme/blocks/sv-save-data.scss`:
 * - `.sv-save-data_root` — the floating pill: `background: $background`,
 *   `padding: calcSize(3) calcSize(6)`, `box-shadow: $shadow-medium`,
 *   `border-radius: calcCornerRadius(2)`, `color: $foreground`,
 *   `min-width: calcSize(30)`, centered `flex-direction: row`,
 *   `font-size: calcFontSize(1)`, `line-height: calcLineHeight(1.5)`.
 * - `.sv-save-data_root--with-buttons` — `padding: calcSize(2) calcSize(2)
 *   calcSize(2) calcSize(6)`.
 * - `.sv-save-data_error` — `background-color: $red`, `color: $background`,
 *   `font-weight: 600`, `gap: calcSize(6)`.
 * - `.sv-save-data_success` — `background-color: $primary`, white text,
 *   `font-weight: 600`.
 *
 * A model-state token approach (invariant 6): the component reads the
 * notifier's own `css` string (`Notifier.getCssClass` → `sv-save-data_info`
 * / `_error` / `_success`) and composes the matching variant fragment —
 * never re-deriving the type→style mapping.
 *
 * RN deviations (documented in DIFFERENCES.md → "Notifier toast"): the DOM
 * `position: fixed` viewport pin becomes an absolute layer at the bottom of
 * the survey root; the CSS `transition`/`visibility` show-hide animation is
 * replaced by mount/unmount on the model's `active` flag; `$shadow-medium`
 * is approximated with a constant elevation/shadow (the shadow-token
 * mapper is question-recipe scoped). The `$success` text `#ffffff` is
 * mapped to `$background` (the same "on-colored-surface" light color the
 * error variant uses) to stay formula-first.
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcSize,
  calcFontSize,
  calcLineHeight,
  calcCornerRadius,
  resolveColorVar,
} from './tokenLookup';
import type { BuildContext } from './types';

export interface NotifierRecipe {
  fragments: {
    /** `.sv-save-data_root` — base pill (layout + radius + shadow). */
    root: ViewStyle;
    /** `.sv-save-data_root--with-buttons` — padding/gap when actions show. */
    rootWithButtons: ViewStyle;
    /** `.sv-save-data_info` — info/default background. */
    variantInfo: ViewStyle;
    /** `.sv-save-data_error` — error background. */
    variantError: ViewStyle;
    /** `.sv-save-data_success` — success background. */
    variantSuccess: ViewStyle;
    /** The message text (base). */
    message: TextStyle;
    /** Info/default message color. */
    messageInfo: TextStyle;
    /** Error/success message color (light on a colored surface, weight 600). */
    messageEmphasis: TextStyle;
    /** The action-bar row. */
    actions: ViewStyle;
  };
}

export function buildNotifierRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): NotifierRecipe {
  const sink = buildCtx?.diagnostics;
  const background = resolveColorVar(
    resolved,
    '--sjs-general-backcolor',
    sink
  ).css;
  const foreground = resolveColorVar(
    resolved,
    '--sjs-general-forecolor',
    sink
  ).css;
  const red = resolveColorVar(resolved, '--sjs-special-red', sink).css;
  const primary = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;

  const fragments = StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: calcSize(resolved, 3),
      paddingHorizontal: calcSize(resolved, 6),
      borderRadius: calcCornerRadius(resolved, 2),
      minWidth: calcSize(resolved, 30),
      gap: calcSize(resolved, 3),
      backgroundColor: background,
      // $shadow-medium approximation — a constant elevation/shadow.
      elevation: 6,
      shadowColor: '#000000',
      shadowOpacity: 0.15,
      shadowRadius: calcSize(resolved, 1),
      shadowOffset: { width: 0, height: 2 },
    },
    rootWithButtons: {
      // .sv-save-data_root--with-buttons { padding: calcSize(2) calcSize(2)
      // calcSize(2) calcSize(6) } (web T R B L). Logical start/end so the
      // asymmetric leading (message-side) padding mirrors in RTL.
      paddingVertical: calcSize(resolved, 2),
      paddingStart: calcSize(resolved, 6),
      paddingEnd: calcSize(resolved, 2),
      gap: calcSize(resolved, 4),
    },
    variantInfo: {
      backgroundColor: background,
    },
    variantError: {
      backgroundColor: red,
    },
    variantSuccess: {
      backgroundColor: primary,
    },
    message: {
      flexShrink: 1,
      textAlign: 'center',
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
    },
    messageInfo: {
      color: foreground,
    },
    messageEmphasis: {
      color: background,
      fontWeight: '600',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: calcSize(resolved, 2),
    },
  });

  return { fragments };
}
