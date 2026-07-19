/**
 * `buttongroup` question (task 2.9) — RN port of survey-react-ui's
 * `SurveyQuestionButtonGroup` (reactquestion_buttongroup.tsx), built on
 * core's own per-item `ButtonGroupItemModel` view-model (value/caption/
 * icon/selected/readOnly/onChange → selectItem — invariant 6: consumed,
 * never re-derived).
 */
import { Modal, StyleSheet } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { Model, RendererFactory } from '../../core/facade';
import type { Question } from '../../core/facade';
import * as popupBridge from '../../overlay/popup-bridge';
import '../../factories/register-all';
import {
  ButtonGroupQuestion,
  ButtonGroupQuestionElement,
} from '../ButtonGroupQuestion';
import { Survey } from '../../survey/Survey';
import { OverlayContext } from '../../overlay/OverlayContext';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';
import { DESCRIPTOR_TABLE } from '../../factories/descriptors';
import type { SupportedDescriptor } from '../../factories/descriptors';
import { resolveQuestionDispatchKey } from '../../factories/dispatch-key';

function createButtonGroup(
  extra: Record<string, unknown> = {},
  name = 'bg'
): Question {
  const model = new Model({
    elements: [
      {
        type: 'buttongroup',
        name,
        choices: ['alpha', 'beta', 'gamma'],
        ...extra,
      },
    ],
  });
  return model.getQuestionByName(name)!;
}

describe('ButtonGroupQuestion — rendering + selection', () => {
  it('renders one pressable per visible choice with its caption', () => {
    const question = createButtonGroup();
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    for (const caption of ['alpha', 'beta', 'gamma']) {
      expect(screen.getByText(caption)).toBeTruthy();
    }
    expect(screen.getByTestId('sv-buttongroup-item-bg-0')).toBeTruthy();
    expect(screen.getByTestId('sv-buttongroup-item-bg-2')).toBeTruthy();
  });

  it('press selects through core selectItem (single select, exclusivity)', () => {
    const question = createButtonGroup();
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-1'));
    expect(question.value).toBe('beta');
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-2'));
    expect(question.value).toBe('gamma');
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-1').props.accessibilityState
        ?.checked
    ).toBe(false);
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-2').props.accessibilityState
        ?.checked
    ).toBe(true);
  });

  it('re-renders reactively on an external value write', () => {
    const question = createButtonGroup();
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    act(() => {
      question.value = 'alpha';
    });
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-0').props.accessibilityState
        ?.checked
    ).toBe(true);
  });

  it('read-only blocks presses (isInputReadOnly consumed, not re-derived)', () => {
    const question = createButtonGroup({ readOnly: true });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-0'));
    expect(question.value).toBeUndefined();
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-0').props.accessibilityState
        ?.disabled
    ).toBe(true);
  });

  it('a disabled ITEM blocks its press while siblings stay live (enableIf on the item)', () => {
    const question = createButtonGroup({
      choices: ['alpha', { value: 'beta', enableIf: 'false' }, 'gamma'],
    });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-1'));
    expect(question.value).toBeUndefined();
    fireEvent.press(screen.getByTestId('sv-buttongroup-item-bg-2'));
    expect(question.value).toBe('gamma');
  });
});

describe('ButtonGroupQuestion — icons + captions', () => {
  it('renders the item icon through RNIcon when iconName is set', () => {
    const question = createButtonGroup({
      choices: [{ value: 'a', iconName: 'icon-search', showCaption: false }],
    });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    expect(screen.getByTestId('sv-buttongroup-item-bg-0')).toBeTruthy();
    // showCaption false hides the caption text.
    expect(screen.queryByText('a')).toBeNull();
  });
});

describe('ButtonGroupQuestion — group accessibility (1.16 pattern)', () => {
  it('container exposes radiogroup semantics with the question label; items are radios', () => {
    const question = createButtonGroup({ title: 'Pick one' });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    const row = screen.getByTestId('sv-buttongroup-bg');
    expect(row.props.accessibilityRole).toBe('radiogroup');
    expect(row.props.accessibilityLabel).toBe('Pick one');
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-0').props.accessibilityRole
    ).toBe('radio');
  });
});

