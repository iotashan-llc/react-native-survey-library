/**
 * List-picker recipe (task 2.1). Fixture: `default-theme/blocks/
 * sv-list.scss` — `.sv-list__item-body` (paddingBlock calcSize(1),
 * padding-inline-end calcSize(8), inline-start calcSize(2) at level 1),
 * `.sv-list__item` ($foreground, calcFontSize(1)), selected
 * (`--selected`: $primary background, white text in the default theme →
 * token-resolved primary/primary-foreground), focused (border outline
 * analog), disabled (opacity), search filter row (`.sv-list__filter`
 * padding calcSize(1.5)), empty text ($foreground-light).
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcFontSize, calcSize, resolveColorVar } from './tokenLookup';
import type { BuildContext } from './types';

export interface ListItemStateInput {
  selected: boolean;
  disabled: boolean;
  focused: boolean;
}

export interface ListItemRecipe {
  fragments: {
    row: ViewStyle;
    rowSelected: ViewStyle;
    rowFocused: ViewStyle;
    rowDisabled: ViewStyle;
    text: TextStyle;
    textSelected: TextStyle;
    searchRow: ViewStyle;
    searchInput: TextStyle;
    searchClear: TextStyle;
    empty: TextStyle;
  };
  select(input: ListItemStateInput): { row: ViewStyle[]; text: TextStyle[] };
}

export function buildListItemRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): ListItemRecipe {
  const sink = buildCtx?.diagnostics;
  const foreground = resolveColorVar(
    resolved,
    '--sjs-general-forecolor',
    sink
  ).css;
  const foregroundLight = resolveColorVar(
    resolved,
    '--sjs-general-forecolor-light',
    sink
  ).css;
  const primary = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;
  const primaryForeground = resolveColorVar(
    resolved,
    '--sjs-primary-forecolor',
    sink
  ).css;
  const border = resolveColorVar(resolved, '--sjs-border-default', sink).css;

  const fragments = StyleSheet.create({
    row: {
      paddingVertical: calcSize(resolved, 1),
      paddingStart: calcSize(resolved, 2),
      paddingEnd: calcSize(resolved, 8),
    },
    rowSelected: {
      backgroundColor: primary,
    },
    rowFocused: {
      borderWidth: 1,
      borderColor: border,
    },
    rowDisabled: {
      opacity: 0.25,
    },
    text: {
      fontSize: calcFontSize(resolved, 1),
      color: foreground,
    },
    textSelected: {
      color: primaryForeground,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: calcSize(resolved, 1.5),
    },
    searchInput: {
      flex: 1,
      fontSize: calcFontSize(resolved, 1),
      color: foreground,
    },
    searchClear: {
      fontSize: calcFontSize(resolved, 1),
      color: foregroundLight,
      paddingHorizontal: calcSize(resolved, 1),
    },
    empty: {
      fontSize: calcFontSize(resolved, 1),
      color: foregroundLight,
      padding: calcSize(resolved, 2),
      textAlign: 'center',
    },
  });

  return {
    fragments,
    select(input) {
      const row: ViewStyle[] = [fragments.row];
      const text: TextStyle[] = [fragments.text];
      if (input.focused) row.push(fragments.rowFocused);
      if (input.selected) {
        row.push(fragments.rowSelected);
        text.push(fragments.textSelected);
      }
      if (input.disabled) row.push(fragments.rowDisabled);
      return { row, text };
    },
  };
}
