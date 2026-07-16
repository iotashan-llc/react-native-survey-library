/**
 * Task 1.10 — the `text` question component. Design: docs/design/
 * 1.9-draft-commit.md (the DraftCommitAdapter this component wires) +
 * docs/design/1.2-lifecycle-bridge.md ("question.focusIn() ... the RN
 * bridge must call it on native focus" — called directly here, ahead of
 * the 1.2 registry landing on this branch) + docs/design/0.7-theme-rn.md /
 * 0.7-metrics-fixture.md (the `input` recipe consumed via
 * `selectInputStyles`).
 *
 * Mirrors the DraftCommitAdapter test suite's commit-semantics contracts
 * (onBlur default, onTyping, submit-intent, external writes) but exercised
 * through the real rendered `TextInput`, plus 1.10-owned concerns: the 13
 * `inputType` -> RN prop mapping, maxLength/placeholder/autocomplete wiring,
 * the character counter, and per-keystroke mask formatting + caret
 * restoration (the `InputElementAdapter` analog).
 */
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { QuestionTextModel } from '../../core/facade';
import { TextQuestion } from '../TextQuestion';
import { setDiagnosticHandler } from '../../diagnostics';

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

function renderQuestion(question: QuestionTextModel) {
  return render(<TextQuestion question={question} creator={{}} />);
}

function getInput() {
  return screen.getByTestId('q1-input');
}

function countValueChanged(model: Model): { count: () => number } {
  let n = 0;
  model.onValueChanged.add(() => {
    n += 1;
  });
  return { count: () => n };
}

afterEach(() => {
  setDiagnosticHandler(undefined);
});

describe('TextQuestion: basic rendering', () => {
  it('renders a TextInput bound to the question value', () => {
    const { question } = textSurvey({}, { defaultValue: 'hello' });
    renderQuestion(question);
    expect(getInput().props.value).toBe('hello');
  });

  it('empty/undefined model value renders as an empty string', () => {
    const { question } = textSurvey();
    renderQuestion(question);
    expect(getInput().props.value).toBe('');
  });

  it('renders nothing (canRender guard) when creator is missing', () => {
    const { question } = textSurvey();
    render(<TextQuestion question={question} />);
    expect(screen.queryByTestId('q1-input')).toBeNull();
  });
});

describe('TextQuestion: inputType -> RN props', () => {
  it('email: email keyboard + no autocapitalize', () => {
    const { question } = textSurvey({}, { inputType: 'email' });
    renderQuestion(question);
    expect(getInput().props.keyboardType).toBe('email-address');
    expect(getInput().props.autoCapitalize).toBe('none');
  });

  it('password: secureTextEntry', () => {
    const { question } = textSurvey({}, { inputType: 'password' });
    renderQuestion(question);
    expect(getInput().props.secureTextEntry).toBe(true);
  });

  it('number: numeric keyboard', () => {
    const { question } = textSurvey({}, { inputType: 'number' });
    renderQuestion(question);
    expect(getInput().props.keyboardType).toBe('numeric');
  });

  it.each([
    'date',
    'datetime-local',
    'time',
    'month',
    'week',
    'color',
    'range',
  ])(
    '%s: plain-text fallback (default keyboard, no secureTextEntry)',
    (inputType) => {
      const { question } = textSurvey({}, { inputType });
      renderQuestion(question);
      expect(getInput().props.secureTextEntry).toBeFalsy();
      expect(getInput().props.keyboardType).toBeUndefined();
    }
  );
});

describe('TextQuestion: model-driven props', () => {
  it('placeholder from renderedPlaceholder', () => {
    const { question } = textSurvey({}, { placeholder: 'Type here' });
    renderQuestion(question);
    expect(getInput().props.placeholder).toBe('Type here');
  });

  it('maxLength from getMaxLength(); unset when unlimited', () => {
    const { question } = textSurvey({}, { maxLength: 10 });
    renderQuestion(question);
    expect(getInput().props.maxLength).toBe(10);

    const { question: unlimited } = textSurvey();
    renderQuestion(unlimited);
    expect(screen.getByTestId('q1-input').props.maxLength).toBeUndefined();
  });

  it('autocomplete: a recognized token passes through to autoComplete', () => {
    const { question } = textSurvey({}, { autocomplete: 'email' });
    renderQuestion(question);
    expect(getInput().props.autoComplete).toBe('email');
  });

  it('readOnly question: not editable', () => {
    const { question } = textSurvey({}, { readOnly: true });
    renderQuestion(question);
    expect(getInput().props.editable).toBe(false);
  });

  it('a fresh (non-readOnly) question is editable', () => {
    const { question } = textSurvey();
    renderQuestion(question);
    expect(getInput().props.editable).toBe(true);
  });
});

