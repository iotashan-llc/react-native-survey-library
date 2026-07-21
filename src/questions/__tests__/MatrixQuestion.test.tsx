/**
 * `matrix` (simple / single-select + checkbox) question — task M3 3.2
 * (design: docs/design/M3-matrix-family-plan.md §3.2, §3b, §8 phasing row
 * 3.2, §9 TDD notes). Radio/checkbox item TILES over the 3.1a `MatrixGrid`
 * primitive, driven by `QuestionMatrixModel`'s `visibleRows`/
 * `visibleColumns` + `row.cellClick`/`row.isChecked` — NO nested questions,
 * NO renderedTable.
 *
 * Red-first: before 3.2 lands, `matrix` has no descriptor row, so it
 * dispatches to the non-throwing UnsupportedQuestion fallback (invariant 9)
 * — every assertion below is RED until MatrixQuestion + the descriptor
 * flip ship.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { Model } from '../../core/facade';
import type { QuestionMatrixModel, MatrixRowModel } from '../../core/facade';
import '../../factories/register-all';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import { UnsupportedQuestion } from '../../components/UnsupportedQuestion';
import { MatrixQuestion, MatrixQuestionElement } from '../MatrixQuestion';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** MatrixGridRoot defers its grid one frame until the OUTER pre-scroll root
 * View measures a width>0 (§3a.2 measurement contract) — fire a layout on
 * every `matrix-root` so the wide grid + its tiles actually render. */
function layoutGrid(): void {
  act(() => {
    for (const root of screen.queryAllByTestId('matrix-root')) {
      fireEvent(root, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 0 } },
      });
    }
  });
}

