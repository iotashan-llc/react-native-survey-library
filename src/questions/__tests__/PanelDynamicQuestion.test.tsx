/**
 * `paneldynamic` question (task 2.8a) — LIST displayMode: stacked panels,
 * add-panel button, per-panel remove button (delete confirmation via the
 * merged 2.2 dialog adapter), empty-state placeholder. Carousel/tab/progress
 * are 2.8b/2.8c. Plan: docs/design/2.8a-paneldynamic-plan.md.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { PanelDynamicQuestion } from '../PanelDynamicQuestion';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';
import { registerDialogHost } from '../../overlay/dialog-adapter';
import {
  setDiagnosticHandler,
  type DiagnosticPayload,
} from '../../diagnostics';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Nested row elements defer one frame until onLayout measures the row
 * (SurveyRow 1.3-design D3). Fire a layout on every row so nested questions
 * render (mirrors SurveyPanel.test). */
function layoutRows(): void {
  act(() => {
    for (const row of screen.queryAllByTestId('sv-row')) {
      fireEvent(row, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 0 } },
      });
    }
  });
}

function createPaneldynamic(extra: Record<string, unknown> = {}) {
  const model = new Model({
    elements: [
      {
        type: 'paneldynamic',
        name: 'pd',
        templateElements: [
          { type: 'text', name: 'first' },
          { type: 'text', name: 'second' },
        ],
        panelCount: 2,
        ...extra,
      },
    ],
  });
  return { model, question: model.getQuestionByName('pd')! };
}

afterEach(() => setDiagnosticHandler(undefined));

describe('PanelDynamicQuestion — LIST render', () => {
  it('renders one SurveyPanel per renderedPanels entry, with nested questions', async () => {
    const { question } = createPaneldynamic();
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    // 2 panels, each a SurveyPanel wrapping the template's nested questions.
    const panels = (question as unknown as { renderedPanels: { id: string }[] })
      .renderedPanels;
    expect(panels).toHaveLength(2);
    expect(screen.getByTestId('paneldynamic-list')).toBeTruthy();
    expect(screen.getAllByTestId(/^paneldynamic-panel-/).length).toBe(2);
    // The nested template questions actually render (one 'first-input' per
    // panel) after the row measures — not just the panel wrappers.
    layoutRows();
    expect(screen.getAllByTestId('first-input')).toHaveLength(2);
  });

  it('non-list displayMode renders an unsupported fallback + a deferred diagnostic', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    const { question } = createPaneldynamic({ displayMode: 'carousel' });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByTestId('paneldynamic-mode-unsupported')).toBeTruthy();
    expect(screen.queryByTestId('paneldynamic-list')).toBeNull();
    expect(codes).toContain('paneldynamic-mode-unsupported');
  });
});

describe('PanelDynamicQuestion — add/remove', () => {
  it('the add button (canAddPanel) adds a panel via addPanelUI', async () => {
    const { question } = createPaneldynamic({ maxPanelCount: 5 });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    expect((question as unknown as { panelCount: number }).panelCount).toBe(2);
    fireEvent.press(screen.getByTestId('paneldynamic-add'));
    await flush();
    expect((question as unknown as { panelCount: number }).panelCount).toBe(3);
  });

  it('the add button is ABSENT at maxPanelCount (canAddPanel === false)', async () => {
    const { question } = createPaneldynamic({ maxPanelCount: 2 }); // already 2
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.queryByTestId('paneldynamic-add')).toBeNull();
  });

  it('a per-panel remove button is present when canRemovePanel, ABSENT at minPanelCount', async () => {
    const { question } = createPaneldynamic({ minPanelCount: 2 }); // at min
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.queryAllByTestId(/^paneldynamic-remove-/)).toHaveLength(0);
  });

  it('pressing a panel remove (no confirmDelete) removes that panel', async () => {
    const { question } = createPaneldynamic({ minPanelCount: 0 });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    const removes = screen.queryAllByTestId(/^paneldynamic-remove-/);
    expect(removes.length).toBe(2);
    fireEvent.press(removes[0]!);
    await flush();
    expect((question as unknown as { panelCount: number }).panelCount).toBe(1);
  });
});

