/**
 * Root manual jest mock for `react-native-webview` (task 5.5). Auto-applied
 * by jest to every suite (root `__mocks__` + node_modules package) — the
 * REAL library is a native WebView that cannot load under node/jest, so
 * this props-capturing `View` stub stands in and lets the ImageQuestion
 * youtube-mode suites assert OUR contract (the validated embed `source`
 * URL) instead of the native view's internals. The real embed is a pending
 * DEVICE gate (the peer is not installed; on-device YouTube playback is not
 * yet verified). YouTube is a documented-limited path.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

export interface MockWebViewProps extends ViewProps {
  source?: { uri?: string; html?: string };
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  allowsInlineMediaPlayback?: boolean;
}

export function WebView(props: MockWebViewProps): React.JSX.Element {
  return <View {...props} testID={props.testID ?? 'mock-webview'} />;
}

export default WebView;
