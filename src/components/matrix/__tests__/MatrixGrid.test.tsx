/**
 * M3 3.1a — `MatrixGrid` presentational primitive (design
 * docs/design/M3-matrix-family-plan.md §3 / §3a). Fed a fully-RESOLVED
 * `ResolvedGridContract` (dp widths + summed content width already
 * computed by the measurement owner), it renders a flex-View grid inside
 * a SINGLE horizontal ScrollView with the row-header column INSIDE the
 * scroll content (no split-pane, no height-sync). It resolves NOTHING.
 *
 * Verified here: header/body/footer columns align on the ONE dp array +
 * the identical summed content width; content wider than the viewport
 * scrolls with NO shrink and NO width-0 collapse; a colSpan cell sums the
 * exact spanned dp; detail rows are full-width; the row-header cell lives
 * inside the scroll content; contract-supplied keys drive the rows.
 */
import { Text } from 'react-native';
import { StyleSheet } from 'react-native';
import { act, render, screen, within } from '@testing-library/react-native';

import { Model } from '../../../core/facade';
import { MatrixGrid } from '../MatrixGrid';
import type {
  GridCell,
  GridRow,
  ResolvedGridColumn,
  ResolvedGridContract,
} from '../grid-contract';

function textCell(key: string, label: string, span?: number): GridCell {
  return {
    key,
    kind: 'question',
    span,
    render: () => <Text testID={`content-${key}`}>{label}</Text>,
  };
}

function row(key: string, kind: GridRow['kind'], cells: GridCell[]): GridRow {
  return { key, kind, cells, getStateElement: () => ({}) as never };
}

function col(
  key: string,
  dp: number,
  isRowHeader?: boolean
): ResolvedGridColumn {
  return { key, dp, isRowHeader, header: <Text>{key}</Text> };
}

function width(testID: string): number {
  return (
    StyleSheet.flatten(screen.getByTestId(testID).props.style) as {
      width?: number;
    }
  ).width as number;
}

/** A 3-column contract that fits the viewport (dp sums to contentWidth). */
function fitContract(): ResolvedGridContract {
  const columns = [col('rowh', 100, true), col('c1', 200), col('c2', 150)];
  return {
    columns,
    contentWidth: 450,
    showHeader: true,
    hasFooter: true,
    mobile: false,
    stickyFirstColumn: false,
    regime: 'fit',
    rows: [
      row('r1', 'data', [
        textCell('r1-0', 'Row 1'),
        textCell('r1-1', 'a'),
        textCell('r1-2', 'b'),
      ]),
      row('ftr', 'footer', [
        textCell('ftr-0', 'Total'),
        textCell('ftr-1', '10'),
        textCell('ftr-2', '20'),
      ]),
    ],
  };
}

describe('MatrixGrid — single horizontal ScrollView baseline (§3a)', () => {
  it('wraps the grid in ONE horizontal ScrollView with the content sized to the summed content width', () => {
    render(<MatrixGrid contract={fitContract()} />);
    expect(screen.getByTestId('matrix-scroll').props.horizontal).toBe(true);
    expect(width('matrix-content')).toBe(450);
  });

  it('renders the row-header column as the FIRST cell INSIDE the scroll content (no split-pane)', () => {
    render(<MatrixGrid contract={fitContract()} />);
    const content = screen.getByTestId('matrix-content');
    const rowHeaderCell = screen.getByTestId('matrix-hcell-0');
    // the row-header header cell is a descendant of the scroll content
    expect(content).toContainElement(rowHeaderCell);
    // there is no separate fixed pane in the baseline
    expect(screen.queryByTestId('matrix-sticky-pane')).toBeNull();
  });
});