describe('PanelDynamicQuestion — disabled-but-shown (enable* false)', () => {
  it('enableAddPanel false → add button present but disabled (press is a no-op)', async () => {
    const { question } = createPaneldynamic({
      maxPanelCount: 5,
      readOnly: false,
      allowAddPanel: true,
    });
    // Force the enabled-but-disabled state without hiding: enableAddPanel is
    // driven by enableIf-style gates; emulate via the property directly.
    (question as unknown as { enableAddPanel: boolean }).enableAddPanel = false;
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    const add = screen.getByTestId('paneldynamic-add');
    expect(add.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(add);
    await flush();
    expect((question as unknown as { panelCount: number }).panelCount).toBe(2);
  });
});

describe('PanelDynamicQuestion — confirmDelete via the RN dialog adapter', () => {
  it('the remove Pressable with confirmDelete routes through settings.showDialog (apply removes)', async () => {
    const stack = createOverlayStack<OverlayPayload>();
    const token = registerDialogHost(stack);
    try {
      const model = new Model({
        elements: [
          {
            type: 'paneldynamic',
            name: 'pd',
            confirmDelete: true,
            minPanelCount: 0,
            panelCount: 2,
            templateElements: [{ type: 'text', name: 'inner' }],
          },
        ],
      });
      const question = model.getQuestionByName('pd')!;
      // Confirm fires only for a non-empty panel value
      // (isRequireConfirmOnDelete).
      model.data = { pd: [{ inner: 'a' }, { inner: 'b' }] };
      render(<PanelDynamicQuestion question={question} creator={{}} />);
      await flush();
      const removes = screen.getAllByTestId(/^paneldynamic-remove-/);
      fireEvent.press(removes[0]!);
      await flush();
      // A confirmation dialog is queued (NOT an immediate removal).
      expect(stack.entries()).toHaveLength(1);
      expect((question as unknown as { panelCount: number }).panelCount).toBe(
        2
      );
      // Applying the dialog removes the panel.
      const payload = stack.entries()[0]!.payload;
      act(() => {
        payload.footerActions.getActionById('apply')!.action();
        payload.onDismissAcknowledged();
      });
      expect((question as unknown as { panelCount: number }).panelCount).toBe(
        1
      );
    } finally {
      token.dispose();
    }
  });
});

describe('PanelDynamicQuestion — model retarget (r major #2)', () => {
  it('swapping the question prop rebinds callbacks; the OLD question no longer drives', async () => {
    const a = createPaneldynamic({ maxPanelCount: 5 }).question;
    const b = createPaneldynamic({ maxPanelCount: 5, panelCount: 3 }).question;
    const view = render(<PanelDynamicQuestion question={a} creator={{}} />);
    await flush();
    expect(screen.getAllByTestId(/^paneldynamic-panel-/).length).toBe(2);
    // Retarget to b (3 panels).
    view.rerender(<PanelDynamicQuestion question={b} creator={{}} />);
    await flush();
    expect(screen.getAllByTestId(/^paneldynamic-panel-/).length).toBe(3);
    // The OLD question's callback must be detached — its structural change no
    // longer re-renders this component (guarded clear).
    expect(
      (a as unknown as { panelCountChangedCallback?: () => void })
        .panelCountChangedCallback
    ).toBeUndefined();
    // The NEW question is wired.
    expect(
      (b as unknown as { panelCountChangedCallback?: () => void })
        .panelCountChangedCallback
    ).toBeDefined();
    view.unmount();
    // Unmount detaches b too (no setState-after-unmount).
    expect(
      (b as unknown as { panelCountChangedCallback?: () => void })
        .panelCountChangedCallback
    ).toBeUndefined();
  });
});

describe('PanelDynamicQuestion — empty state', () => {
  it('with 0 panels renders the empty placeholder + an add button', async () => {
    const { question } = createPaneldynamic({
      panelCount: 0,
      minPanelCount: 0,
    });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByTestId('paneldynamic-empty')).toBeTruthy();
    expect(screen.getByTestId('paneldynamic-add')).toBeTruthy();
  });
});

