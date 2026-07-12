/**
 * Hybrid bridge tests (design: docs/design/0.7-theme-rn.md, "Hybrid bridge
 * (bridge.ts)"; test plan #2). Uses REAL survey-core models via the facade
 * — the bridge's whole point is interpreting the ACTUAL public-getter
 * output (`getItemClass`/`getControlClass`/`getRootCss`), including
 * consumer `survey.css` overrides and `onUpdateChoiceItemCss` host hooks.
 */
import {
  Model,
  SurveyError,
  QuestionButtonGroupModel,
  ButtonGroupItemModel,
} from '../../core/facade';
import type { Question } from '../../core/facade';
import {
  extractTokens,
  getItemVariant,
  getControlVariant,
  getRootVariant,
  getButtonGroupItemVariant,
  ITEM_REACHABILITY,
  CONTROL_REACHABILITY,
  BUTTONGROUP_REACHABILITY,
  queueUnknownTokens,
  flushUnknownTokenDiagnostics,
} from '../bridge';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

function createCheckbox(): { model: Model; question: Question } {
  const model = new Model({
    elements: [
      {
        type: 'checkbox',
        name: 'q1',
        choices: ['a', 'b', 'c'],
      },
    ],
  });
  const question = model.getQuestionByName('q1') as Question;
  return { model, question };
}

function createText(): { model: Model; question: Question } {
  const model = new Model({
    elements: [{ type: 'text', name: 'q1' }],
  });
  const question = model.getQuestionByName('q1') as Question;
  return { model, question };
}

describe('extractTokens — pure engine', () => {
  it('whitespace-tokenizes both sides; a compound entry matches only when ALL its tokens are present', () => {
    const schema = { disabled: ['sd-item--disabled sd-checkbox--disabled'] };
    expect(
      extractTokens('sd-item sd-item--disabled sd-checkbox--disabled', schema)
        .variant.disabled
    ).toBe(true);
    // Only ONE of the two compound tokens present -> no match.
    expect(
      extractTokens('sd-item sd-item--disabled', schema).variant.disabled
    ).toBe(false);
  });

  it('matches when ANY entry (live value OR canonical alias) fully matches — OR across entries', () => {
    const schema = {
      checked: ['sd-item--checked sd-radio--checked', 'sd-item--checked'],
    };
    expect(
      extractTokens('sd-item sd-item--checked', schema).variant.checked
    ).toBe(true);
  });

  it('unknownTokens excludes every token appearing in ANY schema entry, matched or not', () => {
    const schema = {
      checked: ['sd-item--checked'],
      disabled: ['sd-item--disabled sd-checkbox--disabled'],
    };
    const result = extractTokens(
      'sd-item sd-item--checked sd-item--disabled mystery-token',
      schema
    );
    // sd-item--disabled is KNOWN vocabulary (part of the disabled entry)
    // even though the compound entry as a whole didn't match (missing the
    // sd-checkbox--disabled half) -- only "sd-item" (base, not in any
    // entry) and "mystery-token" are truly unknown.
    expect(result.unknownTokens.sort()).toEqual(
      ['mystery-token', 'sd-item'].sort()
    );
    expect(result.variant.disabled).toBe(false);
  });

  it('dedupes unknownTokens', () => {
    const result = extractTokens('foo foo bar', {});
    expect(result.unknownTokens.sort()).toEqual(['bar', 'foo']);
  });

  it('undefined/empty class string -> every flag false, no unknown tokens', () => {
    const schema = { checked: ['sd-item--checked'] };
    expect(extractTokens(undefined, schema)).toEqual({
      variant: { checked: false },
      unknownTokens: [],
    });
    expect(extractTokens('', schema)).toEqual({
      variant: { checked: false },
      unknownTokens: [],
    });
  });
});

