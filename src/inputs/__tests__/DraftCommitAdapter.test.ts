/**
 * Task 1.9 — text draft/commit adapter (A5). Design:
 * docs/design/1.9-draft-commit.md (state machine, verified upstream
 * semantics with file:line refs, test plan #1-#19 — this suite implements
 * that plan against a REAL survey-core `Model` via the facade; #15-#19
 * landed with review round 1).
 *
 * The headline contracts under test:
 * - onBlur (default): drafts accumulate locally; question.value and the
 *   survey's onValueChanged/expressions move only at commit time (blur or
 *   submit-intent).
 * - onTyping: every handleChangeText commits (core has NO debounce —
 *   verified question_text.ts:741-764; the only timer upstream is a
 *   web-only 1ms composition setTimeout).
 * - External model writes win ALWAYS — focused or not — mirroring web's
 *   SurveyQuestionUncontrolledElement.updateDomElement (reactquestion_
 *   element.tsx:299-309), which rewrites the DOM buffer with no focus
 *   check whenever model text stops loosely-equaling it
 *   (Helpers.isTwoValueEquals(model, control.value, false, true, false)).
 *   Self-echo (own commit) loosely-equals the draft, so typing is never
 *   clobbered by its own commit.
 */
import { Model } from '../../core/facade';
import type {
  QuestionCommentModel,
  QuestionTextModel,
} from '../../core/facade';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';
import { DraftCommitAdapter } from '../DraftCommitAdapter';

function textSurvey(
  surveyProps: Record<string, unknown> = {},
  questionProps: Record<string, unknown> = {}
): { model: Model; question: QuestionTextModel } {
  const model = new Model({
    ...surveyProps,
    elements: [{ type: 'text', name: 'q1', ...questionProps }],
  });
  const question = model.getQuestionByName('q1') as QuestionTextModel;
  return { model, question };
}

function commentSurvey(
  surveyProps: Record<string, unknown> = {},
  questionProps: Record<string, unknown> = {}
): { model: Model; question: QuestionCommentModel } {
  const model = new Model({
    ...surveyProps,
    elements: [{ type: 'comment', name: 'c1', ...questionProps }],
  });
  const question = model.getQuestionByName('c1') as QuestionCommentModel;
  return { model, question };
}

function countValueChanged(model: Model): { count: () => number } {
  let n = 0;
  model.onValueChanged.add(() => {
    n += 1;
  });
  return { count: () => n };
}

describe('DraftCommitAdapter — onBlur mode (survey default)', () => {
  it('test 1: keystrokes update the draft only; no commit, no onValueChanged', () => {
    const { model, question } = textSurvey();
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('h');
    adapter.handleChangeText('he');
    adapter.handleChangeText('hey');

    expect(adapter.renderedValue).toBe('hey');
    expect(question.value).toBeUndefined();
    expect(changed.count()).toBe(0);
    adapter.dispose();
  });

  it('test 2: blur commits exactly once', () => {
    const { model, question } = textSurvey();
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('hey');
    expect(adapter.isEditing).toBe(true);
    adapter.handleBlur();

    expect(adapter.isEditing).toBe(false);
    expect(question.value).toBe('hey');
    expect(changed.count()).toBe(1);
    adapter.dispose();
  });

  it('test 2b: blur on an armed empty visited field runs validation (isFocusEmpty path)', () => {
    const { question } = textSurvey(
      { checkErrorsMode: 'onValueChanged', validateVisitedEmptyFields: true },
      { isRequired: true }
    );
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleBlur();

    expect(question.errors.length).toBeGreaterThan(0);
    adapter.dispose();
  });

  it('test 3: submit-intent (Enter parity) commits without blur', () => {
    const { model, question } = textSurvey();
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('done');
    adapter.handleSubmitEditing();

    expect(question.value).toBe('done');
    expect(changed.count()).toBe(1);
    expect(adapter.isEditing).toBe(true);
    adapter.dispose();
  });

  it('test 10: expressions move at commit time, not draft time', () => {
    const model = new Model({
      elements: [
        { type: 'text', name: 'q1' },
        { type: 'text', name: 'q2', visibleIf: "{q1} = 'show'" },
      ],
    });
    const q1 = model.getQuestionByName('q1') as QuestionTextModel;
    const q2 = model.getQuestionByName('q2');
    const adapter = new DraftCommitAdapter({ question: q1 });

    adapter.handleFocus();
    adapter.handleChangeText('show');
    expect(q2.isVisible).toBe(false);

    adapter.handleBlur();
    expect(q2.isVisible).toBe(true);
    adapter.dispose();
  });
});

