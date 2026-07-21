/**
 * `MatrixTableBase` — the M3 3.3a renderedTable rendering core for the
 * matrixdropdown/matrixdynamic pair (design:
 * docs/design/M3-matrix-family-plan.md §2, §2a, §2b, §3a, §3d, §4).
 *
 * The two-level component split (§4 — ONE reset strategy, stable inner
 * identity + explicit retarget, NOT a keyed remount):
 *
 * - OUTER `MatrixTableBase extends QuestionElementBase`:
 *   `getStateElement()` returns the STABLE question (value/css/loc/
 *   `isMobile` subscription) and registers the model's
 *   `onRenderedTableResetCallback` (single-assignment field, one stable
 *   bound handler → `setState`, the paneldynamic 2.8a discipline). On a
 *   reset it does NOT read the now-destroyed `renderedTable`; it bumps a
 *   monotonic `resetToken` passed to the INNER, whose React identity
 *   persists (no key off the renderedTable).
 *
 * - INNER `MatrixTable extends SurveyElementBase` — the
 *   NO-UNDEFINED-COMMIT contract: it holds the CURRENT
 *   `QuestionMatrixDropdownRenderedTable` in its OWN state
 *   (`state.table`), `getStateElement()` returns that held instance, and
 *   it NEVER renders `undefined` — on a reset it keeps rendering the
 *   prior (old-but-valid) reference until the deferred ensure has
 *   re-created the table OUT of render, then swaps atomically in one
 *   committed update; the base class's `componentDidUpdate` subscription
 *   diff detaches the old table and attaches the new one in the same
 *   commit. Leaves keyed off the immutable `cell.question.uniqueId`
 *   reconcile in place across the swap, so drafts/focus survive whenever
 *   the underlying `Question` instances survive (§4 keying table).
 *
 * - Render purity (§4, the 2.5/2.5fu lesson): `renderedTable` is built
 *   LAZILY by core (`getPropertyValue(..., () => createRenderedTable())`)
 *   — reading the getter during render would construct + subscribe inside
 *   a React render pass. The INNER only ever reads the getter inside a
 *   one-microtask deferred ensure scheduled from
 *   `componentDidMount`/`DidUpdate`; render + state seeding use the
 *   NON-CREATING backing read below.
 *
 * Cell walk (§2/§2a/§2b): chrome-less dispatch through the SAME
 * registered `…QuestionElement` factory rows a top-level question uses
 * (OverlayContext flows to cell dropdowns for free), inline reactive
 * `QuestionErrors` per non-choice question cell and once per exploded
 * choice group at `isFirstChoice`, core's `isErrorsRow`/`isErrorsCell`
 * affordances skipped entirely, and the `showInMultipleColumns` 'choice'
 * cells rendered ONE item per cell via the shared question's REAL
 * select-base APIs (`isItemSelected`/`clickItemHandler`).
 */
import * as React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { settings } from '../../core/facade';
import type {
  Base,
  ItemValue,
  Question,
  QuestionMatrixDropdownModelBase,
  QuestionMatrixDropdownRenderedCell,
  QuestionMatrixDropdownRenderedRow,
  QuestionMatrixDropdownRenderedTable,
} from '../../core/facade';
import { QuestionElementBase } from '../../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../../reactivity/SurveyElementBase';
import type { SurveyElementBaseState } from '../../reactivity/SurveyElementBase';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import { resolveQuestionDispatchKey } from '../../factories/dispatch-key';
import { createUnsupportedQuestion } from '../UnsupportedQuestion';
import { QuestionErrors } from '../QuestionErrors';
import { ChoiceItemRow } from '../ChoiceItemRow';
import type { ChoiceItemRowProps } from '../ChoiceItemRow';
import { OtherCommentDraftAdapter } from '../../inputs/OtherCommentDraftAdapter';
import { reportLayoutDiagnosticOnce } from '../../diagnostics';
import { MatrixGridRoot } from './MatrixGridRoot';
import type { MatrixWidthConfig } from '../../layout/matrix-column-widths';
import type {
  GridCell,
  GridColumn,
  GridContract,
  GridRow,
} from './grid-contract';