describe('PanelDynamicQuestion — collapse (panelsState, r major #1)', () => {
  it('default panelsState: panels are expanded, NO toggle (content always shown)', async () => {
    const { question } = createPaneldynamic({ templateTitle: 'Item' });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.queryAllByTestId(/^paneldynamic-toggle-/)).toHaveLength(0);
    // nested content is present (a SurveyPanel content region renders).
    expect(screen.getAllByTestId('sv-panel-content').length).toBeGreaterThan(0);
  });

  it('collapsed panels get a toggle that expands them (content becomes reachable)', async () => {
    const { question } = createPaneldynamic({
      templateTitle: 'Item',
      panelsState: 'collapsed',
    });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    // collapsed → SurveyPanel hides its content; a toggle exists per panel.
    expect(screen.queryByTestId('sv-panel-content')).toBeNull();
    const toggles = screen.getAllByTestId(/^paneldynamic-toggle-/);
    expect(toggles).toHaveLength(2);
    // pressing a toggle expands that panel → its content becomes reachable.
    fireEvent.press(toggles[0]!);
    await flush();
    expect(screen.getAllByTestId('sv-panel-content').length).toBe(1);
  });

  it('firstExpanded: first panel expanded, rest collapsed-with-toggle', async () => {
    const { question } = createPaneldynamic({
      templateTitle: 'Item',
      panelsState: 'firstExpanded',
    });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    // one panel's content is shown; both panels are collapsible → 2 toggles.
    expect(screen.getAllByTestId('sv-panel-content').length).toBe(1);
    expect(screen.getAllByTestId(/^paneldynamic-toggle-/)).toHaveLength(2);
  });
});

