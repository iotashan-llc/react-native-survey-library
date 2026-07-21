/**
 * `image` question — `contentMode: "video"` / `"youtube"` (task 5.5).
 *
 * VIDEO: web renders `<video controls src=locImageLink.renderedHtml>`. RN
 * renders the batteries-included **expo-video** player (`useVideoPlayer` +
 * `VideoView`, lazy-required inside an isolated hooks child — invariant 7)
 * with native controls, `contentFit` mapped from `imageFit`, and the video
 * source loaded through the central URI policy in the **`video`** context
 * (invariant 8, fail-closed). These suites drive expo-video through its
 * root manual mock (`__mocks__/expo-video.tsx`) so the source we hand
 * `useVideoPlayer` and the props we hand `VideoView` are unit-testable; the
 * real player is a DEVICE gate.
 *
 * YOUTUBE: web renders an `<iframe src=embedUrl>`. RN renders core's
 * already-derived embed URL (`https://www.youtube.com/embed/<id>`) in a
 * lazy-required **react-native-webview** (root mock:
 * `__mocks__/react-native-webview.tsx`), validated through the URI policy
 * `video` context — so the consumer allowlists `https://www.youtube.com`
 * (documented-limited path).
 */
import { render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { ImageQuestion, loadExpoVideo, loadWebView } from '../ImageQuestion';
import { UriPolicyContext } from '../../security/UriPolicyContext';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

const MP4 = 'https://cdn.example.com/clip.mp4';
const YT_WATCH = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YT_EMBED = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
const PNG_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

function makeImage(extra: Record<string, unknown> = {}, name = 'q1'): Question {
  const model = new Model({ elements: [{ type: 'image', name, ...extra }] });
  return model.getQuestionByName(name)!;
}

const CDN = { allowedOrigins: ['https://cdn.example.com'] };
const YT = { allowedOrigins: ['https://www.youtube.com'] };

afterEach(() => setDiagnosticHandler(undefined));

describe('image — capability loaders resolve the mocked peers', () => {
  it('loadExpoVideo() / loadWebView() resolve non-null (mocks present)', () => {
    expect(loadExpoVideo()).not.toBeNull();
    expect(loadWebView()).not.toBeNull();
  });
});

describe('image — contentMode "video" (expo-video)', () => {
  it('renders the video player (not the image, not a fallback)', () => {
    const question = makeImage({ contentMode: 'video', imageLink: MP4 });
    render(
      <UriPolicyContext.Provider value={CDN}>
        <ImageQuestion question={question} creator={{}} />
      </UriPolicyContext.Provider>
    );
    expect(screen.getByTestId('sv-video-q1')).toBeTruthy();
    expect(screen.queryByTestId('sv-image-q1')).toBeNull();
    expect(screen.queryByTestId('sv-video-fallback-q1')).toBeNull();
  });

  it('hands useVideoPlayer the policy-validated source + native controls', () => {
    const question = makeImage({ contentMode: 'video', imageLink: MP4 });
    render(
      <UriPolicyContext.Provider value={CDN}>
        <ImageQuestion question={question} creator={{}} />
      </UriPolicyContext.Provider>
    );
    const view = screen.getByTestId('sv-video-q1');
    expect(view.props.player.source).toEqual({ uri: MP4 });
    expect(view.props.nativeControls).toBe(true);
  });

  it.each([
    ['contain', 'contain'],
    ['cover', 'cover'],
    ['fill', 'fill'],
    ['none', 'contain'],
  ])('imageFit "%s" maps to contentFit "%s"', (imageFit, contentFit) => {
    const question = makeImage({
      contentMode: 'video',
      imageLink: MP4,
      imageFit,
    });
    render(
      <UriPolicyContext.Provider value={CDN}>
        <ImageQuestion question={question} creator={{}} />
      </UriPolicyContext.Provider>
    );
    expect(screen.getByTestId('sv-video-q1').props.contentFit).toBe(contentFit);
  });

  it('contentMode "auto" resolves to video by the .mp4 extension', () => {
    const question = makeImage({ contentMode: 'auto', imageLink: MP4 });
    expect((question as unknown as { renderedMode: string }).renderedMode).toBe(
      'video'
    );
    render(
      <UriPolicyContext.Provider value={CDN}>
        <ImageQuestion question={question} creator={{}} />
      </UriPolicyContext.Provider>
    );
    expect(screen.getByTestId('sv-video-q1')).toBeTruthy();
  });

  it('a blocked (non-allowlisted) video URL fails CLOSED to the poster fallback', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    const question = makeImage({
      contentMode: 'video',
      imageLink: MP4,
      altText: 'clip poster',
    });
    render(<ImageQuestion question={question} creator={{}} />);
    expect(screen.queryByTestId('sv-video-q1')).toBeNull();
    expect(screen.getByTestId('sv-video-fallback-q1')).toBeTruthy();
    expect(screen.getByText('clip poster')).toBeTruthy();
    expect(
      payloads.some(
        (p) => p.code === 'image-uri-blocked' && p.source === 'image-question'
      )
    ).toBe(true);
  });
});

describe('image — contentMode "youtube" (react-native-webview)', () => {
  it("renders a WebView to core's derived embed URL when youtube.com is allowlisted", () => {
    const question = makeImage({ contentMode: 'youtube', imageLink: YT_WATCH });
    render(
      <UriPolicyContext.Provider value={YT}>
        <ImageQuestion question={question} creator={{}} />
      </UriPolicyContext.Provider>
    );
    const view = screen.getByTestId('sv-youtube-q1');
    expect(view.props.source).toEqual({ uri: YT_EMBED });
    expect(screen.queryByTestId('sv-youtube-fallback-q1')).toBeNull();
  });

  it('contentMode "auto" resolves to youtube and embeds the watch link', () => {
    const question = makeImage({ contentMode: 'auto', imageLink: YT_WATCH });
    expect((question as unknown as { renderedMode: string }).renderedMode).toBe(
      'youtube'
    );
    render(
      <UriPolicyContext.Provider value={YT}>
        <ImageQuestion question={question} creator={{}} />
      </UriPolicyContext.Provider>
    );
    expect(screen.getByTestId('sv-youtube-q1').props.source).toEqual({
      uri: YT_EMBED,
    });
  });

  it('a non-allowlisted youtube embed fails CLOSED to the documented text fallback', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    const question = makeImage({
      contentMode: 'youtube',
      imageLink: YT_WATCH,
      altText: 'watch on youtube',
    });
    render(<ImageQuestion question={question} creator={{}} />);
    expect(screen.queryByTestId('sv-youtube-q1')).toBeNull();
    expect(screen.getByTestId('sv-youtube-fallback-q1')).toBeTruthy();
    expect(payloads.some((p) => p.code === 'image-uri-blocked')).toBe(true);
  });
});

describe('image — contentMode "image" is unchanged by 5.5', () => {
  it('still renders the plain Image (never a video/youtube surface)', () => {
    const question = makeImage({ contentMode: 'image', imageLink: PNG_DATA });
    render(<ImageQuestion question={question} creator={{}} />);
    expect(screen.getByTestId('sv-image-q1')).toBeTruthy();
    expect(screen.queryByTestId('sv-video-q1')).toBeNull();
    expect(screen.queryByTestId('sv-youtube-q1')).toBeNull();
  });
});
