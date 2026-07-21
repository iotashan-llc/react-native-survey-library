/**
 * Root manual jest mock for `expo-document-picker` (task 5.2, mirroring
 * `__mocks__/expo-video.tsx` / `__mocks__/react-native-signature-canvas.tsx`).
 * Auto-applied by jest to every suite (root `__mocks__` + a bare
 * peerDependency specifier that is NOT installed in `node_modules`, so the
 * lazy `require('expo-document-picker')` inside `FileQuestion` resolves to
 * THIS file). The real library ships a native module that cannot load under
 * node/jest, so this stub stands in and lets the FileQuestion suites drive a
 * document pick (`getDocumentAsync`) deterministically and assert OUR
 * contract (the assets we feed `question.loadFiles`, the resulting model
 * value/previewValue) instead of the native picker's internals. The real
 * picker is a device gate.
 *
 * A test stages the next result with `__setDocumentResult(...)` and reads
 * the captured option objects with `__getDocumentCalls()`; `__resetPicker()`
 * clears both between tests. The same resolved module file backs both the
 * component's bare `require('expo-document-picker')` and a test's relative
 * `import` of this path (jest caches by absolute filename), so state set
 * through the relative import is exactly what the component sees.
 */
export interface MockDocumentAsset {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
}

export interface MockDocumentResult {
  canceled: boolean;
  assets: MockDocumentAsset[] | null;
}

let nextResult: MockDocumentResult = { canceled: true, assets: [] };
const calls: unknown[] = [];

export function getDocumentAsync(
  options?: unknown
): Promise<MockDocumentResult> {
  calls.push(options);
  return Promise.resolve(nextResult);
}

export function __setDocumentResult(result: MockDocumentResult): void {
  nextResult = result;
}

export function __getDocumentCalls(): unknown[] {
  return calls;
}

export function __resetPicker(): void {
  nextResult = { canceled: true, assets: [] };
  calls.length = 0;
}