describe('PanelDynamicQuestion — reactivity', () => {
  it('an external addPanel re-renders (panelCountChangedCallback → setState)', async () => {
    const { question } = createPaneldynamic({ maxPanelCount: 5 });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getAllByTestId(/^paneldynamic-panel-/).length).toBe(2);
    act(() => {
      (question as unknown as { addPanel: () => void }).addPanel();
    });
    await flush();
    expect(screen.getAllByTestId(/^paneldynamic-panel-/).length).toBe(3);
  });

  it('an EXTERNAL panel collapse re-renders that item (content hidden) — major #1', async () => {
    const { question } = createPaneldynamic({
      templateTitle: 'Item',
      panelsState: 'expanded',
    });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getAllByTestId('sv-panel-content').length).toBe(2);
    // Collapse the first panel PROGRAMMATICALLY (survey-core emits on the
    // PanelModel, not the question). The per-panel item subscribes the panel,
    // so it re-renders and hides content — no stranded inputs.
    act(() => {
      (
        question as unknown as { renderedPanels: { collapse(): void }[] }
      ).renderedPanels[0]!.collapse();
    });
    await flush();
    expect(screen.getAllByTestId('sv-panel-content').length).toBe(1);
  });

  it('changing panelAddText re-renders with a fresh a11y label (loc subscription) — major #3', async () => {
    const { question } = createPaneldynamic({ maxPanelCount: 5 });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    act(() => {
      (question as unknown as { panelAddText: string }).panelAddText =
        'Add another';
    });
    await flush();
    expect(
      screen.getByTestId('paneldynamic-add').props.accessibilityLabel
    ).toBe('Add another');
  });

  it('a same-mode retarget re-emits the diagnostic for the new question — minor #4', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    const a = createPaneldynamic({ displayMode: 'carousel' }).question;
    const b = createPaneldynamic({ displayMode: 'carousel' }).question;
    const view = render(<PanelDynamicQuestion question={a} creator={{}} />);
    await flush();
    view.rerender(<PanelDynamicQuestion question={b} creator={{}} />);
    await flush();
    // Dedup is reset on retarget → both A and B emit (not suppressed by mode).
    expect(
      codes.filter((c) => c === 'paneldynamic-mode-unsupported')
    ).toHaveLength(2);
  });

  it('editing same-named nested fields writes to the correct array slot — major #2', async () => {
    const { question } = createPaneldynamic();
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    layoutRows();
    // Each panel renders the template's 'first' text field → one input each.
    const inputs = screen.getAllByTestId('first-input');
    expect(inputs).toHaveLength(2);
    act(() => {
      fireEvent.changeText(inputs[0]!, 'alpha');
      fireEvent(inputs[0]!, 'blur');
    });
    act(() => {
      fireEvent.changeText(inputs[1]!, 'beta');
      fireEvent(inputs[1]!, 'blur');
    });
    const value = JSON.parse(
      JSON.stringify((question as unknown as { value: unknown }).value)
    ) as { first?: string }[];
    // Slot-isolated: panel 0's edit lands in value[0], panel 1's in value[1] —
    // the renderer never touches panel values (panel.data proxies them).
    expect(value[0]?.first).toBe('alpha');
    expect(value[1]?.first).toBe('beta');
  });

  it('panel keys are panel.id — id-keyed items survive a middle insertion — major #2', async () => {
    const { question } = createPaneldynamic({ maxPanelCount: 5 });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    const ids = (
      question as unknown as { renderedPanels: { id: string | number }[] }
    ).renderedPanels.map((p) => String(p.id));
    expect(ids).toHaveLength(2);
    ids.forEach((id) =>
      expect(screen.getByTestId(`paneldynamic-panel-${id}`)).toBeTruthy()
    );
    // Insert a panel in the MIDDLE (external addPanel(index)).
    act(() => {
      (question as unknown as { addPanel: (i: number) => void }).addPanel(1);
    });
    await flush();
    // The original panels keep their id-keyed items (identity preserved, not
    // shifted by index — draft/native state stays with the same PanelModel).
    ids.forEach((id) =>
      expect(screen.getByTestId(`paneldynamic-panel-${id}`)).toBeTruthy()
    );
    expect(screen.getAllByTestId(/^paneldynamic-panel-/).length).toBe(3);
  });

  it('an uncommitted draft stays with its PanelModel across a front insertion (panel.id keys, not index) — major #2', async () => {
    const { question } = createPaneldynamic({ maxPanelCount: 5 });
    render(<PanelDynamicQuestion question={question} creator={{}} />);
    await flush();
    layoutRows();
    const panels = (
      question as unknown as { renderedPanels: { id: string | number }[] }
    ).renderedPanels;
    const secondId = String(panels[1]!.id);
    // Uncommitted draft (changeText, no blur) in the SECOND panel's input.
    const input2 = within(
      screen.getByTestId(`paneldynamic-panel-${secondId}`)
    ).getByTestId('first-input');
    act(() => {
      fireEvent.changeText(input2, 'DRAFT');
    });
    expect(input2.props.value).toBe('DRAFT');
    // Insert a panel at the FRONT (indices shift; panel.id stays). With index
    // keys React would retarget components and the draft would move; with
    // panel.id keys the draft stays with the SAME PanelModel.
    act(() => {
      (question as unknown as { addPanel: (i: number) => void }).addPanel(0);
    });
    await flush();
    layoutRows();
    const stillInput2 = within(
      screen.getByTestId(`paneldynamic-panel-${secondId}`)
    ).getByTestId('first-input');
    expect(stillInput2.props.value).toBe('DRAFT');
  });
});
