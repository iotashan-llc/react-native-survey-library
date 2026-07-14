/**
 * Live-model integration tests (design: docs/design/1.3-width-resolver.md,
 * test plan #3, #4) — locks the "verified upstream facts" as regressions
 * against the INSTALLED survey-core through the facade, headless:
 * rootStyle is the single binding point and its width math runs
 * synchronously at model construction (no DOM, no render pass, no
 * enableOnElementRerenderedEvent).
 */
import { SurveyModel } from '../../core/facade';
import type { Question, QuestionRowModel } from '../../core/facade';
import { resolveRowWidths, resolveWidthStyle } from '../width-resolver';

const q = (survey: SurveyModel, name: string): Question =>
  survey.getQuestionByName(name) as Question;
const firstRow = (survey: SurveyModel): QuestionRowModel =>
  survey.pages[0]!.rows[0]!;

describe('equal-split row (no user widths)', () => {
  it('resolves 3-up 33.333333% renderWidths to numeric thirds', () => {
    const survey = new SurveyModel({
      elements: [
        { type: 'text', name: 'q1' },
        { type: 'text', name: 'q2', startWithNewLine: false },
        { type: 'text', name: 'q3', startWithNewLine: false },
      ],
    });
    // synchronous availability — straight off the constructor
    expect((q(survey, 'q1') as any).renderWidth).toBe('33.333333%');

    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 784,
      gutter: 16,
    });
    expect(res.isMultiple).toBe(true);
    expect(res.percentBase).toBe(800);
    for (const entry of res.elements) {
      expect(entry.diagnostics).toEqual([]);
      expect(entry.style.flexGrow).toBe(1);
      expect(entry.style.flexShrink).toBe(1);
      expect(entry.style.flexBasis).toBeCloseTo(266.666664, 4);
      // default minWidth "min(100%, 300px)" — 300px wins at base 800
      expect(entry.style.minWidth).toBe(300);
      expect(entry.style.maxWidth).toBe(800);
    }
  });
});

describe('mixed-width row (px + calc + %)', () => {
  it('resolves the calc(100% - 300px - 20%) shape core emits', () => {
    const survey = new SurveyModel({
      elements: [
        { type: 'text', name: 'a', width: '300px' },
        { type: 'text', name: 'b', startWithNewLine: false },
        { type: 'text', name: 'c', startWithNewLine: false, width: '20%' },
      ],
    });
    expect((q(survey, 'b') as any).renderWidth).toBe(
      'calc(100% - 300px - 20%)'
    );

    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 800,
      gutter: 0,
    });
    const [a, b, c] = res.elements;
    expect(a?.style.flexBasis).toBe(300);
    expect(b?.style.flexBasis).toBe(340); // 800 - 300 - 160
    expect(c?.style.flexBasis).toBe(160);
    expect(res.elements.flatMap((e) => e.diagnostics)).toEqual([]);
  });
});

describe('grid layout (gridLayoutEnabled + colSpan)', () => {
  it('resolves the grid-branch rootStyle (flexShrink 0, no minWidth)', () => {
    const survey = new SurveyModel({
      gridLayoutEnabled: true,
      elements: [
        { type: 'text', name: 'g1' },
        { type: 'text', name: 'g2', startWithNewLine: false, colSpan: 2 },
      ],
    });
    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 600,
      gutter: 0,
    });
    const [g1, g2] = res.elements;
    // columns: 3 × 33.33% → g1 spans 1, g2 spans 2
    expect(g1?.style).toEqual({
      flexGrow: 1,
      flexShrink: 0,
      flexBasis: 199.98,
      maxWidth: 600,
    });
    expect(g2?.style.flexBasis).toBeCloseTo(399.96, 6);
    expect(g2?.style.flexShrink).toBe(0);
    expect('minWidth' in (g1?.style ?? {})).toBe(false);
    // core wrote effectiveColSpan as a side effect of the rootStyle calc
    expect((q(survey, 'g2') as any).effectiveColSpan).toBe(2);
  });
});