describe('getItemVariant — real checkbox question, live-model class strings', () => {
  it('base state: no flags on', () => {
    const { question } = createCheckbox();
    const item = question.visibleChoices[0];
    const classString = question.getItemClass(item);
    const { variant } = getItemVariant(question, classString);
    expect(variant.checked).toBe(false);
    expect(variant.readOnly).toBe(false);
    expect(variant.error).toBe(false);
  });

  it('checked state reflects live model selection', () => {
    const { question } = createCheckbox();
    const item = question.visibleChoices[0];
    question.value = [item.value];
    const classString = question.getItemClass(item);
    const { variant } = getItemVariant(question, classString);
    expect(variant.checked).toBe(true);
  });

  it('readOnly state reflects question.readOnly', () => {
    const { question } = createCheckbox();
    question.readOnly = true;
    const item = question.visibleChoices[0];
    const classString = question.getItemClass(item);
    const { variant } = getItemVariant(question, classString);
    expect(variant.readOnly).toBe(true);
  });

  it('per-getter reachability: disabled is UNREACHABLE for select items (dead upstream branch) even when readOnly', () => {
    expect(ITEM_REACHABILITY.disabled).toBe(false);
    const { question } = createCheckbox();
    question.readOnly = true;
    const item = question.visibleChoices[0];
    const classString = question.getItemClass(item);
    const { variant } = getItemVariant(question, classString);
    expect(variant.disabled).toBe(false);
  });

  it('warning-only question: item error variant OFF (hasCssError() excludes warnings)', () => {
    const { question } = createCheckbox();
    const warning = new SurveyError('a warning');
    warning.notificationType = 'warning';
    question.addError(warning);
    const item = question.visibleChoices[0];
    const classString = question.getItemClass(item);
    const { variant } = getItemVariant(question, classString);
    expect(variant.error).toBe(false);
  });
});

describe('known vocabulary — getter-emitted base/layout classes are NOT unknown (codex impl-review major 3)', () => {
  it('base checkbox item: ZERO unknown tokens (sd-item/sd-checkbox/sd-selectbase__item/sv-q-col-N are getter-emitted vocabulary)', () => {
    const { question } = createCheckbox();
    const item = question.visibleChoices[0];
    const classString = question.getItemClass(item);
    const result = getItemVariant(question, classString);
    expect(result.unknownTokens).toEqual([]);
  });

  it('single-column layout (colCount=1): the DYNAMIC string-built sv-q-col-N class is known vocabulary', () => {
    // getItemClassCore appends "sv-q-col-" + n when !hasColumns &&
    // colCount !== 0 — i.e. exactly the colCount=1 path (colCount>1 takes
    // the hasColumns branch and emits neither itemInline nor sv-q-col-N).
    const model = new Model({
      elements: [
        { type: 'checkbox', name: 'q1', choices: ['a', 'b'], colCount: 1 },
      ],
    });
    const question = model.getQuestionByName('q1') as Question;
    const item = question.visibleChoices[0];
    const classString = question.getItemClass(item);
    expect(classString).toContain('sv-q-col-1');
    expect(getItemVariant(question, classString).unknownTokens).toEqual([]);
  });

  it('inline layout (colCount=0): itemInline is known vocabulary', () => {
    const model = new Model({
      elements: [
        { type: 'checkbox', name: 'q1', choices: ['a', 'b'], colCount: 0 },
      ],
    });
    const question = model.getQuestionByName('q1') as Question;
    const item = question.visibleChoices[0];
    const classString = question.getItemClass(item);
    expect(getItemVariant(question, classString).unknownTokens).toEqual([]);
  });

  it('base text control: ZERO unknown tokens (cssClasses.root is getter-emitted vocabulary)', () => {
    const { question } = createText();
    const classString = question.getControlClass();
    expect(getControlVariant(question, classString).unknownTokens).toEqual([]);
  });

  it('plain question root: ZERO unknown tokens (mainRoot/withFrame/title-location/small etc. are getter-emitted vocabulary)', () => {
    const { question } = createText();
    const rootClassString = question.getRootCss();
    expect(rootClassString.length).toBeGreaterThan(0);
    expect(getRootVariant(question, rootClassString).unknownTokens).toEqual([]);
  });

  it('a genuinely foreign token is still reported unknown', () => {
    const { question } = createCheckbox();
    const item = question.visibleChoices[0];
    const classString = `${question.getItemClass(item)} my-host-custom-class`;
    expect(getItemVariant(question, classString).unknownTokens).toEqual([
      'my-host-custom-class',
    ]);
  });
});

