/**
 * Matrix column-width allocation algorithm (design:
 * docs/design/M3-matrix-family-plan.md §3a.3 — the M3 3.1a CORE
 * deliverable).
 *
 * The 1.3 width-resolver (`evaluateWidthExpression`) resolves ONE value
 * against ONE `percentBase`; the matrix-specific *distribution across
 * columns* is new code layered on top of it. Pure TS: zero react-native
 * imports, zero survey-core imports (specs typed structurally; the
 * question-renderer owner extracts these fields from core cells/columns
 * and the `settings.matrix.columnWidthsByType` map through the facade).
 *
 * Given per-column specs and a measured viewport width, `allocateColumnWidths`
 * returns the resolved integer-dp width per column (index-aligned to the
 * input), the summed content width (stamped identically on the grid's
 * header / body / footer bands so nothing shrinks differently — §3a.3f),
 * and the regime. Deterministic and order-independent.
 *
 * The pipeline (§3a.3):
 *  1. Resolve `width` and the effective minWidth (precedence below)
 *     against `measuredWidth` as `percentBase` — so `%` is viewport-
 *     relative in BOTH regimes (§3a.3d). A `%`-origin dp and a px-origin
 *     dp are indistinguishable (both `{kind:'dp'}`) and treated as a
 *     FIXED dp (§3a.3b).
 *  2. Classify each column: FIXED (`effFixed = max(clampedWidth,
 *     clampedMin)`), FLOORED (`effFloor = clampedMin`, no fixed width),
 *     or AUTO (neither). Action/drag columns are FIXED at ACTIONS_COL_DP
 *     and never grow; a floorless AUTO column's intrinsic is AUTO_COL_DP.
 *  3. `S = Σ effFixed + Σ effFloor + Σ AUTO_COL_DP`. If `S ≤ measuredWidth`
 *     → FIT (water-fill the growables — floored + auto — equally above
 *     their floors so the grid exactly fills the viewport). Otherwise →
 *     OVERFLOW (each column takes its intrinsic/min, NO shrink; the
 *     surplus scrolls).
 *  4. Fit residual is a FLOOR-SAFE largest-remainder: floor every column
 *     down (never below its integral floor), then hand the non-negative
 *     leftover dp one at a time to the GROWABLE columns only, ordered by
 *     descending fractional remainder, ties by ascending slot index.
 *
 * The minWidth precedence mirrors core's `matrix.getColumnWidth`
 * (`column.minWidth || matrix.columnMinWidth ||
 * settings.matrix.columnWidthsByType[cellType]?.minWidth`); it applies to
 * DATA columns only. A row-header column uses its own stamped width/
 * minWidth (`getRowTitleWidth()` — both a width AND a floor) with NO
 * precedence.
 */
import { evaluateWidthExpression } from './width-resolver';

/** Floorless-auto data column intrinsic (design §3a.3e; revisitable). */
export const AUTO_COL_DP = 120;
/** Actions / drag-handle column intrinsic — fixed, never auto-grown (§3a.3e). */
export const ACTIONS_COL_DP = 48;

/**
 * One column's allocation input. `width`/`minWidth` are core's raw CSS
 * strings (or numbers, core's own bare-number = px convention). The
 * owner stamps `width = minWidth = getRowTitleWidth()` and `isRowHeader`
 * on the row-header column, and marks the actions/drag columns via
 * `intrinsic`.
 */
export interface MatrixColumnSpec {
  /** Raw `column.width` (or `getRowTitleWidth()` for the row-header). */
  width?: string | number;
  /** Raw column-level `column.minWidth` (or `getRowTitleWidth()` for the row-header). */
  minWidth?: string | number;
  /** cellType for the `columnWidthsByType` default-minWidth lookup (data columns). */
  cellType?: string;
  /** Row-header column: uses its own width/minWidth with NO precedence. */
  isRowHeader?: boolean;
  /** Intrinsic fixed-width column — actions/drag → ACTIONS_COL_DP, ignores width/minWidth. */
  intrinsic?: 'actions' | 'drag';
}

/** Global width config (all consumer-overridable through the facade). */
export interface MatrixWidthConfig {
  /** `matrix.columnMinWidth` — the global per-matrix minWidth. */
  columnMinWidth?: string | number;
  /** `settings.matrix.columnWidthsByType` — per-cellType default floors. */
  columnWidthsByType?: Record<string, { minWidth?: string } | undefined>;
  /** Override AUTO_COL_DP (default 120). */
  autoColDp?: number;
  /** Override ACTIONS_COL_DP (default 48). */
  actionsColDp?: number;
}

export interface AllocatedColumns {
  /** Resolved integer-dp widths, index-aligned to the input columns. */
  widths: number[];
  /** Σ widths — the content width stamped on every band (header/body/footer). */
  contentWidth: number;
  /** 'fit' when the content fits the viewport (water-filled or under-filled); 'overflow' otherwise. */
  regime: 'fit' | 'overflow';
}

type ColumnClass =
  | { kind: 'fixed'; eff: number }
  | { kind: 'floored'; floor: number }
  | { kind: 'auto'; floor: number };

