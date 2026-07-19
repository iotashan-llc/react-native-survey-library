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
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { DropdownQuestion, DropdownQuestionElement } from '../DropdownQuestion';
import { SurveyLocStringViewer } from '../../components/LocStringViewer';
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

// PR #29 review regressions (codex sol@max, revise round 1).

describe('DropdownQuestion — renderAs:"select" has no overlay model (major #1)', () => {
  it('does NOT crash: renders a non-interactive value fallback + a one-shot diagnostic', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const { question } = createDropdown({ renderAs: 'select' });
      expect(
        (question as unknown as { dropdownListModel: unknown })
          .dropdownListModel
      ).toBeUndefined();
      question.value = 'apple';
      render(<DropdownQuestion question={question} creator={{}} />);
      await flush();
      expect(screen.getByTestId('sv-dropdown-select-fallback')).toBeTruthy();
      // No interactive control (no overlay to open).
      expect(screen.queryByTestId('sv-dropdown-control')).toBeNull();
      expect(screen.getByText('apple')).toBeTruthy();
      // Re-render must not re-fire the diagnostic (one-shot).
      act(() => {
        question.value = 'banana';
      });
      expect(
        codes.filter((c) => c === 'dropdown-select-mode-unsupported')
      ).toHaveLength(1);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });
});

describe('DropdownQuestion — "Other (describe)" comment (major #2)', () => {
  it('renders a comment input on other-select and commits typed text through the adapter', async () => {
    const { question } = createDropdown({ showOtherItem: true });
    render(<DropdownQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.queryByTestId('sv-dropdown-other')).toBeNull();
    act(() => {
      question.value = 'other';
    });
    const input = screen.getByTestId('sv-dropdown-other');
    fireEvent.changeText(input, 'my reason');
    fireEvent(input, 'blur');
    expect(question.comment).toBe('my reason');
  });
});

describe('DropdownQuestion — a11y mirrors the input aria surface (major #4)', () => {
  it('uses core combobox role, the question label, the VM clear caption, and reflects LIVE expansion (string ariaExpanded)', async () => {
    const { question } = createDropdown({ title: 'Fruit', allowClear: true });
    question.value = 'apple';
    render(<DropdownQuestion question={question} creator={{}} />);
    await flush();
    const control = screen.getByTestId('sv-dropdown-control');
    // core's INPUT aria role (combobox under the default searchEnabled),
    // not the previous hardcoded 'button'.
    expect(control.props.accessibilityRole).toBe('combobox');
    expect(control.props.accessibilityLabel).toBe('Fruit');
    // ariaExpanded is a STRING ('true'|'false') — the r1 fix compared it
    // to boolean true (always false). Closed reads false, open true.
    expect(control.props.accessibilityState?.expanded).toBe(false);
    // Clear caption comes from the VM (localizable), not a hardcoded label.
    const clear = screen.getByTestId('sv-dropdown-clear');
    const vm = (
      question as unknown as { dropdownListModel: { clearCaption: string } }
    ).dropdownListModel;
    expect(clear.props.accessibilityLabel).toBe(vm.clearCaption);
    // Live open transition now re-renders the collapsed control's state.
    await act(async () => {
      fireEvent.press(screen.getByTestId('sv-dropdown-control'));
      await Promise.resolve();
    });
    expect(
      screen.getByTestId('sv-dropdown-control').props.accessibilityState
        ?.expanded
    ).toBe(true);
  });

  it('a HIDDEN title still names the opener (core emits the input aria-label; R6 pin)', async () => {
    const { question } = createDropdown({
      title: 'Fruit',
      titleLocation: 'hidden',
    });
    render(<DropdownQuestion question={question} creator={{}} />);
    await flush();
    expect(
      screen.getByTestId('sv-dropdown-control').props.accessibilityLabel
    ).toBe('Fruit');
  });
});

describe('DropdownQuestion — unmatched persisted value (r2 #1)', () => {
  it('select-mode fallback does NOT crash on a value absent from choices (no selectedItemLocText)', async () => {
    const { question } = createDropdown({ renderAs: 'select' });
    // A value not among the choices — core leaves selectedItemLocText
    // undefined; renderSelectedText must fall back to the raw value
    // string instead of passing undefined to renderLocString (crash).
    question.value = 'ZZZ-not-a-choice';
    expect(() => {
      render(<DropdownQuestion question={question} creator={{}} />);
    }).not.toThrow();
    await flush();
    expect(screen.getByTestId('sv-dropdown-select-fallback')).toBeTruthy();
    expect(screen.getByText('ZZZ-not-a-choice')).toBeTruthy();
  });
});