describe('TextQuestion: character counter', () => {
  it('maxLength set: counter text renders and updates while typing', () => {
    const { question } = textSurvey({}, { maxLength: 20 });
    renderQuestion(question);
    fireEvent.changeText(getInput(), 'hi');
    expect(screen.getByText('2/20')).toBeTruthy();
  });

  it('no maxLength: no counter text', () => {
    const { question } = textSurvey();
    renderQuestion(question);
    fireEvent.changeText(getInput(), 'hi');
    expect(screen.queryByText(/\/\d/)).toBeNull();
  });
});

describe('TextQuestion: commit semantics (via the real adapter)', () => {
  it('onBlur (survey default): keystrokes stay local; blur commits once', () => {
    const { model, question } = textSurvey();
    const changed = countValueChanged(model);
    renderQuestion(question);

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'h');
    fireEvent.changeText(getInput(), 'he');
    fireEvent.changeText(getInput(), 'hey');
    expect(question.value).toBeUndefined();
    expect(changed.count()).toBe(0);

    fireEvent(getInput(), 'blur');
    expect(question.value).toBe('hey');
    expect(changed.count()).toBe(1);
  });

  it('onTyping (survey-level): every keystroke commits', () => {
    const { model, question } = textSurvey({ textUpdateMode: 'onTyping' });
    const changed = countValueChanged(model);
    renderQuestion(question);

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'a');
    expect(question.value).toBe('a');
    fireEvent.changeText(getInput(), 'ab');
    expect(question.value).toBe('ab');
    expect(changed.count()).toBe(2);
  });

  it('submitEditing (Enter parity) commits without blur, in onBlur mode', () => {
    const { question } = textSurvey();
    renderQuestion(question);

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'done');
    fireEvent(getInput(), 'submitEditing');
    expect(question.value).toBe('done');
  });

  it('external model write while focused replaces the draft', () => {
    const { question } = textSurvey();
    renderQuestion(question);

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'typing');
    act(() => {
      question.value = 'from elsewhere';
    });
    expect(getInput().props.value).toBe('from elsewhere');
  });
});

describe('TextQuestion: focus wiring (1.2 bridge contract)', () => {
  it('native focus calls question.focusIn() (fires onFocusInQuestion / sets lastActiveQuestion)', () => {
    const { model, question } = textSurvey();
    renderQuestion(question);
    let firedWith: unknown;
    (
      model as unknown as {
        onFocusInQuestion: {
          add: (f: (s: unknown, o: unknown) => void) => void;
        };
      }
    ).onFocusInQuestion.add((_s: unknown, options: unknown) => {
      firedWith = options;
    });

    fireEvent(getInput(), 'focus');
    expect(firedWith).toBeTruthy();
    expect(
      (model as unknown as { lastActiveQuestion?: unknown }).lastActiveQuestion
    ).toBe(question);
  });
});

