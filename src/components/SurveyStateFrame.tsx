/**
 * `SurveyStateFrame` -- task 1.8: renders the non-"running" survey states
 * (RN port of survey-react-ui's `doRender` branches in reactSurvey.tsx --
 * `renderCompleted`/`renderCompletedBefore`/`renderLoading`/
 * `renderEmptySurvey`). Exported standalone (1.1's `<Survey>` root is on
 * an unmerged branch) for that shell to mount directly; `running`/
 * `starting`/`preview` render null here -- that is the page body, 1.1's
 * concern via the (also not-yet-merged) composition/width-resolver tasks.
 *
 * - `completed`: gated by `survey.showCompletedPage` (upstream's own
 *   gate, consumed as-is per invariant 6); `survey.processedCompletedHtml`
 *   -- a plain STRING getter, not a `LocalizableString` -- feeds
 *   `<SanitizedHtml>` directly (task 0.9's author-JSON sink; invariant 8).
 * - `completedbefore`: `survey.processedCompletedBeforeHtml` through
 *   `<SanitizedHtml>`. Upstream drives this state from a completion
 *   COOKIE (`cookieName`) -- won't-support in v1 (plan doc: "cookieName
 *   duplicate-completion cookies (host persistence pattern documented)");
 *   this component only renders whatever state the model is ALREADY in,
 *   it does not invent cookie storage.
 * - `loading`: `survey.processedLoadingHtml` through `<SanitizedHtml>`.
 * - `empty`: `survey.locEmptySurveyText` -- a REAL `LocalizableString`
 *   (the `@property({localizable Serializer:...})` decorator's
 *   auto-generated `loc<Prop>` accessor) -- through
 *   `this.renderLocString`, the same reactive locstring seam every other
 *   model-driven string in this library uses (task 1.6), not a raw string
 *   read.
 *
 * Reactive via the 0.4 `SurveyElementBase` mechanism (subscribes the
 * survey model; a `state` property change re-renders and re-dispatches
 * the switch below).
 */
import * as React from 'react';
import { View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type { Base, SurveyModel } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { SanitizedHtml } from './SanitizedHtml';
import type { SanitizedHtmlProps } from './SanitizedHtml';
import type { UriPolicyConfig } from '../security/uri-policy';
import { composeStyles } from '../theme-rn/recipes/types';

export interface SurveyStateFrameProps {
  survey: SurveyModel;
  /** Forwarded to every `<SanitizedHtml>` this frame renders (completed/completedBefore/loading HTML). No host callback wired by default -- an anchor press is a no-op + dev diagnostic until the host supplies one (same contract as `<SanitizedHtml>` itself). */
  onLinkPress?: (canonicalUrl: string, event: GestureResponderEvent) => void;
  /** Forwarded to every `<SanitizedHtml>` this frame renders, for `<img>` origin validation. */
  imageUriConfig?: UriPolicyConfig;
  testID?: string;
}

export class SurveyStateFrame extends SurveyElementBase<SurveyStateFrameProps> {
  private get survey(): SurveyModel {
    return this.props.survey;
  }

  protected getStateElement(): Base | null {
    return this.survey ?? null;
  }

  protected canRender(): boolean {
    if (!this.survey) return false;
    const state = this.survey.state;
    return (
      state === 'completed' ||
      state === 'completedbefore' ||
      state === 'loading' ||
      state === 'empty'
    );
  }

  private sanitizedHtmlProps(): Pick<
    SanitizedHtmlProps,
    'onLinkPress' | 'imageUriConfig'
  > {
    return {
      onLinkPress: this.props.onLinkPress,
      imageUriConfig: this.props.imageUriConfig,
    };
  }

  private renderCompleted(): React.JSX.Element | null {
    const survey = this.survey;
    if (!survey.showCompletedPage) return null;
    const html = survey.processedCompletedHtml;
    const { styles } = this.themeContext;
    return (
      <View
        testID="survey-state-completed"
        style={composeStyles(undefined, {
          override: styles.surveyState?.completed,
        })}
      >
        {html ? (
          <SanitizedHtml html={html} {...this.sanitizedHtmlProps()} />
        ) : null}
      </View>
    );
  }

  private renderCompletedBefore(): React.JSX.Element {
    const html = this.survey.processedCompletedBeforeHtml;
    const { styles } = this.themeContext;
    return (
      <View
        testID="survey-state-completed-before"
        style={composeStyles(undefined, {
          override: styles.surveyState?.completedBefore,
        })}
      >
        {html ? (
          <SanitizedHtml html={html} {...this.sanitizedHtmlProps()} />
        ) : null}
      </View>
    );
  }

  private renderLoading(): React.JSX.Element {
    const html = this.survey.processedLoadingHtml;
    const { styles } = this.themeContext;
    return (
      <View
        testID="survey-state-loading"
        style={composeStyles(undefined, {
          override: styles.surveyState?.loading,
        })}
      >
        {html ? (
          <SanitizedHtml html={html} {...this.sanitizedHtmlProps()} />
        ) : null}
      </View>
    );
  }

  private renderEmpty(): React.JSX.Element {
    const { styles } = this.themeContext;
    return (
      <View
        testID="survey-state-empty"
        style={composeStyles(undefined, {
          override: styles.surveyState?.empty,
        })}
      >
        {this.renderLocString(this.survey.locEmptySurveyText)}
      </View>
    );
  }

  protected renderElement(): React.JSX.Element | null {
    switch (this.survey.state) {
      case 'completed':
        return this.renderCompleted();
      case 'completedbefore':
        return this.renderCompletedBefore();
      case 'loading':
        return this.renderLoading();
      case 'empty':
        return this.renderEmpty();
      default:
        return null;
    }
  }
}
