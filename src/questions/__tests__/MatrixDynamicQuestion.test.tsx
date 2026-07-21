/**
 * `matrixdynamic` (dynamic rows) — task M3 3.4 (design:
 * docs/design/M3-matrix-family-plan.md §2b, §3e, §4, §8 phasing row 3.4a,
 * §9 TDD notes). `MatrixDynamicQuestion` is a THIN consumer of the shared
 * `MatrixTableBase` via the design's per-consumer hooks
 * (`renderAboveTable`/`renderBelowTable`/`getEmptyState`): add-row
 * buttons driven by `renderedTable.showAddRowOnTop`/`showAddRowOnBottom`
 * (§3e — never recompute the location), the `noRowsText` placeholder when
 * `renderedTable.showTable === false` with its add button gated
 * SEPARATELY on `renderedTable.showAddRow`, and PER-ACTION rendering in
 * shared actions cells (§2b: `remove-row` → `removeRowUI` through the 2.2
 * dialog adapter; `show-detail`/`show-detail-mobile` → the 3.3b toggle;
 * unknown ids → no-op) replacing 3.3b's whole-cell toggle takeover.
 *
 * Red-first: before 3.4 lands, `matrixdynamic` has no descriptor row, so
 * it dispatches to the non-throwing UnsupportedQuestion fallback
 * (invariant 9) — every assertion below is RED until MatrixDynamicQuestion
 * + the MatrixTableBase hooks + the descriptor/manifest flip ship.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import { UnsupportedQuestion } from '../../components/UnsupportedQuestion';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';
import { registerDialogHost } from '../../overlay/dialog-adapter';
import { setDiagnosticHandler } from '../../diagnostics';
import { QuestionChrome } from '../../components/QuestionChrome';
import {
  MatrixDynamicQuestion,
  MatrixDynamicQuestionElement,
} from '../MatrixDynamicQuestion';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** MatrixGridRoot defers its grid one frame until the OUTER pre-scroll root
 * View measures a width>0 (§3a.2) — fire a layout on every `matrix-root`. */
function layoutGrid(): void {
  act(() => {
    for (const root of screen.queryAllByTestId('matrix-root')) {
      fireEvent(root, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 0 } },
      });
    }
  });
}

/** Detail-panel content renders through the real SurveyPanel/SurveyRow
 * composition, whose rows defer one frame until measured (1.3-design D3). */
function layoutRows(): void {
  act(() => {
    for (const row of screen.queryAllByTestId('sv-row')) {
      fireEvent(row, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 0 } },
      });
    }
  });
}

/** The §3e/§4 dynamic-matrix surface this suite drives (the production
 * component isolates its own casts; the test keeps one structural view). */
interface MatrixDynamicLike extends Question {
  rowCount: number;
  renderedTable: unknown;
  addRow(setFocus?: boolean): void;
  addRowByIndex(rowData: unknown, toIndex: number): void;
  removeRow(index: number, confirmDelete?: boolean): void;
  value: unknown;
}

interface MatrixFixture {
  model: InstanceType<typeof Model>;
  question: MatrixDynamicLike;
}

function createMatrixDynamic(
  extra: Record<string, unknown> = {}
): MatrixFixture {
  const model = new Model({
    elements: [
      {
        type: 'matrixdynamic',
        name: 'mdyn',
        columns: [{ name: 'c1', cellType: 'text' }],
        rowCount: 2,
        minRowCount: 0,
        ...extra,
      },
    ],
  });
  return {
    model,
    question: model.getQuestionByName('mdyn') as unknown as MatrixDynamicLike,
  };
}

/** 3.4 detail fixture — dynamic rows + a text detail panel (§3c/§3e). */
function createDetailDynamic(
  extra: Record<string, unknown> = {}
): MatrixFixture {
  return createMatrixDynamic({
    detailPanelMode: 'underRow',
    detailElements: [{ type: 'text', name: 'd1', title: 'Detail One' }],
    ...extra,
  });
}

async function renderMatrixDynamic(question: MatrixDynamicLike): Promise<void> {
  render(<MatrixDynamicQuestionElement question={question} creator={{}} />);
  // The INNER materializes renderedTable via the deferred (one-microtask)
  // ensure — never during render (§4 render purity).
  await flush();
  layoutGrid();
  await flush();
}

/** Settle a structural change that may have FULL-RESET the renderedTable
 * (§4 no-undefined-commit): flush the deferred ensure, re-measure, flush. */
async function settle(): Promise<void> {
  await flush();
  layoutGrid();
  await flush();
}

function plainValue(question: MatrixDynamicLike): unknown {
  return JSON.parse(JSON.stringify(question.value ?? null));
}

const DATA_ROW = /^matrix-row-row:/;
const REMOVE_BTN = /^matrix-remove-row-/;
const DETAIL_BAND = /^matrix-detail-row:/;

