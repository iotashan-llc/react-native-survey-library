/**
 * `SurveyHeader` — RN port of survey-react-ui's `SurveyHeader`
 * (components/survey-header/survey-header.tsx), task 1.6: the BASIC
 * header — title, description, logo. The advanced cover (`IHeader` →
 * ImageBackground + 3x3 grid) is task 5.6.
 *
 * Render gates are the MODEL's, never re-derived (invariant 6):
 * `renderedHasHeader` / `renderedHasTitle` / `renderedHasDescription` /
 * `renderedHasLogo` / `isLogoBefore` / `isLogoAfter`.
 *
 * Reactivity: extends the ported `SurveyElementBase` with the survey
 * model as its state element — survey-level property changes (title
 * appearing, `logo`/`logoFit`/`logoPosition`/`showTitle` changes) flow
 * through the 0.4 mechanism, and title/description TEXT changes flow
 * through the locstring viewer's own `onStringChanged` subscription.
 * Upstream's manual `locLogo.onChanged = function () {...}` assignment
 * (which CLOBBERS any other observer) is deliberately not ported — the
 * base-class subscription covers the logo, clobber-free.
 *
 * Documented RN deltas vs upstream:
 * - `afterRenderHeader`/`onAfterRenderHeader` is not fired: its payload
 *   is a DOM `HTMLElement`; native element handles are the 1.2 lifecycle
 *   bridge's registry concern, not a per-component ref cast.
 * - `TitleElement` (title-actions bar) is not ported in the basic header;
 *   the title renders through the locstring viewer directly.
 * - `titleMaxWidth` (a CSS width string) is not applied; the text block
 *   is a flex column that wraps naturally.
 *
 * Side-effect-free module: the descriptor table owns the `survey-header`
 * registration.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { Base, SurveyModel } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { composeStyles } from '../theme-rn/recipes/types';
import type { UriPolicyConfig } from '../security/uri-policy';
import { LogoImage } from './LogoImage';

export interface SurveyHeaderProps {
  survey: SurveyModel;
  /** Threaded to the logo's URI validation (task 1.1 wires the
   * Survey-level config). */
  logoUriConfig?: UriPolicyConfig;
}

export class SurveyHeader extends SurveyElementBase<SurveyHeaderProps> {
  private get survey(): SurveyModel {
    return this.props.survey;
  }

  protected getStateElement(): Base | null {
    return this.survey ?? null;
  }

  protected canRender(): boolean {
    return !!this.survey && this.survey.renderedHasHeader;
  }

  private renderTitleBlock(): React.JSX.Element | null {
    if (!this.survey.renderedHasTitle) return null;
    const fragments = this.themeContext.recipes.header.fragments;
    const slots = this.themeContext.styles.header;
    return (
      <View
        testID="survey-header-text"
        style={composeStyles(fragments.textBlock, {
          override: slots?.titleBlock,
        })}
      >
        {this.renderLocString(
          this.survey.locTitle,
          composeStyles(fragments.title, { override: slots?.title })
        )}
        {this.survey.renderedHasDescription
          ? this.renderLocString(
              this.survey.locDescription,
              composeStyles(fragments.description, {
                override: slots?.description,
              })
            )
          : null}
      </View>
    );
  }

  private renderLogo(isRendered: boolean): React.JSX.Element | null {
    if (!isRendered || !this.survey.renderedHasLogo) return null;
    return (
      <LogoImage data={this.survey} uriConfig={this.props.logoUriConfig} />
    );
  }

  protected renderElement(): React.JSX.Element | null {
    const fragments = this.themeContext.recipes.header.fragments;
    const slots = this.themeContext.styles.header;
    return (
      <View
        testID="survey-header"
        style={composeStyles(fragments.root, { override: slots?.root })}
      >
        {this.renderLogo(this.survey.isLogoBefore)}
        {this.renderTitleBlock()}
        {this.renderLogo(this.survey.isLogoAfter)}
      </View>
    );
  }
}