describe('TextQuestion: masked typing (per-keystroke formatting + caret)', () => {
  function maskedSurvey(pattern: string) {
    return textSurvey({}, { maskType: 'pattern', maskSettings: { pattern } });
  }

  it('incremental typing formats the LIVE draft with the mask (not raw digits), but never commits per keystroke', () => {
    const { model, question } = maskedSurvey('999-999');
    const changed = countValueChanged(model);
    renderQuestion(question);

    fireEvent(getInput(), 'focus');
    // First keystroke: the native TextInput starts empty, user types "1".
    fireEvent.changeText(getInput(), '1');
    expect(getInput().props.value).toBe('1__-___');
    expect(question.value).toBeUndefined();

    // Second keystroke: the native buffer now shows the masked value from
    // the first edit (controlled `value` prop); typing "2" at the caret
    // (restored to right after "1" by the previous edit) inserts there.
    const caretAfterFirst = getInput().props.selection?.start ?? 1;
    const shownAfterFirst = getInput().props.value as string;
    const nextRaw =
      shownAfterFirst.slice(0, caretAfterFirst) +
      '2' +
      shownAfterFirst.slice(caretAfterFirst);
    fireEvent.changeText(getInput(), nextRaw);
    expect(getInput().props.value).toBe('12_-___');
    expect(question.value).toBeUndefined();
    expect(changed.count()).toBe(0);
  });

  it('blur commits the UNMASKED value through inputValue (a complete pattern); masked-on-typing-downgraded diagnostic fires only if onTyping was requested', () => {
    const seen: unknown[] = [];
    setDiagnosticHandler((p) => seen.push(p));
    const { question } = maskedSurvey('999-999');
    renderQuestion(question);

    fireEvent(getInput(), 'focus');
    // Single paste-like edit completing the whole pattern.
    fireEvent.changeText(getInput(), '123456');
    expect(getInput().props.value).toBe('123-456');
    expect(question.value).toBeUndefined();

    fireEvent(getInput(), 'blur');

    // getUnmaskedValue('123-456') === '123456' (verified against the real
    // core mask) — the committed VALUE is unmasked; renderedValue (the
    // TextInput's displayed text) stays masked.
    expect(question.value).toBe('123456');
    expect(getInput().props.value).toBe('123-456');
    expect(
      (seen as { code: string }[]).filter(
        (p) => p.code === 'masked-on-typing-downgraded'
      )
    ).toHaveLength(0);
  });

  it('an INCOMPLETE pattern commits empty (core: incomplete masked input unmasks to "") — never crashes', () => {
    const { question } = maskedSurvey('999-999');
    renderQuestion(question);

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '123');
    expect(getInput().props.value).toBe('123-___');
    fireEvent(getInput(), 'blur');

    expect(question.value).toBeUndefined();
  });

  it('masked + onTyping (question-level): the adapter downgrades to blur-commit and emits the diagnostic once', () => {
    const seen: unknown[] = [];
    setDiagnosticHandler((p) => seen.push(p));
    const { question } = textSurvey(
      {},
      {
        maskType: 'pattern',
        maskSettings: { pattern: '999-999' },
        textUpdateMode: 'onTyping',
      }
    );
    renderQuestion(question);

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '123456');
    // No live commit despite onTyping — masked stays blur-commit.
    expect(question.value).toBeUndefined();
    fireEvent(getInput(), 'blur');
    expect(question.value).toBe('123456');

    expect(
      (seen as { code: string }[]).filter(
        (p) => p.code === 'masked-on-typing-downgraded'
      )
    ).toHaveLength(1);
  });
});

describe('TextQuestion: masked maxLength (post-format cap at the native boundary)', () => {
  // Web parity: InputElementAdapter.setInputValue truncates the FORMATTED
  // value (mask/input_element_adapter.ts:8-12). RN's native `maxLength`
  // prop caps the RAW edit before `processInput` can restore literals and
  // placeholders past it — so masked questions drop the native prop and
  // apply the cap after formatting instead.
  function maskedMaxLenSurvey() {
    return textSurvey(
      {},
      {
        maskType: 'pattern',
        maskSettings: { pattern: '999-999' },
        maxLength: 5,
      }
    );
  }

  it('native maxLength prop is omitted for masked questions (the JS cap governs)', () => {
    const { question } = maskedMaxLenSurvey();
    renderQuestion(question);
    expect(getInput().props.maxLength).toBeUndefined();
  });

  it('unmasked questions keep the native maxLength prop', () => {
    const { question } = textSurvey({}, { maxLength: 5 });
    renderQuestion(question);
    expect(getInput().props.maxLength).toBe(5);
  });

  it('typing: the formatted draft is truncated to maxLength', () => {
    const { question } = maskedMaxLenSurvey();
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    // "1" formats to "1__-___" (7 chars) — capped to 5.
    fireEvent.changeText(getInput(), '1');
    expect(getInput().props.value).toBe('1__-_');
  });

  it('initial render: a default value whose masked display exceeds maxLength is capped', () => {
    // Upstream truncates in setInputValue during ADAPTER CONSTRUCTION
    // (input_element_adapter.ts:19-26), not only on edits.
    const { question } = textSurvey(
      {},
      {
        defaultValue: '123456',
        maskType: 'pattern',
        maskSettings: { pattern: '999-999' },
        maxLength: 5,
      }
    );
    renderQuestion(question);
    // "123456" formats to "123-456" (7 chars) — capped to 5 on init.
    expect(getInput().props.value).toBe('123-4');
  });

  it('external model write: the synced masked display is capped too', () => {
    const { question } = maskedMaxLenSurvey();
    renderQuestion(question);
    act(() => {
      question.value = '987654';
    });
    // "987654" formats to "987-654" (7 chars) — capped to 5 on sync.
    expect(getInput().props.value).toBe('987-6');
  });

  it('deletion: the reformatted draft stays capped', () => {
    const { question } = maskedMaxLenSurvey();
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '1');
    expect(getInput().props.value).toBe('1__-_');
    fireEvent(getInput(), 'selectionChange', {
      nativeEvent: { selection: { start: 1, end: 1 } },
    });
    // Backspace over the "1": raw text "__-_"; the mask reformats to the
    // empty masked value ("___-___", 7 chars) — capped again.
    fireEvent.changeText(getInput(), '__-_');
    expect(getInput().props.value).toBe('___-_');
  });
});

