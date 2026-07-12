/**
 * `<ActionButton>` — the RN analog of survey-react-ui's
 * `SurveyActionBarItem` (design: docs/design/1.5-icon-actionbutton.md,
 * "ActionButton"): Pressable + the 0.7 button recipe + `<RNIcon>` +
 * core `Action` model binding through the 0.4 `SurveyElementBase`
 * mechanism (`getStateElement() → action`, so `iconName/title/enabled/
 * visible/pressed/mode` property changes re-render and unmount
 * unsubscribes deterministically).
 *
 * Styling (A7 hybrid): `variant`/`small` are usage-site props (the 0.7
 * fixture's model-/site-derived discriminants); `pressed`/`focused` are
 * NATIVE interaction state tracked here — with the model's own
 * `action.pressed` (e.g. dropdown-open) ORed into the pressed input.
 * Because the recipe's fragments mix container styles (padding/background/
 * radius/shadow) with text styles (web buttons inherit text styles; RN
 * doesn't), `partitionButtonStyles` splits the flattened selection —
 * container half → Pressable, text half → title `Text` + default icon
 * fill. A12 `actionButton` slots compose LAST per side.
 *
 * Events: `doAction` has a DOM-shaped contract (`evt.preventDefault()`/
 * `.stopPropagation()`/`.isTrusted`) — `nativeActionEvent()` supplies a
 * shim with `isTrusted: true` (native presses are genuinely
 * user-initiated) instead of leaning on the RN synthetic event.
 * `onPressIn → doMouseDown`, `onFocus → doFocus` keep core's
 * mouse-vs-keyboard focus-origin bookkeeping intact.
 *
 * Non-goals (owned elsewhere — see design note): ActionBar container +
 * adaptive shrink machinery, popup/dropdown dispatch (A9/M2), sub-items,
 * rich locTitle rendering (1.6 upgrades the inherited seam).
 */
import * as React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type {
  AccessibilityRole,
  ColorValue,
  GestureResponderEvent,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native';
import type { Action, Base } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import type { SurveyElementBaseState } from '../reactivity/SurveyElementBase';
import { RNIcon } from './RNIcon';
import { selectButtonStyles } from '../theme-rn/recipes/button';
import type { ButtonKind } from '../theme-rn/recipes/button';
import { composeStyles } from '../theme-rn/recipes/types';
import { calcSize } from '../theme-rn/recipes/tokenLookup';

export interface ActionButtonProps {
  action: Action;
  /** 0.7 button-recipe variant — usage-site-derived (nav "Complete" = action, deletes = danger, …). */
  variant?: ButtonKind;
  /** Composes the recipe's `small` fragment (orthogonal 13th enumeration entry). */
  small?: boolean;
  testID?: string;
}

interface ActionButtonState extends SurveyElementBaseState {
  focused: boolean;
  pressedNative: boolean;
}

/**
 * RN `TextStyle`-only keys (not valid on a `View`). Everything else in a
 * flattened button-recipe selection belongs to the Pressable container.
 */
const TEXT_STYLE_KEYS = new Set([
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'includeFontPadding',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textAlignVertical',
  'textDecorationColor',
  'textDecorationLine',
  'textDecorationStyle',
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius',
  'textTransform',
  'verticalAlign',
  'writingDirection',
]);

export interface PartitionedButtonStyles {
  container: ViewStyle;
  text: TextStyle;
}

/**
 * Splits a selected button-recipe fragment array into the Pressable-
 * applicable container object and the Text-applicable text object
 * (design: "Style split"). Exported for direct unit testing.
 */
export function partitionButtonStyles(
  selection: TextStyle[]
): PartitionedButtonStyles {
  const flattened = (StyleSheet.flatten(selection) ?? {}) as Record<
    string,
    unknown
  >;
  const container: Record<string, unknown> = {};
  const text: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flattened)) {
    if (value === undefined) continue;
    (TEXT_STYLE_KEYS.has(key) ? text : container)[key] = value;
  }
  return {
    container: container as ViewStyle,
    text: text as TextStyle,
  };
}

interface DomShapedActionEvent {
  originalEvent: {
    isTrusted: boolean;
    preventDefault: () => void;
    stopPropagation: () => void;
  };
}

