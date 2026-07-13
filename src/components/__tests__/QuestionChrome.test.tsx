/**
 * `QuestionChrome` — the wrapper every question renders inside: title (with
 * number gutter + required mark), description, error panel, comment area,
 * collapse/expand header behavior (design: docs/IMPLEMENTATION-PLAN.md row
 * 1.7; docs/design/0.4-reactive-base.md's `QuestionElementBase` +
 * `renderLocString` seam; docs/design/0.7-theme-rn.md's `questionTitle`
 * recipe + `getRootCss()` bridge; upstream survey-react-ui `reactquestion.tsx`
 * (`SurveyQuestion`) / `element-header.tsx` / `title-content.tsx`).
 *
 * `QuestionChrome` is the RN analog of upstream's `SurveyQuestion` — the
 * one place in the port map that overrides `getStateElement()` to
 * subscribe directly to the question model (title/description/errors/
 * comment/state all live on the SAME question object).
 */
import { Text } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import { QuestionChrome } from '../QuestionChrome';
import { SurveyThemeProvider } from '../../theme-rn/provider';

function createQuestion(name: string, type = 'text'): Question {
  // `showQuestionNumbers` defaults to `"off"` (survey.ts Serializer
  // registration) — question numbering is opt-in, not a side effect of
  // constructing a `Model`. Turn it on explicitly for fixtures that
  // exercise the number gutter.
  const model = new Model({
    elements: [{ type, name }],
    showQuestionNumbers: 'on',
  });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return question;
}

/** Only choice-based question types (question_baseselect.ts) actually
 * support the general `showCommentArea` slot — `Question.supportComment()`
 * checks the Serializer's `showCommentArea:switch` `visible` flag, which
 * the base `Question` registration leaves `false` and only
 * `question_baseselect.ts` flips to `true`; setting `showCommentArea` on a
 * plain `text` question silently no-ops. */
function createChoiceQuestion(name: string): Question {
  const model = new Model({
    elements: [{ type: 'checkbox', name, choices: ['a', 'b'] }],
  });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return question;
}