describe('ButtonGroupQuestion — review round 1 regressions', () => {
  it('an unselected item flipping enabled via choicesEnableIf re-renders (item-level subscription)', () => {
    const model = new Model({
      elements: [
        {
          type: 'buttongroup',
          name: 'bg',
          choices: ['alpha', 'beta'],
          choicesEnableIf: "{gate} = 'open' or {item} = 'alpha'",
        },
        { type: 'text', name: 'gate' },
      ],
    });
    const question = model.getQuestionByName('bg')!;
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-1').props.accessibilityState
        ?.disabled
    ).toBe(true);
    act(() => {
      model.setValue('gate', 'open');
    });
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-1').props.accessibilityState
        ?.disabled
    ).toBe(false);
  });

  it('an icon-only item still carries an accessible name from its caption', () => {
    const question = createButtonGroup({
      choices: [
        {
          value: 'a',
          text: 'Alpha',
          iconName: 'icon-search',
          showCaption: false,
        },
      ],
    });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    expect(
      screen.getByTestId('sv-buttongroup-item-bg-0').props.accessibilityLabel
    ).toBe('Alpha');
  });

  it('items live inside a horizontal scroll container (web overflow-x parity)', () => {
    const question = createButtonGroup();
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    const scroll = screen.getByTestId('sv-buttongroup-scroll-bg');
    expect(scroll.props.horizontal).toBe(true);
  });

  it('the selected item icon takes the primary fill; disabled takes foreground', () => {
    const question = createButtonGroup({
      choices: [
        { value: 'a', iconName: 'icon-search' },
        { value: 'b', iconName: 'icon-search', enableIf: 'false' },
      ],
      defaultValue: 'a',
    });
    render(<ButtonGroupQuestion question={question} creator={{}} />);
    const { buildButtonGroupRecipe } = jest.requireActual<
      typeof import('../../theme-rn/recipes/buttonGroup')
    >('../../theme-rn/recipes/buttonGroup');
    const { resolveTheme } = jest.requireActual<
      typeof import('../../theme-core/resolve')
    >('../../theme-core/resolve');
    const { resolveColorVar } = jest.requireActual<
      typeof import('../../theme-rn/recipes/tokenLookup')
    >('../../theme-rn/recipes/tokenLookup');
    const resolved = resolveTheme(undefined);
    const recipe = buildButtonGroupRecipe(resolved);
    const primary = resolveColorVar(resolved, '--sjs-primary-backcolor').css;
    const foreground = resolveColorVar(resolved, '--sjs-general-forecolor').css;
    const foregroundLight = resolveColorVar(
      resolved,
      '--sjs-general-forecolor-light'
    ).css;
    // Exact token mapping incl. disabled+selected precedence (disabled wins).
    expect(recipe.iconFill({ selected: false, disabled: false })).toBe(
      foregroundLight
    );
    expect(recipe.iconFill({ selected: true, disabled: false })).toBe(primary);
    expect(recipe.iconFill({ selected: false, disabled: true })).toBe(
      foreground
    );
    expect(recipe.iconFill({ selected: true, disabled: true })).toBe(
      foreground
    );
    // The rendered icons received exactly those fills.
    const { RNIcon: IconComponent } = jest.requireActual<
      typeof import('../../components/RNIcon')
    >('../../components/RNIcon');
    const icons = screen.UNSAFE_getAllByType(
      IconComponent as never
    ) as unknown as Array<{ props: { fill?: string } }>;
    expect(icons.map((icon) => icon.props.fill)).toEqual([primary, foreground]);
  });
});

// ————— Task 2.5b — overflow-to-dropdown via core processResponsiveness —————

interface ResponsiveButtonGroup {
  renderAs: string;
  processResponsiveness(requiredWidth: number, availableWidth: number): boolean;
  isDefaultRendering(): boolean;
  readOnlyText: string;
  choices: unknown[];
  /** The NON-CREATING backing field (render-purity contract). */
  dropdownListModelValue?: {
    popupModel: {
      isVisible: boolean;
      onVisibilityChanged: { length: number };
    };
    onPropertyValueCoreChanged?: { length: number };
  };
}

const resp = (q: Question): ResponsiveButtonGroup =>
  q as unknown as ResponsiveButtonGroup;

