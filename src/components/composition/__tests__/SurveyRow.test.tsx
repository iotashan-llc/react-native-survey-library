/**
 * Task 1.4 — `SurveyRow`: maps `QuestionRowModel.visibleElements` to a
 * flex row, owning the onLayout -> width-resolver wiring (1.3 design:
 * "1.4 wires onLayout → resolver → child styles", D3's one-frame defer,
 * D4's percentBase rule via `resolveRowWidths`) and the DOM gutter
 * geometry (outer measured View = un-widened rowWidth; inner stretched
 * View carries `marginStart: -g`, so it widens to rowWidth + g exactly
 * like the DOM's `width: calc(100% + g)`).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PixelRatio, StyleSheet } from 'react-native';
import { act } from 'react';

import '../../../factories/register-all';
import { Model } from '../../../core/facade';
import type { SurveyModel } from '../../../core/facade';
import { SurveyThemeProvider } from '../../../theme-rn/provider';
import { SurveyRow } from '../SurveyRow';

interface RowModelLike {
  visibleElements: ReadonlyArray<object>;
}

function firstRow(json: Record<string, unknown>): {
  model: SurveyModel;
  row: RowModelLike;
} {
  const model = new Model(json);
  const page = model.currentPage as unknown as {
    visibleRows: RowModelLike[];
  };
  return { model, row: page.visibleRows[0]! };
}

function layoutRow(width: number): void {
  fireEvent(screen.getByTestId('sv-row'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
  });
}

function flat(id: string): Record<string, unknown> {
  return StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<
    string,
    unknown
  >;
}

const round = (dp: number) => PixelRatio.roundToNearestPixel(dp);

const THREE_UP = {
  elements: [
    { type: 'empty', name: 'q1' },
    { type: 'empty', name: 'q2', startWithNewLine: false },
    { type: 'empty', name: 'q3', startWithNewLine: false },
  ],
};

describe('SurveyRow — one-frame defer (1.3 design D3)', () => {
  it('renders the row container but NO elements before the first onLayout', () => {
    const { model, row } = firstRow(THREE_UP);
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    expect(screen.getByTestId('sv-row')).toBeTruthy();
    expect(screen.queryByTestId('sv-row-element-q1')).toBeNull();
  });

  it('renders all visible elements after onLayout', () => {
    const { model, row } = firstRow(THREE_UP);
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    expect(screen.getByTestId('sv-row-element-q1')).toBeTruthy();
    expect(screen.getByTestId('sv-row-element-q2')).toBeTruthy();
    expect(screen.getByTestId('sv-row-element-q3')).toBeTruthy();
  });
});

describe('SurveyRow — percentBase rule (resolveRowWidths ownership)', () => {
  it('multi-element page row at 800: % resolves against 816 (rowWidth + page gutter 16) -> equal thirds of 816', () => {
    const { model, row } = firstRow(THREE_UP);
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    const expected = round(816 * 0.33333333);
    expect(flat('sv-row-element-q1').flexBasis).toBe(expected);
    expect(flat('sv-row-element-q2').flexBasis).toBe(expected);
    expect(flat('sv-row-element-q3').flexBasis).toBe(expected);
    // multi-row wrappers carry the gutter as paddingStart
    expect(flat('sv-row-element-q1').paddingStart).toBe(16);
  });

  it('single-element row at 800: % resolves against the bare rowWidth (flexBasis 800, no gutter padding)', () => {
    const { model, row } = firstRow({
      elements: [{ type: 'empty', name: 'solo' }],
    });
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    const style = flat('sv-row-element-solo');
    expect(style.flexBasis).toBe(round(800));
    expect(style.paddingStart).toBeUndefined();
  });
});

describe('SurveyRow — geometry fragments', () => {
  it('multi row: inner content View wraps and carries marginStart -16 (page gutter technique) + rowGap 16', () => {
    const { model, row } = firstRow(THREE_UP);
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    const inner = flat('sv-row-content');
    expect(inner.flexWrap).toBe('wrap');
    expect(inner.marginStart).toBe(-16);
    expect(inner.rowGap).toBe(16);
  });

  it('single row: no wrap, no negative margin', () => {
    const { model, row } = firstRow({
      elements: [{ type: 'empty', name: 'solo' }],
    });
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    const inner = flat('sv-row-content');
    expect(inner.flexWrap).toBeUndefined();
    expect(inner.marginStart).toBeUndefined();
  });

  it('row rhythm: index 0 -> marginTop 0 (first-of-type); index 1 -> page marginTop 16', () => {
    const { model, row } = firstRow(THREE_UP);
    const first = render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    expect(flat('sv-row').marginTop).toBe(0);
    first.unmount();
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={1} />
    );
    expect(flat('sv-row').marginTop).toBe(16);
  });
});

describe('SurveyRow — reactive contract: every rootStyle-recalculating path (1.3 review consumer invariant 2)', () => {
  it('visibility toggle: hiding an element collapses the row to single-element geometry (percentBase drops the gutter), showing restores it', () => {
    const { model, row } = firstRow({
      elements: [
        { type: 'empty', name: 'va' },
        { type: 'empty', name: 'vb', startWithNewLine: false },
      ],
    });
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    // two-up: equal split of 816
    expect(flat('sv-row-element-va').flexBasis).toBe(round(816 / 2));

    act(() => {
      (model.getQuestionByName('vb') as { visible: boolean }).visible = false;
    });
    // solo: 100% of the bare 800, gutter padding gone
    expect(screen.queryByTestId('sv-row-element-vb')).toBeNull();
    expect(flat('sv-row-element-va').flexBasis).toBe(round(800));
    expect(flat('sv-row-element-va').paddingStart).toBeUndefined();

    act(() => {
      (model.getQuestionByName('vb') as { visible: boolean }).visible = true;
    });
    expect(flat('sv-row-element-va').flexBasis).toBe(round(816 / 2));
    expect(flat('sv-row-element-vb').flexBasis).toBe(round(816 / 2));
  });

  it('grid-column mutation: changing colSpan under gridLayoutEnabled re-renders with the recomputed grid basis', () => {
    const { model, row } = firstRow({
      gridLayoutEnabled: true,
      elements: [
        { type: 'empty', name: 'g1' },
        { type: 'empty', name: 'g2', startWithNewLine: false, colSpan: 2 },
      ],
    });
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    const before = flat('sv-row-element-g2').flexBasis as number;
    // g2 spans 2 of 3 columns -> ~2/3 of 816
    expect(before).toBeGreaterThan(
      flat('sv-row-element-g1').flexBasis as number
    );

    act(() => {
      (model.getQuestionByName('g2') as { colSpan: number }).colSpan = 1;
    });
    const after = flat('sv-row-element-g2').flexBasis as number;
    expect(after).not.toBe(before);
    // both span 1 -> equal grid cells
    expect(after).toBe(flat('sv-row-element-g1').flexBasis as number);
  });

  it('element removal: deleting one element of a two-up row re-splits the survivor to the full bare width', () => {
    const { model, row } = firstRow({
      elements: [
        { type: 'empty', name: 'ra' },
        { type: 'empty', name: 'rb', startWithNewLine: false },
      ],
    });
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    expect(flat('sv-row-element-ra').flexBasis).toBe(round(816 / 2));

    act(() => {
      const rb = model.getQuestionByName('rb');
      model.currentPage.removeElement(rb as never);
    });
    expect(screen.queryByTestId('sv-row-element-rb')).toBeNull();
    expect(flat('sv-row-element-ra').flexBasis).toBe(round(800));
    expect(flat('sv-row-element-ra').paddingStart).toBeUndefined();
  });

  it('container width change: a later onLayout with a new width re-resolves against the new percentBase', () => {
    const { model, row } = firstRow(THREE_UP);
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    expect(flat('sv-row-element-q1').flexBasis).toBe(round(816 * 0.33333333));

    layoutRow(1000);
    expect(flat('sv-row-element-q1').flexBasis).toBe(round(1016 * 0.33333333));
  });
});

describe('SurveyRow — four-context gutter table (1.3 design, review round 1)', () => {
  it('compact page row: % resolves against rowWidth + --sd-base-padding (40), inner metrics replace the page ones', () => {
    const { model, row } = firstRow({
      elements: [
        { type: 'empty', name: 'ca' },
        { type: 'empty', name: 'cb', startWithNewLine: false },
      ],
    });
    (model as unknown as { isCompact: boolean }).isCompact = true;
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    const content = flat('sv-row-content');
    expect(content.marginStart).toBe(-40);
    expect(flat('sv-row-element-ca').flexBasis).toBe(round(840 / 2));
    expect(flat('sv-row-element-cb').paddingStart).toBe(40);
  });

  it('panel-as-page row (singlePage mode): keeps the PAGE gutter 16 (showPanelAsPage, `.sd-panel--as-page` exemption from the inner rule)', () => {
    const model = new Model({
      pages: [
        {
          name: 'pg1',
          elements: [
            { type: 'empty', name: 'sa' },
            { type: 'empty', name: 'sb', startWithNewLine: false },
          ],
        },
        { name: 'pg2', elements: [{ type: 'empty', name: 'sc' }] },
      ],
    });
    model.questionsOnPageMode = 'singlePage';
    const single = model.visiblePages[0] as unknown as {
      visibleRows: Array<{ visibleElements: ReadonlyArray<object> }>;
    };
    const asPagePanel = single.visibleRows[0]!.visibleElements[0] as {
      showPanelAsPage?: boolean;
      visibleRows: RowModelLike[];
    };
    expect(asPagePanel.showPanelAsPage).toBe(true);
    const row = asPagePanel.visibleRows[0]!;
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    const content = flat('sv-row-content');
    expect(content.marginStart).toBe(-16);
    expect(flat('sv-row-element-sa').flexBasis).toBe(round(816 / 2));
    expect(flat('sv-row-element-sb').paddingStart).toBe(16);
  });
});

function nestedPanelRow(): { model: SurveyModel; row: RowModelLike } {
  const model = new Model({
    elements: [
      {
        type: 'panel',
        name: 'np',
        elements: [
          { type: 'empty', name: 'na' },
          { type: 'empty', name: 'nb', startWithNewLine: false },
        ],
      },
    ],
  });
  const panel = model.getPanelByName('np') as unknown as {
    visibleRows: RowModelLike[];
  };
  return { model, row: panel.visibleRows[0]! };
}

describe('SurveyRow — nested-panel gutter context (four-context table, fourth row)', () => {
  it('panel-inner two-up at 800: content marginStart -40, elements paddingStart 40, % base rowWidth + 40 (--sd-base-padding)', () => {
    const { model, row } = nestedPanelRow();
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    const content = flat('sv-row-content');
    expect(content.marginStart).toBe(-40);
    expect(flat('sv-row-element-na').flexBasis).toBe(round(840 / 2));
    expect(flat('sv-row-element-nb').flexBasis).toBe(round(840 / 2));
    expect(flat('sv-row-element-na').paddingStart).toBe(40);
    expect(flat('sv-row-element-nb').paddingStart).toBe(40);
  });
});

describe('SurveyRow — narrow mode STACKS multi-element rows (select-time collapse)', () => {
  it('page two-up under narrow: content collapses to a column (rowGap 16, no negative margin, no wrap); children are full-width (no resolver basis, no gutter padding)', () => {
    const { model, row } = firstRow(THREE_UP);
    render(
      <SurveyThemeProvider narrow>
        <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
      </SurveyThemeProvider>
    );
    layoutRow(360);
    const content = flat('sv-row-content');
    expect(content.flexDirection).toBe('column');
    expect(content.marginStart).toBeUndefined();
    expect(content.flexWrap).toBeUndefined();
    expect(content.rowGap).toBe(16);
    for (const name of ['q1', 'q2', 'q3']) {
      const style = flat(`sv-row-element-${name}`);
      expect(style.flexBasis).toBeUndefined();
      expect(style.flexGrow).toBeUndefined();
      expect(style.paddingStart).toBeUndefined();
    }
  });

  it('nested-panel two-up under narrow: innerNarrow stacking (column, rowGap 16, no gutter geometry)', () => {
    const { model, row } = nestedPanelRow();
    render(
      <SurveyThemeProvider narrow>
        <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
      </SurveyThemeProvider>
    );
    layoutRow(360);
    const content = flat('sv-row-content');
    expect(content.flexDirection).toBe('column');
    expect(content.marginStart).toBeUndefined();
    expect(content.rowGap).toBe(16);
    expect(flat('sv-row-element-na').flexBasis).toBeUndefined();
    expect(flat('sv-row-element-nb').paddingStart).toBeUndefined();
  });

  it('single-element row under narrow still resolves numerically (full-width basis from the resolver)', () => {
    const { model, row } = firstRow({
      elements: [{ type: 'empty', name: 'solo' }],
    });
    render(
      <SurveyThemeProvider narrow>
        <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
      </SurveyThemeProvider>
    );
    layoutRow(360);
    expect(flat('sv-row-element-solo').flexBasis).toBe(round(360));
  });
});

describe('SurveyRow — header-adjacent first-row spacing (sd-row.scss `.sd-page__title/.sd-page__description ~`)', () => {
  it('afterHeader + index 0 on a non-compact page row: marginTop calcSize(3)=24 (beats first-of-type zeroing)', () => {
    const { model, row } = firstRow(THREE_UP);
    render(
      <SurveyRow
        row={row as never}
        survey={model}
        creator={{}}
        index={0}
        afterHeader
      />
    );
    expect(flat('sv-row').marginTop).toBe(24);
  });

  it('afterHeader + index 0 on a COMPACT page row: keeps --sd-base-vertical-padding 32 (the `~ .sd-page__row.sd-row--compact` rule)', () => {
    const { model, row } = firstRow(THREE_UP);
    (model as unknown as { isCompact: boolean }).isCompact = true;
    render(
      <SurveyRow
        row={row as never}
        survey={model}
        creator={{}}
        index={0}
        afterHeader
      />
    );
    expect(flat('sv-row').marginTop).toBe(32);
  });

  it('afterHeader does NOT change non-first rows (row-follows-row rhythm wins, calcSize(2)=16)', () => {
    const { model, row } = firstRow(THREE_UP);
    render(
      <SurveyRow
        row={row as never}
        survey={model}
        creator={{}}
        index={1}
        afterHeader
      />
    );
    expect(flat('sv-row').marginTop).toBe(16);
  });
});

describe('SurveyRow — content box owns the row main axis (kitchen-sink page-3 device parity)', () => {
  /**
   * Device-verified regression (iPad sim, kitchen-sink page 3): the row
   * View is `flexDirection: 'row'`, so the content box's
   * `alignSelf: 'stretch'` only stretches the CROSS axis (height) — on
   * the MAIN axis Yoga sizes an auto-width content box by fit-content,
   * shrinking children to their resolved `minWidth` during the measure.
   * Question wrappers carry `minWidth` 300 and stay visible (squeezed);
   * panel/paneldynamic wrappers have model `minWidth: "auto"` (no
   * resolved minWidth) and collapse to WIDTH 0 — their nested SurveyRows
   * then measure `onLayout` w=0, the `width > 0` defer gate never opens,
   * and the panel body stays blank forever (observed live: inner rows
   * `answeredSummary,ageNextYear` and `model,os` logged w=0 and
   * deadlocked in DEFER). The content box must therefore claim the row's
   * full main-axis width via `flexGrow: 1` — NOT `width: '100%'`, which
   * would pin the multi-row negative-margin widening (see the component
   * doc: content must widen to rowWidth + gutter).
   */
  const PANEL_IN_ROW = {
    elements: [
      {
        type: 'panel',
        name: 'scores',
        title: 'Computed',
        elements: [
          { type: 'expression', name: 'sum' },
          { type: 'expression', name: 'sum2', startWithNewLine: false },
        ],
      },
    ],
  };

  function layoutAllRows(width: number): void {
    act(() => {
      for (const rowView of screen.getAllByTestId('sv-row')) {
        fireEvent(rowView, 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
        });
      }
    });
  }

  it('every non-stacked content box (page row AND nested panel row) carries flexGrow 1 and no explicit width', () => {
    const { model, row } = firstRow(PANEL_IN_ROW);
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    // Page row measures -> panel renders -> nested row mounts (deferred).
    layoutAllRows(1032);
    // Nested row measures -> nested content box renders.
    layoutAllRows(1032);
    const contents = screen.getAllByTestId('sv-row-content');
    expect(contents.length).toBe(2); // page row + panel-inner row
    for (const content of contents) {
      const style = StyleSheet.flatten(content.props.style) as Record<
        string,
        unknown
      >;
      expect(style.flexGrow).toBe(1);
      expect(style.width).toBeUndefined();
    }
  });

  it('narrow (stacked) content boxes keep the main-axis claim too', () => {
    const { model, row } = firstRow(THREE_UP);
    render(
      <SurveyThemeProvider narrow>
        <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
      </SurveyThemeProvider>
    );
    layoutRow(360);
    const style = flat('sv-row-content');
    expect(style.flexGrow).toBe(1);
    expect(style.width).toBeUndefined();
  });
});

describe('SurveyRow — live width reactivity (1.3 design: integration test)', () => {
  it('mutating question.width re-renders the affected elements with fresh resolver numbers', () => {
    const { model, row } = firstRow({
      elements: [
        { type: 'empty', name: 'qa', width: '300px' },
        { type: 'empty', name: 'qb', startWithNewLine: false },
      ],
    });
    render(
      <SurveyRow row={row as never} survey={model} creator={{}} index={0} />
    );
    layoutRow(800);
    // qa preset 300px; qb calc(100% - 300px) of 816 -> 516
    expect(flat('sv-row-element-qa').flexBasis).toBe(round(300));
    expect(flat('sv-row-element-qb').flexBasis).toBe(round(816 - 300));

    act(() => {
      (model.getQuestionByName('qa') as { width: string }).width = '400px';
    });
    expect(flat('sv-row-element-qa').flexBasis).toBe(round(400));
    expect(flat('sv-row-element-qb').flexBasis).toBe(round(816 - 400));
  });
});
