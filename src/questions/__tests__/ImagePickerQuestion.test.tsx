/**
 * `imagepicker` question (task 2.7) — a grid of image CHOICE tiles;
 * tap to select (single or multi). Standalone (no overlay); reuses the
 * 2.10 image-loading (URI policy) + 1.12 choice semantics (plan:
 * docs/design/2.7-imagepicker-plan.md).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { ImagePickerQuestion } from '../ImagePickerQuestion';
import {
  setDiagnosticHandler,
  type DiagnosticPayload,
} from '../../diagnostics';

// 1x1 PNGs (data: — no network; URI policy allows strict inline data images).
const IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function createImagePicker(extra: Record<string, unknown> = {}) {
  const model = new Model({
    elements: [
      {
        type: 'imagepicker',
        name: 'ip',
        showLabel: true,
        choices: [
          { value: 'cat', imageLink: IMG, text: 'Cat' },
          { value: 'dog', imageLink: IMG, text: 'Dog' },
          { value: 'fox', imageLink: IMG, text: 'Fox' },
        ],
        ...extra,
      },
    ],
  });
  return { model, question: model.getQuestionByName('ip')! };
}

describe('ImagePickerQuestion — grid + single select', () => {
  it('renders one tile per visible choice, with its label when showLabel', async () => {
    const { question } = createImagePicker();
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByTestId('imagepicker-item-cat')).toBeTruthy();
    expect(screen.getByTestId('imagepicker-item-dog')).toBeTruthy();
    expect(screen.getByTestId('imagepicker-item-fox')).toBeTruthy();
    expect(screen.getByText('Cat')).toBeTruthy();
  });

  it('tapping a tile commits its value (single-select) and marks it selected', async () => {
    const { question } = createImagePicker();
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    fireEvent.press(screen.getByTestId('imagepicker-item-dog'));
    expect(question.value).toBe('dog');
    expect(
      screen.getByTestId('imagepicker-item-dog').props.accessibilityState
        ?.selected
    ).toBe(true);
    expect(
      screen.getByTestId('imagepicker-item-cat').props.accessibilityState
        ?.selected
    ).toBe(false);
  });

  it('a model value change re-renders the selected tile (reactive binding)', async () => {
    const { question } = createImagePicker();
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    act(() => {
      question.value = 'fox';
    });
    expect(
      screen.getByTestId('imagepicker-item-fox').props.accessibilityState
        ?.selected
    ).toBe(true);
  });
});

describe('ImagePickerQuestion — image policy + content mode', () => {
  it('a blocked remote image URI falls back to the choice text + a diagnostic (fail-closed)', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const model = new Model({
        elements: [
          {
            type: 'imagepicker',
            name: 'ip',
            showLabel: false,
            choices: [
              // Raw remote http (not allowlisted) → policy fail-closed.
              {
                value: 'bad',
                imageLink: 'http://evil.example/x.png',
                text: 'BadImg',
              },
            ],
          },
        ],
      });
      const question = model.getQuestionByName('ip')!;
      render(<ImagePickerQuestion question={question} creator={{}} />);
      await flush();
      expect(screen.getByTestId('imagepicker-fallback-bad')).toBeTruthy();
      expect(screen.getByText('BadImg')).toBeTruthy();
      expect(codes).toContain('image-uri-blocked');
    } finally {
      setDiagnosticHandler(undefined);
    }
  });

  it('contentMode "video" renders nothing + a diagnostic (v1 image-only)', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const model = new Model({
        elements: [
          {
            type: 'imagepicker',
            name: 'ip',
            contentMode: 'video',
            choices: [{ value: 'a' }],
          },
        ],
      });
      const question = model.getQuestionByName('ip')!;
      render(<ImagePickerQuestion question={question} creator={{}} />);
      await flush();
      expect(
        screen.getByTestId('imagepicker-content-mode-unsupported')
      ).toBeTruthy();
      expect(screen.queryByTestId('imagepicker-grid')).toBeNull();
      expect(codes).toContain('image-content-mode-unsupported');
    } finally {
      setDiagnosticHandler(undefined);
    }
  });

  it('no label rendered when showLabel is false', async () => {
    const { question } = createImagePicker({ showLabel: false });
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByTestId('imagepicker-item-cat')).toBeTruthy();
    // The data: image renders, so no text-fallback; label suppressed.
    expect(screen.queryByText('Cat')).toBeNull();
  });
});

describe('ImagePickerQuestion — layout + equality (r1)', () => {
  it('default colCount (0) is FLOW layout — tiles are not forced to 100% width (r1 #5)', async () => {
    const { question } = createImagePicker(); // no colCount → getCurrentColCount() 0
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    const tile = screen.getByTestId('imagepicker-item-cat');
    const widths = ([] as unknown[])
      .concat(tile.props.style)
      .flat()
      .map((s) => (s as { width?: unknown } | null)?.width)
      .filter((w) => w !== undefined);
    expect(widths).not.toContain('100%');
  });

  it('a positive colCount sets %-width tiles', async () => {
    const { question } = createImagePicker({ colCount: 3 });
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    const tile = screen.getByTestId('imagepicker-item-cat');
    const widths = ([] as unknown[])
      .concat(tile.props.style)
      .flat()
      .map((s) => (s as { width?: unknown } | null)?.width);
    expect(widths).toContain(`${100 / 3}%`);
  });
});

describe('ImagePickerQuestion — multi select', () => {
  it('multiSelect toggles array membership per tile', async () => {
    const { question } = createImagePicker({ multiSelect: true });
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    fireEvent.press(screen.getByTestId('imagepicker-item-cat'));
    fireEvent.press(screen.getByTestId('imagepicker-item-fox'));
    expect(JSON.parse(JSON.stringify(question.value))).toEqual(['cat', 'fox']);
    // re-tap removes.
    fireEvent.press(screen.getByTestId('imagepicker-item-cat'));
    expect(JSON.parse(JSON.stringify(question.value))).toEqual(['fox']);
  });
});