describe('DraftCommitAdapter — onTyping mode', () => {
  it('test 4: commits per keystroke; equal text does not re-commit', () => {
    const { model, question } = textSurvey({ textUpdateMode: 'onTyping' });
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('a');
    expect(question.value).toBe('a');
    adapter.handleChangeText('ab');
    expect(question.value).toBe('ab');
    adapter.handleChangeText('abc');
    expect(question.value).toBe('abc');
    expect(changed.count()).toBe(3);

    adapter.handleChangeText('abc');
    expect(changed.count()).toBe(3);
    adapter.dispose();
  });

  it('test 10b: expressions re-evaluate per keystroke', () => {
    const model = new Model({
      textUpdateMode: 'onTyping',
      elements: [
        { type: 'text', name: 'q1' },
        { type: 'text', name: 'q2', visibleIf: "{q1} = 'show'" },
      ],
    });
    const q1 = model.getQuestionByName('q1') as QuestionTextModel;
    const q2 = model.getQuestionByName('q2');
    const adapter = new DraftCommitAdapter({ question: q1 });

    adapter.handleFocus();
    adapter.handleChangeText('show');
    expect(q2.isVisible).toBe(true);
    adapter.dispose();
  });

  it('test 5: question-level textUpdateMode overrides the survey default (both directions)', () => {
    const onTypingQ = textSurvey({}, { textUpdateMode: 'onTyping' });
    const a1 = new DraftCommitAdapter({ question: onTypingQ.question });
    a1.handleFocus();
    a1.handleChangeText('x');
    expect(onTypingQ.question.value).toBe('x');
    a1.dispose();

    const onBlurQ = textSurvey(
      { textUpdateMode: 'onTyping' },
      { textUpdateMode: 'onBlur' }
    );
    const a2 = new DraftCommitAdapter({ question: onBlurQ.question });
    a2.handleFocus();
    a2.handleChangeText('x');
    expect(onBlurQ.question.value).toBeUndefined();
    a2.handleBlur();
    expect(onBlurQ.question.value).toBe('x');
    a2.dispose();
  });

  it('test 6: isTextValue gate — inputType email stays blur-commit under onTyping (question.isInputTextUpdate is the live source of truth)', () => {
    const { question } = textSurvey(
      { textUpdateMode: 'onTyping' },
      { inputType: 'email' }
    );
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('a@b.co');
    expect(question.value).toBeUndefined();
    adapter.handleBlur();
    expect(question.value).toBe('a@b.co');
    adapter.dispose();
  });

  it('test 9: self-echo keeps the draft; no spurious rendered-value churn', () => {
    const { question } = textSurvey({ textUpdateMode: 'onTyping' });
    const onRenderedValueChange = jest.fn();
    const adapter = new DraftCommitAdapter({ question, onRenderedValueChange });

    adapter.handleFocus();
    adapter.handleChangeText('abc');

    expect(adapter.renderedValue).toBe('abc');
    expect(onRenderedValueChange).toHaveBeenCalledTimes(1);
    adapter.dispose();
  });

  it('test 9b: a transformed commit (onValueChanging rewrite) DOES rewrite the draft — web updateDomElement mirror', () => {
    const { model, question } = textSurvey({ textUpdateMode: 'onTyping' });
    model.onValueChanging.add((_s, options) => {
      if (typeof options.value === 'string') {
        options.value = options.value.toUpperCase();
      }
    });
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('ab');

    expect(question.value).toBe('AB');
    expect(adapter.renderedValue).toBe('AB');
    adapter.dispose();
  });
});

