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

  it('classifies an accessor replaced by a non-function data property as breaking (getter logic gone)', () => {
    const harvested: readonly HarvestedApiMember[] = [
      { id: 'X.method', kind: 'method' },
      { id: 'X.accessor', kind: 'data' },
    ];
    const diff = diffApiSurface(watchlist, harvested);
    expect(diff.breaking).toEqual([expect.stringContaining('X.accessor')]);
    expect(diff.relevant).toEqual([]);
  });

  it('classifies an accessor replaced by a setter-only accessor as breaking (read contract gone)', () => {
    const harvested: readonly HarvestedApiMember[] = [
      { id: 'X.method', kind: 'method' },
      { id: 'X.accessor', kind: 'setter-only' },
    ];
    const diff = diffApiSurface(watchlist, harvested);
    expect(diff.breaking).toEqual([expect.stringContaining('X.accessor')]);
    expect(diff.relevant).toEqual([]);
  });

  it('classifies a method replaced by a non-function data property as breaking (call site would throw)', () => {
    const harvested: readonly HarvestedApiMember[] = [
      { id: 'X.method', kind: 'data' },
      { id: 'X.accessor', kind: 'accessor' },
    ];
    const diff = diffApiSurface(watchlist, harvested);
    expect(diff.breaking).toEqual([expect.stringContaining('X.method')]);
    expect(diff.relevant).toEqual([]);
  });

  it('classifies an accessor replaced by a method as relevant, not breaking (still computed; needs review)', () => {
    const harvested: readonly HarvestedApiMember[] = [
      { id: 'X.method', kind: 'method' },
      { id: 'X.accessor', kind: 'method' },
    ];
    const diff = diffApiSurface(watchlist, harvested);
    expect(diff.relevant).toEqual([expect.stringContaining('X.accessor')]);
    expect(diff.breaking).toEqual([]);
  });

  it('classifies an expected data member that became an accessor as relevant, not breaking', () => {
    const dataWatchlist: readonly WatchedApiMember[] = [
      {
        id: 'X.data',
        member: 'data',
        expectedKind: 'data',
        resolveHost: () => ({}),
        reason: 'test fixture',
      },
    ];
    const diff = diffApiSurface(dataWatchlist, [
      { id: 'X.data', kind: 'accessor' },
    ]);
    expect(diff.relevant).toEqual([expect.stringContaining('X.data')]);
    expect(diff.breaking).toEqual([]);
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

  function watchOne(host: unknown): readonly WatchedApiMember[] {
    return [
      {
        id: 'H.thing',
        member: 'thing',
        expectedKind: 'accessor',
        resolveHost: () => host,
        reason: 'test fixture',
      },
    ];
  }

  it('classifies a non-function data property as data, never accessor', () => {
    expect(harvestApiSurface(facade, watchOne({ thing: 42 }))).toEqual([
      { id: 'H.thing', kind: 'data' },
    ]);
  });

  it('classifies an undefined-valued data property as data (present but valueless), never accessor', () => {
    const host: Record<string, unknown> = {};
    Object.defineProperty(host, 'thing', {
      value: undefined,
      configurable: true,
    });
    expect(harvestApiSurface(facade, watchOne(host))).toEqual([
      { id: 'H.thing', kind: 'data' },
    ]);
  });

  it('classifies a setter-without-getter as setter-only, never accessor', () => {
    const host = {};
    Object.defineProperty(host, 'thing', {
      set: () => {},
      configurable: true,
    });
    expect(harvestApiSurface(facade, watchOne(host))).toEqual([
      { id: 'H.thing', kind: 'setter-only' },
    ]);
  });

  it('classifies both getter-only and getter+setter descriptors as accessor', () => {
    const getterOnly = {
      get thing(): number {
        return 1;
      },
    };
    const getterAndSetter = {
      get thing(): number {
        return 1;
      },
      set thing(_v: number) {},
    };
    expect(harvestApiSurface(facade, watchOne(getterOnly))).toEqual([
      { id: 'H.thing', kind: 'accessor' },
    ]);
    expect(harvestApiSurface(facade, watchOne(getterAndSetter))).toEqual([
      { id: 'H.thing', kind: 'accessor' },
    ]);
  });
});

describe('end-to-end synthetic drift through the full harvest+diff pipeline (live-independent)', () => {
  function watchAccessor(host: unknown): readonly WatchedApiMember[] {
    return [
      {
        id: 'S.member',
        member: 'member',
        expectedKind: 'accessor',
        resolveHost: () => host,
        reason: 'test fixture',
      },
    ];
  }

  it('a watched accessor downgraded to an undefined-valued data property fails the gate as breaking', () => {
    const host: Record<string, unknown> = {};
    Object.defineProperty(host, 'member', {
      value: undefined,
      configurable: true,
    });
    const watchlist = watchAccessor(host);
    const diff = diffApiSurface(
      watchlist,
      harvestApiSurface(facade, watchlist)
    );
    expect(diff.breaking).toEqual([expect.stringContaining('S.member')]);
    expect(diff.relevant).toEqual([]);
  });

  it('a watched accessor downgraded to a setter-only accessor fails the gate as breaking', () => {
    const host = {};
    Object.defineProperty(host, 'member', {
      set: () => {},
      configurable: true,
    });
    const watchlist = watchAccessor(host);
    const diff = diffApiSurface(
      watchlist,
      harvestApiSurface(facade, watchlist)
    );
    expect(diff.breaking).toEqual([expect.stringContaining('S.member')]);
    expect(diff.relevant).toEqual([]);
  });
});

describe('0.8 classified-drift gate: installed survey-core vs. the committed renderer-relevant baseline', () => {
  it('the installed survey-core matches every watched member (breaking and relevant are both empty)', () => {
    const harvested = harvestApiSurface(facade, API_SURFACE_WATCHLIST);
    const diff = diffApiSurface(API_SURFACE_WATCHLIST, harvested);
    expect(diff).toEqual({ breaking: [], relevant: [] });
  });

  it.each([
    // Production binding: UnsupportedQuestion's default presentation reads
    // question.title (components/UnsupportedQuestion.tsx).
    'Question.title',
    // Production binding: QuestionElementBase's custom-widget-ignored
    // diagnostic reads widget.name off the discovered QuestionCustomWidget.
    'QuestionCustomWidget.name',
    // Design-contract observable: 0.4's subscription-leak tests are built
    // entirely on this getter — it is the only observable of the
    // subscribe/unsubscribe contract.
    'Base.hasActiveUISubscribers',
  ])('watches %s (source-inventory contract)', (id) => {
    expect(API_SURFACE_WATCHLIST.map((entry) => entry.id)).toContain(id);
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
