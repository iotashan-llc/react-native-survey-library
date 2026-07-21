/**
 * Root manual jest mock for `expo-image-picker` (task 5.2, mirroring
 * `__mocks__/expo-video.tsx` / `__mocks__/react-native-signature-canvas.tsx`).
 * Auto-applied by jest to every suite (root `__mocks__` + a bare
 * peerDependency specifier that is NOT installed in `node_modules`, so the
 * lazy `require('expo-image-picker')` inside `FileQuestion` resolves to THIS
 * file). The real library ships a native module that cannot load under
 * node/jest, so this stub stands in and lets the FileQuestion camera suites
 * drive `launchCameraAsync` + the permission prompt deterministically and
 * assert OUR contract (the captured photo we feed `question.loadFiles`, the
 * resulting model value) instead of the native picker's internals. The real
 * camera is a device gate.
 *
 * A test stages the next capture with `__setCameraResult(...)`, the next
 * permission decision with `__setPermission(...)`, and reads the captured
 * option objects with `__getCameraCalls()`; `__resetPicker()` clears them.
 */
export interface MockImageAsset {
  uri: string;
  fileName?: string;
  mimeType?: string;
  type?: string;
  fileSize?: number;
  base64?: string;
}

export interface MockImageResult {
  canceled: boolean;
  assets: MockImageAsset[] | null;
}

export interface MockPermission {
  granted: boolean;
  status: string;
}

let nextCamera: MockImageResult = { canceled: true, assets: [] };
let permission: MockPermission = { granted: true, status: 'granted' };
const cameraCalls: unknown[] = [];
const libraryCalls: unknown[] = [];

/** SDK-57 media-type tokens (array form). Kept as a harmless enum-like for
 * older `MediaTypeOptions` callers too. */
export const MediaTypeOptions = {
  All: 'All',
  Images: 'Images',
  Videos: 'Videos',
} as const;

export function launchCameraAsync(options?: unknown): Promise<MockImageResult> {
  cameraCalls.push(options);
  return Promise.resolve(nextCamera);
}

export function launchImageLibraryAsync(
  options?: unknown
): Promise<MockImageResult> {
  libraryCalls.push(options);
  return Promise.resolve(nextCamera);
}

export function requestCameraPermissionsAsync(): Promise<MockPermission> {
  return Promise.resolve(permission);
}

export function requestMediaLibraryPermissionsAsync(): Promise<MockPermission> {
  return Promise.resolve(permission);
}

export function __setCameraResult(result: MockImageResult): void {
  nextCamera = result;
}

export function __setPermission(perm: MockPermission): void {
  permission = perm;
}

export function __getCameraCalls(): unknown[] {
  return cameraCalls;
}

export function __resetPicker(): void {
  nextCamera = { canceled: true, assets: [] };
  permission = { granted: true, status: 'granted' };
  cameraCalls.length = 0;
  libraryCalls.length = 0;
}