describe('TextQuestion: masked selection control is one-shot (IME safety)', () => {
  // RN has no composition events (`onTextInput` is gone from RN 0.86's
  // API), so the input must never stay permanently selection-controlled:
  // the caret is forced for exactly one frame after a reformat, then
  // released back to the native layer on the next selection event.
  it('a reformatting edit forces the caret once; the next native selection event releases control', () => {
    const { question } = textSurvey(
      {},
      { maskType: 'pattern', maskSettings: { pattern: '999-999' } }
    );
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '1'); // formats to "1__-___", caret 1
    expect(getInput().props.selection).toEqual({ start: 1, end: 1 });

    // Native applies the controlled selection and reports it back.
    fireEvent(getInput(), 'selectionChange', {
      nativeEvent: { selection: { start: 1, end: 1 } },
    });
    expect(getInput().props.selection).toBeUndefined();
  });

  it('an edit the mask accepts verbatim never forces the caret at all', () => {
    const { question } = textSurvey({}, { maskType: 'numeric' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '1'); // numeric mask: "1" -> "1"
    expect(getInput().props.value).toBe('1');
    expect(getInput().props.selection).toBeUndefined();
  });
});

describe('TextQuestion: date/time fallback validation (RN has no DOM badInput)', () => {
  // Web's native date/time inputs guarantee value-or-empty: unparseable
  // text reads as "" with validity.badInput set, and core surfaces
  // "Invalid input" from it (question_text.ts:457-459, 764-765). The RN
  // plain-text fallback reproduces that contract component-side: invalid
  // text commits as empty, and for core's isDateInputType set
  // (date/datetime-local) the error routes through core's own PUBLIC
  // onKeyUp -> dateValidationMessage seam. time/month/week have no such
  // core seam — discarded input emits a structured diagnostic instead
  // (documented divergence).

  it('date: unparseable text at blur -> empty value + core "Invalid input" error at validation', () => {
    const { model, question } = textSurvey({}, { inputType: 'date' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'not-a-date');
    fireEvent(getInput(), 'blur');

    expect(question.isEmpty()).toBe(true); // web parity: badInput reads as ""
    act(() => {
      model.validate();
    });
    expect(question.errors.map((e) => e.text)).toEqual([
      question.invalidInputErrorText,
    ]);
  });

  it('date: a valid date commits and validates clean', () => {
    const { model, question } = textSurvey({}, { inputType: 'date' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '2024-01-15');
    fireEvent(getInput(), 'blur');

    expect(question.value).toBe('2024-01-15');
    act(() => {
      model.validate();
    });
    expect(question.errors).toHaveLength(0);
  });

  it('date: garbage replacing a previously valid value clears it', () => {
    const { model, question } = textSurvey({}, { inputType: 'date' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '2024-01-15');
    fireEvent(getInput(), 'blur');
    expect(question.value).toBe('2024-01-15');

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'garbage');
    fireEvent(getInput(), 'blur');
    expect(question.isEmpty()).toBe(true);
    act(() => {
      model.validate();
    });
    expect(question.errors.map((e) => e.text)).toEqual([
      question.invalidInputErrorText,
    ]);
  });

  it('date: the error clears once valid text replaces the garbage', () => {
    const { model, question } = textSurvey({}, { inputType: 'date' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'garbage');
    fireEvent(getInput(), 'blur');
    act(() => {
      model.validate();
    });
    expect(question.errors).toHaveLength(1);

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '2024-01-15');
    fireEvent(getInput(), 'blur');
    act(() => {
      model.validate();
    });
    expect(question.errors).toHaveLength(0);
    expect(question.value).toBe('2024-01-15');
  });

  it('datetime-local: same seam; "T" and space separators both accepted', () => {
    const { model, question } = textSurvey({}, { inputType: 'datetime-local' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'next tuesday');
    fireEvent(getInput(), 'blur');
    expect(question.isEmpty()).toBe(true);
    act(() => {
      model.validate();
    });
    expect(question.errors.map((e) => e.text)).toEqual([
      question.invalidInputErrorText,
    ]);

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '2024-01-15 10:30');
    fireEvent(getInput(), 'blur');
    expect(question.value).toBe('2024-01-15 10:30');
    act(() => {
      model.validate();
    });
    expect(question.errors).toHaveLength(0);
  });

  it('month: unparseable text must NOT commit (core correctValueType would throw "Invalid time value")', () => {
    const { question } = textSurvey({}, { inputType: 'month' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'garbage');
    expect(() => fireEvent(getInput(), 'blur')).not.toThrow();
    expect(question.isEmpty()).toBe(true);
  });

  it('month: a valid month commits through core (which normalizes it)', () => {
    const { question } = textSurvey({}, { inputType: 'month' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '2024-03');
    fireEvent(getInput(), 'blur');
    expect(question.value).toBe('2024-03');
  });

  it('time/month/week: a discarded invalid commit emits the structured diagnostic once per question (no core error surface)', () => {
    const seen: { code: string; inputType?: string; name?: string }[] = [];
    setDiagnosticHandler((p) => seen.push(p as (typeof seen)[number]));
    const { model, question } = textSurvey({}, { inputType: 'time' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'noon');
    fireEvent(getInput(), 'blur');

    expect(question.isEmpty()).toBe(true);
    act(() => {
      model.validate();
    });
    expect(question.errors).toHaveLength(0); // documented divergence

    const diags = seen.filter(
      (p) => p.code === 'datetime-fallback-invalid-discarded'
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ inputType: 'time', name: 'q1' });

    // Once per question: a second discarded commit does not re-emit.
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'midnight');
    fireEvent(getInput(), 'blur');
    expect(
      seen.filter((p) => p.code === 'datetime-fallback-invalid-discarded')
    ).toHaveLength(1);
  });

  it('week: a valid ISO week commits; garbage discards', () => {
    const { question } = textSurvey({}, { inputType: 'week' });
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '2024-W29');
    fireEvent(getInput(), 'blur');
    expect(question.value).toBe('2024-W29');

    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), 'week nine');
    fireEvent(getInput(), 'blur');
    expect(question.isEmpty()).toBe(true);
  });

  it('onTyping datetime-local: partial text never commits mid-typing (and never wipes the draft); the completed string commits live', () => {
    const { question } = textSurvey(
      { textUpdateMode: 'onTyping' },
      { inputType: 'datetime-local' }
    );
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '2024-01-15T10:3'); // partial: invalid
    expect(question.isEmpty()).toBe(true); // commit skipped, not ""-committed
    expect(getInput().props.value).toBe('2024-01-15T10:3'); // draft intact

    fireEvent.changeText(getInput(), '2024-01-15T10:30');
    expect(question.value).toBe('2024-01-15T10:30'); // committed live
  });

  it('a masked question with a date-ish inputType is exempt (the mask owns the text shape)', () => {
    const { question } = textSurvey(
      {},
      {
        inputType: 'date',
        maskType: 'pattern',
        maskSettings: { pattern: '99/99' },
      }
    );
    renderQuestion(question);
    fireEvent(getInput(), 'focus');
    fireEvent.changeText(getInput(), '12/34');
    fireEvent(getInput(), 'blur');
    // "12/34" is not a valid HTML date string, but the mask pipeline owns
    // the value here — nothing gets discarded.
    expect(question.isEmpty()).toBe(false);
  });
});

describe('TextQuestion: question swap', () => {
  it('swapping the question prop disposes the old adapter and binds a fresh one to the new question', () => {
    const { question: q1 } = textSurvey({}, { name: 'q1' });
    const model2 = new Model({ elements: [{ type: 'text', name: 'q2' }] });
    const q2 = model2.getQuestionByName('q2') as QuestionTextModel;
    q2.value = 'q2-value';

    const { rerender } = render(<TextQuestion question={q1} creator={{}} />);
    rerender(<TextQuestion question={q2} creator={{}} />);

    expect(screen.getByTestId('q2-input').props.value).toBe('q2-value');
  });
});
