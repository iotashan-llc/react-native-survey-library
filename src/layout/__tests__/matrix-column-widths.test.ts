/**
 * M3 3.1a — column-width allocation algorithm (design
 * docs/design/M3-matrix-family-plan.md §3a.3), the CORE deliverable.
 *
 * The pure allocator takes per-column specs + a measured viewport width
 * and returns the resolved integer-dp width per column, the summed
 * content width, and the regime. Exhaustively unit-tested against the
 * design's stated cases: getColumnWidth precedence, `effFixed =
 * max(width, minWidth)`, `rowTitleWidth` as both width AND floor, the two
 * regimes (fit water-fill / overflow no-shrink), the all-fixed underfill
 * policy, the floor-safe largest-remainder rounding residual
 * (deterministic / order-independent), AUTO_COL_DP / ACTIONS_COL_DP
 * intrinsics, and `%` resolved against the measured viewport in BOTH
 * regimes.
 */
import {
  allocateColumnWidths,
  AUTO_COL_DP,
  ACTIONS_COL_DP,
} from '../matrix-column-widths';
import type {
  MatrixColumnSpec,
  MatrixWidthConfig,
} from '../matrix-column-widths';

const sum = (a: number[]): number => a.reduce((t, n) => t + n, 0);

describe('matrix column-width allocator — named intrinsics', () => {
  it('AUTO_COL_DP is 120 and ACTIONS_COL_DP is 48 (design §3a.3e)', () => {
    expect(AUTO_COL_DP).toBe(120);
    expect(ACTIONS_COL_DP).toBe(48);
  });
});

describe('matrix column-width allocator — effFixed = max(width, minWidth) (design §3a.3b)', () => {
  it('a fixed column with width:50 / minWidth:100 resolves to 100, NOT 50 (own minWidth raises its floor)', () => {
    const cols: MatrixColumnSpec[] = [{ width: '50px', minWidth: '100px' }];
    const { widths } = allocateColumnWidths(cols, 800);
    expect(widths).toEqual([100]);
  });

  it('a fixed column with width:200 / minWidth:100 keeps 200 (max wins the other way)', () => {
    const cols: MatrixColumnSpec[] = [{ width: '200px', minWidth: '100px' }];
    const { widths } = allocateColumnWidths(cols, 800);
    expect(widths).toEqual([200]);
  });
});

describe('matrix column-width allocator — getColumnWidth precedence (design §3a.3a)', () => {
  const byType: MatrixWidthConfig = {
    columnWidthsByType: {
      comment: { minWidth: '200px' },
      file: { minWidth: '240px' },
    },
  };

  it('per-cellType columnWidthsByType floor is read: a comment column floors at 200, a file column at 240', () => {
    const cols: MatrixColumnSpec[] = [
      { cellType: 'comment' },
      { cellType: 'file' },
    ];
    // small viewport -> overflow -> intrinsic floors show directly
    const { widths } = allocateColumnWidths(cols, 100, byType);
    expect(widths).toEqual([200, 240]);
  });

  it('column.minWidth WINS over columnMinWidth and the per-cellType default', () => {
    const cfg: MatrixWidthConfig = {
      ...byType,
      columnMinWidth: '150px',
    };
    const cols: MatrixColumnSpec[] = [
      { cellType: 'comment', minWidth: '120px' },
    ];
    const { widths } = allocateColumnWidths(cols, 100, cfg);
    expect(widths).toEqual([120]);
  });

  it('columnMinWidth WINS over the per-cellType default when no column.minWidth', () => {
    const cfg: MatrixWidthConfig = { ...byType, columnMinWidth: '150px' };
    const cols: MatrixColumnSpec[] = [{ cellType: 'comment' }];
    const { widths } = allocateColumnWidths(cols, 100, cfg);
    expect(widths).toEqual([150]);
  });

  it('per-cellType default is the last resort when neither column.minWidth nor columnMinWidth is set', () => {
    const cols: MatrixColumnSpec[] = [{ cellType: 'comment' }];
    const { widths } = allocateColumnWidths(cols, 100, byType);
    expect(widths).toEqual([200]);
  });
});

