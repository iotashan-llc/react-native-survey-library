/**
 * `slider` question (task 4.4) — RN port of survey-react-ui's
 * `SurveyQuestionSlider` (reactquestion_slider.tsx). Value math is driven
 * ENTIRELY through the core model (setSliderValue / getClosestToStepValue /
 * ensureMin+MaxRangeBorders) so value/events stay 100% core-correct — the
 * renderer never reimplements clamping, step-snapping, or range-spacing
 * (invariant 6).
 *
 * SINGLE mode renders the batteries-included `@react-native-community/slider`
 * (native, single-thumb) — here through its root manual mock
 * (`__mocks__/@react-native-community/slider.tsx`) so onValueChange (visual
 * draft) / onSlidingComplete (commit) are unit-testable. RANGE mode is a
 * custom dual-thumb track: the fine drag is a documented DEVICE GATE
 * (gesture-handler Pan, absent in jest), so these suites lock the a11y
 * adjustable steppers that make range fully operable without drag, plus the
 * model-driven allowSwap/spacing enforcement.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { SliderQuestion, loadSliderLib } from '../SliderQuestion';
import { RNQuestionFactory } from '../../factories/QuestionFactory';
import { UnsupportedQuestion } from '../../components/UnsupportedQuestion';
import { resolveQuestionDispatchKey } from '../../factories/dispatch-key';

function makeSlider(extra: Record<string, unknown> = {}, name = 'r'): Question {
  const model = new Model({
    elements: [{ type: 'slider', name, ...extra }],
  });
  return model.getQuestionByName(name)!;
}

function renderSlider(question: Question) {
  return render(<SliderQuestion question={question} creator={{}} />);
}

/** survey-core value arrays are not plain `Array` instances (toEqual reports
 * "serializes to the same string") — compare the spread copy. */
function vals(question: Question): unknown[] {
  return Array.from((question.value ?? []) as unknown[]);
}

describe('slider — dispatch (supported, never the fallback)', () => {
  it('resolves the "slider" dispatch key and a real registered component', () => {
    const question = makeSlider();
    expect(resolveQuestionDispatchKey(question)).toBe('slider');
    const element = RNQuestionFactory.createQuestion('slider', {
      question,
      creator: {},
    });
    expect(element).not.toBeNull();
    expect(element!.type).not.toBe(UnsupportedQuestion);
  });
});

describe('slider — single mode (community slider, lazy-required)', () => {
  it('renders the community slider input, not the unsupported fallback', () => {
    expect(loadSliderLib()).not.toBeNull();
    const question = makeSlider();
    renderSlider(question);
    expect(screen.getByTestId('sv-slider-r')).toBeTruthy();
    expect(screen.getByTestId('sv-slider-input-r')).toBeTruthy();
    expect(screen.queryByTestId('unsupported-question-panel')).toBeNull();
    expect(screen.queryByTestId('sv-slider-stepper-r')).toBeNull();
  });

  it('onValueChange drafts a VISUAL value only — the model value is not committed', () => {
    const question = makeSlider();
    expect(question.isEmpty()).toBe(true);
    renderSlider(question);
    fireEvent(screen.getByTestId('sv-slider-input-r'), 'valueChange', 42);
    // Draft is visual only — nothing committed to the model.
    expect(question.isEmpty()).toBe(true);
  });

  it('onSlidingComplete commits the step-snapped value through the model', () => {
    const question = makeSlider();
    renderSlider(question);
    fireEvent(screen.getByTestId('sv-slider-input-r'), 'slidingComplete', 42);
    expect(question.value).toBe(42);
  });

  it('clamps a commit above max / below min through the core model (validation)', () => {
    const question = makeSlider({ min: 10, max: 20 });
    renderSlider(question);
    fireEvent(screen.getByTestId('sv-slider-input-r'), 'slidingComplete', 50);
    expect(question.value).toBe(20);
    fireEvent(screen.getByTestId('sv-slider-input-r'), 'slidingComplete', -5);
    expect(question.value).toBe(10);
  });

  it('snaps a commit to the step interval', () => {
    const question = makeSlider({ min: 0, max: 100, step: 10 });
    renderSlider(question);
    fireEvent(screen.getByTestId('sv-slider-input-r'), 'slidingComplete', 47);
    expect(question.value).toBe(50);
  });

  it('read-only disables the slider and blocks the commit', () => {
    const question = makeSlider({ readOnly: true });
    renderSlider(question);
    expect(screen.getByTestId('sv-slider-input-r').props.disabled).toBe(true);
    fireEvent(screen.getByTestId('sv-slider-input-r'), 'slidingComplete', 42);
    expect(question.isEmpty()).toBe(true);
  });
});

