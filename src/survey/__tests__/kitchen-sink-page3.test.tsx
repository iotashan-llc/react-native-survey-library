/**
 * Device-parity regression (kitchen-sink page 3 "Ratings & panels"): on the
 * iPad simulator the static panel `scores` (two `expression` questions) and
 * the `paneldynamic` `devices` question rendered nothing/number-only after
 * the `imagepicker`. This suite renders the EXACT kitchen-sink model (the
 * serialized twin in parity/kitchen-sink.json) through the full <Survey>
 * shell, navigates to page 3, and asserts what the device should show:
 * panel title + expression values, paneldynamic title + panel body (Model/
 * OS inputs) + the add button.
 *
 * SCOPE NOTE: jest has no Yoga, so `layoutRowsUntilStable` hand-feeds every
 * row a real width — this suite therefore guards the COMPOSITION chain
 * (model -> page -> row -> dispatch -> question/panel bodies), not native
 * layout. The actual device bug behind this page (the row content box
 * fit-content collapse that zeroed panel/paneldynamic wrappers and
 * deadlocked the nested-row defer gate) is pinned by the style-contract
 * test in SurveyRow.test.tsx ("content box owns the row main axis") — a
 * width this harness fires unconditionally could never observe it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import { ComponentCollection } from '../../core/facade';
import { Survey } from '../Survey';
import type { SurveyRefHandle } from '../Survey';
import '../../factories/register-all';
import kitchenSinkJson from '../../../parity/kitchen-sink.json';

// The kitchen-sink registers two ComponentCollection types in App.tsx
// (example/src/register-components.ts); mirror them here so the model
// builds identically. Removed after the suite — the singleton is global.
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

/**
 * Rows defer children one frame until onLayout measures them (SurveyRow,
 * 1.3-design D3) — and rendering a row's children can MOUNT NEW nested
 * rows (panel content, paneldynamic item panels). Fire layouts until the
 * row population stabilizes.
 */
function layoutRowsUntilStable(width = 700): void {
  for (let pass = 0; pass < 10; pass++) {
    const rows = screen.queryAllByTestId('sv-row');
    act(() => {
      for (const row of rows) {
        fireEvent(row, 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
        });
      }
    });
    if (screen.queryAllByTestId('sv-row').length === rows.length) return;
  }
}

async function renderPage3(): Promise<SurveyRefHandle> {
  const ref = React.createRef<SurveyRefHandle>();
  render(<Survey ref={ref} json={kitchenSinkJson} />);
  await flush();
  const model = ref.current!.model!;
  act(() => {
    model.currentPageNo = 2;
  });
  await flush();
  expect(model.activePage?.name).toBe('ratings');
  layoutRowsUntilStable();
  return ref.current!;
}

describe('kitchen-sink page 3 — static panel `scores` (expression questions)', () => {
  it('renders the panel title and both expression values', async () => {
    await renderPage3();
    // Panel shell + header title.
    expect(screen.getByTestId('sv-panel-scores')).toBeTruthy();
    expect(screen.getByText(/Computed \(expression\)/)).toBeTruthy();
    // Both expression questions render their computed values (fullName and
    // age are empty -> 'anonymous' / 0 per the iif expressions).
    expect(screen.getByTestId('sv-expression-answeredSummary')).toBeTruthy();
    expect(screen.getByTestId('sv-expression-ageNextYear')).toBeTruthy();
    expect(screen.getByText('anonymous')).toBeTruthy();
  });
});

describe('kitchen-sink page 3 — paneldynamic `devices`', () => {
  it('renders the title, the panel body (Model/OS inputs), and the add button', async () => {
    await renderPage3();
    // Chrome title text (not just the question number).
    expect(screen.getByText(/Test devices \(paneldynamic/)).toBeTruthy();
    // LIST body: one rendered panel (panelCount: 1) with the two template
    // text inputs.
    expect(screen.getByTestId('paneldynamic-list')).toBeTruthy();
    expect(screen.getAllByTestId('model-input')).toHaveLength(1);
    expect(screen.getAllByTestId('os-input')).toHaveLength(1);
    // Add affordance (panelCount 1 < maxPanelCount 3).
    expect(screen.getByTestId('paneldynamic-add')).toBeTruthy();
  });
});