describe('user width passthrough edge cases', () => {
  it('bare-number width "250" arrives px-suffixed and resolves to 250', () => {
    const survey = new SurveyModel({
      elements: [
        { type: 'text', name: 'n1', width: '250' },
        { type: 'text', name: 'n2', startWithNewLine: false },
      ],
    });
    expect((q(survey, 'n1') as any).renderWidth).toBe('250px');
    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 800,
      gutter: 0,
    });
    expect(res.elements[0]?.style.flexBasis).toBe(250);
  });

  it('signed and exponent-form numeric widths (Helpers.isNumber accepts them) resolve', () => {
    const survey = new SurveyModel({
      elements: [
        { type: 'text', name: 'p1', width: '+10' },
        { type: 'text', name: 'p2', startWithNewLine: false, width: '1e2' },
        { type: 'text', name: 'p3', startWithNewLine: false },
      ],
    });
    expect((q(survey, 'p1') as any).renderWidth).toBe('+10px');
    expect((q(survey, 'p2') as any).renderWidth).toBe('1e2px');
    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 800,
      gutter: 0,
    });
    expect(res.elements[0]?.style.flexBasis).toBe(10);
    expect(res.elements[1]?.style.flexBasis).toBe(100);
    // the unsized sibling's calc folds both forms in
    expect((q(survey, 'p3') as any).renderWidth).toBe(
      'calc(100% - +10px - 1e2px)'
    );
    expect(res.elements[2]?.style.flexBasis).toBe(690);
    expect(res.elements.flatMap((e) => e.diagnostics)).toEqual([]);
  });

  it('hex-form width "0x10" emits "0x10px" → classified degradation', () => {
    const survey = new SurveyModel({
      elements: [
        { type: 'text', name: 'h1', width: '0x10' },
        { type: 'text', name: 'h2', startWithNewLine: false },
      ],
    });
    expect((q(survey, 'h1') as any).renderWidth).toBe('0x10px');
    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 800,
      gutter: 0,
    });
    expect('flexBasis' in (res.elements[0]?.style ?? {})).toBe(false);
    expect(res.elements[0]?.diagnostics[0]?.code).toBe(
      'layout/unsupported-width-unit'
    );
  });

  it('garbage width passes through core verbatim → diagnostic + dropped basis', () => {
    const survey = new SurveyModel({
      elements: [
        { type: 'text', name: 'n1', width: 'banana' },
        { type: 'text', name: 'n2', startWithNewLine: false },
      ],
    });
    expect((q(survey, 'n1') as any).renderWidth).toBe('banana');
    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 800,
      gutter: 0,
    });
    const bad = res.elements[0]!;
    expect('flexBasis' in bad.style).toBe(false);
    // siblings kept: default min/max still resolve
    expect(bad.style.minWidth).toBe(300);
    expect(bad.diagnostics).toHaveLength(1);
    expect(bad.diagnostics[0]).toMatchObject({
      code: 'layout/invalid-width',
      property: 'flexBasis',
      value: 'banana',
    });
    // upstream folds the garbage into the sibling's calc — it degrades
    // to a dropped basis there too, never a throw
    const sibling = res.elements[1]!;
    expect((q(survey, 'n2') as any).renderWidth).toBe('calc(100% - banana)');
    expect('flexBasis' in sibling.style).toBe(false);
    expect(sibling.diagnostics[0]?.code).toBe('layout/invalid-width');
  });
});

describe('single-element row', () => {
  it('resolves 100% against the bare row width (no gutter)', () => {
    const survey = new SurveyModel({
      elements: [{ type: 'text', name: 's1' }],
    });
    expect((q(survey, 's1') as any).renderWidth).toBe('100%');
    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 390,
      gutter: 16,
    });
    expect(res.isMultiple).toBe(false);
    expect(res.percentBase).toBe(390);
    expect(res.elements[0]?.style.flexBasis).toBe(390);
    // min(100%, 300px) at 390dp: 300px still wins
    expect(res.elements[0]?.style.minWidth).toBe(300);
    // narrow phone: min(100%, 300px) at 250dp clamps to the container
    const narrow = resolveWidthStyle((q(survey, 's1') as any).rootStyle, {
      percentBase: 250,
    });
    expect(narrow.style.minWidth).toBe(250);
  });
});

