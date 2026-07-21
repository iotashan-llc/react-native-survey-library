/**
 * `matrixdropdown` (static rows) — task M3 3.3a (design:
 * docs/design/M3-matrix-family-plan.md §2, §2a, §2b, §3a, §3d, §4, §8
 * phasing row 3.3a, §9 TDD notes). `MatrixTableBase` (OUTER stable-question
 * subscriber + reset token) + INNER `MatrixTable` (holds the CURRENT
 * `renderedTable` in state — the no-undefined-commit contract) walk
 * `renderedTable.renderedRows` into the merged 3.1a `MatrixGrid` primitive
 * with CHROME-LESS per-cell question dispatch (§2), inline `QuestionErrors`
 * (§2a), and the `showInMultipleColumns` per-choice cell path (§2b).
 *
 * Red-first: before 3.3a lands, `matrixdropdown` has no descriptor row, so
 * it dispatches to the non-throwing UnsupportedQuestion fallback
 * (invariant 9) — every assertion below is RED until MatrixTableBase +
 * MatrixDropdownQuestion + the descriptor flip ship.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type {
  Question,
  QuestionMatrixDropdownModelBase,
} from '../../core/facade';
import '../../factories/register-all';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import { UnsupportedQuestion } from '../../components/UnsupportedQuestion';
import { OverlayContext } from '../../overlay/OverlayContext';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';
import {
  MatrixDropdownQuestion,
  MatrixDropdownQuestionElement,
} from '../MatrixDropdownQuestion';
import { readRenderedTableNonCreating } from '../../components/matrix/MatrixTableBase';

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

interface MatrixFixture {
  model: InstanceType<typeof Model>;
  question: QuestionMatrixDropdownModelBase;
}

function createMatrixDropdown(
  extra: Record<string, unknown> = {}
): MatrixFixture {
  const model = new Model({
    elements: [
      {
        type: 'matrixdropdown',
        name: 'md',
        columns: [
          { name: 'c1', cellType: 'dropdown', choices: [1, 2, 3] },
          { name: 'c2', cellType: 'text' },
          {
            name: 'c3',
            cellType: 'checkbox',
            showInMultipleColumns: true,
            choices: ['x', 'y'],
          },
        ],
        rows: [
          { value: 'r1', text: 'Row One' },
          { value: 'r2', text: 'Row Two' },
        ],
        ...extra,
      },
    ],
  });
  return {
    model,
    question: model.getQuestionByName(
      'md'
    ) as unknown as QuestionMatrixDropdownModelBase,
  };
}

async function renderMatrixDropdown(
  question: QuestionMatrixDropdownModelBase,
  stack?: ReturnType<typeof createOverlayStack<OverlayPayload>>
): Promise<void> {
  const element = (
    <MatrixDropdownQuestionElement
      question={question as unknown as Question}
      creator={{}}
    />
  );
  render(
    stack ? (
      <OverlayContext.Provider value={stack}>{element}</OverlayContext.Provider>
    ) : (
      element
    )
  );
  // The INNER materializes renderedTable via the deferred (one-microtask)
  // ensure — never during render (§4 render purity).
  await flush();
  layoutGrid();
  await flush();
}

function plainValue(question: QuestionMatrixDropdownModelBase): unknown {
  return JSON.parse(JSON.stringify(question.value ?? null));
}

/** Detail-panel content renders through the real SurveyPanel/SurveyRow
 * composition, whose rows defer one frame until measured (1.3-design D3)
 * — fire a layout on every `sv-row` so nested questions materialize. */
function layoutRows(): void {
  act(() => {
    for (const row of screen.queryAllByTestId('sv-row')) {
      fireEvent(row, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 0 } },
      });
    }
  });
}

/** 3.3b fixture: two static rows + a text detail panel (§3c). */
function createDetailMatrix(
  extra: Record<string, unknown> = {}
): MatrixFixture {
  return createMatrixDropdown({
    detailPanelMode: 'underRow',
    detailElements: [{ type: 'text', name: 'd1', title: 'Detail One' }],
    columns: [{ name: 'c1', cellType: 'text' }],
    ...extra,
  });
}

/** Press a row's detail toggle, then settle panel rows (flush + layout). */
async function pressToggle(rowName: string): Promise<void> {
  fireEvent.press(screen.getByTestId(`matrix-detail-toggle-${rowName}`));
  await flush();
  layoutRows();
  await flush();
}

const DETAIL_BAND = /^matrix-detail-row:/;

