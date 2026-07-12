/**
 * `EmptyQuestion` — RN analog of survey-react-ui's `SurveyQuestionEmpty`
 * (reactquestion_empty.tsx), which renders `<div />` (empty but present,
 * not "nothing"). Design: docs/design/0.5-factories.md, test plan #4 — the
 * `empty` dispatch key must resolve to this component, not the
 * unsupported-type fallback.
 */
import { render, screen } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import { EmptyQuestion } from '../EmptyQuestion';

function createQuestion(name: string): Question {
  const model = new Model({ elements: [{ type: 'empty', name }] });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return question;
}

describe('EmptyQuestion', () => {
  it('renders (an empty View) without throwing, given a real "empty" question', () => {
    const question = createQuestion('q-empty');
    expect(() =>
      render(<EmptyQuestion question={question} creator={{}} />)
    ).not.toThrow();
  });

  it("renders nothing queryable by text (documented RN delta vs upstream's <div/>)", () => {
    const question = createQuestion('q-empty-2');
    render(<EmptyQuestion question={question} creator={{}} />);
    expect(screen.queryByText(/./)).toBeNull();
  });

  it('does not render at all when canRender() is false (no creator)', () => {
    const question = createQuestion('q-empty-3');
    const { toJSON } = render(
      <EmptyQuestion question={question} creator={undefined} />
    );
    expect(toJSON()).toBeNull();
  });
});
