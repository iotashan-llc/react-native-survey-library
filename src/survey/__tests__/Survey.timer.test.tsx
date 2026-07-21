/**
 * `<Survey>` timer lifecycle (task 5.7a). The shell mirrors survey-react-ui's
 * `reactSurvey` timer wiring: `startTimerFromUI()` on mount (starts the core
 * timer only when `showTimer` is set and the survey is running) and
 * `stopTimer()` on unmount (no leaked `SurveyTimer` interval). The timer
 * panel renders at the top/bottom of the shell per `showTimer`/`timerLocation`.
 */
import * as React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Survey } from '../Survey';
import type { SurveyRefHandle } from '../Survey';

/** Flush the shell's deferred timer-start macrotask (componentDidMount →
 * setTimeout(0) → startTimerFromUI). */
function flushTimerStart(): void {
  act(() => {
    jest.advanceTimersByTime(1);
  });
}

const TIMER_JSON = {
  showTimer: true,
  timerLocation: 'top',
  timeLimit: 60,
  timeLimitPerPage: 30,
  pages: [{ name: 'p1', elements: [{ type: 'text', name: 'q1' }] }],
};

const NO_TIMER_JSON = {
  pages: [{ name: 'p1', elements: [{ type: 'text', name: 'q1' }] }],
};

// Fake timers file-wide: mounting a running timer survey schedules core
// timers (the SurveyTimer interval + `updateProgress`'s setTimeout(0)) and
// the shell's own responsive setTimeout(0). Faking keeps them from firing
// (and escaping `act`) mid-assertion; teardown discards any still pending.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('<Survey> timer lifecycle', () => {
  it('starts the core timer on mount when showTimer is set and the survey is running', () => {
    const ref = React.createRef<SurveyRefHandle>();
    render(<Survey ref={ref} json={TIMER_JSON} />);
    const model = ref.current!.model!;
    expect(model.state).toBe('running');
    flushTimerStart();
    expect(model.timerModel.isRunning).toBe(true);
  });

  it('does not start the timer when showTimer is disabled', () => {
    const ref = React.createRef<SurveyRefHandle>();
    render(<Survey ref={ref} json={NO_TIMER_JSON} />);
    flushTimerStart();
    const model = ref.current!.model!;
    expect(model.timerModel.isRunning).toBe(false);
  });

  it('stops the core timer on unmount (no leaked interval)', () => {
    const ref = React.createRef<SurveyRefHandle>();
    const { unmount } = render(<Survey ref={ref} json={TIMER_JSON} />);
    flushTimerStart();
    const timerModel = ref.current!.model!.timerModel;
    expect(timerModel.isRunning).toBe(true);
    unmount();
    expect(timerModel.isRunning).toBe(false);
  });

  it('renders the timer panel at the top of the shell', () => {
    render(<Survey json={TIMER_JSON} />);
    flushTimerStart();
    expect(screen.getByTestId('survey-timer-panel-top')).toBeTruthy();
    // Clock major value from the model (page limit 30 → "0:30").
    expect(screen.getByText('0:30')).toBeTruthy();
    expect(screen.queryByTestId('survey-timer-panel-bottom')).toBeNull();
  });

  it('renders no timer panel when showTimer is disabled', () => {
    render(<Survey json={NO_TIMER_JSON} />);
    flushTimerStart();
    expect(screen.queryByTestId('survey-timer-panel-top')).toBeNull();
    expect(screen.queryByTestId('survey-timer-panel-bottom')).toBeNull();
  });
});
