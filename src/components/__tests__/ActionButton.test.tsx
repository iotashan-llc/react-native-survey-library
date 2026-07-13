/**
 * ActionButton contract (design: docs/design/1.5-icon-actionbutton.md,
 * "ActionButton"): SurveyElementBase (0.4) binding to the core Action
 * model, Pressable + the 0.7 button recipe (container/text style
 * partition), RNIcon integration, DOM-shaped doAction event shim, a11y
 * from the model's aria members.
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Action } from '../../core/facade';
import type { IAction } from '../../core/facade';
import { ActionButton, partitionButtonStyles } from '../ActionButton';
import { SurveyThemeProvider } from '../../theme-rn/provider';

function makeAction(overrides: Partial<IAction> = {}): Action {
  return new Action({
    id: 'test-action',
    title: 'Next',
    action: jest.fn(),
    ...overrides,
  } as IAction);
}

function flattenedContainerStyle(testID: string): ViewStyle {
  const pressable = screen.getByTestId(testID);
  return StyleSheet.flatten(pressable.props.style) as ViewStyle;
}

describe('partitionButtonStyles — container/text split', () => {
  it('routes text-only keys to text and the rest to container', () => {
    const { container, text } = partitionButtonStyles([
      {
        color: 'red',
        backgroundColor: 'blue',
        fontSize: 16,
        fontWeight: '600',
        lineHeight: 24,
        paddingVertical: 4,
        borderRadius: 3,
      },
    ]);
    expect(container).toEqual({
      backgroundColor: 'blue',
      paddingVertical: 4,
      borderRadius: 3,
    });
    expect(text).toEqual({
      color: 'red',
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 24,
    });
  });
});

describe('ActionButton — model binding (0.4 base)', () => {
  it('renders the action title and re-renders reactively when it changes', () => {
    const action = makeAction();
    render(<ActionButton action={action} testID="btn" />);
    expect(screen.getByText('Next')).toBeTruthy();
    act(() => {
      action.title = 'Continue';
    });
    expect(screen.getByText('Continue')).toBeTruthy();
    expect(screen.queryByText('Next')).toBeNull();
  });

  it('unsubscribes on unmount (Base.hasActiveUISubscribers leak observable)', () => {
    const action = makeAction();
    const { unmount } = render(<ActionButton action={action} testID="btn" />);
    expect(action.hasActiveUISubscribers).toBe(true);
    unmount();
    expect(action.hasActiveUISubscribers).toBe(false);
  });

  it('renders null while isVisible is false and reappears reactively', () => {
    const action = makeAction({ visible: false });
    render(<ActionButton action={action} testID="btn" />);
    expect(screen.queryByTestId('btn')).toBeNull();
    act(() => {
      action.visible = true;
    });
    expect(screen.getByTestId('btn')).toBeTruthy();
  });

  it('renders null for mode "removed" (isVisible model logic consumed, not re-derived)', () => {
    const action = makeAction();
    act(() => {
      action.mode = 'removed';
    });
    render(<ActionButton action={action} testID="btn" />);
    expect(screen.queryByTestId('btn')).toBeNull();
  });
});

describe('ActionButton — press + focus wiring', () => {
  it('doAction runs the consumer callback with a TRUSTED event (DOM-shape shim, no throw)', () => {
    const spy = jest.fn();
    const action = makeAction({ action: spy });
    render(<ActionButton action={action} testID="btn" />);
    fireEvent.press(screen.getByTestId('btn'));
    expect(spy).toHaveBeenCalledTimes(1);
    // Upstream doAction calls action(this, evt.isTrusted) — native presses
    // are genuinely user-initiated.
    expect(spy).toHaveBeenCalledWith(action, true);
  });

  it('a disabled action does not fire and exposes accessibilityState.disabled', () => {
    const spy = jest.fn();
    const action = makeAction({ action: spy, enabled: false });
    render(<ActionButton action={action} testID="btn" />);
    const pressable = screen.getByTestId('btn');
    fireEvent.press(pressable);
    expect(spy).not.toHaveBeenCalled();
    expect(pressable.props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('focus events route through doFocus with the mouse-down bookkeeping', () => {
    const onFocus = jest.fn();
    const action = makeAction({ onFocus });
    render(<ActionButton action={action} testID="btn" />);
    const pressable = screen.getByTestId('btn');
    // Keyboard-origin focus: no preceding press → falsy isMouseDown
    // (upstream leaves the private field uninitialized until a mousedown).
    fireEvent(pressable, 'focus');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus.mock.calls[0]![0]).toBeFalsy();
    // Press-origin focus: pressIn (→ doMouseDown) then focus → true.
    fireEvent(pressable, 'pressIn');
    fireEvent(pressable, 'focus');
    expect(onFocus).toHaveBeenCalledTimes(2);
    expect(onFocus.mock.calls[1]![0]).toBe(true);
  });
});

describe('ActionButton — 0.7 button recipe styling', () => {
  it('applies container-only styles to the Pressable (no text keys leak)', () => {
    const action = makeAction();
    render(
      <SurveyThemeProvider>
        <ActionButton action={action} testID="btn" />
      </SurveyThemeProvider>
    );
    const container = flattenedContainerStyle('btn');
    expect(container.backgroundColor).toBeDefined();
    expect(container.paddingVertical).toBeDefined();
    expect((container as TextStyle).fontSize).toBeUndefined();
    expect((container as TextStyle).color).toBeUndefined();
    const title = screen.getByText('Next');
    const titleStyle = StyleSheet.flatten(title.props.style) as TextStyle;
    expect(titleStyle.color).toBeDefined();
    expect(titleStyle.fontSize).toBeDefined();
    expect(titleStyle.backgroundColor).toBeUndefined();
  });

  it('variant changes the container background (action vs default)', () => {
    const action = makeAction();
    const first = render(
      <SurveyThemeProvider>
        <ActionButton action={action} testID="btn" />
      </SurveyThemeProvider>
    );
    const defaultBg = flattenedContainerStyle('btn').backgroundColor;
    first.unmount();
    render(
      <SurveyThemeProvider>
        <ActionButton action={action} variant="action" testID="btn" />
      </SurveyThemeProvider>
    );
    const actionBg = flattenedContainerStyle('btn').backgroundColor;
    expect(actionBg).toBeDefined();
    expect(actionBg).not.toEqual(defaultBg);
  });

  it('native pressed state swaps to the pressed fragment (action variant)', () => {
    const action = makeAction();
    render(
      <SurveyThemeProvider>
        <ActionButton action={action} variant="action" testID="btn" />
      </SurveyThemeProvider>
    );
    const before = flattenedContainerStyle('btn').backgroundColor;
    fireEvent(screen.getByTestId('btn'), 'pressIn');
    const during = flattenedContainerStyle('btn').backgroundColor;
    expect(during).not.toEqual(before);
    fireEvent(screen.getByTestId('btn'), 'pressOut');
    expect(flattenedContainerStyle('btn').backgroundColor).toEqual(before);
  });

  it('A12 actionButton.container slot override wins last', () => {
    const action = makeAction();
    render(
      <SurveyThemeProvider
        styles={{ actionButton: { container: { backgroundColor: 'magenta' } } }}
      >
        <ActionButton action={action} testID="btn" />
      </SurveyThemeProvider>
    );
    expect(flattenedContainerStyle('btn').backgroundColor).toBe('magenta');
  });
});

describe('ActionButton — icon integration + a11y', () => {
  it('renders RNIcon from iconName/iconSize and labels an icon-only button from the tooltip fallback', () => {
    const action = makeAction({
      title: undefined,
      showTitle: false,
      iconName: 'icon-chevrondown-24x24',
      iconSize: 16,
      tooltip: 'Expand section',
    });
    render(<ActionButton action={action} testID="btn" />);
    const svg = screen.getByTestId('mock-svg-xml', {
      includeHiddenElements: true,
    });
    expect(svg.props.width).toBe(16);
    const pressable = screen.getByTestId('btn');
    expect(pressable.props.accessibilityLabel).toBe('Expand section');
    expect(pressable.props.accessibilityRole).toBe('button');
    // Icon-only: the model's hasTitle logic hides the title text.
    expect(screen.queryByText('Expand section')).toBeNull();
  });

  it('maps ariaChecked/ariaExpanded/ariaRole onto accessibility props', () => {
    const action = makeAction({
      ariaRole: 'checkbox',
      ariaChecked: true,
      ariaExpanded: false,
    });
    render(<ActionButton action={action} testID="btn" />);
    const pressable = screen.getByTestId('btn');
    expect(pressable.props.accessibilityRole).toBe('checkbox');
    expect(pressable.props.accessibilityState).toMatchObject({
      checked: true,
      expanded: false,
    });
  });

  // Codex review major 3: `active` is the model's semantic
  // selection/active flag (upstream itemActive styling); `pressed` is a
  // transient pressed/dropdown-open visual — they must not be conflated.
  it('maps action.active (not pressed) to accessibilityState.selected', () => {
    const action = makeAction({ active: true });
    render(<ActionButton action={action} testID="btn" />);
    expect(screen.getByTestId('btn').props.accessibilityState.selected).toBe(
      true
    );
  });

  it('model pressed drives the pressed VISUAL but never accessibilityState.selected', () => {
    const action = makeAction({ pressed: true });
    render(
      <SurveyThemeProvider>
        <ActionButton action={action} variant="action" testID="btn" />
      </SurveyThemeProvider>
    );
    expect(
      screen.getByTestId('btn').props.accessibilityState.selected
    ).toBeUndefined();
    const pressedBg = flattenedContainerStyle('btn').backgroundColor;
    act(() => {
      action.pressed = false;
    });
    expect(flattenedContainerStyle('btn').backgroundColor).not.toEqual(
      pressedBg
    );
  });

  it('forwards ariaLabelledBy as accessibilityLabelledBy (Android nativeID relationship)', () => {
    const action = makeAction({ ariaLabelledBy: 'label-element-id' });
    render(<ActionButton action={action} testID="btn" />);
    expect(screen.getByTestId('btn').props.accessibilityLabelledBy).toBe(
      'label-element-id'
    );
  });
});
