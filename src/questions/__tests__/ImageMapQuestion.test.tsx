/**
 * `imagemap` question (task 5.4) — a base image with tappable hotspot
 * AREAS (rect/circle/poly shapes) drawn as a react-native-svg overlay.
 * Value is the selected area value(s): a scalar for single-select
 * (`multiSelect:false`, with re-tap toggle-clear), an array for the
 * default multi-select (`multiSelect:true`).
 *
 * The overlay coordinates live in the SOURCE image's pixel space; the
 * `<Svg viewBox="0 0 naturalW naturalH">` sized to the RENDERED box
 * delegates coordinate scaling to react-native-svg — natural dims arrive
 * from the base `<Image onLoad>` (fired by hand here — jest has no native
 * decoder), the rendered box is derived from the container's onLayout
 * width. react-native-svg renders through the root manual mock
 * (`__mocks__/react-native-svg.tsx`) as props-capturing `View` stubs, so
 * assertions target OUR contract (shape geometry, fill/stroke, onPress,
 * a11y) — the real library is exercised by the example-app gates.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { ImageMapQuestion } from '../ImageMapQuestion';
import {
  setDiagnosticHandler,
  type DiagnosticPayload,
} from '../../diagnostics';

// 1x1 data PNG — no network; the URI policy permits strict inline data
// images (same fixture the imagepicker/image suites use).
const IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

const AREAS = [
  { value: 'north', shape: 'rect', coords: '0,0,50,50', text: 'North' },
  { value: 'south', shape: 'circle', coords: '75,75,20', text: 'South' },
  { value: 'east', shape: 'poly', coords: '10,10,90,10,50,90', text: 'East' },
];

function makeImageMap(
  extra: Record<string, unknown> = {},
  name = 'im'
): { model: Model; question: Question } {
  const model = new Model({
    elements: [
      { type: 'imagemap', name, imageLink: IMG, areas: AREAS, ...extra },
    ],
  });
  return { model, question: model.getQuestionByName(name)! };
}

/** Feed the base image its natural (source) pixel size — jest fires no
 * real decode `load` event. */
function loadImage(name = 'im', width = 200, height = 100): void {
  act(() => {
    fireEvent(screen.getByTestId(`imagemap-image-${name}`), 'load', {
      nativeEvent: { source: { width, height } },
    });
  });
}

/** Feed the container its measured width (jest has no Yoga). */
function layoutContainer(name = 'im', width = 200): void {
  act(() => {
    fireEvent(screen.getByTestId(`imagemap-container-${name}`), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
    });
  });
}

describe('ImageMapQuestion — base image + hotspot shapes (not the fallback)', () => {
  it('renders the base image and NOT the unsupported fallback panel', () => {
    const { question } = makeImageMap();
    render(<ImageMapQuestion question={question} creator={{}} />);
    expect(screen.getByTestId('imagemap-image-im')).toBeTruthy();
    expect(screen.queryByTestId('unsupported-question-panel')).toBeNull();
    expect(screen.queryByTestId('imagemap-fallback-im')).toBeNull();
  });

  it('draws one svg shape per visible area once the base image reports its size', () => {
    const { question } = makeImageMap();
    render(<ImageMapQuestion question={question} creator={{}} />);
    // No overlay before the natural size is known.
    expect(screen.queryByTestId('imagemap-area-north')).toBeNull();
    loadImage();
    expect(screen.getByTestId('imagemap-svg-im')).toBeTruthy();
    const rect = screen.getByTestId('imagemap-area-north');
    const circle = screen.getByTestId('imagemap-area-south');
    const poly = screen.getByTestId('imagemap-area-east');
    // Geometry maps the shape's SVG coords straight through (viewBox does
    // the scaling): rect -> x/y/width/height, circle -> cx/cy/r, poly ->
    // points.
    expect({
      x: rect.props.x,
      y: rect.props.y,
      w: rect.props.width,
      h: rect.props.height,
    }).toEqual({ x: 0, y: 0, w: 50, h: 50 });
    expect({
      cx: circle.props.cx,
      cy: circle.props.cy,
      r: circle.props.r,
    }).toEqual({ cx: 75, cy: 75, r: 20 });
    expect(String(poly.props.points).replace(/\s/g, '')).toBe(
      '10,10,90,10,50,90'
    );
  });
});

