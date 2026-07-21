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
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

describe('MatrixQuestion — export shape', () => {
  it('exports both the class and the OverlayContext-free element wrapper', () => {
    expect(typeof MatrixQuestion).toBe('function');
    expect(typeof MatrixQuestionElement).toBe('function');
  });
});