describe('slider — range mode (custom dual-thumb, a11y adjustable)', () => {
  it('renders two thumbs with adjustable a11y, not the fallback', () => {
    const question = makeSlider({ sliderType: 'range' });
    renderSlider(question);
    expect(screen.getByTestId('sv-slider-r')).toBeTruthy();
    const t0 = screen.getByTestId('sv-slider-thumb-r-0');
    const t1 = screen.getByTestId('sv-slider-thumb-r-1');
    expect(t0.props.accessibilityRole).toBe('adjustable');
    expect(t1.props.accessibilityRole).toBe('adjustable');
    expect(screen.queryByTestId('unsupported-question-panel')).toBeNull();
    // no community single-thumb input in range mode
    expect(screen.queryByTestId('sv-slider-input-r')).toBeNull();
  });

  it('increment/decrement on a thumb updates [lo,hi] through the model', () => {
    const question = makeSlider({ sliderType: 'range' });
    act(() => {
      question.value = [20, 80];
    });
    renderSlider(question);
    fireEvent.press(screen.getByTestId('sv-slider-thumb-inc-r-0'));
    expect(vals(question)).toEqual([21, 80]);
    fireEvent.press(screen.getByTestId('sv-slider-thumb-dec-r-1'));
    expect(vals(question)).toEqual([21, 79]);
  });

  it('honors allowSwap:false — a thumb cannot cross its neighbor', () => {
    const question = makeSlider({ sliderType: 'range', allowSwap: false });
    act(() => {
      question.value = [78, 80];
    });
    renderSlider(question);
    fireEvent.press(screen.getByTestId('sv-slider-thumb-inc-r-0'));
    expect(vals(question)).toEqual([79, 80]);
    // Second increment would reach/cross thumb 1 — blocked by the model.
    fireEvent.press(screen.getByTestId('sv-slider-thumb-inc-r-0'));
    expect(vals(question)).toEqual([79, 80]);
  });

  it('read-only blocks the range steppers (value unchanged)', () => {
    const question = makeSlider({ sliderType: 'range', readOnly: true });
    act(() => {
      question.value = [20, 80];
    });
    renderSlider(question);
    fireEvent.press(screen.getByTestId('sv-slider-thumb-inc-r-0'));
    expect(vals(question)).toEqual([20, 80]);
    expect(
      screen.getByTestId('sv-slider-thumb-inc-r-0').props.accessibilityState
        ?.disabled
    ).toBe(true);
  });
});

