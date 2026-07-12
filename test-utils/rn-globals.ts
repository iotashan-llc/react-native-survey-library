/**
 * Test helper that shapes the Jest (Node) global object like React Native's
 * JS runtime: `window === global`, `navigator.product === 'ReactNative'`,
 * no `document`, no `window.addEventListener`, `requestAnimationFrame`
 * present. Used by the survey-core facade/shim require-time tests
 * (`src/core/__tests__`) to reproduce the conditions that make
 * `DomWindowHelper.isAvailable()` return `true` inside React Native even
 * though there is no real DOM.
 *
 * Intentionally reads/writes globals through untyped `Record<string,
 * unknown>` access rather than DOM lib types — this project's tsconfig has
 * no `"dom"` lib (React Native's own ambient types conflict with it), and
 * this file must remain usable without one.
 */

type RnGlobal = Record<string, unknown>;

interface SavedGlobalProperty {
  key: string;
  existed: boolean;
  descriptor: PropertyDescriptor | undefined;
}

const MANAGED_GLOBAL_KEYS = [
  'window',
  'navigator',
  'requestAnimationFrame',
  'addEventListener',
  'removeEventListener',
  'ResizeObserver',
] as const;

function saveGlobalProperty(
  target: RnGlobal,
  key: string
): SavedGlobalProperty {
  return {
    key,
    existed: Object.prototype.hasOwnProperty.call(target, key),
    descriptor: Object.getOwnPropertyDescriptor(target, key),
  };
}

function restoreGlobalProperty(
  target: RnGlobal,
  saved: SavedGlobalProperty
): void {
  if (saved.existed && saved.descriptor) {
    Object.defineProperty(target, saved.key, saved.descriptor);
  } else {
    delete target[saved.key];
  }
}

function patchGlobal(target: RnGlobal, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

function fail(reason: string): never {
  throw new Error(`withRnShapedGlobals: precondition failed — ${reason}`);
}

function assertRnShapedPreconditions(target: RnGlobal): void {
  if (typeof target.document !== 'undefined') {
    fail('document is defined (React Native has no document).');
  }
  if (target.window !== target) {
    fail('window !== global.');
  }
  const windowObject = target.window as RnGlobal;
  if (typeof windowObject.addEventListener !== 'undefined') {
    fail('window.addEventListener is defined.');
  }
  const EventTargetCtor = target.EventTarget as
    (new (...args: unknown[]) => unknown) | undefined;
  if (
    typeof EventTargetCtor === 'function' &&
    target instanceof EventTargetCtor
  ) {
    fail('globalThis is an EventTarget instance.');
  }
}

/**
 * Runs `fn` with globals shaped like React Native's JS runtime, then
 * restores the original global descriptors — even if `fn` throws.
 *
 * `fn` runs under `jest.isolateModules`, so any `require(...)` calls made
 * inside it get a fresh module registry (letting `survey-core` be
 * re-required, under the patched globals, independently per test).
 */
export function withRnShapedGlobals(fn: () => void): void {
  const target = globalThis as unknown as RnGlobal;
  const saved = MANAGED_GLOBAL_KEYS.map((key) =>
    saveGlobalProperty(target, key)
  );

  patchGlobal(target, 'window', target);
  patchGlobal(target, 'navigator', {
    product: 'ReactNative',
    maxTouchPoints: undefined,
  });
  if (typeof target.requestAnimationFrame !== 'function') {
    patchGlobal(
      target,
      'requestAnimationFrame',
      (callback: (time: number) => void) =>
        setTimeout(() => callback(Date.now()), 0)
    );
  }
  delete target.addEventListener;
  delete target.removeEventListener;
  delete target.ResizeObserver;

  assertRnShapedPreconditions(target);

  try {
    jest.isolateModules(fn);
  } finally {
    saved.forEach((property) => restoreGlobalProperty(target, property));
  }
}
