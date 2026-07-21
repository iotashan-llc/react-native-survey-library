/**
 * `file` fallback (task 5.2): when the batteries-included picker peers
 * (`expo-document-picker` / `expo-image-picker`) are ABSENT — jest without
 * them, or a consumer who has not installed them — the question must NOT
 * crash (invariant 9, mirroring SignaturePad/ImageMap). The lazy
 * `loadDocumentPicker()` / `loadImagePicker()` resolve `null` and the choose
 * action degrades to a DISABLED button + a structured
 * `file-picker-lib-unavailable` diagnostic — never a throw.
 *
 * The absence is simulated by mocking each module to an object with no usable
 * picker function, which the loaders resolve to `null`. A separate file keeps
 * the per-file module registry — and thus the memoized loader cache —
 * isolated from the pickers-present suite.
 */
jest.mock('expo-document-picker', () => ({ __esModule: true }));
jest.mock('expo-image-picker', () => ({ __esModule: true }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import { setDiagnosticHandler } from '../../diagnostics';
import '../../factories/register-all';
import {
  FileQuestion,
  loadDocumentPicker,
  loadImagePicker,
} from '../FileQuestion';

function makeFile(extra: Record<string, unknown> = {}, name = 'f'): Question {
  const model = new Model({ elements: [{ type: 'file', name, ...extra }] });
  return model.getQuestionByName(name)!;
}

describe('file — fallback when the picker libs are absent', () => {
  afterEach(() => setDiagnosticHandler(undefined));

  it('loadDocumentPicker() / loadImagePicker() resolve null with no usable export', () => {
    expect(loadDocumentPicker()).toBeNull();
    expect(loadImagePicker()).toBeNull();
  });

  it('renders a disabled choose button, never crashes, no unsupported panel', () => {
    const question = makeFile();
    expect(() =>
      render(<FileQuestion question={question} creator={{}} />)
    ).not.toThrow();
    expect(screen.queryByTestId('unsupported-question-panel')).toBeNull();
    const btn = screen.getByTestId('sv-file-choose-f');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it('pressing the disabled choose button does nothing (no value)', () => {
    const question = makeFile();
    render(<FileQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-file-choose-f'));
    expect(question.isEmpty()).toBe(true);
  });

  it('emits a file-picker-lib-unavailable diagnostic (once)', () => {
    const codes: string[] = [];
    setDiagnosticHandler((payload) => codes.push(payload.code));
    const question = makeFile();
    render(<FileQuestion question={question} creator={{}} />);
    expect(
      codes.filter((c) => c === 'file-picker-lib-unavailable')
    ).toHaveLength(1);
  });
});
