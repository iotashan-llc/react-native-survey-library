/**
 * Task 1.4 — shared base for `SurveyPage`/`SurveyPanel`. RN analog of
 * survey-react-ui's `SurveyPanelBase` (panel-base.tsx), minus the DOM
 * machinery deliberately NOT ported:
 *
 * - `rootRef`/`data-rendered` idempotence — DOM attributes;
 * - `doAfterRender` (`panel.afterRender(el)` / `survey.afterRenderPage(el)`)
 *   — the afterRender family is banned (0.4 design); page-change
 *   focus/scroll behavior is the 1.2 native lifecycle bridge's job, which
 *   intercepts `SurveyModel.scrollElementToTop` instead of relying on a
 *   DOM callback.
 *
 * Carried over: `getStateElement` = the panel model,
 * `canUsePropInState(key !== "elements")` (the elements array is
 * structural — `visibleRows` drives rendering), the
 * survey/creator/panelBase accessors, visibility-gated `canRender`, and
 * `renderRows` (one `SurveyRow` per visible row, index-keyed for
 * first-row rhythm).
 */
import * as React from 'react';
import type { Base, PanelModelBase, SurveyModel } from '../../core/facade';
import { SurveyElementBase } from '../../reactivity/SurveyElementBase';
import { SurveyRow } from './SurveyRow';

/** Structural surface of `PanelModelBase.visibleRows` rows. */
interface RowLikeModel {
  id?: string;
  visibleElements: ReadonlyArray<object>;
}

export interface SurveyPanelBaseProps {
  survey: SurveyModel;
  creator: unknown;
}

export abstract class SurveyPanelBase<
  P extends SurveyPanelBaseProps = SurveyPanelBaseProps,
> extends SurveyElementBase<P> {
  protected abstract getPanelBase(): PanelModelBase;

  public get panelBase(): PanelModelBase {
    return this.getPanelBase();
  }

  protected get survey(): SurveyModel {
    return this.props.survey;
  }

  protected get creator(): unknown {
    return this.props.creator;
  }

  protected getStateElement(): Base | null {
    return this.panelBase ?? null;
  }

  protected canUsePropInState(key: string): boolean {
    return key !== 'elements' && super.canUsePropInState(key);
  }

  protected getIsVisible(): boolean {
    return this.panelBase.isVisible;
  }

  protected canRender(): boolean {
    return (
      super.canRender() &&
      !!this.survey &&
      !!this.panelBase &&
      !!this.panelBase.survey &&
      this.getIsVisible()
    );
  }

  /**
   * True when the concrete container renders a header directly above its
   * rows — `SurveyPage` overrides this so the first row takes the
   * header-adjacent margin (sd-row.scss `.sd-page__title/
   * .sd-page__description ~ .sd-row...`). Panels keep the default: their
   * header spacing is the panel content box's own concern.
   */
  protected hasHeaderBeforeRows(): boolean {
    return false;
  }

  protected renderRows(): React.ReactNode {
    const rows = (this.panelBase as unknown as { visibleRows: RowLikeModel[] })
      .visibleRows;
    const afterHeader = this.hasHeaderBeforeRows();
    return rows.map((row, index) => (
      <SurveyRow
        key={row.id ?? String(index)}
        row={row}
        survey={this.survey}
        creator={this.creator}
        index={index}
        afterHeader={afterHeader}
      />
    ));
  }
}
