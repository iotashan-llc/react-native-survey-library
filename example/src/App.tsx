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
import type { ITheme } from 'survey-core';
import {
  DefaultLight,
  DefaultDark,
  SharpLight,
  ContrastDark,
} from 'survey-core/themes';

import { kitchenSinkJson } from './kitchen-sink';

// Host-owned diagnostics (the recommended pattern): route the library's
// structured diagnostics wherever your app logs. Without a handler the
// library dev-warns, which surfaces LogBox toasts in development.
setDiagnosticHandler((payload) => {
  console.log('[survey diagnostic]', payload.code, payload);
});

const THEMES: Array<{ name: string; theme: ITheme; dark: boolean }> = [
  { name: 'Default Light', theme: DefaultLight, dark: false },
  { name: 'Default Dark', theme: DefaultDark, dark: true },
  { name: 'Sharp Light', theme: SharpLight, dark: false },
  { name: 'Contrast Dark', theme: ContrastDark, dark: true },
];

export default function App() {
  const [themeIndex, setThemeIndex] = React.useState(0);
  const active = THEMES[themeIndex]!;
  return (
    <SafeAreaView
      style={[styles.container, active.dark ? styles.darkBg : styles.lightBg]}
    >
      <View style={styles.toolbar}>
        <Text style={[styles.toolbarLabel, active.dark && styles.darkText]}>
          Theme: {active.name}
        </Text>
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
        json={kitchenSinkJson}
        theme={active.theme}
        onComplete={(sender: { data: unknown }) => {
          console.log(
            '[kitchen-sink] completed:',
            JSON.stringify(sender.data, null, 2)
          );
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
