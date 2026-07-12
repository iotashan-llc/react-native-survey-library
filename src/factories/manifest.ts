/**
 * Coverage manifest (design: docs/design/0.5-factories.md, "Coverage
 * manifest"). Two classified inventories, gated separately:
 *
 * 1. `MODEL_TYPE_CLASSIFICATION` — every survey-core question class name
 *    this library knows about, classified `supported | planned |
 *    internal-base | unsupported`, compared against
 *    `Serializer.getChildrenClasses("question", true)` BY NAME ONLY — never
 *    construction. Blind construction is unsafe as an oracle:
 *    `canBeCreated` includes creator-bearing internal bases
 *    (`textbase`/`nonvalue`/`matrixdropdownbase` all have a `creator` but
 *    are never used as a standalone JSON `type`), and ComponentCollection
 *    types share the same global list, so constructing them runs consumer
 *    callbacks and mutates shared state. A new upstream class name is a
 *    named CI diff even when it reuses a parent's template key
 *    (jsonobject.ts:1191-1201) — a key-set-only design could not detect
 *    that; see the "genuinely new upstream class name" test.
 *
 *    Milestone assignments below are sourced from
 *    docs/IMPLEMENTATION-PLAN.md's phase table (task IDs cited in `reason`).
 *
 * 2. `QUESTION_KEY_INVENTORY` / `ELEMENT_KEY_INVENTORY` — dispatch keys
 *    DERIVED from the descriptor table's `supported` rows (the single
 *    source of registration truth — nothing here is hand-duplicated),
 *    exact-checked against the live `RNQuestionFactory` /
 *    `RNElementFactory` after the registrar has run. Checked separately:
 *    the two factories have disjoint keyspaces, so one merged inventory
 *    could not exact-match both.
 */
import { DESCRIPTOR_TABLE } from './descriptors';

export type ModelTypeStatus =
  'supported' | 'planned' | 'internal-base' | 'unsupported';

export interface ModelTypeClassification {
  status: ModelTypeStatus;
  milestone?: string;
  reason?: string;
}

export const MODEL_TYPE_CLASSIFICATION: Readonly<
  Record<string, ModelTypeClassification>
> = {
  empty: { status: 'supported', milestone: 'M0' },

  // Creator-bearing internal bases: `canBeCreated` includes them, but they
  // are never used as a standalone JSON `type` — real questions extend
  // them (textbase -> text/comment, nonvalue -> html/image,
  // matrixdropdownbase -> matrixdropdown/matrixdynamic).
  textbase: {
    status: 'internal-base',
    reason: 'Abstract base for text/comment; never a standalone JSON type.',
  },
  nonvalue: {
    status: 'internal-base',
    reason: 'Abstract base for html/image; never a standalone JSON type.',
  },
  matrixdropdownbase: {
    status: 'internal-base',
    reason:
      'Abstract base for matrixdropdown/matrixdynamic; never a standalone JSON type.',
  },

  // Phase 1 — v0.1 (M1).
  expression: { status: 'planned', milestone: 'M1', reason: 'task 1.15' },
  text: { status: 'planned', milestone: 'M1', reason: 'task 1.10' },
  comment: { status: 'planned', milestone: 'M1', reason: 'task 1.11' },
  checkbox: { status: 'planned', milestone: 'M1', reason: 'task 1.12' },
  radiogroup: { status: 'planned', milestone: 'M1', reason: 'task 1.12' },
  boolean: { status: 'planned', milestone: 'M1', reason: 'task 1.13' },
  rating: { status: 'planned', milestone: 'M1', reason: 'task 1.14' },

  // Phase 2 — v0.2 (M2).
  dropdown: { status: 'planned', milestone: 'M2', reason: 'task 2.3' },
  tagbox: { status: 'planned', milestone: 'M2', reason: 'task 2.4' },
  buttongroup: { status: 'planned', milestone: 'M2', reason: 'task 2.9' },
  multipletext: { status: 'planned', milestone: 'M2', reason: 'task 2.6' },
  imagepicker: { status: 'planned', milestone: 'M2', reason: 'task 2.7' },
  paneldynamic: {
    status: 'planned',
    milestone: 'M2',
    reason: 'task 2.8a/2.8b/2.8c',
  },
  image: { status: 'planned', milestone: 'M2', reason: 'task 2.10' },

  // Phase 3 — v0.3 (M3).
  matrix: { status: 'planned', milestone: 'M3', reason: 'task 3.2' },
  matrixdropdown: { status: 'planned', milestone: 'M3', reason: 'task 3.3' },
  matrixdynamic: { status: 'planned', milestone: 'M3', reason: 'task 3.4' },

  // Phase 4 — v0.4 (M4).
  ranking: { status: 'planned', milestone: 'M4', reason: 'task 4.2' },
  slider: { status: 'planned', milestone: 'M4', reason: 'task 4.4' },

  // Phase 5 — v0.5-v0.9 (M5).
  signaturepad: { status: 'planned', milestone: 'M5', reason: 'task 5.1' },
  file: { status: 'planned', milestone: 'M5', reason: 'task 5.2' },
  html: { status: 'planned', milestone: 'M5', reason: 'task 5.3' },
  imagemap: { status: 'planned', milestone: 'M5', reason: 'task 5.4' },
};

export interface ModelTypeInventoryDiff {
  /** Classified here, but no longer present in the live survey-core build. */
  missingFromLive: string[];
  /** Present in the live survey-core build, but not yet classified here. */
  unclassified: string[];
}

export function diffModelTypeInventory(
  liveNames: readonly string[]
): ModelTypeInventoryDiff {
  const classified = new Set(Object.keys(MODEL_TYPE_CLASSIFICATION));
  const live = new Set(liveNames);
  return {
    missingFromLive: Array.from(classified)
      .filter((name) => !live.has(name))
      .sort(),
    unclassified: Array.from(live)
      .filter((name) => !classified.has(name))
      .sort(),
  };
}

export interface KeyInventoryEntry {
  dispatchKey: string;
  questionType: string;
  milestone: string;
}

function keyInventoryFor(
  route: 'template' | 'renderer' | 'element'
): KeyInventoryEntry[] {
  return DESCRIPTOR_TABLE.filter(
    (row) =>
      row.status === 'supported' &&
      (route === 'template'
        ? row.route === 'template' || row.route === 'renderer'
        : row.route === route)
  ).map((row) => {
    if (row.status !== 'supported') throw new Error('unreachable');
    return {
      dispatchKey: row.dispatchKey,
      questionType: row.questionType,
      milestone: row.milestone,
    };
  });
}

/** Template + renderer-route dispatch keys, owning milestone. */
export const QUESTION_KEY_INVENTORY: readonly KeyInventoryEntry[] =
  keyInventoryFor('template');

/** Element-route dispatch keys, owning milestone (disjoint keyspace). */
export const ELEMENT_KEY_INVENTORY: readonly KeyInventoryEntry[] =
  keyInventoryFor('element');

export interface KeyInventoryDiff {
  /** In the inventory, but not registered live. */
  missing: string[];
  /** Registered live, but not in the inventory. */
  unexpected: string[];
}

export function diffKeyInventory(
  inventory: readonly KeyInventoryEntry[],
  liveKeys: readonly string[]
): KeyInventoryDiff {
  const expected = new Set(inventory.map((entry) => entry.dispatchKey));
  const live = new Set(liveKeys);
  return {
    missing: Array.from(expected)
      .filter((key) => !live.has(key))
      .sort(),
    unexpected: Array.from(live)
      .filter((key) => !expected.has(key))
      .sort(),
  };
}