describe('itemSelectAll — modeled variant flag (codex impl-review major 3)', () => {
  it('the select-all item flips variant.selectAll and leaves no unknown tokens', () => {
    const model = new Model({
      elements: [
        {
          type: 'checkbox',
          name: 'q1',
          choices: ['a', 'b'],
          showSelectAllItem: true,
        },
      ],
    });
    const question = model.getQuestionByName('q1') as Question;
    const selectAllItem = (question as unknown as { selectAllItem: unknown })
      .selectAllItem;
    const classString = question.getItemClass(selectAllItem);
    const result = getItemVariant(question, classString);
    expect(result.variant.selectAll).toBe(true);
    expect(result.unknownTokens).toEqual([]);
  });

  it('a regular item does NOT flip selectAll; reachability locks it reachable', () => {
    expect(ITEM_REACHABILITY.selectAll).toBe(true);
    const { question } = createCheckbox();
    const item = question.visibleChoices[0];
    const result = getItemVariant(question, question.getItemClass(item));
    expect(result.variant.selectAll).toBe(false);
  });
});

describe('ButtonGroup exemplar — disabled REACHABLE (design bridge point 5; codex impl-review major 3)', () => {
  function createButtonGroup(): { model: Model; question: Question } {
    const model = new Model({
      elements: [{ type: 'text', name: 'placeholder' }],
    });
    const question = new QuestionButtonGroupModel('bg1');
    (question as unknown as { choices: string[] }).choices = ['a', 'b'];
    model.pages[0]?.addQuestion(question as unknown as Question);
    return { model, question: question as unknown as Question };
  }

  it('BUTTONGROUP_REACHABILITY locks disabled REACHABLE (labelClass appends itemDisabled on isReadOnly || !item.isEnabled — question_buttongroup.ts:242)', () => {
    expect(BUTTONGROUP_REACHABILITY.disabled).toBe(true);
    expect(BUTTONGROUP_REACHABILITY.selected).toBe(true);
    expect(BUTTONGROUP_REACHABILITY.hover).toBe(true);
  });

  it('live: a readOnly buttongroup item emits the disabled class and the variant flips (no unknown tokens)', () => {
    const { question } = createButtonGroup();
    question.readOnly = true;
    const itemModel = new ButtonGroupItemModel(
      question as never,
      (question as unknown as { visibleChoices: never[] }).visibleChoices[0]!,
      0
    );
    const classString = (itemModel as unknown as { css: { label: string } }).css
      .label;
    const result = getButtonGroupItemVariant(question, classString);
    expect(result.variant.disabled).toBe(true);
    expect(result.unknownTokens).toEqual([]);
  });

  it('live: selecting an item flips selected; an enabled unselected item carries hover', () => {
    const { question } = createButtonGroup();
    const choices = (question as unknown as { visibleChoices: never[] })
      .visibleChoices;
    question.value = (choices[0] as unknown as { value: string }).value;
    const selectedModel = new ButtonGroupItemModel(
      question as never,
      choices[0]!,
      0
    );
    const unselectedModel = new ButtonGroupItemModel(
      question as never,
      choices[1]!,
      1
    );
    const selected = getButtonGroupItemVariant(
      question,
      (selectedModel as unknown as { css: { label: string } }).css.label
    );
    const unselected = getButtonGroupItemVariant(
      question,
      (unselectedModel as unknown as { css: { label: string } }).css.label
    );
    expect(selected.variant.selected).toBe(true);
    expect(selected.variant.disabled).toBe(false);
    expect(unselected.variant.selected).toBe(false);
    expect(unselected.variant.hover).toBe(true);
    expect(selected.unknownTokens).toEqual([]);
  });
});

describe('getRootVariant — warning-only question: root error variant ON (getRootCss uses hasCssError(true))', () => {
  it('root error is on for a warning even though item error stays off', () => {
    const { question } = createCheckbox();
    const warning = new SurveyError('a warning');
    warning.notificationType = 'warning';
    question.addError(warning);
    const rootClassString = question.getRootCss();
    const { variant } = getRootVariant(question, rootClassString);
    expect(variant.error).toBe(true);
  });
});

