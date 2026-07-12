/**
 * Grammar-unit tests for the width-expression resolver
 * (design: docs/design/1.3-width-resolver.md, test plan #1, #2, #4).
 *
 * Pure-function tests — no survey-core, no RN. The live-model
 * integration lives in width-resolver.model.test.ts.
 */
import {
  evaluateWidthExpression,
  resolveWidthStyle,
  resolveRowWidths,
  type WidthValue,
} from '../width-resolver';

const dp = (v: WidthValue): number => {
  expect(v.kind).toBe('dp');
  return v.kind === 'dp' ? v.dp : NaN;
};

describe('evaluateWidthExpression — plain values', () => {
  it('px lengths resolve 1:1 to dp', () => {
    expect(dp(evaluateWidthExpression('300px', 800))).toBe(300);
    expect(dp(evaluateWidthExpression('0px', 800))).toBe(0);
    expect(dp(evaluateWidthExpression('12.5px', 800))).toBe(12.5);
    expect(dp(evaluateWidthExpression('.5px', 800))).toBe(0.5);
  });

  it('percentages resolve against percentBase', () => {
    expect(dp(evaluateWidthExpression('20%', 800))).toBe(160);
    expect(dp(evaluateWidthExpression('100%', 800))).toBe(800);
    // core's equal-split emission for a 3-up row
    expect(dp(evaluateWidthExpression('33.333333%', 800))).toBeCloseTo(
      266.666664,
      5
    );
  });

  it('bare numbers are px (core convention: getRenderedWidthFromWidth)', () => {
    expect(dp(evaluateWidthExpression('250', 800))).toBe(250);
    expect(dp(evaluateWidthExpression(250, 800))).toBe(250);
    expect(dp(evaluateWidthExpression('0', 800))).toBe(0);
  });

  it('"auto" is the auto kind', () => {
    expect(evaluateWidthExpression('auto', 800)).toEqual({ kind: 'auto' });
    expect(evaluateWidthExpression('AUTO', 800)).toEqual({ kind: 'auto' });
  });

  it('empty / nullish are the unset kind', () => {
    expect(evaluateWidthExpression('', 800)).toEqual({ kind: 'unset' });
    expect(evaluateWidthExpression('   ', 800)).toEqual({ kind: 'unset' });
    expect(evaluateWidthExpression(undefined, 800)).toEqual({ kind: 'unset' });
    expect(evaluateWidthExpression(null, 800)).toEqual({ kind: 'unset' });
  });

  it('whitespace around a plain value is tolerated', () => {
    expect(dp(evaluateWidthExpression('  300px  ', 800))).toBe(300);
  });
});

describe('evaluateWidthExpression — calc()', () => {
  it('resolves the single-unsized-element shape core emits', () => {
    // panel.ts getRenderedCalcWidth: calc(100% - 300px - 20%) @800
    // = 800 - 300 - 160 = 340
    expect(dp(evaluateWidthExpression('calc(100% - 300px - 20%)', 800))).toBe(
      340
    );
  });

  it('resolves the multi-unsized-element shape core emits', () => {
    // calc((100% - 300px)/2) @800 = 250
    expect(dp(evaluateWidthExpression('calc((100% - 300px)/2)', 800))).toBe(
      250
    );
  });

  it('handles nested parens and mixed operators', () => {
    expect(
      dp(evaluateWidthExpression('calc(((100% - 100px) / 2) + 10px)', 800))
    ).toBe(360);
    expect(dp(evaluateWidthExpression('calc(2 * 100px)', 800))).toBe(200);
    expect(dp(evaluateWidthExpression('calc(100px * 2)', 800))).toBe(200);
  });

  it('is whitespace-tolerant and case-insensitive', () => {
    expect(dp(evaluateWidthExpression('CALC( 50%+100px )', 800))).toBe(500);
  });

  it('supports unary minus at factor position', () => {
    expect(dp(evaluateWidthExpression('calc(100px - -50px)', 800))).toBe(150);
  });

  it('supports min()/max() nested inside calc()', () => {
    expect(dp(evaluateWidthExpression('calc(min(100%, 300px) / 2)', 800))).toBe(
      150
    );
  });
});

