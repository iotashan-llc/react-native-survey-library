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
import type { Descriptor } from './descriptors';

export type ModelTypeStatus =
  'supported' | 'planned' | 'internal-base' | 'unsupported';

/**
 * Safe-construction metadata for the manifest's construction gate (review
 * round 3): the test suite iterates EVERY entry carrying this — constructs
 * a disposable fixture, computes the ACTUAL template / dispatch route /
 * dispatch key, and compares all three against the entry's descriptor row
 * (not a hand-hardcoded expectation). Every `supported` classification
 * entry MUST carry this (enforced by `diffManifestConsistency`), so the
 * gate scales automatically as milestones land instead of silently
 * covering only `empty`.
 */
export interface RuntimeRenderableMeta {
  /** What `question.getTemplate()` must return for a fresh fixture. */
  expectedTemplate: string;
  /**
   * Which dispatch route a fresh fixture must take
   * (`isDefaultRendering()` -> 'template', else 'renderer').
   */
  expectedRoute: 'template' | 'renderer';
  /**
   * Element JSON for the fixture (default `{ type: <name> }`); a
   * renderer-route entry sets `renderAs` here.
   */
  fixtureJson?: Record<string, unknown>;
}

export interface ModelTypeClassification {
  status: ModelTypeStatus;
  milestone?: string;
  reason?: string;
  runtimeRenderable?: RuntimeRenderableMeta;
}

/**
 * Descriptor questionTypes that are RUNTIME TEMPLATES, not serializer
 * class names: `QuestionCustomModel.getTemplate() -> 'custom'` /
 * `QuestionCompositeModel -> 'composite'` (question_custom.ts:797,1112).
 * They never appear in `Serializer.getChildrenClasses('question')`, so
 * `diffManifestConsistency` exempts their descriptor rows from the
 * class-name gate (their coverage lives in the ComponentCollection
 * fixture tests instead).
 */
export const RUNTIME_TEMPLATE_TYPES: ReadonlySet<string> = new Set([
  'custom',
  'composite',
]);

export const MODEL_TYPE_CLASSIFICATION: Readonly<
  Record<string, ModelTypeClassification>