describe('DraftCommitAdapter — external model changes', () => {
  it('test 7: external setValue while NOT editing syncs the draft and notifies', () => {
    const { model, question } = textSurvey();
    const onRenderedValueChange = jest.fn();
    const adapter = new DraftCommitAdapter({ question, onRenderedValueChange });

    model.setValue('q1', 'from outside');

    expect(adapter.renderedValue).toBe('from outside');
    expect(onRenderedValueChange).toHaveBeenCalled();
    adapter.dispose();
  });

  it('test 7b: external write through question.value syncs too', () => {
    const { question } = textSurvey();
    const adapter = new DraftCommitAdapter({ question });

    question.value = 'direct';

    expect(adapter.renderedValue).toBe('direct');
    adapter.dispose();
  });

  it('test 8: external write while EDITING (dirty draft) wins — verified web behavior', () => {
    const { model, question } = textSurvey();
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('typing in prog');
    model.setValue('q1', 'trigger overwrote');

    expect(adapter.renderedValue).toBe('trigger overwrote');
    expect(question.value).toBe('trigger overwrote');
    adapter.dispose();
  });

  it('test 14: empty external values render as ""; numeric model value loosely equals its string draft (no overwrite)', () => {
    const { model, question } = textSurvey(
      {},
      { inputType: 'number', textUpdateMode: 'onTyping' }
    );
    const adapter = new DraftCommitAdapter({ question });
    expect(adapter.renderedValue).toBe('');

    model.setValue('q1', 42);
    expect(adapter.renderedValue).toBe('42');

    adapter.handleFocus();
    adapter.handleChangeText('5');
    // Core may hold 5-as-string or number; either way the draft "5"
    // loosely equals it (Helpers numeric-string equality) and stays.
    expect(adapter.renderedValue).toBe('5');

    model.setValue('q1', undefined);
    expect(adapter.renderedValue).toBe('');
    adapter.dispose();
  });

  it('test 13: dispose unregisters — later external writes never touch the adapter', () => {
    const { model, question } = textSurvey();
    const onRenderedValueChange = jest.fn();
    const adapter = new DraftCommitAdapter({ question, onRenderedValueChange });

    adapter.dispose();
    model.setValue('q1', 'after dispose');

    expect(adapter.renderedValue).toBe('');
    expect(onRenderedValueChange).not.toHaveBeenCalled();
  });
});

describe('DraftCommitAdapter — comment kind (value path)', () => {
  it('test 11: commits via question.value; onBlur default; counter updates per keystroke', () => {
    const { model, question } = commentSurvey({}, { maxLength: 10 });
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('hi');
    expect(question.characterCounter.remainingCharacterCounter).toBe('2/10');
    expect(question.value).toBeUndefined();
    expect(changed.count()).toBe(0);

    adapter.handleBlur();
    expect(question.value).toBe('hi');
    expect(changed.count()).toBe(1);
    adapter.dispose();
  });

  it('test 11b: model-owned transforms apply at commit (acceptCarriageReturn: false strips newlines) and the draft follows', () => {
    const { question } = commentSurvey({}, { acceptCarriageReturn: false });
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('a\nb');
    adapter.handleBlur();

    expect(question.value).toBe('ab');
    expect(adapter.renderedValue).toBe('ab');
    adapter.dispose();
  });

  it('test 11c: onTyping commits every change for comment questions', () => {
    const { model, question } = commentSurvey({ textUpdateMode: 'onTyping' });
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('a');
    adapter.handleChangeText('ab');

    expect(question.value).toBe('ab');
    expect(changed.count()).toBe(2);
    adapter.dispose();
  });
});

