/**
 * M3 3.1a — the MEASUREMENT contract (design
 * docs/design/M3-matrix-family-plan.md §3a.2 + the §3 "MatrixGrid
 * ownership" split). `MatrixGridRoot` is the reusable owner the
 * question-renderers compose: it hosts the OUTER, pre-scroll root View +
 * its `onLayout`, holds the one-frame `measuredWidth` state, runs the
 * width allocator (§3a.3), and hands a fully-resolved contract to the
 * presentational `MatrixGrid`. It is the ONE owner of measurement +
 * resolution; `MatrixGrid` resolves nothing.
 *
 * The CORE regression (verbatim `SurveyRow` device-bug lesson, §3a.2):
 * width MUST be read from the OUTER pre-scroll root View, NEVER a
 * `width>0`-gated box INSIDE the horizontal ScrollView content (whose
 * intrinsic content width would measure against nothing and deadlock the
 * defer → blank grid). Here we prove the positive: firing `onLayout` on
 * the outer root alone unblocks the grid, and the resolved dp array lands
 * identically on the header / body / footer bands.
 */
import { Text } from 'react-native';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { MatrixGridRoot } from '../MatrixGridRoot';
import * as matrixColumnWidths from '../../../layout/matrix-column-widths';
import type { GridCell, GridContract, GridRow } from '../grid-contract';

function textCell(key: string, label: string): GridCell {
  return {
    key,
    kind: 'question',
    render: () => <Text>{label}</Text>,
  };
}

function row(key: string, kind: GridRow['kind'], cells: GridCell[]): GridRow {
  return { key, kind, cells, getStateElement: () => ({}) as never };
}

/**
 * A raw contract (columns carry raw CSS-string widths): a fixed row-header
 * (100px) + a fixed data column (200px) + a floorless auto column.
 * At width 800: S = 100 + 200 + AUTO(120) = 420 <= 800, so the single
 * growable auto column absorbs the 380 slack -> dp [100, 200, 500].
 */
function rawContract(): GridContract {
  return {
    columns: [
      {
        key: 'rowh',
        header: <Text>Row</Text>,
        isRowHeader: true,
        width: '100px',
        minWidth: '100px',
      },
      { key: 'c1', header: <Text>C1</Text>, width: '200px' },
      { key: 'c2', header: <Text>C2</Text> },
    ],
    showHeader: true,
    hasFooter: true,
    mobile: false,
    stickyFirstColumn: false,
    rows: [
      row('r1', 'data', [
        textCell('r1-0', 'R1'),
        textCell('r1-1', 'a'),
        textCell('r1-2', 'b'),
      ]),
      row('ftr', 'footer', [
        textCell('ftr-0', 'Total'),
        textCell('ftr-1', '1'),
        textCell('ftr-2', '2'),
      ]),
    ],
  };
}

function layoutRoot(width: number): void {
  fireEvent(screen.getByTestId('matrix-root'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
  });
}

function styleWidth(testID: string): number {
  return (
    StyleSheet.flatten(screen.getByTestId(testID).props.style) as {
      width?: number;
    }
  ).width as number;
}

describe('MatrixGridRoot — one-frame defer (§3a.2)', () => {
  it('renders the outer root but NO grid before the first onLayout', () => {
    render(<MatrixGridRoot contract={rawContract()} />);
    expect(screen.getByTestId('matrix-root')).toBeTruthy();
    expect(screen.queryByTestId('matrix-scroll')).toBeNull();
  });

  it('a width-0 layout does NOT unblock the grid (defer holds until a real width)', () => {
    render(<MatrixGridRoot contract={rawContract()} />);
    layoutRoot(0);
    expect(screen.queryByTestId('matrix-scroll')).toBeNull();
  });

  it('a real width on the OUTER root unblocks the grid (SurveyRow device-bug regression: never blank)', () => {
    render(<MatrixGridRoot contract={rawContract()} />);
    layoutRoot(800);
    // grid rendered — not blank
    expect(screen.getByTestId('matrix-scroll')).toBeTruthy();
    expect(screen.getByTestId('matrix-content')).toBeTruthy();
    // the measuring View is the OUTER root, and it is the PARENT of the scroll
    expect(screen.getByTestId('matrix-root')).toContainElement(
      screen.getByTestId('matrix-scroll')
    );
  });
});

