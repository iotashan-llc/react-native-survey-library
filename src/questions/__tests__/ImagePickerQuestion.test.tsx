/**
 * `imagepicker` question (task 2.7) — a grid of image CHOICE tiles;
 * tap to select (single or multi). Standalone (no overlay); reuses the
 * 2.10 image-loading (URI policy) + 1.12 choice semantics (plan:
 * docs/design/2.7-imagepicker-plan.md).
 */
import { StyleSheet } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { ImagePickerQuestion } from '../ImagePickerQuestion';
import { SurveyThemeProvider } from '../../theme-rn/provider';
import { resolveTheme } from '../../theme-core/resolve';
import { buildItemRecipe } from '../../theme-rn/recipes/item';
import {
  setDiagnosticHandler,
  type DiagnosticPayload,
} from '../../diagnostics';

function flatStyle(node: {
  props: { style?: StyleProp<ViewStyle | TextStyle> };
}) {
  return (StyleSheet.flatten(node.props.style) ?? {}) as Record<
    string,
    unknown
  >;
}

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
    // radio a11y uses `checked` (not `selected`) — matches the approved
    // Radiogroup/ButtonGroup renderers (r1 #6).
    expect(
      screen.getByTestId('imagepicker-item-dog').props.accessibilityState
        ?.checked
    ).toBe(true);
    expect(
      screen.getByTestId('imagepicker-item-cat').props.accessibilityState
        ?.checked
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
        ?.checked
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

describe('ImagePickerQuestion — structural (r1 rewrite)', () => {
  it('single-select grid is a radiogroup with the question label (r1 #6)', async () => {
    const { question } = createImagePicker({ title: 'Animals' });
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    const grid = screen.getByTestId('imagepicker-grid');
    expect(grid.props.accessibilityRole).toBe('radiogroup');
    expect(grid.props.accessibilityLabel).toBe('Animals');
  });

  it('a choicesEnableIf-disabled tile is not pressable + announces disabled (r1 #4)', async () => {
    const model = new Model({
      elements: [
        {
          type: 'imagepicker',
          name: 'ip',
          choicesEnableIf: '{item} = "cat"',
          choices: [
            { value: 'cat', imageLink: IMG, text: 'Cat' },
            { value: 'dog', imageLink: IMG, text: 'Dog' },
          ],
        },
      ],
    });
    const question = model.getQuestionByName('ip')!;
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    const dog = screen.getByTestId('imagepicker-item-dog');
    expect(dog.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(dog);
    expect(question.isEmpty()).toBe(true); // press ignored
    // the enabled one still works.
    fireEvent.press(screen.getByTestId('imagepicker-item-cat'));
    expect(question.value).toBe('cat');
  });

  it('an image onError shows the choice text + routes to core onErrorHandler (r1 #2)', async () => {
    const { question } = createImagePicker({ showLabel: false });
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    const img = screen.getByTestId('imagepicker-image-cat');
    act(() => {
      fireEvent(img, 'error', { nativeEvent: { error: 'boom' } });
    });
    // Core marks the item contentNotLoaded → the tile falls back to text.
    expect(screen.getByTestId('imagepicker-fallback-cat')).toBeTruthy();
  });

  it('a successful image load routes RN source dims into core onContentLoaded without throwing (r2 #1)', async () => {
    const { question } = createImagePicker({ showLabel: false });
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    const img = screen.getByTestId('imagepicker-image-cat');
    // RN Image onLoad shape: { nativeEvent: { source: { width, height } } }.
    // Core reads event.target.naturalWidth/Height — a flat payload throws.
    act(() => {
      fireEvent(img, 'load', {
        nativeEvent: { source: { width: 10, height: 20 } },
      });
    });
    // No throw + the tile is still enabled + the image (not the fallback)
    // remains mounted.
    expect(screen.getByTestId('imagepicker-image-cat')).toBeTruthy();
    expect(screen.queryByTestId('imagepicker-fallback-cat')).toBeNull();
    expect(
      screen.getByTestId('imagepicker-item-cat').props.accessibilityState
        ?.disabled
    ).toBe(false);
  });

  it('an in-place item enable change re-renders that tile (per-item reactivity, r1 #3)', async () => {
    const model = new Model({
      elements: [
        {
          type: 'imagepicker',
          name: 'ip',
          choicesEnableIf: '{trigger} = 1',
          choices: [{ value: 'cat', imageLink: IMG, text: 'Cat' }],
        },
      ],
    });
    const question = model.getQuestionByName('ip')!;
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    expect(
      screen.getByTestId('imagepicker-item-cat').props.accessibilityState
        ?.disabled
    ).toBe(true);
    act(() => {
      model.setValue('trigger', 1);
    });
    expect(
      screen.getByTestId('imagepicker-item-cat').props.accessibilityState
        ?.disabled
    ).toBe(false);
  });
});

describe('ImagePickerQuestion — theme + diagnostics (r3)', () => {
  it('re-tapping a selected single-select tile keeps it selected (no allowClear, r3 #3)', async () => {
    const { question } = createImagePicker();
    render(<ImagePickerQuestion question={question} creator={{}} />);
    await flush();
    fireEvent.press(screen.getByTestId('imagepicker-item-dog'));
    expect(question.value).toBe('dog');
    // survey-core 2.5.33 imagepicker has no allowClear — re-tap does NOT clear.
    fireEvent.press(screen.getByTestId('imagepicker-item-dog'));
    expect(question.value).toBe('dog');
  });

  it('the unsupported-content-mode diagnostic is emitted once from commit phase, not render (r3 #1)', async () => {
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
      const view = render(
        <ImagePickerQuestion question={question} creator={{}} />
      );
      await flush();
      // A re-render must NOT re-emit — deduped by reportedMode.
      view.rerender(<ImagePickerQuestion question={question} creator={{}} />);
      await flush();
      expect(
        codes.filter((c) => c === 'image-content-mode-unsupported')
      ).toHaveLength(1);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });

  it('an empty (non-image) contentMode still reports unsupported (r4 — falsy-guard gap)', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const model = new Model({
        elements: [
          {
            type: 'imagepicker',
            name: 'ip',
            // survey-core preserves '' (does not default it to 'image').
            contentMode: '',
            choices: [{ value: 'a' }],
          },
        ],
      });
      const question = model.getQuestionByName('ip')!;
      expect(question.contentMode).toBe('');
      render(<ImagePickerQuestion question={question} creator={{}} />);
      await flush();
      expect(
        screen.getByTestId('imagepicker-content-mode-unsupported')
      ).toBeTruthy();
      expect(codes).toContain('image-content-mode-unsupported');
    } finally {
      setDiagnosticHandler(undefined);
    }
  });

  it('selection accent + label color are theme-derived, not hardcoded (r3 #2, under a theme provider)', async () => {
    const { question } = createImagePicker();
    act(() => {
      question.value = 'cat';
    });
    render(
      <SurveyThemeProvider theme={{ themeName: 'DefaultDark' }}>
        <ImagePickerQuestion question={question} creator={{}} />
      </SurveyThemeProvider>
    );
    await flush();
    // Expected values come from the SAME theme's recipe build the component
    // consumes. The recipe emits `rgba(...)` tokens, so these `.toBe`
    // assertions fail if the code reverts to a hardcoded hex (e.g. the old
    // '#19b394' border) — that literal is not equal to 'rgba(25,179,148,1)'.
    const recipe = buildItemRecipe(resolveTheme({ themeName: 'DefaultDark' }), {
      platform: { os: 'ios' },
    });
    const expectedBorder = (
      StyleSheet.flatten(recipe.fragments.decoratorChecked) as ViewStyle
    ).backgroundColor;
    const expectedLabelColor = (
      StyleSheet.flatten(recipe.fragments.label) as TextStyle
    ).color;
    const selectedTile = flatStyle(screen.getByTestId('imagepicker-item-cat'));
    expect(selectedTile.borderColor).toBe(expectedBorder);
    expect(String(expectedBorder)).toMatch(/^rgba?\(/); // not a hex hardcode
    const label = flatStyle(screen.getByText('Cat'));
    expect(label.color).toBe(expectedLabelColor);
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