/**
 * THE isolated protected-API cast (§11.3, resolved; the 2.5 R3 adapter
 * pattern — peer floor `>=2.5.32 <2.6.0`): `Base.getPropertyValueWithoutDefault`
 * (base.ts:771-774) is the NON-CREATING backing read of the lazy
 * `renderedTable` property — the matrix itself uses it in
 * `isRendredTableCreated` (question_matrixdropdownbase.ts:1292). It
 * returns `undefined` before creation and the LIVE instance after, and
 * never constructs/subscribes — safe in render. Behavioral compat test in
 * MatrixDropdownQuestion.test.tsx.
 */
export function readRenderedTableNonCreating(
  question: QuestionMatrixDropdownModelBase
): QuestionMatrixDropdownRenderedTable | undefined {
  return (
    question as unknown as {
      getPropertyValueWithoutDefault(
        name: string
      ): QuestionMatrixDropdownRenderedTable | undefined;
    }
  ).getPropertyValueWithoutDefault('renderedTable');
}

/**
 * Chrome-less cell dispatch (§2): resolve the SAME dispatch key a
 * top-level question uses and render through the registered factory row —
 * no `<QuestionChrome>` (the column header is the cell's title). A factory
 * miss (unsupported cellType, e.g. `file` before M5) degrades to the
 * per-cell non-throwing fallback + structured diagnostic (invariant 9).
 */
export function renderCellQuestion(
  question: Question,
  creator: unknown
): React.JSX.Element {
  const dispatchKey = resolveQuestionDispatchKey(question);
  const questionProps = { question, creator };
  return (
    RNQuestionFactory.createQuestion(dispatchKey, questionProps) ??
    createUnsupportedQuestion(questionProps, { dispatchKey })
  );
}

/** The select-base subset the choice-cell path drives (§2b — verified
 * REAL APIs; there is NO `question.isChecked` on the select base). */
type SelectBaseLike = Question & {
  isItemSelected(item: ItemValue): boolean;
  clickItemHandler(item: ItemValue, checked?: boolean): void;
};

interface MatrixChoiceCellProps {
  cell: QuestionMatrixDropdownRenderedCell;
  matrix: QuestionMatrixDropdownModelBase;
}

/**
 * One `showInMultipleColumns` exploded choice cell (§2b case 4) — a
 * CLASS-BASED reactive wrapper whose `getStateElement()` is the SHARED
 * choice `cell.question` (invariant 2): selecting an item in one exploded
 * cell re-renders the whole group's checked state. Renders ONE
 * radio/checkbox item via `ChoiceItemRow` with the caption hidden (the
 * column header carries the choice text) and the synthesized
 * `getCellAriaLabel` label; the shared question's error renders once, at
 * `isFirstChoice` (§2a).
 */
export class MatrixChoiceCell extends SurveyElementBase<MatrixChoiceCellProps> {
  protected getStateElement(): Base | null {
    return (this.props.cell.question as unknown as Base) ?? null;
  }

  private handlePress = (): void => {
    const cell = this.props.cell;
    const question = cell.question as SelectBaseLike;
    if (cell.isCheckbox) {
      // Two-arg toggle form — the EXPLICIT next-checked boolean is
      // REQUIRED (core does not compute the toggle); mirrors Checkbox.tsx.
      question.clickItemHandler(cell.item, !question.isItemSelected(cell.item));
    } else {
      // Radiogroup single-arg select-only form — never a hand-rolled toggle.
      question.clickItemHandler(cell.item);
    }
  };

  protected renderElement(): React.JSX.Element {
    const { cell, matrix } = this.props;
    const question = cell.question as SelectBaseLike;
    const rowName = String(
      (cell.row as unknown as { rowName?: unknown })?.rowName ?? ''
    );
    const colName = cell.column?.name ?? cell.question.name;
    const ariaLabel = matrix.getCellAriaLabel(cell.row, cell.column);
    return (
      <View>
        <ChoiceItemRow
          question={question as unknown as ChoiceItemRowProps['question']}
          item={cell.item}
          shape={cell.isCheckbox ? 'checkbox' : 'radio'}
          checked={question.isItemSelected(cell.item)}
          onPress={this.handlePress}
          hideCaption
          accessibilityLabel={ariaLabel}
          testID={`matrix-choice-${rowName}-${colName}-${cell.choiceIndex}`}
        />
        {cell.isFirstChoice ? (
          <QuestionErrors question={cell.question} />
        ) : null}
      </View>
    );
  }
}

interface MatrixOtherCellProps {
  cell: QuestionMatrixDropdownRenderedCell;
}

