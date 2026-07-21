/**
 * `SurveyNotifier` (task 5.7c) — the floating toast: RN port of
 * survey-react-ui's `NotifierComponent` (components/notifier.tsx). Bound
 * to `survey.notifier` (the core `Notifier`), it shows the active message
 * with its type styling, auto-hides on the model's timer, and renders any
 * `waitUserAction` actions through the shared `ActionButton`. Reactive via
 * the 0.4 `SurveyElementBase` mechanism (state element = `survey.notifier`).
 */
import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Model } from '../../core/facade';
import { SurveyNotifier } from '../SurveyNotifier';

function makeModel(): Model {
  return new Model({ elements: [{ type: 'text', name: 'q1' }] });
}

describe('SurveyNotifier — fallback', () => {
  it('renders null when there is no active notification', () => {
    const model = makeModel();
    const { toJSON } = render(<SurveyNotifier survey={model} />);
    expect(toJSON()).toBeNull();
  });
});

describe('SurveyNotifier — toast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the toast with the message on survey.notify', () => {
    const model = makeModel();
    render(<SurveyNotifier survey={model} />);
    act(() => {
      model.notify('Saved!', 'info');
      jest.advanceTimersByTime(2);
    });
    expect(screen.getByTestId('survey-notifier')).toBeTruthy();
    expect(screen.getByText('Saved!')).toBeTruthy();
  });

  it('auto-hides after the notifier lifetime', () => {
    const model = makeModel();
    render(<SurveyNotifier survey={model} />);
    act(() => {
      model.notify('bye', 'info');
      jest.advanceTimersByTime(2);
    });
    expect(screen.getByText('bye')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(2100);
    });
    expect(screen.queryByText('bye')).toBeNull();
  });

  it('maps notification type to distinct styling (info vs error)', () => {
    const model = makeModel();
    render(<SurveyNotifier survey={model} />);
    act(() => {
      model.notify('m', 'info');
      jest.advanceTimersByTime(2);
    });
    const infoBg = StyleSheet.flatten(
      screen.getByTestId('survey-notifier').props.style
    ).backgroundColor;
    act(() => {
      model.notify('m', 'error');
      jest.advanceTimersByTime(2);
    });
    const errorBg = StyleSheet.flatten(
      screen.getByTestId('survey-notifier').props.style
    ).backgroundColor;
    expect(infoBg).toBeTruthy();
    expect(errorBg).toBeTruthy();
    expect(errorBg).not.toBe(infoBg);
  });

  it('waitUserAction keeps the toast open with an action button (no auto-hide)', () => {
    const model = makeModel();
    render(<SurveyNotifier survey={model} />);
    // survey.notify(message, type, showActions=true) => the notifier's
    // waitUserAction path: actions become visible and NO auto-hide timer
    // is scheduled.
    act(() => {
      model.notify('failed', 'error', true);
      jest.advanceTimersByTime(2);
    });
    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.getByTestId('notifier-actions')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('failed')).toBeTruthy();
  });
});
