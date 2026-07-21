/**
 * `signaturepad` question (task 5.1) — RN port of survey-core's
 * `QuestionSignaturePadModel` + web `SurveyQuestionSignaturePad`.
 *
 * VALUE PARITY: web commits `signaturePad.toDataURL(getFormat())` on each
 * stroke end (the default `storeDataAsText` path) — a `data:image/<fmt>;
 * base64,…` string written to `question.value`. The RN renderer wraps the
 * batteries-included `react-native-signature-canvas` (a WebView signature
 * pad, LAZY-REQUIRED inside an isolated hooks child — invariant 7), whose
 * `onOK(dataURL)` returns the SAME data-URL format (keyed to `imageType`
 * from the model's `dataFormat`). These suites drive that library through
 * its root manual mock (`__mocks__/react-native-signature-canvas.tsx`) so
 * `onOK` / clear are unit-testable and assert OUR contract (the exact
 * data-URL committed, the clear reset, the model-derived props) instead of
 * the WebView's internals; the real WebView pad is a device gate.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import {
  SignaturePadQuestion,
  loadSignatureCanvasLib,
} from '../SignaturePadQuestion';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import { UnsupportedQuestion } from '../../components/UnsupportedQuestion';
import { resolveQuestionDispatchKey } from '../../factories/dispatch-key';

const PNG_URL = 'data:image/png;base64,iVBORw0KAAAA';
const JPEG_URL = 'data:image/jpeg;base64,/9j/4AAQBBBB';

function makeSig(extra: Record<string, unknown> = {}, name = 's'): Question {
  const model = new Model({
    elements: [{ type: 'signaturepad', name, ...extra }],
  });
  return model.getQuestionByName(name)!;
}

function renderSig(question: Question) {
  return render(<SignaturePadQuestion question={question} creator={{}} />);
}

describe('signaturepad — dispatch (supported, never the fallback)', () => {
  it('resolves the "signaturepad" dispatch key and a real registered component', () => {
    const question = makeSig();
    expect(resolveQuestionDispatchKey(question)).toBe('signaturepad');
    const element = RNQuestionFactory.createQuestion('signaturepad', {
      question,
      creator: {},
    });
    expect(element).not.toBeNull();
    expect(element!.type).not.toBe(UnsupportedQuestion);
  });
});

describe('signaturepad — canvas (react-native-signature-canvas, lazy-required)', () => {
  it('renders the signature canvas, not the unsupported fallback', () => {
    expect(loadSignatureCanvasLib()).not.toBeNull();
    const question = makeSig();
    renderSig(question);
    expect(screen.getByTestId('sv-signature-s')).toBeTruthy();
    expect(screen.getByTestId('sv-signature-input-s')).toBeTruthy();
    expect(screen.queryByTestId('unsupported-question-panel')).toBeNull();
    expect(screen.queryByTestId('sv-signature-fallback-s')).toBeNull();
  });

  it('onOK commits the data-URL value VERBATIM to the model (png parity)', () => {
    const question = makeSig();
    expect(question.isEmpty()).toBe(true);
    renderSig(question);
    act(() => {
      screen.getByTestId('sv-signature-input-s').props.onOK(PNG_URL);
    });
    expect(question.value).toBe(PNG_URL);
  });

  it('passes imageType image/jpeg for dataFormat "jpeg" and commits a jpeg data URL', () => {
    const question = makeSig({ dataFormat: 'jpeg' });
    renderSig(question);
    expect(screen.getByTestId('sv-signature-input-s').props.imageType).toBe(
      'image/jpeg'
    );
    act(() => {
      screen.getByTestId('sv-signature-input-s').props.onOK(JPEG_URL);
    });
    expect(question.value).toBe(JPEG_URL);
  });

  it('passes imageType image/svg+xml for dataFormat "svg"', () => {
    const question = makeSig({ dataFormat: 'svg' });
    renderSig(question);
    expect(screen.getByTestId('sv-signature-input-s').props.imageType).toBe(
      'image/svg+xml'
    );
  });

  it('the clear control resets the model value (allowClear default)', () => {
    const question = makeSig();
    renderSig(question);
    act(() => {
      screen.getByTestId('sv-signature-input-s').props.onOK(PNG_URL);
    });
    expect(question.value).toBe(PNG_URL);
    // canShowClearButton is true once a value exists — the control appears.
    fireEvent.press(screen.getByTestId('sv-signature-clear-s'));
    expect(question.isEmpty()).toBe(true);
  });

  it('allowClear:false never renders a clear control', () => {
    const question = makeSig({ allowClear: false });
    renderSig(question);
    act(() => {
      screen.getByTestId('sv-signature-input-s').props.onOK(PNG_URL);
    });
    expect(screen.queryByTestId('sv-signature-clear-s')).toBeNull();
  });

  it('drives pen color / background / pen min+max widths from the model', () => {
    const question = makeSig({
      penColor: '#ff0000',
      backgroundColor: '#00ff00',
      penMinWidth: 1,
      penMaxWidth: 3,
    });
    renderSig(question);
    const input = screen.getByTestId('sv-signature-input-s');
    expect(input.props.penColor).toBe('#ff0000');
    expect(input.props.backgroundColor).toBe('#00ff00');
    expect(input.props.minWidth).toBe(1);
    expect(input.props.maxWidth).toBe(3);
  });

  it('rehydrates an existing (editable) value into the canvas via the dataURL prop', () => {
    const question = makeSig({ defaultValue: PNG_URL });
    renderSig(question);
    // editable + existing value -> the canvas is rehydrated, not the Image.
    expect(screen.getByTestId('sv-signature-input-s').props.dataURL).toBe(
      PNG_URL
    );
    expect(screen.queryByTestId('sv-signature-image-s')).toBeNull();
  });

  it('read-only turns the canvas OFF (never interactive) and shows the stored Image', () => {
    const question = makeSig({ defaultValue: PNG_URL, readOnly: true });
    renderSig(question);
    expect(screen.queryByTestId('sv-signature-input-s')).toBeNull();
    const img = screen.getByTestId('sv-signature-image-s');
    expect(img.props.source).toEqual({ uri: PNG_URL });
  });
});

describe('signaturepad — placeholder', () => {
  it('shows the placeholder when empty and hides it once a value commits', () => {
    const question = makeSig();
    renderSig(question);
    expect(screen.getByTestId('sv-signature-placeholder-s')).toBeTruthy();
    act(() => {
      screen.getByTestId('sv-signature-input-s').props.onOK(PNG_URL);
    });
    expect(screen.queryByTestId('sv-signature-placeholder-s')).toBeNull();
  });

  it('never shows the placeholder when showPlaceholder is false', () => {
    const question = makeSig({ showPlaceholder: false });
    renderSig(question);
    expect(screen.queryByTestId('sv-signature-placeholder-s')).toBeNull();
  });

  it('read-only + empty renders the read-only placeholder, never the canvas', () => {
    const question = makeSig({ readOnly: true });
    renderSig(question);
    expect(screen.queryByTestId('sv-signature-input-s')).toBeNull();
    expect(screen.getByTestId('sv-signature-placeholder-s')).toBeTruthy();
  });
});