function createButtonGroupModel(
  extra: Record<string, unknown> = {},
  name = 'bg'
): { model: Model; question: Question } {
  const model = new Model({
    elements: [
      {
        type: 'buttongroup',
        name,
        choices: ['alpha', 'beta', 'gamma'],
        ...extra,
      },
    ],
  });
  return { model, question: model.getQuestionByName(name)! };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** The ALWAYS-mounted wrapper's live viewport width (R2). */
function fireLayout(width: number, name = 'bg'): void {
  fireEvent(screen.getByTestId(`sv-buttongroup-wrapper-${name}`), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 48 } },
  });
}

/** The row ScrollView's intrinsic content width. The measuring row is
 * MOUNTED in BOTH modes (hidden while compact — remount-while-compact
 * regression), so the query must include a11y-hidden elements. */
function fireContentWidth(width: number, name = 'bg'): void {
  fireEvent(
    screen.getByTestId(`sv-buttongroup-scroll-${name}`, {
      includeHiddenElements: true,
    }),
    'contentSizeChange',
    width,
    48
  );
}

function spyOnResponsiveness(question: Question): jest.SpyInstance {
  return jest.spyOn(
    question as unknown as {
      processResponsiveness(r: number, a: number): boolean;
    },
    'processResponsiveness'
  );
}

function renderElement(
  question: Question,
  stack: OverlayStack<OverlayPayload> = createOverlayStack<OverlayPayload>()
): {
  stack: OverlayStack<OverlayPayload>;
  rerenderWith: (next: Question) => void;
} {
  const view = render(
    <OverlayContext.Provider value={stack}>
      <ButtonGroupQuestionElement question={question} creator={{}} />
    </OverlayContext.Provider>
  );
  return {
    stack,
    rerenderWith: (next: Question) =>
      view.rerender(
        <OverlayContext.Provider value={stack}>
          <ButtonGroupQuestionElement question={next} creator={{}} />
        </OverlayContext.Provider>
      ),
  };
}