> = {
  empty: {
    status: 'supported',
    milestone: 'M0',
    runtimeRenderable: { expectedTemplate: 'empty', expectedRoute: 'template' },
  },

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
  expression: {
    status: 'supported',
    milestone: 'M1',
    reason: 'task 1.15',
    runtimeRenderable: {
      expectedTemplate: 'expression',
      expectedRoute: 'template',
    },
  },
  text: {
    status: 'supported',
    milestone: 'M1',
    reason: 'task 1.10',
    runtimeRenderable: { expectedTemplate: 'text', expectedRoute: 'template' },
  },
  comment: {
    status: 'supported',
    milestone: 'M1',
    reason: 'task 1.11',
    runtimeRenderable: {
      expectedTemplate: 'comment',
      expectedRoute: 'template',
    },
  },
  checkbox: {
    status: 'supported',
    milestone: 'M1',
    reason: 'task 1.12',
    runtimeRenderable: {
      expectedTemplate: 'checkbox',
      expectedRoute: 'template',
      fixtureJson: { type: 'checkbox', choices: ['a', 'b'] },
    },
  },
  radiogroup: {
    status: 'supported',
    milestone: 'M1',
    reason: 'task 1.12',
    runtimeRenderable: {
      expectedTemplate: 'radiogroup',
      expectedRoute: 'template',
      fixtureJson: { type: 'radiogroup', choices: ['a', 'b'] },
    },
  },
  boolean: {
    status: 'supported',
    milestone: 'M1',
    reason: 'task 1.13',
    // Default fixture (`{ type: 'boolean' }`) exercises the default
    // (switch) renderAs mode — the "checkbox"/"radio" renderer-route rows
    // are covered by descriptors.test.ts / register-all's dual
    // registration, not by this single-fixture construction gate (design:
    // manifest.ts's `runtimeRenderable` covers ONE fixture per
    // classification entry).
    runtimeRenderable: {
      expectedTemplate: 'boolean',
      expectedRoute: 'template',
    },
  },
  rating: {
    status: 'supported',
    milestone: 'M1',
    reason: 'task 1.14',
    runtimeRenderable: {
      expectedTemplate: 'rating',
      expectedRoute: 'template',
    },
  },

  // Phase 2 — v0.2 (M2).
  dropdown: {
    status: 'supported',
    milestone: 'M2',
    runtimeRenderable: {
      expectedTemplate: 'dropdown',
      expectedRoute: 'template',
    },
  },
  tagbox: { status: 'planned', milestone: 'M2', reason: 'task 2.4' },
  buttongroup: {
    status: 'supported',
    milestone: 'M2',
    runtimeRenderable: {
      expectedTemplate: 'buttongroup',
      expectedRoute: 'template',
    },
  },
  multipletext: {
    status: 'supported',
    milestone: 'M2',
    runtimeRenderable: {
      expectedTemplate: 'multipletext',
      expectedRoute: 'template',
    },
  },
  imagepicker: { status: 'planned', milestone: 'M2', reason: 'task 2.7' },
  paneldynamic: {
    status: 'planned',
    milestone: 'M2',
    reason: 'task 2.8a/2.8b/2.8c',
  },
  image: {
    status: 'supported',
    milestone: 'M2',
    runtimeRenderable: { expectedTemplate: 'image', expectedRoute: 'template' },
  },

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

/**
 * Status-consistency gate between the model-type classification and the
 * descriptor table (review round 3 — the key inventories alone are
 * self-confirming, since they derive from the same table the registrar
 * walks). Returns human-readable violations; the test suite asserts the
 * live tables produce none. Parameters exist for the gate's own negative
 * tests — production callers use the defaults.
 *
 * Checks:
 * 1. Every question-route descriptor row (template/renderer) whose
 *    questionType is a serializer class name must have a classification
 *    entry with the MATCHING status (runtime templates —
 *    `RUNTIME_TEMPLATE_TYPES` — are exempt from this class-name gate).
 * 2. Every classification entry with status `supported` must have at least
 *    one supported question-route descriptor row AND carry
 *    `runtimeRenderable` safe-construction metadata (so the construction
 *    gate covers it).
 */
export function diffManifestConsistency(
  classification: Readonly<
    Record<string, ModelTypeClassification>
  > = MODEL_TYPE_CLASSIFICATION,
  descriptors: readonly Descriptor[] = DESCRIPTOR_TABLE
): string[] {
  const violations: string[] = [];

  for (const row of descriptors) {
    if (row.route === 'element') continue;
    if (RUNTIME_TEMPLATE_TYPES.has(row.questionType)) continue;
    const entry = classification[row.questionType];
    if (!entry) {
      violations.push(
        `descriptor row "${row.dispatchKey}" references questionType "${row.questionType}" with no model-type classification entry`
      );
      continue;
    }
    if (entry.status !== row.status) {
      violations.push(
        `descriptor row "${row.dispatchKey}" has status "${row.status}" but classification "${row.questionType}" is "${entry.status}"`
      );
    }
  }

  for (const [name, entry] of Object.entries(classification)) {
    if (entry.status !== 'supported') continue;
    const supportedRows = descriptors.filter(
      (row) =>
        row.questionType === name &&
        row.status === 'supported' &&
        row.route !== 'element'
    );
    if (supportedRows.length === 0) {
      violations.push(
        `classification "${name}" is supported but has no supported question-route descriptor row`
      );
    }
    if (!entry.runtimeRenderable) {
      violations.push(
        `classification "${name}" is supported but lacks runtimeRenderable safe-construction metadata`
      );
    }
  }

  return violations;
}
