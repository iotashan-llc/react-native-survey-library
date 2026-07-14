/**
 * `SurveyStateFrame` (task 1.8) -- renders the non-"running" survey
 * states (upstream reactSurvey.tsx `doRender`'s `renderCompleted`/
 * `renderCompletedBefore`/`renderLoading`/`renderEmptySurvey` branches):
 *
 * - `completed`: `survey.processedCompletedHtml` through `<SanitizedHtml>`
 *   (gated by `showCompletedPage`, matching upstream).
 * - `completedbefore`: `survey.processedCompletedBeforeHtml` through
 *   `<SanitizedHtml>`.
 * - `loading`: `survey.processedLoadingHtml` through `<SanitizedHtml>`.
 * - `empty`: `survey.emptySurveyText` via `survey.locEmptySurveyText`
 *   (locstring -- routes through the reactive locstring viewer, not a raw
 *   string read).
 * - `running`/`starting`/`preview`: renders null -- that is 1.1's page
 *   body, not this component's concern.
 */
import { render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import { SurveyStateFrame } from '../SurveyStateFrame';

describe('SurveyStateFrame -- state dispatch', () => {
  it('renders null for the running state (single-page survey with content)', () => {
    const model = new Model({ elements: [{ type: 'text', name: 'q1' }] });
    expect(model.state).toBe('running');
    const { toJSON } = render(<SurveyStateFrame survey={model} />);
    expect(toJSON()).toBeNull();
  });

  it('empty: renders emptySurveyText via the locstring viewer', () => {
    const model = new Model({});
    expect(model.state).toBe('empty');
    render(<SurveyStateFrame survey={model} />);
    expect(screen.getByTestId('survey-state-empty')).toBeTruthy();
    expect(screen.getByText(model.emptySurveyText)).toBeTruthy();
  });

  it('completed: renders processedCompletedHtml through SanitizedHtml (author JSON sink)', () => {
    const model = new Model({ completedHtml: '<b>Thanks!</b>' });
    model.doComplete();
    expect(model.state).toBe('completed');
    render(<SurveyStateFrame survey={model} />);
    expect(screen.getByTestId('survey-state-completed')).toBeTruthy();
    expect(screen.getByText('Thanks!')).toBeTruthy();
  });

  it('completed: renders null when showCompletedPage is false (upstream gate honored)', () => {
    const model = new Model({ completedHtml: '<b>Thanks!</b>' });
    model.doComplete();
    model.showCompletedPage = false;
    const { toJSON } = render(<SurveyStateFrame survey={model} />);
    expect(toJSON()).toBeNull();
  });

  it('completedbefore: renders processedCompletedBeforeHtml through SanitizedHtml', () => {
    const model = new Model({ completedBeforeHtml: '<i>Already done</i>' });
    // completedBefore is normally driven by a cookie-name check; the RN
    // delta documents host-persistence instead (won't-support list) --
    // this test drives the state directly via the model's own property.
    (model as unknown as { isCompletedBefore: boolean }).isCompletedBefore =
      true;
    expect(model.state).toBe('completedbefore');
    render(<SurveyStateFrame survey={model} />);
    expect(screen.getByTestId('survey-state-completed-before')).toBeTruthy();
    expect(screen.getByText('Already done')).toBeTruthy();
  });

  it('loading: renders processedLoadingHtml through SanitizedHtml', () => {
    const model = new Model({ loadingHtml: '<span>Loading…</span>' });
    model.beginLoading();
    expect(model.state).toBe('loading');
    render(<SurveyStateFrame survey={model} />);
    expect(screen.getByTestId('survey-state-loading')).toBeTruthy();
    expect(screen.getByText('Loading…')).toBeTruthy();
  });
});
