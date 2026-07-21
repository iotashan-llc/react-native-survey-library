/**
 * `image` question (task 2.10 image; task 5.5 video/youtube) — static
 * display + scaling modes. RN analog of survey-react-ui's
 * `SurveyQuestionImage` (image.tsx): an `<img>` (image), `<video controls>`
 * (video) or `<iframe>` (youtube) chosen by `renderedMode`.
 *
 * Contract consumed from core (invariant 6 — no re-derivation):
 * - `locImageLink` — localizable link; the class subscribes its
 *   `onStringChanged` (add/remove, never clobbering upstream's single
 *   `onChanged` slot) so locale/expression updates re-render (review
 *   round 1 #3). For `renderedMode === "youtube"` core has ALREADY
 *   transformed `renderedHtml` into the embed URL
 *   (`https://www.youtube.com/embed/<id>`) via `getCorrectImageLink`.
 * - `renderedMode` — `"image"` renders an RN `Image`; `"video"` renders an
 *   expo-video player; `"youtube"` renders a react-native-webview to the
 *   embed URL. Any OTHER mode (survey-core preserves an empty
 *   `contentMode: ""` as `renderedMode: ""`) is unsupported: it renders
 *   nothing + emits `image-content-mode-unsupported` (invariant 9).
 * - `imageFit` → RN `resizeMode` (image) / expo-video `contentFit` (video).
 * - `renderedWidth`/`renderedHeight` — numeric px (serializer defaults
 *   200×150); an `undefined` dimension is omitted (LogoImage's `auto`
 *   caveat applies).
 * - `onLoadHandler`/`onErrorHandler`/`contentNotLoaded` — RN `Image` load
 *   events (image mode only) route INTO core.
 *
 * URI policy (invariant 8): the image source validates in the `'image'`
 * context; the video source AND the youtube embed URL validate in the
 * `'video'` context (both are remote media loaded automatically at render,
 * so both are fail-closed automatic-fetch — a non-allowlisted origin is
 * dropped with an `image-uri-blocked` diagnostic and a non-throwing
 * fallback). The SINK CONSUMES THE CANONICAL string (review round 1 #1).
 *
 * Capability peers (invariant 7): `expo-video` (video) and
 * `react-native-webview` (youtube) are batteries-included peerDependencies,
 * LAZY-REQUIRED inside isolated hooks children. When a peer is absent the
 * branch degrades to a non-throwing poster/text fallback + a structured
 * `image-video-lib-unavailable` / `image-youtube-webview-unavailable`
 * diagnostic — never a crash. Playback/embed are DEVICE gates (the peers
 * are not installed here; jest drives OUR contract through root manual
 * mocks). YouTube is a documented-limited path.
 */
import * as React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ImageProps } from 'react-native';
import type { Base } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { validateUri } from '../security/uri-policy';
import type { UriPolicyConfig } from '../security/uri-policy';
import { UriPolicyContext } from '../security/UriPolicyContext';
import { reportDiagnostic } from '../diagnostics';

type ImageResizeMode = NonNullable<ImageProps['resizeMode']>;

const RESIZE_MODE_BY_IMAGE_FIT: Record<string, ImageResizeMode> = {
  contain: 'contain',
  cover: 'cover',
  fill: 'stretch',
  none: 'center',
};

/** expo-video `contentFit` (contain/cover/fill only — no `none`/`center`
 * analog, so `none` degrades to `contain`). */
type VideoContentFit = 'contain' | 'cover' | 'fill';
const CONTENT_FIT_BY_IMAGE_FIT: Record<string, VideoContentFit> = {
  contain: 'contain',
  cover: 'cover',
  fill: 'fill',
  none: 'contain',
};

interface LocStringLike {
  renderedHtml: string;
  onStringChanged: {
    add(fn: () => void): void;
    remove(fn: () => void): void;
  };
}

interface ImageQuestionModel {
  name: string;
  locImageLink: LocStringLike;
  renderedMode: string;
  imageFit: string;
  renderedWidth: number | undefined;
  renderedHeight: number | undefined;
  renderedAltText: string;
  contentNotLoaded: boolean;
  onLoadHandler(): void;
  onErrorHandler(): void;
}

export interface ImageQuestionProps extends QuestionElementBaseProps {
  /** Explicit override; otherwise the survey-scoped context applies. */
  uriConfig?: UriPolicyConfig;
}

// ————————————————————————————————————————————————————————————————
// Capability loaders (lazy-required; absent -> non-throwing fallback)
// ————————————————————————————————————————————————————————————————

