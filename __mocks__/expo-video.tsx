/**
 * Root manual jest mock for `expo-video` (task 5.5, mirroring
 * `__mocks__/react-native-signature-canvas.tsx`). Auto-applied by jest to
 * every suite (root `__mocks__` + node_modules package) — the REAL library
 * ships a native `VideoView` + a JSI player that cannot load under
 * node/jest, so this props-capturing stub stands in and lets the
 * ImageQuestion video-mode suites assert OUR contract (the validated video
 * source handed to `useVideoPlayer`, `nativeControls`, the `contentFit`
 * mapped from `imageFit`, dimensions) instead of the native player's
 * internals. The real player is a pending DEVICE gate (the peer is not
 * installed; on-device playback is not yet verified).
 *
 * `useVideoPlayer(source, setup?)` returns a plain player object that
 * CAPTURES the source (so a test reads it back off the captured
 * `VideoView.player` prop) and runs the optional `setup` callback, matching
 * the real hook's `(source, setup) => player` shape. `VideoView` forwards
 * every prop onto a `View` so tests query by testID.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

export interface MockVideoPlayer {
  /** The source handed to `useVideoPlayer` — captured for assertions. */
  source: unknown;
  loop: boolean;
  muted: boolean;
  playing: boolean;
  play: () => void;
  pause: () => void;
  replace: (source: unknown) => void;
  release: () => void;
}

export function useVideoPlayer(
  source: unknown,
  setup?: (player: MockVideoPlayer) => void
): MockVideoPlayer {
  const player: MockVideoPlayer = {
    source,
    loop: false,
    muted: false,
    playing: false,
    play() {
      this.playing = true;
    },
    pause() {
      this.playing = false;
    },
    replace(next: unknown) {
      this.source = next;
    },
    release() {},
  };
  if (typeof setup === 'function') setup(player);
  return player;
}

export interface MockVideoViewProps extends ViewProps {
  player?: unknown;
  nativeControls?: boolean;
  contentFit?: string;
  allowsFullscreen?: boolean;
}

export function VideoView(props: MockVideoViewProps): React.JSX.Element {
  return <View {...props} testID={props.testID ?? 'mock-video-view'} />;
}

export default VideoView;