describe('ImageMapQuestion — coordinate scaling', () => {
  it('sizes the Svg to the rendered box and sets viewBox to the source size', () => {
    const { question } = makeImageMap();
    render(<ImageMapQuestion question={question} creator={{}} />);
    layoutContainer('im', 100); // half the 200px source width
    loadImage('im', 200, 100);
    const svg = screen.getByTestId('imagemap-svg-im');
    // Rendered box is the source scaled to the measured width (aspect
    // preserved); the viewBox carries the SOURCE dimensions so the
    // shapes' source-space coords land correctly.
    expect(svg.props.width).toBe(100);
    expect(svg.props.height).toBe(50);
    expect(svg.props.viewBox).toBe('0 0 200 100');
  });
});

describe('ImageMapQuestion — single select (multiSelect:false)', () => {
  it('tapping an area commits its value and marks it selected', () => {
    const { question } = makeImageMap({ multiSelect: false });
    render(<ImageMapQuestion question={question} creator={{}} />);
    loadImage();
    fireEvent.press(screen.getByTestId('imagemap-area-north'));
    expect(question.value).toBe('north');
    expect(
      screen.getByTestId('imagemap-area-north').props.accessibilityState
        ?.checked
    ).toBe(true);
    expect(
      screen.getByTestId('imagemap-area-south').props.accessibilityState
        ?.checked
    ).toBe(false);
  });

  it('re-tapping the selected area clears the value (allowClear toggle)', () => {
    const { question } = makeImageMap({ multiSelect: false });
    render(<ImageMapQuestion question={question} creator={{}} />);
    loadImage();
    fireEvent.press(screen.getByTestId('imagemap-area-north'));
    expect(question.value).toBe('north');
    fireEvent.press(screen.getByTestId('imagemap-area-north'));
    expect(question.value).toBeUndefined();
  });
});

describe('ImageMapQuestion — multi select (default multiSelect:true)', () => {
  it('toggles multiple areas in/out of the value array', () => {
    const { question } = makeImageMap({ multiSelect: true });
    render(<ImageMapQuestion question={question} creator={{}} />);
    loadImage();
    fireEvent.press(screen.getByTestId('imagemap-area-north'));
    fireEvent.press(screen.getByTestId('imagemap-area-south'));
    expect(question.value).toEqual(['north', 'south']);
    fireEvent.press(screen.getByTestId('imagemap-area-north'));
    expect(question.value).toEqual(['south']);
    expect(
      screen.getByTestId('imagemap-area-south').props.accessibilityState
        ?.checked
    ).toBe(true);
    expect(
      screen.getByTestId('imagemap-area-north').props.accessibilityState
        ?.checked
    ).toBe(false);
  });
});

describe('ImageMapQuestion — selected highlight', () => {
  it('an idle area is transparent-filled; a selected one takes the highlight fill/stroke', () => {
    const { question } = makeImageMap({ multiSelect: false });
    render(<ImageMapQuestion question={question} creator={{}} />);
    loadImage();
    const idle = screen.getByTestId('imagemap-area-north');
    expect(idle.props.fill).toBe('transparent');
    fireEvent.press(idle);
    const selected = screen.getByTestId('imagemap-area-north');
    expect(selected.props.fill).not.toBe('transparent');
    expect(selected.props.stroke).not.toBe('transparent');
    expect(Number(selected.props.strokeWidth)).toBeGreaterThan(0);
  });
});

describe('ImageMapQuestion — read-only', () => {
  it('does not commit a value when the question is read-only', () => {
    const { question } = makeImageMap({ multiSelect: false, readOnly: true });
    render(<ImageMapQuestion question={question} creator={{}} />);
    loadImage();
    fireEvent.press(screen.getByTestId('imagemap-area-north'));
    expect(question.value).toBeUndefined();
    expect(
      screen.getByTestId('imagemap-area-north').props.accessibilityState
        ?.disabled
    ).toBe(true);
  });
});

describe('ImageMapQuestion — accessibility', () => {
  it('each area is a tappable labeled with its area text + selected state', () => {
    const { question } = makeImageMap({ multiSelect: false });
    render(<ImageMapQuestion question={question} creator={{}} />);
    loadImage();
    const area = screen.getByTestId('imagemap-area-south');
    expect(area.props.accessibilityLabel).toBe('South');
    expect(area.props.accessibilityRole).toBe('radio');
    expect(area.props.accessibilityState?.checked).toBe(false);
  });
});

describe('ImageMapQuestion — image URI policy (fail-closed)', () => {
  it('drops a non-allowlisted remote base image with a diagnostic, without crashing', () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const { question } = makeImageMap(
        { imageLink: 'http://evil.example/x.png' },
        'bad'
      );
      expect(() =>
        render(<ImageMapQuestion question={question} creator={{}} />)
      ).not.toThrow();
      expect(codes).toContain('image-uri-blocked');
    } finally {
      setDiagnosticHandler(undefined);
    }
  });
});