/**
 * The Other choice cell (§2b case 3) — `isChoice` yet neither `isCheckbox`
 * nor `isRadio`: it edits the SHARED question's `otherValue`/comment
 * through the controlled `OtherCommentDraftAdapter` (invariant 3), never
 * an item button. The adapter is built in `componentDidMount` (its
 * constructor subscribes to the model — a commit-phase side effect, the
 * ChoiceItemRow precedent) and disposed on unmount.
 */
export class MatrixOtherCell extends SurveyElementBase<MatrixOtherCellProps> {
  private adapter: OtherCommentDraftAdapter | undefined;

  protected getStateElement(): Base | null {
    return (this.props.cell.question as unknown as Base) ?? null;
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.adapter = new OtherCommentDraftAdapter({
      question: this.props.cell.question,
      onRenderedValueChange: () => {
        this.setState((state) => ({ __svRev: (state.__svRev ?? 0) + 1 }));
      },
    });
  }

  componentWillUnmount(): void {
    this.adapter?.dispose();
    this.adapter = undefined;
    super.componentWillUnmount();
  }

  protected renderElement(): React.JSX.Element {
    const cell = this.props.cell;
    const question = cell.question as Question & { otherValue?: string };
    const rowName = String(
      (cell.row as unknown as { rowName?: unknown })?.rowName ?? ''
    );
    const colName = cell.column?.name ?? question.name;
    const value =
      this.adapter?.renderedValue ?? String(question.otherValue ?? '');
    return (
      <View>
        <TextInput
          testID={`matrix-other-${rowName}-${colName}`}
          accessibilityLabel={cell.item?.text}
          value={value}
          editable={!question.isInputReadOnly}
          onChangeText={(text) => this.adapter?.handleChangeText(text)}
          onBlur={() => this.adapter?.handleBlur()}
        />
        {cell.isFirstChoice ? (
          <QuestionErrors question={cell.question} />
        ) : null}
      </View>
    );
  }
}

/** §2b cell-kind precedence — ALL no-question structural cells FIRST. */
type WalkedCellKind =
  'drag' | 'empty' | 'actions' | 'question' | 'other' | 'choice' | 'title';

function classifyCell(
  cell: QuestionMatrixDropdownRenderedCell
): WalkedCellKind {
  // 0. No-question structural cells (a row-actions cell ALSO carries
  //    `item`, so `isChoice` is true for it — it must resolve before any
  //    item path; `hasQuestion` is false for all of these).
  if (cell.isDragHandlerCell) return 'drag';
  if (cell.isEmpty) return 'empty';
  if (cell.isActionsCell) return 'actions';
  if (cell.hasQuestion) {
    if (!cell.isChoice) return 'question'; // case 2 — whole-question dispatch
    if (cell.isOtherChoice) return 'other'; // case 3 — Other-comment adapter
    if (cell.isCheckbox || cell.isRadio) return 'choice'; // case 4 — one item per cell
    // Unreachable in v2.5.33 (isSupportMultipleColumns limits explosion to
    // checkbox/radiogroup); degrade to an inert cell, never crash.
    return 'empty';
  }
  // Row-text / column-title text cells (no question, locTitle present).
  if (cell.hasTitle) return 'title';
  return 'empty';
}

/** Maps the walked kind onto the presentational GridCellKind space. */
function toGridCellKind(kind: WalkedCellKind): GridCell['kind'] {
  switch (kind) {
    case 'question':
    case 'other':
      return 'question';
    case 'choice':
      return 'choice';
    case 'title':
      return 'title';
    case 'actions':
    case 'drag':
      return 'actions';
    default:
      return 'empty';
  }
}

function visibleCells(
  row: QuestionMatrixDropdownRenderedRow
): QuestionMatrixDropdownRenderedCell[] {
  // §2a: core's per-cell error affordances (mobile interleave) are the
  // web's error surfacing — skipped entirely, replaced by the inline
  // QuestionErrors render.
  return row.cells.filter((cell) => !cell.isErrorsCell);
}