describe('matrixdropdown — dispatch flip (unsupported → supported)', () => {
  it('registers a `matrixdropdown` template row so it no longer hits the fallback', () => {
    expect(RNQuestionFactory.getAllTypes()).toContain('matrixdropdown');
    const { question } = createMatrixDropdown();
    const element = RNQuestionFactory.createQuestion('matrixdropdown', {
      question,
      creator: {},
    });
    expect(element).not.toBeNull();
    expect(element!.type).toBe(MatrixDropdownQuestionElement);
    expect(element!.type).not.toBe(UnsupportedQuestion);
  });

  it('exports the class + element wrapper pair (family shape)', () => {
    expect(typeof MatrixDropdownQuestion).toBe('function');
    expect(typeof MatrixDropdownQuestionElement).toBe('function');
  });
});

describe('matrixdropdown — §11.3 non-creating renderedTable read (compat)', () => {
  it('returns undefined before creation and the live instance after', () => {
    const { question } = createMatrixDropdown();
    expect(readRenderedTableNonCreating(question)).toBeUndefined();
    const live = question.renderedTable;
    expect(readRenderedTableNonCreating(question)).toBe(live);
  });
});

describe('matrixdropdown — grid over renderedTable (columns × rows, real cell questions)', () => {
  it('renders the MatrixGrid primitive with column headers and row headers', async () => {
    const { question } = createMatrixDropdown();
    await renderMatrixDropdown(question);
    expect(screen.getByTestId('matrix-root')).toBeTruthy();
    expect(screen.getByTestId('matrix-content')).toBeTruthy();
    // Column headers (c3 explodes into its choice texts, §2b).
    expect(screen.getByText('c1')).toBeTruthy();
    expect(screen.getByText('c2')).toBeTruthy();
    expect(screen.getByText('x')).toBeTruthy();
    expect(screen.getByText('y')).toBeTruthy();
    // Row headers from row.locText.
    expect(screen.getByText('Row One')).toBeTruthy();
    expect(screen.getByText('Row Two')).toBeTruthy();
  });

  it('data rows are keyed off the STABLE source row.id (design §4 keying) and error rows are skipped', async () => {
    const { question } = createMatrixDropdown();
    await renderMatrixDropdown(question);
    const rows = screen.getAllByTestId(/^matrix-row-row:/);
    expect(rows).toHaveLength(2);
    // Core interleaves a QuestionMatrixDropdownRenderedErrorRow per data
    // row (§2a) — the walker must filter them out entirely.
    const renderedRowCount = question.renderedTable.renderedRows.length;
    expect(renderedRowCount).toBeGreaterThan(2);
  });

  it('text cells dispatch to the real TextQuestion renderer, chrome-less (no per-cell title)', async () => {
    const { question } = createMatrixDropdown();
    await renderMatrixDropdown(question);
    // One controlled TextInput per row for the c2 column.
    expect(screen.getAllByTestId('c2-input')).toHaveLength(2);
    // Chrome-less: the column header is the only place the title text
    // appears (one 'c2', not one per cell via QuestionChrome).
    expect(screen.getAllByText('c2')).toHaveLength(1);
  });
});

describe('matrixdropdown — dropdown cell opens the overlay sheet + commits (§2 OverlayContext flow)', () => {
  it('press opens a sheet into the overlay stack; selection commits to the {row:{col}} slot', async () => {
    const { question } = createMatrixDropdown();
    const stack = createOverlayStack<OverlayPayload>();
    await renderMatrixDropdown(question, stack);

    const controls = screen.getAllByTestId('sv-dropdown-control');
    expect(controls).toHaveLength(2);
    fireEvent.press(controls[0]!);
    expect(stack.entries()).toHaveLength(1);
    expect(stack.entries()[0]!.payload.shape).toBe('sheet');

    const cellQuestion = question.visibleRows[0]!.cells[0]!
      .question as unknown as {
      dropdownListModel: {
        listModel: {
          actions: Array<{ id: string; title: string }>;
          onItemClick(item: unknown): void;
        };
      };
    };
    const two = cellQuestion.dropdownListModel.listModel.actions.find(
      (a) => a.title === '2'
    )!;
    act(() => {
      cellQuestion.dropdownListModel.listModel.onItemClick(two);
    });
    expect(plainValue(question)).toEqual({ r1: { c1: 2 } });
  });
});

