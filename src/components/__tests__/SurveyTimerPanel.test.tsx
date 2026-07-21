/**
 * `SurveyTimerPanel` (task 5.7a) — RN port of survey-react-ui's
 * `SurveyTimerPanel` (reacttimerpanel.tsx). All timing math + auto-advance/
 * auto-complete live in survey-core (`SurveyTimerModel` / `SurveyTimer`);
 * this component only RENDERS the model's timer text and re-renders on the
 * model's per-tick property notifications. These tests pin: the clock
 * variant renders the model's `clockMajorText`/`clockMinorText`; a timer
 * tick (advanced via fake timers) re-renders with the updated value; the
 * plain-text variant renders `timerModel.text` when `showTimerAsClock` is
 * false; and the placement/isRunning gates render nothing when the panel
 * should not show.
 */
import { act, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import { SurveyTimerPanel } from '../SurveyTimerPanel';

let active: Model | undefined;

function timerModel(extra: Record<string, unknown> = {}): Model {
  const model = new Model({
    showTimer: true,
    timerLocation: 'top',
    timeLimit: 60,
    timeLimitPerPage: 30,
    pages: [{ elements: [{ type: 'text', name: 'q1' }] }],
    ...extra,
  });
  active = model;
  return model;
}

// Fake timers file-wide: survey-core's SurveyTimer owns a real interval and
// `updateProgress` schedules a `setTimeout(…, 0)` on the first tick. Faking
// keeps every core-scheduled update deterministic (advanced inside `act`, or
// discarded by the teardown below) so no state update escapes `act`.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  // The panel does not own the SurveyTimer interval — the model does; stop
  // it so the module-singleton SurveyTimer never leaks across tests, then
  // drop any still-pending core timer (e.g. the progress setTimeout).
  active?.stopTimer();
  active = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('SurveyTimerPanel — render gate', () => {
  it('renders nothing when the timer is not running', () => {
    const model = timerModel();
    // No startTimer() — timerModel.isRunning is false.
    const { toJSON } = render(
      <SurveyTimerPanel survey={model} location="top" />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when showTimer is disabled (showTimerPanel "none")', () => {
    const model = timerModel({ showTimer: false });
    act(() => {
      model.startTimer();
    });
    const { toJSON } = render(
      <SurveyTimerPanel survey={model} location="top" />
    );
    // isTimerPanelShowingOnTop is false → panel renders nothing.
    expect(toJSON()).toBeNull();
    expect(screen.queryByTestId('survey-timer-panel-top')).toBeNull();
  });

  it('renders nothing at "bottom" when the timer shows at the top', () => {
    const model = timerModel({ timerLocation: 'top' });
    act(() => {
      model.startTimer();
    });
    const { toJSON } = render(
      <SurveyTimerPanel survey={model} location="bottom" />
    );
    expect(toJSON()).toBeNull();
  });
});

describe('SurveyTimerPanel — clock variant (default modern css)', () => {
  it('renders the model clock major/minor text at the matching location', () => {
    const model = timerModel();
    act(() => {
      model.startTimer();
    });
    render(<SurveyTimerPanel survey={model} location="top" />);
    expect(screen.getByTestId('survey-timer-panel-top')).toBeTruthy();
    // combined mode, page limit 30 → major "0:30"; survey limit 60 → minor "1:00".
    expect(model.timerModel.showTimerAsClock).toBe(true);
    expect(screen.getByText('0:30')).toBeTruthy();
    expect(screen.getByText('1:00')).toBeTruthy();
  });

  it('renders at "bottom" when timerLocation is bottom', () => {
    const model = timerModel({ timerLocation: 'bottom' });
    act(() => {
      model.startTimer();
    });
    render(<SurveyTimerPanel survey={model} location="bottom" />);
    expect(screen.getByTestId('survey-timer-panel-bottom')).toBeTruthy();
    expect(screen.getByText('0:30')).toBeTruthy();
  });
});

describe('SurveyTimerPanel — reactive tick', () => {
  it('re-renders with the updated clock value when the timer model ticks', () => {
    const model = timerModel();
    act(() => {
      model.startTimer();
    });
    render(<SurveyTimerPanel survey={model} location="top" />);
    // Remaining page time starts at 0:30.
    expect(screen.getByText('0:30')).toBeTruthy();
    // Advance the core SurveyTimer by one second — doTimer decrements the
    // page/survey remaining and fires the model's per-tick property change.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(model.timeSpent).toBe(1);
    expect(screen.queryByText('0:30')).toBeNull();
    expect(screen.getByText('0:29')).toBeTruthy();
    expect(screen.getByText('0:59')).toBeTruthy();
  });
});

describe('SurveyTimerPanel — plain-text variant (showTimerAsClock false)', () => {
  it('renders timerModel.text when the css has no clock root', () => {
    const model = timerModel();
    act(() => {
      model.startTimer();
    });
    // Force the non-clock (legacy) rendering path without touching css.
    jest
      .spyOn(model.timerModel, 'showTimerAsClock', 'get')
      .mockReturnValue(false);
    render(<SurveyTimerPanel survey={model} location="top" />);
    expect(screen.getByTestId('survey-timer-panel-text')).toBeTruthy();
    expect(screen.getByText(model.timerModel.text)).toBeTruthy();
  });
});
