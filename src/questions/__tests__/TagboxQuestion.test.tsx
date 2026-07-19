/**
 * `tagbox` question (task 2.4) — multi-select sibling of `dropdown`,
 * reusing the 2.1 overlay + ListPicker (plan:
 * docs/design/2.4-tagbox-plan.md). Value is an ARRAY; the control shows
 * removable chips; the overlay list stays open across selections.
 */
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { TagboxQuestion, TagboxQuestionElement } from '../TagboxQuestion';
import { OverlayContext } from '../../overlay/OverlayContext';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';
import {
  setDiagnosticHandler,
  type DiagnosticPayload,
} from '../../diagnostics';

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

  it('opener carries the question title as its accessible label; clear is named by the VM clearCaption (R6 pin)', async () => {
    const { question } = createTagbox({ title: 'Toppings', allowClear: true });
    question.value = ['apple'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(
      screen.getByTestId('sv-tagbox-control').props.accessibilityLabel
    ).toBe('Toppings');
    const vm = (
      question as unknown as { dropdownListModel: { clearCaption: string } }
    ).dropdownListModel;
    expect(vm.clearCaption).toBeTruthy();
    expect(screen.getByTestId('sv-tagbox-clear').props.accessibilityLabel).toBe(
      vm.clearCaption
    );
  });
});

// PR #30 review regressions (codex sol@max, revise round 1).

describe('TagboxQuestion — review r1 correctness', () => {
  it('chip source excludes the synthetic Select-All action (r1 #2): no phantom chip', async () => {
    const { question } = createTagbox({ showSelectAllItem: true });
    question.value = ['apple', 'banana', 'cherry', 'date']; // all selected
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    // Exactly one chip per real choice — not a "Select All"/"Deselect all" chip.
    expect(screen.queryByText('Select All')).toBeNull();
    expect(screen.queryByText('Deselect all')).toBeNull();
    expect(screen.getByTestId('sv-tagbox-chip-apple')).toBeTruthy();
    expect(screen.getByTestId('sv-tagbox-chip-date')).toBeTruthy();
  });

  it('object-valued choices render + remove correctly (r1 #1/#6)', async () => {
    const model = new Model({
      elements: [
        {
          type: 'tagbox',
          name: 'tb',
          choices: [
            { value: 'x1', text: 'One' },
            { value: 'x2', text: 'Two' },
          ],
        },
      ],
    });
    const question = model.getQuestionByName('tb')!;
    question.value = ['x1', 'x2'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByText('One')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sv-tagbox-chip-remove-x1'));
    expect(JSON.parse(JSON.stringify(question.value))).toEqual(['x2']);
  });

  it('renderAs:"select" is non-interactive (VM exists but is not used) + one-shot diagnostic (r1 #3)', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const { question } = createTagbox({ renderAs: 'select' });
      question.value = ['apple'];
      render(<TagboxQuestion question={question} creator={{}} />);
      await flush();
      expect(screen.getByTestId('sv-tagbox-select-fallback')).toBeTruthy();
      expect(screen.queryByTestId('sv-tagbox-control')).toBeNull();
      expect(screen.getByText('apple')).toBeTruthy();
      act(() => {
        question.value = ['banana'];
      });
      expect(
        codes.filter((c) => c === 'tagbox-select-mode-unsupported')
      ).toHaveLength(1);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });

  it('"Other (describe)" renders a comment input on other-select (r1 #4)', async () => {
    const { question } = createTagbox({ showOtherItem: true });
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.queryByTestId('sv-dropdown-other')).toBeNull();
    act(() => {
      question.value = ['other'];
    });
    const input = screen.getByTestId('sv-dropdown-other');
    fireEvent.changeText(input, 'my reason');
    fireEvent(input, 'blur');
    expect(question.comment).toBe('my reason');
  });

  it('the combobox opener carries the question label; chip remove is a sibling (r1 #5)', async () => {
    const { question } = createTagbox({ title: 'Langs' });
    question.value = ['apple'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(
      screen.getByTestId('sv-tagbox-control').props.accessibilityLabel
    ).toBe('Langs');
    // The remove button is its own accessible button (not swallowed).
    expect(
      screen.getByTestId('sv-tagbox-chip-remove-apple').props.accessibilityRole
    ).toBe('button');
  });
});

