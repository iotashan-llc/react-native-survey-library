/**
 * Task 1.4 — `SurveyPanel`: RN analog of survey-react-ui's `SurveyPanel`
 * (panel.tsx). Composition scope (documented deltas):
 *
 * - Header = title/description text through the `renderLocString` seam
 *   (plain-text fallback until 1.6's LocalizableString renderer; upstream
 *   renders `SurveyElementHeader`/`TitleElement` — 1.6/1.7 scope).
 * - Panel-level `SurveyElementErrors` (incl. `showErrorsAbovePanel`) is
 *   1.7 question-chrome scope.
 * - Expand/collapse: content rows render only while
 *   `renderedIsExpanded` (upstream parity); the collapse toggle
 *   affordance itself is 1.7 header chrome.
 * - `innerPaddingLeft` (core emits `"<n>px"` from `innerIndent`) maps to
 *   a logical `paddingStart` on the content box (A7 RTL primitive).
 * - Footer action bar (`getFooterToolbar`) needs 1.5's ActionButton —
 *   deferred to the panel-chrome follow-up; `onFocus`/`focusIn` is DOM
 *   focus-event plumbing (RN focus arrives per-input via the 1.2 bridge).
 * - Visibility: upstream's `getIsVisible` override checks ONLY
 *   `getIsContentVisible()` (all-children-invisible ⇒ hide) because the
 *   row pipeline already excludes invisible panels from
 *   `visibleElements` before panel.tsx ever mounts. This port ANDs
 *   `panel.isVisible` in as well — identical through the row pipeline,
 *   but a directly-mounted invisible panel also renders null.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { PanelModel, PanelModelBase } from '../../core/facade';
import { SurveyPanelBase } from './SurveyPanelBase';
import type { SurveyPanelBaseProps } from './SurveyPanelBase';

export interface SurveyPanelProps extends SurveyPanelBaseProps {
  element: PanelModel;
}

/** `"<n>px"` -> dp; `""`/undefined -> 0 (core `getIndentSize` output). */
function paddingDp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export class SurveyPanel extends SurveyPanelBase<SurveyPanelProps> {
  protected getPanelBase(): PanelModelBase {
    return this.props.element;
  }

  public get panel(): PanelModel {
    return this.props.element;
  }

  protected getIsVisible(): boolean {
    return this.panel.isVisible && this.panel.getIsContentVisible();
  }

  protected renderElement(): React.JSX.Element {
    const panel = this.panel;
    return (
      <View testID={`sv-panel-${panel.name}`}>
        {this.renderHeader()}
        {this.renderContent()}
      </View>
    );
  }

  private renderHeader(): React.ReactNode {
    const panel = this.panel;
    if (!panel.hasTitle && !panel.hasDescription) return null;
    return (
      <View>
        {panel.hasTitle
          ? this.renderLocString(panel.locTitle, undefined, 'title')
          : null}
        {panel.hasDescription
          ? this.renderLocString(panel.locDescription, undefined, 'description')
          : null}
      </View>
    );
  }

  private renderContent(): React.ReactNode {
    const panel = this.panel;
    if (!panel.renderedIsExpanded) return null;
    const innerPadding = paddingDp(
      (panel as unknown as { innerPaddingLeft?: string }).innerPaddingLeft
    );
    const style = innerPadding > 0 ? { paddingStart: innerPadding } : undefined;
    return (
      <View testID="sv-panel-content" style={style}>
        {this.renderRows()}
      </View>
    );
  }
}
