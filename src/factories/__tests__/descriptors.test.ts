/**
 * Descriptor table (design: docs/design/0.5-factories.md, "Descriptor
 * table") — the single source of registration truth. M0 rows: `empty`
 * (supported/template) and `custom`/`composite` (planned — no placeholder
 * components; a dispatch miss on either falls through to the fallback +
 * diagnostic until task 2.11 lands their adapters). M1 rows added by
 * tasks 1.11 (comment) / 1.12 (checkbox, radiogroup): supported/template,
 * dispatchKey === questionType (no `renderAs` override for any of the
 * three — `getTemplate()` returns the type name unmodified for all of
 * them, verified against a live fixture in manifest.test.ts's
 * construction gate).
 */
import { DESCRIPTOR_TABLE } from '../descriptors';
import type { Descriptor } from '../descriptors';

function byKey(dispatchKey: string): Descriptor {
  const row = DESCRIPTOR_TABLE.find((r) => r.dispatchKey === dispatchKey);
  if (!row) throw new Error(`no descriptor row for "${dispatchKey}"`);
  return row;
}

describe('DESCRIPTOR_TABLE (M0 + M1)', () => {
  it('has exactly the M0 + M1 rows', () => {
    expect(DESCRIPTOR_TABLE.map((r) => r.dispatchKey).sort()).toEqual([
      'checkbox',
      'comment',
      'composite',
      'custom',
      'empty',
      'radiogroup',
    ]);
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

  it('"comment"/"checkbox"/"radiogroup" (task 1.11/1.12) are supported/template rows with resolvable component thunks, dispatchKey === questionType', () => {
    for (const key of ['comment', 'checkbox', 'radiogroup'] as const) {
      const row = byKey(key);
      expect(row.status).toBe('supported');
      expect(row.route).toBe('template');
      expect(row.questionType).toBe(key);
      if (row.status !== 'supported') throw new Error('unreachable');
      expect(typeof row.component).toBe('function');
      expect(typeof row.component()).toBe('function');
      expect(row.milestone).toBe('M1');
    }
  });
});
