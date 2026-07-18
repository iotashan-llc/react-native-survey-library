/**
 * `paneldynamic` question (task 2.8a) — LIST displayMode: stacked panels,
 * add-panel button, per-panel remove button (delete confirmation via the
 * merged 2.2 dialog adapter), empty-state placeholder. Carousel/tab/progress
 * are 2.8b/2.8c. Plan: docs/design/2.8a-paneldynamic-plan.md.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { PanelDynamicQuestion } from '../PanelDynamicQuestion';
import {
  setDiagnosticHandler,
  type DiagnosticPayload,
} from '../../diagnostics';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
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
    // nested text inputs from the template appear (name-derived testIDs from
    // the text question renderer); assert the panel containers exist.
    expect(screen.getByTestId('paneldynamic-list')).toBeTruthy();
    expect(screen.getAllByTestId(/^paneldynamic-panel-/).length).toBe(2);
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
});
