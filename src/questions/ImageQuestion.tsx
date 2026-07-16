/**
 * `image` question (task 2.10) — static display + scaling modes. RN
 * analog of survey-react-ui's `SurveyQuestionImage` (image.tsx:28-40).
 *
 * Contract consumed from core (invariant 6 — no re-derivation):
 * - `locImageLink.renderedHtml` — the resolved link (localizable).
 * - `renderedMode` — only `"image"` renders in v1; `"video"` is deferred
 *   (expo-video arrives with a later media task) and `"youtube"` is a
 *   documented won't-support — both emit a structured diagnostic and
 *   render nothing (invariant 9).
 * - `imageFit` → RN `resizeMode` via the same object-fit map the header
 *   logo uses (contain/cover/fill→stretch/none→center).
 * - `renderedWidth`/`renderedHeight` — numeric px (serializer defaults
 *   200×150); an `undefined` dimension is omitted (same `auto` caveat as
 *   LogoImage — RN has no synchronous intrinsic sizing).
 * - `onLoadHandler`/`onErrorHandler` — RN `Image` onLoad/onError route
 *   INTO core; `contentNotLoaded` (web hides the img and shows nothing)
 *   renders the `renderedAltText` instead — a text fallback beats web's
 *   silent blank on a native screen (documented delta).
 *
 * URI policy (invariant 8): the link passes `validateUri(…, 'image',
 * prop ?? UriPolicyContext)` — fail-closed, `image-uri-blocked`
 * diagnostic from commit lifecycles, exactly the LogoImage pattern.
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

interface ImageQuestionModel {
  name: string;
  locImageLink: { renderedHtml: string };
  renderedMode: string;
  contentMode: string;
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

export class ImageQuestion extends QuestionElementBase<ImageQuestionProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get image(): ImageQuestionModel {
    return this.questionBase as unknown as ImageQuestionModel;
  }

  /** Set during render, reported from commit lifecycles (repo pattern:
   * no diagnostics during a discardable render), deduped per payload. */
  private pendingBlocked: { uri: string; reason: string } | undefined;
  private lastReportedUri: string | undefined;
  private pendingMode: string | undefined;
  private reportedMode: string | undefined;

  componentDidMount(): void {
    super.componentDidMount();
    this.flushDiagnostics();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushDiagnostics();
  }

  private flushDiagnostics(): void {
    const blocked = this.pendingBlocked;
    if (blocked && this.lastReportedUri !== blocked.uri) {
      this.lastReportedUri = blocked.uri;
      reportDiagnostic({
        code: 'image-uri-blocked',
        source: 'image-question',
        uri: blocked.uri,
        reason: blocked.reason,
      });
    }
    const mode = this.pendingMode;
    if (mode && this.reportedMode !== mode) {
      this.reportedMode = mode;
      reportDiagnostic({
        code: 'image-content-mode-unsupported',
        questionName: this.image.name,
        contentMode: mode,
      });
    }
  }

  protected renderElement(): React.JSX.Element | null {
    const question = this.image;
    this.pendingBlocked = undefined;
    this.pendingMode = undefined;

    if (question.renderedMode !== 'image') {
      this.pendingMode = question.renderedMode;
      return null;
    }

    const rawUri = question.locImageLink.renderedHtml;
    if (!rawUri) return null;

    // The base class's `contextType` slot belongs to the theme context
    // (React allows one per class) — the policy context reads through a
    // Consumer instead (same pattern as SurveyHeader's logo dispatch).
    return (
      <UriPolicyContext.Consumer>
        {(contextPolicy) => this.renderValidated(rawUri, contextPolicy)}
      </UriPolicyContext.Consumer>
    );
  }

  private renderValidated(
    rawUri: string,
    contextPolicy: UriPolicyConfig | undefined
  ): React.JSX.Element | null {
    const question = this.image;
    const result = validateUri(
      rawUri,
      'image',
      this.props.uriConfig ?? contextPolicy
    );
    if (!result.ok) {
      this.pendingBlocked = { uri: rawUri, reason: result.reason };
      return null;
    }

    if (question.contentNotLoaded) {
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
          source={{ uri: rawUri }}
          resizeMode={RESIZE_MODE_BY_IMAGE_FIT[question.imageFit] ?? 'contain'}
          accessibilityLabel={question.renderedAltText}
          onLoad={() => question.onLoadHandler()}
          onError={() => question.onErrorHandler()}
          style={{
            ...(width !== undefined ? { width } : null),
            ...(height !== undefined ? { height } : null),
          }}
        />
      </View>
    );
  }
}
