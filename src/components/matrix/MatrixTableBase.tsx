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
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { settings } from '../../core/facade';
import type {
  Base,
  ItemValue,
  MatrixDropdownRowModelBase,
  PanelModel,
  Question,
  QuestionMatrixDropdownModelBase,
  QuestionMatrixDropdownRenderedCell,
  QuestionMatrixDropdownRenderedRow,
  QuestionMatrixDropdownRenderedTable,
  SurveyModel,
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
import { RNIcon } from '../RNIcon';
import { SurveyPanel } from '../composition/SurveyPanel';
import {
  reportLayoutDiagnosticOnce,
  reportMatrixNullCellOnce,
} from '../../diagnostics';
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

interface MatrixQuestionCellProps {
  cell: QuestionMatrixDropdownRenderedCell;
  creator: unknown;
}

/**
 * One whole-question cell (§2b case 2) — a CLASS-BASED reactive wrapper
 * whose `getStateElement()` is the cell question, honoring PER-ROW cell
 * visibility (3.3a review finding 1). Core's rendered-cell `isVisible` is
 * a MOBILE-only affordance (`(!hasQuestion && !isErrorsCell) ||
 * !matrix?.isMobile || question.isVisible`,
 * question_matrixdropdownrendered.ts:110-111) — always true for a question
 * cell on the wide path. The real per-row state (column `visibleIf`
 * conditions) lives on `cell.question.isVisible`, which web gates the cell
 * BODY on (`renderQuestion`, reactquestion_matrixdropdownbase.tsx:407)
 * while keeping the td. Mirrored here: an invisible cell question renders
 * an EMPTY body — `MatrixGrid` keeps the allocated cell View/slot — and
 * because this wrapper (not the unmounted leaf) subscribes the question,
 * visibility flips re-render it in BOTH directions.
 */
export class MatrixQuestionCell extends SurveyElementBase<MatrixQuestionCellProps> {
  protected getStateElement(): Base | null {
    return (this.props.cell.question as unknown as Base) ?? null;
  }

  protected renderElement(): React.JSX.Element | null {
    const { cell, creator } = this.props;
    if (!cell.question.isVisible) return null;
    return (
      <View style={localStyles.cellBody}>
        {renderCellQuestion(cell.question, creator)}
        <QuestionErrors question={cell.question} />
      </View>
    );
  }
}

interface MatrixDetailToggleCellProps {
  cell: QuestionMatrixDropdownRenderedCell;
  matrix: QuestionMatrixDropdownModelBase;
  testID: string;
}

/**
 * 3.3b polish: the toggle's worst-case content box is the 16dp glyph wide
 * x the recipe's 32dp `minHeight` tall — under the 44pt (iOS) / 48dp
 * (Android) platform touch minimums. This slop bridges both axes to a
 * >=44dp effective target (16+14+14 / 32+6+6); the recipe's square
 * `minWidth`/`minHeight` grows the visual box where the intrinsic actions
 * column allows. The toggle is the only interactive element in its
 * column, so the slop cannot collide with a neighboring target.
 */
const DETAIL_TOGGLE_HIT_SLOP = {
  top: 6,
  bottom: 6,
  left: 14,
  right: 14,
} as const;

/**
 * The detail-toggle action cell (3.3b, §3c) — the RN analog of web's
 * `sv-matrix-detail-button`: press calls the row model's
 * `showHideDetailPanelClick()` (core owns the toggle, including the
 * `underRowSingle` collapse-others rule); the icon + a11y expanded state
 * read `row.isDetailPanelShowing` at render. Expand/collapse re-render
 * rides the design-named row callback: `row.onDetailPanelShowingChanged`
 * is a SINGLE-ASSIGNMENT field on the source row (core fires it from
 * `setIsDetailPanelShowing`, question_matrixdropdownbase.ts:398-400) —
 * attached with the same one-stable-bound-handler + clear-only-if-still-
 * ours discipline as the OUTER's `onRenderedTableResetCallback`. The icon
 * id comes from core's own `getDetailPanelIconId` (`icon-expanddetail` /
 * `icon-collapsedetail`, resolved through `renamedIcons` to the bundled
 * `expanddetails-16x16`/`collapsedetails-16x16` glyphs).
 */
export class MatrixDetailToggleCell extends SurveyElementBase<MatrixDetailToggleCellProps> {
  private boundRow: MatrixDropdownRowModelBase | null = null;
  private readonly handleShowingChanged = (): void => {
    this.setState((state) => ({ __svRev: (state.__svRev ?? 0) + 1 }));
  };

  private get row(): MatrixDropdownRowModelBase {
    return this.props.cell.row as unknown as MatrixDropdownRowModelBase;
  }

  protected getStateElement(): Base | null {
    return null;
  }

  private attach(): void {
    this.row.onDetailPanelShowingChanged = this.handleShowingChanged;
    this.boundRow = this.row;
  }

  /** Guarded clear: only null a field still pointing at OUR handler (a
   * reset-swap may mount the replacement toggle before this unmounts). */
  private detach(): void {
    if (
      this.boundRow &&
      this.boundRow.onDetailPanelShowingChanged === this.handleShowingChanged
    ) {
      this.boundRow.onDetailPanelShowingChanged = undefined as never;
    }
    this.boundRow = null;
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.attach();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    if (this.boundRow !== this.row) {
      this.detach();
      this.attach();
    }
  }

  componentWillUnmount(): void {
    this.detach();
    super.componentWillUnmount();
  }

  protected renderElement(): React.JSX.Element {
    const { matrix, testID } = this.props;
    const row = this.row;
    const expanded = row.isDetailPanelShowing;
    const matrixRecipe = this.themeContext.recipes.matrix;
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={matrix.getLocalizationString(
          expanded ? 'hideDetails' : 'showDetails'
        )}
        onPress={() => row.showHideDetailPanelClick()}
        hitSlop={DETAIL_TOGGLE_HIT_SLOP}
        style={matrixRecipe.fragments.detailToggle}
      >
        <RNIcon
          iconName={matrix.getDetailPanelIconId(row)}
          size={matrixRecipe.detailIconSize}
          fill={matrixRecipe.detailIconColor}
        />
      </Pressable>
    );
  }
}

