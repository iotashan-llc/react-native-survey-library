/**
 * Classified-drift API gate (design: docs/design/0.8-parity-harness.md,
 * A12). Covers the renderer-relevant survey-core API surface OUTSIDE the
 * question-type/dispatch-key manifest 0.5 already gates
 * (`src/factories/manifest.ts`) — not duplicated here.
 */
import * as facade from '../facade';
import {
  API_SURFACE_WATCHLIST,
  diffApiSurface,
  harvestApiSurface,
  type WatchedApiMember,
  type HarvestedApiMember,
} from '../api-surface';

describe('diffApiSurface (pure, synthetic fixtures)', () => {
  const watchlist: readonly WatchedApiMember[] = [
    {
      id: 'X.method',
      member: 'method',
      expectedKind: 'method',
      resolveHost: () => ({}),
      reason: 'test fixture',
    },
    {
      id: 'X.accessor',
      member: 'accessor',
      expectedKind: 'accessor',
      resolveHost: () => ({}),
      reason: 'test fixture',
    },
  ];

  it('reports no drift when the harvested shape matches the watchlist', () => {
    const harvested: readonly HarvestedApiMember[] = [
      { id: 'X.method', kind: 'method' },
      { id: 'X.accessor', kind: 'accessor' },
    ];
    expect(diffApiSurface(watchlist, harvested)).toEqual({
      breaking: [],
      relevant: [],
    });
  });

  it('classifies a removed watched member as breaking', () => {
    const harvested: readonly HarvestedApiMember[] = [
      { id: 'X.method', kind: 'missing' },
      { id: 'X.accessor', kind: 'accessor' },
    ];
    const diff = diffApiSurface(watchlist, harvested);
    expect(diff.breaking).toEqual([expect.stringContaining('X.method')]);
    expect(diff.relevant).toEqual([]);
  });

  it('classifies a present-but-reshaped watched member (method -> accessor) as relevant, not breaking', () => {
    const harvested: readonly HarvestedApiMember[] = [
      { id: 'X.method', kind: 'accessor' },
      { id: 'X.accessor', kind: 'accessor' },
    ];
    const diff = diffApiSurface(watchlist, harvested);
    expect(diff.relevant).toEqual([expect.stringContaining('X.method')]);
    expect(diff.breaking).toEqual([]);
  });

  it('treats a watchlist id absent from the harvest entirely as missing (breaking)', () => {
    const diff = diffApiSurface(watchlist, []);
    expect(diff.breaking).toHaveLength(2);
    expect(diff.relevant).toEqual([]);
  });
});

describe('harvestApiSurface (reflection helpers)', () => {
  it('a throwing resolveHost (e.g. a removed top-level export) reports missing, not a crash', () => {
    const watchlist: readonly WatchedApiMember[] = [
      {
        id: 'Gone.thing',
        member: 'thing',
        expectedKind: 'method',
        resolveHost: () => {
          throw new Error('export removed');
        },
        reason: 'test fixture',
      },
    ];
    expect(harvestApiSurface(facade, watchlist)).toEqual([
      { id: 'Gone.thing', kind: 'missing' },
    ]);
  });

  it('a nullish resolved host reports missing', () => {
    const watchlist: readonly WatchedApiMember[] = [
      {
        id: 'Nully.thing',
        member: 'thing',
        expectedKind: 'method',
        resolveHost: () => undefined,
        reason: 'test fixture',
      },
    ];
    expect(harvestApiSurface(facade, watchlist)).toEqual([
      { id: 'Nully.thing', kind: 'missing' },
    ]);
  });

  it('finds an inherited member up the prototype chain (ownership is not always the leaf class)', () => {
    class Grandparent {
      inherited(): void {}
    }
    class Parent extends Grandparent {}
    class Child extends Parent {}
    const watchlist: readonly WatchedApiMember[] = [
      {
        id: 'Child.inherited',
        member: 'inherited',
        expectedKind: 'method',
        resolveHost: () => Child.prototype,
        reason: 'test fixture',
      },
    ];
    expect(harvestApiSurface(facade, watchlist)).toEqual([
      { id: 'Child.inherited', kind: 'method' },
    ]);
  });
});

describe('0.8 classified-drift gate: installed survey-core vs. the committed renderer-relevant baseline', () => {
  it('the installed survey-core matches every watched member (breaking and relevant are both empty)', () => {
    const harvested = harvestApiSurface(facade, API_SURFACE_WATCHLIST);
    const diff = diffApiSurface(API_SURFACE_WATCHLIST, harvested);
    expect(diff).toEqual({ breaking: [], relevant: [] });
  });
});

describe('end-to-end simulated drift against the REAL installed survey-core (proves the gate works)', () => {
  it('flags a deleted Question.prototype.getComponentName as breaking, then restores it', () => {
    const proto = facade.Question.prototype as unknown as Record<
      string,
      unknown
    >;
    const original = Object.getOwnPropertyDescriptor(proto, 'getComponentName');
    // Guards the restore contract below: if this ever stops being a direct
    // own property of Question.prototype (e.g. survey-core moves it up the
    // chain like it does with getTemplate/name), this test's delete would
    // silently no-op instead of simulating anything.
    expect(original).toBeDefined();
    delete proto.getComponentName;
    try {
      const harvested = harvestApiSurface(facade, API_SURFACE_WATCHLIST);
      const diff = diffApiSurface(API_SURFACE_WATCHLIST, harvested);
      expect(
        diff.breaking.some((message) =>
          message.startsWith('Question.getComponentName:')
        )
      ).toBe(true);
    } finally {
      Object.defineProperty(proto, 'getComponentName', original!);
    }
    // Restore proven: the live gate is clean again immediately after.
    const restoredHarvest = harvestApiSurface(facade, API_SURFACE_WATCHLIST);
    expect(diffApiSurface(API_SURFACE_WATCHLIST, restoredHarvest)).toEqual({
      breaking: [],
      relevant: [],
    });
  });
});