describe('matrixdynamic — dispatch flip (unsupported → supported)', () => {
  it('registers a `matrixdynamic` template row so it no longer hits the fallback', () => {
    expect(RNQuestionFactory.getAllTypes()).toContain('matrixdynamic');
    const { question } = createMatrixDynamic();
    const element = RNQuestionFactory.createQuestion('matrixdynamic', {
      question,
      creator: {},
    });
    expect(element).not.toBeNull();
    expect(element!.type).toBe(MatrixDynamicQuestionElement);
    expect(element!.type).not.toBe(UnsupportedQuestion);
  });

  it('exports the class + element wrapper pair (family shape)', () => {
    expect(typeof MatrixDynamicQuestion).toBe('function');
    expect(typeof MatrixDynamicQuestionElement).toBe('function');
  });
});

describe('matrixdynamic — initial render (rows from renderedRows, §3e add button)', () => {
  it('renders one data row per initial rowCount with real text cells', async () => {
    const { question } = createMatrixDynamic();
    await renderMatrixDynamic(question);
    expect(screen.getAllByTestId(DATA_ROW)).toHaveLength(2);
    expect(screen.getAllByTestId('c1-input')).toHaveLength(2);
  });

  it('default addRowLocation renders ONE bottom add button (showAddRowOnBottom), captioned addRowText', async () => {
    const { question } = createMatrixDynamic();
    await renderMatrixDynamic(question);
    expect(screen.getByTestId('matrixdynamic-add-bottom')).toBeTruthy();
    expect(screen.queryByTestId('matrixdynamic-add-top')).toBeNull();
    expect(screen.getByText('Add Row')).toBeTruthy();
  });

  it('pressing add appends a row via addRowUI (rowCount + rendered rows grow)', async () => {
    const { question } = createMatrixDynamic();
    await renderMatrixDynamic(question);
    fireEvent.press(screen.getByTestId('matrixdynamic-add-bottom'));
    await settle();
    expect(question.rowCount).toBe(3);
    expect(screen.getAllByTestId(DATA_ROW)).toHaveLength(3);
  });

  it('addRowLocation "top" renders the TOP button only; press appends', async () => {
    const { question } = createMatrixDynamic({ addRowLocation: 'top' });
    await renderMatrixDynamic(question);
    expect(screen.getByTestId('matrixdynamic-add-top')).toBeTruthy();
    expect(screen.queryByTestId('matrixdynamic-add-bottom')).toBeNull();
    fireEvent.press(screen.getByTestId('matrixdynamic-add-top'));
    await settle();
    expect(question.rowCount).toBe(3);
  });

  it('addRowLocation "topBottom" renders BOTH buttons', async () => {
    const { question } = createMatrixDynamic({ addRowLocation: 'topBottom' });
    await renderMatrixDynamic(question);
    expect(screen.getByTestId('matrixdynamic-add-top')).toBeTruthy();
    expect(screen.getByTestId('matrixdynamic-add-bottom')).toBeTruthy();
  });
});

describe('matrixdynamic — remove per row (no confirm)', () => {
  it('renders one remove button per removable row; press removes THAT row', async () => {
    const { model, question } = createMatrixDynamic();
    model.data = { mdyn: [{ c1: 'first' }, { c1: 'second' }] };
    await renderMatrixDynamic(question);
    const removes = screen.getAllByTestId(REMOVE_BTN);
    expect(removes).toHaveLength(2);
    fireEvent.press(removes[0]!);
    await settle();
    expect(question.rowCount).toBe(1);
    expect(plainValue(question)).toEqual([{ c1: 'second' }]);
  });
});

describe('matrixdynamic — min/maxRowCount gates on BOTH sides (§3e)', () => {
  it('at maxRowCount the add button is ABSENT; removing a row brings it back', async () => {
    const { question } = createMatrixDynamic({ maxRowCount: 2 });
    await renderMatrixDynamic(question);
    expect(screen.queryByTestId('matrixdynamic-add-bottom')).toBeNull();
    expect(screen.queryByTestId('matrixdynamic-add-top')).toBeNull();
    fireEvent.press(screen.getAllByTestId(REMOVE_BTN)[0]!);
    await settle();
    expect(question.rowCount).toBe(1);
    expect(screen.getByTestId('matrixdynamic-add-bottom')).toBeTruthy();
  });

  it('at minRowCount remove buttons are ABSENT; adding a row makes the actions column APPEAR (full reset, no blank frame)', async () => {
    const { question } = createMatrixDynamic({ minRowCount: 2 });
    await renderMatrixDynamic(question);
    expect(screen.queryAllByTestId(REMOVE_BTN)).toHaveLength(0);
    fireEvent.press(screen.getByTestId('matrixdynamic-add-bottom'));
    await settle();
    // The action column appearing is a FULL renderedTable reset (core's
    // isRequireReset: hasRemoveRows != canRemoveRows) — the swap must
    // land atomically with every row still rendering (§4).
    expect(question.rowCount).toBe(3);
    expect(screen.getAllByTestId('c1-input')).toHaveLength(3);
    expect(screen.getAllByTestId(REMOVE_BTN)).toHaveLength(3);
  });

  it('removing back down to minRowCount makes the actions column DISAPPEAR (full reset, rows keep rendering)', async () => {
    const { question } = createMatrixDynamic({ rowCount: 3, minRowCount: 2 });
    await renderMatrixDynamic(question);
    expect(screen.getAllByTestId(REMOVE_BTN)).toHaveLength(3);
    fireEvent.press(screen.getAllByTestId(REMOVE_BTN)[0]!);
    await settle();
    expect(question.rowCount).toBe(2);
    expect(screen.queryAllByTestId(REMOVE_BTN)).toHaveLength(0);
    expect(screen.getAllByTestId('c1-input')).toHaveLength(2);
  });
});

