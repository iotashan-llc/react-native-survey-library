/**
 * `UnsupportedQuestion` — non-throwing fallback for a dispatch-key miss
 * (design: docs/design/0.5-factories.md, "Unsupported fallback", test plan
 * #3). Dispatcher contract exercised directly here (not wrapped in a
 * dedicated dispatch function — that composition is M1 Survey-shell work,
 * see design "Non-goals"):
 *
 *   RNQuestionFactory.createQuestion(key, props) ?? createUnsupportedQuestion(props, missInfo)
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import '../../factories/register-all';
import {
  UnsupportedQuestion,
  createUnsupportedQuestion,
  setUnsupportedQuestionRenderer,
} from '../UnsupportedQuestion';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

function createQuestion(name: string, type = 'text'): Question {
  const model = new Model({ elements: [{ type, name }] });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return question;
}

function dispatch(
  dispatchKey: string,
  props: { question: Question; creator?: unknown }
): React.JSX.Element | null {
  return (
    RNQuestionFactory.createQuestion(dispatchKey, props) ??
    createUnsupportedQuestion(props, { dispatchKey })
  );
}

describe('UnsupportedQuestion', () => {
  afterEach(() => {
    setDiagnosticHandler(undefined);
    setUnsupportedQuestionRenderer(undefined);
  });

  it('a registered dispatchKey ("empty") resolves to the real component, never the fallback', () => {
    const question = createQuestion('q-empty', 'empty');
    const element = dispatch('empty', { question, creator: {} });
    expect(element).not.toBeNull();
    expect(element!.type).not.toBe(UnsupportedQuestion);
  });

  it('a missing dispatchKey renders UnsupportedQuestion, without throwing', () => {
    const question = createQuestion('q-miss');
    let element: React.JSX.Element | null = null;
    expect(() => {
      element = dispatch('sv-does-not-exist', { question, creator: {} });
    }).not.toThrow();
    expect(element).not.toBeNull();
    expect(element!.type).toBe(UnsupportedQuestion);
    expect(() => render(element!)).not.toThrow();
  });

  it('renders the question title/name and the "Unsupported question type: <type>" text', () => {
    const question = createQuestion('q-visible');
    question.title = 'My Visible Title';
    render(
      createUnsupportedQuestion(
        { question, creator: {} },
        { dispatchKey: 'sv-missing' }
      )
    );
    expect(screen.getByText('My Visible Title')).toBeTruthy();
    expect(screen.getByText('Unsupported question type: text')).toBeTruthy();
  });

  it('one supported sibling and one unsupported sibling both render side by side', () => {
    const supported = createQuestion('q-sib-empty', 'empty');
    const unsupported = createQuestion('q-sib-miss');

    function Siblings(): React.JSX.Element {
      return (
        <>
          {dispatch('empty', { question: supported, creator: {} })}
          {dispatch('sv-missing-sibling', {
            question: unsupported,
            creator: {},
          })}
        </>
      );
    }

    expect(() => render(<Siblings />)).not.toThrow();
    expect(screen.getByText('Unsupported question type: text')).toBeTruthy();
  });

  it('emits an "unsupported-question-type" diagnostic once per (question, dispatchKey) — StrictMode-safe', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    const question = createQuestion('q-diag');

    render(
      <React.StrictMode>
        {createUnsupportedQuestion(
          { question, creator: {} },
          { dispatchKey: 'sv-missing-diag' }
        )}
      </React.StrictMode>
    );

    const relevant = seen.filter((p) => p.code === 'unsupported-question-type');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      code: 'unsupported-question-type',
      questionType: 'text',
      dispatchKey: 'sv-missing-diag',
      name: 'q-diag',
    });
  });

  it('a second, different missed dispatchKey on the SAME question re-emits', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    const question = createQuestion('q-diag-2');

    const { rerender } = render(
      createUnsupportedQuestion(
        { question, creator: {} },
        { dispatchKey: 'sv-key-a' }
      )
    );
    rerender(
      createUnsupportedQuestion(
        { question, creator: {} },
        { dispatchKey: 'sv-key-b' }
      )
    );

    const keys = seen
      .filter((p) => p.code === 'unsupported-question-type')
      .map((p) => (p as { dispatchKey: string }).dispatchKey);
    expect(keys).toEqual(['sv-key-a', 'sv-key-b']);
  });

  it('a throwing diagnostic handler is contained: fallback still renders, error logged once', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      setDiagnosticHandler(() => {
        throw new Error('consumer handler boom');
      });
      const question = createQuestion('q-throwing-handler');
      expect(() =>
        render(
          createUnsupportedQuestion(
            { question, creator: {} },
            { dispatchKey: 'sv-throws' }
          )
        )
      ).not.toThrow();
      expect(screen.getByText('Unsupported question type: text')).toBeTruthy();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('setUnsupportedQuestionRenderer swaps the rendered component; undefined restores the default', () => {
    function CustomFallback(): React.JSX.Element {
      return <Text>custom fallback</Text>;
    }
    setUnsupportedQuestionRenderer(CustomFallback);
    const question = createQuestion('q-custom-renderer');
    render(
      createUnsupportedQuestion(
        { question, creator: {} },
        { dispatchKey: 'sv-custom' }
      )
    );
    expect(screen.getByText('custom fallback')).toBeTruthy();

    setUnsupportedQuestionRenderer(undefined);
    render(
      createUnsupportedQuestion(
        { question, creator: {} },
        { dispatchKey: 'sv-custom-2' }
      )
    );
    expect(screen.getByText('Unsupported question type: text')).toBeTruthy();
  });
});
