/**
 * Task 1.4 — `SurveyRowElement`: the per-element wrapper inside a row.
 * RN analog of survey-react-ui's `SurveyRowElement` (element.tsx), which
 * applies `element.rootStyle` verbatim on the wrapper div; here the 1.3
 * width resolver translates rootStyle to numeric dp against the row's
 * percentBase, rounded at the style edge via
 * `PixelRatio.roundToNearestPixel` (1.3 design, D3).
 */
import { render, screen } from '@testing-library/react-native';
import { PixelRatio, StyleSheet } from 'react-native';

import '../../../factories/register-all';
import { Model } from '../../../core/facade';
import type { Question, SurveyModel } from '../../../core/facade';
import { setDiagnosticHandler } from '../../../diagnostics';
import type { DiagnosticPayload } from '../../../diagnostics';
import { SurveyRowElement } from '../SurveyRowElement';

function firstQuestion(json: Record<string, unknown>): {
  model: SurveyModel;
  question: Question;
} {
  const model = new Model(json);
  const question = model.currentPage!.questions[0]!;
  return { model, question };
}

function wrapperStyle(name: string): Record<string, unknown> {
  return StyleSheet.flatten(
    screen.getByTestId(`sv-row-element-${name}`).props.style
  ) as Record<string, unknown>;
}

const round = (dp: number) => PixelRatio.roundToNearestPixel(dp);