/** First value core's `||` chain would keep (empty string / 0 / nullish are skipped). */
function firstTruthy(
  ...values: Array<string | number | undefined>
): string | number | undefined {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (v === '' || v === 0) continue;
    return v;
  }
  return undefined;
}

/** Resolve one raw value to a clamped (>=0) dp, or null if it is not a dp. */
function resolveDp(
  raw: string | number | undefined,
  percentBase: number
): number | null {
  if (raw === undefined) return null;
  const resolved = evaluateWidthExpression(raw, percentBase);
  return resolved.kind === 'dp' ? Math.max(0, resolved.dp) : null;
}

function classifyColumn(
  spec: MatrixColumnSpec,
  measuredWidth: number,
  config: Required<Pick<MatrixWidthConfig, 'autoColDp' | 'actionsColDp'>> &
    MatrixWidthConfig
): ColumnClass {
  if (spec.intrinsic === 'actions' || spec.intrinsic === 'drag') {
    return { kind: 'fixed', eff: config.actionsColDp };
  }

  const widthDp = resolveDp(spec.width, measuredWidth);

  // Effective minWidth: row-header uses its own minWidth only; data
  // columns follow the getColumnWidth precedence
  // (column.minWidth || columnMinWidth || columnWidthsByType[cellType]).
  const rawMin = spec.isRowHeader
    ? spec.minWidth
    : firstTruthy(
        spec.minWidth,
        config.columnMinWidth,
        spec.cellType
          ? config.columnWidthsByType?.[spec.cellType]?.minWidth
          : undefined
      );
  const minDp = resolveDp(rawMin, measuredWidth);

  if (widthDp !== null) {
    return { kind: 'fixed', eff: Math.max(widthDp, minDp ?? 0) };
  }
  if (minDp !== null) {
    return { kind: 'floored', floor: minDp };
  }
  return { kind: 'auto', floor: config.autoColDp };
}

export function allocateColumnWidths(
  columns: MatrixColumnSpec[],
  measuredWidth: number,
  config: MatrixWidthConfig = {}
): AllocatedColumns {
  if (columns.length === 0) {
    return { widths: [], contentWidth: 0, regime: 'fit' };
  }

  const cfg = {
    autoColDp: config.autoColDp ?? AUTO_COL_DP,
    actionsColDp: config.actionsColDp ?? ACTIONS_COL_DP,
    columnMinWidth: config.columnMinWidth,
    columnWidthsByType: config.columnWidthsByType,
  };

  // A non-positive / non-finite viewport can never fit — fall through to
  // intrinsic widths (overflow) and never divide by |growable| = 0.
  const viewport =
    Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : 0;

  const classes = columns.map((spec) => classifyColumn(spec, viewport, cfg));

  // Intrinsic (starting) width per column: fixed at eff, growables at their floor.
  const intrinsic = classes.map((c) => (c.kind === 'fixed' ? c.eff : c.floor));
  const S = intrinsic.reduce((t, n) => t + n, 0);

  const growable = classes
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.kind !== 'fixed')
    .map(({ i }) => i);

  // OVERFLOW, or the all-fixed under-fill (no growable to stretch): each
  // column keeps its intrinsic width, floored to integer dp — NO shrink,
  // NO stretch. The grid sits logical-start; any surplus scrolls / any
  // shortfall is trailing empty space.
  if (viewport === 0 || S > viewport || growable.length === 0) {
    const widths = intrinsic.map((n) => Math.floor(n));
    return {
      widths,
      contentWidth: widths.reduce((t, n) => t + n, 0),
      regime: S > viewport ? 'overflow' : 'fit',
    };
  }

  // FIT with growables — water-fill: distribute the slack EQUALLY across
  // every growable above its floor (single pass — no per-column cap, so
  // one equal split settles; deterministic / order-independent).
  const slack = viewport - S;
  const share = slack / growable.length;
  const growableSet = new Set(growable);

  const targets = classes.map((c, i) => {
    const start = c.kind === 'fixed' ? c.eff : c.floor;
    return growableSet.has(i) ? start + share : start;
  });

  // FLOOR-SAFE largest-remainder residual: floor every column down (never
  // below its integral floor, since target >= floor and floor() is
  // monotonic), then hand the leftover dp to GROWABLE columns only.
  const widths = targets.map((t) => Math.floor(t));
  const target = Math.round(viewport);
  let leftover = target - widths.reduce((t, n) => t + n, 0);

  if (leftover > 0) {
    const order = [...growable].sort((a, b) => {
      const fracA = targets[a]! - Math.floor(targets[a]!);
      const fracB = targets[b]! - Math.floor(targets[b]!);
      if (fracB !== fracA) return fracB - fracA; // descending fractional remainder
      return a - b; // ties: ascending slot index
    });
    // Distribute one dp at a time to growables (cycling if the leftover
    // exceeds the growable count — only reachable with fractional inputs;
    // a +1 only ever RAISES a growable, so no column falls below its floor).
    let idx = 0;
    while (leftover > 0) {
      const k = order[idx % order.length]!;
      widths[k] = (widths[k] ?? 0) + 1;
      idx += 1;
      leftover -= 1;
    }
  }

  return {
    widths,
    contentWidth: widths.reduce((t, n) => t + n, 0),
    regime: 'fit',
  };
}
