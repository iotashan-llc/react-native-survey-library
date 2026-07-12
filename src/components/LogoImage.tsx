/**
 * `LogoImage` — RN port of survey-react-ui's `LogoImage`
 * (components/survey-header/logo-image.tsx), task 1.6.
 *
 * Security (invariants 8/9): the logo URI goes through the central URI
 * policy (context `'image'` — an automatic-fetch context) BEFORE it ever
 * reaches RN's `Image`; a blocked URI renders NOTHING (fail-closed, never
 * a crash) and reports a structured `image-uri-blocked` diagnostic from
 * the commit phase (never during render — 0.7's "no diagnostics during
 * render" rule), deduped per URI value for this instance's lifetime.
 *
 * Documented RN deltas vs upstream:
 * - `logoFit` (`object-fit`) maps to `resizeMode`: contain → contain,
 *   cover → cover, fill → stretch, none → center (closest RN analog:
 *   unscaled, centered).
 * - `renderedLogoWidth/Height` are numeric px (serializer defaults
 *   300x40). A dimension core resolves to `undefined` (e.g. `"auto"`) is
 *   omitted from the style: RN cannot derive a remote image's intrinsic
 *   size synchronously, so `auto`-sized logos need an explicit
 *   `logoWidth`/`logoHeight` in the survey JSON (upstream's
 *   `renderedStyleLogoWidth` CSS-`auto` channel has no RN equivalent).
 * - Upstream's `alt={locTitle.renderedHtml}` becomes
 *   `accessibilityLabel`.
 *
 * Side-effect-free module: the descriptor table owns the `sv-logo-image`
 * registration.
 */
import * as React from 'react';
import { Image, View } from 'react-native';
import type { ImageProps } from 'react-native';
import type { SurveyModel } from '../core/facade';
import { SurveyThemeContext } from '../theme-rn/provider';
import { composeStyles } from '../theme-rn/recipes/types';
import { validateUri } from '../security/uri-policy';
import type { UriPolicyConfig } from '../security/uri-policy';
import { reportDiagnostic } from '../diagnostics';

export interface LogoImageProps {
  /** Upstream prop name preserved (`sv-logo-image` factory contract). */
  data: SurveyModel;
  /** Origin-allowlist / baseUrl config for the logo URI. Survey-level
   * wiring lands with task 1.1 (same seam as `SanitizedHtml`'s
   * `imageUriConfig`). */
  uriConfig?: UriPolicyConfig;
}

type LogoResizeMode = NonNullable<ImageProps['resizeMode']>;

const RESIZE_MODE_BY_LOGO_FIT: Record<string, LogoResizeMode> = {
  contain: 'contain',
  cover: 'cover',
  fill: 'stretch',
  none: 'center',
};

export class LogoImage extends React.Component<LogoImageProps> {
  static contextType = SurveyThemeContext;

  private get themeContext(): React.ContextType<typeof SurveyThemeContext> {
    return this.context as React.ContextType<typeof SurveyThemeContext>;
  }

  private get survey(): SurveyModel {
    return this.props.data;
  }

  /** Set during render, reported from the commit lifecycles below. */
  private pendingBlocked: { uri: string; reason: string } | undefined;
  private lastReportedUri: string | undefined;

  componentDidMount(): void {
    this.flushBlockedDiagnostic();
  }

  componentDidUpdate(): void {
    this.flushBlockedDiagnostic();
  }

  private flushBlockedDiagnostic(): void {
    const blocked = this.pendingBlocked;
    if (!blocked || this.lastReportedUri === blocked.uri) return;
    this.lastReportedUri = blocked.uri;
    reportDiagnostic({
      code: 'image-uri-blocked',
      source: 'survey-logo',
      uri: blocked.uri,
      reason: blocked.reason,
    });
  }

  render(): React.JSX.Element | null {
    this.pendingBlocked = undefined;
    const rawUri = this.survey.locLogo.renderedHtml;
    if (!rawUri) return null;

    const result = validateUri(rawUri, 'image', this.props.uriConfig);
    if (!result.ok) {
      this.pendingBlocked = { uri: rawUri, reason: result.reason };
      return null;
    }

    const { recipes, styles } = this.themeContext;
    const fragments = recipes.header.fragments;
    const slots = styles.header;
    const width = this.survey.renderedLogoWidth;
    const height = this.survey.renderedLogoHeight;
    const size = {
      ...(width !== undefined ? { width } : null),
      ...(height !== undefined ? { height } : null),
    };
    const resizeMode =
      RESIZE_MODE_BY_LOGO_FIT[this.survey.logoFit] ?? 'contain';

    return (
      <View
        testID="survey-logo"
        style={composeStyles(fragments.logo, { override: slots?.logo })}
      >
        <Image
          testID="survey-logo-image"
          source={{ uri: result.canonical }}
          resizeMode={resizeMode}
          accessibilityLabel={this.survey.locTitle.renderedHtml}
          style={composeStyles([fragments.logoImage, size], {
            override: slots?.logoImage,
          })}
        />
      </View>
    );
  }
}
