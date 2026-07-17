/**
 * `dropdown` question (task 2.3) — RN port of survey-react-ui's
 * SurveyQuestionDropdownBase over the 2.1 overlay primitives (plan:
 * docs/design/2.3-dropdown-plan.md v4).
 *
 * Under the facade's `_setIsTouch(true)`: displayMode='overlay',
 * search lives INSIDE the popup, control shows value text or
 * placeholder (inline filter input dropped — inputMode='none' on web
 * touch). Popup bridge is question-scoped via OverlayContext.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { DropdownQuestion, DropdownQuestionElement } from '../DropdownQuestion';
import { OverlayContext } from '../../overlay/OverlayContext';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function createDropdown(extra: Record<string, unknown> = {}) {
  const model = new Model({
    elements: [
      {
        type: 'dropdown',
        name: 'dd',
        choices: ['apple', 'banana', 'cherry'],
        placeholder: 'Pick one…',
        ...extra,
      },
    ],
  });
  return { model, question: model.getQuestionByName('dd')! };
}

describe('DropdownQuestion — control rendering', () => {
  it('renders the placeholder when empty, the selected item text after a model write', async () => {
    const { question } = createDropdown();
    render(<DropdownQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByText('Pick one…')).toBeTruthy();
    act(() => {
      question.value = 'banana';
    });
    expect(screen.getByText('banana')).toBeTruthy();
    expect(screen.queryByText('Pick one…')).toBeNull();
  });

  it('question-level prop changes re-render (getStateElements pins the QUESTION subscription)', async () => {
    const { question } = createDropdown();
    question.value = 'apple';
    render(<DropdownQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByTestId('sv-dropdown-clear')).toBeTruthy();
    act(() => {
      (question as unknown as { allowClear: boolean }).allowClear = false;
    });
    expect(screen.queryByTestId('sv-dropdown-clear')).toBeNull();
  });

  it('readonly renders readOnlyText without a press handler', async () => {
    const { question } = createDropdown({ readOnly: true });
    render(<DropdownQuestion question={question} creator={{}} />);
    await flush();
    const control = screen.getByTestId('sv-dropdown-control');
    expect(control.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(control);
    expect(
      (
        question as unknown as {
          dropdownListModel: { popupModel: { isVisible: boolean } };
        }
      ).dropdownListModel.popupModel.isVisible
    ).toBe(false);
  });
});

describe('DropdownQuestion — popup + selection through the overlay', () => {
  it('press opens the popup into the overlay stack; row select commits the value and closes', async () => {
    const { question } = createDropdown();
    const stack = createOverlayStack<OverlayPayload>();
    render(
      <OverlayContext.Provider value={stack}>
        <DropdownQuestionElement question={question} creator={{}} />
      </OverlayContext.Provider>
    );
    await flush();
    fireEvent.press(screen.getByTestId('sv-dropdown-control'));
    expect(stack.entries()).toHaveLength(1);
    expect(stack.entries()[0]!.payload.shape).toBe('sheet');
    await flush();
    // Select through the REAL rendered picker: the payload renders the
    // sv-list content; drive the model's list directly (row-level press
    // is pinned in ListPicker tests).
    const listModel = (
      question as unknown as {
        dropdownListModel: {
          listModel: {
            actions: Array<{ id: string; title: string }>;
            onItemClick(item: unknown): void;
          };
          popupModel: { isVisible: boolean };
        };
      }
    ).dropdownListModel.listModel;
    const banana = listModel.actions.find((a) => a.title === 'banana')!;
    act(() => {
      listModel.onItemClick(banana);
    });
    expect(JSON.parse(JSON.stringify(question.value))).toBe('banana');
    expect(stack.entries()[0]?.state ?? 'gone').not.toBe('active');
  });

  it('unmount while open runs the semantic close (popup hidden, stack empty)', async () => {
    const { question } = createDropdown();
    const stack = createOverlayStack<OverlayPayload>();
    const view = render(
      <OverlayContext.Provider value={stack}>
        <DropdownQuestionElement question={question} creator={{}} />
      </OverlayContext.Provider>
    );
    await flush();
    fireEvent.press(screen.getByTestId('sv-dropdown-control'));
    expect(stack.entries()).toHaveLength(1);
    view.unmount();
    expect(stack.entries()).toHaveLength(0);
    expect(
      (
        question as unknown as {
          dropdownListModel: { popupModel: { isVisible: boolean } };
        }
      ).dropdownListModel.popupModel.isVisible
    ).toBe(false);
  });
});

describe('DropdownQuestion — clear', () => {
  it('clear empties the value through dropdownListModel.onClear', async () => {
    const { question } = createDropdown();
    question.value = 'cherry';
    render(<DropdownQuestion question={question} creator={{}} />);
    await flush();
    fireEvent.press(screen.getByTestId('sv-dropdown-clear'));
    expect(question.isEmpty()).toBe(true);
  });
});