describe('MatrixGrid — header/body/footer alignment on the shared dp array (§3a.3f)', () => {
  it('stamps the SAME per-column dp on header, body, and footer cells', () => {
    render(<MatrixGrid contract={fitContract()} />);
    // dp array [100, 200, 150]
    for (const [slot, dp] of [
      [0, 100],
      [1, 200],
      [2, 150],
    ] as const) {
      expect(width(`matrix-hcell-${slot}`)).toBe(dp);
      expect(width(`matrix-cell-r1-${slot}`)).toBe(dp);
      expect(width(`matrix-cell-ftr-${slot}`)).toBe(dp);
    }
  });

  it('stamps the identical summed content width on the header, body, and footer bands', () => {
    render(<MatrixGrid contract={fitContract()} />);
    expect(width('matrix-band-header')).toBe(450);
    expect(width('matrix-row-r1')).toBe(450);
    expect(width('matrix-row-ftr')).toBe(450);
  });

  it('never collapses a cell to width 0', () => {
    render(<MatrixGrid contract={fitContract()} />);
    for (const testID of [
      'matrix-hcell-0',
      'matrix-hcell-1',
      'matrix-hcell-2',
      'matrix-cell-r1-0',
      'matrix-cell-ftr-2',
    ]) {
      expect(width(testID)).toBeGreaterThan(0);
    }
  });
});

describe('MatrixGrid — content wider than the viewport scrolls with NO shrink (§3a.3c(b))', () => {
  it('sizes the content to the overflow content width; cells keep their intrinsic dp', () => {
    const columns = [col('rowh', 100, true), col('c1', 400), col('c2', 300)];
    const contract: ResolvedGridContract = {
      columns,
      contentWidth: 800,
      showHeader: true,
      hasFooter: false,
      mobile: false,
      stickyFirstColumn: false,
      regime: 'overflow',
      rows: [
        row('r1', 'data', [
          textCell('r1-0', 'R'),
          textCell('r1-1', 'a'),
          textCell('r1-2', 'b'),
        ]),
      ],
    };
    render(<MatrixGrid contract={contract} />);
    expect(width('matrix-content')).toBe(800);
    expect(width('matrix-cell-r1-1')).toBe(400);
    expect(width('matrix-cell-r1-2')).toBe(300);
    // still one horizontal ScrollView — the surplus scrolls
    expect(screen.getByTestId('matrix-scroll').props.horizontal).toBe(true);
  });
});

describe('MatrixGrid — colSpan sums the exact spanned dp (§3a.1)', () => {
  it('a span-2 cell is a single View summing the spanned column widths', () => {
    const columns = [col('rowh', 100, true), col('c1', 200), col('c2', 150)];
    const contract: ResolvedGridContract = {
      columns,
      contentWidth: 450,
      showHeader: false,
      hasFooter: false,
      mobile: false,
      stickyFirstColumn: false,
      regime: 'fit',
      rows: [
        row('r1', 'data', [
          textCell('r1-0', 'R'),
          textCell('r1-1', 'wide', 2), // spans c1 + c2 = 200 + 150
        ]),
      ],
    };
    render(<MatrixGrid contract={contract} />);
    expect(width('matrix-cell-r1-0')).toBe(100);
    expect(width('matrix-cell-r1-1')).toBe(350);
  });
});

describe('MatrixGrid — row topology (§3g)', () => {
  it('a detail row is FULL-WIDTH (spans the content width), not column-aligned', () => {
    const columns = [col('rowh', 100, true), col('c1', 200)];
    const contract: ResolvedGridContract = {
      columns,
      contentWidth: 300,
      showHeader: false,
      hasFooter: false,
      mobile: false,
      stickyFirstColumn: false,
      regime: 'fit',
      rows: [
        row('r1', 'data', [textCell('r1-0', 'R'), textCell('r1-1', 'a')]),
        row('r1-detail', 'detail', [
          {
            key: 'r1-detail-panel',
            kind: 'panel',
            render: () => <Text testID="detail-body">detail</Text>,
          },
        ]),
      ],
    };
    render(<MatrixGrid contract={contract} />);
    expect(width('matrix-detail-r1-detail')).toBe(300);
    expect(screen.getByTestId('detail-body')).toBeTruthy();
  });
});

