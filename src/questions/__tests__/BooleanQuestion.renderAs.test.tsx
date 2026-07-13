/**
 * `BooleanQuestion`'s `checkbox`/`radio` renderAs modes — task 1.13.
 * Mirrors survey-react-ui's `SurveyQuestionBooleanCheckbox`/
 * `SurveyQuestionBooleanRadio` (boolean-checkbox.tsx / boolean-radio.tsx),
 * each registered against survey-core's `RendererFactory` under
 * `("boolean", "checkbox") -> "sv-boolean-checkbox"` and
 * `("boolean", "radio") -> "sv-boolean-radio"`
 * (question.getComponentName() resolves to these when `renderAs` is set —
 * verified against survey-core source, mirrored in
 * src/factories/descriptors.ts).
 *
 * Styled via the 0.7 `item` recipe (checkbox/radio choice-item shape) —
 * theme tokens flow through `SurveyThemeContext`, same as any other
 * themed component (no bespoke boolean-only styling).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Model, RendererFactory } from '../../core/facade';
import type { Question } from '../../core/facade';
// Side-effect import: exercises the REAL registrar (descriptors.ts's
// "sv-boolean-checkbox"/"sv-boolean-radio" rows), which is what actually
// wires `("boolean", renderAs)` into the shared `RendererFactory.Instance`
// singleton — without this, `question.getComponentName()`/`getRenderer()`
// below would never resolve past "default".
import '../../factories/register-all';
import {
  BooleanCheckboxQuestion,
  BooleanRadioQuestion,
} from '../BooleanQuestion';

function createBooleanQuestion(
  name: string,
  renderAs: 'checkbox' | 'radio',
  extra: Record<string, unknown> = {}
): { model: Model; question: Question } {
  const model = new Model({
    elements: [{ type: 'boolean', name, renderAs, ...extra }],
  });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return { model, question };
}

describe('BooleanCheckboxQuestion (renderAs "checkbox")', () => {
  it('dispatches to "sv-boolean-checkbox" via RendererFactory when renderAs="checkbox" (upstream-mirrored key)', () => {
    const { question } = createBooleanQuestion('qc0', 'checkbox');
    expect(question.isDefaultRendering()).toBe(false);
    expect(question.getComponentName()).toBe('sv-boolean-checkbox');
    expect(RendererFactory.Instance.getRenderer('boolean', 'checkbox')).toBe(
      'sv-boolean-checkbox'
    );
  });

  it('renders unchecked by default, title as label', () => {
    const { question } = createBooleanQuestion('qc1', 'checkbox');
    question.title = 'Accept terms';
    render(<BooleanCheckboxQuestion question={question} creator={{}} />);
    expect(screen.getByTestId('sv-boolean-checkbox-qc1')).toBeTruthy();
    expect(screen.getByText('Accept terms')).toBeTruthy();
  });

  it('pressing toggles booleanValue and re-renders checked', () => {
    const { question } = createBooleanQuestion('qc2', 'checkbox');
    render(<BooleanCheckboxQuestion question={question} creator={{}} />);
    const box = screen.getByTestId('sv-boolean-checkbox-qc2');
    expect(box.props.accessibilityState?.checked).toBe('mixed');

    // `Pressable` consumes `onPress` internally (usePressability) and
    // spreads only low-level responder handlers onto the host View — the
    // queried host node has no `onPress` prop of its own. `fireEvent`
    // walks up to the composite `<Pressable onPress=...>` element, which
    // DOES carry it (documented RTL-RN mechanism).
    fireEvent.press(box);
    expect(question.booleanValue).toBe(true);
    expect(
      screen.getByTestId('sv-boolean-checkbox-qc2').props.accessibilityState
        ?.checked
    ).toBe(true);

    fireEvent.press(screen.getByTestId('sv-boolean-checkbox-qc2'));
    expect(question.booleanValue).toBe(false);
  });

  it('does not toggle when read-only', () => {
    const { question } = createBooleanQuestion('qc3', 'checkbox');
    question.readOnly = true;
    render(<BooleanCheckboxQuestion question={question} creator={{}} />);
    const box = screen.getByTestId('sv-boolean-checkbox-qc3');
    fireEvent.press(box);
    expect(question.booleanValue).toBeNull();
  });
});

describe('BooleanRadioQuestion (renderAs "radio")', () => {
  it('dispatches to "sv-boolean-radio" via RendererFactory when renderAs="radio" (upstream-mirrored key)', () => {
    const { question } = createBooleanQuestion('qr0', 'radio');
    expect(question.isDefaultRendering()).toBe(false);
    expect(question.getComponentName()).toBe('sv-boolean-radio');
    expect(RendererFactory.Instance.getRenderer('boolean', 'radio')).toBe(
      'sv-boolean-radio'
    );
  });

  it('renders two radio items (False, True order by default) and selects the one the value equals', () => {
    const { question } = createBooleanQuestion('qr1', 'radio', {
      labelTrue: 'On',
      labelFalse: 'Off',
    });
    render(<BooleanRadioQuestion question={question} creator={{}} />);
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
    expect(
      screen.getByTestId('sv-boolean-radio-qr1-false').props.accessibilityState
        ?.checked
    ).toBe(false);
    expect(
      screen.getByTestId('sv-boolean-radio-qr1-true').props.accessibilityState
        ?.checked
    ).toBe(false);
  });

  it('pressing the "true" item sets value to getValueTrue() and re-renders selection', () => {
    const { question } = createBooleanQuestion('qr2', 'radio');
    render(<BooleanRadioQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-boolean-radio-qr2-true'));
    expect(question.value).toBe(true);
    expect(
      screen.getByTestId('sv-boolean-radio-qr2-true').props.accessibilityState
        ?.checked
    ).toBe(true);
    expect(
      screen.getByTestId('sv-boolean-radio-qr2-false').props.accessibilityState
        ?.checked
    ).toBe(false);
  });
});
