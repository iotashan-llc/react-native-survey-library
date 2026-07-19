/**
 * rating `displayMode:"dropdown"` (task 2.5a) — the rating question's
 * overlay renderer route. Public API is `displayMode` (R8): core maps it
 * to `renderAs` (load + runtime change, both directions), and the
 * descriptor table's renderer-route row ("rating","dropdown" →
 * "sv-rating-dropdown") makes `getComponentName()` resolve our dispatch
 * key so the EXISTING SurveyRowElement dispatch routes it (R1 — no new
 * dispatch code). Rows come from the shared sv-list/ListPicker popup —
 * NOTHING is registered for `sv-rating-dropdown-item` (the collapsed
 * display, not an overlay row).
 */
import { Modal } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { Model, RendererFactory } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { RatingDropdownQuestionElement } from '../RatingDropdownQuestion';
import { Survey } from '../../survey/Survey';
import { OverlayContext } from '../../overlay/OverlayContext';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';
import { DESCRIPTOR_TABLE } from '../../factories/descriptors';
import type { SupportedDescriptor } from '../../factories/descriptors';
import { resolveQuestionDispatchKey } from '../../factories/dispatch-key';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Typed access to the rating model's dropdown surface. */
interface RatingResp {
  renderAs: string;
  displayMode: string;
  readOnlyText: string;
  isDefaultRendering(): boolean;
  getComponentName(): string;
  dropdownListModel?: {
    listModel: {
      actions: Array<{ id: string; title: string }>;
      onItemClick(item: unknown): void;
    };
    popupModel: { isVisible: boolean; contentComponentName: string };
  };
  dropdownListModelValue?: unknown;
}

function resp(question: Question): RatingResp {
  return question as unknown as RatingResp;
}

function createRatingDropdown(
  extra: Record<string, unknown> = {},
  name = 'rate'
): { model: Model; question: Question } {
  const model = new Model({
    elements: [{ type: 'rating', name, displayMode: 'dropdown', ...extra }],
  });
  return { model, question: model.getQuestionByName(name)! };
}

function renderElement(
  question: Question,
  stack: OverlayStack<OverlayPayload> = createOverlayStack<OverlayPayload>()
): { stack: OverlayStack<OverlayPayload> } {
  render(
    <OverlayContext.Provider value={stack}>
      <RatingDropdownQuestionElement question={question} creator={{}} />
    </OverlayContext.Provider>
  );
  return { stack };
}

describe('RatingDropdownQuestion — dispatch (R1)', () => {
  it('the descriptor table carries ONE rating renderer-route row ("sv-rating-dropdown", renderAs "dropdown") pointing at the element wrapper', () => {
    const rows = DESCRIPTOR_TABLE.filter(
      (d) => d.questionType === 'rating' && d.route === 'renderer'
    );
    expect(rows).toHaveLength(1);
    const row = rows[0] as SupportedDescriptor;
    expect(row.dispatchKey).toBe('sv-rating-dropdown');
    expect(row.renderAs).toBe('dropdown');
    // R4 (blocking): the row must point at the OverlayContext WRAPPER —
    // the class alone would toggle the PopupModel with no Modal bridged.
    expect(row.component()).toBe(RatingDropdownQuestionElement);
  });

  it('the PUBLIC displayMode:"dropdown" API routes through the renderer registration (no renderAs assignment anywhere)', () => {
    const { question } = createRatingDropdown();
    expect(resp(question).displayMode).toBe('dropdown');
    expect(resp(question).renderAs).toBe('dropdown');
    expect(RendererFactory.Instance.getRenderer('rating', 'dropdown')).toBe(
      'sv-rating-dropdown'
    );
    expect(resp(question).isDefaultRendering()).toBe(false);
    expect(resp(question).getComponentName()).toBe('sv-rating-dropdown');
    expect(resolveQuestionDispatchKey(question as never)).toBe(
      'sv-rating-dropdown'
    );
  });
});