/** Structural read of an actions cell's `ActionContainer` (`cell.item.value`)
 * for the ONE action kind 3.3b supports: the core-built detail toggle
 * (`show-detail` wide / `show-detail-mobile`,
 * question_matrixdropdownrendered.ts:800-825). Custom row actions remain
 * v1-unsupported no-ops (DIFFERENCES). */
function hasDetailToggleAction(
  cell: QuestionMatrixDropdownRenderedCell
): boolean {
  const container = (
    cell.item as unknown as {
      value?: { actions?: Array<{ id?: string }> };
    }
  )?.value;
  const actions = container?.actions;
  if (!Array.isArray(actions)) return false;
  return actions.some(
    (action) =>
      action?.id === 'show-detail' || action?.id === 'show-detail-mobile'
  );
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
  // Null-hardening (3.3a review finding 5, invariant 9): core's transposed
  // end-actions row pushes `getRowActionsCell(i, "end")` UNGUARDED
  // (question_matrixdropdownrendered.ts:1043) and it returns null for rows
  // without end actions (:733) — unlike the horizontal path, which
  // substitutes an empty cell (:896-905). Skip null/undefined cells; the
  // walker reports the anomaly through the deduped diagnostic seam from a
  // commit lifecycle (never during render).
  // §2a: core's per-cell error affordances (mobile interleave) are the
  // web's error surfacing — skipped entirely, replaced by the inline
  // QuestionErrors render.
  return row.cells.filter((cell) => !!cell && !cell.isErrorsCell);
}

/** True when core handed us a rendered row containing null/undefined
 * cells (the finding-5 shape `visibleCells` skips defensively). */
