/**
 * Matrix recipe (task M3 3.1a — the `MatrixGrid` primitive; design
 * docs/design/M3-matrix-family-plan.md invariant 4). Backs the
 * presentational `MatrixGrid` grid: grid-lines, header cell, row-header
 * cell, data cell, footer cell, and the full-width detail container.
 *
 * Built the same way as every other recipe: `StyleSheet.create`'d atomic
 * fragments, FORMULA-first metrics over `resolved` tokens (never a
 * literal), colors via the `resolveColorVar` escape hatch. Gridlines use
 * the `--sjs-border-inside` internal-border token (the same token the
 * rating recipe uses for its inter-item dividers); the header/footer
 * bands take the dim general backcolor for a subtle emphasis, matching
 * v2.5.33's `.sd-table__cell--header` / `--footer` background.
 *
 * 3.1a SUBSET: this is the grid GEOMETRY + gridlines only. The
 * model-derived-state fragments (checked / error / alternate-row / card /
 * add-remove / detail-toggle buttons) named in invariant 4 are authored
 * by the later M3 phases (3.2 tiles, 3.3 dropdown pair, 3.4 dynamic) that
 * introduce those states — kept out of 3.1a to keep the primitive lean.
 *
 * `narrow`/RTL are NOT cache keys here (the 3.1a wide grid's geometry is
 * identical in both), so — unlike the row recipe — there are no
 * prebuilt narrow variants; the mobile card path (3.1b) will add its own
 * fragments when it lands.
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
import type { BuildContext } from './types';

export interface MatrixRecipe {
  fragments: {
    /** Outer grid frame — closes the top+start gridline the cells' bottom/end borders leave open. */
    grid: ViewStyle;
    /** Header band cell — subtle dim background + bottom/end gridline. */
    headerCell: ViewStyle;
    /** Header caption text — emphasised weight. */
    headerText: TextStyle;
    /** Row-header (leading) cell — subtle dim background + gridline. */
    rowHeaderCell: ViewStyle;
    /** Data cell — bottom/end gridline. */
    dataCell: ViewStyle;
    /** Footer (totals) band cell — subtle dim background + gridline. */
    footerCell: ViewStyle;
    /** Full-width detail-panel container (edge-to-edge, §3g). */
    detailCell: ViewStyle;
    /** Base cell text. */
    cellText: TextStyle;
  };
}

export function buildMatrixRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): MatrixRecipe {
  const sink = buildCtx?.diagnostics;
  const baseFamily = resolved.tokens.typography.base.fontFamily || undefined;

  // Internal gridline (the inter-cell dividers) and the dim band background
  // for header/row-header/footer emphasis.
  const gridline = resolveColorVar(resolved, '--sjs-border-inside', sink).css;
  const bandBg = resolveColorVar(
    resolved,
    '--sjs-general-backcolor-dim',
    sink
  ).css;
  const foreColor = resolveColorVar(
    resolved,
    '--sjs-general-forecolor',
    sink
  ).css;

  // Cell padding — calcSize(1) vertical / calcSize(2) horizontal, the
  // v2.5.33 matrix `.sd-table__cell` rhythm (base-unit-derived).
  const padV = calcSize(resolved, 1);
  const padH = calcSize(resolved, 2);
  const borderW = StyleSheet.hairlineWidth;

  const cell: ViewStyle = {
    paddingVertical: padV,
    paddingHorizontal: padH,
    justifyContent: 'center',
    borderColor: gridline,
    borderBottomWidth: borderW,
    borderEndWidth: borderW,
  };

  const fragments = StyleSheet.create({
    grid: {
      borderColor: gridline,
      borderTopWidth: borderW,
      borderStartWidth: borderW,
    },
    headerCell: {
      ...cell,
      backgroundColor: bandBg,
    },
    headerText: {
      fontFamily: baseFamily,
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      fontWeight: '600',
      color: foreColor,
    },
    rowHeaderCell: {
      ...cell,
      backgroundColor: bandBg,
    },
    dataCell: cell,
    footerCell: {
      ...cell,
      backgroundColor: bandBg,
    },
    detailCell: {
      paddingVertical: padV,
      paddingHorizontal: padH,
      borderColor: gridline,
      borderBottomWidth: borderW,
      borderStartWidth: borderW,
      borderEndWidth: borderW,
    },
    cellText: {
      fontFamily: baseFamily,
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: foreColor,
    },
  });

  return { fragments };
}
