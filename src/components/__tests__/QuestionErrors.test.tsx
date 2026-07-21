/**
 * `QuestionErrors` — the reusable, independently-REACTIVE error renderer
 * extracted from `QuestionChrome`'s private `renderErrors` (design:
 * docs/design/M3-matrix-family-plan.md §2a, phasing row 3.3a-pre). A
 * `SurveyElementBase`-derived class component that subscribes to the
 * `Question` it is given (`getStateElement()`), returns `null` unless the
 * question has visible errors (the chrome's existing gate), and renders
 * `question.renderedErrors` with the chrome's error styling (the
 * `questionChrome` recipe's tone policy: `currentNotificationType`).
 *
 * The reactivity contract is the whole point of the extraction: an error
 * appearing or clearing on the question AFTER mount must re-render this
 * unit on its own — no parent re-render required (§2a: "subscribes
 * independently ... so an error appearing or clearing on a cell question
 * re-renders the inline errors WITHOUT the table base having to know").
 */
import { act, render, screen } from '@testing-library/react-native';

import { Model, SurveyError } from '../../core/facade';
import type { Question } from '../../core/facade';
import { QuestionErrors } from '../QuestionErrors';
import { buildQuestionChromeRecipe } from '../../theme-rn/recipes/questionChrome';
import { resolveTheme } from '../../theme-core/resolve';

function createRequiredQuestion(name: string): Question {
  const model = new Model({
    elements: [{ type: 'text', name, isRequired: true }],
  });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return question;
}

function flatStyle(style: unknown): Record<string, unknown> {
  return Object.assign(
    {},
    ...(Array.isArray(style) ? (style.flat(Infinity) as object[]) : [style])
  );
}

describe('QuestionErrors', () => {
  it('renders nothing while the question has no visible errors', () => {
    const question = createRequiredQuestion('qe-valid');
    const { toJSON } = render(<QuestionErrors question={question} />);
    expect(question.hasVisibleErrors).toBe(false);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when there is no question', () => {
    const { toJSON } = render(
      <QuestionErrors question={undefined as unknown as Question} />
    );
    expect(toJSON()).toBeNull();
  });

  it('an error appearing AFTER mount renders reactively — no parent re-render (§2a independent subscription)', () => {
    const question = createRequiredQuestion('qe-reactive');
    const { toJSON } = render(<QuestionErrors question={question} />);
    expect(toJSON()).toBeNull();
    act(() => {
      question.hasErrors();
    });
    expect(question.hasVisibleErrors).toBe(true);
    expect(
      screen.getByText(question.renderedErrors[0]!.getText())
    ).toBeTruthy();
  });

  it('an error clearing AFTER mount removes the panel reactively', () => {
    const question = createRequiredQuestion('qe-clears');
    render(<QuestionErrors question={question} />);
    act(() => {
      question.hasErrors();
    });
    expect(screen.getByTestId('qe-clears-errors-below')).toBeTruthy();
    act(() => {
      question.value = 'now answered';
      question.hasErrors();
    });
    expect(question.hasVisibleErrors).toBe(false);
    expect(screen.queryByTestId('qe-clears-errors-below')).toBeNull();
  });

  it('defaults to the below-position panel (testID + errorPanelBelow fragment) for inline cell use', () => {
    const question = createRequiredQuestion('qe-below');
    question.hasErrors();
    render(<QuestionErrors question={question} />);
    const fragments = buildQuestionChromeRecipe(resolveTheme()).fragments;
    const panel = screen.getByTestId('qe-below-errors-below');
    expect(panel.props.accessibilityRole).toBe('alert');
    // Android/TalkBack needs an explicit live region to announce errors.
    expect(panel.props.accessibilityLiveRegion).toBe('assertive');
    const style = flatStyle(panel.props.style);
    expect(style.backgroundColor).toBe(fragments.errorPanel.backgroundColor);
    expect(style.marginTop).toBe(fragments.errorPanelBelow.marginTop);
  });

  it('position="above" renders the above-position panel variant', () => {
    const question = createRequiredQuestion('qe-above');
    question.hasErrors();
    render(<QuestionErrors question={question} position="above" />);
    const fragments = buildQuestionChromeRecipe(resolveTheme()).fragments;
    const style = flatStyle(
      screen.getByTestId('qe-above-errors-above').props.style
    );
    expect(style.marginBottom).toBe(fragments.errorPanelAbove.marginBottom);
  });

  it('preserves the chrome tone policy — warning-only errors get the warning tone', () => {
    const question = createRequiredQuestion('qe-warn');
    const error = new SurveyError('careful now');
    error.notificationType = 'warning';
    act(() => {
      question.addError(error);
    });
    render(<QuestionErrors question={question} />);
    expect(question.currentNotificationType).toBe('warning');
    const fragments = buildQuestionChromeRecipe(resolveTheme()).fragments;
    const panel = flatStyle(
      screen.getByTestId('qe-warn-errors-below').props.style
    );
    expect(panel.backgroundColor).toBe(
      fragments.errorPanelWarning.backgroundColor
    );
    const item = flatStyle(screen.getByText('careful now').props.style);
    expect(item.color).toBe(fragments.errorItemWarning.color);
  });
});
