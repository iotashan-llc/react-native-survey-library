/**
 * `HtmlQuestion` — the `html` question type (v0.2.1 pull-forward from M5).
 * RN analog of survey-react-ui's `SurveyQuestionHtml`
 * (reactquestion_html.tsx): a value-less display question
 * (`QuestionHtmlModel extends QuestionNonValue`) whose `html` property
 * carries author markup. Upstream renders `locHtml.renderedHtml` via
 * `dangerouslySetInnerHTML`; this library renders the SAME processed string
 * through `<SanitizedHtml>` (task 0.9) — allowlisted tags, URI/scheme
 * policy, no auto-navigation (invariant 8).
 *
 * Reactivity: setting `html` fires the model's `onPropertyChanged`
 * EventBase but NOT `addOnPropertyValueChangedCallback` (the API
 * `SurveyElementBase` subscribes through — localizable-string writes route
 * around it), so this component owns a direct `locHtml.onStringChanged`
 * subscription, mirroring upstream's `locHtml.onChanged` install and
 * `SurveyLocStringViewer`'s pattern.
 */
import { act, render, screen } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { QuestionHtmlModel } from '../../core/facade';
import { HtmlQuestion } from '../HtmlQuestion';

function createHtmlQuestion(
  name: string,
  html: string
): { model: Model; question: QuestionHtmlModel } {
  const model = new Model({ elements: [{ type: 'html', name, html }] });
  const question = model.getQuestionByName(name) as QuestionHtmlModel | null;
  if (!question) throw new Error('fixture question missing');
  return { model, question };
}

describe('HtmlQuestion', () => {
  it('renders the sanitized html content (allowlisted text visible; script/style stripped; no crash)', () => {
    const { question } = createHtmlQuestion(
      'q1',
      '<p>VisibleBody</p><script>badScript()</script><style>.z{color:red}</style>'
    );
    render(<HtmlQuestion question={question} creator={{}} />);
    expect(screen.getByText('VisibleBody')).toBeTruthy();
    // Sanitizer policy: script/style content never reaches the rendered
    // tree as text (and is never executed).
    expect(screen.queryByText(/badScript/)).toBeNull();
    expect(screen.queryByText(/color:red/)).toBeNull();
  });

  it('renders nested allowlisted formatting tags', () => {
    const { question } = createHtmlQuestion(
      'q2',
      '<p>Intro <strong>Bold</strong></p>'
    );
    render(<HtmlQuestion question={question} creator={{}} />);
    expect(screen.getByText('Bold')).toBeTruthy();
  });

  it('re-renders when the html content changes (locHtml.onStringChanged subscription)', () => {
    const { question } = createHtmlQuestion('q3', '<p>FirstContent</p>');
    render(<HtmlQuestion question={question} creator={{}} />);
    expect(screen.getByText('FirstContent')).toBeTruthy();

    act(() => {
      question.html = '<p>SecondContent</p>';
    });
    expect(screen.queryByText('FirstContent')).toBeNull();
    expect(screen.getByText('SecondContent')).toBeTruthy();
  });

  it('does not render at all when canRender() is false (no creator)', () => {
    const { question } = createHtmlQuestion('q4', '<p>x</p>');
    const { toJSON } = render(
      <HtmlQuestion question={question} creator={undefined} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders nothing for an empty-html question (upstream canRender guard: !!question.html)', () => {
    const { question } = createHtmlQuestion('q5', '');
    const { toJSON } = render(
      <HtmlQuestion question={question} creator={{}} />
    );
    expect(toJSON()).toBeNull();
  });
});
