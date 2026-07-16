/**
 * `image` question (task 2.10) — static display + scaling modes. RN
 * analog of survey-react-ui's `SurveyQuestionImage` (image.tsx:28-40).
 *
 * Contract consumed from core (invariant 6 — no re-derivation):
 * - `locImageLink` — localizable link; the class subscribes its
 *   `onStringChanged` (add/remove, never clobbering upstream's single
 *   `onChanged` slot) so locale/expression updates re-render (review
 *   round 1 #3).
 * - `renderedMode` — only `"image"` renders in v1; `"video"` is deferred
 *   and `"youtube"` is a documented won't-support — both emit a
 *   structured diagnostic and render nothing (invariant 9).
 * - `imageFit` → RN `resizeMode` (contain/cover/fill→stretch/none→center).
 * - `renderedWidth`/`renderedHeight` — numeric px (serializer defaults
 *   200×150); an `undefined` dimension is omitted (LogoImage's `auto`
 *   caveat applies).
 * - `onLoadHandler`/`onErrorHandler`/`contentNotLoaded` — RN `Image`
 *   load events route INTO core. After an error the alt text renders,
 *   but a CHANGED link re-mounts the image so it can recover (review
 *   round 1 #2 — core never resets `contentNotLoaded` itself, and web
 *   recovers because its hidden `<img>` stays mounted).
 *
 * URI policy (invariant 8): `validateUri(…, 'image', prop ?? context)`,
 * fail-closed; the SINK CONSUMES THE CANONICAL string (review round 1
 * #1 — validate-then-use-raw breaks normalization/base resolution). The
 * policy-consuming body is its own function component so a context-only
 * change still runs the commit-phase diagnostic flush (review round 1
 * #4).
 */
import * as React from 'react';
import { Image, Text, View } from 'react-native';
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
  const result = validateUri(rawUri, 'image', uriConfig ?? contextPolicy);

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
  }, [rawUri, blockedReason]);

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
    if (!mode || this.reportedMode === mode) return;
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

    if (question.renderedMode !== 'image') {
      this.pendingMode = question.renderedMode;
      return null;
    }

    const rawUri = question.locImageLink.renderedHtml;
    if (!rawUri) return null;

    return (
      <PolicyGatedImage
        question={question}
        rawUri={rawUri}
        uriConfig={this.props.uriConfig}
      />
    );
  }
}
