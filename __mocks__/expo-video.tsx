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
 *
 * The player also mimics expo-video's `SharedObject` event surface — a
 * `status` field (`idle | loading | readyToPlay | error`) plus
 * `addListener('statusChange', cb)` returning an `{ remove() }`
 * subscription — so the video runtime load/error wiring (task 5.5:
 * `statusChange` → core `onLoadHandler`/`onErrorHandler`) is unit-testable.
 * Tests drive a status transition with the `__setStatus` helper (it emits
 * the `statusChange` event to registered listeners), and `__listenerCount`
 * lets a test assert the component registered its listener.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

export type MockVideoPlayerStatus =
  'idle' | 'loading' | 'readyToPlay' | 'error';

export interface MockStatusChangePayload {
  status: MockVideoPlayerStatus;
  oldStatus: MockVideoPlayerStatus | null;
  error: { message: string } | null;
}

export interface MockVideoPlayer {
  /** The source handed to `useVideoPlayer` — captured for assertions. */
  source: unknown;
  loop: boolean;
  muted: boolean;
  playing: boolean;
  status: MockVideoPlayerStatus;
  play: () => void;
  pause: () => void;
  replace: (source: unknown) => void;
  release: () => void;
  addListener: (
    event: string,
    listener: (payload: MockStatusChangePayload) => void
  ) => { remove: () => void };
  /** Test helper — set `status` and emit a `statusChange` to listeners. */
  __setStatus: (
    status: MockVideoPlayerStatus,
    error?: { message: string } | null
  ) => void;
  /** Test helper — number of listeners registered for an event. */
  __listenerCount: (event: string) => number;
}

export function useVideoPlayer(
  source: unknown,
  setup?: (player: MockVideoPlayer) => void
): MockVideoPlayer {
  const listeners: Record<
    string,
    Array<(payload: MockStatusChangePayload) => void>
  > = {};
  const player: MockVideoPlayer = {
    source,
    loop: false,
    muted: false,
    playing: false,
    status: 'idle',
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
    addListener(event, listener) {
      (listeners[event] ??= []).push(listener);
      return {
        remove() {
          const arr = listeners[event];
          if (!arr) return;
          const i = arr.indexOf(listener);
          if (i >= 0) arr.splice(i, 1);
        },
      };
    },
    __setStatus(status, error = null) {
      const oldStatus = this.status;
      this.status = status;
      (listeners.statusChange ?? []).forEach((fn) =>
        fn({ status, oldStatus, error })
      );
    },
    __listenerCount(event) {
      return listeners[event]?.length ?? 0;
    },
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
