/**
 * Task 1.17 regression: the example's kitchen-sink page must render REAL
 * question inputs through the full <Survey> shell (dispatch chain Survey
 * → page → row → chrome → question component — the row dispatch needs the
 * `creator` the shell owns), and the shell must assemble the M1 chrome:
 * header, percentage progress, navigation, and the non-running state
 * frame.
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { act } from 'react';
import { Survey } from '../Survey';
import '../../factories/register-all';

const KS = {
  title: 'KS',
  showProgressBar: true,
  progressBarType: 'questions',
  pages: [
    {
      name: 'basics',
      elements: [
        { type: 'text', name: 'fullName', title: 'Your name' },
        { type: 'comment', name: 'bio', title: 'Short bio' },
      ],
    },
    {
      name: 'second',
      elements: [{ type: 'boolean', name: 'ok', title: 'OK?' }],
    },
  ],
};

function layoutRows(): void {
  for (const row of screen.getAllByTestId('sv-row')) {
    fireEvent(row, 'layout', {
      nativeEvent: { layout: { width: 400, height: 100, x: 0, y: 0 } },
    });
  }
}

it('question inputs render through the shell (row dispatch receives the creator)', () => {
  render(<Survey json={KS} />);
  layoutRows();
  expect(screen.getByTestId('fullName-input')).toBeTruthy();
  expect(screen.getByTestId('comment-input')).toBeTruthy();
});

it('the shell assembles header, progress bar, and navigation around the page', () => {
  render(<Survey json={KS} />);
  expect(screen.getByTestId('survey-header')).toBeTruthy();
  expect(screen.getByText('KS')).toBeTruthy();
  expect(screen.getByTestId('survey-progress-bar')).toBeTruthy();
  expect(screen.getByTestId('survey-nav-sv-nav-next')).toBeTruthy();
});

it('navigation drives the model: Next advances, Complete finishes, the state frame takes over', async () => {
  const json = {
    ...KS,
    completedHtml: '<p>done!</p>',
  };
  render(<Survey json={json} />);
  fireEvent.press(screen.getByTestId('survey-nav-sv-nav-next'));
  // navigationBar.visibleActions recomputes via a debounced microtask.
  await act(async () => {
    await Promise.resolve();
  });
  layoutRows();
  expect(screen.getByTestId('ok-chrome')).toBeTruthy();
  fireEvent.press(screen.getByTestId('survey-nav-sv-nav-complete'));
  await act(async () => {
    await Promise.resolve();
  });
  // Completed: page gone, state frame rendered.
  expect(screen.queryByTestId('sv-page')).toBeNull();
  expect(screen.getByTestId('survey-state-completed')).toBeTruthy();
});