describe('matrixdynamic — confirmDelete routes through the 2.2 dialog adapter (§3e)', () => {
  function setupConfirm() {
    const stack = createOverlayStack<OverlayPayload>();
    const token = registerDialogHost(stack);
    const { model, question } = createMatrixDynamic({ confirmDelete: true });
    // Confirm fires only for a non-empty row value
    // (isRequireConfirmOnRowDelete).
    model.data = { mdyn: [{ c1: 'a' }, { c1: 'b' }] };
    return { stack, token, question };
  }

  it('press remove queues the RN confirmation dialog; APPLY removes the row', async () => {
    const { stack, token, question } = setupConfirm();
    try {
      await renderMatrixDynamic(question);
      fireEvent.press(screen.getAllByTestId(REMOVE_BTN)[0]!);
      await flush();
      // A confirmation dialog is queued (NOT an immediate removal).
      expect(stack.entries()).toHaveLength(1);
      expect(question.rowCount).toBe(2);
      const payload = stack.entries()[0]!.payload;
      act(() => {
        payload.footerActions.getActionById('apply')!.action();
        payload.onDismissAcknowledged();
      });
      await settle();
      expect(question.rowCount).toBe(1);
      expect(plainValue(question)).toEqual([{ c1: 'b' }]);
    } finally {
      token.dispose();
    }
  });

  it('CANCEL keeps the row (and its value) intact', async () => {
    const { stack, token, question } = setupConfirm();
    try {
      await renderMatrixDynamic(question);
      fireEvent.press(screen.getAllByTestId(REMOVE_BTN)[0]!);
      await flush();
      expect(stack.entries()).toHaveLength(1);
      const payload = stack.entries()[0]!.payload;
      act(() => {
        payload.footerActions.getActionById('cancel')!.action();
        payload.onDismissAcknowledged();
      });
      await settle();
      expect(question.rowCount).toBe(2);
      expect(plainValue(question)).toEqual([{ c1: 'a' }, { c1: 'b' }]);
    } finally {
      token.dispose();
    }
  });
});

describe('matrixdynamic — per-action rendering in shared actions cells (§2b)', () => {
  it('desktop detail matrix: the START actions cell renders the toggle, the END cell the remove button — per row', async () => {
    const { question } = createDetailDynamic();
    await renderMatrixDynamic(question);
    expect(screen.getAllByTestId(/^matrix-detail-toggle-/)).toHaveLength(2);
    expect(screen.getAllByTestId(REMOVE_BTN)).toHaveLength(2);
  });

  it('mobile co-location: ONE end actions cell renders BOTH the detail toggle AND the remove button (the 3.3b finding)', async () => {
    const { model, question } = createDetailDynamic();
    act(() => {
      (model as unknown as { setIsMobile(v: boolean): void }).setIsMobile(true);
    });
    await renderMatrixDynamic(question);
    // Core co-locates `show-detail-mobile` + `remove-row` in the SAME
    // end ActionContainer on mobile — the RN cell must render EACH action
    // (3.3b rendered only the toggle).
    expect(screen.getAllByTestId(/^matrix-detail-toggle-/)).toHaveLength(2);
    expect(screen.getAllByTestId(REMOVE_BTN)).toHaveLength(2);
    // Both actions stay live: toggle expands, remove removes. In mobile
    // mode the matrix now stacks into cards (3.1b), so the expanded detail
    // renders as the card-mode full-width band (`matrix-card-detail-row:`),
    // not the wide-grid `matrix-detail-row:` band.
    fireEvent.press(screen.getAllByTestId(/^matrix-detail-toggle-/)[0]!);
    await flush();
    layoutRows();
    await flush();
    expect(screen.getAllByTestId(/^matrix-card-detail-row:/)).toHaveLength(1);
    fireEvent.press(screen.getAllByTestId(REMOVE_BTN)[1]!);
    await settle();
    expect(question.rowCount).toBe(1);
  });
});

