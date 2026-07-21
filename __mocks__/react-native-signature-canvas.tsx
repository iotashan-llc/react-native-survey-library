/**
 * Root manual jest mock for `react-native-signature-canvas` (task 5.1,
 * mirroring `__mocks__/@react-native-community/slider.tsx`). Auto-applied by
 * jest to every suite (root `__mocks__` + node_modules package) — the REAL
 * library ships untranspiled JSX and a WebView bridge that cannot load under
 * node/jest, so this props-capturing `View` stub stands in and lets the
 * SignaturePadQuestion suites drive `onOK` (data-URL commit) / `onClear` and
 * assert OUR contract (the committed data URL, model-derived props) instead
 * of the WebView's internals. The real WebView pad is exercised on-device.
 *
 * `forwardRef` + `useImperativeHandle` expose the ref surface the isolated
 * hooks child calls (`readSignature` on stroke-end, `clearSignature` on the
 * clear control) so those calls are safe no-ops in jest; a test drives a
 * commit by invoking the captured `onOK` prop directly.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

export interface MockSignatureCanvasProps extends ViewProps {
  onOK?: (signature: string) => void;
  onEmpty?: () => void;
  onClear?: () => void;
  onBegin?: () => void;
  onEnd?: () => void;
  onGetData?: (data: string) => void;
  penColor?: string;
  backgroundColor?: string;
  minWidth?: number;
  maxWidth?: number;
  dotSize?: number;
  imageType?: string;
  dataURL?: string;
  autoClear?: boolean;
  descriptionText?: string;
  webStyle?: string;
  androidHardwareAccelerationDisabled?: boolean;
}

export interface MockSignatureCanvasRef {
  readSignature: () => void;
  clearSignature: () => void;
  draw: () => void;
  erase: () => void;
  getData: () => void;
  undo: () => void;
  redo: () => void;
  changePenColor: (color: string) => void;
  changePenSize: (min: number, max: number) => void;
}

const SignatureCanvasMock = React.forwardRef<
  MockSignatureCanvasRef,
  MockSignatureCanvasProps
>(function SignatureCanvasMockView(props, ref): React.JSX.Element {
  React.useImperativeHandle(ref, () => ({
    readSignature: () => {},
    clearSignature: () => {},
    draw: () => {},
    erase: () => {},
    getData: () => {},
    undo: () => {},
    redo: () => {},
    changePenColor: () => {},
    changePenSize: () => {},
  }));
  return <View {...props} testID={props.testID ?? 'mock-signature-canvas'} />;
});

export default SignatureCanvasMock;
