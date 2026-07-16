/**
 * `SurveyProgressBar` (task 1.8) -- the percentage progress bar: RN port
 * of survey-react-ui's `SurveyProgress` (progress.tsx). v1 scope: the
 * percentage-bar variant only, used for every `progressBarType` except
 * the obsolete `"buttons"`/TOC extensions (documented deferred -- see the
 * component's own doc comment). Bound to `survey.progressValue`/
 * `survey.progressText`/`survey.progressBarAriaLabel`, reactive via the
 * 0.4 `SurveyElementBase` mechanism (subscribes the survey model).
 */
import { StyleSheet } from 'react-native';
import { act, render, screen, within } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import { SurveyProgressBar } from '../SurveyProgressBar';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

function twoPageModel(extra: Record<string, unknown> = {}): Model {
  return new Model({
    showProgressBar: true,
    // "questions" keeps the percentage route under the default css type
    // ("pages" routes to progress-buttons upstream — guard suite below).
    progressBarType: 'questions',
    ...extra,
    pages: [
      { elements: [{ type: 'text', name: 'q1' }] },
      { elements: [{ type: 'text', name: 'q2' }] },
    ],
  });
}

afterEach(() => {
  setDiagnosticHandler(undefined);
});

describe('SurveyProgressBar -- render gate', () => {
  it('renders null when showProgressBar is false (default)', () => {
    const model = new Model({ elements: [{ type: 'text', name: 'q1' }] });
    expect(model.showProgressBar).toBe(false);
    const { toJSON } = render(<SurveyProgressBar survey={model} />);
    expect(toJSON()).toBeNull();
  });

  it('renders the track + bar + text when showProgressBar is true', () => {
    const model = new Model({
      showProgressBar: true,
      progressBarType: 'questions',
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    render(<SurveyProgressBar survey={model} />);
    expect(screen.getByTestId('survey-progress-bar')).toBeTruthy();
    expect(screen.getByTestId('survey-progress-bar-fill')).toBeTruthy();
  });
});

describe('SurveyProgressBar -- progressValue/progressText binding', () => {
  it('the fill width and accessibility value reflect progressValue', () => {
    const model = new Model({
      showProgressBar: true,
      progressBarType: 'questions',
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    render(<SurveyProgressBar survey={model} />);
    const fill = screen.getByTestId('survey-progress-bar-fill');
    const track = screen.getByTestId('survey-progress-bar-track');
    const flatFillStyle = StyleSheet.flatten(fill.props.style);
    expect(flatFillStyle).toEqual(
      expect.objectContaining({ width: `${model.progressValue}%` })
    );
    expect(track.props.accessibilityValue).toEqual(
      expect.objectContaining({ min: 0, max: 100, now: model.progressValue })
    );
  });

  it('renders progressText as visible text', () => {
    const model = new Model({
      showProgressBar: true,
      progressBarType: 'questions',
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    render(<SurveyProgressBar survey={model} />);
    expect(screen.getByText(model.progressText)).toBeTruthy();
  });

  it('re-renders reactively on page navigation (survey model subscription)', async () => {
    const model = new Model({
      showProgressBar: true,
      progressBarType: 'questions',
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    render(<SurveyProgressBar survey={model} />);
    const before = model.progressText;
    await act(async () => {
      // "questions" progress advances when an answer lands.
      model.setValue('q1', 'answered');
      await Promise.resolve();
    });
    expect(screen.getByText(model.progressText)).toBeTruthy();
    expect(model.progressText).not.toBe(before);
  });
});

describe('SurveyProgressBar -- structure (review round 1: text must not clip)', () => {
  it('progressText renders OUTSIDE the height-limited track, as a sibling below it', () => {
    // Upstream renders the fill inside the bar and the VISIBLE text as
    // the bar's sibling (progress.tsx:33-52); the in-track copy is the
    // one its CSS hides. A text inside our overflow-hidden track would
    // be clipped to the 0.25-unit bar height.
    const model = twoPageModel();
    render(<SurveyProgressBar survey={model} />);
    const track = screen.getByTestId('survey-progress-bar-track');
    expect(within(track).queryByText(model.progressText)).toBeNull();
    expect(within(track).getByTestId('survey-progress-bar-fill')).toBeTruthy();
    const root = screen.getByTestId('survey-progress-bar');
    expect(within(root).getByText(model.progressText)).toBeTruthy();
  });

  it('the progressbar accessibility role/value live on the track', () => {
    const model = twoPageModel();
    render(<SurveyProgressBar survey={model} />);
    const track = screen.getByTestId('survey-progress-bar-track');
    expect(track.props.accessibilityRole).toBe('progressbar');
    expect(track.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: model.progressValue,
    });
  });
});

describe('SurveyProgressBar -- effective progress-route guard (review round 2)', () => {
  it.each(['questions', 'requiredQuestions', 'correctQuestions'])(
    'renders the percentage bar for progressBarType "%s"',
    (progressBarType) => {
      const model = twoPageModel({ progressBarType });
      render(<SurveyProgressBar survey={model} />);
      expect(screen.getByTestId('survey-progress-bar')).toBeTruthy();
      expect(screen.getByTestId('survey-progress-bar-fill')).toBeTruthy();
    }
  );

  it('"pages" under the default effective route (default css, non-legacy) routes to progress-buttons upstream: renders null + one diagnostic', () => {
    // Upstream's private progressBarComponentName converts pages ->
    // buttons when !settings.legacyProgressBarView && surveyCss.currentType
    // === "default" (survey.ts:2942-2949) — both hold in this RN runtime.
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    const model = twoPageModel({ progressBarType: 'pages' });
    const { toJSON, rerender } = render(<SurveyProgressBar survey={model} />);
    expect(toJSON()).toBeNull();
    rerender(<SurveyProgressBar survey={model} />);
    const relevant = payloads.filter(
      (p) => p.code === 'progress-bar-type-unsupported'
    );
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      code: 'progress-bar-type-unsupported',
      progressBarType: 'pages',
      effectiveType: 'buttons',
    });
  });

  it('"pages" under legacyProgressBarView renders the percentage bar (upstream keeps the progress-pages route)', () => {
    const { settings } = jest.requireActual<{
      settings: { legacyProgressBarView: boolean };
    }>('../../core/facade');
    settings.legacyProgressBarView = true;
    try {
      const model = twoPageModel({ progressBarType: 'pages' });
      render(<SurveyProgressBar survey={model} />);
      expect(screen.getByTestId('survey-progress-bar-fill')).toBeTruthy();
    } finally {
      settings.legacyProgressBarView = false;
    }
  });

  it('renders null for progressBarType "buttons" and emits a structured diagnostic once', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    const model = twoPageModel({ progressBarType: 'buttons' });
    const { toJSON, rerender } = render(<SurveyProgressBar survey={model} />);
    expect(toJSON()).toBeNull();
    rerender(<SurveyProgressBar survey={model} />);
    const relevant = payloads.filter(
      (p) => p.code === 'progress-bar-type-unsupported'
    );
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      code: 'progress-bar-type-unsupported',
      progressBarType: 'buttons',
    });
  });
});
