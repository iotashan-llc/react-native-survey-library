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
    /** Detail-toggle cell (3.3b) — centers the expand/collapse icon with a real hit target. */
    detailToggle: ViewStyle;
    /** Base cell text. */
    cellText: TextStyle;
    // --- 3.2 simple-matrix tile/rubric state fragments (invariant 4/6:
    // native interaction geometry here; model-derived checked/error come
    // from `getItemClass` via the bridge, and the decorator's own checked/
    // error come from the shared `item` recipe). ---
    /** Radio/checkbox TILE container — centers the shared item decorator inside a cell (§3.2). */
    tile: ViewStyle;
    /** Row-header caption text (default tone). */
    rowHeaderText: TextStyle;
    /** Row-header caption text when the row is in error (`row.hasError`, model-derived). */
    rowHeaderTextError: TextStyle;
    /** Inline error marker under a row header when `row.hasError` (eachRowRequired/eachRowUnique). */
    rowHeaderErrorMarker: ViewStyle;
    /** Rubric (`hasCellText`) tappable text cell — base. */
    rubricCell: ViewStyle;
    /** Rubric text cell when checked (`row.isChecked`, model-derived). */
    rubricCellSelected: ViewStyle;
    /** Rubric cell text — base tone. */
    rubricText: TextStyle;
    /** Rubric cell text when checked. */
    rubricTextSelected: TextStyle;
  };
  /** Detail-toggle icon size — the 16dp glyph family
   * (`expanddetails-16x16`/`collapsedetails-16x16`), base-unit-derived. */
  detailIconSize: number;
  /** Detail-toggle icon tint — the general forecolor token. */
  detailIconColor: string;
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
  // 3.2 tile/rubric state colors: selected rubric rides the primary band;
  // the row-error tone rides the shared red family (same tokens the item
  // recipe's error decorator uses).
  const primaryBg = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;
  const primaryFore = resolveColorVar(
    resolved,
    '--sjs-primary-forecolor',
    sink
  ).css;
  const errorColor = resolveColorVar(resolved, '--sjs-special-red', sink).css;

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
    detailToggle: {
      alignItems: 'center',
      justifyContent: 'center',
      // calcSize(4) = 32dp minimum hit target inside the intrinsic
      // actions column (same target the tile/rubric fragments use).
      minHeight: calcSize(resolved, 4),
    },
    cellText: {
      fontFamily: baseFamily,
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: foreColor,
    },
    tile: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: calcSize(resolved, 4),
    },
    rowHeaderText: {
      fontFamily: baseFamily,
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: foreColor,
    },
    rowHeaderTextError: {
      fontFamily: baseFamily,
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: errorColor,
    },
    rowHeaderErrorMarker: {
      marginTop: calcSize(resolved, 0.5),
      height: borderW * 2,
      backgroundColor: errorColor,
    },
    rubricCell: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: calcSize(resolved, 4),
    },
    rubricCellSelected: {
      backgroundColor: primaryBg,
    },
    rubricText: {
      fontFamily: baseFamily,
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: foreColor,
      textAlign: 'center',
    },
    rubricTextSelected: {
      fontFamily: baseFamily,
      fontSize: calcFontSize(resolved, 1),
      lineHeight: calcLineHeight(resolved, 1.5),
      color: primaryFore,
      textAlign: 'center',
    },
  });

  return {
    fragments,
    detailIconSize: calcSize(resolved, 2),
    detailIconColor: foreColor,
  };
}