describe('QuestionChrome', () => {
  it('renders without a creator prop (chrome does not dispatch — it wraps an already-dispatched child)', () => {
    const question = createQuestion('q-no-creator');
    expect(() => render(<QuestionChrome question={question} />)).not.toThrow();
  });

  it('does not render at all when there is no question', () => {
    const { toJSON } = render(
      <QuestionChrome question={undefined as unknown as Question} />
    );
    expect(toJSON()).toBeNull();
  });

  describe('title / number / required', () => {
    it('renders the question title text', () => {
      const question = createQuestion('q-title');
      question.title = 'My Question';
      render(<QuestionChrome question={question} />);
      expect(screen.getByText('My Question')).toBeTruthy();
    });

    it('renders the question number', () => {
      const question = createQuestion('q-number');
      question.title = 'Numbered';
      render(<QuestionChrome question={question} />);
      expect(question.no).toBeTruthy();
      expect(screen.getByText(question.no)).toBeTruthy();
    });

    it('renders the required mark when isRequired is true', () => {
      const question = createQuestion('q-required');
      question.title = 'Required Q';
      question.isRequired = true;
      render(<QuestionChrome question={question} />);
      expect(question.requiredMark).toBeTruthy();
      expect(screen.getByText(question.requiredMark)).toBeTruthy();
    });

    it('does not render a required mark when isRequired is false', () => {
      const question = createQuestion('q-not-required');
      question.title = 'Optional Q';
      question.isRequired = false;
      render(<QuestionChrome question={question} />);
      expect(screen.queryByText('*')).toBeNull();
    });
  });

  describe('titleLocation hidden', () => {
    it('renders no title text when titleLocation is "hidden"', () => {
      const question = createQuestion('q-hidden-title');
      question.title = 'Should Not Appear';
      question.titleLocation = 'hidden';
      render(<QuestionChrome question={question} />);
      expect(question.hasTitle).toBe(false);
      expect(screen.queryByText('Should Not Appear')).toBeNull();
    });
  });

  describe('description', () => {
    it('renders nothing when the question has no description', () => {
      const question = createQuestion('q-no-desc');
      question.title = 'No Description';
      render(<QuestionChrome question={question} />);
      expect(question.hasDescription).toBe(false);
    });

    it('renders the description under the title by default', () => {
      const question = createQuestion('q-desc-title');
      question.title = 'With Description';
      question.description = 'Explains the question';
      render(<QuestionChrome question={question} />);
      expect(question.hasDescriptionUnderTitle).toBe(true);
      expect(screen.getByText('Explains the question')).toBeTruthy();
    });

    it('renders the description near the content when descriptionLocation is "underInput"', () => {
      const question = createQuestion('q-desc-input');
      question.title = 'Under Input';
      question.description = 'Below the input';
      question.descriptionLocation = 'underInput';
      render(<QuestionChrome question={question} />);
      expect(question.hasDescriptionUnderInput).toBe(true);
      expect(screen.getByText('Below the input')).toBeTruthy();
    });

    it('renders nothing when descriptionLocation is "hidden"', () => {
      const question = createQuestion('q-desc-hidden');
      question.title = 'Hidden Description';
      question.description = 'Never shown';
      question.descriptionLocation = 'hidden';
      render(<QuestionChrome question={question} />);
      expect(screen.queryByText('Never shown')).toBeNull();
    });
  });

  describe('errors', () => {
    it('renders no error panel when the question is valid', () => {
      const question = createQuestion('q-valid');
      question.title = 'Valid';
      render(<QuestionChrome question={question} />);
      expect(question.hasVisibleErrors).toBe(false);
    });

    it('renders the validation error text above the question by default', () => {
      const question = createQuestion('q-invalid');
      question.title = 'Invalid';
      question.isRequired = true;
      question.hasErrors();
      expect(question.hasVisibleErrors).toBe(true);
      render(<QuestionChrome question={question} />);
      expect(
        screen.getByText(question.renderedErrors[0]!.getText())
      ).toBeTruthy();
    });

    it('renders errors below the question when errorLocation is "bottom"', () => {
      const question = createQuestion('q-invalid-bottom');
      question.title = 'Invalid Bottom';
      question.isRequired = true;
      question.errorLocation = 'bottom';
      question.hasErrors();
      expect(question.showErrorsBelowQuestion).toBe(true);
      render(<QuestionChrome question={question} />);
      expect(
        screen.getByText(question.renderedErrors[0]!.getText())
      ).toBeTruthy();
    });
  });

  describe('collapse / expand', () => {
    it('renders children when the question is not collapsible', () => {
      const question = createQuestion('q-plain');
      question.title = 'Plain';
      render(
        <QuestionChrome question={question}>
          <Text>child content</Text>
        </QuestionChrome>
      );
      expect(screen.getByText('child content')).toBeTruthy();
    });

    it('hides children when the question state is "collapsed"', () => {
      const question = createQuestion('q-collapsed');
      question.title = 'Collapsed';
      question.state = 'collapsed';
      render(
        <QuestionChrome question={question}>
          <Text>hidden child</Text>
        </QuestionChrome>
      );
      expect(screen.queryByText('hidden child')).toBeNull();
      // title/description remain visible while collapsed.
      expect(screen.getByText('Collapsed')).toBeTruthy();
    });

    it('tapping the header expands a collapsed question and reveals children', () => {
      const question = createQuestion('q-collapsed-tap');
      question.title = 'Tap To Expand';
      question.state = 'collapsed';
      render(
        <QuestionChrome question={question}>
          <Text>revealed child</Text>
        </QuestionChrome>
      );
      expect(screen.queryByText('revealed child')).toBeNull();
      fireEvent.press(screen.getByTestId('q-collapsed-tap-title'));
      expect(question.isCollapsed).toBe(false);
      expect(screen.getByText('revealed child')).toBeTruthy();
    });

    it('tapping a non-expandable header does nothing (state stays "default")', () => {
      const question = createQuestion('q-not-expandable');
      question.title = 'Static';
      render(
        <QuestionChrome question={question}>
          <Text>always visible</Text>
        </QuestionChrome>
      );
      fireEvent.press(screen.getByTestId('q-not-expandable-title'));
      expect(question.state).toBe('default');
      expect(screen.getByText('always visible')).toBeTruthy();
    });
  });

  describe('comment area', () => {
    it('renders no comment input when showCommentArea is false', () => {
      const question = createQuestion('q-no-comment');
      render(<QuestionChrome question={question} />);
      expect(screen.queryByTestId('q-no-comment-comment')).toBeNull();
    });

    it('renders a comment TextInput initialized from question.comment when showCommentArea is true', () => {
      const question = createChoiceQuestion('q-comment');
      question.showCommentArea = true;
      question.comment = 'existing note';
      render(<QuestionChrome question={question} />);
      const input = screen.getByTestId('q-comment-comment');
      expect(input.props.value).toBe('existing note');
    });

    it('commits the typed comment to question.comment onBlur, not on every keystroke', () => {
      const question = createChoiceQuestion('q-comment-commit');
      question.showCommentArea = true;
      render(<QuestionChrome question={question} />);
      const input = screen.getByTestId('q-comment-commit-comment');
      fireEvent.changeText(input, 'typed note');
      expect(question.comment).toBe('');
      fireEvent(input, 'blur');
      expect(question.comment).toBe('typed note');
    });

    it('external comment mutation syncs into the rendered draft', () => {
      const question = createChoiceQuestion('q-comment-external');
      question.showCommentArea = true;
      render(<QuestionChrome question={question} />);
      // The mutation originates OUTSIDE any RTL event helper, so the
      // resulting `setState` chain (property-changed callback -> revision
      // bump -> componentDidUpdate's draft sync) must be flushed inside
      // `act()` before the query below observes it.
      act(() => {
        question.comment = 'set elsewhere';
      });
      const input = screen.getByTestId('q-comment-external-comment');
      expect(input.props.value).toBe('set elsewhere');
    });

    it('hides the comment area when the question is collapsed', () => {
      const question = createChoiceQuestion('q-comment-collapsed');
      question.title = 'Collapsed Comment';
      question.showCommentArea = true;
      question.state = 'collapsed';
      render(<QuestionChrome question={question} />);
      expect(screen.queryByTestId('q-comment-collapsed-comment')).toBeNull();
    });
  });

  describe('theming', () => {
    it('the title picks up the provider theme (fontWeight from the questionTitle recipe)', () => {
      const question = createQuestion('q-themed');
      question.title = 'Themed Title';
      render(
        <SurveyThemeProvider>
          <QuestionChrome question={question} />
        </SurveyThemeProvider>
      );
      const flat = Object.assign(
        {},
        ...[screen.getByText('Themed Title').props.style].flat()
      );
      expect(flat.fontWeight).toBe('600');
    });
  });
});