function hasNullCells(row: QuestionMatrixDropdownRenderedRow): boolean {
  return row.cells.some((cell) => !cell);
}

/** Row keys per the §4 keying table (stable across renderedTable resets). */
function rowKeyFor(row: QuestionMatrixDropdownRenderedRow): string {
  if (row.row) {
    // A detail rendered row carries the SAME source row as its data row
    // (createDetailPanelRow sets `res.row = row`) — the §4 keying table's
    // `parentDataRow.row.id + ':detail'` disambiguates the siblings.
    return row.isDetailRow ? `row:${row.row.id}:detail` : `row:${row.row.id}`;
  }
  // Transposed / vertical rendered row (NO source row): key off the
  // COLUMN identity it represents (stable `column.name`), never the
  // regenerating `renderedRow.uniqueId`; exploded vertical rows append
  // their choice index. (Null-filtered first — see visibleCells.)
  const cells = row.cells.filter((cell) => !!cell);
  const columnCell = cells.find((cell) => !!cell.column);
  if (columnCell) {
    const choiceCell = cells.find(
      (cell) => cell.isChoice && typeof cell.choiceIndex === 'number'
    );
    const suffix = choiceCell ? `:c${choiceCell.choiceIndex}` : '';
    return `vcol:${columnCell.column!.name}${suffix}`;
  }
  // The one enumerated column-less vertical row kind (3.3a review finding
  // 4): buildVerticalRows' END-ACTIONS row (createEndVerticalActionRow,
  // question_matrixdropdownrendered.ts:973-974/1036-1049) — exactly one
  // per table, keyed semantically, never by array index (§4).
  if (cells.some((cell) => cell.isActionsCell)) return 'vrow:actions-end';
  // WARN fallback — genuinely UNKNOWN vertical row kind (none exist in
  // v2.5.33): a content-derived stable token (the row's cell-kind
  // signature), never a bare index. Two unknown rows with an identical
  // signature would collide — acceptable for an unreachable branch;
  // revisit if core grows a new column-less vertical row kind.
  const signature = cells.map((cell) => classifyCell(cell)).join('.');
  return `vrow:unknown:${signature || 'empty'}`;
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
      // Sibling-unique disambiguation (3.3a review finding 2): the
      // exploded totals footer (createMutlipleColumnsFooter →
      // createMutlipleEditCells(isFooter=true),
      // question_matrixdropdownrendered.ts:1050-1067/1110-1115) renders
      // one cell PER CHOICE all sharing ONE total question (no `item` ⇒
      // not 'choice'), so a bare q:<uniqueId> repeats among footer
      // siblings. Footer question cells append their column slot —
      // reset-stability is moot there (read-only expression displays hold
      // no draft/focus state). DATA-row keys stay pure question identity
      // so leaves reconcile across resets even when slots shift (e.g. a
      // column visibility flip) — the §4 keying table's whole point.
      return rowKey === 'footer'
        ? `q:${cell.question.uniqueId}:s${slot}`
        : `q:${cell.question.uniqueId}`;
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
  /** Set during the render-phase walk when core handed us null cells
   * (finding 5); flushed post-commit — no diagnostics during render. */
  private nullCellsSeen = false;

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
    this.flushNullCellDiagnostic();
  }

  componentDidUpdate(): void {
    // The base's subscription diff performs the §4 detach-old/attach-new
    // retarget whenever `state.table` (the getStateElement identity) has
    // swapped — one atomic committed update, no blank frame.
    super.componentDidUpdate();
    this.scheduleEnsure();
    this.flushLayoutDiagnostic();
    this.flushNullCellDiagnostic();
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

  /** Finding 5's post-commit flush — deduped once per matrix question by
   * the diagnostics module (same seam discipline as the layout flush). */
  private flushNullCellDiagnostic(): void {
    if (!this.nullCellsSeen) return;
    const question = this.props.question;
    reportMatrixNullCellOnce(question, {
      code: 'matrix-null-cell',
      elementName: question.name,
      elementType: question.getType(),
      message:
        'renderedTable contained null cells (transposed end-actions row with ' +
        'per-row actions); the walker skipped them (invariant 9).',
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
        // NOT gated on the rendered cell's `isVisible` (mobile-only, always
        // true on the wide path) — MatrixQuestionCell owns the per-row
        // `cell.question.isVisible` gate AND its reactivity (finding 1).
        render = () => <MatrixQuestionCell cell={cell} creator={creator} />;
        break;
      case 'choice':
        render = () => <MatrixChoiceCell cell={cell} matrix={question} />;
        break;
      case 'other':
        render = () => <MatrixOtherCell cell={cell} />;
        break;
      case 'title':
        render = () =>
          SurveyElementBase.renderLocString(
            cell.locTitle,
            undefined,
            undefined,
            'choice'
          );
        break;
      case 'actions':
        // 3.3b: the core-built detail toggle is REAL (§3c); every OTHER
        // row action remains a v1-unsupported no-op — an inert placeholder
        // keeps the column aligned without building an action bar.
        if (hasDetailToggleAction(cell)) {
          const rowName = String(
            (cell.row as unknown as { rowName?: unknown })?.rowName ?? rowKey
          );
          render = () => (
            <MatrixDetailToggleCell
              cell={cell}
              matrix={question}
              testID={`matrix-detail-toggle-${rowName}`}
            />
          );
        } else {
          render = () => <View testID={`matrix-actions-${rowKey}-${slot}`} />;
        }
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
          {SurveyElementBase.renderLocString(
            cell.locTitle,
            undefined,
            undefined,
            'choice'
          )}
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

  /**
   * A detail rendered row (3.3b, §3c) → a FULL-WIDTH `'detail'` grid row
   * (the approved §3g divergence): core's leading buttonCell / trailing
   * actions slots are dropped and the row's REAL detail `PanelModel`
   * (`cell.panel === row.detailPanel`) renders edge-to-edge through the
   * existing SurveyPanel/SurveyRow composition (the paneldynamic
   * precedent) — nested questions dispatch through the factory with FULL
   * chrome (the chrome-less rule applies to CELLS, not detail content).
   */
  private buildDetailGridRow(
    renderedRow: QuestionMatrixDropdownRenderedRow,
    rowKey: string
  ): GridRow {
    const { question, creator } = this.props;
    const survey = question.survey as unknown as SurveyModel;
    const cells: GridCell[] = [];
    for (const cell of renderedRow.cells) {
      if (!cell || !cell.hasPanel) continue;
      const panel = cell.panel as PanelModel;
      cells.push({
        key: `${rowKey}:panel`,
        kind: 'panel' as const,
        render: () => (
          <SurveyPanel survey={survey} creator={creator} element={panel} />
        ),
      });
    }
    return {
      key: rowKey,
      kind: 'detail' as const,
      cells,
      getStateElement: (): Base => renderedRow as unknown as Base,
    };
  }

  /** Walk the held renderedTable into the raw GridContract (§3a). */
  private buildContract(
    table: QuestionMatrixDropdownRenderedTable
  ): GridContract {
    const question = this.props.question;
    // §2a: skip core's rendered error rows entirely. Detail rows RENDER
    // (3.3b) but are excluded from the column-template derivation — their
    // cells are span/panel slots, not per-column templates.
    const bodyRows = table.renderedRows.filter((row) => !row.isErrorsRow);
    const dataRows = bodyRows.filter((row) => !row.isDetailRow);
    const columns = this.buildColumns(table, dataRows);

    const rows: GridRow[] = bodyRows.map((renderedRow) => {
      if (hasNullCells(renderedRow)) this.nullCellsSeen = true;
      const rowKey = rowKeyFor(renderedRow);
      if (renderedRow.isDetailRow) {
        return this.buildDetailGridRow(renderedRow, rowKey);
      }
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
      if (hasNullCells(footerRow)) this.nullCellsSeen = true;
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