describe('SurveyRowElement — dispatch', () => {
  it('renders a registered question type (empty) without the unsupported fallback', () => {
    const { model, question } = firstQuestion({
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(
      <SurveyRowElement
        element={question}
        survey={model}
        creator={{}}
        percentBase={800}
        gutterStart={0}
        index={0}
      />
    );
    expect(screen.getByTestId('sv-row-element-q1')).toBeTruthy();
    expect(screen.queryByTestId('unsupported-question-panel')).toBeNull();
  });

  it('falls back to UnsupportedQuestion on a dispatch miss (planned type "text"), never throwing', () => {
    const { model, question } = firstQuestion({
      elements: [{ type: 'text', name: 'q-text' }],
    });
    render(
      <SurveyRowElement
        element={question}
        survey={model}
        creator={{}}
        percentBase={800}
        gutterStart={0}
        index={0}
      />
    );
    expect(screen.getByTestId('unsupported-question-panel')).toBeTruthy();
  });
});

describe('SurveyRowElement — panel dispatch (element-route registration)', () => {
  it('a panel inside a row dispatches through RNElementFactory "panel" and renders its rows', () => {
    const model = new Model({
      elements: [
        {
          type: 'panel',
          name: 'np',
          elements: [{ type: 'empty', name: 'nq' }],
        },
      ],
    });
    const panel = model.getPanelByName('np');
    render(
      <SurveyRowElement
        element={panel as object}
        survey={model}
        creator={{}}
        percentBase={800}
        gutterStart={0}
        index={0}
      />
    );
    expect(screen.getByTestId('sv-panel-np')).toBeTruthy();
    expect(screen.getAllByTestId('sv-row')).toHaveLength(1);
  });
});

describe('SurveyRowElement — width style (resolver at the style edge)', () => {
  it('applies the resolved renderWidth-branch numbers: grow 1 / shrink 1 / basis %of percentBase / minWidth 300 / maxWidth percentBase', () => {
    const { model, question } = firstQuestion({
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(
      <SurveyRowElement
        element={question}
        survey={model}
        creator={{}}
        percentBase={816}
        gutterStart={0}
        index={0}
      />
    );
    const style = wrapperStyle('q1');
    expect(style.flexGrow).toBe(1);
    expect(style.flexShrink).toBe(1);
    // single question in its row -> renderWidth "100%" -> 816
    expect(style.flexBasis).toBe(round(816));
    // default minWidth min(100%, 300px) -> 300; maxWidth 100% -> 816
    expect(style.minWidth).toBe(round(300));
    expect(style.maxWidth).toBe(round(816));
  });

  it('rounds fractional dp to the pixel grid (equal 3-way split of 816)', () => {
    const { model } = firstQuestion({
      elements: [
        { type: 'empty', name: 'q1' },
        { type: 'empty', name: 'q2', startWithNewLine: false },
        { type: 'empty', name: 'q3', startWithNewLine: false },
      ],
    });
    const q2 = model.getQuestionByName('q2') as Question;
    render(
      <SurveyRowElement
        element={q2}
        survey={model}
        creator={{}}
        percentBase={816}
        gutterStart={16}
        index={1}
      />
    );
    const style = wrapperStyle('q2');
    // core emits "33.333333%" -> 271.99999728 dp -> pixel-grid rounded
    expect(style.flexBasis).toBe(round(816 * 0.33333333));
  });
});

describe('SurveyRowElement — gutter + indent paddings (one logical paddingStart)', () => {
  it('applies gutterStart as paddingStart (multi-row element wrapper)', () => {
    const { model, question } = firstQuestion({
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(
      <SurveyRowElement
        element={question}
        survey={model}
        creator={{}}
        percentBase={816}
        gutterStart={16}
        index={0}
      />
    );
    expect(wrapperStyle('q1').paddingStart).toBe(16);
  });

  it('adds question indent (indent:1 -> cssClasses.indent px) ON TOP of the gutter; rightIndent maps to paddingEnd', () => {
    const { model, question } = firstQuestion({
      elements: [{ type: 'empty', name: 'q1', indent: 1 }],
    });
    // rightIndent is runtime-only (no serializer entry — upstream sets it
    // from matrix detail panels and the like), so set it on the model.
    (question as unknown as { rightIndent: number }).rightIndent = 1;
    const indentPx = parseFloat(question.paddingLeft); // "<n>px" per core getIndentSize
    expect(indentPx).toBeGreaterThan(0);
    render(
      <SurveyRowElement
        element={question}
        survey={model}
        creator={{}}
        percentBase={816}
        gutterStart={16}
        index={0}
      />
    );
    const style = wrapperStyle('q1');
    expect(style.paddingStart).toBe(16 + indentPx);
    expect(style.paddingEnd).toBe(indentPx);
  });

  it('no gutter, no indent -> no paddingStart key at all', () => {
    const { model, question } = firstQuestion({
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(
      <SurveyRowElement
        element={question}
        survey={model}
        creator={{}}
        percentBase={800}
        gutterStart={0}
        index={0}
      />
    );
    const style = wrapperStyle('q1');
    expect(style.paddingStart).toBeUndefined();
    expect(style.paddingEnd).toBeUndefined();
  });
});

describe('SurveyRowElement — diagnostics forwarding (post-commit, deduped)', () => {
  let seen: DiagnosticPayload[];

  beforeEach(() => {
    seen = [];
    setDiagnosticHandler((payload) => seen.push(payload));
  });

  afterEach(() => {
    setDiagnosticHandler(undefined);
  });

  it('an unparseable user width ("banana") drops the basis, forwards ONE layout-diagnostic, and dedupes across re-renders', () => {
    const { model, question } = firstQuestion({
      elements: [{ type: 'empty', name: 'q-banana', width: 'banana' }],
    });
    const view = render(
      <SurveyRowElement
        element={question}
        survey={model}
        creator={{}}
        percentBase={800}
        gutterStart={0}
        index={0}
      />
    );
    const style = wrapperStyle('q-banana');
    expect(style.flexBasis).toBeUndefined();
    const layout = seen.filter((p) => p.code === 'layout-diagnostic');
    expect(layout).toHaveLength(1);
    expect(layout[0]).toMatchObject({
      value: 'banana',
      elementName: 'q-banana',
    });

    view.rerender(
      <SurveyRowElement
        element={question}
        survey={model}
        creator={{}}
        percentBase={800}
        gutterStart={0}
        index={0}
      />
    );
    expect(seen.filter((p) => p.code === 'layout-diagnostic')).toHaveLength(1);
  });
});