describe('slider — 4.4 review findings', () => {
  // Finding 1 — range thumbs promise accessibilityRole="adjustable" but must
  // also wire the native adjust actions so VoiceOver/TalkBack swipe-to-adjust
  // drives the SAME model path as the visible +/- steppers.
  it('range thumbs declare increment/decrement accessibilityActions per thumb', () => {
    const question = makeSlider({ sliderType: 'range' });
    renderSlider(question);
    for (const id of ['sv-slider-thumb-r-0', 'sv-slider-thumb-r-1']) {
      const thumb = screen.getByTestId(id);
      expect(thumb.props.accessibilityActions).toEqual([
        { name: 'increment' },
        { name: 'decrement' },
      ]);
      expect(typeof thumb.props.onAccessibilityAction).toBe('function');
    }
  });

  it('firing increment/decrement accessibilityActions on a thumb steps the value through the model', () => {
    const question = makeSlider({ sliderType: 'range' });
    act(() => {
      question.value = [20, 80];
    });
    renderSlider(question);
    fireEvent(
      screen.getByTestId('sv-slider-thumb-r-0'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'increment' },
      }
    );
    expect(vals(question)).toEqual([21, 80]);
    fireEvent(
      screen.getByTestId('sv-slider-thumb-r-1'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'decrement' },
      }
    );
    expect(vals(question)).toEqual([21, 79]);
  });

  it('accessibilityAction respects read-only (value unchanged)', () => {
    const question = makeSlider({ sliderType: 'range', readOnly: true });
    act(() => {
      question.value = [20, 80];
    });
    renderSlider(question);
    fireEvent(
      screen.getByTestId('sv-slider-thumb-r-0'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'increment' },
      }
    );
    expect(vals(question)).toEqual([20, 80]);
  });

  // Finding 2 — allowSwap defaults to true in core; per handleOnChange the
  // min-range border (crossing block) is only enforced when !allowSwap, and
  // handlePointerUp reorders (sorts) the value array so a crossing thumb swaps.
  it('allowSwap:true (default) lets a thumb cross its neighbor — the value array reorders', () => {
    const question = makeSlider({ sliderType: 'range' }, 'sw');
    act(() => {
      question.value = [79, 80];
    });
    renderSlider(question);
    // First increment: low thumb meets the high thumb (permitted with swap).
    fireEvent.press(screen.getByTestId('sv-slider-thumb-inc-sw-0'));
    expect(vals(question)).toEqual([80, 80]);
    // Second increment: it crosses past — the array reorders (swap).
    fireEvent.press(screen.getByTestId('sv-slider-thumb-inc-sw-0'));
    expect(vals(question)).toEqual([80, 81]);
  });

  it('allowSwap:false keeps the clamp (thumbs cannot meet or cross)', () => {
    const question = makeSlider(
      { sliderType: 'range', allowSwap: false },
      'ns'
    );
    act(() => {
      question.value = [79, 80];
    });
    renderSlider(question);
    fireEvent.press(screen.getByTestId('sv-slider-thumb-inc-ns-0'));
    expect(vals(question)).toEqual([79, 80]);
  });

  // Finding 3 — single-mode tooltip must track the DRAFT during drag, not the
  // last committed value (getTooltipValue reads renderedValue).
  it('single-mode tooltip text follows the draft during drag', () => {
    const question = makeSlider({ min: 0, max: 100, step: 1 });
    renderSlider(question);
    fireEvent(screen.getByTestId('sv-slider-input-r'), 'valueChange', 42);
    const tooltip = screen.getByTestId('sv-slider-tooltip-r-0');
    expect(within(tooltip).getByText('42')).toBeTruthy();
  });

  // Finding 4 — single-mode tooltip bubble centers over the thumb.
  it('single-mode tooltip is horizontally centered over the thumb (translateX -50%)', () => {
    const question = makeSlider();
    renderSlider(question);
    fireEvent(screen.getByTestId('sv-slider-input-r'), 'valueChange', 42);
    const tooltip = screen.getByTestId('sv-slider-tooltip-r-0');
    const flat = StyleSheet.flatten(tooltip.props.style);
    expect(flat.transform).toEqual([{ translateX: '-50%' }]);
  });
});

describe('slider — labels + tooltip', () => {
  it('renders scale labels when showLabels (default), hides them when false', () => {
    const question = makeSlider();
    const { rerender } = renderSlider(question);
    expect(screen.getByTestId('sv-slider-label-r-0')).toBeTruthy();
    expect(screen.getByTestId('sv-slider-label-r-5')).toBeTruthy();

    const hidden = makeSlider({ showLabels: false }, 'h');
    rerender(<SliderQuestion question={hidden} creator={{}} />);
    expect(screen.queryByTestId('sv-slider-label-h-0')).toBeNull();
  });

  it('tooltipVisibility "always" shows the thumb tooltip; "never" hides it', () => {
    const shown = makeSlider(
      { sliderType: 'range', tooltipVisibility: 'always' },
      'shw'
    );
    act(() => {
      shown.value = [20, 80];
    });
    const { rerender } = renderSlider(shown);
    expect(screen.getByTestId('sv-slider-tooltip-shw-0')).toBeTruthy();

    const hidden = makeSlider(
      { sliderType: 'range', tooltipVisibility: 'never' },
      'hid'
    );
    act(() => {
      hidden.value = [20, 80];
    });
    rerender(<SliderQuestion question={hidden} creator={{}} />);
    expect(screen.queryByTestId('sv-slider-tooltip-hid-0')).toBeNull();
  });
});
