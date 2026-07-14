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
 * Keyed by model INSTANCE (never name — names are not unique across
 * pages/panels, and a model swap must not leak stale handles). Stale
 * deregisters (captured before a same-instance re-registration) are
 * no-ops: a deregister only removes the exact handle it registered.
 */
import type { Base } from '../core/facade';
import { reportDiagnostic } from '../diagnostics';
import type {
  ElementHandle,
  LifecycleRegistry,
  RegistrableElement,
  ResolvedScrollTarget,
  ScrollHostHandle,
} from './types';

/**
 * RN's Metro (and jest's react-native preset) define the `__DEV__`
 * global; declared module-locally (same pattern as `diagnostics.ts`) so
 * the dev-only target-unregistered gate typechecks without widening the
 * library's ambient types.
 */
declare const __DEV__: boolean | undefined;

function isDevMode(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/** Safe `name` reader for diagnostics — never throws on exotic models. */
export function readElementName(el: Base): string | undefined {
  const name = (el as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

/** Safe `getType()` reader for diagnostics — never throws. */
export function readElementType(el: Base): string | undefined {
  try {
    const getType = (el as { getType?: () => string }).getType;
    return typeof getType === 'function' ? getType.call(el) : undefined;
  } catch {
    return undefined;
  }
}

/** Creates an empty per-survey registry. */
export function createLifecycleRegistry(): LifecycleRegistry {
  return new LifecycleRegistryImpl();
}

class LifecycleRegistryImpl implements LifecycleRegistry {
  private readonly handles = new Map<Base, ElementHandle>();
  private scrollHost: ScrollHostHandle | undefined;
  /**
   * Models whose failed resolution has already been reported —
   * once-per-instance (design doc, "Lookup order"). Instance-scoped (not
   * module-scoped) so a fresh registry after a model swap reports again
   * for a genuinely new failure.
   */
  private readonly reportedUnregistered = new WeakSet<Base>();

  registerElement(el: RegistrableElement, handle: ElementHandle): () => void {
    this.handles.set(el, handle);
    return () => {
      if (this.handles.get(el) === handle) {
        this.handles.delete(el);
      }
    };
  }

  registerScrollHost(handle: ScrollHostHandle): () => void {
    this.scrollHost = handle;
    return () => {
      if (this.scrollHost === handle) {
        this.scrollHost = undefined;
      }
    };
  }

  getHandle(el: Base): ElementHandle | undefined {
    return this.handles.get(el);
  }

  getScrollHost(): ScrollHostHandle | undefined {
    return this.scrollHost;
  }

  resolveScrollTarget(
    el: Base | null | undefined
  ): ResolvedScrollTarget | null {
    if (!el) return null;
    const exact = this.handles.get(el);
    if (exact) {
      return { element: el, handle: exact, viaPageFallback: false };
    }
    const page = readOwningPage(el);
    if (page) {
      const pageHandle = this.handles.get(page);
      if (pageHandle) {
        return { element: page, handle: pageHandle, viaPageFallback: true };
      }
    }
    if (isDevMode() && !this.reportedUnregistered.has(el)) {
      this.reportedUnregistered.add(el);
      reportDiagnostic({
        code: 'lifecycle-diagnostic',
        lifecycleCode: 'target-unregistered',
        elementName: readElementName(el),
        elementType: readElementType(el),
      });
    }
    return null;
  }

  clear(): void {
    this.handles.clear();
    this.scrollHost = undefined;
  }
}

/**
 * The page an unregistered element falls back to (Question/PanelModel
 * `.page`). Guarded against self-reference so a PageModel input can't
 * "fall back" to itself and defeat the null-result diagnostic.
 */
function readOwningPage(el: Base): Base | null {
  const page = (el as { page?: unknown }).page;
  if (!page || page === el || typeof page !== 'object') return null;
  return page as Base;
}
