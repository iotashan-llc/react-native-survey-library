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
import { Text, StyleSheet } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';

import { Model, SurveyError } from '../../core/facade';
import type { Question } from '../../core/facade';
import { QuestionChrome } from '../QuestionChrome';
import { SurveyThemeProvider } from '../../theme-rn/provider';
import { buildQuestionChromeRecipe } from '../../theme-rn/recipes/questionChrome';
import { resolveTheme } from '../../theme-core/resolve';

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
      // The comment field must carry an accessible name (its visible label
      // is a separate Text, not associated) — a11y label association.
      expect(input.props.accessibilityLabel).toBeTruthy();
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

    it('question swap resets the draft — the old draft is never shown by, nor committed into, the new question (codex review critical)', () => {
      const qa = createChoiceQuestion('qa');
      qa.showCommentArea = true;
      qa.comment = 'alpha';
      const qb = createChoiceQuestion('qb');
      qb.showCommentArea = true;
      qb.comment = 'beta';
      const { rerender } = render(<QuestionChrome question={qa} />);
      // Uncommitted draft typed into A (default onBlur mode: model untouched)
      fireEvent.changeText(screen.getByTestId('qa-comment'), 'typed-into-a');
      rerender(<QuestionChrome question={qb} />);
      const input = screen.getByTestId('qb-comment');
      expect(input.props.value).toBe('beta');
      fireEvent(input, 'blur');
      expect(qb.comment).toBe('beta');
      expect(qa.comment).toBe('alpha');
    });

    it('commits on every keystroke when the survey textUpdateMode is "onTyping" (core onCommentInput / isInputTextUpdate path)', () => {
      const model = new Model({
        textUpdateMode: 'onTyping',
        elements: [{ type: 'checkbox', name: 'q-typing', choices: ['a'] }],
      });
      const question = model.getQuestionByName('q-typing') as Question;
      question.showCommentArea = true;
      expect(question.isInputTextUpdate).toBe(true);
      render(<QuestionChrome question={question} />);
      fireEvent.changeText(
        screen.getByTestId('q-typing-comment'),
        'live-typed'
      );
      expect(question.comment).toBe('live-typed');
    });
  });

  describe('titleLocation left (codex review major 3)', () => {
    it('lays the header and content out in a row when titleLocation is "left"', () => {
      const question = createQuestion('q-left');
      question.title = 'Left Title';
      question.titleLocation = 'left';
      render(
        <QuestionChrome question={question}>
          <Text>left child</Text>
        </QuestionChrome>
      );
      expect(question.hasTitleOnLeft).toBe(true);
      const row = screen.getByTestId('q-left-left-row');
      expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
      expect(screen.getByText('Left Title')).toBeTruthy();
      expect(screen.getByText('left child')).toBeTruthy();
    });

    it('non-left locations do not create the row wrapper', () => {
      const question = createQuestion('q-not-left');
      question.title = 'Top Title';
      render(
        <QuestionChrome question={question}>
          <Text>top child</Text>
        </QuestionChrome>
      );
      expect(screen.queryByTestId('q-not-left-left-row')).toBeNull();
    });
  });

  describe('error tones (codex review major 4; sd-error.scss:26-38)', () => {
    function toneRecipe() {
      return buildQuestionChromeRecipe(resolveTheme(undefined), {
        platform: { os: 'ios' },
      });
    }
    function addToneError(
      question: Question,
      text: string,
      tone?: 'warning' | 'info'
    ): void {
      const error = new SurveyError(text);
      if (tone) error.notificationType = tone;
      question.addError(error);
    }

    it('warning-only errors render the yellow warning tone (panel background + item color)', () => {
      const question = createQuestion('q-warn');
      question.title = 'Warn';
      addToneError(question, 'careful now', 'warning');
      expect(question.currentNotificationType).toBe('warning');
      render(<QuestionChrome question={question} />);
      const fragments = toneRecipe().fragments;
      const panel = StyleSheet.flatten(
        screen.getByTestId('q-warn-errors-above').props.style
      );
      expect(panel.backgroundColor).toBe(
        fragments.errorPanelWarning.backgroundColor
      );
      const item = StyleSheet.flatten(
        screen.getByText('careful now').props.style
      );
      expect(item.color).toBe(fragments.errorItemWarning.color);
      // and the warning tone is DISTINCT from the red error tone
      expect(panel.backgroundColor).not.toBe(
        fragments.errorPanel.backgroundColor
      );
    });

    it('info-only errors render the blue info tone', () => {
      const question = createQuestion('q-info');
      question.title = 'Info';
      addToneError(question, 'fyi note', 'info');
      expect(question.currentNotificationType).toBe('info');
      render(<QuestionChrome question={question} />);
      const fragments = toneRecipe().fragments;
      const panel = StyleSheet.flatten(
        screen.getByTestId('q-info-errors-above').props.style
      );
      expect(panel.backgroundColor).toBe(
        fragments.errorPanelInfo.backgroundColor
      );
      const item = StyleSheet.flatten(screen.getByText('fyi note').props.style);
      expect(item.color).toBe(fragments.errorItemInfo.color);
    });

    it('mixed severities render only the highest-severity type with its tone — upstream currentNotificationType policy (renderedErrors is filtered to one type by core)', () => {
      const question = createQuestion('q-mixed');
      question.title = 'Mixed';
      addToneError(question, 'careful now', 'warning');
      addToneError(question, 'hard failure');
      expect(question.currentNotificationType).toBe('error');
      render(<QuestionChrome question={question} />);
      expect(screen.getByText('hard failure')).toBeTruthy();
      expect(screen.queryByText('careful now')).toBeNull();
      const fragments = toneRecipe().fragments;
      const panel = StyleSheet.flatten(
        screen.getByTestId('q-mixed-errors-above').props.style
      );
      expect(panel.backgroundColor).toBe(fragments.errorPanel.backgroundColor);
    });
  });

  describe('description location styling (codex review minor 5; sd-description.scss:13-19)', () => {
    it('under-title description gets the header margin; under-input gets the padding-top — distinct fragments', () => {
      const q1 = createQuestion('q-desc-style-title');
      q1.title = 'Spacing Title';
      q1.description = 'under title text';
      const r1 = render(<QuestionChrome question={q1} />);
      const s1 = StyleSheet.flatten(
        r1.getByText('under title text').props.style
      );
      // .sd-element__header .sd-description margin-top:
      // 0.25 * --sd-base-vertical-padding (4*baseUnit regular tier) - 0.5*baseUnit = 0.5*baseUnit
      expect(s1.marginTop).toBe(4);
      expect(s1.paddingTop).toBeUndefined();
      r1.unmount();

      const q2 = createQuestion('q-desc-style-input');
      q2.title = 'Spacing Input';
      q2.description = 'under input text';
      q2.descriptionLocation = 'underInput';
      const r2 = render(<QuestionChrome question={q2} />);
      const s2 = StyleSheet.flatten(
        r2.getByText('under input text').props.style
      );
      // .sd-question__description--under-input padding-top:
      // 0.375 * --sd-base-vertical-padding = 1.5*baseUnit
      expect(s2.paddingTop).toBe(12);
      expect(s2.marginTop).toBeUndefined();
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