describe('DraftCommitAdapter — masked text (core mask logic, no DOM adapter)', () => {
  it('test 12: commit runs through the inputValue mask pipeline: unmasked value stored, masked text rendered', () => {
    const { question } = textSurvey(
      {},
      { maskType: 'pattern', maskSettings: { pattern: '999-999' } }
    );
    const adapter = new DraftCommitAdapter({ question });
    // Masked questions render the empty mask, not "".
    expect(adapter.renderedValue).toBe(question.inputValue);

    // The draft for a masked question lives in MASKED space: on web the
    // InputElementAdapter formats the DOM buffer per keystroke, so the
    // text reaching updateValueOnEvent is always mask-shaped (raw
    // "123456" is a state web cannot produce — getUnmaskedValue("123456")
    // is "" for this pattern). Per-keystroke formatting is 1.10's
    // component concern (design doc "Model-side text read").
    adapter.handleFocus();
    adapter.handleChangeText('123-456');
    adapter.handleBlur();

    expect(question.value).toBe('123456');
    expect(adapter.renderedValue).toBe('123-456');
    adapter.dispose();
  });

  it('test 12b: external write renders masked', () => {
    const { model, question } = textSurvey(
      {},
      { maskType: 'pattern', maskSettings: { pattern: '999-999' } }
    );
    const adapter = new DraftCommitAdapter({ question });

    model.setValue('q1', '654321');

    expect(adapter.renderedValue).toBe('654-321');
    adapter.dispose();
  });
});

describe('DraftCommitAdapter — masked question under onTyping (forced blur-commit)', () => {
  const maskedOnTyping = () =>
    textSurvey(
      { textUpdateMode: 'onTyping' },
      { maskType: 'pattern', maskSettings: { pattern: '999-999' } }
    );

  it('test 15: incremental typing never live-commits and never reformats the draft mid-type; blur commits via the mask pipeline', () => {
    const { model, question } = maskedOnTyping();
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    for (const step of ['1', '12', '123', '123-4', '123-45', '123-456']) {
      adapter.handleChangeText(step);
      // No commit-echo bounces a reformatted mask into the draft mid-type.
      expect(adapter.renderedValue).toBe(step);
    }
    expect(question.value).toBeUndefined();
    expect(changed.count()).toBe(0);

    adapter.handleBlur();
    expect(question.value).toBe('123456');
    expect(adapter.renderedValue).toBe('123-456');
    expect(changed.count()).toBe(1);
    adapter.dispose();
  });

  it('test 15b: downgrade diagnostic emitted once per question through the seam; silent when onBlur was requested', () => {
    const events: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => {
      events.push(payload);
    });
    const downgrades = () =>
      events.filter((e) => e.code === 'masked-on-typing-downgraded');
    try {
      const { question } = maskedOnTyping();
      const adapter = new DraftCommitAdapter({ question });
      adapter.handleFocus();
      adapter.handleChangeText('1');
      adapter.handleChangeText('12');

      expect(downgrades()).toHaveLength(1);
      expect(downgrades()[0]).toMatchObject({
        name: 'q1',
        questionType: 'text',
        maskType: 'pattern',
      });

      // Once per QUESTION: a replacement adapter does not re-emit.
      adapter.dispose();
      const replacement = new DraftCommitAdapter({ question });
      replacement.handleFocus();
      replacement.handleChangeText('123');
      expect(downgrades()).toHaveLength(1);
      replacement.dispose();

      // Masked + onBlur requested: silent — the host gets exactly the
      // commit timing it asked for.
      const onBlurCase = textSurvey(
        {},
        { maskType: 'pattern', maskSettings: { pattern: '999-999' } }
      );
      const quiet = new DraftCommitAdapter({ question: onBlurCase.question });
      quiet.handleFocus();
      quiet.handleChangeText('9');
      expect(downgrades()).toHaveLength(1);
      quiet.dispose();
    } finally {
      setDiagnosticHandler(undefined);
    }
  });
});