type ComponentLike = React.ComponentType<Record<string, unknown>>;

interface ExpoVideoModule {
  useVideoPlayer: (
    source: unknown,
    setup?: (player: unknown) => void
  ) => unknown;
  VideoView: ComponentLike;
}

let cachedExpoVideo: ExpoVideoModule | null | undefined;

/**
 * Lazy-require `expo-video` (invariant 7). Returns null when the peer is
 * unavailable (jest without it, or a consumer who has not installed the
 * batteries-included peer) — the caller then renders the non-throwing
 * fallback. Memoized so the resolve cost is paid once per module registry.
 */
export function loadExpoVideo(): ExpoVideoModule | null {
  if (cachedExpoVideo !== undefined) return cachedExpoVideo;
  try {
    const mod = require('expo-video') as Record<string, unknown>;
    const useVideoPlayer = mod.useVideoPlayer as
      ExpoVideoModule['useVideoPlayer'] | undefined;
    const VideoView = (mod.VideoView ?? mod.default) as
      ComponentLike | undefined;
    cachedExpoVideo =
      typeof useVideoPlayer === 'function' && isRenderable(VideoView)
        ? { useVideoPlayer, VideoView: VideoView as ComponentLike }
        : null;
  } catch {
    cachedExpoVideo = null;
  }
  return cachedExpoVideo;
}

let cachedWebView: ComponentLike | null | undefined;

/**
 * Lazy-require `react-native-webview` (invariant 7). Returns null when the
 * peer is unavailable — the caller then renders the documented text
 * fallback. Memoized per module registry.
 */
export function loadWebView(): ComponentLike | null {
  if (cachedWebView !== undefined) return cachedWebView;
  try {
    const mod = require('react-native-webview') as Record<string, unknown>;
    const candidate = (mod.WebView ?? mod.default) as ComponentLike | undefined;
    cachedWebView = isRenderable(candidate)
      ? (candidate as ComponentLike)
      : null;
  } catch {
    cachedWebView = null;
  }
  return cachedWebView;
}

/** A usable React component export: a function (function component /
 * forwardRef render) or a component object with `$$typeof` (memo /
 * forwardRef result). */
function isRenderable(candidate: unknown): boolean {
  return (
    typeof candidate === 'function' ||
    (typeof candidate === 'object' &&
      candidate !== null &&
      '$$typeof' in (candidate as object))
  );
}

// ————————————————————————————————————————————————————————————————
// Image branch (function child — consumes UriPolicyContext, invariant 8)
// ————————————————————————————————————————————————————————————————

/**
 * Policy-consuming body — a FUNCTION component so the context read and
 * the commit-phase diagnostic flush live on the same updating component
 * (a UriPolicyContext-only change re-runs this component's effect).
 */
function PolicyGatedImage(props: {
  question: ImageQuestionModel;
  rawUri: string;
  uriConfig: UriPolicyConfig | undefined;
}): React.JSX.Element | null {
  const { question, rawUri, uriConfig } = props;
  const contextPolicy = React.useContext(UriPolicyContext);
  const effectivePolicy = uriConfig ?? contextPolicy;
  const result = validateUri(rawUri, 'image', effectivePolicy);

  // After an error, remember WHICH uri failed: the alt text shows only
  // while the failed link is still current — a changed link re-mounts
  // the Image so onLoad/onError can run again (recovery parity with
  // web's always-mounted hidden <img>).
  const lastErroredUriRef = React.useRef<string | null>(null);

  const blockedReason = result.ok ? undefined : result.reason;
  React.useEffect(() => {
    if (blockedReason !== undefined) {
      reportDiagnostic({
        code: 'image-uri-blocked',
        source: 'image-question',
        uri: rawUri,
        reason: blockedReason,
      });
    }
    // effectivePolicy in deps (review round 2): a DIFFERENT policy that
    // still blocks the same uri for the same reason is a new decision —
    // it flushes its own diagnostic.
  }, [rawUri, blockedReason, effectivePolicy]);

  if (!result.ok) return null;

  if (question.contentNotLoaded && lastErroredUriRef.current === rawUri) {
    // Web hides the broken <img> (display:none); a native screen gets
    // the accessible alt text instead (documented delta).
    return <Text>{question.renderedAltText}</Text>;
  }

  const width = question.renderedWidth;
  const height = question.renderedHeight;
  return (
    <View>
      <Image
        testID={`sv-image-${question.name}`}
        source={{ uri: result.canonical }}
        resizeMode={RESIZE_MODE_BY_IMAGE_FIT[question.imageFit] ?? 'contain'}
        accessibilityLabel={question.renderedAltText}
        onLoad={() => {
          lastErroredUriRef.current = null;
          question.onLoadHandler();
        }}
        onError={() => {
          lastErroredUriRef.current = rawUri;
          question.onErrorHandler();
        }}
        style={{
          ...(width !== undefined ? { width } : null),
          ...(height !== undefined ? { height } : null),
        }}
      />
    </View>
  );
}

