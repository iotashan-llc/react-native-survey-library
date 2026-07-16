/**
 * Task 1.4 — the `layout-diagnostic` forwarding edge (design:
 * docs/design/1.3-width-resolver.md, D4: "Diagnostics are returned as
 * data ... 1.4's row component forwards them post-commit through the seam
 * with a new `layout-diagnostic` payload code added there, deduped per
 * (element, offending value) at the forwarding edge").
 */
import {
  reportLayoutDiagnosticOnce,
  setDiagnosticHandler,
} from '../diagnostics';
import type {
  DiagnosticPayload,
  LayoutDiagnosticPayload,
} from '../diagnostics';

function payloadFor(
  overrides: Partial<LayoutDiagnosticPayload> = {}
): LayoutDiagnosticPayload {
  return {
    code: 'layout-diagnostic',
    layoutCode: 'layout/invalid-width',
    property: 'flexBasis',
    value: 'banana',
    elementName: 'q1',
    elementType: 'text',
    message: 'unparseable width',
    ...overrides,
  };
}

describe('reportLayoutDiagnosticOnce', () => {
  let seen: DiagnosticPayload[];

  beforeEach(() => {
    seen = [];
    setDiagnosticHandler((payload) => seen.push(payload));
  });

  afterEach(() => {
    setDiagnosticHandler(undefined);
  });

  it('forwards a layout-diagnostic payload through the shared seam', () => {
    const element = {};
    reportLayoutDiagnosticOnce(element, payloadFor());
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      code: 'layout-diagnostic',
      layoutCode: 'layout/invalid-width',
      property: 'flexBasis',
      value: 'banana',
    });
  });

  it('dedupes per (element, offending value): same element + same value reports once', () => {
    const element = {};
    reportLayoutDiagnosticOnce(element, payloadFor());
    reportLayoutDiagnosticOnce(element, payloadFor());
    expect(seen).toHaveLength(1);
  });

  it('a DIFFERENT offending value on the same element re-emits', () => {
    const element = {};
    reportLayoutDiagnosticOnce(element, payloadFor());
    reportLayoutDiagnosticOnce(
      element,
      payloadFor({ value: '10em', layoutCode: 'layout/unsupported-width-unit' })
    );
    expect(seen).toHaveLength(2);
  });

  it('the same value on a DIFFERENT property re-emits (property participates in the dedupe key)', () => {
    const element = {};
    reportLayoutDiagnosticOnce(element, payloadFor({ property: 'flexBasis' }));
    reportLayoutDiagnosticOnce(element, payloadFor({ property: 'minWidth' }));
    expect(seen).toHaveLength(2);
  });

  it('a different element with the same value reports independently', () => {
    reportLayoutDiagnosticOnce({}, payloadFor());
    reportLayoutDiagnosticOnce({}, payloadFor());
    expect(seen).toHaveLength(2);
  });
});
