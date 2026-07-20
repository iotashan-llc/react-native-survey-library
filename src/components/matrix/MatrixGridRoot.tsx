/**
 * `MatrixGridRoot` — the M3 3.1a MEASUREMENT + width-resolution owner
 * (design: docs/design/M3-matrix-family-plan.md §3a.2 + the §3 "MatrixGrid
 * ownership" split). It is the reusable vehicle the family's
 * question-renderers (3.2 `MatrixQuestion`, 3.3 inner `MatrixTable`)
 * compose: they build the raw, core-decoupled `GridContract`; this owner
 * measures, resolves the column widths ONCE, and hands a fully-resolved
 * `ResolvedGridContract` to the presentational `MatrixGrid`. Keeping the
 * measurement + allocation here (rather than duplicated in each
 * question-renderer) is the single-owner discipline §3 mandates — the
 * measure View is the owner's, `MatrixGrid` resolves nothing. (Documented
 * refinement: the design names the question-renderer as the owner; 3.1a
 * factors that owner-behavior into this one reusable component so the
 * primitive is self-contained and testable without a question-renderer.)
 *
 * The measurement contract (§3a.2 — the verbatim `SurveyRow` device-bug
 * lesson): available width is read from the OUTER, pre-scroll root View
 * ONLY — the parent of the horizontal `ScrollView`. That View inherits a
 * concrete dp width from its `SurveyRowElement` / `QuestionChrome`
 * ancestor, so its `onLayout` reports a real width on the first committed
 * frame. We NEVER read width from a box INSIDE the ScrollView content
 * (whose intrinsic content width sizes to its children → a `width>0`-gated
 * box there measures against nothing, the defer never fires, the grid
 * renders blank). One-frame `width>0` defer, exactly like `SurveyRow`.
 *
 * `SurveyElementBase`-free: it owns only layout state (`measuredWidth`),
 * not model reactivity — the composing question-renderer owns the
 * survey-core subscription and re-renders this with a fresh contract when
 * the model changes. Width re-resolves whenever the contract or the
 * measured width changes.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { MatrixGrid } from './MatrixGrid';
import {
  allocateColumnWidths,
  type MatrixColumnSpec,
  type MatrixWidthConfig,
} from '../../layout/matrix-column-widths';
import type {
  GridColumn,
  GridContract,
  ResolvedGridColumn,
  ResolvedGridContract,
} from './grid-contract';

export interface MatrixGridRootProps {
  /** The raw, core-decoupled contract the question-renderer produced. */
  contract: GridContract;
  /**
   * Global width config for the allocator — `matrix.columnMinWidth` +
   * `settings.matrix.columnWidthsByType` (read through the facade by the
   * owner) + optional dp-constant overrides.
   */
  config?: MatrixWidthConfig;
}

interface MatrixGridRootState {
  /** Measured outer (pre-scroll) root width, dp; null until the first onLayout. */
  measuredWidth: number | null;
}

/** GridColumn -> the allocator's react-free per-column spec. */
function toColumnSpec(column: GridColumn): MatrixColumnSpec {
  return {
    width: column.width,
    minWidth: column.minWidth,
    cellType: column.cellType,
    isRowHeader: column.isRowHeader,
    intrinsic: column.intrinsic,
  };
}

export class MatrixGridRoot extends React.Component<
  MatrixGridRootProps,
  MatrixGridRootState
> {
  constructor(props: MatrixGridRootProps) {
    super(props);
    this.state = { measuredWidth: null };
  }

  private handleLayout = (event: LayoutChangeEvent): void => {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && width !== this.state.measuredWidth) {
      this.setState({ measuredWidth: width });
    }
  };

  /** Resolve the raw contract into the dp-stamped contract MatrixGrid consumes. */
  private resolveContract(measuredWidth: number): ResolvedGridContract {
    const { contract, config } = this.props;
    const { widths, contentWidth, regime } = allocateColumnWidths(
      contract.columns.map(toColumnSpec),
      measuredWidth,
      config
    );
    const columns: ResolvedGridColumn[] = contract.columns.map((column, i) => ({
      key: column.key,
      header: column.header,
      isRowHeader: column.isRowHeader,
      dp: widths[i] ?? 0,
    }));
    return {
      columns,
      contentWidth,
      rows: contract.rows,
      showHeader: contract.showHeader,
      hasFooter: contract.hasFooter,
      mobile: contract.mobile,
      stickyFirstColumn: contract.stickyFirstColumn,
      regime,
    };
  }

  render(): React.JSX.Element {
    const { measuredWidth } = this.state;
    return (
      <View testID="matrix-root" onLayout={this.handleLayout}>
        {measuredWidth !== null && measuredWidth > 0 ? (
          <MatrixGrid contract={this.resolveContract(measuredWidth)} />
        ) : null}
      </View>
    );
  }
}