/** Row keys per the §4 keying table (stable across renderedTable resets). */
function rowKeyFor(
  row: QuestionMatrixDropdownRenderedRow,
  index: number
): string {
  if (row.row) return `row:${row.row.id}`;
  // Transposed / vertical rendered row (NO source row): key off the
  // COLUMN identity it represents (stable `column.name`), never the
  // regenerating `renderedRow.uniqueId`; exploded vertical rows append
  // their choice index.
  const columnCell = row.cells.find((cell) => !!cell.column);
  if (columnCell) {
    const choiceCell = row.cells.find(
      (cell) => cell.isChoice && typeof cell.choiceIndex === 'number'
    );
    const suffix = choiceCell ? `:c${choiceCell.choiceIndex}` : '';
    return `vcol:${columnCell.column!.name}${suffix}`;
  }
  return `vrow:${index}`;
}

/** Cell keys per the §4 keying table — immutable question identity
 * (`cell.question.uniqueId`) primary; composite rowKey+kind+slot for
 * no-question cells; NEVER the regenerating `cell.id`/array index. */
function cellKeyFor(
  cell: QuestionMatrixDropdownRenderedCell,
  kind: WalkedCellKind,
  rowKey: string,
  slot: number
): string {
  switch (kind) {
    case 'question':
      return `q:${cell.question.uniqueId}`;
    case 'choice':
      return `q:${cell.question.uniqueId}:c${cell.choiceIndex}`;
    case 'other':
      return `q:${cell.question.uniqueId}:other`;
    case 'actions':
      return `${rowKey}:actions:${slot}`;
    case 'drag':
      return `${rowKey}:drag`;
    case 'title':
      return `${rowKey}:title:${slot}`;
    default:
      return `${rowKey}:empty:${slot}`;
  }
}

interface MatrixTableProps {
  question: QuestionMatrixDropdownModelBase;
  creator: unknown;
  /** Monotonic reset signal from the OUTER (§4) — its change schedules the
   * deferred ensure that picks up the recreated renderedTable. */
  resetToken: number;
}

interface MatrixTableState extends SurveyElementBaseState {
  table?: QuestionMatrixDropdownRenderedTable;
}

/**
 * INNER table — holds the current renderedTable in state (see file doc:
 * the no-undefined-commit contract) and walks it into the raw
 * `GridContract` for `MatrixGridRoot` (which owns measurement + the §3a.3
 * column-width allocation).
 */
export class MatrixTable extends SurveyElementBase<
  MatrixTableProps,
  MatrixTableState