describe('matrixdropdown — text cell commits through the draft adapter (invariant 3)', () => {
  it('typing keeps a draft (no commit) until blur, then commits to the right {row}{col} slot', async () => {
    const { question } = createMatrixDropdown();
    await renderMatrixDropdown(question);
    const input = screen.getAllByTestId('c2-input')[0]!;
    fireEvent.changeText(input, 'draft-42');
    // Default textUpdateMode (onBlur): nothing committed yet.
    expect(plainValue(question)).toBeNull();
    fireEvent(input, 'blur');
    expect(plainValue(question)).toEqual({ r1: { c2: 'draft-42' } });
  });
});

describe('matrixdropdown — showInMultipleColumns choice cells (§2b case 4)', () => {
  it('explodes the checkbox column into ONE item per cell with a working per-cell toggle', async () => {
    const { question } = createMatrixDropdown();
    await renderMatrixDropdown(question);

    const xTile = screen.getByTestId('matrix-choice-r1-c3-0');
    const yTile = screen.getByTestId('matrix-choice-r1-c3-1');
    expect(xTile.props.accessibilityState.checked).toBe(false);

    fireEvent.press(xTile);
    await flush();
    expect(plainValue(question)).toEqual({ r1: { c3: ['x'] } });
    expect(
      screen.getByTestId('matrix-choice-r1-c3-0').props.accessibilityState
        .checked
    ).toBe(true);
    expect(
      screen.getByTestId('matrix-choice-r1-c3-1').props.accessibilityState
        .checked
    ).toBe(false);
    expect(yTile).toBeTruthy();

    // Checkbox two-arg toggle form: pressing again UNchecks (§2b —
    // clickItemHandler(item, !isItemSelected(item))).
    fireEvent.press(screen.getByTestId('matrix-choice-r1-c3-0'));
    await flush();
    expect(
      screen.getByTestId('matrix-choice-r1-c3-0').props.accessibilityState
        .checked
    ).toBe(false);
  });

  it('an exploded RADIOGROUP column uses the single-arg select-only form (no toggle-off)', async () => {
    const { question } = createMatrixDropdown({
      columns: [
        {
          name: 'c3',
          cellType: 'radiogroup',
          showInMultipleColumns: true,
          choices: ['x', 'y'],
        },
      ],
    });
    await renderMatrixDropdown(question);
    fireEvent.press(screen.getByTestId('matrix-choice-r1-c3-0'));
    await flush();
    expect(plainValue(question)).toEqual({ r1: { c3: 'x' } });
    // Radio select-only (§2b): pressing the selected item again does NOT
    // clear it — never a hand-rolled toggle.
    fireEvent.press(screen.getByTestId('matrix-choice-r1-c3-0'));
    await flush();
    expect(plainValue(question)).toEqual({ r1: { c3: 'x' } });
    expect(
      screen.getByTestId('matrix-choice-r1-c3-0').props.accessibilityState
        .checked
    ).toBe(true);
    // Selecting the sibling moves the single value (shared question).
    fireEvent.press(screen.getByTestId('matrix-choice-r1-c3-1'));
    await flush();
    expect(plainValue(question)).toEqual({ r1: { c3: 'y' } });
    expect(
      screen.getByTestId('matrix-choice-r1-c3-0').props.accessibilityState
        .checked
    ).toBe(false);
  });

  it('hides the duplicated item caption (column header carries it) and synthesizes the cell a11y label', async () => {
    const { question } = createMatrixDropdown();
    await renderMatrixDropdown(question);
    // 'x' appears ONLY in the exploded column header — not once per tile.
    expect(screen.getAllByText('x')).toHaveLength(1);
    const label = screen.getByTestId('matrix-choice-r1-c3-0').props
      .accessibilityLabel as string;
    expect(label).toContain('Row One');
  });
});

describe('matrixdropdown — inline cell errors via QuestionErrors (§2a)', () => {
  it('a required text cell renders its error inline under the cell — exactly once per cell (no double, no drop)', async () => {
    const { model, question } = createMatrixDropdown({
      columns: [
        { name: 'c1', cellType: 'dropdown', choices: [1, 2, 3] },
        { name: 'c2', cellType: 'text', isRequired: true },
      ],
    });
    await renderMatrixDropdown(question);
    expect(screen.queryAllByTestId('c2-errors-below')).toHaveLength(0);
    act(() => {
      model.currentPage!.hasErrors(true);
    });
    // One inline error per row's c2 cell — the walker skipped core's
    // isErrorsRow rows / isErrorsCell cells, and QuestionErrors rendered
    // once under each failing cell body.
    expect(screen.getAllByTestId('c2-errors-below')).toHaveLength(2);
  });

  it('an exploded choice group renders its shared error exactly once, at isFirstChoice (§2a)', async () => {
    const { model, question } = createMatrixDropdown({
      columns: [
        {
          name: 'c3',
          cellType: 'checkbox',
          showInMultipleColumns: true,
          choices: ['x', 'y'],
          isRequired: true,
        },
      ],
    });
    await renderMatrixDropdown(question);
    act(() => {
      model.currentPage!.hasErrors(true);
    });
    // 2 rows × ONE shared-group error each — never one per choice cell.
    expect(screen.getAllByTestId('c3-errors-below')).toHaveLength(2);
  });
});

