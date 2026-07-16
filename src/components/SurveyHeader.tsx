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
import { RNElementFactory } from '../factories/ElementFactory';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { composeStyles } from '../theme-rn/recipes/types';
import type { UriPolicyConfig } from '../security/uri-policy';
import { UriPolicyContext } from '../security/UriPolicyContext';
import { reportDiagnostic } from '../diagnostics';

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

  /** Set during render on a wrapper-dispatch factory miss, reported from
   * the commit lifecycles below (0.7's "no diagnostics during render"
   * rule), deduped per componentName for this instance's lifetime. */
  private pendingWrapperMiss:
    { componentName: string; reason: string } | undefined;
  private lastReportedWrapperMiss: string | undefined;

  componentDidMount(): void {
    super.componentDidMount();
    this.flushWrapperMissDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushWrapperMissDiagnostic();
  }

  private flushWrapperMissDiagnostic(): void {
    const miss = this.pendingWrapperMiss;
    if (!miss || this.lastReportedWrapperMiss === miss.componentName) return;
    this.lastReportedWrapperMiss = miss.componentName;
    reportDiagnostic({
      code: 'element-wrapper-missing',
      componentName: miss.componentName,
      reason: miss.reason,
    });
  }

  /**
   * Upstream parity (survey-header.tsx `renderLogoImage`): the logo slot
   * dispatches through the survey's wrapper extension surface —
   * `getElementWrapperComponentName`/`getElementWrapperComponentData`
   * with reason `'logo-image'` (default key `sv-logo-image`, the
   * descriptor table's element row; hosts may reroute name and transform
   * data via `onElementWrapperComponentName`/`onElementWrapperComponentData`)
   * — never a direct `LogoImage` instantiation. A factory MISS (host
   * rerouted to an unregistered key) renders NOTHING, fail-closed: the
   * default component must not be fed possibly-transformed wrapper data;
   * the miss reports an `element-wrapper-missing` diagnostic from commit
   * phase and the rest of the header survives (invariant 9).
   */
  private renderLogo(isRendered: boolean): React.JSX.Element | null {
    if (!isRendered || !this.survey.renderedHasLogo) return null;
    const componentName = this.survey.getElementWrapperComponentName(
      this.survey,
      'logo-image'
    );
    const componentData = this.survey.getElementWrapperComponentData(
      this.survey,
      'logo-image'
    );
    // Registration miss detection stays synchronous (commit-phase
    // diagnostic below); the real element re-creates inside the policy
    // consumer so the survey-scoped default reaches the logo sink
    // (review round 1 major #2 — explicit prop wins over context).
    const rendered = RNElementFactory.createElement(componentName, {
      data: componentData,
      uriConfig: this.props.logoUriConfig,
    });
    if (rendered) {
      return (
        <UriPolicyContext.Consumer key={`logo-${componentName}`}>
          {(contextPolicy) =>
            RNElementFactory.createElement(componentName, {
              data: componentData,
              uriConfig: this.props.logoUriConfig ?? contextPolicy,
            })
          }
        </UriPolicyContext.Consumer>
      );
    }
    this.pendingWrapperMiss = { componentName, reason: 'logo-image' };
    return null;
  }

  protected renderElement(): React.JSX.Element | null {
    this.pendingWrapperMiss = undefined;
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
