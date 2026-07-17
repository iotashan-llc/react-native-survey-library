/**
 * `tagbox` question (task 2.4) — multi-select sibling of `dropdown`,
 * reusing the 2.1 overlay + ListPicker (plan:
 * docs/design/2.4-tagbox-plan.md). Value is an ARRAY; the control shows
 * removable chips; the overlay list stays open across selections.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { TagboxQuestion, TagboxQuestionElement } from '../TagboxQuestion';
import { OverlayContext } from '../../overlay/OverlayContext';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function createTagbox(extra: Record<string, unknown> = {}) {
  const model = new Model({
    elements: [
      {
        type: 'tagbox',
        name: 'tb',
        choices: ['apple', 'banana', 'cherry', 'date'],
        placeholder: 'Pick some…',
        ...extra,
      },
    ],
  });
  return { model, question: model.getQuestionByName('tb')! };
}

describe('TagboxQuestion — chips', () => {
  it('renders the placeholder when empty and a removable chip per selected value', async () => {
    const { question } = createTagbox();
    question.value = ['apple', 'banana'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByText('apple')).toBeTruthy();
    expect(screen.getByText('banana')).toBeTruthy();
    // Each selected value has its own chip container + remove affordance.
    expect(screen.getByTestId('sv-tagbox-chip-apple')).toBeTruthy();
    expect(screen.getByTestId('sv-tagbox-chip-remove-apple')).toBeTruthy();
    expect(screen.queryByText('Pick some…')).toBeNull();
  });

  it('shows the placeholder (no chips) when the value is empty', async () => {
    const { question } = createTagbox();
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByText('Pick some…')).toBeTruthy();
    expect(screen.queryByTestId('sv-tagbox-chip-apple')).toBeNull();
  });

  it('a chip remove ✕ removes just that value from the array', async () => {
    const { question } = createTagbox();
    question.value = ['apple', 'banana'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    fireEvent.press(screen.getByTestId('sv-tagbox-chip-remove-apple'));
    expect(JSON.parse(JSON.stringify(question.value))).toEqual(['banana']);
    expect(screen.queryByTestId('sv-tagbox-chip-apple')).toBeNull();
    expect(screen.getByTestId('sv-tagbox-chip-banana')).toBeTruthy();
  });
});

describe('TagboxQuestion — clear + a11y', () => {
  it('clear-all empties the whole array through vm.onClear', async () => {
    const { question } = createTagbox({ allowClear: true });
    question.value = ['apple', 'banana'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    fireEvent.press(screen.getByTestId('sv-tagbox-clear'));
    expect(question.isEmpty()).toBe(true);
    expect(screen.queryByTestId('sv-tagbox-chip-apple')).toBeNull();
    expect(screen.getByText('Pick some…')).toBeTruthy();
  });

  it('no clear button when empty or allowClear is off', async () => {
    const { question } = createTagbox({ allowClear: false });
    question.value = ['apple'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.queryByTestId('sv-tagbox-clear')).toBeNull();
  });

  it('uses core combobox role and reflects popup expansion (string ariaExpanded)', async () => {
    const { question } = createTagbox();
    const stack = createOverlayStack<OverlayPayload>();
    render(
      <OverlayContext.Provider value={stack}>
        <TagboxQuestionElement question={question} creator={{}} />
      </OverlayContext.Provider>
    );
    await flush();
    const control = screen.getByTestId('sv-tagbox-control');
    expect(control.props.accessibilityRole).toBe('combobox');
    expect(control.props.accessibilityState?.expanded).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('sv-tagbox-control'));
      await Promise.resolve();
    });
    expect(
      screen.getByTestId('sv-tagbox-control').props.accessibilityState?.expanded
    ).toBe(true);
  });
});

describe('TagboxQuestion — multi-select through the overlay', () => {
  it('press opens the overlay; selecting rows ADDS to the array and keeps the sheet open', async () => {
    const { question } = createTagbox();
    const stack = createOverlayStack<OverlayPayload>();
    render(
      <OverlayContext.Provider value={stack}>
        <TagboxQuestionElement question={question} creator={{}} />
      </OverlayContext.Provider>
    );
    await flush();
    fireEvent.press(screen.getByTestId('sv-tagbox-control'));
    expect(stack.entries()).toHaveLength(1);
    await flush();
    const listModel = (
      question as unknown as {
        dropdownListModel: {
          listModel: {
            actions: Array<{ id: string; title: string }>;
            onItemClick(item: unknown): void;
          };
        };
      }
    ).dropdownListModel.listModel;
    const apple = listModel.actions.find((a) => a.title === 'apple')!;
    const cherry = listModel.actions.find((a) => a.title === 'cherry')!;
    act(() => {
      listModel.onItemClick(apple);
    });
    act(() => {
      listModel.onItemClick(cherry);
    });
    expect(JSON.parse(JSON.stringify(question.value))).toEqual([
      'apple',
      'cherry',
    ]);
    // Multi-select keeps the sheet active (no auto-dismiss per pick).
    expect(stack.entries()[0]?.state).toBe('active');
  });
});