describe('RatingDropdownQuestion — collapsed control (R7)', () => {
  it('renders the collapsed control with the core placeholder when empty — NOT the rating item rows', async () => {
    const { question } = createRatingDropdown();
    renderElement(question);
    await flush(); // M1: the VM materializes one microtask after mount
    expect(screen.getByTestId('sv-rating-dropdown-rate')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-item-rate-0')).toBeNull();
    expect(screen.getByTestId('sv-rating-dropdown-placeholder')).toBeTruthy();
    // Core's localized rating placeholder (ratingOptionsCaption).
    expect(screen.getByText('Select...')).toBeTruthy();
  });

  it("shows the selected rate value's LOCALIZED text once a value is set (selectedItemLocText, not a raw value string)", async () => {
    const { question } = createRatingDropdown({
      rateValues: [
        { value: 1, text: 'Bad' },
        { value: 2, text: 'OK' },
        { value: 3, text: 'Great' },
      ],
    });
    renderElement(question);
    await flush();
    act(() => {
      question.value = 3;
    });
    expect(screen.getByTestId('sv-rating-dropdown-value')).toBeTruthy();
    expect(screen.getByText('Great')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-dropdown-placeholder')).toBeNull();
  });

  it('read-only shows readOnlyText (core displayValue) and blocks open', async () => {
    const { question } = createRatingDropdown({
      readOnly: true,
      defaultValue: 4,
    });
    const { stack } = renderElement(question);
    await flush();
    const control = screen.getByTestId('sv-rating-dropdown-rate');
    expect(control.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('sv-rating-dropdown-readonly')).toBeTruthy();
    expect(screen.getByText(resp(question).readOnlyText)).toBeTruthy();
    fireEvent.press(control);
    expect(stack.entries()).toHaveLength(0);
    expect(resp(question).dropdownListModel!.popupModel.isVisible).toBe(false);
  });

  it('clear (core clearCaption, allowClear default) resets the value; the affordance hides while empty', async () => {
    const { question } = createRatingDropdown();
    renderElement(question);
    await flush();
    expect(screen.queryByTestId('sv-rating-dropdown-clear-rate')).toBeNull();
    act(() => {
      question.value = 3;
    });
    const clear = screen.getByTestId('sv-rating-dropdown-clear-rate');
    expect(clear.props.accessibilityLabel).toBe('Clear');
    fireEvent.press(clear);
    expect(question.isEmpty()).toBe(true);
    expect(screen.queryByTestId('sv-rating-dropdown-clear-rate')).toBeNull();
  });

  it('opener carries the question title as its accessible label (R6 pin)', async () => {
    const { question } = createRatingDropdown({ title: 'Rate our service' });
    renderElement(question);
    await flush();
    expect(
      screen.getByTestId('sv-rating-dropdown-rate').props.accessibilityLabel
    ).toBe('Rate our service');
  });

  it('a survey.locale switch re-renders the collapsed caption localized (selectedItemLocText); the placeholder renders the construction-locale text', async () => {
    const { model, question } = createRatingDropdown({
      rateValues: [
        { value: 1, text: { default: 'Bad', de: 'Schlecht' } },
        { value: 2, text: { default: 'Great', de: 'Toll' } },
      ],
    });
    // `placeholder` is a LOCALIZABLE rating property but NOT a serialized
    // one (absent from core's addClass("rating") list) — set the
    // per-locale texts through the loc string.
    const locPlaceholder = (
      question as unknown as {
        locPlaceholder: { setLocaleText(loc: string, text: string): void };
      }
    ).locPlaceholder;
    locPlaceholder.setLocaleText('', 'Pick one');
    locPlaceholder.setLocaleText('de', 'Wähle eins');
    renderElement(question);
    await flush();
    // Empty: `vm.placeholderRendered` folds to the VM's stored
    // `inputPlaceholder`, captured from the CONSTRUCTION-time locale.
    // (Observed core 2.5.33 behavior: unlike QuestionDropdownModel —
    // whose updateInputPlaceholder re-pushes on locale/placeholder
    // changes — QuestionRatingModel wires no refresh, so a later locale
    // flip does NOT re-render the placeholder. Core limitation, not a
    // renderer gap; the caption below IS live.)
    expect(
      within(screen.getByTestId('sv-rating-dropdown-placeholder')).getByText(
        'Pick one'
      )
    ).toBeTruthy();
    // Selected: the caption follows the locale (LocString viewer path).
    act(() => {
      question.value = 2;
    });
    expect(
      within(screen.getByTestId('sv-rating-dropdown-value')).getByText('Great')
    ).toBeTruthy();
    act(() => {
      model.locale = 'de';
    });
    expect(
      within(screen.getByTestId('sv-rating-dropdown-value')).getByText('Toll')
    ).toBeTruthy();
    expect(screen.queryByText('Great')).toBeNull();
  });
});

describe('RatingDropdownQuestion — render purity (M1, 6c1eb79 pattern)', () => {
  it('materializes the lazy VM exactly once and NEVER during a render pass', async () => {
    const { question } = createRatingDropdown();
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
    // The deferred (microtask) ensure materializes OUTSIDE render and
    // outside the mount-commit window.
    await flush();
    expect(events).toEqual(['constructed-outside-render']);
    expect(screen.getByTestId('sv-rating-dropdown-rate')).toBeTruthy();
    await flush();
    expect(events).toHaveLength(1); // exactly once, ever
  });
});

describe('RatingDropdownQuestion — overlay (popup + selection)', () => {
  it('press opens the sv-list popup into the overlay stack, listing the rate values; combobox a11y with STRING ariaExpanded', async () => {
    const { question } = createRatingDropdown();
    const { stack } = renderElement(question);
    await flush();
    const control = screen.getByTestId('sv-rating-dropdown-rate');
    // Core's INPUT aria surface: rating-dropdown has no search input, so
    // the role falls to ariaQuestionRole — combobox.
    expect(control.props.accessibilityRole).toBe('combobox');
    expect(control.props.accessibilityState?.expanded).toBe(false);
    fireEvent.press(control);
    await flush();
    expect(stack.entries()).toHaveLength(1);
    expect(stack.entries()[0]!.payload.shape).toBe('sheet');
    const vm = resp(question).dropdownListModel!;
    expect(vm.popupModel.contentComponentName).toBe('sv-list');
    expect(vm.listModel.actions.map((a) => a.title)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    // ariaExpanded is a STRING ('true' | 'false') the VM re-emits.
    expect(
      screen.getByTestId('sv-rating-dropdown-rate').props.accessibilityState
        ?.expanded
    ).toBe(true);
  });

  it('selecting a rate value commits question.value and closes the popup', async () => {
    const { question } = createRatingDropdown();
    const { stack } = renderElement(question);
    await flush();
    fireEvent.press(screen.getByTestId('sv-rating-dropdown-rate'));
    await flush();
    const vm = resp(question).dropdownListModel!;
    const four = vm.listModel.actions.find((a) => a.title === '4')!;
    act(() => {
      vm.listModel.onItemClick(four);
    });
    expect(JSON.parse(JSON.stringify(question.value))).toBe(4);
    expect(stack.entries()[0]?.state ?? 'gone').not.toBe('active');
    expect(vm.popupModel.isVisible).toBe(false);
  });
});

describe('RatingDropdownQuestion — end-to-end through <Survey> (R4/R8)', () => {
  function layoutRows(): void {
    // The shell's rows defer children until their first onLayout (1.3 D3).
    for (const row of screen.getAllByTestId('sv-row')) {
      fireEvent(row, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 120 } },
      });
    }
  }

  it('a displayMode:"dropdown" rating inside a real Survey opens the shell Modal, RENDERS the rate rows, and pressing a rendered row commits and closes', async () => {
    const model = new Model({
      elements: [{ type: 'rating', name: 'score', displayMode: 'dropdown' }],
    });
    const question = model.getQuestionByName('score')!;
    render(<Survey model={model as never} />);
    layoutRows();
    await flush(); // M1: the VM materializes one microtask after mount
    expect(screen.getByTestId('sv-rating-dropdown-score')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-item-score-0')).toBeNull();
    fireEvent.press(screen.getByTestId('sv-rating-dropdown-score'));
    await flush();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    // The opened sheet RENDERS a real sv-list row for EVERY rate value.
    // Rating actions carry component 'sv-rating-dropdown-item' — web's
    // COLLAPSED display, deliberately unregistered here — so ListPicker's
    // fallback branch renders the default title rows.
    const vm = resp(question).dropdownListModel!;
    for (const action of vm.listModel.actions) {
      expect(screen.getByTestId(`sv-list-item-${action.id}`)).toBeTruthy();
    }
    // Select by PRESSING the rendered row — never by driving the VM.
    const two = vm.listModel.actions.find((a) => a.title === '2')!;
    fireEvent.press(screen.getByTestId(`sv-list-item-${two.id}`));
    await flush();
    expect(JSON.parse(JSON.stringify(question.value))).toBe(2);
    // The sheet closed (model hidden, shell Modal down)…
    expect(vm.popupModel.isVisible).toBe(false);
    expect(screen.UNSAFE_queryByType(Modal)?.props.visible ?? false).toBe(
      false
    );
    // …and the collapsed control shows the committed selection.
    within(screen.getByTestId('sv-rating-dropdown-value')).getByText('2');
  });

  it('a runtime displayMode change flips the rendered mode BOTH directions (dropdown → buttons → dropdown)', async () => {
    const model = new Model({
      elements: [{ type: 'rating', name: 'score', displayMode: 'dropdown' }],
    });
    const question = model.getQuestionByName('score')!;
    render(<Survey model={model as never} />);
    layoutRows();
    await flush(); // M1: the VM materializes one microtask after mount
    expect(screen.getByTestId('sv-rating-dropdown-score')).toBeTruthy();
    act(() => {
      resp(question).displayMode = 'buttons';
    });
    await flush();
    layoutRows();
    expect(resp(question).renderAs).toBe('default');
    expect(screen.queryByTestId('sv-rating-dropdown-score')).toBeNull();
    expect(screen.getByTestId('sv-rating-item-score-0')).toBeTruthy();
    act(() => {
      resp(question).displayMode = 'dropdown';
    });
    await flush();
    layoutRows();
    expect(resp(question).renderAs).toBe('dropdown');
    expect(screen.getByTestId('sv-rating-dropdown-score')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-item-score-0')).toBeNull();
  });
});

describe('RatingDropdownQuestion — displayMode:"auto" exclusion (R8/M3)', () => {
  it('displayMode:"auto" (the core default) renders the buttons row and never constructs a dropdown VM, regardless of width', async () => {
    // DOCUMENTED DIVERGENCE PIN: on web, "auto" collapses to the dropdown
    // when a ResizeObserver reports overflow. RN wires no measurement
    // seam for rating (no ResizeObserver equivalent), so "auto" ALWAYS
    // renders the buttons row — hosts that want the collapsed control
    // must say displayMode:"dropdown" explicitly (see DIFFERENCES.md).
    const model = new Model({
      elements: [{ type: 'rating', name: 'score' }],
    });
    const question = model.getQuestionByName('score')!;
    render(<Survey model={model as never} />);
    // Deliberately NARROW rows — width must have no effect.
    for (const row of screen.getAllByTestId('sv-row')) {
      fireEvent(row, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 120, height: 120 } },
      });
    }
    await act(async () => {
      await Promise.resolve();
    });
    expect(resp(question).displayMode).toBe('auto');
    expect(resp(question).renderAs).toBe('default');
    expect(screen.getByTestId('sv-rating-item-score-0')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-dropdown-score')).toBeNull();
    expect(resp(question).dropdownListModelValue).toBeUndefined();
  });
});
