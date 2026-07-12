/**
 * Shared diagnostic seam (design: docs/design/0.5-factories.md,
 * "Diagnostics"). Consumed by both `UnsupportedQuestion` (once per
 * (question, dispatchKey)) and `QuestionElementBase`'s ignored-customWidget
 * check (once per question) — same handler registration, same
 * try/catch containment.
 */
import { Model } from '../core/facade';
import type { Question } from '../core/facade';
import {
  reportDiagnostic,
  reportUnsupportedQuestionTypeOnce,
  reportCustomWidgetIgnoredOnce,
  setDiagnosticHandler,
} from '../diagnostics';
import type { DiagnosticPayload } from '../diagnostics';

function createQuestion(name: string): Question {
  const model = new Model({ elements: [{ type: 'text', name }] });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return question;
}

describe('diagnostics', () => {
  afterEach(() => {
    setDiagnosticHandler(undefined);
  });

  it('default handler logs via console.warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      reportDiagnostic({
        code: 'unsupported-question-type',
        questionType: 'bogus',
        dispatchKey: 'bogus',
        template: 'bogus',
        componentName: 'default',
        name: 'q1',
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('default handler is silent in production (__DEV__ === false) — review #12', () => {
    const globalWithDev = globalThis as typeof globalThis & {
      __DEV__: boolean;
    };
    const previousDev = globalWithDev.__DEV__;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      globalWithDev.__DEV__ = false;
      reportDiagnostic({
        code: 'unsupported-question-type',
        questionType: 'bogus',
        dispatchKey: 'bogus',
        template: 'bogus',
        componentName: 'default',
        name: 'q1',
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      globalWithDev.__DEV__ = previousDev;
      warnSpy.mockRestore();
    }
  });

  it('setDiagnosticHandler swaps the handler; passing undefined restores the default', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));

    reportDiagnostic({
      code: 'custom-widget-ignored',
      questionType: 'text',
      name: 'q1',
      widgetName: 'my-widget',
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      code: 'custom-widget-ignored',
      questionType: 'text',
      name: 'q1',
      widgetName: 'my-widget',
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      setDiagnosticHandler(undefined);
      reportDiagnostic({
        code: 'custom-widget-ignored',
        questionType: 'text',
        name: 'q2',
        widgetName: undefined,
      });
      expect(seen).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('a throwing handler is contained: logged once via console.error, never escapes reportDiagnostic', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      setDiagnosticHandler(() => {
        throw new Error('handler boom');
      });
      expect(() =>
        reportDiagnostic({
          code: 'unsupported-question-type',
          questionType: 'bogus',
          dispatchKey: 'bogus',
          template: 'bogus',
          componentName: 'default',
          name: 'q1',
        })
      ).not.toThrow();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('reportUnsupportedQuestionTypeOnce emits once per (question, dispatchKey); a different key on the same question re-emits', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    const question = createQuestion('q-unsupported');

    reportUnsupportedQuestionTypeOnce(question, {
      code: 'unsupported-question-type',
      questionType: 'text',
      dispatchKey: 'sv-text-fancy',
      template: 'text',
      componentName: 'sv-text-fancy',
      name: question.name,
    });
    reportUnsupportedQuestionTypeOnce(question, {
      code: 'unsupported-question-type',
      questionType: 'text',
      dispatchKey: 'sv-text-fancy',
      template: 'text',
      componentName: 'sv-text-fancy',
      name: question.name,
    });
    expect(seen).toHaveLength(1);

    reportUnsupportedQuestionTypeOnce(question, {
      code: 'unsupported-question-type',
      questionType: 'text',
      dispatchKey: 'sv-text-other',
      template: 'text',
      componentName: 'sv-text-other',
      name: question.name,
    });
    expect(seen).toHaveLength(2);
    expect(seen.map((p) => (p as { dispatchKey: string }).dispatchKey)).toEqual(
      ['sv-text-fancy', 'sv-text-other']
    );
  });

  it('reportUnsupportedQuestionTypeOnce tracks different questions independently', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    const questionA = createQuestion('q-a');
    const questionB = createQuestion('q-b');

    reportUnsupportedQuestionTypeOnce(questionA, {
      code: 'unsupported-question-type',
      questionType: 'text',
      dispatchKey: 'k',
      template: 'text',
      componentName: 'k',
      name: questionA.name,
    });
    reportUnsupportedQuestionTypeOnce(questionB, {
      code: 'unsupported-question-type',
      questionType: 'text',
      dispatchKey: 'k',
      template: 'text',
      componentName: 'k',
      name: questionB.name,
    });
    expect(seen).toHaveLength(2);
  });

  it('reportCustomWidgetIgnoredOnce emits exactly once per question, regardless of key', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    const question = createQuestion('q-widget');

    reportCustomWidgetIgnoredOnce(question, {
      code: 'custom-widget-ignored',
      questionType: 'text',
      name: question.name,
      widgetName: 'w1',
    });
    reportCustomWidgetIgnoredOnce(question, {
      code: 'custom-widget-ignored',
      questionType: 'text',
      name: question.name,
      widgetName: 'w1',
    });
    expect(seen).toHaveLength(1);
  });
});
