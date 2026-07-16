/**
 * Button-group recipe (task 2.9). Fixture:
 * `default-theme/blocks/sv-buttongroup.scss` — `.sv-button-group`
 * (container: flex row, 1px $border, font calcFontSize(1)),
 * `.sv-button-group__item` (grow 1 / basis 0, padding 11px calcSize(2),
 * lineHeight calcLineHeight(1.5), $background/$foreground, right border
 * between items), `--selected` (weight 600, $primary text/icon),
 * `--disabled` (decorator opacity .25, normal weight), caption margin
 * calcSize(1) after an icon.
 *
 * Legal states: base / selected / disabled / disabled+selected (hover has
 * no RN analog — IsTouch upstream also no-ops it). Focus ring
 * (`:focus-within` box-shadow) is a web-only affordance, not ported
 * (documented in the module header of the component).
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import {
  calcFontSize,
  calcLineHeight,
  calcSize,
  resolveColorVar,
} from './tokenLookup';
import type { BuildContext } from './types';

export interface ButtonGroupStateInput {
  selected: boolean;
  disabled: boolean;
}

export interface ButtonGroupRecipe {
  fragments: {
    /** `.sv-button-group` — the bordered row container. */
    container: ViewStyle;
    /** `.sv-button-group__item` base. */
    item: ViewStyle;
    /** Between-items divider (`:not(:last-of-type)` right border). */
    itemDivider: ViewStyle;
    /** Caption text base / selected / disabled. */
    caption: TextStyle;
    captionSelected: TextStyle;
    captionDisabled: TextStyle;
    /** Icon→caption gap (`icon + caption` margin). */
    captionAfterIcon: TextStyle;
    /** Decorator opacity for disabled items. */
    itemDisabled: ViewStyle;
  };
  select(input: ButtonGroupStateInput): {
    item: ViewStyle[];
    caption: TextStyle[];
  };
}

export function buildButtonGroupRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): ButtonGroupRecipe {
  const sink = buildCtx?.diagnostics;
  const border = resolveColorVar(resolved, '--sjs-border-default', sink).css;
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
  const primary = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;

  const fragments = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: border,
    },
    item: {
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: calcSize(resolved, 2),
      backgroundColor: background,
    },
    itemDivider: {
      borderEndWidth: 1,
      borderEndColor: border,
    },
    caption: {
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      fontWeight: '400',
      color: foreground,
    },
    captionSelected: {
      fontWeight: '600',
      color: primary,
    },
    captionDisabled: {
      opacity: 0.25,
      fontWeight: 'normal',
    },
    captionAfterIcon: {
      marginStart: calcSize(resolved, 1),
    },
    itemDisabled: {
      opacity: 0.25,
    },
  });

  return {
    fragments,
    select(input: ButtonGroupStateInput) {
      const item: ViewStyle[] = [fragments.item];
      const caption: TextStyle[] = [fragments.caption];
      if (input.selected) caption.push(fragments.captionSelected);
      if (input.disabled) {
        item.push(fragments.itemDisabled);
        caption.push(fragments.captionDisabled);
      }
      return { item, caption };
    },
  };
}
