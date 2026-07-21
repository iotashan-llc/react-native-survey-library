/**
 * `signaturepad` fallback (task 5.1): when the batteries-included
 * `react-native-signature-canvas` peer (a WebView signature pad) is ABSENT
 * — jest without the peer, or a consumer who has not installed it — the
 * question must NOT crash (invariant 9). The lazy `loadSignatureCanvasLib()`
 * resolves `null` and the renderer degrades to a non-throwing fallback: a
 * structured `signaturepad-lib-unavailable` diagnostic plus a read-only RN
 * `<Image>` of any already-stored signature (so a rehydrated value still
 * displays) — never the canvas, never a throw.
 *
 * The absence is simulated by mocking the module to an object with no usable
 * component export, which `loadSignatureCanvasLib()` resolves to `null` (its
 * try/catch also covers a hard MODULE_NOT_FOUND for a truly uninstalled
 * peer). A separate file keeps the per-file module registry — and thus the
 * memoized cache — isolated from the canvas-present suite.
 */
jest.mock('react-native-signature-canvas', () => ({ __esModule: true }));

import { render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import { setDiagnosticHandler } from '../../diagnostics';
import '../../factories/register-all';
import {
  SignaturePadQuestion,
  loadSignatureCanvasLib,
} from '../SignaturePadQuestion';

const PNG_URL = 'data:image/png;base64,iVBORw0KAAAA';

function makeSig(extra: Record<string, unknown> = {}, name = 's'): Question {
  const model = new Model({
    elements: [{ type: 'signaturepad', name, ...extra }],
  });
  return model.getQuestionByName(name)!;
}

describe('signaturepad — fallback when the canvas lib is absent', () => {
  afterEach(() => setDiagnosticHandler(undefined));

  it('loadSignatureCanvasLib() resolves null with no usable component export', () => {
    expect(loadSignatureCanvasLib()).toBeNull();
  });

  it('renders the non-throwing fallback (no canvas input, no unsupported panel)', () => {
    const question = makeSig();
    expect(() =>
      render(<SignaturePadQuestion question={question} creator={{}} />)
    ).not.toThrow();
    expect(screen.queryByTestId('sv-signature-input-s')).toBeNull();
    expect(screen.queryByTestId('unsupported-question-panel')).toBeNull();
    expect(screen.getByTestId('sv-signature-fallback-s')).toBeTruthy();
  });

  it('still displays a stored signature as a read-only Image (no crash)', () => {
    const question = makeSig({ defaultValue: PNG_URL });
    render(<SignaturePadQuestion question={question} creator={{}} />);
    const img = screen.getByTestId('sv-signature-image-s');
    expect(img.props.source).toEqual({ uri: PNG_URL });
  });

  it('emits a signaturepad-lib-unavailable diagnostic (once)', () => {
    const codes: string[] = [];
    setDiagnosticHandler((payload) => codes.push(payload.code));
    const question = makeSig();
    render(<SignaturePadQuestion question={question} creator={{}} />);
    expect(
      codes.filter((c) => c === 'signaturepad-lib-unavailable')
    ).toHaveLength(1);
  });
});
