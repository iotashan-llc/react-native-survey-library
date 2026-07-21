/**
 * `image` question media fallbacks (task 5.5): when the batteries-included
 * media peers are ABSENT — jest without the peer, or a consumer who has not
 * installed them — the video/youtube branches must NOT crash (invariant 9).
 *
 * - `contentMode: "video"` with `expo-video` absent → `loadExpoVideo()`
 *   resolves null, the branch degrades to a non-throwing poster fallback
 *   (the alt text) + an `image-video-lib-unavailable` diagnostic.
 * - `contentMode: "youtube"` with `react-native-webview` absent →
 *   `loadWebView()` resolves null, the branch degrades to a documented text
 *   fallback (the alt text / link) + an `image-youtube-webview-unavailable`
 *   diagnostic.
 *
 * Absence is simulated by mocking each module to an object with no usable
 * component/hook export, which the lazy loaders resolve to null (their
 * try/catch also covers a hard MODULE_NOT_FOUND for a truly uninstalled
 * peer). A separate file keeps the per-file module registry — and thus the
 * memoized caches — isolated from the peers-present suite. The URLs are
 * allowlisted so the ONLY reason a fallback shows is the missing peer (not
 * the URI policy).
 */
jest.mock('expo-video', () => ({ __esModule: true }));
jest.mock('react-native-webview', () => ({ __esModule: true }));

import { render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { ImageQuestion, loadExpoVideo, loadWebView } from '../ImageQuestion';
import { UriPolicyContext } from '../../security/UriPolicyContext';
import { setDiagnosticHandler } from '../../diagnostics';

const MP4 = 'https://cdn.example.com/clip.mp4';
const YT_WATCH = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function makeImage(extra: Record<string, unknown> = {}, name = 'q1'): Question {
  const model = new Model({ elements: [{ type: 'image', name, ...extra }] });
  return model.getQuestionByName(name)!;
}

const CDN = { allowedOrigins: ['https://cdn.example.com'] };
const YT = { allowedOrigins: ['https://www.youtube.com'] };

afterEach(() => setDiagnosticHandler(undefined));

describe('image — media peers absent', () => {
  it('loadExpoVideo() / loadWebView() resolve null', () => {
    expect(loadExpoVideo()).toBeNull();
    expect(loadWebView()).toBeNull();
  });

  it('video mode degrades to the poster fallback (no player, no crash)', () => {
    const question = makeImage({
      contentMode: 'video',
      imageLink: MP4,
      altText: 'clip poster',
    });
    expect(() =>
      render(
        <UriPolicyContext.Provider value={CDN}>
          <ImageQuestion question={question} creator={{}} />
        </UriPolicyContext.Provider>
      )
    ).not.toThrow();
    expect(screen.queryByTestId('sv-video-q1')).toBeNull();
    expect(screen.getByTestId('sv-video-fallback-q1')).toBeTruthy();
    expect(screen.getByText('clip poster')).toBeTruthy();
  });

  it('emits an image-video-lib-unavailable diagnostic (once)', () => {
    const codes: string[] = [];
    setDiagnosticHandler((p) => codes.push(p.code));
    const question = makeImage({ contentMode: 'video', imageLink: MP4 });
    render(
      <UriPolicyContext.Provider value={CDN}>
        <ImageQuestion question={question} creator={{}} />
      </UriPolicyContext.Provider>
    );
    expect(
      codes.filter((c) => c === 'image-video-lib-unavailable')
    ).toHaveLength(1);
  });

  it('youtube mode degrades to the documented text fallback (no WebView, no crash)', () => {
    const question = makeImage({
      contentMode: 'youtube',
      imageLink: YT_WATCH,
      altText: 'watch on youtube',
    });
    expect(() =>
      render(
        <UriPolicyContext.Provider value={YT}>
          <ImageQuestion question={question} creator={{}} />
        </UriPolicyContext.Provider>
      )
    ).not.toThrow();
    expect(screen.queryByTestId('sv-youtube-q1')).toBeNull();
    expect(screen.getByTestId('sv-youtube-fallback-q1')).toBeTruthy();
    expect(screen.getByText('watch on youtube')).toBeTruthy();
  });

  it('emits an image-youtube-webview-unavailable diagnostic (once)', () => {
    const codes: string[] = [];
    setDiagnosticHandler((p) => codes.push(p.code));
    const question = makeImage({ contentMode: 'youtube', imageLink: YT_WATCH });
    render(
      <UriPolicyContext.Provider value={YT}>
        <ImageQuestion question={question} creator={{}} />
      </UriPolicyContext.Provider>
    );
    expect(
      codes.filter((c) => c === 'image-youtube-webview-unavailable')
    ).toHaveLength(1);
  });
});
