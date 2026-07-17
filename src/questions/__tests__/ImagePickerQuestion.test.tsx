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
