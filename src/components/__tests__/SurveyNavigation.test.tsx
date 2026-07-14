/**
 * `SurveyNavigation` (task 1.8) -- the Prev/Next/Complete/Preview button
 * bar bound to `survey.navigationBar` (core's own `ActionContainer`,
 * upstream reactSurveyNavigation/action bar). Per invariant 6, visibility
 * logic is CONSUMED from `navigationBar.visibleActions`, never re-derived;
 * each visible action renders through the already-built `<ActionButton>`
 * primitive (task 1.5) -- not a port of upstream's DOM-shaped
 * `SurveyNavigationButton`/`sv-nav-btn` (documented RN delta: ActionButton
 * is the native Pressable equivalent).
 *
 * `navigationBar.visibleActions` recomputes via a debounced
 * (`queueMicrotask`) internal update (survey-core `actions/container.ts`)
 * -- tests that navigate pages await a microtask tick before asserting.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import { SurveyNavigation } from '../SurveyNavigation';

describe('SurveyNavigation -- render gate', () => {
  it('renders null when there are no visible nav actions', () => {
    const model = new Model({});
    expect(model.navigationBar.visibleActions.length).toBe(0);
    const { toJSON } = render(<SurveyNavigation survey={model} />);
    expect(toJSON()).toBeNull();
  });

  it('renders an ActionButton per visible nav action (single-page survey: Complete only)', () => {
    const model = new Model({ elements: [{ type: 'text', name: 'q1' }] });
    render(<SurveyNavigation survey={model} />);
    expect(screen.getByTestId('survey-nav-sv-nav-complete')).toBeTruthy();
    expect(screen.queryByTestId('survey-nav-sv-nav-next')).toBeNull();
    expect(screen.queryByTestId('survey-nav-sv-nav-prev')).toBeNull();
  });

  it('renders Next (not Complete) on the first page of a multi-page survey', () => {
    const model = new Model({
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    render(<SurveyNavigation survey={model} />);
    expect(screen.getByTestId('survey-nav-sv-nav-next')).toBeTruthy();
    expect(screen.queryByTestId('survey-nav-sv-nav-complete')).toBeNull();
  });
});

describe('SurveyNavigation -- reactivity + press wiring', () => {
  it('re-renders the button set after navigating to the last page (Prev + Complete replace Next)', async () => {
    const model = new Model({
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    render(<SurveyNavigation survey={model} />);
    await act(async () => {
      model.nextPage();
      await Promise.resolve();
    });
    expect(screen.getByTestId('survey-nav-sv-nav-prev')).toBeTruthy();
    expect(screen.getByTestId('survey-nav-sv-nav-complete')).toBeTruthy();
    expect(screen.queryByTestId('survey-nav-sv-nav-next')).toBeNull();
  });

  it('pressing Next advances the current page (uses the real Action.doAction binding, no reinvented logic)', () => {
    const model = new Model({
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    render(<SurveyNavigation survey={model} />);
    const nextButton = screen.getByTestId('survey-nav-sv-nav-next');
    fireEvent.press(nextButton);
    expect(model.currentPageNo).toBe(1);
  });
});