describe('matrix column-width allocator — rowTitleWidth is BOTH width AND floor (design §3a.3a)', () => {
  it('the row-header column uses its own width/minWidth (rowTitleWidth) and is NOT raised by columnMinWidth', () => {
    // Owner stamps width = minWidth = getRowTitleWidth() on the row-header
    // column; the columnMinWidth global must NOT apply to it, but MUST
    // apply to the data column.
    const cfg: MatrixWidthConfig = { columnMinWidth: '300px' };
    const cols: MatrixColumnSpec[] = [
      { isRowHeader: true, width: '120px', minWidth: '120px' },
      {}, // data column, floored to columnMinWidth 300
    ];
    const { widths, contentWidth } = allocateColumnWidths(cols, 800, cfg);
    // row-header frozen at 120; data column floored at 300 then water-fills
    expect(widths[0]).toBe(120);
    // fit: S = 120 + 300 = 420 <= 800; only the data col is growable, so it
    // absorbs the whole 380 slack -> 300 + 380 = 680
    expect(widths[1]).toBe(680);
    expect(contentWidth).toBe(800);
  });
});

describe('matrix column-width allocator — regime (a) FIT water-fill (design §3a.3c)', () => {
  it('distributes slack EQUALLY across growable (auto + floored) columns above their floor; fixed columns are frozen; grid exactly fills measuredWidth', () => {
    const cols: MatrixColumnSpec[] = [
      { isRowHeader: true, width: '100px', minWidth: '100px' }, // fixed 100
      { width: '200px' }, // fixed 200
      {}, // auto growable -> floor 120
      { minWidth: '150px' }, // floored growable -> floor 150
    ];
    // S = 100 + 200 + 120 + 150 = 570 <= 800; slack 230 over 2 growables
    const { widths, contentWidth, regime } = allocateColumnWidths(cols, 800);
    expect(regime).toBe('fit');
    expect(widths).toEqual([100, 200, 235, 265]);
    expect(contentWidth).toBe(800);
    expect(sum(widths)).toBe(800);
  });

  it('is order-independent: shuffling the column order yields the same per-column widths', () => {
    const base: MatrixColumnSpec[] = [
      { width: '200px' },
      {},
      { minWidth: '150px' },
    ];
    const shuffled: MatrixColumnSpec[] = [
      { minWidth: '150px' },
      { width: '200px' },
      {},
    ];
    const a = allocateColumnWidths(base, 800);
    const b = allocateColumnWidths(shuffled, 800);
    // same multiset of widths regardless of order
    expect([...a.widths].sort()).toEqual([...b.widths].sort());
    expect(a.contentWidth).toBe(b.contentWidth);
  });
});

describe('matrix column-width allocator — floor-safe largest-remainder rounding residual (design §3a.3c(a)4)', () => {
  it('floors every column DOWN then hands the non-negative leftover to growables by descending fractional remainder, ties by ascending slot index; Σ is exact and no column drops below its floor', () => {
    // 3 floored growables, each floor 10, viewport 100 -> slack 70 over 3
    // -> target 33.333 each -> floor 33 (sum 99) -> leftover 1 -> equal
    // fracs (0.333) so the tie goes to the lowest slot index (col0).
    const cols: MatrixColumnSpec[] = [
      { minWidth: '10px' },
      { minWidth: '10px' },
      { minWidth: '10px' },
    ];
    const { widths, contentWidth } = allocateColumnWidths(cols, 100);
    expect(widths).toEqual([34, 33, 33]);
    expect(sum(widths)).toBe(100);
    expect(contentWidth).toBe(100);
    // floor-safe: none below the 10 floor
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(10);
  });

  it('leftover goes to the LARGER fractional remainder first (not merely the lowest index)', () => {
    // col0 floor 10, col1 floor 11, col2 floor 10; viewport 100.
    // S = 31, slack 69 / 3 = 23 exactly -> targets 33, 34, 33 (all integer)
    // no residual. Craft a fractional case instead: floors 10/10/10,
    // viewport 101 -> slack 71/3 = 23.667 -> targets 33.667 each -> floor 33
    // (sum 99) -> leftover 2 -> all fracs equal -> slots 0 and 1 get +1.
    const cols: MatrixColumnSpec[] = [
      { minWidth: '10px' },
      { minWidth: '10px' },
      { minWidth: '10px' },
    ];
    const { widths } = allocateColumnWidths(cols, 101);
    expect(widths).toEqual([34, 34, 33]);
    expect(sum(widths)).toBe(101);
  });
});

