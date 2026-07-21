/**
 * Device-parity coverage (kitchen-sink page 4 "Matrix"): the whole matrix
 * family lives on its own page so the paneldynamic-heavy "Ratings & panels"
 * page (guarded by kitchen-sink-page3.test.tsx) stays balanced. This suite
 * renders the EXACT kitchen-sink model (the serialized twin in
 * parity/kitchen-sink.json) through the full <Survey> shell, navigates to the
 * matrix page, and asserts what the device should show for each family
 * member: the simple single-select matrix (row headers + a tappable tile),
 * the matrixdropdown with its per-row DETAIL-PANEL toggles (detailPanelMode:
 * underRow), the matrixdynamic add-row affordance, and the matrixdynamic
 * empty-state placeholder (hideColumnsIfEmpty + rowCount 0).
 *
 * SCOPE NOTE: jest has no Yoga, so the wide-grid `MatrixGridRoot` never gets a
 * real measured width from its own onLayout — this harness hand-feeds every
 * `sv-row` AND every `matrix-root` a width so the grid materializes its cells.
 * The suite therefore guards the COMPOSITION chain (model -> page -> row ->
 * dispatch -> matrix grid/detail toggle), not native column-width layout
 * (that is pinned by the matrix component + layout suites).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import { ComponentCollection } from '../../core/facade';
import { Survey } from '../Survey';
import type { SurveyRefHandle } from '../Survey';
import '../../factories/register-all';
import kitchenSinkJson from '../../../parity/kitchen-sink.json';

// The kitchen-sink registers two ComponentCollection types in App.tsx
// (example/src/register-components.ts); mirror them here so the WHOLE model
// (the ratings page uses them) builds identically. Removed after the suite —
// the singleton is global.
const KS_COMPONENTS = [
  {
    name: 'ks-custom-slug',
    title: 'URL slug (custom)',
    questionJSON: { type: 'text', placeholder: 'my-survey', title: 'Slug' },
  },
  {
    name: 'ks-composite-fullname',
    title: 'Full name (composite)',
    elementsJSON: [
      { type: 'text', name: 'firstName', title: 'First name' },
      {
        type: 'text',
        name: 'lastName',
        title: 'Last name',
        startWithNewLine: false,
      },
    ],
  },
];

beforeAll(() => {
  for (const def of KS_COMPONENTS) {
    ComponentCollection.Instance.add(def as never);
  }
});

afterAll(() => {
  for (const def of KS_COMPONENTS) {
    ComponentCollection.Instance.remove(def.name);
  }
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function fireLayout(
  nodes: ReturnType<typeof screen.queryAllByTestId>,
  width: number
): void {
  act(() => {
    for (const node of nodes) {
      fireEvent(node, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
      });
    }
  });
}

/**
 * Two layout contracts must be satisfied for the matrix cells to mount:
 *  - SurveyRow defers children one frame until onLayout measures them
 *    (1.3-design D3), and mounting a matrix mounts fresh nested rows.
 *  - The wide-grid `MatrixGridRoot` renders its `MatrixGrid` (headers, tiles,
 *    detail toggles) only once its own `matrix-root` onLayout reports a width,
 *    and that measured-width setState commits on the NEXT microtask.
 * Fire both, flushing between passes, until the row population stabilizes and
 * every matrix grid has measured + committed its content.
 */
async function settleLayout(width = 700): Promise<void> {
  for (let pass = 0; pass < 8; pass++) {
    const before = screen.queryAllByTestId('sv-row').length;
    fireLayout(
      [
        ...screen.queryAllByTestId('sv-row'),
        ...screen.queryAllByTestId('matrix-root'),
      ],
      width
    );
    await flush();
    if (screen.queryAllByTestId('sv-row').length === before) {
      // Rows stable; one more matrix-root pass + flush so the measured-width
      // re-render commits the grid content (headers, tiles, detail toggles).
      fireLayout(screen.queryAllByTestId('matrix-root'), width);
      await flush();
      return;
    }
  }
}

async function renderMatrixPage(): Promise<SurveyRefHandle> {
  const ref = React.createRef<SurveyRefHandle>();
  render(<Survey ref={ref} json={kitchenSinkJson} />);
  await flush();
  const model = ref.current!.model!;
  act(() => {
    model.currentPageNo = 3;
  });
  await flush();
  expect(model.activePage?.name).toBe('matrix');
  await settleLayout();
  return ref.current!;
}

describe('kitchen-sink page 4 — simple single-select matrix `agreement`', () => {
  it('renders the title, the row headers, and a tappable cell tile', async () => {
    await renderMatrixPage();
    expect(screen.getByText(/How much do you agree/)).toBeTruthy();
    // Rows: speed / docs / support (row headers from row.locText).
    expect(screen.getByTestId('matrix-rowheader-speed')).toBeTruthy();
    expect(screen.getByTestId('matrix-rowheader-docs')).toBeTruthy();
    expect(screen.getByTestId('matrix-rowheader-support')).toBeTruthy();
    // A real radio tile (row speed × column value 1).
    expect(screen.getByTestId('matrix-tile-speed-1')).toBeTruthy();
  });
});

describe('kitchen-sink page 4 — matrixdropdown `teams` with detail panels', () => {
  it('renders the title and a per-row detail-panel toggle (detailPanelMode: underRow)', async () => {
    await renderMatrixPage();
    expect(screen.getByText(/Team assessment/)).toBeTruthy();
    // The 3.3b detail-panel affordance: one toggle per static row.
    expect(screen.getByTestId('matrix-detail-toggle-design')).toBeTruthy();
    expect(screen.getByTestId('matrix-detail-toggle-engineering')).toBeTruthy();
  });

  it('pressing a row toggle expands its detail panel (the extra note question)', async () => {
    await renderMatrixPage();
    const toggle = screen.getByTestId('matrix-detail-toggle-design');
    expect(toggle.props.accessibilityState?.expanded).toBe(false);
    fireEvent.press(toggle);
    await flush();
    await settleLayout();
    expect(
      screen.getByTestId('matrix-detail-toggle-design').props.accessibilityState
        ?.expanded
    ).toBe(true);
    // The detail panel body (the `notes` template question) materializes.
    expect(screen.getByText(/Notes/)).toBeTruthy();
  });
});

describe('kitchen-sink page 4 — matrixdynamic `milestonesPlan`', () => {
  it('renders the title and the add-row affordance (rowCount 2 < maxRowCount 4)', async () => {
    await renderMatrixPage();
    expect(screen.getByText(/Release milestones/)).toBeTruthy();
    expect(screen.getByTestId('matrixdynamic-add-bottom')).toBeTruthy();
  });
});

describe('kitchen-sink page 4 — matrixdynamic empty state `openIssues`', () => {
  it('renders the noRowsText placeholder (hideColumnsIfEmpty + rowCount 0)', async () => {
    await renderMatrixPage();
    expect(screen.getByTestId('matrixdynamic-placeholder')).toBeTruthy();
    expect(screen.getByText(/No issues filed yet/)).toBeTruthy();
  });
});