describe('MatrixGrid — cells clip over-wide content to their dp gridline (overflow hidden)', () => {
  it('stamps overflow:hidden on the header + column-aligned data/footer cell containers', () => {
    render(<MatrixGrid contract={fitContract()} />);
    for (const testID of [
      'matrix-hcell-0',
      'matrix-hcell-1',
      'matrix-cell-r1-0',
      'matrix-cell-r1-1',
      'matrix-cell-ftr-1',
    ]) {
      const style = StyleSheet.flatten(
        screen.getByTestId(testID).props.style
      ) as { overflow?: string };
      expect(style.overflow).toBe('hidden');
    }
  });

  it('clips a colSpan cell to its summed dp width as well', () => {
    const columns = [col('rowh', 100, true), col('c1', 200), col('c2', 150)];
    const contract: ResolvedGridContract = {
      columns,
      contentWidth: 450,
      showHeader: false,
      hasFooter: false,
      mobile: false,
      stickyFirstColumn: false,
      regime: 'fit',
      rows: [
        row('r1', 'data', [textCell('r1-0', 'R'), textCell('r1-1', 'wide', 2)]),
      ],
    };
    render(<MatrixGrid contract={contract} />);
    const style = StyleSheet.flatten(
      screen.getByTestId('matrix-cell-r1-1').props.style
    ) as { overflow?: string; width?: number };
    expect(style.overflow).toBe('hidden');
    expect(style.width).toBe(350);
  });
});

describe('MatrixGrid — showHeader gates the header band', () => {
  it('omits the header band when showHeader is false', () => {
    const c = fitContract();
    render(<MatrixGrid contract={{ ...c, showHeader: false }} />);
    expect(screen.queryByTestId('matrix-band-header')).toBeNull();
    // body still renders
    expect(screen.getByTestId('matrix-row-r1')).toBeTruthy();
  });
});

describe('MatrixGrid — mobile stacked-card path (§3b / §3d, 3.1b)', () => {
  /**
   * A mobile contract: `mobile: true`. In card mode the grid ignores the
   * dp/contentWidth geometry entirely and lays each row out as a card of
   * `{label, content}` pairs; the row-header `title` cell is the card
   * title, the `actions` cell renders at the card foot, and the footer row
   * becomes a totals summary card (§3d). Labels ride the owner-attached
   * `cell.label` node (§3b).
   */
  function labelledCell(key: string, label: string, value: string): GridCell {
    return {
      key,
      kind: 'question',
      label: <Text testID={`lbl-${key}`}>{label}</Text>,
      render: () => <Text testID={`content-${key}`}>{value}</Text>,
    };
  }

  function mobileContract(): ResolvedGridContract {
    return {
      columns: [col('rowh', 0, true), col('c1', 0), col('c2', 0)],
      contentWidth: 0,
      showHeader: true,
      hasFooter: true,
      mobile: true,
      stickyFirstColumn: false,
      regime: 'fit',
      rows: [
        row('r1', 'data', [
          {
            key: 'r1-title',
            kind: 'title',
            render: () => <Text testID="r1-titletext">Row One</Text>,
          },
          labelledCell('r1-c1', 'Column 1', 'a'),
          labelledCell('r1-c2', 'Column 2', 'b'),
          {
            key: 'r1-actions',
            kind: 'actions',
            render: () => <Text testID="r1-actionbtns">actions</Text>,
          },
        ]),
        row('ftr', 'footer', [
          {
            key: 'ftr-title',
            kind: 'title',
            render: () => <Text testID="ftr-titletext">Totals</Text>,
          },
          labelledCell('ftr-c1', 'Column 1', '10'),
          labelledCell('ftr-c2', 'Column 2', '20'),
        ]),
      ],
    };
  }

  it('renders stacked cards (NOT the wide horizontal ScrollView) when contract.mobile is true', () => {
    render(<MatrixGrid contract={mobileContract()} />);
    // the wide-grid affordances are absent in card mode
    expect(screen.queryByTestId('matrix-scroll')).toBeNull();
    expect(screen.queryByTestId('matrix-content')).toBeNull();
    expect(screen.queryByTestId('matrix-band-header')).toBeNull();
    // the card container IS present
    expect(screen.getByTestId('matrix-cards')).toBeTruthy();
    expect(screen.getByTestId('matrix-card-r1')).toBeTruthy();
  });

  it('renders each data row as a card whose row-header title is the card title', () => {
    render(<MatrixGrid contract={mobileContract()} />);
    const title = screen.getByTestId('matrix-card-title-r1');
    expect(title).toBeTruthy();
    expect(screen.getByTestId('r1-titletext')).toBeTruthy();
  });

  it('lays out each non-title/non-actions cell as a {label, content} pair', () => {
    render(<MatrixGrid contract={mobileContract()} />);
    for (const [key, label, value] of [
      ['r1-c1', 'Column 1', 'a'],
      ['r1-c2', 'Column 2', 'b'],
    ] as const) {
      expect(screen.getByTestId(`matrix-card-cell-${key}`)).toBeTruthy();
      const labelNode = screen.getByTestId(`matrix-card-label-${key}`);
      const valueNode = screen.getByTestId(`matrix-card-value-${key}`);
      expect(within(labelNode).getByText(label)).toBeTruthy();
      expect(within(valueNode).getByText(value)).toBeTruthy();
    }
  });

  it('renders the actions cell at the card foot (no label)', () => {
    render(<MatrixGrid contract={mobileContract()} />);
    const actions = screen.getByTestId('matrix-card-actions-r1');
    expect(actions).toBeTruthy();
    expect(within(actions).getByTestId('r1-actionbtns')).toBeTruthy();
    // an actions cell is NEVER wrapped in a labelled pair
    expect(screen.queryByTestId('matrix-card-cell-r1-actions')).toBeNull();
  });

  it('renders the footer row as a totals summary card of {label, total} pairs (§3d)', () => {
    render(<MatrixGrid contract={mobileContract()} />);
    const totals = screen.getByTestId('matrix-totals-card');
    expect(totals).toBeTruthy();
    // the footer text cell is the totals-card title
    expect(within(totals).getByText('Totals')).toBeTruthy();
    // each visible total column is a labelled pair
    expect(within(totals).getByTestId('matrix-card-cell-ftr-c1')).toBeTruthy();
    expect(within(totals).getByText('10')).toBeTruthy();
    expect(within(totals).getByText('20')).toBeTruthy();
  });

  it('renders a detail row as a full-width block inside the card stack (§3c card mode)', () => {
    const c = mobileContract();
    c.rows.splice(1, 0, {
      key: 'r1-detail',
      kind: 'detail',
      cells: [
        {
          key: 'r1-detail-panel',
          kind: 'panel',
          render: () => <Text testID="card-detail-body">detail</Text>,
        },
      ],
      getStateElement: () => ({}) as never,
    });
    render(<MatrixGrid contract={c} />);
    expect(screen.getByTestId('matrix-card-detail-r1-detail')).toBeTruthy();
    expect(screen.getByTestId('card-detail-body')).toBeTruthy();
  });

  it('a wide (mobile:false) contract is UNCHANGED — still the horizontal ScrollView, no cards', () => {
    render(<MatrixGrid contract={fitContract()} />);
    expect(screen.getByTestId('matrix-scroll')).toBeTruthy();
    expect(screen.queryByTestId('matrix-cards')).toBeNull();
  });
});

