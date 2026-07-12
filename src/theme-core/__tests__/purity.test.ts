/**
 * Purity tests (design: docs/design/0.6-theme-core.md, test plan #7).
 * Covers the two purity guarantees not already exercised in
 * resolve.test.ts's "purity" block: no diagnostics-seam calls during
 * resolve, and the type-only facade import loading without survey-core
 * evaluated.
 */
import { reportDiagnostic, setDiagnosticHandler } from '../../diagnostics';
import { resolveTheme } from '../resolve';
import type { ITheme } from '../../core/facade';

describe('resolveTheme never calls the app-wide diagnostics seam', () => {
  it('is observably pure: diagnostics are returned as data, never pushed through reportDiagnostic', () => {
    const seen: unknown[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    try {
      const theme: ITheme = {
        cssVariables: {
          '--sjs-primary-backcolor': 'garbage-not-a-color',
        },
      };
      const resolved = resolveTheme(theme);
      // The garbage value DOES produce a ThemeDiagnostic in the returned
      // data...
      expect(resolved.diagnostics.length).toBeGreaterThan(0);
      // ...but resolveTheme itself never called the seam to report it.
      expect(seen).toHaveLength(0);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });

  it('sanity: the seam itself still works when called directly (proves the spy would have caught a call)', () => {
    const seen: unknown[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    try {
      reportDiagnostic({
        code: 'unsupported-question-type',
        questionType: 'x',
        dispatchKey: 'x',
        template: 'x',
        componentName: 'x',
        name: undefined,
      });
      expect(seen).toHaveLength(1);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });
});

describe('type-only facade import — theme-core loads without survey-core evaluated', () => {
  it('requiring theme-core modules does not pull survey-core into the module cache', () => {
    jest.resetModules();
    // eslint-disable-next-line no-restricted-syntax -- test assertion only: confirms survey-core is NOT already loaded
    expect(require.cache[require.resolve('survey-core')]).toBeUndefined();

    require('../resolve');

    require('../registry');

    require('../defaults');

    require('../parse');

    require('../helpers');

    // eslint-disable-next-line no-restricted-syntax -- test assertion only
    expect(require.cache[require.resolve('survey-core')]).toBeUndefined();
  });
});
