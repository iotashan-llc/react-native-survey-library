/**
 * `slider` single-mode fallback (task 4.4): when the batteries-included
 * `@react-native-community/slider` peer is ABSENT, the single-thumb slider
 * degrades to a NON-THROWING accessible +/- stepper (Layer 1) that commits
 * through the SAME core model primitive (`setSliderValue`) — a consumer who
 * has not installed the peer still gets an operable, screen-reader-friendly
 * control instead of a crash (invariant 9).
 *
 * The absence is simulated by mocking the module to an object with no
 * component export, which the lazy `loadSliderLib()` resolves to `null`
 * (its try/catch also covers a hard MODULE_NOT_FOUND for a truly
 * uninstalled peer). A separate file keeps the per-file module registry —
 * and thus `loadSliderLib`'s memoized cache — isolated from the
 * community-slider-present suite.
 */
jest.mock('@react-native-community/slider', () => ({ __esModule: true }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { SliderQuestion, loadSliderLib } from '../SliderQuestion';

function makeSlider(extra: Record<string, unknown> = {}, name = 'r'): Question {
  const model = new Model({ elements: [{ type: 'slider', name, ...extra }] });
  return model.getQuestionByName(name)!;
}

describe('slider — single fallback when the community slider is absent', () => {
  it('loadSliderLib() resolves null with no usable component export', () => {
    expect(loadSliderLib()).toBeNull();
  });

  it('renders the accessible +/- stepper (not the community input, no throw)', () => {
    const question = makeSlider();
    expect(() =>
      render(<SliderQuestion question={question} creator={{}} />)
    ).not.toThrow();
    expect(screen.getByTestId('sv-slider-stepper-r')).toBeTruthy();
    expect(screen.queryByTestId('sv-slider-input-r')).toBeNull();
    expect(screen.queryByTestId('unsupported-question-panel')).toBeNull();
  });

  it('the stepper commits step-snapped values through the core model', () => {
    const question = makeSlider({ min: 0, max: 100, step: 10 });
    render(<SliderQuestion question={question} creator={{}} />);
    fireEvent.press(screen.getByTestId('sv-slider-stepper-inc-r'));
    expect(question.value).toBe(10);
    fireEvent.press(screen.getByTestId('sv-slider-stepper-inc-r'));
    expect(question.value).toBe(20);
    fireEvent.press(screen.getByTestId('sv-slider-stepper-dec-r'));
    expect(question.value).toBe(10);
  });
});
