/**
 * `singleinputsummary` (task 3.5) — the phase-3 tail type.
 *
 * PROBE FINDING (2026-07-21, node against the pinned survey-core):
 * `singleinputsummary` is NOT a serializer question class —
 * `Serializer.findClass('singleinputsummary')` is `undefined` and it is
 * absent from `Serializer.getChildrenClasses('question', true)`. It is the
 * plain helper `QuestionSingleInputSummary` (question, noEntry, items[],
 * isEmpty()), dispatched by survey-react-ui through `ReactElementFactory`
 * under the element key `sv-singleinput-summary` (its
 * `SurveyQuestionSigleInputSummary` receives a `summary` prop — it is not a
 * question renderer). So it is registered here as an ELEMENT-route row
 * (like `sv-list`), NOT a `MODEL_TYPE_CLASSIFICATION` entry.
 *
 * Its ONLY producer is the `questionsOnPageMode:"inputPerPage"` single-input
 * MODE (`QuestionSingleInputBehavior.createSingleInputSummary` /
 * `question.singleInputSummary`), a documented v0.3 NON-GOAL (design §11.5).
 * The key is therefore unreachable through normal v0.3 authoring; this
 * suite constructs `QuestionSingleInputSummary` directly (core populates
 * `items` externally by pushing `QuestionSingleInputSummaryItem`s — exactly
 * what the behavior does) and asserts the registration/dispatch path plus
 * the minimal render surface, rather than faking the deferred mode.
 */
import * as React from 'react';
import { act, render, screen } from '@testing-library/react-native';

import {
  LocalizableString,
  Model,
  QuestionSingleInputSummary,
  QuestionSingleInputSummaryItem,
} from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { RNElementFactory } from '../../factories/ElementFactory';
import { SingleInputSummary } from '../SingleInputSummaryQuestion';

function makeLoc(owner: Question, text: string): LocalizableString {
  const loc = new LocalizableString(owner, false);
  loc.text = text;
  return loc;
}

function makeItem(
  owner: Question,
  text: string
): QuestionSingleInputSummaryItem {
  // btnEdit/btnRemove are the single-input NAVIGATION affordances (the
  // deferred non-goal) — omitted here since the renderer never draws them.
  return new QuestionSingleInputSummaryItem(
    makeLoc(owner, text),
    undefined as never,
    undefined as never
  );
}

function makeSummary(noEntryText = 'No entries yet'): {
  summary: QuestionSingleInputSummary;
  question: Question;
} {
  const model = new Model({
    elements: [{ type: 'text', name: 'q1', title: 'Q1' }],
  });
  const question = model.getQuestionByName('q1') as Question;
  const summary = new QuestionSingleInputSummary(
    question,
    makeLoc(question, noEntryText)
  );
  return { summary, question };
}

describe('singleinputsummary — element registration & dispatch (task 3.5)', () => {
  it('registers under the sv-singleinput-summary element key and dispatches to SingleInputSummary (NOT the unsupported fallback)', () => {
    expect(RNElementFactory.isElementRegistered('sv-singleinput-summary')).toBe(
      true
    );
    const { summary } = makeSummary();
    const element = RNElementFactory.createElement('sv-singleinput-summary', {
      summary,
    });
    expect(element).not.toBeNull();
    expect((element as React.ReactElement).type).toBe(SingleInputSummary);
  });
});

describe('SingleInputSummary — render surface', () => {
  it('renders the noEntry string when the summary is empty', () => {
    const { summary } = makeSummary('Nothing entered');
    render(<SingleInputSummary summary={summary} />);
    expect(screen.getByTestId('sv-singleinput-summary-empty')).toBeTruthy();
    expect(screen.getByText('Nothing entered')).toBeTruthy();
    expect(screen.queryByTestId('sv-singleinput-summary')).toBeNull();
  });

  it('renders each summary item locText read-only when the summary has items', () => {
    const { summary, question } = makeSummary();
    summary.items.push(makeItem(question, 'Entry A'));
    summary.items.push(makeItem(question, 'Entry B'));
    render(<SingleInputSummary summary={summary} />);
    expect(screen.getByTestId('sv-singleinput-summary')).toBeTruthy();
    expect(screen.getByText('Entry A')).toBeTruthy();
    expect(screen.getByText('Entry B')).toBeTruthy();
    expect(screen.queryByTestId('sv-singleinput-summary-empty')).toBeNull();
  });

  it('renders null for a missing summary prop (canRender guard)', () => {
    const { toJSON } = render(
      <SingleInputSummary summary={undefined as never} />
    );
    expect(toJSON()).toBeNull();
  });
});

describe('SingleInputSummary — class-based reactivity (invariant 2)', () => {
  it('re-renders when its wrapped question notifies, reflecting the updated summary', () => {
    const { summary, question } = makeSummary('Empty');
    render(<SingleInputSummary summary={summary} />);
    expect(screen.getByText('Empty')).toBeTruthy();
    expect(screen.queryByTestId('sv-singleinput-summary')).toBeNull();

    // Mutate the summary in place, then fire a notification on the wrapped
    // question: SurveyElementBase's subscription to summary.question (a
    // Base) bumps revision → re-render reads the now-non-empty items.
    // `readOnly` is a plain (non-localizable) property, so it drives the
    // question's `onPropertyValueChanged` callback (localizable props like
    // `title` notify through the LocalizableString, not this callback).
    act(() => {
      summary.items.push(makeItem(question, 'Now present'));
      question.readOnly = true;
    });

    expect(screen.getByTestId('sv-singleinput-summary')).toBeTruthy();
    expect(screen.getByText('Now present')).toBeTruthy();
  });
});