> {
  private unmounted = false;
  private ensureScheduled = false;

  constructor(props: MatrixTableProps) {
    super(props);
    // Seed from the NON-CREATING read only — safe in the render phase
    // (StrictMode may replay this constructor; the read is pure). When the
    // table does not exist yet, the deferred ensure below creates it OUT
    // of render and the first table arrives via setState.
    this.state = {
      table: readRenderedTableNonCreating(props.question),
    } as MatrixTableState;
  }

  protected getStateElement(): Base | null {
    return (this.state.table as unknown as Base) ?? null;
  }

  protected canRender(): boolean {
    return !!this.state.table;
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.scheduleEnsure();
    this.flushLayoutDiagnostic();
  }

  componentDidUpdate(): void {
    // The base's subscription diff performs the §4 detach-old/attach-new
    // retarget whenever `state.table` (the getStateElement identity) has
    // swapped — one atomic committed update, no blank frame.
    super.componentDidUpdate();
    this.scheduleEnsure();
    this.flushLayoutDiagnostic();
  }

  componentWillUnmount(): void {
    this.unmounted = true;
    super.componentWillUnmount();
  }

  /**
   * The deferred (one-microtask) ensure (§4 render purity): materialize
   * `renderedTable` OUTSIDE render — the creating getter runs consumer
   * callbacks and fires core notifications that must never land in the
   * D2/D4 guarded window. Instance-scoped latch; a StrictMode remount gets
   * a fresh instance (latch reset for free).
   */
  private scheduleEnsure(): void {
    if (this.ensureScheduled) return;
    this.ensureScheduled = true;
    Promise.resolve().then(() => {
      this.ensureScheduled = false;
      if (this.unmounted) return;
      const question = this.props.question;
      let live = readRenderedTableNonCreating(question);
      if (!live) {
        // Creating read — deliberately out of render.
        live = question.renderedTable;
      }
      if (live && this.state.table !== live) {
        this.setState({ table: live });
      }
    });
  }

  /** §3b.5: a wide transposed layout renders faithfully as a plain grid;
   * surface the polish gap through the deferred, deduped diagnostic seam
   * (ImageQuestion/paneldynamic pattern). */
  private flushLayoutDiagnostic(): void {
    const question = this.props.question;
    if (question.isColumnLayoutHorizontal || question.isMobile) return;
    reportLayoutDiagnosticOnce(question, {
      code: 'layout-diagnostic',
      layoutCode: 'matrix-vertical-layout',
      property: 'transposeData',
      value: String(question.transposeData),
      elementName: question.name,
      elementType: question.getType(),
      message:
        'Transposed (vertical) matrix layout renders as a plain non-sticky grid in v0.3 ' +
        '(design §3b.5 / DIFFERENCES 13); visual polish gaps may exist.',
    });
  }

  /** Build one walked grid cell (render thunk per §2/§2a/§2b). */
  private buildGridCell(
    cell: QuestionMatrixDropdownRenderedCell,
    rowKey: string,
    slot: number
  ): GridCell {
    const kind = classifyCell(cell);
    const { question, creator } = this.props;
    const key = cellKeyFor(cell, kind, rowKey, slot);
    let render: () => React.ReactNode;
    switch (kind) {
      case 'question':
        render = () =>
          cell.isVisible ? (
            <View style={localStyles.cellBody}>
              {renderCellQuestion(cell.question, creator)}
              <QuestionErrors question={cell.question} />
            </View>
          ) : null;
        break;
      case 'choice':
        render = () => <MatrixChoiceCell cell={cell} matrix={question} />;
        break;
      case 'other':
        render = () => <MatrixOtherCell cell={cell} />;
        break;
      case 'title':
        render = () => SurveyElementBase.renderLocString(cell.locTitle);
        break;
      case 'actions':
        // 3.3a: every row action (detail toggles included) is a
        // v1-unsupported no-op — an inert placeholder keeps the column
        // aligned without building an action bar (detail panels are 3.3b).
        render = () => <View testID={`matrix-actions-${rowKey}-${slot}`} />;
        break;
      default:
        render = () => null;
    }
    return {
      key,
      kind: toGridCellKind(kind),
      span: cell.colSpans > 1 ? cell.colSpans : undefined,
      render,
    };
  }

  /**
   * Column slots from the header row when shown, else from the first
   * (filtered) data row — both carry core's `setCellWidth`-stamped raw
   * width/minWidth strings (the §3a.3 allocation inputs, exactly what web
   * applies). Slot KINDS (actions/drag/row-header) are detected from the
   * first data row's flags, which the header's empty cells do not carry.
   */
  private buildColumns(
    table: QuestionMatrixDropdownRenderedTable,
    dataRows: QuestionMatrixDropdownRenderedRow[]
  ): GridColumn[] {
    const headerCells =
      table.showHeader && table.headerRow ? table.headerRow.cells : [];
    const firstDataCells = dataRows.length ? visibleCells(dataRows[0]!) : [];
    const templateCells = headerCells.length ? headerCells : firstDataCells;
    return templateCells.map((cell, slot) => {
      const dataCell = firstDataCells[slot];
      const kindCell = dataCell ?? cell;
      const intrinsic = kindCell.isActionsCell
        ? ('actions' as const)
        : kindCell.isDragHandlerCell
          ? ('drag' as const)
          : undefined;
      const isRowHeader =
        !intrinsic && !!dataCell && classifyCell(dataCell) === 'title';
      const header = cell.hasTitle ? (
        <View style={localStyles.headerContent}>
          {SurveyElementBase.renderLocString(cell.locTitle)}
          {cell.requiredMark ? <Text>{` ${cell.requiredMark}`}</Text> : null}
        </View>
      ) : null;
      return {
        key: `col:${slot}`,
        header,
        isRowHeader,
        width: cell.width || undefined,
        minWidth: cell.minWidth || undefined,
        cellType: cell.column?.cellType ?? dataCell?.column?.cellType,
        intrinsic,
      };
    });
  }

  /** Walk the held renderedTable into the raw GridContract (§3a). */
  private buildContract(
    table: QuestionMatrixDropdownRenderedTable
  ): GridContract {
    const question = this.props.question;
    // §2a: skip core's rendered error rows entirely; detail rows are 3.3b
    // (deferred — their toggle actions are no-ops this phase).
    const dataRows = table.renderedRows.filter(
      (row) => !row.isErrorsRow && !row.isDetailRow
    );
    const columns = this.buildColumns(table, dataRows);

    const rows: GridRow[] = dataRows.map((renderedRow, index) => {
      const rowKey = rowKeyFor(renderedRow, index);
      return {
        key: rowKey,
        kind: 'data' as const,
        cells: visibleCells(renderedRow).map((cell, slot) =>
          this.buildGridCell(cell, rowKey, slot)
        ),
        getStateElement: (): Base => renderedRow as unknown as Base,
      };
    });

    // §3d: the footer band is gated on renderedTable.showFooter (NOT
    // hasFooter — the wide transposed layout suppresses it); total cells
    // are read-only expression questions dispatched like any question
    // cell, aligned to the shared column dp array.
    if (table.showFooter && table.footerRow) {
      const footerRow = table.footerRow;
      rows.push({
        key: 'footer',
        kind: 'footer' as const,
        cells: visibleCells(footerRow).map((cell, slot) =>
          this.buildGridCell(cell, 'footer', slot)
        ),
        getStateElement: (): Base => footerRow as unknown as Base,
      });
    }

    return {
      columns,
      rows,
      showHeader: table.showHeader && !!table.headerRow,
      hasFooter: table.hasFooter,
      mobile: question.isMobile,
      stickyFirstColumn: false,
    };
  }

  protected renderElement(): React.JSX.Element {
    const table = this.state.table!;
    const question = this.props.question;
    const config: MatrixWidthConfig = {
      columnMinWidth: question.columnMinWidth || undefined,
      // Read live through the facade (consumer-overridable), never
      // hardcoded (§3a.3a).
      columnWidthsByType: settings.matrix.columnWidthsByType,
    };
    return (
      <MatrixGridRoot contract={this.buildContract(table)} config={config} />
    );
  }
}

