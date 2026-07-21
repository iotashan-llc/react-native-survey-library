/**
 * `SurveyProgressButtons` (task 5.7c) — the step-button progress nav: RN
 * port of survey-react-ui's `SurveyProgressButtons` (progressButtons.tsx).
 * survey-core owns the whole model: the component reuses the survey's own
 * `ProgressButtons` (`survey.progressBar`) — `visiblePages`,
 * `getItemNumber`, `showItemTitles`, `getListElementCss` (passed/current/
 * non-clickable tokens), `isListElementClickable`, and `clickListElement`
 * for navigation. Reactive via the 0.4 `SurveyElementBase` mechanism
 * (state element = the `ProgressButtons` model).
 */
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { Model } from '../../core/facade';
import { SurveyProgressButtons } from '../SurveyProgressButtons';

function threePageModel(extra: Record<string, unknown> = {}): Model {
  return new Model({
    showProgressBar: true,
    progressBarType: 'buttons',
    progressBarShowPageTitles: true,
    progressBarShowPageNumbers: true,
    ...extra,
    pages: [
      {
        name: 'p1',
        title: 'Page One',
        elements: [{ type: 'text', name: 'q1' }],
      },
      {
        name: 'p2',
        title: 'Page Two',
        elements: [{ type: 'text', name: 'q2' }],
      },
      {
        name: 'p3',
        title: 'Page Three',
        elements: [{ type: 'text', name: 'q3' }],
      },
    ],
  });
}

describe('SurveyProgressButtons — step items', () => {
  it('renders one step item per visible page (not the percentage bar)', () => {
    const model = threePageModel();
    render(<SurveyProgressButtons survey={model} />);
    expect(screen.getByTestId('survey-progress-buttons')).toBeTruthy();
    expect(screen.getByTestId('survey-progress-step-0')).toBeTruthy();
    expect(screen.getByTestId('survey-progress-step-1')).toBeTruthy();
    expect(screen.getByTestId('survey-progress-step-2')).toBeTruthy();
    expect(screen.queryByTestId('survey-progress-step-3')).toBeNull();
    // Never the percentage-bar fill (that is SurveyProgressBar's element).
    expect(screen.queryByTestId('survey-progress-bar-fill')).toBeNull();
  });

  it('each step shows its item number and (when enabled) navigation title', () => {
    const model = threePageModel();
    render(<SurveyProgressButtons survey={model} />);
    const pb = model.progressBar as { getItemNumber(p: unknown): string };
    const step0 = screen.getByTestId('survey-progress-step-0');
    expect(
      within(step0).getByText(pb.getItemNumber(model.visiblePages[0]))
    ).toBeTruthy();
    expect(within(step0).getByText('Page One')).toBeTruthy();
    const step2 = screen.getByTestId('survey-progress-step-2');
    expect(within(step2).getByText('Page Three')).toBeTruthy();
  });

  it('renders null when showProgressBar is false', () => {
    const model = threePageModel({ showProgressBar: false });
    const { toJSON } = render(<SurveyProgressButtons survey={model} />);
    expect(toJSON()).toBeNull();
  });
});

describe('SurveyProgressButtons — navigation through clickListElement', () => {
  it('tapping a clickable step navigates via clickListElement (currentPage changes)', () => {
    const model = threePageModel();
    const pb = model.progressBar as { clickListElement(p: unknown): void };
    const spy = jest.spyOn(pb, 'clickListElement');
    render(<SurveyProgressButtons survey={model} />);
    expect(model.currentPageNo).toBe(0);
    act(() => {
      fireEvent.press(screen.getByTestId('survey-progress-step-2'));
    });
    expect(spy).toHaveBeenCalledWith(model.visiblePages[2]);
    expect(model.currentPageNo).toBe(2);
  });

  it('a non-clickable step does NOT navigate', () => {
    const model = threePageModel();
    // A server-validation handler + the default (non-onComplete) errors
    // mode makes future steps non-clickable: isListElementClickable(i) =
    // i <= currentPageNo + 1 (progress-buttons.ts).
    model.onServerValidateQuestions.add(() => {});
    const pb = model.progressBar as {
      isListElementClickable(i: number): boolean;
      clickListElement(p: unknown): void;
    };
    expect(pb.isListElementClickable(2)).toBe(false);
    const spy = jest.spyOn(pb, 'clickListElement');
    render(<SurveyProgressButtons survey={model} />);
    act(() => {
      fireEvent.press(screen.getByTestId('survey-progress-step-2'));
    });
    expect(spy).not.toHaveBeenCalled();
    expect(model.currentPageNo).toBe(0);
  });

  it('the active step reflects currentPage (accessibilityState.selected)', () => {
    const model = threePageModel();
    render(<SurveyProgressButtons survey={model} />);
    expect(
      screen.getByTestId('survey-progress-step-0').props.accessibilityState
        ?.selected
    ).toBe(true);
    expect(
      screen.getByTestId('survey-progress-step-2').props.accessibilityState
        ?.selected
    ).toBe(false);
    act(() => {
      fireEvent.press(screen.getByTestId('survey-progress-step-2'));
    });
    expect(
      screen.getByTestId('survey-progress-step-2').props.accessibilityState
        ?.selected
    ).toBe(true);
    expect(
      screen.getByTestId('survey-progress-step-0').props.accessibilityState
        ?.selected
    ).toBe(false);
  });
});