describe('matrix column-width allocator — all-fixed underfill policy (design §3a.3c(a)3)', () => {
  it('when EVERY column is fixed and S < measuredWidth, fixed columns are NOT stretched; the grid sits logical-start and trailing space is empty', () => {
    const cols: MatrixColumnSpec[] = [{ width: '100px' }, { width: '200px' }];
    const { widths, contentWidth, regime } = allocateColumnWidths(cols, 800);
    expect(widths).toEqual([100, 200]);
    expect(contentWidth).toBe(300);
    expect(contentWidth).toBeLessThan(800);
    expect(regime).toBe('fit');
  });

  it('a single fixed column narrower than the viewport is not grown', () => {
    const cols: MatrixColumnSpec[] = [{ width: '50px', minWidth: '100px' }];
    const { widths, contentWidth } = allocateColumnWidths(cols, 800);
    expect(widths).toEqual([100]);
    expect(contentWidth).toBe(100);
  });
});

describe('matrix column-width allocator — regime (b) OVERFLOW no-shrink (design §3a.3c(b))', () => {
  it('keeps intrinsic/min widths, never shrinks below a floor, and the summed content width exceeds measuredWidth (scrollable)', () => {
    const cols: MatrixColumnSpec[] = [
      { width: '200px' }, // fixed 200
      { minWidth: '150px' }, // floored 150
      {}, // auto 120
    ];
    // S = 470 > 300 -> overflow
    const { widths, contentWidth, regime } = allocateColumnWidths(cols, 300);
    expect(regime).toBe('overflow');
    expect(widths).toEqual([200, 150, 120]);
    expect(contentWidth).toBe(470);
    expect(contentWidth).toBeGreaterThan(300);
  });
});

describe('matrix column-width allocator — intrinsic auto & action/drag columns (design §3a.3e)', () => {
  it('a floorless-auto column takes AUTO_COL_DP as its intrinsic', () => {
    const cols: MatrixColumnSpec[] = [{}];
    // single auto col, viewport 120 -> S == 120, growable present, exactly fills
    const { widths } = allocateColumnWidths(cols, 120);
    expect(widths).toEqual([120]);
  });

  it('an actions column and a drag column take a fixed ACTIONS_COL_DP and are never auto-grown', () => {
    const cols: MatrixColumnSpec[] = [
      {}, // auto growable
      { intrinsic: 'actions' },
      { intrinsic: 'drag' },
    ];
    // S = 120 + 48 + 48 = 216 <= 800; only the auto col grows, actions/drag
    // stay 48 (frozen)
    const { widths, contentWidth } = allocateColumnWidths(cols, 800);
    expect(widths[1]).toBe(ACTIONS_COL_DP);
    expect(widths[2]).toBe(ACTIONS_COL_DP);
    expect(widths[0]).toBe(800 - ACTIONS_COL_DP * 2);
    expect(contentWidth).toBe(800);
  });

  it('an intrinsic actions column ignores any width/minWidth stamped on it', () => {
    const cols: MatrixColumnSpec[] = [
      { intrinsic: 'actions', width: '500px', minWidth: '400px' },
    ];
    const { widths, contentWidth } = allocateColumnWidths(cols, 800);
    expect(widths).toEqual([ACTIONS_COL_DP]);
    expect(contentWidth).toBe(ACTIONS_COL_DP);
  });
});

describe('matrix column-width allocator — % resolves against measuredWidth in BOTH regimes (design §3a.3d)', () => {
  it('fit: a 50% column resolves to half the measured viewport', () => {
    const cols: MatrixColumnSpec[] = [{ width: '50%' }, { width: '50%' }];
    const { widths, contentWidth } = allocateColumnWidths(cols, 1000);
    expect(widths).toEqual([500, 500]);
    expect(contentWidth).toBe(1000);
  });

  it('overflow: a % column is still viewport-relative, then fixed columns push total past the viewport', () => {
    const cols: MatrixColumnSpec[] = [
      { width: '50%' }, // 500 of a 1000 viewport
      { width: '700px' }, // fixed pushes past viewport
    ];
    const { widths, contentWidth, regime } = allocateColumnWidths(cols, 1000);
    expect(widths).toEqual([500, 700]);
    expect(contentWidth).toBe(1200);
    expect(regime).toBe('overflow');
  });
});

describe('matrix column-width allocator — degenerate inputs never throw', () => {
  it('an empty column list returns empty widths and zero content', () => {
    const { widths, contentWidth } = allocateColumnWidths([], 800);
    expect(widths).toEqual([]);
    expect(contentWidth).toBe(0);
  });

  it('a non-positive measured width degrades to intrinsic widths (overflow) without dividing by zero', () => {
    const cols: MatrixColumnSpec[] = [{}, { width: '100px' }];
    const { widths } = allocateColumnWidths(cols, 0);
    expect(widths).toEqual([AUTO_COL_DP, 100]);
  });
});
