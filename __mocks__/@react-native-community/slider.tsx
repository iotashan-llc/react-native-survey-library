/**
 * Root manual jest mock for `@react-native-community/slider` (task 4.4,
 * mirroring `__mocks__/react-native-svg.tsx`). Auto-applied by jest to
 * every suite (root `__mocks__` + node_modules package). Renders the
 * native `Slider` as a props-capturing `View` stub so the single-thumb
 * SliderQuestion tests can drive `onValueChange` (visual draft) /
 * `onSlidingComplete` (commit) via RNTL `fireEvent` and assert OUR
 * contract (value/min/max/step/disabled) instead of the native view's
 * internals; the REAL library is exercised by the example-app device gate.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

export interface MockSliderProps extends ViewProps {
  value?: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  disabled?: boolean;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  onValueChange?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
}

export function Slider(props: MockSliderProps): React.JSX.Element {
  return <View {...props} testID={props.testID ?? 'mock-slider'} />;
}

export default Slider;
