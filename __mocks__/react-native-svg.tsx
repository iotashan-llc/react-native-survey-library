/**
 * Root manual jest mock for `react-native-svg` (design:
 * docs/design/1.5-icon-actionbutton.md, "Dependencies, boundaries,
 * gates"). Auto-applied by jest to every suite (root `__mocks__` +
 * node_modules package). Renders `SvgXml` as a props-capturing `View`
 * stub so component tests assert OUR contract (resolved xml, size, fill,
 * a11y props) instead of host-component internals; the REAL library is
 * exercised by the A14 packaged/example-app gates.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

export interface MockSvgXmlProps extends ViewProps {
  xml: string | null;
  width?: number | string;
  height?: number | string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number | string;
}

export function SvgXml(props: MockSvgXmlProps): React.JSX.Element {
  return <View {...props} testID={props.testID ?? 'mock-svg-xml'} />;
}

export default { SvgXml };