describe('TagboxQuestion — review r2 correctness', () => {
  it('select-mode STILL renders the Other-comment editor (r2 #1)', async () => {
    const { question } = createTagbox({
      renderAs: 'select',
      showOtherItem: true,
    });
    question.value = ['other'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByTestId('sv-tagbox-select-fallback')).toBeTruthy();
    const input = screen.getByTestId('sv-dropdown-other');
    fireEvent.changeText(input, 'reason');
    fireEvent(input, 'blur');
    expect(question.comment).toBe('reason');
  });

  it('select-mode reflects a post-mount placeholder change (VM stays a state element, r2 #2)', async () => {
    const { question } = createTagbox({ renderAs: 'select' });
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByText('Pick some…')).toBeTruthy();
    act(() => {
      (question as unknown as { placeholder: string }).placeholder =
        'Changed placeholder';
    });
    expect(screen.getByText('Changed placeholder')).toBeTruthy();
  });

  it('a non-empty value absent from choices shows raw chips, not the placeholder (r2 #3)', async () => {
    const model = new Model({
      elements: [
        {
          type: 'tagbox',
          name: 'tb',
          choices: ['a', 'b'],
          placeholder: 'Pick some…',
          keepIncorrectValues: true,
        },
      ],
    });
    const question = model.getQuestionByName('tb')!;
    question.value = ['ZZZ'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(question.isEmpty()).toBe(false);
    expect(screen.getByText('ZZZ')).toBeTruthy();
    expect(screen.queryByTestId('sv-tagbox-placeholder')).toBeNull();
  });
});

describe('TagboxQuestion — unmatched-value chips are per-entry (r3)', () => {
  it('a MIXED matched+unmatched value shows a chip for EACH entry (r3 #1)', async () => {
    const model = new Model({
      elements: [
        {
          type: 'tagbox',
          name: 'tb',
          choices: ['a', 'b'],
          keepIncorrectValues: true,
        },
      ],
    });
    const question = model.getQuestionByName('tb')!;
    question.value = ['a', 'ZZZ']; // 'a' matches, 'ZZZ' does not
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('ZZZ')).toBeTruthy(); // not hidden
  });

  it('valuePropertyName storage objects render + remove by the rendered id (r3 #2)', async () => {
    const model = new Model({
      elements: [
        {
          type: 'tagbox',
          name: 'tb',
          choices: ['a'],
          valuePropertyName: 'id',
          keepIncorrectValues: true,
        },
      ],
    });
    const question = model.getQuestionByName('tb')!;
    question.value = [{ id: 'ZZZ' }, { id: 'YYY' }];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    // Rendered as ZZZ/YYY, not [object Object].
    expect(screen.getByText('ZZZ')).toBeTruthy();
    expect(screen.getByText('YYY')).toBeTruthy();
    expect(screen.queryByText('[object Object]')).toBeNull();
    // Removing ZZZ leaves only {id:'YYY'} — not the wrong entry.
    fireEvent.press(screen.getByTestId('sv-tagbox-chip-remove-ZZZ'));
    expect(JSON.parse(JSON.stringify(question.value))).toEqual([{ id: 'YYY' }]);
  });
});

describe('TagboxQuestion — case/whitespace-distinct values match core semantics (r4)', () => {
  it('a matched+unmatched pair differing only by CASE renders distinctly (no false equality)', async () => {
    const model = new Model({
      elements: [
        {
          type: 'tagbox',
          name: 'tb',
          choices: [{ value: 'A', text: 'Upper' }],
          keepIncorrectValues: true,
        },
      ],
    });
    const question = model.getQuestionByName('tb')!;
    question.value = ['A', 'a']; // 'A' matches (text Upper); 'a' does not
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByText('Upper')).toBeTruthy(); // the matched 'A'
    expect(screen.getByText('a')).toBeTruthy(); // the unmatched 'a' — raw
    // Removing the unmatched lowercase 'a' leaves ['A'].
    fireEvent.press(screen.getByTestId('sv-tagbox-chip-remove-a'));
    expect(JSON.parse(JSON.stringify(question.value))).toEqual(['A']);
  });
});