/**
 * DOM-shaped event shim for `Action.doAction`'s contract. `isTrusted:
 * true` — a native press is genuinely user-initiated; RN needs no
 * default-prevention, so both methods are no-ops. Exported for tests.
 */
export function nativeActionEvent(): DomShapedActionEvent {
  return {
    originalEvent: {
      isTrusted: true,
      preventDefault: () => {},
      stopPropagation: () => {},
    },
  };
}

/** Known `Action.ariaRole` values mapped onto RN accessibility roles; anything else falls back to `button`. */
const ARIA_TO_ACCESSIBILITY_ROLE: Record<string, AccessibilityRole> = {
  button: 'button',
  checkbox: 'checkbox',
  link: 'link',
  menuitem: 'menuitem',
  radio: 'radio',
  switch: 'switch',
  tab: 'tab',
};

function mapAccessibilityRole(ariaRole: string | undefined): AccessibilityRole {
  return ARIA_TO_ACCESSIBILITY_ROLE[ariaRole ?? 'button'] ?? 'button';
}

export class ActionButton extends SurveyElementBase<
  ActionButtonProps,
  ActionButtonState
> {
  constructor(props: ActionButtonProps) {
    super(props);
    this.state = { focused: false, pressedNative: false };
  }

  private get action(): Action {
    return this.props.action;
  }

  protected getStateElement(): Base | null {
    return this.action ?? null;
  }

  protected canRender(): boolean {
    // `isVisible` is the MODEL's visibility logic (`visible && mode not in
    // {popup, removed}`) — consumed, never re-derived (invariant 6). RN
    // has no css-hidden wrapper, so an invisible action renders null.
    return !!this.action && this.action.isVisible;
  }

  private handlePress = (_event: GestureResponderEvent): void => {
    this.action.doAction(nativeActionEvent());
  };

  private handlePressIn = (_event: GestureResponderEvent): void => {
    this.setState({ pressedNative: true });
    this.action.doMouseDown(nativeActionEvent());
  };

  private handlePressOut = (_event: GestureResponderEvent): void => {
    this.setState({ pressedNative: false });
  };

  private handleFocus = (event: unknown): void => {
    this.setState({ focused: true });
    // `doFocus` destructures `args.originalEvent` — never hand it a
    // nullish event (test drivers fire focus without one).
    this.action.doFocus(event ?? {});
  };

  private handleBlur = (): void => {
    this.setState({ focused: false });
  };

  protected renderElement(): React.JSX.Element {
    const action = this.action;
    const { recipes, resolved, mode, styles } = this.themeContext;
    const slots = styles.actionButton;

    const selection = selectButtonStyles(
      recipes.button,
      {
        pressed: this.state.pressedNative || !!action.pressed,
        focused: this.state.focused,
        disabled: action.disabled,
        small: !!this.props.small,
        variant: this.props.variant ?? 'default',
      },
      mode
    );
    const { container, text } = partitionButtonStyles(selection);

    const icon = action.iconName ? (
      <RNIcon
        iconName={action.iconName}
        size={action.iconSize}
        fill={text.color as ColorValue | undefined}
        style={slots?.icon}
      />
    ) : null;
    // `hasTitle` is model-owned show-title logic (mode/showTitle/iconName
    // interplay) — consumed as-is, like web's SurveyActionBarItem.
    const title = action.hasTitle
      ? this.renderLocString(
          action.locTitle,
          composeStyles<TextStyle>(text, { override: slots?.title })
        )
      : null;

    const contentRow: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: calcSize(resolved, 1),
    };

    return (
      <Pressable
        style={[
          contentRow,
          ...composeStyles<ViewStyle>(container, {
            override: slots?.container as StyleProp<ViewStyle>,
          }),
        ]}
        disabled={action.disabled}
        focusable={!action.disableTabStop}
        onPress={this.handlePress}
        onPressIn={this.handlePressIn}
        onPressOut={this.handlePressOut}
        onFocus={this.handleFocus}
        onBlur={this.handleBlur}
        accessible
        accessibilityRole={mapAccessibilityRole(action.ariaRole)}
        accessibilityLabel={action.getTooltip()}
        accessibilityState={{
          disabled: action.disabled,
          checked: action.ariaChecked,
          expanded: action.ariaExpanded,
          selected: action.pressed ? true : undefined,
        }}
        testID={this.props.testID}
      >
        {icon}
        {title}
      </Pressable>
    );
  }
}