describe('MatrixGridRoot — allocator wiring: the resolved dp array is applied identically to header/body/footer (§3a.2, §3a.3f)', () => {
  it('resolves [100, 200, 500] at width 800 and stamps it on every band', () => {
    render(<MatrixGridRoot contract={rawContract()} />);
    layoutRoot(800);
    for (const [slot, dp] of [
      [0, 100],
      [1, 200],
      [2, 500],
    ] as const) {
      expect(styleWidth(`matrix-hcell-${slot}`)).toBe(dp);
      expect(styleWidth(`matrix-cell-r1-${slot}`)).toBe(dp);
      expect(styleWidth(`matrix-cell-ftr-${slot}`)).toBe(dp);
    }
    expect(styleWidth('matrix-content')).toBe(800);
  });

  it('recomputes when the measured width changes (a later onLayout re-resolves)', () => {
    render(<MatrixGridRoot contract={rawContract()} />);
    layoutRoot(800);
    expect(styleWidth('matrix-cell-r1-2')).toBe(500); // auto col at 800
    layoutRoot(1000);
    // S=420 <= 1000, slack 580 -> auto col = 120 + 580 = 700
    expect(styleWidth('matrix-cell-r1-2')).toBe(700);
    expect(styleWidth('matrix-content')).toBe(1000);
  });

  it('recomputes when a column spec changes even if the width is unchanged (a later contract with a wider data col re-resolves)', () => {
    const { rerender } = render(<MatrixGridRoot contract={rawContract()} />);
    layoutRoot(800);
    expect(styleWidth('matrix-cell-r1-1')).toBe(200); // fixed 200 data col
    const changed = rawContract();
    changed.columns[1] = { ...changed.columns[1]!, width: '300px' };
    rerender(<MatrixGridRoot contract={changed} />);
    // S = 100 + 300 + 120 = 520 <= 800; auto col absorbs 280 -> 400
    expect(styleWidth('matrix-cell-r1-1')).toBe(300);
    expect(styleWidth('matrix-cell-r1-2')).toBe(400);
  });

  it('honors the width config (columnMinWidth / columnWidthsByType) passed to the allocator', () => {
    const contract: GridContract = {
      columns: [{ key: 'c0', header: <Text>c0</Text>, cellType: 'comment' }],
      showHeader: false,
      hasFooter: false,
      mobile: false,
      stickyFirstColumn: false,
      rows: [row('r1', 'data', [textCell('r1-0', 'x')])],
    };
    render(
      <MatrixGridRoot
        contract={contract}
        config={{ columnWidthsByType: { comment: { minWidth: '200px' } } }}
      />
    );
    layoutRoot(100); // < 200 -> overflow, floor honored at 200
    expect(styleWidth('matrix-cell-r1-0')).toBe(200);
    expect(styleWidth('matrix-content')).toBe(200);
  });
});

/**
 * §3a.3f — "Recompute only when `measuredWidth` changes or the columns
 * change." The allocation (dp array + summed content width) is the
 * expensive resolution step; it must be GATED to width / column-spec
 * changes, NOT rebuilt on every render (e.g. a row-value change that
 * hands down a fresh contract with the SAME columns). Class-based cache on
 * the instance — no hooks/useMemo (invariant 2).
 */
describe('MatrixGridRoot — allocation memoization (§3a.3f: gated to width/column changes)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** A contract with the SAME column specs but distinct row objects (a value change). */
  function rawContractWithLabel(label: string): GridContract {
    const c = rawContract();
    c.rows = [
      row('r1', 'data', [
        textCell('r1-0', 'R1'),
        textCell('r1-1', label),
        textCell('r1-2', 'b'),
      ]),
      row('ftr', 'footer', [
        textCell('ftr-0', 'Total'),
        textCell('ftr-1', '1'),
        textCell('ftr-2', '2'),
      ]),
    ];
    return c;
  }

  it('runs the allocator ONCE across re-renders that change only rows (width + columns unchanged)', () => {
    const spy = jest.spyOn(matrixColumnWidths, 'allocateColumnWidths');
    const { rerender } = render(
      <MatrixGridRoot contract={rawContractWithLabel('a')} />
    );
    layoutRoot(800);
    expect(spy).toHaveBeenCalledTimes(1);
    // three more renders, each a fresh contract with the SAME columns but new rows
    rerender(<MatrixGridRoot contract={rawContractWithLabel('b')} />);
    rerender(<MatrixGridRoot contract={rawContractWithLabel('c')} />);
    rerender(<MatrixGridRoot contract={rawContractWithLabel('d')} />);
    // cache hit — the allocator did NOT re-run
    expect(spy).toHaveBeenCalledTimes(1);
    // ...and the new row content still rendered (contract wrapper rebuilt cheaply)
    expect(screen.getByText('d')).toBeTruthy();
  });

  it('re-runs the allocator when the measured width changes', () => {
    const spy = jest.spyOn(matrixColumnWidths, 'allocateColumnWidths');
    render(<MatrixGridRoot contract={rawContract()} />);
    layoutRoot(800);
    expect(spy).toHaveBeenCalledTimes(1);
    layoutRoot(1000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('re-runs the allocator when a column spec changes at an unchanged width', () => {
    const spy = jest.spyOn(matrixColumnWidths, 'allocateColumnWidths');
    const { rerender } = render(<MatrixGridRoot contract={rawContract()} />);
    layoutRoot(800);
    expect(spy).toHaveBeenCalledTimes(1);
    const changed = rawContract();
    changed.columns[1] = { ...changed.columns[1]!, width: '250px' };
    rerender(<MatrixGridRoot contract={changed} />);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