describe('MatrixGrid — per-row reactive subscription (design §4, 3.3a review amendment)', () => {
  it('re-renders a row band when its state element takes an in-place property write', () => {
    // A REAL survey-core Base as the row state element: core mutates
    // renderedRow.isGhostRow / .visible IN PLACE (no reset) — the row
    // band must re-render from that notification alone (3.3b detail /
    // 3.4 drag ghost-row groundwork).
    const model = new Model({
      elements: [
        {
          type: 'matrixdropdown',
          name: 'md',
          columns: [{ name: 'c1', cellType: 'text' }],
          rows: ['r1'],
        },
      ],
    });
    const question = model.getQuestionByName('md') as unknown as {
      renderedTable: {
        renderedRows: Array<{ isGhostRow: boolean; isErrorsRow: boolean }>;
      };
    };
    const renderedRow = question.renderedTable.renderedRows.find(
      (r) => !r.isErrorsRow
    )!;
    const contract: ResolvedGridContract = {
      columns: [col('c1', 200)],
      contentWidth: 200,
      showHeader: false,
      hasFooter: false,
      mobile: false,
      stickyFirstColumn: false,
      regime: 'fit',
      rows: [
        {
          key: 'r1',
          kind: 'data',
          cells: [
            {
              key: 'probe',
              kind: 'question',
              render: () => (
                <Text testID="ghost-probe">
                  {String(renderedRow.isGhostRow)}
                </Text>
              ),
            },
          ],
          getStateElement: () => renderedRow as never,
        },
      ],
    };
    render(<MatrixGrid contract={contract} />);
    expect(screen.getByTestId('ghost-probe').props.children).toBe('false');
    act(() => {
      renderedRow.isGhostRow = true;
    });
    expect(screen.getByTestId('ghost-probe').props.children).toBe('true');
  });
});