describe('matrixdynamic — row-action `enabled` flag honored (onGetMatrixRowActions)', () => {
  /** The consumer-facing Action slice the event hands out (real core
   * `Action` instances — `enabled` is the getter/setter pair backed by
   * the `@property() _enabled` field). */
  interface ActionLike {
    id?: string;
    enabled?: boolean;
  }

  function captureRowActions(
    model: MatrixFixture['model'],
    id: string,
    mutate: (action: ActionLike) => void
  ): ActionLike[] {
    const captured: ActionLike[] = [];
    (
      model as unknown as {
        onGetMatrixRowActions: {
          add(handler: (sender: unknown, options: unknown) => void): void;
        };
      }
    ).onGetMatrixRowActions.add((_, options) => {
      const action = (options as { actions: ActionLike[] }).actions.find(
        (a) => a.id === id
      );
      if (action) {
        mutate(action);
        captured.push(action);
      }
    });
    return captured;
  }

  it('enabled=false on the default remove-row action disables the button and press does NOT remove; flipping enabled back re-enables reactively', async () => {
    const { model, question } = createMatrixDynamic();
    model.data = { mdyn: [{ c1: 'a' }, { c1: 'b' }] };
    const captured = captureRowActions(model, 'remove-row', (action) => {
      action.enabled = false;
    });
    await renderMatrixDynamic(question);
    const removes = screen.getAllByTestId(REMOVE_BTN);
    expect(removes).toHaveLength(2);
    expect(captured).toHaveLength(2);
    // Web parity (Action.disabled = enabled !== undefined && !enabled,
    // action.ts:268-270): the locked row's button renders disabled...
    expect(removes[0]!.props.accessibilityState?.disabled).toBe(true);
    // ...and pressing it does NOT remove the row.
    fireEvent.press(removes[0]!);
    await settle();
    expect(question.rowCount).toBe(2);
    expect(plainValue(question)).toEqual([{ c1: 'a' }, { c1: 'b' }]);
    // Re-enabling the SAME stored Action instance is reactive: `_enabled`
    // is a core @property and the button subscribes the Action itself.
    act(() => {
      captured[0]!.enabled = true;
    });
    await settle();
    const after = screen.getAllByTestId(REMOVE_BTN);
    expect(after[0]!.props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(after[0]!);
    await settle();
    expect(question.rowCount).toBe(1);
    expect(plainValue(question)).toEqual([{ c1: 'b' }]);
  });

  it('enabled=false on the show-detail action disables the detail toggle (same Action semantics) and press does NOT expand', async () => {
    const { model, question } = createDetailDynamic();
    captureRowActions(model, 'show-detail', (action) => {
      action.enabled = false;
    });
    await renderMatrixDynamic(question);
    const toggles = screen.getAllByTestId(/^matrix-detail-toggle-/);
    expect(toggles).toHaveLength(2);
    expect(toggles[0]!.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(toggles[0]!);
    await flush();
    layoutRows();
    await flush();
    expect(screen.queryAllByTestId(DETAIL_BAND)).toHaveLength(0);
  });
});

describe('matrixdynamic — §4 draft survival across in-place and reset row ops', () => {
  it('an external removal BEFORE the edited row (in-place, no reset) keeps the draft on the SAME question', async () => {
    const { question } = createMatrixDynamic();
    await renderMatrixDynamic(question);
    const tableBefore = question.renderedTable;
    fireEvent.changeText(screen.getAllByTestId('c1-input')[1]!, 'kept-draft');
    act(() => {
      // External MODEL delete of row 0 (API, not UI) — the in-place
      // onRemovedRow splice path (canRemoveRows unchanged, no reset).
      question.removeRow(0, false);
    });
    await settle();
    expect(question.renderedTable).toBe(tableBefore);
    const inputs = screen.getAllByTestId('c1-input');
    expect(inputs).toHaveLength(1);
    // The draft was NOT committed and NOT misrouted to the removed row.
    expect(inputs[0]!.props.value).toBe('kept-draft');
    expect(plainValue(question)).toBeNull();
    fireEvent(inputs[0]!, 'blur');
    expect(plainValue(question)).toEqual([{ c1: 'kept-draft' }]);
  });

  it('an external FRONT insertion (addRowByIndex — FULL reset) keeps the draft on the surviving question identity', async () => {
    const { question } = createMatrixDynamic();
    await renderMatrixDynamic(question);
    const tableBefore = question.renderedTable;
    fireEvent.changeText(screen.getAllByTestId('c1-input')[1]!, 'mid-draft');
    act(() => {
      question.addRowByIndex({ c1: 'front' }, 0);
    });
    await settle();
    // addRowByIndex resets the renderedTable (rowCount bump) — the swap
    // reconciles leaves by immutable cell.question.uniqueId (§4), so the
    // surviving question keeps its uncommitted draft.
    expect(question.renderedTable).not.toBe(tableBefore);
    const inputs = screen.getAllByTestId('c1-input');
    expect(inputs).toHaveLength(3);
    // Core's value-shape semantics put the inserted value at index 0 (the
    // surviving row instances keep their positions).
    expect(inputs[0]!.props.value).toBe('front');
    expect(inputs[1]!.props.value).toBe('mid-draft');
    fireEvent(inputs[1]!, 'blur');
    const value = plainValue(question) as Array<Record<string, unknown>>;
    expect(value[0]).toEqual({ c1: 'front' });
    expect(value[1]).toEqual({ c1: 'mid-draft' });
  });

  it('external model add via addRow() (API, not UI) re-renders the new row', async () => {
    const { question } = createMatrixDynamic();
    await renderMatrixDynamic(question);
    act(() => {
      question.addRow();
    });
    await settle();
    expect(screen.getAllByTestId(DATA_ROW)).toHaveLength(3);
  });
});

describe('matrixdynamic — empty state (§3e polarity: placeholder iff showTable === false)', () => {
  it('hideColumnsIfEmpty + 0 rows renders the noRowsText placeholder (no grid) with the showAddRow-gated add button', async () => {
    const { question } = createMatrixDynamic({
      rowCount: 0,
      hideColumnsIfEmpty: true,
    });
    await renderMatrixDynamic(question);
    expect(screen.getByTestId('matrixdynamic-placeholder')).toBeTruthy();
    expect(screen.getByText('There are no rows.')).toBeTruthy();
    // The table (and its in-table add buttons) is hidden...
    expect(screen.queryByTestId('matrix-root')).toBeNull();
    // ...but the placeholder's OWN add button gates on the STANDALONE
    // renderedTable.showAddRow (NOT showAddRowOnTop/Bottom, both false
    // here — the §3e polarity trap).
    expect(screen.getByTestId('matrixdynamic-add-placeholder')).toBeTruthy();
  });

  it('the first row adds FROM the empty state (placeholder → grid)', async () => {
    const { question } = createMatrixDynamic({
      rowCount: 0,
      hideColumnsIfEmpty: true,
    });
    await renderMatrixDynamic(question);
    fireEvent.press(screen.getByTestId('matrixdynamic-add-placeholder'));
    await settle();
    expect(question.rowCount).toBe(1);
    expect(screen.queryByTestId('matrixdynamic-placeholder')).toBeNull();
    expect(screen.getAllByTestId('c1-input')).toHaveLength(1);
  });

  it('adding DISALLOWED (allowAddRows:false) shows the text with NO add button', async () => {
    const { question } = createMatrixDynamic({
      rowCount: 0,
      hideColumnsIfEmpty: true,
      allowAddRows: false,
    });
    await renderMatrixDynamic(question);
    expect(screen.getByTestId('matrixdynamic-placeholder')).toBeTruthy();
    expect(screen.getByText('There are no rows.')).toBeTruthy();
    expect(screen.queryByTestId('matrixdynamic-add-placeholder')).toBeNull();
  });
});

describe('matrixdynamic — transposed layout resets fully on add (§3e/§4)', () => {
  afterEach(() => setDiagnosticHandler(undefined));

  it('transposed add (TOP button) rebuilds the vertical renderedTable cleanly', async () => {
    // Capture the (expected, deduped) 3.3a vertical-layout diagnostic so
    // it does not fall through to the default console.warn handler.
    const codes: string[] = [];
    setDiagnosticHandler((payload) => codes.push(payload.code as string));
    const { question } = createMatrixDynamic({ transposeData: true });
    await renderMatrixDynamic(question);
    expect(codes).toContain('layout-diagnostic');
    // Transposed places the add button on TOP (core's
    // updateShowTableAndAddRow — driven, never recomputed).
    expect(screen.getByTestId('matrixdynamic-add-top')).toBeTruthy();
    expect(screen.queryByTestId('matrixdynamic-add-bottom')).toBeNull();
    const tableBefore = question.renderedTable;
    fireEvent.press(screen.getByTestId('matrixdynamic-add-top'));
    await settle();
    // Transposed add/remove ALWAYS full-resets (isRequireReset:
    // !isColumnLayoutHorizontal) — no-undefined-commit holds.
    expect(question.rowCount).toBe(3);
    expect(question.renderedTable).not.toBe(tableBefore);
    expect(screen.getAllByTestId('c1-input')).toHaveLength(3);
  });
});

describe('matrixdynamic — detail preservation across unrelated add/remove (§3e)', () => {
  it('an expanded detail row survives an in-place add AND an in-place remove of OTHER rows', async () => {
    const { question } = createDetailDynamic({ rowCount: 3 });
    await renderMatrixDynamic(question);
    fireEvent.press(screen.getAllByTestId(/^matrix-detail-toggle-/)[0]!);
    await flush();
    layoutRows();
    await flush();
    expect(screen.getAllByTestId(DETAIL_BAND)).toHaveLength(1);
    expect(screen.getByTestId('d1-input')).toBeTruthy();
    // Unrelated ADD (in-place — removability unchanged).
    fireEvent.press(screen.getByTestId('matrixdynamic-add-bottom'));
    await settle();
    expect(screen.getAllByTestId(DATA_ROW)).toHaveLength(4);
    expect(screen.getAllByTestId(DETAIL_BAND)).toHaveLength(1);
    // Unrelated REMOVE of the LAST row (in-place).
    const removes = screen.getAllByTestId(REMOVE_BTN);
    fireEvent.press(removes[removes.length - 1]!);
    await settle();
    expect(screen.getAllByTestId(DATA_ROW)).toHaveLength(3);
    expect(screen.getAllByTestId(DETAIL_BAND)).toHaveLength(1);
    expect(screen.getByTestId('d1-input')).toBeTruthy();
  });
});

/** Flip the survey into mobile mode — drives the §3b stacked-card path
 * (core rebuilds `renderedTable` on `onMobileChanged`). */
function setMobile(model: InstanceType<typeof Model>, value = true): void {
  (model as unknown as { setIsMobile(v: boolean): void }).setIsMobile(value);
}

const CARD_BAND = /^matrix-card-row:/;
const CARD_DETAIL_BAND = /^matrix-card-detail-row:/;

describe('matrixdynamic — mobile stacked-card layout (§3b/§3e, 3.1b)', () => {
  it('renders rows as cards and the add button still adds a row (card grows)', async () => {
    const { model, question } = createMatrixDynamic();
    setMobile(model);
    await renderMatrixDynamic(question);
    // Cards, not the wide scroll grid.
    expect(screen.getByTestId('matrix-cards')).toBeTruthy();
    expect(screen.queryByTestId('matrix-scroll')).toBeNull();
    expect(screen.getAllByTestId(CARD_BAND)).toHaveLength(2);
    // Add button (a consumer hook OUTSIDE the grid) still renders + works.
    fireEvent.press(screen.getByTestId('matrixdynamic-add-bottom'));
    await settle();
    expect(question.rowCount).toBe(3);
    expect(screen.getAllByTestId(CARD_BAND)).toHaveLength(3);
  });

  it('the per-row remove button lives in the card actions foot and removes THAT row', async () => {
    const { model, question } = createMatrixDynamic();
    model.data = { mdyn: [{ c1: 'first' }, { c1: 'second' }] };
    setMobile(model);
    await renderMatrixDynamic(question);
    const removes = screen.getAllByTestId(REMOVE_BTN);
    expect(removes).toHaveLength(2);
    fireEvent.press(removes[0]!);
    await settle();
    expect(question.rowCount).toBe(1);
    expect(plainValue(question)).toEqual([{ c1: 'second' }]);
    // Still a card stack after the remove.
    expect(screen.getAllByTestId(CARD_BAND)).toHaveLength(1);
  });

  it('detail toggle + panel work in card mode (panel stacks full-width below the card)', async () => {
    const { model, question } = createDetailDynamic();
    setMobile(model);
    await renderMatrixDynamic(question);
    // The mobile-colocated actions cell carries BOTH the detail toggle and
    // the remove button at the card foot.
    const toggle = screen.getAllByTestId(/^matrix-detail-toggle-/)[0]!;
    expect(toggle).toBeTruthy();
    expect(screen.queryAllByTestId(CARD_DETAIL_BAND)).toHaveLength(0);
    fireEvent.press(toggle);
    await settle();
    layoutRows();
    await flush();
    expect(screen.getAllByTestId(CARD_DETAIL_BAND)).toHaveLength(1);
    expect(screen.getByText('Detail One')).toBeTruthy();
    expect(screen.getByTestId('d1-input')).toBeTruthy();
  });

  it('the empty-state placeholder still renders in mobile mode', async () => {
    const { model, question } = createMatrixDynamic({
      rowCount: 0,
      hideColumnsIfEmpty: true,
    });
    setMobile(model);
    await renderMatrixDynamic(question);
    // No cards, the placeholder shows (with its add button gated on showAddRow).
    expect(screen.getByTestId('matrixdynamic-placeholder')).toBeTruthy();
    expect(screen.getByTestId('matrixdynamic-add-placeholder')).toBeTruthy();
  });
});

/** The validate()/hasErrors() surface the 3.4b edge cases drive (kept as one
 * structural view, mirroring `MatrixDynamicLike`). */
interface MatrixValidateLike extends MatrixDynamicLike {
  validate(): boolean;
  hasErrors(fireCallback?: boolean): boolean;
  isRequired: boolean;
  minRowCount: number;
}

const KEY_DUP_TEXT = 'This value should be unique.';
const MIN_ROW_TEXT = 'Please fill in at least 2 row(s).';

describe('matrixdynamic — 3.4b keyName duplication surfaces inline in the offending cells (§2a chrome-less QuestionErrors)', () => {
  it('duplicate keyName values render the KeyDuplicationError inline in EACH offending cell; fixing clears it', async () => {
    const { model, question } = createMatrixDynamic({ keyName: 'c1' });
    const q = question as unknown as MatrixValidateLike;
    model.data = { mdyn: [{ c1: 'dup' }, { c1: 'dup' }] };
    await renderMatrixDynamic(question);
    // Before validation core has not run the duplication check yet.
    expect(screen.queryAllByText(KEY_DUP_TEXT)).toHaveLength(0);
    // Core adds a KeyDuplicationError to the cell question in BOTH offending
    // rows on validate (survey-core question_matrixdynamictests
    // "Matrixdynamic duplicationError"). isValueInColumnDuplicated → addError
    // lands on `visibleRows[i].getQuestionByColumnName('c1')`, which IS the
    // rendered cell question, so the 3.3a per-cell QuestionErrors renders it.
    act(() => {
      q.validate();
    });
    await flush();
    expect(screen.getAllByText(KEY_DUP_TEXT)).toHaveLength(2);
    // Fix the duplicate → re-validate → the inline errors clear in both cells
    // (removeDuplicatedErrorsInRows), proving the cell QuestionErrors is
    // reactive in BOTH directions.
    act(() => {
      q.value = [{ c1: 'a' }, { c1: 'b' }];
      q.validate();
    });
    await settle();
    expect(screen.queryAllByText(KEY_DUP_TEXT)).toHaveLength(0);
  });

  it('unique keyName values never produce the inline error', async () => {
    const { model, question } = createMatrixDynamic({ keyName: 'c1' });
    const q = question as unknown as MatrixValidateLike;
    model.data = { mdyn: [{ c1: 'a' }, { c1: 'b' }] };
    await renderMatrixDynamic(question);
    act(() => {
      q.validate();
    });
    await flush();
    expect(screen.queryAllByText(KEY_DUP_TEXT)).toHaveLength(0);
  });
});

describe('matrixdynamic — 3.4b detailPanelShowOnAdding auto-expands the new row detail on add (§3c)', () => {
  it('adding a row auto-expands ITS detail panel (core addRow → showDetailPanel)', async () => {
    const { question } = createDetailDynamic({
      detailPanelShowOnAdding: true,
      rowCount: 1,
    });
    await renderMatrixDynamic(question);
    // Nothing expanded on the initial single row.
    expect(screen.queryAllByTestId(DETAIL_BAND)).toHaveLength(0);
    fireEvent.press(screen.getByTestId('matrixdynamic-add-bottom'));
    await settle();
    layoutRows();
    await flush();
    expect(question.rowCount).toBe(2);
    // The newly-added (last) row's detail panel is expanded automatically —
    // exactly one detail band, and its real detail question renders.
    expect(screen.getAllByTestId(DETAIL_BAND)).toHaveLength(1);
    expect(screen.getByTestId('d1-input')).toBeTruthy();
  });

  it('WITHOUT detailPanelShowOnAdding, adding a row leaves the detail collapsed', async () => {
    const { question } = createDetailDynamic({ rowCount: 1 });
    await renderMatrixDynamic(question);
    fireEvent.press(screen.getByTestId('matrixdynamic-add-bottom'));
    await settle();
    layoutRows();
    await flush();
    expect(question.rowCount).toBe(2);
    expect(screen.queryAllByTestId(DETAIL_BAND)).toHaveLength(0);
  });
});

/** Render the matrix wrapped in `QuestionChrome` — the production path
 * (SurveyRowElement wraps every dispatched question in chrome), where the
 * matrix's OWN question-level errors surface through the chrome error panel. */
async function renderMatrixInChrome(
  question: MatrixDynamicLike
): Promise<void> {
  render(
    <QuestionChrome question={question as unknown as Question} creator={{}}>
      <MatrixDynamicQuestionElement question={question} creator={{}} />
    </QuestionChrome>
  );
  await flush();
  layoutGrid();
  await flush();
}

describe('matrixdynamic — 3.4b minRowCount validation surfaces the question-level error via chrome', () => {
  it('a required matrix below minRowCount shows the MinRowCountError through the question chrome', async () => {
    const { model, question } = createMatrixDynamic({
      isRequired: true,
      minRowCount: 2,
    });
    // One filled row + one (min-padded) empty row → non-empty count 1 <
    // minRowCount 2, and the matrix itself is non-empty (no plain required
    // error competing).
    model.data = { mdyn: [{ c1: 'x' }] };
    const q = question as unknown as MatrixValidateLike;
    await renderMatrixInChrome(question);
    expect(screen.queryByText(MIN_ROW_TEXT)).toBeNull();
    // Explicit validation (isOnValueChanged === false) pushes
    // MinRowCountError onto the QUESTION; the chrome error panel renders it.
    act(() => {
      q.hasErrors(true);
    });
    await flush();
    expect(screen.getByText(MIN_ROW_TEXT)).toBeTruthy();
  });

  it('with enough non-empty rows there is no MinRowCountError', async () => {
    const { model, question } = createMatrixDynamic({
      isRequired: true,
      minRowCount: 2,
    });
    model.data = { mdyn: [{ c1: 'a' }, { c1: 'b' }] };
    const q = question as unknown as MatrixValidateLike;
    await renderMatrixInChrome(question);
    act(() => {
      q.hasErrors(true);
    });
    await flush();
    expect(screen.queryByText(MIN_ROW_TEXT)).toBeNull();
  });
});

// ————————————————————————————————————————————————————————————————
// Task 4.3 — matrixdynamic ROW reorder (allowRowsDragAndDrop)
//
// Row reorder is driven ENTIRELY through the core model
// (`moveRowByIndex` reorders `question.value`; the row MODELS stay put and
// values flow through positions, which is why the cell subscriptions
// reflect the new order without a full table reset). The drag-handle cell
// is core-gated: it exists only when `isRowsDragAndDrop`
// (`allowRowReorder`/`allowRowsDragAndDrop` && !readOnly && horizontal) and
// only on unlocked rows (`lockedRowCount`). Layer 1 (below, fully
// jest-tested) is the accessible move-up/move-down controls; the fine Pan
// drag (Layer 2, reusing ranking's `RankingDragRow`) is a device gate whose
// libs are absent in jest, so `RankingDragRow` degrades to Layer 1.
// ————————————————————————————————————————————————————————————————

const DRAG_HANDLE = /^matrix-drag-handle-/;
const MOVE_UP = /^matrix-move-row-up-/;
const MOVE_DOWN = /^matrix-move-row-down-/;

function inputValues(): unknown[] {
  return screen.getAllByTestId('c1-input').map((node) => node.props.value);
}

describe('matrixdynamic — row reorder (4.3): a11y move + gesture drag', () => {
  it('allowRowsDragAndDrop renders a drag handle with move-up/move-down controls per row', async () => {
    const { question } = createMatrixDynamic({ allowRowsDragAndDrop: true });
    await renderMatrixDynamic(question);
    expect(screen.getAllByTestId(DRAG_HANDLE)).toHaveLength(2);
    expect(screen.getAllByTestId(MOVE_UP)).toHaveLength(2);
    expect(screen.getAllByTestId(MOVE_DOWN)).toHaveLength(2);
  });

  it('allowRowsDragAndDrop:false (the default) renders NO drag handle', async () => {
    const { question } = createMatrixDynamic();
    await renderMatrixDynamic(question);
    expect(screen.queryAllByTestId(DRAG_HANDLE)).toHaveLength(0);
    expect(screen.queryAllByTestId(MOVE_UP)).toHaveLength(0);
    expect(screen.queryAllByTestId(MOVE_DOWN)).toHaveLength(0);
  });

  it('move-down on the first row reorders the value + re-renders inputs in the new order (through core moveRowByIndex)', async () => {
    const { model, question } = createMatrixDynamic({
      allowRowsDragAndDrop: true,
    });
    model.data = { mdyn: [{ c1: 'A' }, { c1: 'B' }] };
    await renderMatrixDynamic(question);
    expect(inputValues()).toEqual(['A', 'B']);
    fireEvent.press(screen.getAllByTestId(MOVE_DOWN)[0]!);
    await settle();
    expect(plainValue(question)).toEqual([{ c1: 'B' }, { c1: 'A' }]);
    expect(inputValues()).toEqual(['B', 'A']);
  });

  it('move-up on the last row reorders the value symmetrically', async () => {
    const { model, question } = createMatrixDynamic({
      allowRowsDragAndDrop: true,
    });
    model.data = { mdyn: [{ c1: 'A' }, { c1: 'B' }] };
    await renderMatrixDynamic(question);
    const ups = screen.getAllByTestId(MOVE_UP);
    fireEvent.press(ups[ups.length - 1]!);
    await settle();
    expect(plainValue(question)).toEqual([{ c1: 'B' }, { c1: 'A' }]);
    expect(inputValues()).toEqual(['B', 'A']);
  });

  it('boundary gate: first-row move-up and last-row move-down are disabled and do not reorder', async () => {
    const { model, question } = createMatrixDynamic({
      allowRowsDragAndDrop: true,
      rowCount: 3,
    });
    model.data = { mdyn: [{ c1: 'A' }, { c1: 'B' }, { c1: 'C' }] };
    await renderMatrixDynamic(question);
    const ups = screen.getAllByTestId(MOVE_UP);
    const downs = screen.getAllByTestId(MOVE_DOWN);
    expect(ups).toHaveLength(3);
    expect(downs).toHaveLength(3);
    // First row: up disabled, down enabled.
    expect(ups[0]!.props.accessibilityState?.disabled).toBe(true);
    expect(downs[0]!.props.accessibilityState?.disabled).toBe(false);
    // Last row: down disabled, up enabled.
    expect(downs[2]!.props.accessibilityState?.disabled).toBe(true);
    expect(ups[2]!.props.accessibilityState?.disabled).toBe(false);
    // Pressing the (guarded) disabled first-row up leaves the order intact.
    fireEvent.press(ups[0]!);
    await settle();
    expect(inputValues()).toEqual(['A', 'B', 'C']);
  });

  it('readOnly gate: a read-only matrix renders NO drag handle even with allowRowsDragAndDrop', async () => {
    const { question } = createMatrixDynamic({
      allowRowsDragAndDrop: true,
      readOnly: true,
    });
    await renderMatrixDynamic(question);
    expect(screen.queryAllByTestId(DRAG_HANDLE)).toHaveLength(0);
    expect(screen.queryAllByTestId(MOVE_UP)).toHaveLength(0);
  });

  it('lockedRowCount gate: a locked leading row gets no drag handle, and the sole unlocked row cannot move up into the locked band', async () => {
    const { model, question } = createMatrixDynamic({
      allowRowsDragAndDrop: true,
    });
    model.data = { mdyn: [{ c1: 'A' }, { c1: 'B' }] };
    (question as unknown as { lockedRowCount: number }).lockedRowCount = 1;
    await renderMatrixDynamic(question);
    // Only the single unlocked (second) row carries a handle.
    expect(screen.getAllByTestId(DRAG_HANDLE)).toHaveLength(1);
    // That sole unlocked row sits at the top of the UNLOCKED band; moving it
    // up would cross into the locked leading band, which core forbids
    // (canInsertIntoThisRow: no drop at/above a locked row).
    const ups = screen.getAllByTestId(MOVE_UP);
    expect(ups).toHaveLength(1);
    expect(ups[0]!.props.accessibilityState?.disabled).toBe(true);
    // Pressing the guarded control is a no-op: the value order is unchanged.
    fireEvent.press(ups[0]!);
    await settle();
    expect(inputValues()).toEqual(['A', 'B']);
  });
});
