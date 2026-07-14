/**
 * Task 1.4 — per-element wrapper inside a row. RN analog of
 * survey-react-ui's `SurveyRowElement` (element.tsx), with the documented
 * divergences:
 *
 * - Upstream binds `element.rootStyle` VERBATIM as the wrapper's inline
 *   style; here the 1.3 width resolver translates it to all-numeric dp
 *   against the row-supplied `percentBase` (docs/design/1.3-width-resolver.md
 *   D1/D3/D4), rounded at the style edge via
 *   `PixelRatio.roundToNearestPixel` (`flexBasis`/`minWidth`/`maxWidth`
 *   only — `flexGrow`/`flexShrink` are ratios, not lengths).
 * - The DOM applies the multi-row gutter (`padding-left: g`) on the
 *   wrapper div and the indent paddings on the question root inside it —
 *   two boxes. RN composition uses ONE wrapper box, so the two channels
 *   sum: `paddingStart = gutterStart + indentLeft`, `paddingEnd =
 *   indentRight` (core's `question.paddingLeft/paddingRight` are always
 *   `"<n>px"` or `""` — question.ts `getIndentSize`). Logical start/end
 *   per the A7 RTL primitive.
 * - Resolver diagnostics are forwarded POST-COMMIT through the shared
 *   seam (`layout-diagnostic`), deduped per (element, offending value) at
 *   the forwarding edge — never during render (1.3 design D4).
 * - `setWrapperElement`/lazy-rendering skeletons/`ReactSurveyElementsWrapper`
 *   are not ported (DOM-specific; wrapper seam is a later task).
 *
 * Dispatch (mirrors upstream's two-level dispatch, collapsed): a panel
 * element goes to `RNElementFactory` under `"panel"`; a question goes to
 * `RNQuestionFactory` under `isDefaultRendering() ? getTemplate() :
 * getComponentName()` (the manifest construction gate's own derivation),
 * with a miss falling through to the non-throwing `UnsupportedQuestion`
 * fallback (invariant 9).
 */
import * as React from 'react';
import { PixelRatio, View } from 'react-native';
import type { Base, Question, SurveyModel } from '../../core/facade';
import { RNElementFactory } from '../../factories/ElementFactory';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import { resolveWidthStyle } from '../../layout/width-resolver';
import type {
  ResolvedWidthStyle,
  WidthDiagnostic,
} from '../../layout/width-resolver';
import { reportLayoutDiagnosticOnce } from '../../diagnostics';
import { SurveyElementBase } from '../../reactivity/SurveyElementBase';
import { createUnsupportedQuestion } from '../UnsupportedQuestion';

/**
 * Structural view of the row-element model (Question | PanelModel) — the
 * shared surface composition needs, without over-constraining to the
 * `Question` type (panels are row elements too).
 */
interface RowElementModel {
  name?: string;
  isPanel?: boolean;
  paddingLeft?: string;
  paddingRight?: string;
  getType(): string;
  getTemplate?(): string;
  getComponentName?(): string;
  isDefaultRendering?(): boolean;
  rootStyle?: unknown;
}

export interface SurveyRowElementProps {
  element: object;
  survey: SurveyModel;
  creator: unknown;
  /** Measured %-base for this row (dp) — `resolveRowWidths`' output. */
  percentBase: number;
  /** Multi-row gutter g (dp); 0 in single-element rows. */
  gutterStart: number;
  index: number;
}

/** Pixel-grid rounding at the style edge (1.3 design D3): lengths only. */
function roundLengths(style: ResolvedWidthStyle): ResolvedWidthStyle {
  const rounded: ResolvedWidthStyle = { ...style };
  if (typeof rounded.flexBasis === 'number') {
    rounded.flexBasis = PixelRatio.roundToNearestPixel(rounded.flexBasis);
  }
  if (typeof rounded.minWidth === 'number') {
    rounded.minWidth = PixelRatio.roundToNearestPixel(rounded.minWidth);
  }
  if (typeof rounded.maxWidth === 'number') {
    rounded.maxWidth = PixelRatio.roundToNearestPixel(rounded.maxWidth);
  }
  return rounded;
}

/** `"<n>px"` (core `getIndentSize` output) -> dp; anything else -> 0. */
function indentDp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export class SurveyRowElement extends SurveyElementBase<SurveyRowElementProps> {
  /** This render pass's resolver diagnostics, forwarded post-commit. */
  private pendingDiagnostics: WidthDiagnostic[] = [];

  protected getStateElement(): Base | null {
    return this.props.element as Base;
  }

  private get model(): RowElementModel {
    return this.props.element as RowElementModel;
  }

  protected canRender(): boolean {
    return !!this.props.element && !!this.props.survey;
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.flushLayoutDiagnostics();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushLayoutDiagnostics();
  }

  private flushLayoutDiagnostics(): void {
    const element = this.props.element;
    const model = this.model;
    for (const diagnostic of this.pendingDiagnostics) {
      reportLayoutDiagnosticOnce(element, {
        code: 'layout-diagnostic',
        layoutCode: diagnostic.code,
        property: diagnostic.property,
        value: diagnostic.value,
        message: diagnostic.message,
        elementName: model.name,
        elementType: model.getType(),
      });
    }
    this.pendingDiagnostics = [];
  }

  protected renderElement(): React.JSX.Element {
    const model = this.model;
    const { percentBase, gutterStart } = this.props;

    const resolution = resolveWidthStyle(model.rootStyle, { percentBase });
    this.pendingDiagnostics = resolution.diagnostics;
    const widthStyle = roundLengths(resolution.style);

    const paddingStart = gutterStart + indentDp(model.paddingLeft);
    const paddingEnd = indentDp(model.paddingRight);
    const paddings: { paddingStart?: number; paddingEnd?: number } = {};
    if (paddingStart > 0) paddings.paddingStart = paddingStart;
    if (paddingEnd > 0) paddings.paddingEnd = paddingEnd;

    return (
      <View
        testID={`sv-row-element-${model.name ?? this.props.index}`}
        style={[widthStyle, paddings]}
      >
        {this.renderInnerElement()}
      </View>
    );
  }

  private renderInnerElement(): React.JSX.Element | null {
    const model = this.model;
    const { element, survey, creator } = this.props;

    if (model.isPanel) {
      // Registered by the descriptor table (route "element", key "panel").
      return RNElementFactory.createElement('panel', {
        element,
        survey,
        creator,
      });
    }

    // The manifest construction gate's own dispatch-key derivation
    // (factories/__tests__/manifest.test.ts): default rendering uses the
    // template key; a renderAs override uses getComponentName().
    const dispatchKey =
      model.isDefaultRendering?.() !== false
        ? (model.getTemplate?.() ?? model.getType())
        : (model.getComponentName?.() ?? model.getType());

    const questionProps = { question: element as Question, creator };
    return (
      RNQuestionFactory.createQuestion(dispatchKey, questionProps) ??
      createUnsupportedQuestion(questionProps, { dispatchKey })
    );
  }
}