// ————————————————————————————————————————————————————————————————
// Video branch (task 5.5) — expo-video, lazy-required
// ————————————————————————————————————————————————————————————————

/** Dimension style for a media surface (width/height omitted when core
 * reports `undefined`, matching the image branch). */
function dimensionStyle(
  width: number | undefined,
  height: number | undefined
): { width?: number; height?: number } {
  return {
    ...(width !== undefined ? { width } : null),
    ...(height !== undefined ? { height } : null),
  };
}

/** No autoplay / no loop — parity with web's `<video controls>` (which
 * neither autoplays nor loops). Stable module-level ref so the player
 * setup callback identity never churns. */
function configureVideoPlayer(player: unknown): void {
  const p = player as { loop?: boolean; muted?: boolean };
  p.loop = false;
}

/**
 * Isolated hooks child: only mounted when expo-video resolved AND the
 * source passed policy, so `useVideoPlayer` is called unconditionally at
 * this component's top level (rules-of-hooks safe).
 */
function VideoPlayer(props: {
  lib: ExpoVideoModule;
  question: ImageQuestionModel;
  source: { uri: string };
  contentFit: VideoContentFit;
  width: number | undefined;
  height: number | undefined;
}): React.JSX.Element {
  const { lib, question, source, contentFit, width, height } = props;
  const { useVideoPlayer, VideoView } = lib;
  const player = useVideoPlayer(source, configureVideoPlayer);
  return (
    <VideoView
      testID={`sv-video-${question.name}`}
      player={player}
      nativeControls
      contentFit={contentFit}
      accessibilityLabel={question.renderedAltText}
      style={dimensionStyle(width, height)}
    />
  );
}

function PolicyGatedVideo(props: {
  question: ImageQuestionModel;
  rawUri: string;
  uriConfig: UriPolicyConfig | undefined;
}): React.JSX.Element {
  const { question, rawUri, uriConfig } = props;
  const contextPolicy = React.useContext(UriPolicyContext);
  const effectivePolicy = uriConfig ?? contextPolicy;
  const result = validateUri(rawUri, 'video', effectivePolicy);
  const lib = loadExpoVideo();

  const blockedReason = result.ok ? undefined : result.reason;
  const libMissing = lib === null;
  React.useEffect(() => {
    if (blockedReason !== undefined) {
      reportDiagnostic({
        code: 'image-uri-blocked',
        source: 'image-question',
        uri: rawUri,
        reason: blockedReason,
      });
    } else if (libMissing) {
      reportDiagnostic({
        code: 'image-video-lib-unavailable',
        questionName: question.name,
      });
    }
  }, [rawUri, blockedReason, libMissing, effectivePolicy, question.name]);

  if (!result.ok || !lib) {
    return (
      <MediaFallback
        testID={`sv-video-fallback-${question.name}`}
        text={question.renderedAltText}
      />
    );
  }

  return (
    <VideoPlayer
      lib={lib}
      question={question}
      source={{ uri: result.canonical }}
      contentFit={CONTENT_FIT_BY_IMAGE_FIT[question.imageFit] ?? 'contain'}
      width={question.renderedWidth}
      height={question.renderedHeight}
    />
  );
}

// ————————————————————————————————————————————————————————————————
// YouTube branch (task 5.5) — react-native-webview, lazy-required
// ————————————————————————————————————————————————————————————————

