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
 * summed content width already computed. `MatrixGrid` holds NO layout
 * state and RESOLVES NOTHING; it only lays out Views. (The grid class is
 * a plain `React.Component` with `static contextType` so it can read the
 * theme's `matrix` recipe — the provider docblock's sanctioned
 * non-`SurveyElementBase` context path.)
 *
 * Documented amendment (design §4, 3.3a review finding 3): the design
 * names a per-row reactive unit (`MatrixTableRow`) subscribing the row's
 * state element — core mutates `renderedRow.isGhostRow`/`visible` IN
 * PLACE (question_matrixdropdownrendered.ts:169-171), which no
 * table-level subscription observes (3.3b detail rows / 3.4 drag
 * ghost-row need it). Since `MatrixGrid` renders per-cell thunks, that
 * unit lands HERE as the thin `MatrixGridRowSubscriber` below: each row
 * band is wrapped in a `SurveyElementBase` whose `getStateElement()` is
 * the contract row's `getStateElement()` — the ONE model-reactive piece
 * in this otherwise reactivity-free file. The grid layout itself still
 * subscribes nothing.
 *
 * The 3.1a wide baseline (§3a): ONE horizontal `ScrollView` whose content
 * is the whole grid — the row-header column lives INSIDE the scroll
 * content as each row's first cell, NOT a separate fixed pane. Each row
 * is one flex View whose cells share the resolved dp array (§3a.3f), so
 * natural per-row flex height keeps a row's cells the same height for free
 * — no split-pane, no height-sync. Sticky-first-column is a deferred 3.1b
 * enhancement (§3a.5, still deferred).
 *
 * The 3.1b mobile stacked-card path (§3b / §3d): when `contract.mobile` is
 * true (the survey `isMobile` flag flip — core has already rebuilt
 * `renderedRows` for mobile) `render()` branches to `renderCards()` — each
 * renderedRow becomes a CARD of `{columnLabel, cellContent}` pairs (row
 * header = card title, actions at the foot, detail full-width below) and
 * the footer becomes a totals summary card. It REUSES the SAME per-cell
 * `render()` thunks the wide grid dispatches; only the layout differs.
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
import type { Base } from '../../core/facade';
import { SurveyElementBase } from '../../reactivity/SurveyElementBase';
import { SurveyThemeContext } from '../../theme-rn/provider';
import type { SurveyThemeContextValue } from '../../theme-rn/provider';
import type {
  GridCell,
  GridRow,
  ResolvedGridColumn,
  ResolvedGridContract,
} from './grid-contract';

export interface MatrixGridProps {
  contract: ResolvedGridContract;
}

interface MatrixGridRowSubscriberProps {
  row: GridRow;
  /** Fresh-per-render row-band builder — a thunk (never pre-built
   * children) so a row-model notification re-runs the cell thunks. */
  renderRow: () => React.ReactNode;
}

/**
 * The per-row reactive unit (design §4 amendment — see file doc):
 * subscribes the contract row's declared state element so an IN-PLACE
 * property write on it (core's `renderedRow.visible`/`isGhostRow`)
 * re-renders exactly that row band. A non-subscribable state element
 * (e.g. a plain-object unit-test stub) is filtered to null HERE — not
 * merely skipped at subscribe time — because the base's D4 retarget bump
 * re-fires for every "added" element: a getter minting a fresh
 * non-subscribable object per call would otherwise loop
 * `componentDidUpdate` → bump forever. (Real contracts return a STABLE
 * core `Base` per row — see the GridRow docblock.)
 */
class MatrixGridRowSubscriber extends SurveyElementBase<MatrixGridRowSubscriberProps> {
  protected getStateElement(): Base | null {
    const element = this.props.row.getStateElement?.() ?? null;
    const subscribable =
      !!element &&
      typeof (element as { addOnPropertyValueChangedCallback?: unknown })
        .addOnPropertyValueChangedCallback === 'function';
    return subscribable ? element : null;
  }

  protected renderElement(): React.JSX.Element {
    return <>{this.props.renderRow()}</>;
  }
}

interface MatrixCardCellSubscriberProps {
  /** The cell's question `Base` — subscribed so a `visibleIf` flip re-renders. */
  element: Base;
  /** Live gate: the card renders NOTHING while this is false. */
  isVisible(): boolean;
  /** Fresh-per-render pair builder (thunk, not pre-built children). */
  renderPair(): React.ReactNode;
}

/**
 * The per-CELL reactive visibility unit (§3b, 3.1b review finding 2 — see
 * the file doc's card-path note): mounts for a question cell its column
 * `visibleIf` can hide per row on mobile, subscribes the cell's question,
 * and renders the WHOLE pair (label + value) — or NOTHING — reactively on a
 * flip. Web omits the whole cell; this matches it (vs. the wide path, where
 * `MatrixQuestionCell` keeps the aligned slot and only blanks its body).
 * ALWAYS mounted (even while hidden) so a flip-to-visible re-adds the pair.
 * Same subscribable guard as `MatrixGridRowSubscriber` — a non-subscribable
 * stub is filtered to null so the D4 retarget bump cannot loop.
 */
class MatrixCardCellSubscriber extends SurveyElementBase<MatrixCardCellSubscriberProps> {
  protected getStateElement(): Base | null {
    const element = this.props.element;
    const subscribable =
      !!element &&
      typeof (element as { addOnPropertyValueChangedCallback?: unknown })
        .addOnPropertyValueChangedCallback === 'function';
    return subscribable ? element : null;
  }

  protected renderElement(): React.JSX.Element | null {
    if (!this.props.isVisible()) return null;
    return <>{this.props.renderPair()}</>;
  }
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

