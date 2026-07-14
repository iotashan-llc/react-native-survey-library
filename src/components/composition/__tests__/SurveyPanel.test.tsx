/**
 * Task 1.4 — `SurveyPanel`: RN analog of survey-react-ui's `SurveyPanel`
 * (panel.tsx / panel-base.tsx). Composition scope only: header text via
 * the renderLocString seam (1.6 upgrades it), expand/collapse gating via
 * `renderedIsExpanded`, `innerPaddingLeft` on the content box, rows.
 * Panel-level errors are 1.7 question-chrome scope; `afterRender` is
 * banned (0.4 design); wrapper seam is a later task.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { act } from 'react';

import '../../../factories/register-all';
import { Model } from '../../../core/facade';
import type { PanelModel, SurveyModel } from '../../../core/facade';
import { SurveyThemeProvider } from '../../../theme-rn/provider';
import { SurveyPanel } from '../SurveyPanel';

function panelFixture(panelJson: Record<string, unknown>): {
  model: SurveyModel;
  panel: PanelModel;
} {
  const model = new Model({ elements: [panelJson] });
  // `panel.expand()` schedules survey-core's scroll-to-panel timer.
  // Cancelling through onScrollToTop keeps it out of these
  // component-scoped tests — at runtime the 1.2 lifecycle bridge owns
  // this interception (and the facade's environment stub keeps the
  // un-bridged path from touching DOM APIs).
  model.onScrollToTop.add((_, options) => {
    options.cancel = true;
  });
  const panel = model.getPanelByName(panelJson.name as string) as PanelModel;
  return { model, panel };
}

const TWO_ROW_PANEL = {
  type: 'panel',
  name: 'p1',
  title: 'Panel One',
  description: 'A panel description',
  elements: [
    { type: 'empty', name: 'pq1' },
    { type: 'empty', name: 'pq2' },
  ],
};

describe('SurveyPanel — rows', () => {
  it('renders one sv-row per visible row', () => {
    const { model, panel } = panelFixture(TWO_ROW_PANEL);
    render(<SurveyPanel element={panel} survey={model} creator={{}} />);
    expect(screen.getAllByTestId('sv-row')).toHaveLength(2);
  });

  it('renders elements through the row pipeline after row layout', () => {
    const { model, panel } = panelFixture(TWO_ROW_PANEL);
    render(<SurveyPanel element={panel} survey={model} creator={{}} />);
    for (const row of screen.getAllByTestId('sv-row')) {
      fireEvent(row, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 0 } },
      });
    }
    expect(screen.getByTestId('sv-row-element-pq1')).toBeTruthy();
    expect(screen.getByTestId('sv-row-element-pq2')).toBeTruthy();
  });

  it('panel rows use the INNER row variant (marginTop 32 on the non-first row, not the page 16)', () => {
    const { model, panel } = panelFixture(TWO_ROW_PANEL);
    render(<SurveyPanel element={panel} survey={model} creator={{}} />);
    const rows = screen.getAllByTestId('sv-row');
    const secondRow = StyleSheet.flatten(rows[1]!.props.style) as Record<
      string,
      unknown
    >;
    expect(secondRow.marginTop).toBe(32);
  });
});

describe('SurveyPanel — narrow mode (panel-level stacking integration)', () => {
  it('a two-up panel row under the narrow provider stacks to a column with the innerNarrow rowGap 16', () => {
    const { model, panel } = panelFixture({
      type: 'panel',
      name: 'p-narrow',
      elements: [
        { type: 'empty', name: 'nq1' },
        { type: 'empty', name: 'nq2', startWithNewLine: false },
      ],
    });
    render(
      <SurveyThemeProvider narrow>
        <SurveyPanel element={panel} survey={model} creator={{}} />
      </SurveyThemeProvider>
    );
    fireEvent(screen.getAllByTestId('sv-row')[0]!, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 0 } },
    });
    const content = StyleSheet.flatten(
      screen.getByTestId('sv-row-content').props.style
    ) as Record<string, unknown>;
    expect(content.flexDirection).toBe('column');
    expect(content.rowGap).toBe(16);
    expect(content.marginStart).toBeUndefined();
    const element = StyleSheet.flatten(
      screen.getByTestId('sv-row-element-nq1').props.style
    ) as Record<string, unknown>;
    expect(element.flexBasis).toBeUndefined();
    expect(element.paddingStart).toBeUndefined();
  });
});

describe('SurveyPanel — header', () => {
  it('renders the title and description text', () => {
    const { model, panel } = panelFixture(TWO_ROW_PANEL);
    render(<SurveyPanel element={panel} survey={model} creator={{}} />);
    expect(screen.getByText('Panel One')).toBeTruthy();
    expect(screen.getByText('A panel description')).toBeTruthy();
  });

  it('renders no header text when the panel has neither title nor description', () => {
    const { model, panel } = panelFixture({
      type: 'panel',
      name: 'p-bare',
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(<SurveyPanel element={panel} survey={model} creator={{}} />);
    expect(screen.queryByText(/./)).toBeNull();
  });
});

describe('SurveyPanel — expand/collapse (renderedIsExpanded)', () => {
  it('a collapsed panel keeps its header but renders no rows; expanding restores them', () => {
    const { model, panel } = panelFixture({
      ...TWO_ROW_PANEL,
      name: 'p-collapsed',
      state: 'collapsed',
    });
    render(<SurveyPanel element={panel} survey={model} creator={{}} />);
    expect(screen.getByText('Panel One')).toBeTruthy();
    expect(screen.queryAllByTestId('sv-row')).toHaveLength(0);

    act(() => {
      panel.expand();
    });
    expect(screen.getAllByTestId('sv-row')).toHaveLength(2);
  });
});

describe('SurveyPanel — content indent', () => {
  it('innerIndent maps to paddingStart on the content box (core innerPaddingLeft "<n>px")', () => {
    const { model, panel } = panelFixture({
      ...TWO_ROW_PANEL,
      name: 'p-indent',
      innerIndent: 1,
    });
    const expected = parseFloat(
      (panel as unknown as { innerPaddingLeft: string }).innerPaddingLeft
    );
    expect(expected).toBeGreaterThan(0);
    render(<SurveyPanel element={panel} survey={model} creator={{}} />);
    const content = StyleSheet.flatten(
      screen.getByTestId('sv-panel-content').props.style
    ) as Record<string, unknown>;
    expect(content.paddingStart).toBe(expected);
  });
});

describe('SurveyPanel — visibility', () => {
  it('renders null for an invisible panel (defensive: rows never route one here)', () => {
    const { model, panel } = panelFixture({
      ...TWO_ROW_PANEL,
      name: 'p-hidden',
      visible: false,
    });
    const { toJSON } = render(
      <SurveyPanel element={panel} survey={model} creator={{}} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders null when every child element is invisible (upstream getIsContentVisible gate)', () => {
    const { model, panel } = panelFixture({
      type: 'panel',
      name: 'p-empty-content',
      title: 'Panel One',
      elements: [
        { type: 'empty', name: 'h1', visible: false },
        { type: 'empty', name: 'h2', visible: false },
      ],
    });
    const { toJSON } = render(
      <SurveyPanel element={panel} survey={model} creator={{}} />
    );
    expect(toJSON()).toBeNull();
  });
});