describe('matrixdropdown — §4 renderedTable reset contract (stable-identity retarget, no-undefined-commit)', () => {
  it('a reset (column isRequired flip) swaps to the new table without losing an active onBlur draft', async () => {
    const { question } = createMatrixDropdown();
    await renderMatrixDropdown(question);
    const tableBefore = question.renderedTable;

    const input = screen.getAllByTestId('c2-input')[0]!;
    fireEvent.changeText(input, 'live-draft');

    act(() => {
      // Fires core's onRenderedTableResetCallback (verified against
      // v2.5.33: question_matrixdropdownbase.ts:1404-1406) — the old
      // renderedTable is DESTROYED and lazily rebuilt.
      (question.columns[0] as unknown as { isRequired: boolean }).isRequired =
        true;
    });
    await flush();
    layoutGrid();
    await flush();

    // The INNER swapped to a genuinely NEW renderedTable...
    expect(question.renderedTable).not.toBe(tableBefore);
    // ...the new table's state renders (c1's header required mark)...
    expect(screen.getByText(/\*/)).toBeTruthy();
    // ...and the text leaf was NOT remounted (immutable
    // cell.question.uniqueId key): the uncommitted draft survives.
    expect(screen.getAllByTestId('c2-input')[0]!.props.value).toBe(
      'live-draft'
    );
    expect(plainValue(question)).toBeNull();

    fireEvent(screen.getAllByTestId('c2-input')[0]!, 'blur');
    expect(plainValue(question)).toEqual({ r1: { c2: 'live-draft' } });
  });

  it('an in-place renderedRows mutation re-renders WITHOUT firing the reset callback (no remount, draft kept)', async () => {
    const { question } = createMatrixDropdown();
    await renderMatrixDropdown(question);
    const table = question.renderedTable;

    fireEvent.changeText(screen.getAllByTestId('c2-input')[0]!, 'kept-draft');
    expect(screen.getAllByTestId(/^matrix-row-row:/)).toHaveLength(2);

    act(() => {
      // Splice the LAST data row out of the live @propertyArray — the
      // non-reset path web relies on (§4 "TDD must confirm the non-reset
      // mutation path").
      const rows = table.rows;
      let lastDataIndex = -1;
      for (let i = 0; i < rows.length; i += 1) {
        if (!rows[i]!.isErrorsRow) lastDataIndex = i;
      }
      rows.splice(lastDataIndex, 1);
    });

    // Re-rendered from the array notification alone: one data row left,
    // renderedTable identity unchanged (no reset), r1's draft intact.
    expect(screen.getAllByTestId(/^matrix-row-row:/)).toHaveLength(1);
    expect(question.renderedTable).toBe(table);
    expect(screen.getAllByTestId('c2-input')[0]!.props.value).toBe(
      'kept-draft'
    );
  });
});

describe('matrixdropdown — readOnly rows render display-mode cells', () => {
  it('readOnly matrix: text cells render display-mode (not editable), choice taps are inert', async () => {
    const { question } = createMatrixDropdown({ readOnly: true });
    await renderMatrixDropdown(question);
    // isRowEnabled false -> every cell question isInputReadOnly -> the
    // dispatched TextQuestion renders its display mode (editable=false;
    // settings.readOnly.textRenderMode default keeps the input shape).
    const inputs = screen.getAllByTestId('c2-input');
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input.props.editable).toBe(false);
    }
    fireEvent.press(screen.getByTestId('matrix-choice-r1-c3-0'));
    await flush();
    expect(plainValue(question)).toBeNull();
  });
});

