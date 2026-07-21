/**
 * Root manual jest mock for `react-native-svg` (design:
 * docs/design/1.5-icon-actionbutton.md, "Dependencies, boundaries,
 * gates"). Auto-applied by jest to every suite (root `__mocks__` +
 * node_modules package).
 *
 * `SvgXml` (task 1.5) renders as a props-capturing `View` stub so RNIcon
 * tests assert OUR contract (resolved xml, size, fill, a11y props) instead
 * of host-component internals.
 *
 * The shape primitives (`Svg`/`Rect`/`Circle`/`Polygon`/`Ellipse`/`Path`/
 * `G`, task 5.4's imagemap hotspots) are the SAME kind of props-capturing
 * `View` stub — forwarding `testID`/`onPress`/accessibility + geometry
 * props and rendering children — so imagemap tests assert the shape
 * geometry, fill/stroke, tap handler and a11y state we hand each shape.
 * The REAL library is exercised by the A14 packaged/example-app gates.
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

/** A props-capturing `View` stub for a react-native-svg primitive: every
 * prop (geometry, fill/stroke, onPress, accessibility*) is forwarded and
 * children render, so component tests can query by testID and assert the
 * exact props we pass. */
function makeSvgStub(
  defaultTestID: string
): (props: Record<string, unknown>) => React.JSX.Element {
  const Stub = (props: Record<string, unknown>): React.JSX.Element => {
    const { children, testID, ...rest } = props as {
      children?: React.ReactNode;
      testID?: string;
    } & Record<string, unknown>;
    return (
      <View {...(rest as ViewProps)} testID={testID ?? defaultTestID}>
        {children as React.ReactNode}
      </View>
    );
  };
  Stub.displayName = defaultTestID;
  return Stub;
}

export const Svg = makeSvgStub('mock-svg');
export const Rect = makeSvgStub('mock-svg-rect');
export const Circle = makeSvgStub('mock-svg-circle');
export const Ellipse = makeSvgStub('mock-svg-ellipse');
export const Polygon = makeSvgStub('mock-svg-polygon');
export const Path = makeSvgStub('mock-svg-path');
export const G = makeSvgStub('mock-svg-g');

export default Svg;
