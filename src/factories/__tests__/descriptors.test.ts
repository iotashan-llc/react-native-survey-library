/**
 * Descriptor table (design: docs/design/0.5-factories.md, "Descriptor
 * table") — the single source of registration truth. M0 rows: `empty`
 * (supported/template) and `custom`/`composite` (planned — no placeholder
 * components; a dispatch miss on either falls through to the fallback +
 * diagnostic until task 2.11 lands their adapters). M1 rows added by
 * tasks 1.6 (element routes: sv-string-viewer, survey-header,
 * sv-logo-image), 1.4 (composition element routes: sv-page, panel),
 * 1.11 (comment), 1.12 (checkbox, radiogroup), 1.13 (boolean: template +
 * checkbox/radio renderer routes) and 1.15 (expression: template).
 */
import { DESCRIPTOR_TABLE } from '../descriptors';
import type { Descriptor } from '../descriptors';

function byKey(dispatchKey: string): Descriptor {
  const row = DESCRIPTOR_TABLE.find((r) => r.dispatchKey === dispatchKey);
  if (!row) throw new Error(`no descriptor row for "${dispatchKey}"`);
  return row;
}

describe('DESCRIPTOR_TABLE (M0 + M1)', () => {
  it('has exactly the expected dispatch keys', () => {
    expect(DESCRIPTOR_TABLE.map((r) => r.dispatchKey).sort()).toEqual([
      'boolean',
      'checkbox',
      'comment',
      'composite',
      'custom',
      'empty',
      'expression',
      'panel',
      'radiogroup',
      'rating',
      'survey-header',
      'sv-boolean-checkbox',
      'sv-boolean-radio',
      'sv-logo-image',
      'sv-page',
      'sv-rating-item',
      'sv-rating-item-smiley',
      'sv-rating-item-star',
      'sv-string-viewer',
    ]);
  });

  it('the 1.4/1.6 rows are supported/element rows (RNElementFactory keyspace) with resolvable component thunks', () => {
    for (const key of [
      'sv-string-viewer',
      'survey-header',
      'sv-logo-image',
      'sv-page',
      'panel',
    ] as const) {
      const row = byKey(key);
      expect(row.status).toBe('supported');
      expect(row.route).toBe('element');
      if (row.status !== 'supported') throw new Error('unreachable');
      expect(typeof row.component()).toBe('function');
      expect(row.milestone).toBe('M1');
    }
  });

  it('"empty" is a supported/template row with a resolvable component thunk', () => {
    const row = byKey('empty');
    expect(row.status).toBe('supported');
    expect(row.route).toBe('template');
    expect(row.questionType).toBe('empty');
    if (row.status !== 'supported') throw new Error('unreachable');
    expect(typeof row.component).toBe('function');
    expect(typeof row.component()).toBe('function');
    expect(row.milestone).toBe('M0');
  });

  it('"custom" and "composite" are planned/template rows with no component field, carrying a reason and milestone', () => {
    for (const key of ['custom', 'composite'] as const) {
      const row = byKey(key);
      expect(row.status).toBe('planned');
      expect(row.route).toBe('template');
      expect(row.questionType).toBe(key);
      expect('component' in row).toBe(false);
      if (row.status !== 'planned') throw new Error('unreachable');
      expect(row.reason.length).toBeGreaterThan(0);
      expect(row.milestone).toBe('M2');
    }
  });

  it('every dispatchKey in the table is unique', () => {
    const keys = DESCRIPTOR_TABLE.map((r) => r.dispatchKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('"boolean" is a supported/template row (default renderAs -> getTemplate() route)', () => {
    const row = byKey('boolean');
    expect(row.status).toBe('supported');
    expect(row.route).toBe('template');
    expect(row.questionType).toBe('boolean');
    if (row.status !== 'supported') throw new Error('unreachable');
    expect(typeof row.component()).toBe('function');
    expect(row.milestone).toBe('M1');
  });

  it('"sv-boolean-checkbox"/"sv-boolean-radio" are supported/renderer rows carrying the matching renderAs', () => {
    for (const [key, renderAs] of [
      ['sv-boolean-checkbox', 'checkbox'],
      ['sv-boolean-radio', 'radio'],
    ] as const) {
      const row = byKey(key);
      expect(row.status).toBe('supported');
      expect(row.route).toBe('renderer');
      expect(row.questionType).toBe('boolean');
      if (row.status !== 'supported') throw new Error('unreachable');
      expect(row.renderAs).toBe(renderAs);
      expect(typeof row.component()).toBe('function');
      expect(row.milestone).toBe('M1');
    }
  });

  it('"expression" is a supported/template row', () => {
    const row = byKey('expression');
    expect(row.status).toBe('supported');
    expect(row.route).toBe('template');
    expect(row.questionType).toBe('expression');
    if (row.status !== 'supported') throw new Error('unreachable');
    expect(typeof row.component()).toBe('function');
    expect(row.milestone).toBe('M1');
  });

  it('"comment"/"checkbox"/"radiogroup" (task 1.11/1.12) are supported/template rows with resolvable component thunks, dispatchKey === questionType', () => {
    for (const key of ['comment', 'checkbox', 'radiogroup'] as const) {
      const row = byKey(key);
      expect(row.status).toBe('supported');
      expect(row.route).toBe('template');
      expect(row.questionType).toBe(key);
      if (row.status !== 'supported') throw new Error('unreachable');
      expect(typeof row.component()).toBe('function');
      expect(row.milestone).toBe('M1');
    }
  });
});