function createMatrix(extra: Record<string, unknown> = {}): {
  model: InstanceType<typeof Model>;
  question: QuestionMatrixModel;
} {
  const model = new Model({
    elements: [
      {
        type: 'matrix',
        name: 'm',
        columns: ['col1', 'col2', 'col3'],
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
    question: model.getQuestionByName('m') as QuestionMatrixModel,
  };
}

function renderMatrix(question: QuestionMatrixModel): void {
  render(<MatrixQuestionElement question={question} creator={{}} />);
  layoutGrid();
}

/** Flattened style of a tile's decorator View (the first descendant View
 * inside the tile Pressable — the radio/checkbox decorator the shared item
 * recipe styles). Used to observe checked/readOnly/preview/error tint. */
function decoratorStyle(tileTestID: string): Record<string, unknown> {
  const tile = screen.getByTestId(tileTestID);
  const views = within(tile).UNSAFE_getAllByType(View);
  return StyleSheet.flatten(
    views[0]!.props.style as never
  ) as unknown as Record<string, unknown>;
}

describe('matrix (simple) — dispatch flip (unsupported → supported)', () => {
  it('registers a `matrix` template row so it no longer hits the fallback', () => {
    expect(RNQuestionFactory.getAllTypes()).toContain('matrix');
    const { question } = createMatrix();
    const element = RNQuestionFactory.createQuestion('matrix', {
      question,
      creator: {},
    });
    expect(element).not.toBeNull();
    expect(element!.type).toBe(MatrixQuestionElement);
    expect(element!.type).not.toBe(UnsupportedQuestion);
  });
});

describe('matrix (simple) — grid + tiles', () => {
  it('renders the 3.1a MatrixGrid primitive (MatrixGridRoot) — not a bespoke table', () => {
    const { question } = createMatrix();
    renderMatrix(question);
    expect(screen.getByTestId('matrix-root')).toBeTruthy();
    expect(screen.getByTestId('matrix-content')).toBeTruthy();
  });

  it('walks visibleRows × visibleColumns into one tile per cell', () => {
    const { question } = createMatrix();
    renderMatrix(question);
    // 2 rows × 3 columns = 6 tiles.
    expect(screen.getAllByTestId(/^matrix-tile-/)).toHaveLength(6);
    // Column headers come from column.text; row headers from row.text.
    expect(screen.getByText('col1')).toBeTruthy();
    expect(screen.getByText('Row One')).toBeTruthy();
    expect(screen.getByText('Row Two')).toBeTruthy();
  });

  it('renders a leading row-header column only when the matrix hasRows', () => {
    const { question } = createMatrix();
    renderMatrix(question);
    expect(screen.getByTestId('matrix-tile-r1-col1')).toBeTruthy();
    expect(screen.getByTestId('matrix-rowheader-r1')).toBeTruthy();
  });
});

describe('matrix (simple) — single-select (radio) value flow', () => {
  it('a tile tap sets row.value + the {row:col} question value and reflects checked', async () => {
    const { question } = createMatrix();
    renderMatrix(question);
    const tile = screen.getByTestId('matrix-tile-r1-col2');
    expect(tile.props.accessibilityState.checked).toBe(false);

    fireEvent.press(tile);
    await flush();

    const row = question.visibleRows[0] as MatrixRowModel;
    expect(row.value).toBe('col2');
    expect(question.value).toEqual({ r1: 'col2' });
    expect(
      screen.getByTestId('matrix-tile-r1-col2').props.accessibilityState.checked
    ).toBe(true);
    // Radio single-select: a different tile in the same row is not checked.
    expect(
      screen.getByTestId('matrix-tile-r1-col1').props.accessibilityState.checked
    ).toBe(false);
  });

  it('re-tapping another column moves the single selection', async () => {
    const { question } = createMatrix();
    renderMatrix(question);
    fireEvent.press(screen.getByTestId('matrix-tile-r2-col1'));
    await flush();
    fireEvent.press(screen.getByTestId('matrix-tile-r2-col3'));
    await flush();
    expect(question.value).toEqual({ r2: 'col3' });
    expect(
      screen.getByTestId('matrix-tile-r2-col1').props.accessibilityState.checked
    ).toBe(false);
    expect(
      screen.getByTestId('matrix-tile-r2-col3').props.accessibilityState.checked
    ).toBe(true);
  });
});

describe('matrix (simple) — multi-select (cellType checkbox)', () => {
  it('toggles an array of column values and untoggles', async () => {
    const { question } = createMatrix({ cellType: 'checkbox' });
    renderMatrix(question);
    expect(question.isMultiSelect).toBe(true);

    fireEvent.press(screen.getByTestId('matrix-tile-r1-col1'));
    await flush();
    fireEvent.press(screen.getByTestId('matrix-tile-r1-col3'));
    await flush();
    expect((question.visibleRows[0] as MatrixRowModel).value).toEqual([
      'col1',
      'col3',
    ]);

    // Untoggle col1.
    fireEvent.press(screen.getByTestId('matrix-tile-r1-col1'));
    await flush();
    expect((question.visibleRows[0] as MatrixRowModel).value).toEqual(['col3']);
    expect(
      screen.getByTestId('matrix-tile-r1-col1').props.accessibilityState.checked
    ).toBe(false);
    expect(
      screen.getByTestId('matrix-tile-r1-col3').props.accessibilityState.checked
    ).toBe(true);
  });

  it('an isExclusive column clears the other checked columns in its row', async () => {
    const { question } = createMatrix({
      cellType: 'checkbox',
      columns: [
        { value: 'col1' },
        { value: 'col2' },
        { value: 'none', isExclusive: true },
      ],
    });
    renderMatrix(question);
    fireEvent.press(screen.getByTestId('matrix-tile-r1-col1'));
    await flush();
    fireEvent.press(screen.getByTestId('matrix-tile-r1-col2'));
    await flush();
    expect((question.visibleRows[0] as MatrixRowModel).value).toEqual([
      'col1',
      'col2',
    ]);
    // Tapping the exclusive option collapses the row to just that value.
    fireEvent.press(screen.getByTestId('matrix-tile-r1-none'));
    await flush();
    expect((question.visibleRows[0] as MatrixRowModel).value).toEqual(['none']);
  });
});

describe('matrix (simple) — eachRowRequired validation', () => {
  it('marks an empty row with an error on validation; the answered row has none', async () => {
    const { question } = createMatrix({ eachRowRequired: true });
    renderMatrix(question);
    // Answer only r1.
    fireEvent.press(screen.getByTestId('matrix-tile-r1-col1'));
    await flush();

    act(() => {
      question.hasErrors();
    });
    await flush();

    expect(question.hasErrors()).toBe(true);
    const [r1, r2] = question.visibleRows as MatrixRowModel[];
    expect(r1!.hasError).toBe(false);
    expect(r2!.hasError).toBe(true);
    // The row-header of the empty row surfaces the error marker; the
    // answered row does not.
    expect(screen.getByTestId('matrix-rowheader-error-r2')).toBeTruthy();
    expect(screen.queryByTestId('matrix-rowheader-error-r1')).toBeNull();
  });
});

describe('matrix (simple) — hasCellText (rubric cells)', () => {
  it('renders tappable rubric text cells and selection still commits row.value', async () => {
    const { question } = createMatrix({
      cells: { r1: { col1: 'Strongly agree', col2: 'Agree' } },
    });
    renderMatrix(question);
    expect(question.hasCellText).toBe(true);
    // The rubric text renders inside the cell.
    expect(screen.getByText('Strongly agree')).toBeTruthy();
    fireEvent.press(screen.getByTestId('matrix-tile-r1-col1'));
    await flush();
    expect(question.value).toEqual({ r1: 'col1' });
  });
});

describe('matrix (simple) — a11y', () => {
  it('tiles carry the radio role + the combined row/column aria label', () => {
    const { question } = createMatrix();
    renderMatrix(question);
    const tile = screen.getByTestId('matrix-tile-r1-col2');
    expect(tile.props.accessibilityRole).toBe('radio');
    const row = question.visibleRows[0] as MatrixRowModel;
    const column = question.visibleColumns[1];
    expect(tile.props.accessibilityLabel).toBe(
      question.getCellAriaLabel(row, column)
    );
    expect(tile.props.accessibilityLabel).toContain('Row One');
  });

  it('tiles carry the checkbox role in multi-select mode', () => {
    const { question } = createMatrix({ cellType: 'checkbox' });
    renderMatrix(question);
    expect(
      screen.getByTestId('matrix-tile-r1-col1').props.accessibilityRole
    ).toBe('checkbox');
  });
});

describe('matrix (simple) — reactivity (visibleRowsChangedCallback)', () => {
  it('re-renders the grid when the visible rows change', async () => {
    const { question } = createMatrix();
    renderMatrix(question);
    expect(screen.getAllByTestId(/^matrix-tile-/)).toHaveLength(6);
    // Adding a row fires onRowsChanged → visibleRowsChangedCallback.
    act(() => {
      question.rows = [
        { value: 'r1', text: 'Row One' },
        { value: 'r2', text: 'Row Two' },
        { value: 'r3', text: 'Row Three' },
      ] as never;
    });
    await flush();
    layoutGrid();
    expect(screen.getAllByTestId(/^matrix-tile-/)).toHaveLength(9);
    expect(screen.getByTestId('matrix-tile-r3-col1')).toBeTruthy();
  });
});

describe('matrix (simple) — row enableIf reactivity (row.item subscription)', () => {
  it('re-renders tiles enabled/disabled when a row enableIf flips via another question', async () => {
    // Core's enabled flip notifies the row's ITEM, not the MatrixRowModel:
    // runConditionCore → ItemValue.runEnabledConditionsForItems →
    // item.setIsEnabled → setPropertyValue on the ItemValue
    // (question_matrix.ts runConditionCore; itemvalue.ts:437-439). Web
    // subscribes row.item (reactquestion_matrix.tsx getStateElement); the
    // RN cells must subscribe [row, row.item] to see the flip.
    const model = new Model({
      elements: [
        { type: 'text', name: 'gate' },
        {
          type: 'matrix',
          name: 'm',
          columns: ['col1', 'col2'],
          rows: [
            { value: 'r1', text: 'Row One', enableIf: '{gate} = 1' },
            { value: 'r2', text: 'Row Two' },
          ],
        },
      ],
    });
    const question = model.getQuestionByName('m') as QuestionMatrixModel;
    renderMatrix(question);
    expect(
      screen.getByTestId('matrix-tile-r1-col1').props.accessibilityState
        .disabled
    ).toBe(true);
    expect(
      screen.getByTestId('matrix-tile-r2-col1').props.accessibilityState
        .disabled
    ).toBe(false);

    act(() => {
      model.setValue('gate', 1);
    });
    await flush();

    // The enabled flip must re-render the row's tiles (a11y state AND
    // pressability restored).
    const tile = screen.getByTestId('matrix-tile-r1-col1');
    expect(tile.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(tile);
    await flush();
    expect(question.value).toEqual({ r1: 'col1' });

    // And the reverse flip disables again.
    act(() => {
      model.setValue('gate', 2);
    });
    await flush();
    expect(
      screen.getByTestId('matrix-tile-r1-col1').props.accessibilityState
        .disabled
    ).toBe(true);
  });
});

describe('matrix (simple) — React keys (column uniqueId)', () => {
  it('duplicate column values (1 vs "1") render without duplicate-key collisions', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { question } = createMatrix({ columns: [1, '1'] });
      renderMatrix(question);
      // Both columns render (2 rows × 2 columns of tiles).
      expect(screen.getAllByTestId(/^matrix-tile-r1-/)).toHaveLength(2);
      const dupKeyCalls = errorSpy.mock.calls.filter((args) =>
        args.some((a) => typeof a === 'string' && a.includes('same key'))
      );
      expect(dupKeyCalls).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('matrix (simple) — question-level error tint (no eachRow*)', () => {
  it('tints ALL tiles when the question has visible errors and neither eachRowRequired nor eachRowUnique is set', async () => {
    // Core parity: getItemClass appends itemOnError via the question's
    // hasCssError() when eachRowRequired/eachRowUnique are BOTH off
    // (question_matrix.ts getItemClass).
    const { question } = createMatrix({ isRequired: true });
    renderMatrix(question);
    const before = decoratorStyle('matrix-tile-r1-col1');

    act(() => {
      question.hasErrors();
    });
    await flush();
    const after = decoratorStyle('matrix-tile-r1-col1');
    expect(after).not.toEqual(before);

    // The tint is the SAME error decorator a per-row eachRowRequired error
    // produces (shared item recipe 'error' state).
    const rowErr = createMatrix({ eachRowRequired: true });
    renderMatrix(rowErr.question);
    fireEvent.press(screen.getByTestId('matrix-tile-r1-col1'));
    await flush();
    act(() => {
      rowErr.question.hasErrors();
    });
    await flush();
    const rowErrorTint = decoratorStyle('matrix-tile-r2-col1');
    expect(after).toEqual(rowErrorTint);
    // …and under eachRowRequired the tint stays PER-ROW: the answered
    // row's unchecked tile carries no error tint.
    expect(decoratorStyle('matrix-tile-r1-col2')).not.toEqual(rowErrorTint);
  });
});

describe('matrix (simple) — preview mode', () => {
  it('renders the preview variant (check glyph, readOnly styling suppressed), not the generic readOnly variant', async () => {
    const model = new Model({
      showPreviewBeforeComplete: 'showAllQuestions',
      elements: [
        {
          type: 'matrix',
          name: 'm',
          columns: ['col1', 'col2'],
          rows: [{ value: 'r1', text: 'Row One' }],
        },
      ],
    });
    const question = model.getQuestionByName('m') as QuestionMatrixModel;
    question.value = { r1: 'col1' };
    act(() => {
      model.showPreview();
    });
    expect(model.state).toBe('preview');
    expect(question.isPreviewStyle).toBe(true);
    renderMatrix(question);

    // Preview swaps the checked radio's dot for core's preview check glyph
    // (itemSvgIcon → itemPreviewSvgIconId, "#icon-check-16x16").
    expect(
      screen.getByTestId('matrix-tile-r1-col1-check-icon', {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
    const previewTint = decoratorStyle('matrix-tile-r1-col1');

    // Web suppresses readOnly styling in preview (survey-element.ts
    // isReadOnlyStyle = isReadOnly && !isPreview): the preview decorator
    // must NOT equal the plain-readOnly decorator.
    const ro = createMatrix();
    ro.question.readOnly = true;
    ro.question.value = { r1: 'col1' };
    renderMatrix(ro.question);
    const readOnlyTint = decoratorStyle('matrix-tile-r1-col1');
    expect(previewTint).not.toEqual(readOnlyTint);
  });
});

describe('matrix (simple) — rubric lookup with numeric row values', () => {
  it('shows the rubric text for a numeric row value (String(row.name) key — deliberate web divergence)', () => {
    // Web passes raw row.name to getCellDisplayLocText; a NUMBER there is
    // misread as a row INDEX by MatrixCells.getCellRowColumnValue
    // (question_matrix.ts), so web resolves the WRONG row (or none). RN
    // stringifies the row key, matching the string-keyed cells JSON —
    // documented in DIFFERENCES.md.
    const { question } = createMatrix({
      rows: [1, 2],
      cells: { '1': { col1: 'R1C1 rubric' } },
    });
    renderMatrix(question);
    expect(question.hasCellText).toBe(true);
    expect(screen.getAllByText('R1C1 rubric')).toHaveLength(1);
    expect(screen.getByTestId('matrix-tile-1-col1')).toBeTruthy();
  });
});

describe('matrix (simple) — eachRowUnique validation', () => {
  it('duplicate row answers produce the row error on the duplicating row', async () => {
    const { question } = createMatrix({ eachRowUnique: true });
    renderMatrix(question);
    fireEvent.press(screen.getByTestId('matrix-tile-r1-col1'));
    await flush();
    fireEvent.press(screen.getByTestId('matrix-tile-r2-col1'));
    await flush();

    act(() => {
      question.hasErrors();
    });
    await flush();

    expect(question.hasErrors()).toBe(true);
    const [r1, r2] = question.visibleRows as MatrixRowModel[];
    // The FIRST occurrence is fine; the duplicating row is flagged.
    expect(r1!.hasError).toBe(false);
    expect(r2!.hasError).toBe(true);
    expect(screen.getByTestId('matrix-rowheader-error-r2')).toBeTruthy();
    expect(screen.queryByTestId('matrix-rowheader-error-r1')).toBeNull();

    // Changing the duplicate clears the row error.
    fireEvent.press(screen.getByTestId('matrix-tile-r2-col2'));
    await flush();
    expect((question.visibleRows[1] as MatrixRowModel).hasError).toBe(false);
    expect(screen.queryByTestId('matrix-rowheader-error-r2')).toBeNull();
  });
});

describe('matrix (simple) — rowOrder random', () => {
  it("renders core's shuffled visibleRows order, not the declared rows order", async () => {
    const model = new Model({
      elements: [
        {
          type: 'matrix',
          name: 'm',
          columns: ['col1'],
          rowOrder: 'random',
          rows: ['a', 'b', 'c', 'd', 'e'],
        },
      ],
    });
    // Deterministic shuffle: core's randomizeArray seeds mulberry32 from
    // survey.randomSeed (helpers.ts randomizeArray; survey-element.ts
    // randomSeed) — setting it re-sorts the rows reproducibly.
    (model as unknown as { randomSeed: number }).randomSeed = 7;
    const question = model.getQuestionByName('m') as QuestionMatrixModel;
    renderMatrix(question);

    const visibleOrder = (question.visibleRows as MatrixRowModel[]).map((r) =>
      String(r.name)
    );
    const declaredOrder = ['a', 'b', 'c', 'd', 'e'];
    // The seed produces a real permutation (guards the assertion below
    // against a no-op shuffle).
    expect(visibleOrder).not.toEqual(declaredOrder);
    expect([...visibleOrder].sort()).toEqual(declaredOrder);

    // Rendered row-header order follows visibleRows, not rows.
    const renderedOrder = screen
      .getAllByTestId(/^matrix-rowheader-[a-e]$/)
      .map((node) =>
        (node.props.testID as string).replace('matrix-rowheader-', '')
      );
    expect(renderedOrder).toEqual(visibleOrder);
  });
});

describe('MatrixQuestion — export shape', () => {
  it('exports both the class and the OverlayContext-free element wrapper', () => {
    expect(typeof MatrixQuestion).toBe('function');
    expect(typeof MatrixQuestionElement).toBe('function');
  });
});
