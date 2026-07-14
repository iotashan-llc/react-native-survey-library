/**
 * Task 1.4 — `SurveyRow`: maps a `QuestionRowModel` to RN Views and owns
 * the onLayout -> width-resolver wiring (1.3 design: "1.4 wires onLayout
 * → resolver → child styles"). RN analog of survey-react-ui's `SurveyRow`
 * (row.tsx), with documented divergences:
 *
 * - **Two-View geometry for DOM gutter parity.** The DOM multi row is
 *   `margin-left: -g; width: calc(100% + g)` with `%` bases resolving
 *   against the WIDENED box. RN cannot express `calc(100% + g)`, so the
 *   OUTER View (measured by onLayout) is the un-widened `rowWidth` the
 *   resolver contract expects, and the INNER stretched content View
 *   carries `marginStart: -g` — Yoga's stretch computes its width as
 *   `rowWidth + g`, exactly the DOM widened box. `resolveRowWidths(row,
 *   { rowWidth, gutter })` then owns the percentBase rule in one place
 *   (1.3 design D4).
 * - **One-frame defer (1.3 design D3):** children render only after the
 *   first `onLayout` delivers a real width — everything resolves
 *   numerically; there is no %-string passthrough tier.
 * - **Not ported:** `setRootElement`/`startLazyRendering`
 *   (`survey.lazyRendering` is DOM-scroll-driven — see DIFFERENCES.md),
 *   `recalculateCss` cssClasses warm-up (the theme-rn bridge owns class
 *   tokens), `ReactSurveyElementsWrapper` (wrapper seam is a later task),
 *   row enter/leave animations (core disallows animations headless — the
 *   renderer never calls `enableOnElementRerenderedEvent()`).
 *
 * Row context: page-level rows (`row.panel.isPage`) and as-page panel
 * rows (`row.panel.showPanelAsPage`, the `.sd-panel--as-page` model
 * rule) use the page metrics when the survey is non-compact;
 * panel-inner rows and compact (panelless) page rows use
 * `--sd-base-padding` metrics (sd-row.scss `.sd-row--compact`).
 * `narrow` comes from the theme context's select-time mode.
 */
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { Base, SurveyModel } from '../../core/facade';
import { resolveRowWidths } from '../../layout/width-resolver';
import { selectRowVariant } from '../../theme-rn/recipes/row';
import type { RowVariantContext } from '../../theme-rn/recipes/row';
import { SurveyElementBase } from '../../reactivity/SurveyElementBase';
import type { SurveyElementBaseState } from '../../reactivity/SurveyElementBase';
import { SurveyRowElement } from './SurveyRowElement';

/** Structural row surface (accepts a live QuestionRowModel). */
interface RowModelLike {
  visibleElements: ReadonlyArray<object>;
  panel?: { isPage?: boolean; showPanelAsPage?: boolean };
}

export interface SurveyRowProps {
  row: object;
  survey: SurveyModel;
  creator: unknown;
  /** Row position within its container (first row drops the marginTop). */
  index: number;
}

interface SurveyRowState extends SurveyElementBaseState {
  /** Measured outer (un-widened) row width, dp; null until first onLayout. */
  rowWidth: number | null;
}

export class SurveyRow extends SurveyElementBase<
  SurveyRowProps,
  SurveyRowState
> {
  constructor(props: SurveyRowProps) {
    super(props);
    this.state = { rowWidth: null } as SurveyRowState;
  }

  protected getStateElement(): Base | null {
    return this.props.row as Base;
  }

  private get row(): RowModelLike {
    return this.props.row as RowModelLike;
  }

  protected canRender(): boolean {
    return !!this.props.row && !!this.props.survey;
  }

  private handleLayout = (event: LayoutChangeEvent): void => {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && width !== this.state.rowWidth) {
      this.setState({ rowWidth: width } as Partial<SurveyRowState> as never);
    }
  };

  private get variantContext(): RowVariantContext {
    // Page-context rows: the container is a real page OR an as-page
    // panel (`showPanelAsPage` — core's own `.sd-panel--as-page` css
    // driver, true for pages demoted to panels by singlePage mode).
    // sd-row.scss's inner-gutter rule is scoped to
    // `.sd-panel:not(.sd-panel--as-page)`, so as-page rows keep the
    // base page metrics (1.3 design, four-context gutter table).
    const container = this.row.panel;
    const isPageContext =
      container?.isPage === true || container?.showPanelAsPage === true;
    const isCompact =
      (this.props.survey as unknown as { isCompact?: boolean }).isCompact ===
      true;
    return isPageContext && !isCompact ? 'page' : 'inner';
  }

  protected renderElement(): React.JSX.Element {
    const { recipes, mode } = this.themeContext;
    const variant = selectRowVariant(
      recipes.row,
      this.variantContext,
      mode.narrow
    );
    const isMultiple = this.row.visibleElements.length > 1;
    const isFirst = this.props.index === 0;

    return (
      <View
        testID="sv-row"
        style={[variant.row, isFirst && variant.rowFirst]}
        onLayout={this.handleLayout}
      >
        <View
          testID="sv-row-content"
          style={[styles.content, isMultiple && variant.rowMultiple]}
        >
          {this.renderRowElements(isMultiple ? variant.gutter : 0)}
        </View>
      </View>
    );
  }

  private renderRowElements(gutter: number): React.ReactNode {
    const { rowWidth } = this.state;
    if (rowWidth === null) {
      // One-frame defer until measured (1.3 design D3).
      return null;
    }
    const { survey, creator } = this.props;
    const { percentBase, isMultiple } = resolveRowWidths(this.row, {
      rowWidth,
      gutter,
    });
    return this.row.visibleElements.map((element, index) => {
      const key =
        (element as { id?: string; name?: string }).id ??
        (element as { name?: string }).name ??
        String(index);
      return (
        <SurveyRowElement
          key={key}
          element={element}
          survey={survey}
          creator={creator}
          percentBase={percentBase}
          gutterStart={isMultiple ? gutter : 0}
          index={index}
        />
      );
    });
  }
}

const styles = StyleSheet.create({
  /**
   * Inner content box: `.sd-row`'s `display:flex; flex-direction:row`.
   * Stretch (not `width:'100%'`) so a multi variant's negative
   * `marginStart` WIDENS it to rowWidth + g — an explicit percent width
   * would pin it to rowWidth and break DOM parity (see file doc).
   */
  content: {
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
});