describe('TagboxQuestion — render purity (2.5fu backport)', () => {
  it('constructs the lazy VM exactly once and NEVER during a render pass', async () => {
    const { question } = createTagbox();
    const events: string[] = [];
    let backing: unknown;
    // Intercept the backing-field WRITE (creation) and stamp whether a
    // render pass was live via the shared D2 render guard (mirror of the
    // ButtonGroup/RatingDropdown purity pins).
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
    render(<TagboxQuestion question={question} creator={{}} />);
    // Mount (render + commit) reads only the non-creating backing field.
    expect(events).toEqual([]);
    // The deferred (microtask) ensure materializes OUTSIDE render and
    // outside the mount-commit window.
    await flush();
    expect(events).toEqual(['constructed-outside-render']);
    expect(screen.getByTestId('sv-tagbox-control')).toBeTruthy();
    await flush();
    expect(events).toHaveLength(1); // exactly once, ever
  });

  it('chips do NOT regress during the one-microtask pre-materialization frame — never the select fallback, no diagnostic', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const { question } = createTagbox();
      question.value = ['apple', 'banana'];
      render(<TagboxQuestion question={question} creator={{}} />);
      // BEFORE the deferred ensure runs: chips render VM-free from
      // question.selectedChoices/renderedValue, and the frame is NOT the
      // select-mode fallback (no spurious diagnostic).
      expect(screen.getByTestId('sv-tagbox-chip-apple')).toBeTruthy();
      expect(screen.getByTestId('sv-tagbox-chip-banana')).toBeTruthy();
      expect(screen.queryByTestId('sv-tagbox-select-fallback')).toBeNull();
      expect(codes).toHaveLength(0);
      await flush();
      // …then the real interactive opener materializes, chips intact.
      expect(screen.getByTestId('sv-tagbox-control')).toBeTruthy();
      expect(screen.getByTestId('sv-tagbox-chip-apple')).toBeTruthy();
      expect(codes).toHaveLength(0);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });

  it('a select-mode MOUNT never constructs the VM (the creating tagbox getter has no renderAs gate — the renderer discipline is the gate)', async () => {
    const { question } = createTagbox({ renderAs: 'select' });
    question.value = ['apple'];
    render(<TagboxQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByTestId('sv-tagbox-select-fallback')).toBeTruthy();
    expect(
      (question as unknown as { dropdownListModelValue?: unknown })
        .dropdownListModelValue
    ).toBeUndefined();
  });
});

describe('TagboxQuestion — StrictMode lifecycle replay (2.5fu backport)', () => {
  it('the deferred ensure survives the StrictMode mount → simulated-unmount → remount replay on the SAME instance: the opener still materializes', async () => {
    // React 19 StrictMode (dev) replays the class mount lifecycles on the
    // SAME instance (didMount → willUnmount → didMount): a one-way
    // `ensureUnmounted` latch never reset would leave the control on the
    // pending frame forever (mirror of external review C1).
    const { question } = createTagbox();
    render(
      <React.StrictMode>
        <TagboxQuestion question={question} creator={{}} />
      </React.StrictMode>
    );
    await flush();
    expect(
      (question as unknown as { dropdownListModelValue?: unknown })
        .dropdownListModelValue
    ).toBeDefined();
    expect(screen.getByTestId('sv-tagbox-control')).toBeTruthy();
  });

  it('the exact documented replay sequence (didMount → willUnmount → didMount before any microtask) does not latch the ensure machinery', async () => {
    // Belt-and-suspenders next to the StrictMode render above: drive the
    // documented sequence explicitly on the mounted instance so the test
    // stays decisive even if the harness's StrictMode timing changes.
    const { question } = createTagbox();
    render(<TagboxQuestion question={question} creator={{}} />);
    const instance = screen.UNSAFE_getByType(TagboxQuestion)
      .instance as TagboxQuestion;
    act(() => {
      instance.componentWillUnmount();
      instance.componentDidMount();
    });
    await flush();
    expect(
      (question as unknown as { dropdownListModelValue?: unknown })
        .dropdownListModelValue
    ).toBeDefined();
    expect(screen.getByTestId('sv-tagbox-control')).toBeTruthy();
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