function YoutubeEmbed(props: {
  question: ImageQuestionModel;
  rawUri: string;
  uriConfig: UriPolicyConfig | undefined;
}): React.JSX.Element {
  const { question, rawUri, uriConfig } = props;
  const contextPolicy = React.useContext(UriPolicyContext);
  const effectivePolicy = uriConfig ?? contextPolicy;
  // Core already produced the youtube.com/embed/<id> URL in renderedHtml;
  // the WebView is an automatic media surface, so it takes the same
  // fail-closed `'video'` context as the direct video source (the consumer
  // allowlists `https://www.youtube.com` — documented-limited path).
  const result = validateUri(rawUri, 'video', effectivePolicy);
  const WebView = loadWebView();

  const blockedReason = result.ok ? undefined : result.reason;
  const webviewMissing = WebView === null;
  React.useEffect(() => {
    if (blockedReason !== undefined) {
      reportDiagnostic({
        code: 'image-uri-blocked',
        source: 'image-question',
        uri: rawUri,
        reason: blockedReason,
      });
    } else if (webviewMissing) {
      reportDiagnostic({
        code: 'image-youtube-webview-unavailable',
        questionName: question.name,
      });
    }
  }, [rawUri, blockedReason, webviewMissing, effectivePolicy, question.name]);

  if (!result.ok || !WebView) {
    return (
      <MediaFallback
        testID={`sv-youtube-fallback-${question.name}`}
        text={question.renderedAltText || rawUri}
      />
    );
  }

  return (
    <WebView
      testID={`sv-youtube-${question.name}`}
      source={{ uri: result.canonical }}
      accessibilityLabel={question.renderedAltText}
      style={dimensionStyle(question.renderedWidth, question.renderedHeight)}
    />
  );
}

/** Shared non-throwing media fallback: a labeled container with a text
 * poster (the alt text, or the link for youtube). */
function MediaFallback(props: {
  testID: string;
  text: string;
}): React.JSX.Element {
  return (
    <View testID={props.testID} style={localStyles.fallback}>
      <Text style={localStyles.fallbackText}>{props.text}</Text>
    </View>
  );
}

// ————————————————————————————————————————————————————————————————
// The class-reactive question renderer
// ————————————————————————————————————————————————————————————————

export class ImageQuestion extends QuestionElementBase<ImageQuestionProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get image(): ImageQuestionModel {
    return this.questionBase as unknown as ImageQuestionModel;
  }

  /** locImageLink is a separate LocalizableString channel — the base's
   * question-property subscription does not observe it (review round 1
   * #3). add/remove on the EventBase; upstream's single-slot
   * `onChanged` callback is never touched. */
  private subscribedLocLink: LocStringLike | null = null;
  private readonly handleLinkChanged = (): void => {
    this.forceUpdate();
  };

  private syncLocLinkSubscription(): void {
    const next = this.image.locImageLink ?? null;
    if (next === this.subscribedLocLink) return;
    this.subscribedLocLink?.onStringChanged.remove(this.handleLinkChanged);
    next?.onStringChanged.add(this.handleLinkChanged);
    this.subscribedLocLink = next;
  }

  /** Unsupported-mode diagnostic — model-driven, class commit phase. */
  private pendingMode: string | undefined;
  private reportedMode: string | undefined;

  componentDidMount(): void {
    super.componentDidMount();
    this.syncLocLinkSubscription();
    this.flushModeDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.syncLocLinkSubscription();
    this.flushModeDiagnostic();
  }

  componentWillUnmount(): void {
    this.subscribedLocLink?.onStringChanged.remove(this.handleLinkChanged);
    this.subscribedLocLink = null;
    super.componentWillUnmount();
  }

  private flushModeDiagnostic(): void {
    const mode = this.pendingMode;
    // `mode === undefined` (not `!mode`): survey-core preserves an empty
    // `contentMode: ""` (renderedMode "" — an unsupported non-image mode
    // that must still report); a falsy guard silently dropped it.
    if (mode === undefined || this.reportedMode === mode) return;
    this.reportedMode = mode;
    reportDiagnostic({
      code: 'image-content-mode-unsupported',
      questionName: this.image.name,
      contentMode: mode,
    });
  }

  protected renderElement(): React.JSX.Element | null {
    const question = this.image;
    this.pendingMode = undefined;
    const mode = question.renderedMode;
    const rawUri = question.locImageLink.renderedHtml;
    const uriConfig = this.props.uriConfig;

    if (mode === 'image') {
      if (!rawUri) return null;
      return (
        <PolicyGatedImage
          question={question}
          rawUri={rawUri}
          uriConfig={uriConfig}
        />
      );
    }

    if (mode === 'video') {
      if (!rawUri) return null;
      return (
        <PolicyGatedVideo
          question={question}
          rawUri={rawUri}
          uriConfig={uriConfig}
        />
      );
    }

    if (mode === 'youtube') {
      // Core blanks a youtube renderedHtml for a non-youtube link.
      if (!rawUri) return null;
      return (
        <YoutubeEmbed
          question={question}
          rawUri={rawUri}
          uriConfig={uriConfig}
        />
      );
    }

    // Genuinely unsupported/unknown mode (e.g. empty contentMode "").
    this.pendingMode = mode;
    return null;
  }
}

const localStyles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  fallbackText: { textAlign: 'center' },
});
