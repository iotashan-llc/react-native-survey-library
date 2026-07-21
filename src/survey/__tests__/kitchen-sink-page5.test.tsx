/**
 * Device-parity coverage (kitchen-sink page 5 "HTML & graceful fallback"):
 * renders the EXACT kitchen-sink model (parity/kitchen-sink.json) through the
 * full <Survey> shell, navigates to the fallback page, and asserts:
 *  - the `ranking` question (task 4.1) now renders as a SUPPORTED question —
 *    its rows + move controls, NOT the unsupported fallback (default mode),
 *  - a second `ranking` in selectToRank mode renders its two-area layout,
 *  - a genuinely still-unsupported type (`slider`, M4 task 4.4) renders the
 *    NON-THROWING fallback panel (invariant 9) — so the graceful-fallback
 *    demo survives ranking becoming supported.
 *
 * SCOPE NOTE: jest has no Yoga; SurveyRow defers children one frame until
 * onLayout measures the row (1.3-design D3). This harness hand-feeds every
 * `sv-row` a width so the row children mount, then guards the COMPOSITION
 * chain (model -> page -> row -> dispatch), not native layout.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import { ComponentCollection } from '../../core/facade';
import { Survey } from '../Survey';
import type { SurveyRefHandle } from '../Survey';
import '../../factories/register-all';
import kitchenSinkJson from '../../../parity/kitchen-sink.json';

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

async function settleLayout(width = 700): Promise<void> {
  for (let pass = 0; pass < 8; pass++) {
    const rows = screen.queryAllByTestId('sv-row');
    const before = rows.length;
    act(() => {
      for (const node of rows) {
        fireEvent(node, 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
        });
      }
    });
    await flush();
    if (screen.queryAllByTestId('sv-row').length === before) return;
  }
}

async function renderFallbackPage(): Promise<SurveyRefHandle> {
  const ref = React.createRef<SurveyRefHandle>();
  render(<Survey ref={ref} json={kitchenSinkJson} />);
  await flush();
  const model = ref.current!.model!;
  act(() => {
    model.currentPageNo = 4;
  });
  await flush();
  expect(model.activePage?.name).toBe('fallback');
  await settleLayout();
  return ref.current!;
}

describe('kitchen-sink page 5 — ranking is supported (default mode)', () => {
  it('renders the ranking rows + move controls, never the unsupported fallback', async () => {
    await renderFallbackPage();
    expect(screen.getByTestId('sv-ranking-priorities')).toBeTruthy();
    expect(screen.getByText('Performance')).toBeTruthy();
    expect(screen.getByText('Developer experience')).toBeTruthy();
    // The accessible reorder affordance is present (Layer 1).
    expect(screen.getByTestId('sv-ranking-movedown-priorities-0')).toBeTruthy();
  });
});

describe('kitchen-sink page 5 — ranking selectToRank two-area mode', () => {
  it('renders the unranked area with all choices (none ranked initially)', async () => {
    await renderFallbackPage();
    expect(
      screen.getByTestId('sv-ranking-selecttorank-featureShortlist')
    ).toBeTruthy();
    expect(
      screen.getByTestId('sv-ranking-unranked-featureShortlist-Dark theme')
    ).toBeTruthy();
    expect(
      screen.getByTestId('sv-ranking-select-featureShortlist-Offline mode')
    ).toBeTruthy();
  });
});

describe('kitchen-sink page 5 — a genuinely unsupported type still falls back', () => {
  it('the slider question renders the NON-THROWING fallback panel', async () => {
    await renderFallbackPage();
    expect(screen.getByTestId('unsupported-question-panel')).toBeTruthy();
  });
});