describe('DropdownQuestion — Other adapter reconciles by question identity (r2 #2)', () => {
  it('after a question prop swap, typing writes the NEW question, never the old one', async () => {
    const a = createDropdown({ showOtherItem: true }).question;
    const b = createDropdown({ showOtherItem: true }).question;
    a.value = 'other';
    b.value = 'other';
    const view = render(<DropdownQuestion question={a} creator={{}} />);
    await flush();
    view.rerender(<DropdownQuestion question={b} creator={{}} />);
    await flush();
    const input = screen.getByTestId('sv-dropdown-other');
    fireEvent.changeText(input, 'for-b');
    fireEvent(input, 'blur');
    expect(b.comment).toBe('for-b');
    expect(a.comment).toBeFalsy();
  });

  it('an UNCOMMITTED draft typed into A does not bleed into B after a swap (keyed remount, r3 #3)', async () => {
    const a = createDropdown({ showOtherItem: true }).question;
    const b = createDropdown({ showOtherItem: true }).question;
    a.value = 'other';
    b.value = 'other';
    b.comment = 'b-existing';
    const view = render(<DropdownQuestion question={a} creator={{}} />);
    await flush();
    // Type into A WITHOUT blurring — a's native draft is uncommitted.
    fireEvent.changeText(screen.getByTestId('sv-dropdown-other'), 'a-draft');
    view.rerender(<DropdownQuestion question={b} creator={{}} />);
    await flush();
    // The keyed remount gives B a fresh controlled input seeded from B's
    // own value — never A's abandoned draft.
    expect(screen.getByTestId('sv-dropdown-other').props.value).toBe(
      'b-existing'
    );
    expect(a.comment).toBeFalsy();
  });
});

describe('DropdownQuestion — deferred diagnostics dedupe (r2 #6)', () => {
  it('reports the custom-component miss once across ordinary re-renders (commit phase, not render)', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const { question } = createDropdown({ itemComponent: 'no-such-rn-item' });
      question.value = 'apple';
      render(<DropdownQuestion question={question} creator={{}} />);
      await flush();
      act(() => {
        question.value = 'banana';
      });
      act(() => {
        (question as unknown as { allowClear: boolean }).allowClear = true;
      });
      await flush();
      expect(
        codes.filter((c) => c === 'dropdown-input-component-missing')
      ).toHaveLength(1);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });

  it('does NOT re-report on unmount/remount of the SAME question (module-scope dedup, r4 #3)', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const { question } = createDropdown({ itemComponent: 'no-such-rn-item' });
      question.value = 'apple';
      const first = render(
        <DropdownQuestion question={question} creator={{}} />
      );
      await flush();
      first.unmount();
      // Remount over the SAME core Question — an instance-local dedup map
      // would re-report here; the module-scoped map suppresses it.
      render(<DropdownQuestion question={question} creator={{}} />);
      await flush();
      expect(
        codes.filter((c) => c === 'dropdown-input-component-missing')
      ).toHaveLength(1);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });
});

describe('DropdownQuestion — popup bridge reconciles on prop swap (major #3)', () => {
  it('re-registers when the OverlayContext stack changes; the old stack keeps no entry', async () => {
    const { question } = createDropdown();
    const stackA = createOverlayStack<OverlayPayload>();
    const stackB = createOverlayStack<OverlayPayload>();
    const view = render(
      <OverlayContext.Provider value={stackA}>
        <DropdownQuestionElement question={question} creator={{}} />
      </OverlayContext.Provider>
    );
    await flush();
    view.rerender(
      <OverlayContext.Provider value={stackB}>
        <DropdownQuestionElement question={question} creator={{}} />
      </OverlayContext.Provider>
    );
    await flush();
    // Opening now targets the NEW stack, never the old one.
    fireEvent.press(screen.getByTestId('sv-dropdown-control'));
    expect(stackA.entries()).toHaveLength(0);
    expect(stackB.entries()).toHaveLength(1);
  });
});

