/**
 * The normalized GridContract (design: docs/design/M3-matrix-family-plan.md
 * §1) — the survey-core-decoupled interface the matrix family's three
 * question types (`matrix`, `matrixdropdown`, `matrixdynamic`) all produce
 * so ONE presentational primitive (`MatrixGrid`) can serve them, exactly
 * as `OverlayControlBase` unified dropdown/tagbox/rating/buttongroup.
 *
 * There are TWO shapes here (design §1 / §3 "MatrixGrid ownership"):
 *
 *  - The RAW `GridContract` (below) is the question-renderer OWNER's
 *    output. Its `GridColumn.width`/`minWidth` are core's raw CSS strings
 *    (`"120px"`, `"20%"`, `columnMinWidth`, `rowTitleWidth`) read straight
 *    off core cells/columns — the allocator's INPUT, not a resolved dp.
 *  - The `ResolvedGridContract` is what the presentational `MatrixGrid`
 *    CONSUMES: the same rows/cells, but every column carries a resolved
 *    integer `dp` width and the contract carries the summed `contentWidth`
 *    (both produced once by the measurement owner via
 *    `allocateColumnWidths`, §3a.3). `MatrixGrid` resolves NOTHING.
 *
 * `GridColumn` carries the §1 fields plus the optional allocation inputs
 * `cellType` / `intrinsic` the width algorithm (§3a.3) needs — the "..."
 * of the design's contract sketch. These map 1:1 onto the pure
 * `MatrixColumnSpec` the allocator takes (which cannot carry the
 * `header: ReactNode`, being react-free).
 */
import type { ReactNode } from 'react';
import type { Base } from '../../core/facade';

/** A normalized grid cell kind (design §1 / §2b cell-kind precedence). */
export type GridCellKind =
  'question' | 'panel' | 'choice' | 'title' | 'actions' | 'empty';

/** A normalized grid row kind (design §1 / §3g row topology). */
export type GridRowKind = 'data' | 'detail' | 'footer' | 'error';

/**
 * A column slot. `width`/`minWidth`/`cellType`/`intrinsic` are the
 * OWNER's allocation inputs (§3a.3); `header` + `isRowHeader` drive
 * presentation.
 */
export interface GridColumn {
  key: string;
  /** Column header node (the cell's title lives here — cells render chrome-less, §2). */
  header: ReactNode;
  /** The leading row-header column (its width/minWidth = `getRowTitleWidth()`). */
  isRowHeader?: boolean;
  /** Raw `column.width` CSS string from core (allocation input). */
  width?: string;
  /** Raw column-level `column.minWidth` from core (allocation input). */
  minWidth?: string;
  /** cellType for the `columnWidthsByType` per-cellType default-minWidth lookup. */
  cellType?: string;
  /** Intrinsic fixed-width column (actions/drag → ACTIONS_COL_DP; never auto-grown). */
  intrinsic?: 'actions' | 'drag';
}

/**
 * A rendered cell. `span` (colspan) makes the cell a single View summing
 * the exact spanned column dp widths (§3a.1). `render()` is the OWNER's
 * per-cell thunk (chrome-less question dispatch, choice item, actions,
 * etc.); `MatrixGrid` calls it — it does not build cell content itself.
 */
export interface GridCell {
  key: string;
  kind: GridCellKind;
  /** Colspan (default 1); a spanned cell sums the spanned column dp widths. */
  span?: number;
  render(): ReactNode;
}

/**
 * A rendered row. `kind` drives topology (§3g): `data`/`footer` are
 * COLUMN-ALIGNED (cells share the dp array); `detail` is FULL-WIDTH (the
 * SurveyPanel spans the whole content width). `getStateElement()` is the
 * per-row reactive identity — subscribed by `MatrixGrid`'s thin
 * `MatrixGridRowSubscriber` (design §4 amendment, 3.3a review: core
 * mutates `renderedRow.visible`/`isGhostRow` in place, so each row band
 * re-renders from that notification alone; the grid layout itself stays
 * reactivity-free). It MUST return a STABLE instance per underlying row
 * model (repeat calls → the same object) — an identity-churning getter
 * would re-trigger the reactive base's retarget reconcile on every
 * commit.
 */
export interface GridRow {
  key: string;
  kind: GridRowKind;
  cells: GridCell[];
  getStateElement(): Base;
}

/**
 * The RAW contract the question-renderer owner produces (columns carry
 * raw width/minWidth strings). The measurement owner resolves it into a
 * `ResolvedGridContract` before handing it to `MatrixGrid`.
 */
export interface GridContract {
  columns: GridColumn[];
  rows: GridRow[];
  showHeader: boolean;
  hasFooter: boolean;
  mobile: boolean;
  stickyFirstColumn: boolean;
}

/** A column with its resolved integer-dp width (allocator output). */
export interface ResolvedGridColumn {
  key: string;
  header: ReactNode;
  isRowHeader?: boolean;
  /** Resolved integer-dp width (from `allocateColumnWidths`, §3a.3). */
  dp: number;
}

/**
 * The fully-resolved contract `MatrixGrid` consumes: dp widths + summed
 * content width applied identically to header/body/footer (§3a.3f).
 */
export interface ResolvedGridContract {
  columns: ResolvedGridColumn[];
  /** Σ of the column dp widths — stamped on every band so nothing shrinks differently. */
  contentWidth: number;
  rows: GridRow[];
  showHeader: boolean;
  hasFooter: boolean;
  mobile: boolean;
  stickyFirstColumn: boolean;
  /** Informational: 'fit' (content fits the viewport) or 'overflow' (scrollable). */
  regime: 'fit' | 'overflow';
}