describe('evaluateWidthExpression — min()/max()', () => {
  it('resolves the minWidth wrapper core emits, both regimes', () => {
    // survey-element.ts calcRootStyle: min(100%, 300px)
    expect(dp(evaluateWidthExpression('min(100%, 300px)', 800))).toBe(300);
    expect(dp(evaluateWidthExpression('min(100%, 300px)', 250))).toBe(250);
  });

  it('is n-ary', () => {
    expect(dp(evaluateWidthExpression('min(500px, 300px, 40%)', 800))).toBe(
      300
    );
    expect(dp(evaluateWidthExpression('max(10%, 200px, 150px)', 800))).toBe(
      200
    );
  });

  it('accepts the unwrapped bare-number minWidth core can emit', () => {
    // user minWidth "250" reaches rootStyle as min(100%, 250)
    expect(dp(evaluateWidthExpression('min(100%, 250)', 800))).toBe(250);
  });
});

describe('evaluateWidthExpression — invalid input degrades, never throws', () => {
  const invalid = (raw: unknown, code: string) => {
    const v = evaluateWidthExpression(raw, 800);
    expect(v.kind).toBe('invalid');
    if (v.kind === 'invalid') {
      expect(v.diagnostic.code).toBe(code);
      expect(v.diagnostic.value).toBe(String(raw));
    }
  };

  it('unsupported CSS units get their own diagnostic code', () => {
    invalid('10em', 'layout/unsupported-width-unit');
    invalid('2rem', 'layout/unsupported-width-unit');
    invalid('50vw', 'layout/unsupported-width-unit');
    invalid('calc(100% - 2em)', 'layout/unsupported-width-unit');
  });

  it('garbage identifiers are invalid (upstream passes them through verbatim)', () => {
    invalid('banana', 'layout/invalid-width');
    invalid('fit-content(200px)', 'layout/invalid-width');
  });

  it('CSS calc type violations are invalid', () => {
    invalid('calc(100px * 2px)', 'layout/invalid-width'); // len*len
    invalid('calc(100% / 2px)', 'layout/invalid-width'); // len divisor
    invalid('calc(100px + 2)', 'layout/invalid-width'); // len + number
    invalid('calc(100px / 0)', 'layout/invalid-width'); // div by zero
  });

  it('structural garbage is invalid', () => {
    invalid('calc(', 'layout/invalid-width');
    invalid('min(100%,)', 'layout/invalid-width');
    invalid('100px 200px', 'layout/invalid-width');
    invalid('calc()', 'layout/invalid-width');
  });

  it('non-finite numbers are invalid', () => {
    invalid(NaN, 'layout/invalid-width');
    invalid(Infinity, 'layout/invalid-width');
  });
});

