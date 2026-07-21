/**
 * Kitchen-sink example (task 1.17): the full M1 surface — `<Survey>` with
 * the kitchen-sink JSON + a native theme switcher cycling survey-core's
 * own exported themes (passed UNMODIFIED, per the library's contract).
 */
import * as React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import {
  Survey,
  setDiagnosticHandler,
} from '@iotashan-llc/react-native-survey-library';
import type { SurveyRefHandle } from '@iotashan-llc/react-native-survey-library';
import type { ITheme } from 'survey-core';
import { ComponentCollection } from 'survey-core';
import {
  DefaultLight,
  DefaultDark,
  SharpLight,
  ContrastDark,
} from 'survey-core/themes';

import { kitchenSinkJson } from './kitchen-sink';
import { timerSurveyJson } from './timer-survey';
import { progressButtonsSurveyJson } from './progress-buttons-survey';
import { registerKitchenSinkComponents } from './register-components';

// Register the ComponentCollection custom/composite types the kitchen-sink
// uses (task 2.11) BEFORE the <Survey> builds its model. Module scope runs at
// import time, ahead of the first render. The parity web page registers the
// SAME definitions in its own script.
registerKitchenSinkComponents(ComponentCollection.Instance);

// Host-owned diagnostics (the recommended pattern): route the library's
// structured diagnostics wherever your app logs. Without a handler the
// library dev-warns, which surfaces LogBox toasts in development.
setDiagnosticHandler((payload) => {
  console.log('[survey diagnostic]', payload.code, payload);
});

// Advanced header / cover demo (task 5.6): DefaultLight + a survey-level
// `header` cover. `headerView: 'advanced'` turns the header into a cover
// band — an accent-colored background with the kitchen-sink logo/title/
// description positioned via the 3x3 grid (logo top-left, title +
// description bottom-left). The background COLOR is driven by theme
// `cssVariables` (not `header.backgroundColor`), exactly as web does; the
// accent `var(--sjs-primary-backcolor)` is dereferenced to a real color by
// the theme pipeline. `overlapEnabled` lifts the survey body up onto the
// cover. See docs/DIFFERENCES.md → "Advanced header / cover".
const ADVANCED_HEADER_THEME: ITheme = {
  ...DefaultLight,
  headerView: 'advanced',
  cssVariables: {
    ...(DefaultLight.cssVariables ?? {}),
    '--sjs-header-backcolor': 'var(--sjs-primary-backcolor)',
    '--sjs-font-headertitle-color': '#ffffff',
    '--sjs-font-headerdescription-color': 'rgba(255, 255, 255, 0.85)',
  },
  header: {
    height: 280,
    overlapEnabled: true,
    backgroundImageFit: 'cover',
    backgroundImageOpacity: 1,
    logoPositionX: 'left',
    logoPositionY: 'top',
    titlePositionX: 'left',
    titlePositionY: 'bottom',
    descriptionPositionX: 'left',
    descriptionPositionY: 'bottom',
  } as any,
};

const THEMES: Array<{ name: string; theme: ITheme; dark: boolean }> = [
  { name: 'Default Light', theme: DefaultLight, dark: false },
  { name: 'Default Dark', theme: DefaultDark, dark: true },
  { name: 'Sharp Light', theme: SharpLight, dark: false },
  { name: 'Contrast Dark', theme: ContrastDark, dark: true },
  { name: 'Advanced Header', theme: ADVANCED_HEADER_THEME, dark: false },
];

const DEMOS: Array<{ name: string; json: object }> = [
  { name: 'Kitchen Sink', json: kitchenSinkJson },
  // Timer demo (task 5.7a): a small timed quiz (timeLimit +
  // timeLimitPerPage + showTimer:'top').
  { name: 'Timer', json: timerSurveyJson },
  // Progress-buttons + notifier demo (task 5.7c): multi-page survey with
  // progressBarType 'buttons'; the "Notify" button fires survey.notify.
  { name: 'Progress Buttons', json: progressButtonsSurveyJson },
];

export default function App() {
  const [themeIndex, setThemeIndex] = React.useState(0);
  // Demo cycle: kitchen sink -> timer -> progress buttons.
  const [demoIndex, setDemoIndex] = React.useState(0);
  const surveyRef = React.useRef<SurveyRefHandle>(null);
  const active = THEMES[themeIndex]!;
  const demo = DEMOS[demoIndex]!;
  return (
    <SafeAreaView
      style={[styles.container, active.dark ? styles.darkBg : styles.lightBg]}
    >
      <View style={styles.toolbar}>
        <Text style={[styles.toolbarLabel, active.dark && styles.darkText]}>
          Theme: {active.name}
        </Text>
        <Pressable
          testID="demo-toggle"
          accessibilityRole="button"
          style={styles.switchButton}
          onPress={() => setDemoIndex((index) => (index + 1) % DEMOS.length)}
        >
          <Text style={styles.switchLabel}>Demo: {demo.name}</Text>
        </Pressable>
        <Pressable
          testID="notify-button"
          accessibilityRole="button"
          style={styles.switchButton}
          onPress={() =>
            surveyRef.current?.model?.notify('Progress saved!', 'success')
          }
        >
          <Text style={styles.switchLabel}>Notify</Text>
        </Pressable>
        <Pressable
          testID="theme-switcher"
          accessibilityRole="button"
          style={styles.switchButton}
          onPress={() => setThemeIndex((index) => (index + 1) % THEMES.length)}
        >
          <Text style={styles.switchLabel}>Switch</Text>
        </Pressable>
      </View>
      <Survey
        ref={surveyRef}
        json={demo.json}
        theme={active.theme}
        onComplete={(sender: { data: unknown }) => {
          console.log(
            '[kitchen-sink] completed:',
            JSON.stringify(sender.data, null, 2)
          );
        }}
        // Host opt-in link events: every anchor press inside sanitized
        // survey HTML delivers the policy-validated URL + sink label.
        // Navigation stays the HOST's decision — e.g. call
        // Linking.openURL(event.url) here if that is the desired UX; the
        // library itself never navigates (invariant 8). Without this
        // prop, anchors render as plain text (no dead a11y link role).
        onLinkPress={(event) => {
          console.log('[kitchen-sink] link press:', event.context, event.url);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  lightBg: { backgroundColor: '#f3f3f3' },
  darkBg: { backgroundColor: '#1f1f1f' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toolbarLabel: { fontSize: 14, fontWeight: '600' },
  darkText: { color: '#ffffff' },
  switchButton: {
    backgroundColor: '#19b394',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  switchLabel: { color: '#ffffff', fontWeight: '600' },
});
