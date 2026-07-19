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
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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
  it('renders the collapsed control with the core placeholder when empty — NOT the rating item rows', () => {
    const { question } = createRatingDropdown();
    renderElement(question);
    expect(screen.getByTestId('sv-rating-dropdown-rate')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-item-rate-0')).toBeNull();
    expect(screen.getByTestId('sv-rating-dropdown-placeholder')).toBeTruthy();
    // Core's localized rating placeholder (ratingOptionsCaption).
    expect(screen.getByText('Select...')).toBeTruthy();
  });

  it("shows the selected rate value's LOCALIZED text once a value is set (selectedItemLocText, not a raw value string)", () => {
    const { question } = createRatingDropdown({
      rateValues: [
        { value: 1, text: 'Bad' },
        { value: 2, text: 'OK' },
        { value: 3, text: 'Great' },
      ],
    });
    renderElement(question);
    act(() => {
      question.value = 3;
    });
    expect(screen.getByTestId('sv-rating-dropdown-value')).toBeTruthy();
    expect(screen.getByText('Great')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-dropdown-placeholder')).toBeNull();
  });

  it('read-only shows readOnlyText (core displayValue) and blocks open', () => {
    const { question } = createRatingDropdown({
      readOnly: true,
      defaultValue: 4,
    });
    const { stack } = renderElement(question);
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

  it('opener carries the question title as its accessible label (R6 pin)', () => {
    const { question } = createRatingDropdown({ title: 'Rate our service' });
    renderElement(question);
    expect(
      screen.getByTestId('sv-rating-dropdown-rate').props.accessibilityLabel
    ).toBe('Rate our service');
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

  it('a displayMode:"dropdown" rating inside a real Survey dispatches through the descriptor route, opens the shell Modal, and commits a selection', async () => {
    const model = new Model({
      elements: [{ type: 'rating', name: 'score', displayMode: 'dropdown' }],
    });
    const question = model.getQuestionByName('score')!;
    render(<Survey model={model as never} />);
    layoutRows();
    expect(screen.getByTestId('sv-rating-dropdown-score')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-item-score-0')).toBeNull();
    fireEvent.press(screen.getByTestId('sv-rating-dropdown-score'));
    await flush();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    const vm = resp(question).dropdownListModel!;
    const two = vm.listModel.actions.find((a) => a.title === '2')!;
    act(() => {
      vm.listModel.onItemClick(two);
    });
    expect(JSON.parse(JSON.stringify(question.value))).toBe(2);
    await flush();
    expect(vm.popupModel.isVisible).toBe(false);
  });

  it('a runtime displayMode change flips the rendered mode BOTH directions (dropdown → buttons → dropdown)', async () => {
    const model = new Model({
      elements: [{ type: 'rating', name: 'score', displayMode: 'dropdown' }],
    });
    const question = model.getQuestionByName('score')!;
    render(<Survey model={model as never} />);
    layoutRows();
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
