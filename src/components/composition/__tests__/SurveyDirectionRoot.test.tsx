/**
 * Task 1.4 — the RTL/direction primitive (A7: "RTL/direction primitive is
 * an M1 foundation, not a Phase-6 retrofit"). One View at the survey root
 * sets the Yoga `direction` style from the theme context's select-time
 * `mode.rtl` (provider default: `I18nManager.isRTL`; overridable via the
 * provider's `rtl` prop) — every descendant's logical `start`/`end`
 * property (the row gutter, indents, recipe paddings) resolves against
 * the INHERITED direction, so an `rtl` override actually flips layout
 * instead of depending solely on the process-wide I18nManager flag.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { SurveyDirectionRoot } from '../SurveyDirectionRoot';
import { SurveyThemeProvider } from '../../../theme-rn/provider';

function rootStyle(): Record<string, unknown> {
  return StyleSheet.flatten(
    screen.getByTestId('sv-direction-root').props.style
  ) as Record<string, unknown>;
}

describe('SurveyDirectionRoot', () => {
  it('defaults to ltr (I18nManager.isRTL is false under jest)', () => {
    render(
      <SurveyDirectionRoot>
        <View testID="child" />
      </SurveyDirectionRoot>
    );
    expect(rootStyle().direction).toBe('ltr');
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('follows the provider rtl override: direction rtl', () => {
    render(
      <SurveyThemeProvider rtl>
        <SurveyDirectionRoot>
          <View testID="child" />
        </SurveyDirectionRoot>
      </SurveyThemeProvider>
    );
    expect(rootStyle().direction).toBe('rtl');
  });

  it('merges a caller style without losing the direction', () => {
    render(
      <SurveyThemeProvider rtl>
        <SurveyDirectionRoot style={{ flex: 1 }}>
          <View testID="child" />
        </SurveyDirectionRoot>
      </SurveyThemeProvider>
    );
    const style = rootStyle();
    expect(style.direction).toBe('rtl');
    expect(style.flex).toBe(1);
  });
});
