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
import { act, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import { SurveyProgressBar } from '../SurveyProgressBar';

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
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    render(<SurveyProgressBar survey={model} />);
    const fill = screen.getByTestId('survey-progress-bar-fill');
    const track = screen.getByTestId('survey-progress-bar');
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
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    render(<SurveyProgressBar survey={model} />);
    const before = model.progressText;
    await act(async () => {
      model.nextPage();
      await Promise.resolve();
    });
    expect(screen.getByText(model.progressText)).toBeTruthy();
    expect(model.progressText).not.toBe(before);
  });
});
