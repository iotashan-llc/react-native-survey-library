/**
 * Native lifecycle bridge — ref/layout registry (design:
 * docs/design/1.2-lifecycle-bridge.md, piece 1).
 *
 * Per-survey instance. `<Survey>` (1.1) creates one, provides it via
 * `LifecycleContext`, and hands it to `installLifecycleBridge`.
 * Components register handles from the 0.4 captured-pair mounted hooks;
 * the bridge resolves scroll targets through the documented lookup order
 * (exact instance → page fallback → null + diagnostic).
 *
 * NOTE: skeleton commit — signatures are the 1.1 API contract; bodies
 * land in this task's red-green cycle.
 */
import type { Base } from '../core/facade';
import type {
  ElementHandle,
  LifecycleRegistry,
  RegistrableElement,
  ResolvedScrollTarget,
  ScrollHostHandle,
} from './types';

/** Creates an empty per-survey registry. */
export function createLifecycleRegistry(): LifecycleRegistry {
  return new LifecycleRegistryImpl();
}

class LifecycleRegistryImpl implements LifecycleRegistry {
  registerElement(_el: RegistrableElement, _handle: ElementHandle): () => void {
    return () => {};
  }

  registerScrollHost(_handle: ScrollHostHandle): () => void {
    return () => {};
  }

  getHandle(_el: Base): ElementHandle | undefined {
    return undefined;
  }

  getScrollHost(): ScrollHostHandle | undefined {
    return undefined;
  }

  resolveScrollTarget(
    _el: Base | null | undefined
  ): ResolvedScrollTarget | null {
    return null;
  }

  clear(): void {}
}