describe('matrixdropdown — totals footer (§3d)', () => {
  it('renders per-column totals as read-only expression cells aligned in the footer band', async () => {
    const { question } = createMatrixDropdown({
      columns: [
        { name: 'c1', cellType: 'text' },
        { name: 'c2', cellType: 'text', totalType: 'sum' },
      ],
      totalText: 'Totals',
    });
    question.value = { r1: { c2: 3 }, r2: { c2: 4 } };
    await renderMatrixDropdown(question);
    expect(screen.getByTestId('matrix-row-footer')).toBeTruthy();
    expect(screen.getByText('Totals')).toBeTruthy();
    expect(screen.getByTestId('sv-expression-c2')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });
});

describe('matrixdropdown — transposed (vertical) layout renders faithfully + deduped diagnostic (§3b.5)', () => {
  it('walks the vertical renderedRows as a plain grid and reports the layout diagnostic once', async () => {
    const captured: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => captured.push(payload));
    try {
      const { question } = createMatrixDropdown({
        transposeData: true,
        columns: [
          { name: 'c1', cellType: 'text' },
          { name: 'c2', cellType: 'text' },
        ],
      });
      await renderMatrixDropdown(question);
      expect(
        (question as unknown as { isColumnLayoutHorizontal: boolean })
          .isColumnLayoutHorizontal
      ).toBe(false);
      // Vertical shape: columns become rows — each vertical row leads
      // with the COLUMN title; the header band carries the ROW titles.
      expect(screen.getByText('c1')).toBeTruthy();
      expect(screen.getByText('c2')).toBeTruthy();
      expect(screen.getByText('Row One')).toBeTruthy();
      expect(screen.getByText('Row Two')).toBeTruthy();
      // Cells are real questions: 2 columns × 2 rows of text inputs.
      expect(
        screen.getAllByTestId('c1-input').length +
          screen.getAllByTestId('c2-input').length
      ).toBe(4);

      const layoutDiagnostics = captured.filter(
        (p) =>
          p.code === 'layout-diagnostic' &&
          (p as { layoutCode?: string }).layoutCode === 'matrix-vertical-layout'
      );
      expect(layoutDiagnostics).toHaveLength(1);

      // Deduped: a later re-render does not re-emit.
      act(() => {
        question.value = { r1: { c1: 'v' } };
      });
      await flush();
      expect(
        captured.filter(
          (p) =>
            p.code === 'layout-diagnostic' &&
            (p as { layoutCode?: string }).layoutCode ===
              'matrix-vertical-layout'
        )
      ).toHaveLength(1);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });
});

describe('matrixdropdown — per-row cell-question visibility (column visibleIf)', () => {
  it('an invisible cell question renders NO input, and visibility flips are reactive per row', async () => {
    const { question } = createMatrixDropdown({
      columns: [
        { name: 'c1', cellType: 'text' },
        { name: 'c2', cellType: 'text', visibleIf: "{row.c1} = 'go'" },
      ],
    });
    await renderMatrixDropdown(question);
    // The c2 cell question is invisible in BOTH rows (driver empty): the
    // wide path must render an EMPTY cell body — no live input. (Core's
    // rendered-cell `isVisible` is mobile-only —
    // question_matrixdropdownrendered.ts:110-111 — the per-row state is
    // `cell.question.isVisible`, which web gates the cell body on.)
    expect(screen.getAllByTestId('c1-input')).toHaveLength(2);
    expect(screen.queryAllByTestId('c2-input')).toHaveLength(0);

    // Flip the driver in row 1 only → exactly that row's c2 appears.
    act(() => {
      question.visibleRows[0]!.cells[0]!.question.value = 'go';
    });
    await flush();
    expect(screen.getAllByTestId('c2-input')).toHaveLength(1);

    // Flip back → it disappears again (reactive both directions).
    act(() => {
      question.visibleRows[0]!.cells[0]!.question.value = 'stop';
    });
    await flush();
    expect(screen.queryAllByTestId('c2-input')).toHaveLength(0);
  });
});

describe('matrixdropdown — exploded totals footer keys (§4 sibling-unique)', () => {
  it('showInMultipleColumns column + totals footer renders with NO duplicate React keys', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { question } = createMatrixDropdown({
        columns: [
          { name: 'c1', cellType: 'text', totalType: 'sum' },
          {
            name: 'c3',
            cellType: 'checkbox',
            showInMultipleColumns: true,
            choices: ['x', 'y', 'z'],
          },
        ],
      });
      await renderMatrixDropdown(question);
      expect(screen.getByTestId('matrix-row-footer')).toBeTruthy();
      // Core's createMutlipleColumnsFooter emits one footer cell PER
      // CHOICE all sharing ONE total question (no item ⇒ not a choice
      // cell) — bare q:<uniqueId> keys would collide among siblings.
      const duplicateKeyErrors = errorSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === 'string' && arg.includes('same key'))
      );
      expect(duplicateKeyErrors).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('matrixdropdown — transposed end-actions row (§4 keying + invariant 9)', () => {
  it('keys the vertical end-actions row semantically (vrow:actions-end), never by array index', async () => {
    const { model, question } = createMatrixDropdown({
      transposeData: true,
      columns: [{ name: 'c1', cellType: 'text' }],
    });
    model.onGetMatrixRowActions.add((_, options) => {
      options.actions.push({ id: 'act', title: 'Act', location: 'end' });
    });
    await renderMatrixDropdown(question);
    expect(screen.getByTestId('matrix-row-vrow:actions-end')).toBeTruthy();
  });

  it('tolerates NULL action cells (only SOME rows have end actions) with a deduped diagnostic', async () => {
    const captured: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => captured.push(payload));
    try {
      const { model, question } = createMatrixDropdown({
        transposeData: true,
        columns: [{ name: 'c1', cellType: 'text' }],
      });
      model.onGetMatrixRowActions.add((_, options) => {
        // Only r1 gets an end action → core's createEndVerticalActionRow
        // pushes getRowActionsCell(i,'end') UNGUARDED, which returns null
        // for r2 (question_matrixdropdownrendered.ts:1036-1049, 714-734).
        const rowName = (options.row as unknown as { rowName?: string })
          .rowName;
        if (rowName === 'r1') {
          options.actions.push({ id: 'act', title: 'Act', location: 'end' });
        }
      });
      await renderMatrixDropdown(question);
      // The walker must skip the null cell defensively — never throw
      // (invariant 9): the grid still renders every real cell question.
      expect(screen.getAllByTestId('c1-input')).toHaveLength(2);
      expect(screen.getByTestId('matrix-row-vrow:actions-end')).toBeTruthy();
      expect(
        captured.filter((p) => (p.code as string) === 'matrix-null-cell')
      ).toHaveLength(1);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });
});

describe('matrixdropdown — unsupported cellType degrades per cell (invariant 9)', () => {
  it('a `file` column renders the non-throwing fallback in each cell; the rest of the matrix still works', async () => {
    const { question } = createMatrixDropdown({
      columns: [
        { name: 'c1', cellType: 'text' },
        { name: 'cf', cellType: 'file' },
      ],
    });
    await renderMatrixDropdown(question);
    expect(screen.getAllByTestId('unsupported-question-panel')).toHaveLength(2);
    expect(screen.getAllByTestId('c1-input')).toHaveLength(2);
  });
});

describe('matrixdropdown — Other choice cell renders the controlled Other-comment adapter (§2b case 3)', () => {
  it('the Other cell is an input (not an item tile) writing through otherValue', async () => {
    const { question } = createMatrixDropdown({
      columns: [
        {
          name: 'c3',
          cellType: 'checkbox',
          showInMultipleColumns: true,
          choices: ['x'],
          showOtherItem: true,
        },
      ],
    });
    await renderMatrixDropdown(question);
    const other = screen.getByTestId('matrix-other-r1-c3');
    fireEvent.changeText(other, 'free text');
    fireEvent(other, 'blur');
    const cellQuestion = question.visibleRows[0]!.cells[0]!
      .question as unknown as { otherValue?: string };
    expect(cellQuestion.otherValue).toBe('free text');
  });
});

describe('matrixdropdown — detail panels (3.3b §3c): toggle cells expand a full-width SurveyPanel band', () => {
  it('renders a REAL detail-toggle button per row; press expands the panel with FULL question chrome', async () => {
    const { question } = createDetailMatrix();
    await renderMatrixDropdown(question);

    // One toggle per data row, collapsed a11y state, core-localized label.
    const toggles = [
      screen.getByTestId('matrix-detail-toggle-r1'),
      screen.getByTestId('matrix-detail-toggle-r2'),
    ];
    for (const toggle of toggles) {
      expect(toggle.props.accessibilityRole).toBe('button');
      expect(toggle.props.accessibilityState.expanded).toBe(false);
      expect(toggle.props.accessibilityLabel).toBe('Show Details');
    }
    expect(screen.queryAllByTestId(DETAIL_BAND)).toHaveLength(0);

    await pressToggle('r1');

    // The detail band renders (full-width row keyed `row:<id>:detail`)...
    expect(screen.getAllByTestId(DETAIL_BAND)).toHaveLength(1);
    // ...containing the row's REAL detail PanelModel through SurveyPanel,
    // with FULL chrome INSIDE the panel (§3c: the chrome-less rule applies
    // to CELLS, not detail content): the d1 title renders.
    expect(screen.getByText('Detail One')).toBeTruthy();
    expect(screen.getByTestId('d1-input')).toBeTruthy();
    // Toggle flips to expanded.
    const expandedToggle = screen.getByTestId('matrix-detail-toggle-r1');
    expect(expandedToggle.props.accessibilityState.expanded).toBe(true);
    expect(expandedToggle.props.accessibilityLabel).toBe('Hide Details');
  });

  it('detail toggle carries hitSlop bridging its icon-sized box to a ≥44dp effective target', async () => {
    const { question } = createDetailMatrix();
    await renderMatrixDropdown(question);

    // Worst-case content box is the 16dp glyph wide x 32dp minHeight tall;
    // slop bridges both axes to >=44 (16+14+14 / 32+6+6). The toggle is the
    // only interactive element in its column, so the slop cannot collide
    // with a neighboring target.
    const toggle = screen.getByTestId('matrix-detail-toggle-r1');
    expect(toggle.props.hitSlop).toEqual({
      top: 6,
      bottom: 6,
      left: 14,
      right: 14,
    });
  });

  it('detail-panel questions commit through the normal draft adapters into the row value slot', async () => {
    const { question } = createDetailMatrix();
    await renderMatrixDropdown(question);
    await pressToggle('r1');

    const input = screen.getByTestId('d1-input');
    fireEvent.changeText(input, 'detail-draft');
    // onBlur mode: no commit until blur.
    expect(plainValue(question)).toBeNull();
    fireEvent(input, 'blur');
    expect(plainValue(question)).toEqual({ r1: { d1: 'detail-draft' } });
  });

  it('pressing the expanded toggle collapses: the band unmounts and a11y state returns to collapsed', async () => {
    const { question } = createDetailMatrix();
    await renderMatrixDropdown(question);
    await pressToggle('r1');
    expect(screen.getAllByTestId(DETAIL_BAND)).toHaveLength(1);

    await pressToggle('r1');
    expect(screen.queryAllByTestId(DETAIL_BAND)).toHaveLength(0);
    expect(
      screen.getByTestId('matrix-detail-toggle-r1').props.accessibilityState
        .expanded
    ).toBe(false);
    expect(screen.queryByTestId('d1-input')).toBeNull();
  });

  it('underRowSingle: expanding one row collapses the other (core-enforced; render follows)', async () => {
    const { question } = createDetailMatrix({
      detailPanelMode: 'underRowSingle',
    });
    await renderMatrixDropdown(question);

    await pressToggle('r1');
    expect(screen.getAllByTestId(DETAIL_BAND)).toHaveLength(1);
    expect(
      screen.getByTestId('matrix-detail-toggle-r1').props.accessibilityState
        .expanded
    ).toBe(true);

    await pressToggle('r2');
    // Exactly ONE band remains — r2's; r1 collapsed.
    expect(screen.getAllByTestId(DETAIL_BAND)).toHaveLength(1);
    expect(
      screen.getByTestId('matrix-detail-toggle-r1').props.accessibilityState
        .expanded
    ).toBe(false);
    expect(
      screen.getByTestId('matrix-detail-toggle-r2').props.accessibilityState
        .expanded
    ).toBe(true);
  });

  it('values entered in the detail panel persist across collapse/expand (model-backed panel survives)', async () => {
    const { question } = createDetailMatrix();
    await renderMatrixDropdown(question);
    await pressToggle('r1');

    const input = screen.getByTestId('d1-input');
    fireEvent.changeText(input, 'kept-value');
    fireEvent(input, 'blur');
    expect(plainValue(question)).toEqual({ r1: { d1: 'kept-value' } });

    await pressToggle('r1');
    expect(screen.queryByTestId('d1-input')).toBeNull();
    // Collapse does NOT destroy the value (hideDetailPanel keeps the
    // panel instance; the committed value lives in the question model).
    expect(plainValue(question)).toEqual({ r1: { d1: 'kept-value' } });

    await pressToggle('r1');
    expect(screen.getByTestId('d1-input').props.value).toBe('kept-value');
  });
});

/** Flip the whole survey (and its questions) into mobile mode — the survey
 * `isMobile` flag flip that drives the §3b stacked-card path (core rebuilds
 * `renderedTable` on `onMobileChanged`). */
function setMobile(model: InstanceType<typeof Model>, value = true): void {
  (model as unknown as { setIsMobile(v: boolean): void }).setIsMobile(value);
}

const CARD_BAND = /^matrix-card-row:/;
const CARD_DETAIL_BAND = /^matrix-card-detail-row:/;

describe('matrixdropdown — mobile stacked-card layout (§3b, 3.1b)', () => {
  it('renders each row as a CARD (not the wide scroll grid) with the row text as the card title', async () => {
    const { model, question } = createMatrixDropdown();
    setMobile(model);
    await renderMatrixDropdown(question);
    // Card stack, NOT the wide horizontal ScrollView.
    expect(screen.getByTestId('matrix-cards')).toBeTruthy();
    expect(screen.queryByTestId('matrix-scroll')).toBeNull();
    // One card per data row; the row text is the card title.
    expect(screen.getAllByTestId(CARD_BAND)).toHaveLength(2);
    expect(screen.getAllByTestId(/^matrix-card-title-row:/)).toHaveLength(2);
    expect(screen.getByText('Row One')).toBeTruthy();
    expect(screen.getByText('Row Two')).toBeTruthy();
  });

  it('lays each cell out as a {column-label, cellContent} pair reusing the SAME chrome-less cell dispatch', async () => {
    const { model, question } = createMatrixDropdown();
    setMobile(model);
    await renderMatrixDropdown(question);
    // Column labels come from the cell's responsive column title — one per
    // card (2 rows), for the dropdown (c1) and text (c2) columns. In card
    // mode there is NO header band, so these texts are the card labels only.
    expect(screen.getAllByText('c1')).toHaveLength(2);
    expect(screen.getAllByText('c2')).toHaveLength(2);
    // The reused cell renderers still dispatch: the text cell's input and
    // the dropdown cell's control render inside their card value slots.
    expect(screen.getAllByTestId('c2-input')).toHaveLength(2);
    // Labels sit in the labelled-pair containers.
    expect(screen.getAllByTestId(/^matrix-card-label-/).length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByTestId(/^matrix-card-cell-/).length).toBeGreaterThan(
      0
    );
  });

  it('renders the totals as a summary CARD on mobile (§3d — showFooter is TRUE on mobile)', async () => {
    const { model, question } = createMatrixDropdown({
      columns: [
        { name: 'c1', cellType: 'text' },
        { name: 'c2', cellType: 'text', totalType: 'sum' },
      ],
      totalText: 'Totals',
    });
    question.value = { r1: { c2: 3 }, r2: { c2: 4 } };
    setMobile(model);
    await renderMatrixDropdown(question);
    // The totals summary card (NOT the wide footer band).
    expect(screen.getByTestId('matrix-totals-card')).toBeTruthy();
    expect(screen.queryByTestId('matrix-row-footer')).toBeNull();
    // Its total value + label render inside.
    const totals = screen.getByTestId('matrix-totals-card');
    expect(within(totals).getByText('7')).toBeTruthy();
    expect(within(totals).getByText('Totals')).toBeTruthy();
  });

  it('detail toggle works in card mode — the panel stacks as a full-width block below the card', async () => {
    const { model, question } = createDetailMatrix();
    setMobile(model);
    await renderMatrixDropdown(question);
    // The toggle lives in the card actions foot; no detail band yet.
    expect(screen.getByTestId('matrix-detail-toggle-r1')).toBeTruthy();
    expect(screen.queryAllByTestId(CARD_DETAIL_BAND)).toHaveLength(0);
    await pressToggle('r1');
    // The detail panel renders as a card-mode full-width block with the
    // real SurveyPanel content inside.
    expect(screen.getAllByTestId(CARD_DETAIL_BAND)).toHaveLength(1);
    expect(screen.getByText('Detail One')).toBeTruthy();
    expect(screen.getByTestId('d1-input')).toBeTruthy();
  });

  it('a runtime mobile flip re-renders grid → cards and back', async () => {
    const { model, question } = createMatrixDropdown();
    await renderMatrixDropdown(question);
    // Starts wide.
    expect(screen.getByTestId('matrix-scroll')).toBeTruthy();
    expect(screen.queryByTestId('matrix-cards')).toBeNull();
    // Flip to mobile: the reset rebuilds the table; the deferred ensure
    // picks it up; the grid becomes cards.
    act(() => setMobile(model, true));
    await flush();
    expect(screen.getByTestId('matrix-cards')).toBeTruthy();
    expect(screen.queryByTestId('matrix-scroll')).toBeNull();
    // Flip back to wide: cards become the scroll grid again.
    act(() => setMobile(model, false));
    await flush();
    layoutGrid();
    await flush();
    expect(screen.getByTestId('matrix-scroll')).toBeTruthy();
    expect(screen.queryByTestId('matrix-cards')).toBeNull();
  });
});