  // --- Mobile stacked-card path (§3b / §3d, 3.1b) --------------------------
  // Engages when `contract.mobile` is true (the survey `isMobile` flag flip;
  // core has already rebuilt `renderedRows` for mobile). Each renderedRow is
  // laid out as a CARD of `{columnLabel, cellContent}` pairs — reusing the
  // SAME per-cell `render()` thunks the wide grid dispatches (chrome-less
  // cell questions / choice items / QuestionErrors), just stacked vertically
  // instead of column-aligned. The dp/contentWidth geometry is ignored here;
  // cards take the natural available width. No horizontal ScrollView.

  /** The {label, content} body of a card pair: the owner-attached column
   * label (§3b) above the reused cell content. A cell with no `label`
   * renders just its content (e.g. a footer's leading text slot). */
  private renderCardPairContent(cell: GridCell): React.ReactNode {
    const { fragments } = this.themeContext.recipes.matrix;
    return (
      <View
        key={cell.key}
        testID={`matrix-card-cell-${cell.key}`}
        style={fragments.cardRow}
      >
        {cell.label != null ? (
          <View testID={`matrix-card-label-${cell.key}`}>{cell.label}</View>
        ) : null}
        <View
          testID={`matrix-card-value-${cell.key}`}
          style={fragments.cardValue}
        >
          {cell.render()}
        </View>
      </View>
    );
  }

  /** One card pair. A cell carrying `cardVisibility` (a question cell its
   * column `visibleIf` can hide per row, 3.1b finding 2) is wrapped in the
   * per-cell subscriber so the WHOLE pair (label + slot) appears/disappears
   * reactively — and is OMITTED while hidden, matching web. Cells with no
   * gate render the pair directly. */
  private renderCardPair(cell: GridCell): React.ReactNode {
    if (cell.cardVisibility) {
      return (
        <MatrixCardCellSubscriber
          key={cell.key}
          element={cell.cardVisibility.element}
          isVisible={cell.cardVisibility.isVisible}
          renderPair={() => this.renderCardPairContent(cell)}
        />
      );
    }
    return this.renderCardPairContent(cell);
  }

  /**
   * A `data` (or `footer` totals) row → a card. The row-header `title` cell
   * is the card TITLE (row.text); `actions` cells (remove + detail toggle,
   * co-located by core on mobile) render at the card foot with no label;
   * `empty` filler is skipped; every other cell is a `{label, content}`
   * pair. The footer row uses the totals-card look and its leading footer
   * text becomes the totals-card title (§3d).
   */
  private renderCard(row: GridRow): React.ReactNode {
    const { fragments } = this.themeContext.recipes.matrix;
    const isTotals = row.kind === 'footer';
    const cardStyle = isTotals ? fragments.totalsCard : fragments.card;
    const titleStyle = isTotals
      ? fragments.totalsCardTitle
      : fragments.cardTitle;
    const containerTestID = isTotals
      ? 'matrix-totals-card'
      : `matrix-card-${row.key}`;
    const titles: React.ReactNode[] = [];
    const pairs: React.ReactNode[] = [];
    const actions: React.ReactNode[] = [];
    for (const cell of row.cells) {
      switch (cell.kind) {
        case 'title':
          titles.push(
            <View
              key={cell.key}
              testID={`matrix-card-title-${row.key}`}
              style={titleStyle}
            >
              {cell.render()}
            </View>
          );
          break;
        case 'actions':
          actions.push(
            <View
              key={cell.key}
              testID={`matrix-card-actions-${row.key}`}
              style={fragments.cardActions}
            >
              {cell.render()}
            </View>
          );
          break;
        case 'empty':
          break;
        default:
          pairs.push(this.renderCardPair(cell));
      }
    }
    return (
      <View key={row.key} testID={containerTestID} style={cardStyle}>
        {titles}
        {pairs}
        {actions}
      </View>
    );
  }

  /** A `detail` row in card mode → a full-width block below the data card
   * (§3c): the SurveyPanel owns its own layout, so no column alignment and
   * no dp width — it stacks edge-to-edge in the card list. */
  private renderCardDetail(row: GridRow): React.ReactNode {
    const { fragments } = this.themeContext.recipes.matrix;
    return (
      <View
        key={row.key}
        testID={`matrix-card-detail-${row.key}`}
        style={fragments.cardDetail}
      >
        {row.cells.map((cell) => (
          <React.Fragment key={cell.key}>{cell.render()}</React.Fragment>
        ))}
      </View>
    );
  }

  private renderCardRow(row: GridRow): React.ReactNode {
    return row.kind === 'detail'
      ? this.renderCardDetail(row)
      : this.renderCard(row);
  }

  private renderCards(): React.JSX.Element {
    return (
      <View testID="matrix-cards">
        {this.props.contract.rows.map((row) => (
          <MatrixGridRowSubscriber
            key={row.key}
            row={row}
            renderRow={() => this.renderCardRow(row)}
          />
        ))}
      </View>
    );
  }

  render(): React.JSX.Element {
    const { contract } = this.props;
    // §3b: the survey-flag mobile flip stacks the grid into cards; the wide
    // horizontal-scroll grid is the tablet/wide affordance (a matrix in
    // mobile mode ALWAYS stacks — not a self-measured width flip).
    if (contract.mobile) {
      return this.renderCards();
    }
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
          {contract.rows.map((row) => (
            <MatrixGridRowSubscriber
              key={row.key}
              row={row}
              renderRow={() => this.renderRow(row)}
            />
          ))}
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