describe('ButtonGroupQuestion — 2.5b overflow measurement (R2/R3 gates)', () => {
  it('flips to the compact dropdown control when content overflows (layout → content order)', () => {
    const question = createButtonGroup();
    renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    expect(resp(question).renderAs).toBe('dropdown');
    expect(screen.getByTestId('sv-buttongroup-dropdown-bg')).toBeTruthy();
    expect(screen.queryByTestId('sv-buttongroup-scroll-bg')).toBeNull();
  });

  it('flips to compact with the callbacks in the opposite order (content → layout)', () => {
    const question = createButtonGroup();
    renderElement(question);
    fireContentWidth(800);
    fireLayout(300);
    expect(resp(question).renderAs).toBe('dropdown');
    expect(screen.getByTestId('sv-buttongroup-dropdown-bg')).toBeTruthy();
  });

  it('widening the wrapper WHILE COMPACT flips back to the row without a new content event (cached required width)', () => {
    const question = createButtonGroup();
    renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    expect(resp(question).renderAs).toBe('dropdown');
    // Flip-back must not REQUIRE a fresh content event: it compares the
    // CACHED required width against the live wrapper width (R2). (The
    // hidden measuring row can still re-emit — see the review-findings
    // suite — but an unchanged row won't, so the cache must suffice.)
    fireLayout(900);
    expect(resp(question).renderAs).toBe('default');
    expect(screen.getByTestId('sv-buttongroup-scroll-bg')).toBeTruthy();
    expect(screen.queryByTestId('sv-buttongroup-dropdown-bg')).toBeNull();
  });

  it('calls the adapter only on changed finite pairs — exact call count over a scripted resize', () => {
    const question = createButtonGroup();
    const spy = spyOnResponsiveness(question);
    renderElement(question);
    fireLayout(300); // only one width known → no call
    expect(spy).not.toHaveBeenCalled();
    fireContentWidth(500); // call 1 → compact
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(500, 300);
    fireLayout(300); // identical pair → no call
    expect(spy).toHaveBeenCalledTimes(1);
    fireLayout(301); // changed pair → call 2 (no flip)
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(500, 301);
    fireLayout(600); // call 3 → back to row
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenLastCalledWith(500, 600);
    expect(resp(question).renderAs).toBe('default');
    fireContentWidth(500); // pair (500, 600) unchanged → no call
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('never calls the adapter for non-finite or non-positive widths', () => {
    const question = createButtonGroup();
    const spy = spyOnResponsiveness(question);
    renderElement(question);
    fireLayout(0);
    fireLayout(Number.NaN);
    fireLayout(Number.POSITIVE_INFINITY);
    fireLayout(-50);
    fireContentWidth(800); // valid required, but no valid available yet
    expect(spy).not.toHaveBeenCalled();
    fireLayout(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(800, 300);
  });

  it('rounds fractional widths before the adapter and dedupes on the ROUNDED pair', () => {
    const question = createButtonGroup();
    const spy = spyOnResponsiveness(question);
    renderElement(question);
    fireContentWidth(800.6);
    fireLayout(300.4);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(801, 300);
    fireLayout(300.2); // rounds to 300 → pair unchanged → no call
    fireLayout(299.7); // rounds to 300 → pair unchanged → no call
    expect(spy).toHaveBeenCalledTimes(1);
    for (const args of spy.mock.calls) {
      for (const n of args as number[]) {
        expect(Number.isInteger(n)).toBe(true);
      }
    }
  });

  it('design mode never measures into the adapter', () => {
    const { model, question } = createButtonGroupModel();
    model.setDesignMode(true);
    const spy = spyOnResponsiveness(question);
    renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    expect(spy).not.toHaveBeenCalled();
    expect(resp(question).renderAs).not.toBe('dropdown');
    expect(screen.getByTestId('sv-buttongroup-scroll-bg')).toBeTruthy();
  });
});

describe('ButtonGroupQuestion — 2.5b compact control (R5/R7)', () => {
  it('a fitting row never instantiates the dropdownListModel', () => {
    const question = createButtonGroup();
    const spy = spyOnResponsiveness(question);
    renderElement(question);
    fireLayout(300);
    fireContentWidth(290); // fits → desktop branch, no VM
    expect(spy).toHaveBeenCalledTimes(1);
    expect(resp(question).renderAs).toBe('default');
    expect(resp(question).dropdownListModelValue).toBeUndefined();
  });

  it('default→compact→default→compact REUSES the retained VM with no duplicate popup registrations or model subscriptions', () => {
    const registerSpy = jest.spyOn(popupBridge, 'registerPopup');
    const question = createButtonGroup();
    const { stack } = renderElement(question);
    expect(resp(question).dropdownListModelValue).toBeUndefined();
    fireLayout(300);
    fireContentWidth(800);
    expect(resp(question).renderAs).toBe('dropdown');
    const vm1 = resp(question).dropdownListModelValue!;
    expect(vm1).toBeDefined();
    // ONE real popup-bridge registration for the first compact entry.
    expect(registerSpy).toHaveBeenCalledTimes(1);
    // REAL channels: the reactive base's core-callback registration on
    // the VM, and the bridge's visibility listener on the popup model.
    const vmSubs = () => vm1.onPropertyValueCoreChanged?.length ?? 0;
    const visSubs = () => vm1.popupModel.onVisibilityChanged.length;
    const compactSubs = vmSubs();
    const compactVis = visSubs();
    expect(compactSubs).toBeGreaterThan(0);
    fireLayout(900); // flip back — core retains the VM (R5)
    expect(resp(question).renderAs).toBe('default');
    expect(resp(question).dropdownListModelValue).toBe(vm1);
    // Leaving compact DETACHES — the counts MOVE (tautology guard: a
    // channel the layer never wrote could not decrement here).
    expect(vmSubs()).toBe(compactSubs - 1);
    expect(visSubs()).toBe(compactVis - 1);
    fireLayout(300); // re-compact from the CACHED required width
    expect(resp(question).renderAs).toBe('dropdown');
    expect(resp(question).dropdownListModelValue).toBe(vm1);
    // Re-entering restores EXACTLY the compact-mode counts: the retained
    // VM is reused with no duplicate attachments…
    expect(vmSubs()).toBe(compactSubs);
    expect(visSubs()).toBe(compactVis);
    // …through exactly one FRESH bridge registration (2 total).
    expect(registerSpy).toHaveBeenCalledTimes(2);
    fireEvent.press(screen.getByTestId('sv-buttongroup-dropdown-bg'));
    expect(stack.entries()).toHaveLength(1);
  });

  it('shows the localized placeholder when empty', () => {
    const question = createButtonGroup();
    renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    expect(screen.getByTestId('sv-buttongroup-placeholder')).toBeTruthy();
    // buttongroup's core default placeholder (buttongroupOptionsCaption).
    expect(screen.getByText('Select...')).toBeTruthy();
  });

  it("shows the selected item's localized caption when a value is set", () => {
    const question = createButtonGroup({
      choices: [
        { value: 'a', text: 'Alpha' },
        { value: 'b', text: 'Beta' },
      ],
    });
    renderElement(question);
    act(() => {
      question.value = 'a';
    });
    fireLayout(300);
    fireContentWidth(800);
    expect(screen.getByTestId('sv-buttongroup-value')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByTestId('sv-buttongroup-placeholder')).toBeNull();
  });

  it('read-only compact control shows readOnlyText and blocks presses', () => {
    const question = createButtonGroup({
      readOnly: true,
      defaultValue: 'alpha',
    });
    const { stack } = renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    const control = screen.getByTestId('sv-buttongroup-dropdown-bg');
    expect(control.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('sv-buttongroup-readonly')).toBeTruthy();
    expect(screen.getByText(resp(question).readOnlyText)).toBeTruthy();
    fireEvent.press(control);
    expect(stack.entries()).toHaveLength(0);
  });

  it('press opens the popup through the overlay stack; ariaExpanded drives accessibilityState.expanded', async () => {
    const question = createButtonGroup();
    const { stack } = renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    expect(
      screen.getByTestId('sv-buttongroup-dropdown-bg').props.accessibilityState
        ?.expanded
    ).toBe(false);
    fireEvent.press(screen.getByTestId('sv-buttongroup-dropdown-bg'));
    await flush();
    expect(stack.entries()).toHaveLength(1);
    expect(
      screen.getByTestId('sv-buttongroup-dropdown-bg').props.accessibilityState
        ?.expanded
    ).toBe(true);
  });

  it('compact opener mirrors core combobox role and the question title as its accessible label (R6 pin)', () => {
    const question = createButtonGroup({ title: 'Pick one' });
    renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    const control = screen.getByTestId('sv-buttongroup-dropdown-bg');
    // No search input on the compact buttongroup VM: the role falls to
    // ariaQuestionRole — combobox.
    expect(control.props.accessibilityRole).toBe('combobox');
    expect(control.props.accessibilityLabel).toBe('Pick one');
  });

  it('flip-back WHILE THE POPUP IS OPEN unregisters and semantically closes it', () => {
    const question = createButtonGroup();
    const { stack } = renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    fireEvent.press(screen.getByTestId('sv-buttongroup-dropdown-bg'));
    expect(stack.entries()).toHaveLength(1);
    fireLayout(900); // wrapper widens while the sheet is up
    expect(resp(question).renderAs).toBe('default');
    expect(stack.entries()).toHaveLength(0);
    expect(resp(question).dropdownListModelValue!.popupModel.isVisible).toBe(
      false
    );
    expect(screen.getByTestId('sv-buttongroup-scroll-bg')).toBeTruthy();
  });

  it('a question prop swap resets the cached required width and retargets popup ownership', () => {
    const questionA = createButtonGroup({}, 'bgA');
    const questionB = createButtonGroup({}, 'bgB');
    const { stack, rerenderWith } = renderElement(questionA);
    fireLayout(300, 'bgA');
    fireContentWidth(800, 'bgA');
    fireEvent.press(screen.getByTestId('sv-buttongroup-dropdown-bgA'));
    expect(stack.entries()).toHaveLength(1);
    const spyB = spyOnResponsiveness(questionB);
    rerenderWith(questionB);
    // A's registration retargeted away → semantic close.
    expect(stack.entries()).toHaveLength(0);
    expect(resp(questionA).dropdownListModelValue!.popupModel.isVisible).toBe(
      false
    );
    // B starts with NO cached required width: a layout alone can't call.
    fireLayout(300, 'bgB');
    expect(spyB).not.toHaveBeenCalled();
    fireContentWidth(900, 'bgB');
    expect(spyB).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledWith(900, 300);
    expect(screen.getByTestId('sv-buttongroup-dropdown-bgB')).toBeTruthy();
  });
});

describe('ButtonGroupQuestion — 2.5b dispatch (R1)', () => {
  it('the descriptor table keeps ONE buttongroup row (template route) pointing at the element wrapper', () => {
    const rows = DESCRIPTOR_TABLE.filter(
      (d) => d.questionType === 'buttongroup'
    );
    expect(rows).toHaveLength(1);
    const row = rows[0] as SupportedDescriptor;
    expect(row.route).toBe('template');
    expect(row.dispatchKey).toBe('buttongroup');
    expect(typeof ButtonGroupQuestionElement).toBe('function');
    expect(row.component()).toBe(ButtonGroupQuestionElement);
  });

  it('no RendererFactory registration: a compact question still dispatches through the buttongroup row', () => {
    expect(
      RendererFactory.Instance.getRenderer('buttongroup', 'dropdown')
    ).toBe('default');
    const question = createButtonGroup();
    resp(question).processResponsiveness(800, 300);
    expect(resp(question).renderAs).toBe('dropdown');
    expect(resp(question).isDefaultRendering()).toBe(true);
    expect(resolveQuestionDispatchKey(question as never)).toBe('buttongroup');
  });
});

describe('ButtonGroupQuestion — 2.5b end-to-end through <Survey>', () => {
  it('overflow inside a real Survey compacts; the sheet RENDERS the choices; pressing a rendered row commits and closes', async () => {
    const model = new Model({
      elements: [
        {
          type: 'buttongroup',
          name: 'plan',
          choices: ['Basic', 'Pro', 'Enterprise'],
        },
      ],
    });
    const question = model.getQuestionByName('plan')!;
    render(<Survey model={model as never} />);
    // The shell's rows defer children until their first onLayout (1.3 D3).
    for (const row of screen.getAllByTestId('sv-row')) {
      fireEvent(row, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 120 } },
      });
    }
    fireLayout(300, 'plan');
    fireContentWidth(800, 'plan');
    expect(screen.getByTestId('sv-buttongroup-dropdown-plan')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sv-buttongroup-dropdown-plan'));
    await flush();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    // The opened sheet RENDERS the real sv-list row for EVERY choice —
    // the collapsed control's hidden measuring row is a11y-hidden, so
    // these can only match the sheet's content.
    for (const title of ['Basic', 'Pro', 'Enterprise']) {
      expect(screen.getByTestId(`sv-list-item-${title}`)).toBeTruthy();
    }
    // Select by PRESSING the rendered row — never by driving the VM.
    fireEvent.press(screen.getByTestId('sv-list-item-Pro'));
    await flush();
    expect(JSON.parse(JSON.stringify(question.value))).toBe('Pro');
    // The sheet closed (model hidden, shell Modal down)…
    expect(resp(question).dropdownListModelValue!.popupModel.isVisible).toBe(
      false
    );
    expect(screen.UNSAFE_queryByType(Modal)?.props.visible ?? false).toBe(
      false
    );
    // …and the collapsed control shows the committed selection.
    within(screen.getByTestId('sv-buttongroup-value')).getByText('Pro');
  });
});

describe('ButtonGroupQuestion — 2.5b review-findings regressions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a question that MOUNTS already compact (persisted renderAs) still measures and flips back to the row', () => {
    // renderAs is a serialized core property — a survey persisted while
    // compact REMOUNTS compact, with no cached required width.
    const question = createButtonGroup({ renderAs: 'dropdown' });
    renderElement(question);
    // The wrapper's first layout materializes the compact control…
    fireLayout(300);
    expect(screen.getByTestId('sv-buttongroup-dropdown-bg')).toBeTruthy();
    // …and the measuring row is MOUNTED (hidden) while compact, so the
    // intrinsic content event is still possible after the remount.
    fireContentWidth(800);
    expect(resp(question).renderAs).toBe('dropdown');
    fireLayout(900);
    expect(resp(question).renderAs).toBe('default');
    expect(screen.getByTestId('sv-buttongroup-scroll-bg')).toBeTruthy();
    expect(screen.queryByTestId('sv-buttongroup-dropdown-bg')).toBeNull();
  });

  it('while compact the measuring row is hidden from accessibility and touch but stays mounted', () => {
    const question = createButtonGroup();
    renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    expect(resp(question).renderAs).toBe('dropdown');
    // Hidden from default (accessibility-respecting) queries…
    expect(screen.queryByTestId('sv-buttongroup-scroll-bg')).toBeNull();
    // …but mounted, with the hide + no-touch contract on the host.
    const measure = screen.getByTestId('sv-buttongroup-measure-bg', {
      includeHiddenElements: true,
    });
    expect(measure.props.accessibilityElementsHidden).toBe(true);
    expect(measure.props.importantForAccessibility).toBe('no-hide-descendants');
    const flat = StyleSheet.flatten(measure.props.style) as {
      opacity?: number;
      position?: string;
      pointerEvents?: string;
    };
    expect(flat.opacity).toBe(0);
    expect(flat.position).toBe('absolute');
    expect(flat.pointerEvents).toBe('none');
    // Row mode: the same host is visible and interactive again.
    fireLayout(900);
    const rowHost = screen.getByTestId('sv-buttongroup-measure-bg');
    expect(rowHost.props.accessibilityElementsHidden).toBe(false);
  });

  it('mounting ALREADY compact constructs the lazy VM exactly once and NEVER during a render pass', () => {
    const question = createButtonGroup({ renderAs: 'dropdown' });
    const events: string[] = [];
    let backing: unknown;
    // Intercept the backing-field WRITE (creation) and stamp whether a
    // render pass was live via the shared D2 render guard.
    Object.defineProperty(question, 'dropdownListModelValue', {
      configurable: true,
      get: () => backing,
      set: (value: unknown) => {
        if (value !== undefined && backing === undefined) {
          const guard =
            (question as unknown as { reactRendering?: number })
              .reactRendering ?? 0;
          events.push(
            guard > 0
              ? 'constructed-during-render'
              : 'constructed-outside-render'
          );
        }
        backing = value;
      },
    });
    renderElement(question);
    // Mount (render + commit) reads only the non-creating backing field.
    expect(events).toEqual([]);
    fireLayout(300);
    expect(events).toEqual(['constructed-outside-render']);
    expect(screen.getByTestId('sv-buttongroup-dropdown-bg')).toBeTruthy();
    fireContentWidth(800);
    fireLayout(301);
    expect(events).toHaveLength(1); // exactly once, ever
  });

  it('content growth WHILE COMPACT re-measures through the hidden row: flip-back uses the UPDATED required width', () => {
    const question = createButtonGroup();
    renderElement(question);
    fireLayout(300);
    fireContentWidth(800);
    expect(resp(question).renderAs).toBe('dropdown');
    // Content changes while compact (a long choice appended): the hidden
    // measuring row re-renders and re-emits its intrinsic width.
    act(() => {
      resp(question).choices = [
        'alpha',
        'beta',
        'gamma',
        'a much longer caption that widens the row',
      ];
    });
    fireContentWidth(1000);
    // 900 clears the STALE 800 but not the UPDATED 1000 — stays compact.
    fireLayout(900);
    expect(resp(question).renderAs).toBe('dropdown');
    fireLayout(1100);
    expect(resp(question).renderAs).toBe('default');
  });

  it('measurement bookkeeping (syncMeasurementTarget) never runs during a render pass', () => {
    const proto = ButtonGroupQuestion.prototype as unknown as {
      syncMeasurementTarget(this: unknown): void;
    };
    const original = proto.syncMeasurementTarget;
    const renderPhaseCalls: string[] = [];
    jest
      .spyOn(proto, 'syncMeasurementTarget' as never)
      .mockImplementation(function (this: {
        questionBase: { reactRendering?: number; name: string };
      }) {
        if ((this.questionBase.reactRendering ?? 0) > 0) {
          renderPhaseCalls.push(this.questionBase.name);
        }
        return original.call(this);
      } as never);
    const questionA = createButtonGroup({}, 'bgA');
    const questionB = createButtonGroup({}, 'bgB');
    const { rerenderWith } = renderElement(questionA);
    fireLayout(300, 'bgA');
    fireContentWidth(800, 'bgA'); // compacts A
    rerenderWith(questionB); // swap while A is compact
    fireLayout(300, 'bgB');
    fireContentWidth(900, 'bgB');
    expect(renderPhaseCalls).toEqual([]);
  });
});
