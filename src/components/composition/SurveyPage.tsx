/**
 * Task 1.4 — `SurveyPage`: RN analog of survey-react-ui's `SurveyPage`
 * (page.tsx). Composition scope (documented deltas):
 *
 * - Title/description through the `renderLocString` seam (upstream
 *   renders `TitleElement`; description gated on `page._showDescription`
 *   — upstream parity).
 * - Page-level `SurveyElementErrors` is 1.7 scope.
 * - `survey.afterRenderPage(el)` is NOT called from a render lifecycle
 *   (afterRender family banned, 0.4 design) — page-change scroll/focus is
 *   the 1.2 native lifecycle bridge's interception job.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { PageModel, PanelModelBase } from '../../core/facade';
import { SurveyPanelBase } from './SurveyPanelBase';
import type { SurveyPanelBaseProps } from './SurveyPanelBase';

export interface SurveyPageProps extends SurveyPanelBaseProps {
  page: PageModel;
}

export class SurveyPage extends SurveyPanelBase<SurveyPageProps> {
  protected getPanelBase(): PanelModelBase {
    return this.props.page as unknown as PanelModelBase;
  }

  public get page(): PageModel {
    return this.props.page;
  }

  protected renderElement(): React.JSX.Element {
    return (
      <View testID="sv-page">
        {this.renderHeader()}
        {this.renderRows()}
      </View>
    );
  }

  private renderHeader(): React.ReactNode {
    const page = this.page;
    const showDescription =
      (page as unknown as { _showDescription?: boolean })._showDescription ===
      true;
    if (!page.hasTitle && !showDescription) return null;
    return (
      <View>
        {page.hasTitle
          ? this.renderLocString(page.locTitle, undefined, 'title')
          : null}
        {showDescription
          ? this.renderLocString(page.locDescription, undefined, 'description')
          : null}
      </View>
    );
  }
}