describe('resolveWidthStyle — rootStyle translation', () => {
  it('translates the renderWidth-branch shape into all-numeric styles', () => {
    // exact live shape from the 3-up equal-split probe
    const { style, diagnostics } = resolveWidthStyle(
      {
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: '33.333333%',
        minWidth: 'min(100%, 300px)',
        maxWidth: '100%',
      },
      { percentBase: 800 }
    );
    expect(diagnostics).toEqual([]);
    expect(style.flexGrow).toBe(1);
    expect(style.flexShrink).toBe(1);
    expect(style.flexBasis).toBeCloseTo(266.666664, 5);
    expect(style.minWidth).toBe(300);
    expect(style.maxWidth).toBe(800);
  });

  it('translates the grid-branch shape (flexShrink 0 kept, minWidth stays omitted)', () => {
    const { style, diagnostics } = resolveWidthStyle(
      {
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: '66.66%',
        minWidth: undefined,
        maxWidth: '100%',
      },
      { percentBase: 600 }
    );
    expect(diagnostics).toEqual([]);
    expect(style).toEqual({
      flexGrow: 1,
      flexShrink: 0,
      flexBasis: 399.96,
      maxWidth: 600,
    });
    expect('minWidth' in style).toBe(false);
  });

  it('empty rootStyle passes through empty', () => {
    expect(resolveWidthStyle({}, { percentBase: 800 })).toEqual({
      style: {},
      diagnostics: [],
    });
    expect(resolveWidthStyle(undefined, { percentBase: 800 })).toEqual({
      style: {},
      diagnostics: [],
    });
  });

  it('"auto" minWidth is omitted, not zero', () => {
    const { style } = resolveWidthStyle(
      { flexGrow: 1, flexShrink: 1, flexBasis: '100%', minWidth: 'auto' },
      { percentBase: 400 }
    );
    expect('minWidth' in style).toBe(false);
    expect(style.flexBasis).toBe(400);
  });

  it('a dropped constraint keeps its siblings and reports which property', () => {
    const { style, diagnostics } = resolveWidthStyle(
      {
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 'banana',
        minWidth: 'min(100%, 300px)',
        maxWidth: '100%',
      },
      { percentBase: 800 }
    );
    expect('flexBasis' in style).toBe(false);
    expect(style.minWidth).toBe(300);
    expect(style.maxWidth).toBe(800);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'layout/invalid-width',
      property: 'flexBasis',
      value: 'banana',
    });
  });

  it('negative resolved lengths clamp to 0 (CSS used-value clamping)', () => {
    const { style, diagnostics } = resolveWidthStyle(
      { flexGrow: 1, flexShrink: 1, flexBasis: 'calc(100% - 300px)' },
      { percentBase: 200 }
    );
    expect(style.flexBasis).toBe(0);
    expect(diagnostics).toEqual([]);
  });

  it('non-numeric flexGrow/flexShrink are omitted, never NaN', () => {
    const { style } = resolveWidthStyle(
      { flexGrow: 'yes' as unknown as number, flexBasis: '50%' },
      { percentBase: 800 }
    );
    expect('flexGrow' in style).toBe(false);
    expect(style.flexBasis).toBe(400);
  });
});

describe('resolveRowWidths — row helper (DOM gutter-parity in one place)', () => {
  const el = (rootStyle: Record<string, unknown>) => ({ rootStyle });

  it('multi-element rows resolve % against rowWidth + gutter', () => {
    const row = {
      visibleElements: [
        el({ flexGrow: 1, flexShrink: 1, flexBasis: '50%' }),
        el({ flexGrow: 1, flexShrink: 1, flexBasis: '50%' }),
      ],
    };
    const res = resolveRowWidths(row, { rowWidth: 784, gutter: 16 });
    expect(res.isMultiple).toBe(true);
    expect(res.percentBase).toBe(800);
    expect(res.elements).toHaveLength(2);
    expect(res.elements[0]?.style.flexBasis).toBe(400);
    expect(res.elements[1]?.style.flexBasis).toBe(400);
  });

  it('single-element rows resolve % against rowWidth alone', () => {
    const row = {
      visibleElements: [el({ flexGrow: 1, flexShrink: 1, flexBasis: '100%' })],
    };
    const res = resolveRowWidths(row, { rowWidth: 784, gutter: 16 });
    expect(res.isMultiple).toBe(false);
    expect(res.percentBase).toBe(784);
    expect(res.elements[0]?.style.flexBasis).toBe(784);
  });

  it('gutter defaults to 0', () => {
    const row = {
      visibleElements: [el({ flexBasis: '50%' }), el({ flexBasis: '50%' })],
    };
    expect(resolveRowWidths(row, { rowWidth: 800 }).percentBase).toBe(800);
  });

  it('clamps non-finite / negative bases to 0 instead of NaN-poisoning Yoga', () => {
    const row = { visibleElements: [el({ flexBasis: '50%' })] };
    expect(resolveRowWidths(row, { rowWidth: NaN }).percentBase).toBe(0);
    expect(resolveRowWidths(row, { rowWidth: -10 }).percentBase).toBe(0);
    expect(
      resolveRowWidths(row, { rowWidth: NaN }).elements[0]?.style.flexBasis
    ).toBe(0);
  });

  it('collects per-element diagnostics', () => {
    const row = {
      visibleElements: [el({ flexBasis: '10em' }), el({ flexBasis: '50%' })],
    };
    const res = resolveRowWidths(row, { rowWidth: 800, gutter: 0 });
    expect(res.elements[0]?.diagnostics[0]?.code).toBe(
      'layout/unsupported-width-unit'
    );
    expect(res.elements[1]?.diagnostics).toEqual([]);
  });
});