export type MatrixTableBaseProps = QuestionElementBaseProps;

interface MatrixTableBaseState extends SurveyElementBaseState {
  resetToken?: number;
}

/**
 * OUTER question renderer base for the matrixdropdown/matrixdynamic pair —
 * see the file doc. 3.4 (matrixdynamic) extends this with add-row buttons
 * and the empty-state placeholder; 3.3a ships the static-row shape.
 */
export class MatrixTableBase<
  P extends QuestionElementBaseProps = QuestionElementBaseProps,
> extends QuestionElementBase<P, MatrixTableBaseState> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected get matrix(): QuestionMatrixDropdownModelBase {
    return this.questionBase as unknown as QuestionMatrixDropdownModelBase;
  }

  /** Single-assignment callback field + one stable bound handler
   * (paneldynamic 2.8a discipline; setState — never forceUpdate). */
  private boundQuestion: QuestionMatrixDropdownModelBase | null = null;
  private readonly handleRenderedTableReset = (): void => {
    this.setState((state) => ({
      resetToken: (state.resetToken ?? 0) + 1,
    }));
  };

  private attachCallbacks(question: QuestionMatrixDropdownModelBase): void {
    question.onRenderedTableResetCallback = this.handleRenderedTableReset;
    this.boundQuestion = question;
  }

  /** Guarded clear: only null a field still pointing at OUR handler. */
  private detachCallbacks(question: QuestionMatrixDropdownModelBase): void {
    if (
      question.onRenderedTableResetCallback === this.handleRenderedTableReset
    ) {
      question.onRenderedTableResetCallback = undefined as never;
    }
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.attachCallbacks(this.matrix);
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    const question = this.matrix;
    if (this.boundQuestion && this.boundQuestion !== question) {
      this.detachCallbacks(this.boundQuestion);
      this.attachCallbacks(question);
    }
  }

  componentWillUnmount(): void {
    if (this.boundQuestion) this.detachCallbacks(this.boundQuestion);
    this.boundQuestion = null;
    super.componentWillUnmount();
  }

  protected renderElement(): React.JSX.Element {
    // NO renderedTable read here (§4): the INNER holds/ensures the table;
    // this pass-through only forwards the monotonic reset signal. The
    // INNER's React identity is stable (no key off the renderedTable).
    return (
      <View testID="matrixdropdown-table" style={localStyles.container}>
        <MatrixTable
          question={this.matrix}
          creator={this.creator}
          resetToken={this.state.resetToken ?? 0}
        />
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  container: { alignSelf: 'stretch' } as ViewStyle,
  cellBody: { alignSelf: 'stretch' } as ViewStyle,
  headerContent: { flexDirection: 'row', flexWrap: 'wrap' } as ViewStyle,
});