describe('DropdownQuestion — render purity (2.5fu backport)', () => {
  it('constructs the lazy VM exactly once and NEVER during a render pass', async () => {
    const { question } = createDropdown();
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
    render(<DropdownQuestion question={question} creator={{}} />);
    // Mount (render + commit) reads only the non-creating backing field.
    expect(events).toEqual([]);
    // The deferred (microtask) ensure materializes OUTSIDE render and
    // outside the mount-commit window.
    await flush();
    expect(events).toEqual(['constructed-outside-render']);
    expect(screen.getByTestId('sv-dropdown-control')).toBeTruthy();
    await flush();
    expect(events).toHaveLength(1); // exactly once, ever
  });

  it('the one-microtask pre-materialization frame shows the question-level value text — never the select fallback, no diagnostic', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const { question } = createDropdown();
      question.value = 'banana';
      render(<DropdownQuestion question={question} creator={{}} />);
      // BEFORE the deferred ensure runs: the committed value renders
      // VM-free (selectedItemLocText is a question-level member), and the
      // frame is NOT the select-mode fallback (no spurious diagnostic).
      expect(screen.getByText('banana')).toBeTruthy();
      expect(screen.queryByTestId('sv-dropdown-select-fallback')).toBeNull();
      expect(codes).toHaveLength(0);
      await flush();
      // …then the real interactive control materializes.
      expect(screen.getByTestId('sv-dropdown-control')).toBeTruthy();
      expect(screen.getByText('banana')).toBeTruthy();
      expect(codes).toHaveLength(0);
    } finally {
      setDiagnosticHandler(undefined);
    }
  });

  it('the pending frame renders an EMPTY placeholder through the LocString viewer — not raw renderedHtml text (external review 2.5fu)', () => {
    const { question } = createDropdown();
    question.placeholder = 'Pick one';
    render(<DropdownQuestion question={question} creator={{}} />);
    // BEFORE the deferred ensure runs: the placeholder must be a
    // self-subscribing viewer (live onStringChanged / renderAs support),
    // never a raw Text of renderedHtml.
    expect(screen.getByTestId('sv-dropdown-placeholder')).toBeTruthy();
    expect(
      screen.UNSAFE_queryAllByType(SurveyLocStringViewer).length
    ).toBeGreaterThan(0);
    expect(screen.getByText('Pick one')).toBeTruthy();
  });
});

describe('DropdownQuestion — StrictMode lifecycle replay (2.5fu backport)', () => {
  it('the deferred ensure survives the StrictMode mount → simulated-unmount → remount replay on the SAME instance: the control still materializes', async () => {
    // React 19 StrictMode (dev) replays the class mount lifecycles on the
    // SAME instance (didMount → willUnmount → didMount): a one-way
    // `ensureUnmounted` latch never reset would leave the control on the
    // inert pending frame forever (mirror of external review C1).
    const { question } = createDropdown();
    render(
      <React.StrictMode>
        <DropdownQuestion question={question} creator={{}} />
      </React.StrictMode>
    );
    await flush();
    expect(
      (question as unknown as { dropdownListModelValue?: unknown })
        .dropdownListModelValue
    ).toBeDefined();
    expect(screen.getByTestId('sv-dropdown-control')).toBeTruthy();
  });

  it('the exact documented replay sequence (didMount → willUnmount → didMount before any microtask) does not latch the ensure machinery', async () => {
    // Belt-and-suspenders next to the StrictMode render above: drive the
    // documented sequence explicitly on the mounted instance so the test
    // stays decisive even if the harness's StrictMode timing changes.
    const { question } = createDropdown();
    render(<DropdownQuestion question={question} creator={{}} />);
    const instance = screen.UNSAFE_getByType(DropdownQuestion)
      .instance as DropdownQuestion;
    act(() => {
      instance.componentWillUnmount();
      instance.componentDidMount();
    });
    await flush();
    expect(
      (question as unknown as { dropdownListModelValue?: unknown })
        .dropdownListModelValue
    ).toBeDefined();
    expect(screen.getByTestId('sv-dropdown-control')).toBeTruthy();
  });
});

describe('DropdownQuestion — custom item component missing (minor #6)', () => {
  it('falls back to the selected value text + diagnostic when inputFieldComponentName is unregistered', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    try {
      const { question } = createDropdown({ itemComponent: 'no-such-rn-item' });
      question.value = 'apple';
      expect(
        (question as unknown as { showInputFieldComponent: boolean })
          .showInputFieldComponent
      ).toBe(true);
      render(<DropdownQuestion question={question} creator={{}} />);
      await flush();
      // Not an empty placeholder — the localized value text shows.
      expect(screen.getByText('apple')).toBeTruthy();
      expect(codes).toContain('dropdown-input-component-missing');
    } finally {
      setDiagnosticHandler(undefined);
    }
  });
});
