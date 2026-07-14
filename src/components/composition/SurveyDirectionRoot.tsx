/**
 * Task 1.4 — the RTL/direction primitive (A7: "RTL/direction primitive is
 * an M1 foundation, not a Phase-6 retrofit").
 *
 * One View that stamps the Yoga `direction` style from the theme
 * context's select-time `mode.rtl` (provider default `I18nManager.isRTL`;
 * overridable via the provider's `rtl` prop). Yoga resolves every
 * descendant's logical `start`/`end` property against the INHERITED
 * direction, so all composition geometry (row gutters, indents, recipe
 * paddings — all authored with logical properties) flips under an `rtl`
 * override without touching the process-wide `I18nManager` flag.
 *
 * A plain function component with a static context read — not the
 * reactive-binding mechanism (A3 governs survey-core model
 * subscriptions; there is no model here), same precedent as
 * `UnsupportedQuestion`'s presentation component.
 */
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SurveyThemeContext } from '../../theme-rn/provider';

export interface SurveyDirectionRootProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function SurveyDirectionRoot(
  props: SurveyDirectionRootProps
): React.JSX.Element {
  const { mode } = React.useContext(SurveyThemeContext);
  return (
    <View
      testID="sv-direction-root"
      style={[mode.rtl ? styles.rtl : styles.ltr, props.style]}
    >
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  ltr: { direction: 'ltr' },
  rtl: { direction: 'rtl' },
});