describe('rootStyle invalidation surface — headless mutations (design: "1.4 consumer contract")', () => {
  // rootStyle is NOT construction-only. These lock the mutation paths
  // the 1.4 row consumer must observe; each re-resolves synchronously.
  const twoUp = () =>
    new SurveyModel({
      elements: [
        { type: 'text', name: 'm1' },
        { type: 'text', name: 'm2', startWithNewLine: false },
      ],
    });

  it('width change re-runs the whole row math', () => {
    const survey = twoUp();
    expect((q(survey, 'm1') as any).renderWidth).toBe('50%');
    (q(survey, 'm1') as any).width = '300px';
    expect((q(survey, 'm1') as any).renderWidth).toBe('300px');
    expect((q(survey, 'm2') as any).renderWidth).toBe('calc(100% - 300px)');
    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 800,
      gutter: 0,
    });
    expect(res.elements[0]?.style.flexBasis).toBe(300);
    expect(res.elements[1]?.style.flexBasis).toBe(500);
  });

  it('visibility change rebuilds visibleElements and re-splits', () => {
    const survey = new SurveyModel({
      elements: [
        { type: 'text', name: 'v1' },
        { type: 'text', name: 'v2', startWithNewLine: false },
        { type: 'text', name: 'v3', startWithNewLine: false },
      ],
    });
    expect((q(survey, 'v1') as any).renderWidth).toBe('33.333333%');
    q(survey, 'v2').visible = false;
    expect((q(survey, 'v1') as any).renderWidth).toBe('50%');
    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 800,
      gutter: 0,
    });
    expect(res.elements).toHaveLength(2); // visibleElements dropped v2
    expect(res.elements[0]?.style.flexBasis).toBe(400);
  });

  it('element removal re-splits the survivors', () => {
    const survey = twoUp();
    survey.pages[0]!.removeElement(q(survey, 'm2'));
    expect((q(survey, 'm1') as any).renderWidth).toBe('100%');
    const res = resolveRowWidths(firstRow(survey), {
      rowWidth: 800,
      gutter: 0,
    });
    expect(res.isMultiple).toBe(false);
    expect(res.elements).toHaveLength(1);
  });

  it('grid column width mutation recalculates rootStyle recursively', () => {
    const survey = new SurveyModel({
      gridLayoutEnabled: true,
      elements: [
        { type: 'text', name: 'g1' },
        { type: 'text', name: 'g2', startWithNewLine: false },
      ],
    });
    const page: any = survey.pages[0];
    // trigger column generation, then mutate a column width
    expect(
      resolveRowWidths(firstRow(survey), { rowWidth: 800 }).elements[0]?.style
        .flexBasis
    ).toBe(400); // 50% of 800
    page.gridLayoutColumns[0].width = 30;
    const res = resolveRowWidths(firstRow(survey), { rowWidth: 800 });
    expect(res.elements[0]?.style.flexBasis).toBeCloseTo(240, 6); // 30%
    expect(res.elements[1]?.style.flexBasis).toBeCloseTo(560, 6); // 70%
  });
});

describe('isMultiple parity with getRowCss rowMultiple', () => {
  it('matches the css builder on both row shapes', () => {
    const survey = new SurveyModel({
      elements: [
        { type: 'text', name: 'm1' },
        { type: 'text', name: 'm2', startWithNewLine: false },
        { type: 'text', name: 'alone' },
      ],
    });
    const rows = survey.pages[0]!.rows;
    const multi = resolveRowWidths(rows[0]!, { rowWidth: 800 });
    const single = resolveRowWidths(rows[1]!, { rowWidth: 800 });
    expect(multi.isMultiple).toBe(true);
    expect(single.isMultiple).toBe(false);
    expect(rows[0]!.getRowCss().includes('multiple')).toBe(true);
    expect(rows[1]!.getRowCss().includes('multiple')).toBe(false);
  });
});