describe('DraftCommitAdapter — textUpdateMode switched mid-edit (live isInputTextUpdate read)', () => {
  it('test 16: onBlur→onTyping while focused — the next keystroke commits', () => {
    const { model, question } = textSurvey();
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('dra');
    expect(changed.count()).toBe(0);

    model.textUpdateMode = 'onTyping';
    adapter.handleChangeText('draf');
    expect(question.value).toBe('draf');
    expect(changed.count()).toBe(1);
    adapter.dispose();
  });

  it('test 16b: onTyping→onBlur while focused — live commits stop; blur commits the final draft', () => {
    const { model, question } = textSurvey({ textUpdateMode: 'onTyping' });
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({ question });

    adapter.handleFocus();
    adapter.handleChangeText('a');
    expect(changed.count()).toBe(1);

    model.textUpdateMode = 'onBlur';
    adapter.handleChangeText('ab');
    expect(question.value).toBe('a');
    expect(changed.count()).toBe(1);

    adapter.handleBlur();
    expect(question.value).toBe('ab');
    expect(changed.count()).toBe(2);
    adapter.dispose();
  });
});

describe('DraftCommitAdapter — auto-advance (goNextPageAutomatic)', () => {
  function twoPageSurvey(mode: string): {
    model: Model;
    question: QuestionTextModel;
  } {
    const model = new Model({
      goNextPageAutomatic: true,
      textUpdateMode: mode,
      pages: [
        { elements: [{ type: 'text', name: 'q1' }] },
        { elements: [{ type: 'text', name: 'q2' }] },
      ],
    });
    return {
      model,
      question: model.getQuestionByName('q1') as QuestionTextModel,
    };
  }

  it('test 17: blur commit in onBlur mode advances the page (deferred by autoAdvanceDelay); onTyping commits never do (locNotification "text" + supportAutoAdvance gate)', () => {
    // Core schedules the advance via surveyTimerFunctions.safeTimeOut(
    // goNextPage, settings.autoAdvanceDelay) — 300ms by default
    // (survey.ts:7126-7135, surveytimer.ts:10-16).
    jest.useFakeTimers();
    try {
      const blurCase = twoPageSurvey('onBlur');
      const a1 = new DraftCommitAdapter({ question: blurCase.question });
      a1.handleFocus();
      a1.handleChangeText('answer');
      jest.runAllTimers();
      expect(blurCase.model.currentPageNo).toBe(0);
      a1.handleBlur();
      // Deferred, not synchronous — web parity.
      expect(blurCase.model.currentPageNo).toBe(0);
      jest.runAllTimers();
      expect(blurCase.model.currentPageNo).toBe(1);
      a1.dispose();

      const typingCase = twoPageSurvey('onTyping');
      const a2 = new DraftCommitAdapter({ question: typingCase.question });
      a2.handleFocus();
      a2.handleChangeText('answer');
      jest.runAllTimers();
      expect(typingCase.question.value).toBe('answer');
      expect(typingCase.model.currentPageNo).toBe(0);
      a2.handleBlur();
      jest.runAllTimers();
      // Web parity: an onTyping text question never auto-advances, even
      // at blur (supportAutoAdvance is false while isInputTextUpdate —
      // question_text.ts:622-624).
      expect(typingCase.model.currentPageNo).toBe(0);
      a2.dispose();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('DraftCommitAdapter — multiple adapters & replacement', () => {
  it('test 18: replacement — dispose old, create new: old inert, new subscribed', () => {
    const { model, question } = textSurvey();
    const oldNotify = jest.fn();
    const newNotify = jest.fn();
    const oldAdapter = new DraftCommitAdapter({
      question,
      onRenderedValueChange: oldNotify,
    });
    oldAdapter.dispose();
    const newAdapter = new DraftCommitAdapter({
      question,
      onRenderedValueChange: newNotify,
    });

    model.setValue('q1', 'next value');

    expect(newAdapter.renderedValue).toBe('next value');
    expect(newNotify).toHaveBeenCalled();
    expect(oldAdapter.renderedValue).toBe('');
    expect(oldNotify).not.toHaveBeenCalled();
    newAdapter.dispose();
  });

  it('test 19: two live adapters on one question coexist; disposing one leaves the other subscribed (instance-unique keys)', () => {
    const { model, question } = textSurvey();
    const a = new DraftCommitAdapter({ question });
    const b = new DraftCommitAdapter({ question });

    model.setValue('q1', 'first');
    expect(a.renderedValue).toBe('first');
    expect(b.renderedValue).toBe('first');

    a.dispose();
    model.setValue('q1', 'second');
    expect(a.renderedValue).toBe('first');
    expect(b.renderedValue).toBe('second');
    b.dispose();
  });
});

describe('DraftCommitAdapter — construction & kind detection', () => {
  it('initial draft mirrors the model text (text kind reads inputValue)', () => {
    const { question } = textSurvey({}, { defaultValue: 'seeded' });
    const adapter = new DraftCommitAdapter({ question });
    expect(adapter.renderedValue).toBe('seeded');
    adapter.dispose();
  });

  it('explicit kind override forces the value path', () => {
    const { question } = textSurvey();
    const adapter = new DraftCommitAdapter({ question, kind: 'value' });

    adapter.handleFocus();
    adapter.handleChangeText('via value');
    adapter.handleBlur();

    expect(question.value).toBe('via value');
    adapter.dispose();
  });
});

describe('DraftCommitAdapter — transformCommitText (pre-commit guard seam)', () => {
  // The component-level policy hook 1.10 uses for the date/time fallback
  // types: web's native inputs guarantee value-or-empty ("" on badInput),
  // and for `month` core's own correctValueType THROWS on unparseable
  // text — so invalid text must be transformed (or skipped) before it
  // reaches the model. The transform runs on every commit ATTEMPT (the
  // equality guard applies to its OUTPUT); the draft is never transformed.

  it('the transformed text commits; the draft keeps what was typed', () => {
    const { question } = textSurvey();
    const adapter = new DraftCommitAdapter({
      question,
      transformCommitText: (text, trigger) =>
        trigger === 'blur' ? text.toUpperCase() : text,
    });
    adapter.handleFocus();
    adapter.handleChangeText('abc');
    adapter.handleBlur();
    expect(question.value).toBe('ABC');
    adapter.dispose();
  });

  it('returning undefined skips the commit entirely (no write, no notification, draft intact)', () => {
    const { model, question } = textSurvey({ textUpdateMode: 'onTyping' });
    const changed = countValueChanged(model);
    const adapter = new DraftCommitAdapter({
      question,
      transformCommitText: (text) => (text === 'bad' ? undefined : text),
    });
    adapter.handleFocus();
    adapter.handleChangeText('ok');
    expect(question.value).toBe('ok');
    adapter.handleChangeText('bad');
    expect(question.value).toBe('ok'); // skipped
    expect(adapter.renderedValue).toBe('bad'); // draft untouched
    expect(changed.count()).toBe(1);
    adapter.dispose();
  });

  it('distinguishes typing / submit / blur triggers', () => {
    const { question } = textSurvey({ textUpdateMode: 'onTyping' });
    const seen: string[] = [];
    const adapter = new DraftCommitAdapter({
      question,
      transformCommitText: (text, trigger) => {
        seen.push(trigger);
        return text;
      },
    });
    adapter.handleFocus();
    adapter.handleChangeText('a'); // typing
    adapter.handleSubmitEditing(); // submit
    adapter.handleBlur(); // blur
    expect(seen).toEqual(['typing', 'submit', 'blur']);
    adapter.dispose();
  });

  it('no transform option: behavior unchanged', () => {
    const { question } = textSurvey();
    const adapter = new DraftCommitAdapter({ question });
    adapter.handleFocus();
    adapter.handleChangeText('plain');
    adapter.handleBlur();
    expect(question.value).toBe('plain');
    adapter.dispose();
  });
});