describe('entry-signature cache — mutation-safe (round-2 fix)', () => {
  it('identity-cached schema still matches after a survey.css override renames a class on the SAME cssClasses object', () => {
    const { model, question } = createCheckbox();
    const item = question.visibleChoices[0];

    // First pass: build + cache the schema from the live cssClasses.
    const before = question.getItemClass(item);
    expect(getItemVariant(question, before).variant.checked).toBe(false);

    // Consumer renames the checked class via survey.css (mutates the SAME
    // cssClasses object survey-core hands back for this question type).
    const css = model.css;
    css.checkbox = css.checkbox || {};
    css.checkbox.itemChecked = 'my-custom-checked-token';
    model.css = css;

    question.value = [item.value];
    const after = question.getItemClass(item);
    expect(after).toContain('my-custom-checked-token');
    const { variant } = getItemVariant(question, after);
    // The entry-signature cache must have detected the mutation and
    // rebuilt the schema against the NEW live token, not a stale cached
    // one keyed only by object identity.
    expect(variant.checked).toBe(true);
  });

  it('onUpdateChoiceItemCss host-appended CANONICAL token flips the variant even though the model says unchecked (live value never appears)', () => {
    const { model, question } = createCheckbox();
    const item = question.visibleChoices[0];

    // Model genuinely unchecked -- the live `cssClasses.itemChecked` class
    // therefore never appears in getItemClassCore's own output.
    const baseline = getItemVariant(question, question.getItemClass(item));
    expect(baseline.variant.checked).toBe(false);

    // Host unconditionally appends the STOCK canonical class name — a real
    // integration pattern `onUpdateChoiceItemCss` exists for (e.g. a host
    // tracking its OWN "highlighted" concept via the same token vocabulary
    // survey-core ships by default).
    model.onUpdateChoiceItemCss.add((_sender, options) => {
      options.css += ' sd-item--checked';
    });

    const classString = question.getItemClass(item);
    expect(classString).toContain('sd-item--checked');
    const { variant } = getItemVariant(question, classString);
    // Flipped purely by the canonical alias -- the model still says
    // unchecked (getItemClassCore's own itemChecked class was never
    // emitted); only the host-appended token drives this.
    expect(variant.checked).toBe(true);
  });
});

describe('getControlVariant — real text question', () => {
  it('per-getter reachability: disabled unreachable for text control (dead upstream branch)', () => {
    expect(CONTROL_REACHABILITY.disabled).toBe(false);
    const { question } = createText();
    question.readOnly = true;
    const classString = question.getControlClass();
    const { variant } = getControlVariant(question, classString);
    expect(variant.readOnly).toBe(true);
    expect(variant.disabled).toBe(false);
  });
});

describe('unknown-token queue — post-commit flush, dev-only, StrictMode-safe (deduped)', () => {
  const originalDev = (global as unknown as { __DEV__?: boolean }).__DEV__;
  beforeEach(() => {
    (global as unknown as { __DEV__?: boolean }).__DEV__ = true;
  });
  afterEach(() => {
    (global as unknown as { __DEV__?: boolean }).__DEV__ = originalDev;
    setDiagnosticHandler(undefined);
  });

  it('flushes each unknown token once even if queued twice (StrictMode double-invocation)', () => {
    const { question } = createCheckbox();
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));

    queueUnknownTokens(question, ['mystery-token']);
    queueUnknownTokens(question, ['mystery-token']); // StrictMode re-invocation
    flushUnknownTokenDiagnostics(question);
    flushUnknownTokenDiagnostics(question); // second commit pass, nothing new queued

    const unknownTokenPayloads = seen.filter(
      (p) => p.code === 'theme-rn-unknown-css-token'
    );
    expect(unknownTokenPayloads).toHaveLength(1);
  });

  it('a later, genuinely different unknown token still flushes (only the SAME token is deduped)', () => {
    const { question } = createCheckbox();
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));

    queueUnknownTokens(question, ['token-a']);
    flushUnknownTokenDiagnostics(question);
    queueUnknownTokens(question, ['token-b']);
    flushUnknownTokenDiagnostics(question);

    const unknownTokenPayloads = seen.filter(
      (p) => p.code === 'theme-rn-unknown-css-token'
    );
    expect(unknownTokenPayloads).toHaveLength(2);
  });
});
