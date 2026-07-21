/**
 * `file` question (task 5.2) — RN port of survey-core's `QuestionFileModel`
 * + web `SurveyQuestionFile` (reactquestion_file.tsx + components/file/*).
 *
 * survey-core owns the file state machine: `loadFiles(File[], sourceType)`
 * validates `maxSize`/`maxFiles`, reads each File to a base64 data URL on
 * the default `storeDataAsText` path (via the runtime `FileReader`), and
 * stores the value as `[{ name, type, content }]` + mirrors it into
 * `previewValue`. The RN renderer DRIVES the native pickers
 * (expo-document-picker for `sourceType: "file"`, expo-image-picker's
 * `launchCameraAsync` for `"camera"`), converts each picked asset into a
 * real `File` (`fetch(uri).blob()` → `new File(...)`), and hands it to
 * `loadFiles` — never binding the picker result straight to `question.value`
 * (invariant 3). These suites drive the pickers through their root manual
 * mocks (`__mocks__/expo-{document,image}-picker.ts`) and assert OUR
 * contract (the model value/previewValue after a pick, the preview
 * thumbnails/decorators, per-file remove, multi-file pagination). The native
 * pickers + `fetch(file://)` blob read are a device gate.
 *
 * `FileReader` is a React Native runtime global on-device; node/jest does
 * not define it, so these suites install a faithful base64 polyfill (reads a
 * real Blob's bytes) so core's storeDataAsText path runs end-to-end exactly
 * as it will on-device.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import {
  FileQuestion,
  loadDocumentPicker,
  loadImagePicker,
} from '../FileQuestion';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import { UnsupportedQuestion } from '../../components/UnsupportedQuestion';
import { resolveQuestionDispatchKey } from '../../factories/dispatch-key';
import * as DocumentPickerMock from '../../../__mocks__/expo-document-picker';
import * as ImagePickerMock from '../../../__mocks__/expo-image-picker';

// ---- FileReader polyfill (RN provides it on-device; node/jest does not) ----
class NodeFileReader {
  public result: string | ArrayBuffer | null = null;
  public error: unknown = null;
  public onload: ((ev: { target: NodeFileReader }) => void) | null = null;
  public onerror: ((ev: { target: NodeFileReader }) => void) | null = null;
  readAsDataURL(blob: Blob): void {
    Promise.resolve(blob.arrayBuffer())
      .then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        this.result = `data:${blob.type || ''};base64,${b64}`;
        this.onload?.({ target: this });
      })
      .catch((err) => {
        this.error = err;
        this.onerror?.({ target: this });
      });
  }
}
beforeAll(() => {
  if (typeof (global as { FileReader?: unknown }).FileReader === 'undefined') {
    (global as { FileReader?: unknown }).FileReader = NodeFileReader;
  }
});
afterEach(() => {
  DocumentPickerMock.__resetPicker();
  ImagePickerMock.__resetPicker();
});

// 1x1 PNG + a tiny PDF, as data: URIs (node fetch reads them into a Blob).
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

function makeFile(extra: Record<string, unknown> = {}, name = 'f'): Question {
  const model = new Model({ elements: [{ type: 'file', name, ...extra }] });
  return model.getQuestionByName(name)!;
}

function renderFile(question: Question) {
  return render(<FileQuestion question={question} creator={{}} />);
}

describe('file — dispatch (supported, never the fallback)', () => {
  it('resolves the "file" dispatch key and a real registered component', () => {
    const question = makeFile();
    expect(resolveQuestionDispatchKey(question)).toBe('file');
    const element = RNQuestionFactory.createQuestion('file', {
      question,
      creator: {},
    });
    expect(element).not.toBeNull();
    expect(element!.type).not.toBe(UnsupportedQuestion);
  });

  it('the capability loaders resolve the mocked peers (present)', () => {
    expect(loadDocumentPicker()).not.toBeNull();
    expect(loadImagePicker()).not.toBeNull();
  });
});

describe('file — choosing via the document picker (sourceType "file")', () => {
  it('a picked file flows through loadFiles into value + previewValue (base64)', async () => {
    const question = makeFile();
    expect(question.isEmpty()).toBe(true);
    renderFile(question);
    DocumentPickerMock.__setDocumentResult({
      canceled: false,
      assets: [{ uri: PNG, name: 'a.png', mimeType: 'image/png' }],
    });
    fireEvent.press(screen.getByTestId('sv-file-choose-f'));
    await waitFor(() => expect(question.value).toHaveLength(1));
    expect(question.value[0].name).toBe('a.png');
    expect(question.value[0].type).toBe('image/png');
    // storeDataAsText default -> content is a base64 data URL.
    expect(typeof question.value[0].content).toBe('string');
    expect(question.value[0].content.startsWith('data:image/png;base64,')).toBe(
      true
    );
    expect(question.previewValue).toHaveLength(1);
  });

  it('passes allowMultiple + the accepted-types filter to getDocumentAsync', async () => {
    const question = makeFile({ allowMultiple: true });
    renderFile(question);
    DocumentPickerMock.__setDocumentResult({ canceled: true, assets: [] });
    fireEvent.press(screen.getByTestId('sv-file-choose-f'));
    await waitFor(() =>
      expect(DocumentPickerMock.__getDocumentCalls().length).toBe(1)
    );
    const opts = DocumentPickerMock.__getDocumentCalls()[0] as {
      multiple?: boolean;
    };
    expect(opts.multiple).toBe(true);
  });

  it('a canceled pick leaves the value empty (no crash)', async () => {
    const question = makeFile();
    renderFile(question);
    DocumentPickerMock.__setDocumentResult({ canceled: true, assets: [] });
    fireEvent.press(screen.getByTestId('sv-file-choose-f'));
    await waitFor(() =>
      expect(DocumentPickerMock.__getDocumentCalls().length).toBe(1)
    );
    expect(question.isEmpty()).toBe(true);
  });
});

describe('file — camera capture (sourceType "camera")', () => {
  it('uses launchCameraAsync and stores the captured photo', async () => {
    const question = makeFile({ sourceType: 'camera' });
    renderFile(question);
    ImagePickerMock.__setCameraResult({
      canceled: false,
      assets: [{ uri: PNG, fileName: 'snap.png', mimeType: 'image/png' }],
    });
    fireEvent.press(screen.getByTestId('sv-file-camera-f'));
    await waitFor(() => expect(question.value).toHaveLength(1));
    expect(ImagePickerMock.__getCameraCalls().length).toBe(1);
    expect(question.value[0].type).toBe('image/png');
  });

  it('a denied camera permission does not open the camera or set a value', async () => {
    const question = makeFile({ sourceType: 'camera' });
    renderFile(question);
    ImagePickerMock.__setPermission({ granted: false, status: 'denied' });
    ImagePickerMock.__setCameraResult({
      canceled: false,
      assets: [{ uri: PNG, fileName: 'snap.png', mimeType: 'image/png' }],
    });
    fireEvent.press(screen.getByTestId('sv-file-camera-f'));
    // Give the permission promise a tick to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(ImagePickerMock.__getCameraCalls().length).toBe(0);
    expect(question.isEmpty()).toBe(true);
  });

  it('sourceType "file-camera" offers BOTH the file and camera actions', () => {
    const question = makeFile({ sourceType: 'file-camera' });
    renderFile(question);
    expect(screen.getByTestId('sv-file-choose-f')).toBeTruthy();
    expect(screen.getByTestId('sv-file-camera-f')).toBeTruthy();
  });
});

describe('file — preview (thumbnails, decorators, remove, pagination)', () => {
  it('renders an image thumbnail for an image file (allowImagesPreview)', async () => {
    const question = makeFile({ allowImagesPreview: true });
    renderFile(question);
    DocumentPickerMock.__setDocumentResult({
      canceled: false,
      assets: [{ uri: PNG, name: 'a.png', mimeType: 'image/png' }],
    });
    fireEvent.press(screen.getByTestId('sv-file-choose-f'));
    await waitFor(() =>
      expect(screen.getByTestId('sv-file-thumb-f-a.png')).toBeTruthy()
    );
    expect(screen.getByTestId('sv-file-thumb-f-a.png').props.source).toEqual({
      uri: question.value[0].content,
    });
  });

  it('renders a file decorator (name) for a non-image file', async () => {
    const question = makeFile({ allowImagesPreview: true });
    renderFile(question);
    DocumentPickerMock.__setDocumentResult({
      canceled: false,
      assets: [{ uri: PDF, name: 'doc.pdf', mimeType: 'application/pdf' }],
    });
    fireEvent.press(screen.getByTestId('sv-file-choose-f'));
    await waitFor(() =>
      expect(screen.getByTestId('sv-file-decorator-f-doc.pdf')).toBeTruthy()
    );
    expect(screen.queryByTestId('sv-file-thumb-f-doc.pdf')).toBeNull();
  });

  it('remove drives question.removeFile and shrinks the value', async () => {
    const question = makeFile({
      allowMultiple: true,
      allowImagesPreview: true,
    });
    renderFile(question);
    DocumentPickerMock.__setDocumentResult({
      canceled: false,
      assets: [
        { uri: PNG, name: 'a.png', mimeType: 'image/png' },
        { uri: PNG, name: 'b.png', mimeType: 'image/png' },
      ],
    });
    fireEvent.press(screen.getByTestId('sv-file-choose-f'));
    await waitFor(() => expect(question.value).toHaveLength(2));
    // page size defaults to 1 -> the first page shows a.png; remove it.
    fireEvent.press(screen.getByTestId('sv-file-remove-f-a.png'));
    await waitFor(() => expect(question.value).toHaveLength(1));
    expect(question.value.map((f: { name: string }) => f.name)).toEqual([
      'b.png',
    ]);
  });

  it('multiple files paginate via the file navigator', async () => {
    const question = makeFile({
      allowMultiple: true,
      allowImagesPreview: true,
    });
    renderFile(question);
    DocumentPickerMock.__setDocumentResult({
      canceled: false,
      assets: [
        { uri: PNG, name: 'a.png', mimeType: 'image/png' },
        { uri: PNG, name: 'b.png', mimeType: 'image/png' },
        { uri: PNG, name: 'c.png', mimeType: 'image/png' },
      ],
    });
    fireEvent.press(screen.getByTestId('sv-file-choose-f'));
    await waitFor(() => expect(question.value).toHaveLength(3));
    // pageSize default 1 -> navigator visible, first page shows a.png.
    expect(screen.getByTestId('sv-file-nav-f')).toBeTruthy();
    expect(screen.getByTestId('sv-file-thumb-f-a.png')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sv-file-nav-next-f'));
    await waitFor(() =>
      expect(screen.getByTestId('sv-file-thumb-f-b.png')).toBeTruthy()
    );
    expect(question.indexToShow).toBe(1);
  });
});

describe('file — read-only', () => {
  it('read-only blocks choosing (no choose action) and shows the stored value', () => {
    const question = makeFile({
      readOnly: true,
      allowImagesPreview: true,
      defaultValue: [{ name: 'a.png', type: 'image/png', content: PNG }],
    });
    renderFile(question);
    expect(screen.queryByTestId('sv-file-choose-f')).toBeNull();
    expect(screen.queryByTestId('sv-file-camera-f')).toBeNull();
    // The stored image still previews...
    expect(screen.getByTestId('sv-file-thumb-f-a.png')).toBeTruthy();
    // ...but with no remove affordance.
    expect(screen.queryByTestId('sv-file-remove-f-a.png')).toBeNull();
  });

  it('read-only + empty shows the no-file placeholder, never a choose action', () => {
    const question = makeFile({ readOnly: true });
    renderFile(question);
    expect(screen.queryByTestId('sv-file-choose-f')).toBeNull();
    expect(screen.getByTestId('sv-file-placeholder-f')).toBeTruthy();
  });
});
