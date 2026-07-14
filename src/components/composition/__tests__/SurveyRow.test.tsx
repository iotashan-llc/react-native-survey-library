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
