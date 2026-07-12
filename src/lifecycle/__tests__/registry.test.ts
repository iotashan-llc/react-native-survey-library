/**
 * @jest-environment node
 */

// Design: docs/design/1.2-lifecycle-bridge.md, test plan #5 (registry
// lifecycle), #6 (fallbacks/lookup order). Real survey-core models via
// the facade (plain Node: no `document`, so survey-core takes its
// SSR-safe paths — same environment shape as RN for everything the
// registry touches); handles are plain mocks.
import { Model } from '../../core/facade';
import type { PageModel, Question } from '../../core/facade';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';
import { createLifecycleRegistry } from '../registry';
import type { ElementHandle, ScrollHostHandle } from '../types';

const MODEL_JSON = {
  pages: [
    {
      name: 'page1',
      elements: [
        { type: 'text', name: 'q1' },
        { type: 'text', name: 'q2' },
      ],
    },
  ],
};

function makeHandle(): ElementHandle {
  return { containerRef: { current: null } };
}

function makeHost(): ScrollHostHandle {
  return {
    scrollTo: jest.fn(),
    measureTarget: jest.fn(async () => null),
    getViewport: () => null,
  };
}

describe('lifecycle/registry', () => {
  let diagnostics: DiagnosticPayload[];

  beforeEach(() => {
    diagnostics = [];
    setDiagnosticHandler((payload) => diagnostics.push(payload));
  });

  afterEach(() => {
    setDiagnosticHandler(undefined);
  });

  function makeModel(): { model: InstanceType<typeof Model>; q1: Question } {
    const model = new Model(MODEL_JSON);
    const q1 = model.getQuestionByName('q1') as Question;
    expect(q1).toBeTruthy();
    return { model, q1 };
  }

  it('registerElement + getHandle: exact-instance lookup, and deregistration removes it', () => {
    const { q1 } = makeModel();
    const registry = createLifecycleRegistry();
    const handle = makeHandle();

    const deregister = registry.registerElement(q1, handle);
    expect(registry.getHandle(q1)).toBe(handle);

    deregister();
    expect(registry.getHandle(q1)).toBeUndefined();
  });

  it('re-registering the same instance replaces the handle; a STALE deregister does not remove the newer handle', () => {
    const { q1 } = makeModel();
    const registry = createLifecycleRegistry();
    const first = makeHandle();
    const second = makeHandle();

    const staleDeregister = registry.registerElement(q1, first);
    registry.registerElement(q1, second);
    expect(registry.getHandle(q1)).toBe(second);

    staleDeregister();
    expect(registry.getHandle(q1)).toBe(second);
  });

  it('registerScrollHost: last registration wins; deregister clears; stale deregister keeps the newer host', () => {
    const registry = createLifecycleRegistry();
    const first = makeHost();
    const second = makeHost();

    const staleDeregister = registry.registerScrollHost(first);
    const deregisterSecond = registry.registerScrollHost(second);
    expect(registry.getScrollHost()).toBe(second);

    staleDeregister();
    expect(registry.getScrollHost()).toBe(second);

    deregisterSecond();
    expect(registry.getScrollHost()).toBeUndefined();
  });

  it('resolveScrollTarget: exact instance resolves without the page-fallback flag', () => {
    const { q1 } = makeModel();
    const registry = createLifecycleRegistry();
    const handle = makeHandle();
    registry.registerElement(q1, handle);

    const target = registry.resolveScrollTarget(q1);
    expect(target).toEqual({
      element: q1,
      handle,
      viaPageFallback: false,
    });
    expect(diagnostics).toEqual([]);
  });

  it('resolveScrollTarget: unregistered question falls back to its registered page', () => {
    const { model, q1 } = makeModel();
    const registry = createLifecycleRegistry();
    const pageHandle = makeHandle();
    const page = model.pages[0] as PageModel;
    registry.registerElement(page, pageHandle);

    const target = registry.resolveScrollTarget(q1);
    expect(target).toEqual({
      element: page,
      handle: pageHandle,
      viaPageFallback: true,
    });
    expect(diagnostics).toEqual([]);
  });

  it('resolveScrollTarget: unresolvable target returns null and reports target-unregistered ONCE per instance', () => {
    const { q1 } = makeModel();
    const registry = createLifecycleRegistry();

    expect(registry.resolveScrollTarget(q1)).toBeNull();
    expect(registry.resolveScrollTarget(q1)).toBeNull();

    const lifecycle = diagnostics.filter(
      (p) => p.code === 'lifecycle-diagnostic'
    );
    expect(lifecycle).toHaveLength(1);
    expect(lifecycle[0]).toMatchObject({
      code: 'lifecycle-diagnostic',
      lifecycleCode: 'target-unregistered',
      elementName: 'q1',
    });
  });

  it('resolveScrollTarget: nullish input returns null with NO diagnostic', () => {
    const registry = createLifecycleRegistry();
    expect(registry.resolveScrollTarget(null)).toBeNull();
    expect(registry.resolveScrollTarget(undefined)).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it('clear drops element handles and the scroll host', () => {
    const { q1 } = makeModel();
    const registry = createLifecycleRegistry();
    registry.registerElement(q1, makeHandle());
    registry.registerScrollHost(makeHost());

    registry.clear();

    expect(registry.getHandle(q1)).toBeUndefined();
    expect(registry.getScrollHost()).toBeUndefined();
  });
});
