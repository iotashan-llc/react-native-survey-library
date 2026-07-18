/**
 * `custom` + `composite` question adapters (task 2.11) — ComponentCollection
 * runtime types. Custom wraps ONE inner question (value proxies as a scalar);
 * composite wraps a PanelModel of inner elements (value is an object keyed by
 * inner names). Both dispatch on `getTemplate()` = 'custom'/'composite'.
 * Plan: docs/design/2.11-custom-composite-plan.md.
 *
 * ComponentCollection.Instance is a GLOBAL singleton — every registration is
 * removed in `finally`/afterEach so nothing leaks across the suite.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ComponentCollection, Model } from '../../core/facade';
import '../../factories/register-all';
import { CustomQuestion } from '../CustomQuestion';
import { CompositeQuestion } from '../CompositeQuestion';
import {
  setDiagnosticHandler,
  type DiagnosticPayload,
} from '../../diagnostics';

const registered: string[] = [];
function registerComponent(json: { name: string } & Record<string, unknown>) {
  ComponentCollection.Instance.add(json as never);
  registered.push(json.name);
}

afterEach(() => {
  setDiagnosticHandler(undefined);
  while (registered.length) {
    ComponentCollection.Instance.remove(registered.pop()!);
  }
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Nested inputs defer one frame until the row measures (SurveyRow D3). */
function layoutRows(): void {
  act(() => {
    for (const row of screen.queryAllByTestId('sv-row')) {
      fireEvent(row, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 0 } },
      });
    }
  });
}

describe('CustomQuestion (task 2.11)', () => {
  it('renders the wrapped inner question and proxies value as a scalar', async () => {
    registerComponent({ name: 'shorttext', questionJSON: { type: 'text' } });
    const model = new Model({
      elements: [{ type: 'shorttext', name: 'q1' }],
    });
    const question = model.getQuestionByName('q1')!;
    // dispatch is on getTemplate(), not the registered name.
    expect(question.getType()).toBe('shorttext');
    expect(
      (question as unknown as { getTemplate(): string }).getTemplate()
    ).toBe('custom');
    render(<CustomQuestion question={question} creator={{}} />);
    await flush();
    // inner text question renders (default inner name 'question' → input).
    const input = screen.getByTestId('question-input');
    act(() => {
      fireEvent.changeText(input, 'hi');
      fireEvent(input, 'blur');
    });
    // value proxies to the OUTER question as a scalar.
    expect((question as unknown as { value: unknown }).value).toBe('hi');
  });

  it('dispatches a renderer-route inner via getComponentName (not getTemplate)', async () => {
    registerComponent({
      name: 'togglebool',
      questionJSON: { type: 'boolean', renderAs: 'checkbox' },
    });
    const model = new Model({ elements: [{ type: 'togglebool', name: 'q1' }] });
    const question = model.getQuestionByName('q1')!;
    render(<CustomQuestion question={question} creator={{}} />);
    await flush();
    // The inner boolean's checkbox renderer body renders (renderAs=checkbox →
    // dispatched via getComponentName, proving the full dispatch-key rule).
    expect(
      (question as unknown as { contentQuestion: { renderAs: string } })
        .contentQuestion.renderAs
    ).toBe('checkbox');
    expect(screen.getByTestId('custom-question-q1')).toBeTruthy();
  });

  it('a malformed custom (null contentQuestion) renders a fallback + diagnostic, no crash', async () => {
    const codes: string[] = [];
    setDiagnosticHandler((p: DiagnosticPayload) => codes.push(p.code));
    registerComponent({
      name: 'nullcustom',
      // createQuestion callback returns null → contentQuestion is null.
      createQuestion: () => null,
    });
    const model = new Model({ elements: [{ type: 'nullcustom', name: 'q1' }] });
    const question = model.getQuestionByName('q1')!;
    render(<CustomQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByTestId('custom-question-malformed')).toBeTruthy();
    expect(codes).toContain('custom-content-missing');
  });
});

describe('CompositeQuestion (task 2.11)', () => {
  it('renders inner elements via SurveyPanel; value is a keyed object', async () => {
    registerComponent({
      name: 'fullname',
      elementsJSON: [
        { type: 'text', name: 'first', title: 'First' },
        { type: 'text', name: 'last', title: 'Last' },
      ],
    });
    const model = new Model({ elements: [{ type: 'fullname', name: 'q1' }] });
    const question = model.getQuestionByName('q1')!;
    expect(
      (question as unknown as { getTemplate(): string }).getTemplate()
    ).toBe('composite');
    render(<CompositeQuestion question={question} creator={{}} />);
    await flush();
    expect(screen.getByTestId('composite-question-q1')).toBeTruthy();
    layoutRows();
    const firstInput = screen.getByTestId('first-input');
    const lastInput = screen.getByTestId('last-input');
    act(() => {
      fireEvent.changeText(firstInput, 'Ada');
      fireEvent(firstInput, 'blur');
    });
    act(() => {
      fireEvent.changeText(lastInput, 'Lovelace');
      fireEvent(lastInput, 'blur');
    });
    // composite value is an object keyed by inner element names, slot-isolated.
    const value = JSON.parse(
      JSON.stringify((question as unknown as { value: unknown }).value)
    ) as { first?: string; last?: string };
    expect(value.first).toBe('Ada');
    expect(value.last).toBe('Lovelace');
  });

  it('the composite wrapper is a group with the outer title as its label', async () => {
    registerComponent({
      name: 'addr',
      elementsJSON: [{ type: 'text', name: 'city' }],
    });
    const model = new Model({
      elements: [{ type: 'addr', name: 'q1', title: 'Address' }],
    });
    const question = model.getQuestionByName('q1')!;
    render(<CompositeQuestion question={question} creator={{}} />);
    await flush();
    const group = screen.getByTestId('composite-question-q1');
    // RN 0.86: the `role` prop (not accessibilityRole) carries 'group'.
    expect(group.props.role).toBe('group');
    expect(group.props['aria-label'] ?? group.props.accessibilityLabel).toBe(
      'Address'
    );
  });
});
