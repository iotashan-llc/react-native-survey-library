/**
 * `image` question (task 2.10) — static display + scaling modes. RN
 * analog of survey-react-ui's `SurveyQuestionImage` (image.tsx): an RN
 * `Image` bound to `imageLink`/`imageFit`/`renderedWidth`/
 * `renderedHeight`, URI-policy-gated like every bare-Image sink
 * (invariant 8), load/error routed through core's own
 * `onLoadHandler`/`onErrorHandler` (`contentNotLoaded`).
 */
import { act, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { ImageQuestion } from '../ImageQuestion';
import { UriPolicyContext } from '../../security/UriPolicyContext';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

const PNG_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

function createImageQuestion(
  extra: Record<string, unknown> = {},
  name = 'q1'
): Question {
  const model = new Model({
    elements: [{ type: 'image', name, imageLink: PNG_DATA, ...extra }],
  });
  return model.getQuestionByName(name)!;
}

afterEach(() => {
  setDiagnosticHandler(undefined);
});

describe('ImageQuestion — rendering + scaling', () => {
  it('renders an Image with the policy-validated source and serializer-default 200x150 size', () => {
    const question = createImageQuestion();
    render(<ImageQuestion question={question} creator={{}} />);
    const image = screen.getByTestId('sv-image-q1');
    expect(image.props.source).toEqual({ uri: PNG_DATA });
    const style = Object.assign(
      {},
      ...[image.props.style].flat(Infinity).filter(Boolean)
    );
    expect(style.width).toBe(200);
    expect(style.height).toBe(150);
  });

  it.each([
    ['contain', 'contain'],
    ['cover', 'cover'],
    ['fill', 'stretch'],
    ['none', 'center'],
  ])('imageFit "%s" maps to resizeMode "%s"', (imageFit, resizeMode) => {
    const question = createImageQuestion({ imageFit });
    render(<ImageQuestion question={question} creator={{}} />);
    expect(screen.getByTestId('sv-image-q1').props.resizeMode).toBe(resizeMode);
  });

  it('explicit imageWidth/imageHeight win (numeric px via renderedWidth/renderedHeight)', () => {
    const question = createImageQuestion({
      imageWidth: '320',
      imageHeight: '240',
    });
    render(<ImageQuestion question={question} creator={{}} />);
    const style = Object.assign(
      {},
      ...[screen.getByTestId('sv-image-q1').props.style]
        .flat(Infinity)
        .filter(Boolean)
    );
    expect(style.width).toBe(320);
    expect(style.height).toBe(240);
  });

  it('carries the accessible name from renderedAltText (altText || title)', () => {
    const question = createImageQuestion({ altText: 'A tiny dot' });
    render(<ImageQuestion question={question} creator={{}} />);
    expect(screen.getByTestId('sv-image-q1').props.accessibilityLabel).toBe(
      'A tiny dot'
    );
  });
});

describe('ImageQuestion — URI policy (invariant 8, fail-closed)', () => {
  it('a remote origin renders NOTHING without an allowlist, with an image-uri-blocked diagnostic', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    const question = createImageQuestion({
      imageLink: 'https://cdn.example.com/pic.png',
    });
    render(<ImageQuestion question={question} creator={{}} />);
    expect(screen.queryByTestId('sv-image-q1')).toBeNull();
    expect(
      payloads.some(
        (p) => p.code === 'image-uri-blocked' && p.source === 'image-question'
      )
    ).toBe(true);
  });

  it('the survey-scoped policy context admits an allowlisted origin', () => {
    const question = createImageQuestion({
      imageLink: 'https://cdn.example.com/pic.png',
    });
    render(
      <UriPolicyContext.Provider
        value={{ allowedOrigins: ['https://cdn.example.com'] }}
      >
        <ImageQuestion question={question} creator={{}} />
      </UriPolicyContext.Provider>
    );
    expect(screen.getByTestId('sv-image-q1').props.source).toEqual({
      uri: 'https://cdn.example.com/pic.png',
    });
  });
});

describe('ImageQuestion — core load-state contract', () => {
  it('onError routes through core (contentNotLoaded) and swaps to the alt text', () => {
    const question = createImageQuestion({ altText: 'fallback text' });
    render(<ImageQuestion question={question} creator={{}} />);
    const image = screen.getByTestId('sv-image-q1');
    act(() => {
      image.props.onError();
    });
    expect(
      (question as unknown as { contentNotLoaded: boolean }).contentNotLoaded
    ).toBe(true);
    expect(screen.queryByTestId('sv-image-q1')).toBeNull();
    expect(screen.getByText('fallback text')).toBeTruthy();
  });

  it('a non-image contentMode renders null + a structured diagnostic (video deferred; youtube never)', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    const question = createImageQuestion({
      contentMode: 'video',
      imageLink: 'https://cdn.example.com/clip.mp4',
    });
    const { toJSON } = render(
      <ImageQuestion question={question} creator={{}} />
    );
    expect(toJSON()).toBeNull();
    expect(
      payloads.some((p) => p.code === 'image-content-mode-unsupported')
    ).toBe(true);
  });
});
