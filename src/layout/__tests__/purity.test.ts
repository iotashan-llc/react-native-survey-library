/**
 * Purity tests (design: docs/design/1.3-width-resolver.md, test plan #5;
 * theme-core precedent: src/theme-core/__tests__/purity.test.ts).
 * The resolver returns diagnostics as data and NEVER pushes them through
 * the app-wide diagnostics seam — 1.4's row component forwards them
 * post-commit.
 */
import { setDiagnosticHandler } from '../../diagnostics';
import { resolveWidthStyle, evaluateWidthExpression } from '../width-resolver';

describe('width resolver never calls the app-wide diagnostics seam', () => {
  it('is observably pure: invalid input produces returned data, not a seam call', () => {
    const seen: unknown[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    try {
      const bad = evaluateWidthExpression('banana', 800);
      expect(bad.kind).toBe('invalid');

      const { diagnostics } = resolveWidthStyle(
        { flexBasis: '10em', minWidth: 'calc(1px / 0)' },
        { percentBase: 800 }
      );
      expect(diagnostics.length).toBe(2);
      expect(seen).toHaveLength(0);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });
});
