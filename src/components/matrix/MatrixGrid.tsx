/**
 * `MatrixGrid` — the M3 3.1a presentational grid primitive (design:
 * docs/design/M3-matrix-family-plan.md §1, §3, §3a). It is the direct
 * layout analogue of `OverlayControlBase`: ONE primitive behind ONE
 * normalized contract, serving simple `matrix`, `matrixdropdown`,
 * `matrixdynamic`, and any future grid.
 *
 * Contract (design §3 "MatrixGrid ownership"): the question-renderer OWNER
 * measures the outer root, runs the width allocator (§3a.3), and hands
 * `MatrixGrid` a fully-resolved `ResolvedGridContract` — dp widths + the
 * summed content width already computed. `MatrixGrid` is therefore
 * `SurveyElementBase`-free, holds NO layout state, and RESOLVES NOTHING;
 * it only lays out Views. (This file is a plain `React.Component` with
 * `static contextType` so it can read the theme's `matrix` recipe — the
 * provider docblock's sanctioned non-`SurveyElementBase` context path.)
 *
 * The 3.1a wide baseline (§3a): ONE horizontal `ScrollView` whose content
 * is the whole grid — the row-header column lives INSIDE the scroll
 * content as each row's first cell, NOT a separate fixed pane. Each row
 * is one flex View whose cells share the resolved dp array (§3a.3f), so
 * natural per-row flex height keeps a row's cells the same height for free
 * — no split-pane, no height-sync. Sticky-first-column is a deferred 3.1b
 * enhancement (§3a.5). The mobile stacked-card path is 3.1b (§3b); 3.1a
 * always renders the wide grid.
 *
 * Row topology (§3g): `data`/`footer` rows are COLUMN-ALIGNED — each cell
 * takes the summed dp of the columns it spans (a colSpan cell is one View
 * summing the spanned dp, §3a.1). `detail` rows are FULL-WIDTH — the
 * SurveyPanel spans the whole content width. Keys come straight off the
 * contract (`row.key` / `cell.key` / `column.key`); the OWNER computes
 * them per the design's keying table — `MatrixGrid` never derives them.
 */
import * as React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { SurveyThemeContext } from '../../theme-rn/provider';
import type { SurveyThemeContextValue } from '../../theme-rn/provider';
import type {
  GridRow,
  ResolvedGridColumn,
  ResolvedGridContract,
} from './grid-contract';

export interface MatrixGridProps {
  contract: ResolvedGridContract;
}

export class MatrixGrid extends React.Component<MatrixGridProps> {
  static contextType = SurveyThemeContext;

  private get themeContext(): SurveyThemeContextValue {
    return this.context as SurveyThemeContextValue;
  }

  /** Sum the dp of the `span` columns starting at `slot`. */
  private spanWidth(
    columns: ResolvedGridColumn[],
    slot: number,
    span: number
  ): number {
    let total = 0;
    for (let i = slot; i < slot + span && i < columns.length; i += 1) {
      total += columns[i]!.dp;
    }
    return total;
  }

  private renderHeaderBand(): React.ReactNode {
    const { columns, contentWidth } = this.props.contract;
    const { fragments } = this.themeContext.recipes.matrix;
    return (
      <View
        testID="matrix-band-header"
        style={[styles.row, { width: contentWidth }]}
      >
        {columns.map((column, slot) => (
          <View
            key={column.key}
            testID={`matrix-hcell-${slot}`}
            style={[
              column.isRowHeader
                ? fragments.rowHeaderCell
                : fragments.headerCell,
              styles.cellClip,
              { width: column.dp },
            ]}
          >
            {column.header}
          </View>
        ))}
      </View>
    );
  }

  private renderColumnAlignedRow(row: GridRow): React.ReactNode {
    const { columns, contentWidth } = this.props.contract;
    const { fragments } = this.themeContext.recipes.matrix;
    const cells: React.ReactNode[] = [];
    let slot = 0;
    for (const cell of row.cells) {
      const span = cell.span ?? 1;
      const cellWidth = this.spanWidth(columns, slot, span);
      const isRowHeader = columns[slot]?.isRowHeader === true;
      const cellStyle: ViewStyle = isRowHeader
        ? fragments.rowHeaderCell
        : row.kind === 'footer'
          ? fragments.footerCell
          : fragments.dataCell;
      cells.push(
        <View
          key={cell.key}
          testID={`matrix-cell-${row.key}-${slot}`}
          style={[cellStyle, styles.cellClip, { width: cellWidth }]}
        >
          {cell.render()}
        </View>
      );
      slot += span;
    }
    return (
      <View
        key={row.key}
        testID={`matrix-row-${row.key}`}
        style={[styles.row, { width: contentWidth }]}
      >
        {cells}
      </View>
    );
  }

  private renderDetailRow(row: GridRow): React.ReactNode {
    const { contentWidth } = this.props.contract;
    const { fragments } = this.themeContext.recipes.matrix;
    return (
      <View
        key={row.key}
        testID={`matrix-detail-${row.key}`}
        style={[fragments.detailCell, { width: contentWidth }]}
      >
        {row.cells.map((cell) => (
          <React.Fragment key={cell.key}>{cell.render()}</React.Fragment>
        ))}
      </View>
    );
  }

  private renderRow(row: GridRow): React.ReactNode {
    return row.kind === 'detail'
      ? this.renderDetailRow(row)
      : this.renderColumnAlignedRow(row);
  }

  render(): React.JSX.Element {
    const { contract } = this.props;
    const { fragments } = this.themeContext.recipes.matrix;
    return (
      <ScrollView
        testID="matrix-scroll"
        horizontal
        showsHorizontalScrollIndicator
      >
        <View
          testID="matrix-content"
          style={[fragments.grid, { width: contract.contentWidth }]}
        >
          {contract.showHeader && this.renderHeaderBand()}
          {contract.rows.map((row) => this.renderRow(row))}
        </View>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  // Clip intrinsically-wide cell content to the column's allocated dp width
  // so nothing paints past its gridline (§3a.3f — the dp array is the single
  // source of column geometry). `flexShrink: 0` keeps the cell pinned at its
  // stamped dp inside the flex row rather than being squeezed by siblings.
  cellClip: {
    overflow: 'hidden',
    flexShrink: 0,
  },
});
