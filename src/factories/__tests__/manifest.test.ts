/**
 * Coverage manifest gates (design: docs/design/0.5-factories.md, "Coverage
 * manifest", test plan #5). Two inventories, exact-checked separately
 * (disjoint keyspaces — one merged inventory can't exact-match both
 * factories):
 *
 * 1. Model-type inventory: every survey-core question CLASS NAME (by name
 *    only — never construction, see design rationale) vs.
 *    `Serializer.getChildrenClasses("question", true)`.
 * 2. Question-key / element-key inventories: dispatch keys derived from the
 *    descriptor table's `supported` rows vs. the live factories, AFTER
 *    importing the package entry (register-all's side effect).
 */
import { ComponentCollection, Model, Serializer } from '../../core/facade';
import '../../factories/register-all';
import { RNQuestionFactory } from '../QuestionFactory';
import { RNElementFactory } from '../ElementFactory';
import {
  MODEL_TYPE_CLASSIFICATION,
  QUESTION_KEY_INVENTORY,
  ELEMENT_KEY_INVENTORY,
  RUNTIME_TEMPLATE_TYPES,
  diffModelTypeInventory,
  diffKeyInventory,
  diffManifestConsistency,
} from '../manifest';
import type { ModelTypeClassification } from '../manifest';
import { DESCRIPTOR_TABLE } from '../descriptors';
import type { Descriptor } from '../descriptors';

function liveQuestionClassNames(): string[] {
  return Serializer.getChildrenClasses('question', true).map((c) => c.name);
}

describe('manifest: model-type inventory', () => {
  it('classifies every live survey-core question class name — no missing, no unclassified', () => {
    const diff = diffModelTypeInventory(liveQuestionClassNames());
    expect(diff.unclassified).toEqual([]);
    expect(diff.missingFromLive).toEqual([]);
  });

  it('every classification entry has a valid status', () => {
    const validStatuses = new Set([
      'supported',
      'planned',
      'internal-base',
      'unsupported',
    ]);
    for (const [name, entry] of Object.entries(MODEL_TYPE_CLASSIFICATION)) {
      expect(validStatuses.has(entry.status)).toBe(true);
      if (entry.status === 'internal-base') {
        expect(entry.reason).toBeTruthy();
      }
      // sanity: the table key IS the lowercase survey-core class name.
      expect(name).toBe(name.toLowerCase());
    }
  });

  it('"empty"/"text"/"rating" are classified supported (M0/M1); "matrix" is still classified planned with a milestone', () => {
    expect(MODEL_TYPE_CLASSIFICATION.empty).toMatchObject({
      status: 'supported',
      milestone: 'M0',
    });
    expect(MODEL_TYPE_CLASSIFICATION.text).toMatchObject({
      status: 'supported',
      milestone: 'M1',
    });
    expect(MODEL_TYPE_CLASSIFICATION.rating).toMatchObject({
      status: 'supported',
      milestone: 'M1',
    });
    expect(MODEL_TYPE_CLASSIFICATION.matrix).toMatchObject({
      status: 'planned',
      milestone: 'M3',
    });
  });

  it('"html" is classified supported/M2 (pulled forward from M5) with runtimeRenderable metadata', () => {
    expect(MODEL_TYPE_CLASSIFICATION.html).toMatchObject({
      status: 'supported',
      milestone: 'M2',
    });
    expect(MODEL_TYPE_CLASSIFICATION.html?.runtimeRenderable).toMatchObject({
      expectedTemplate: 'html',
      expectedRoute: 'template',
    });
  });

  it('"comment"/"checkbox"/"radiogroup" (task 1.11/1.12) are classified supported/M1 with runtimeRenderable metadata', () => {
    for (const key of ['comment', 'checkbox', 'radiogroup'] as const) {
      expect(MODEL_TYPE_CLASSIFICATION[key]).toMatchObject({
        status: 'supported',
        milestone: 'M1',
      });
      expect(MODEL_TYPE_CLASSIFICATION[key]?.runtimeRenderable).toBeTruthy();
    }
  });

  it('"textbase" and "nonvalue" are classified internal-base (creator-bearing abstract bases, never a standalone JSON type)', () => {
    expect(MODEL_TYPE_CLASSIFICATION.textbase?.status).toBe('internal-base');
    expect(MODEL_TYPE_CLASSIFICATION.nonvalue?.status).toBe('internal-base');
  });

  it('a genuinely new upstream class name is caught even if it were to reuse a parent template key (name-diff, not key-diff)', () => {
    // Simulates jsonobject.ts:1191-1201's scenario: a brand-new Serializer
    // class name whose getTemplate() happens to collide with an existing
    // key. The model-type inventory diffs by NAME, so this must surface as
    // "unclassified" even though nothing about its template key changed.
    const live = [...liveQuestionClassNames(), 'totally-new-question-type'];
    const diff = diffModelTypeInventory(live);
    expect(diff.unclassified).toEqual(['totally-new-question-type']);
  });
});

describe('manifest: question-key / element-key inventories', () => {
  it('QUESTION_KEY_INVENTORY exactly matches RNQuestionFactory.getAllTypes() after the registrar has run', () => {
    const diff = diffKeyInventory(
      QUESTION_KEY_INVENTORY,
      RNQuestionFactory.getAllTypes()
    );
    expect(diff.missing).toEqual([]);
    expect(diff.unexpected).toEqual([]);
  });

  it('ELEMENT_KEY_INVENTORY exactly matches RNElementFactory.getAllTypes() after the registrar has run', () => {
    const diff = diffKeyInventory(
      ELEMENT_KEY_INVENTORY,
      RNElementFactory.getAllTypes()
    );
    expect(diff.missing).toEqual([]);
    expect(diff.unexpected).toEqual([]);
  });

  it('QUESTION_KEY_INVENTORY is derived from (and only from) descriptor rows with status "supported" and route template/renderer', () => {
    const expectedKeys = DESCRIPTOR_TABLE.filter(
      (r) =>
        r.status === 'supported' &&
        (r.route === 'template' || r.route === 'renderer')
    ).map((r) => r.dispatchKey);
    expect(QUESTION_KEY_INVENTORY.map((e) => e.dispatchKey).sort()).toEqual(
      expectedKeys.sort()
    );
  });

  it('detects a spurious extra registration as "unexpected"', () => {
    const diff = diffKeyInventory(QUESTION_KEY_INVENTORY, [
      ...RNQuestionFactory.getAllTypes(),
      'sv-not-in-any-descriptor',
    ]);
    expect(diff.unexpected).toEqual(['sv-not-in-any-descriptor']);
  });

  it('detects a missing registration as "missing"', () => {
    const diff = diffKeyInventory(QUESTION_KEY_INVENTORY, []);
    expect(diff.missing).toEqual(
      QUESTION_KEY_INVENTORY.map((e) => e.dispatchKey).sort()
    );
  });
});

describe('manifest: classification/descriptor status consistency', () => {
  it('the live tables are mutually consistent (no violations)', () => {
    expect(diffManifestConsistency()).toEqual([]);
  });

  it('detects a supported classification entry with no supported descriptor row', () => {
    const classification: Record<string, ModelTypeClassification> = {
      ...MODEL_TYPE_CLASSIFICATION,
      bogus: {
        status: 'supported',
        milestone: 'M9',
        runtimeRenderable: {
          expectedTemplate: 'bogus',
          expectedRoute: 'template',
        },
      },
    };
    const violations = diffManifestConsistency(
      classification,
      DESCRIPTOR_TABLE
    );
    expect(violations.some((v) => v.includes('bogus'))).toBe(true);
  });

  it('detects a supported descriptor row whose model-type classification is not supported', () => {
    // 'imagepicker' is still classified 'planned' (task 2.7, M2) — a
    // supported descriptor row for it is the inconsistency this test
    // wants ('text'/'checkbox' can't be reused here anymore: tasks
    // 1.10/1.12 landed them as genuinely supported on both sides).
    const descriptors: Descriptor[] = [
      ...DESCRIPTOR_TABLE,
      {
        status: 'supported',
        questionType: 'matrix',
        dispatchKey: 'matrix',
        route: 'template',
        component: () => (() => null) as never,
        milestone: 'M3',
      },
    ];
    const violations = diffManifestConsistency(
      MODEL_TYPE_CLASSIFICATION,
      descriptors
    );
    expect(violations.some((v) => v.includes('matrix'))).toBe(true);
  });

  it('detects a supported classification entry lacking runtimeRenderable safe-construction metadata', () => {
    const classification: Record<string, ModelTypeClassification> = {
      ...MODEL_TYPE_CLASSIFICATION,
      empty: { status: 'supported', milestone: 'M0' },
    };
    const violations = diffManifestConsistency(
      classification,
      DESCRIPTOR_TABLE
    );
    expect(violations.some((v) => v.includes('runtimeRenderable'))).toBe(true);
  });

  it('runtime-template descriptor rows (custom/composite) are exempt from the class-name gate, by the documented set', () => {
    expect(Array.from(RUNTIME_TEMPLATE_TYPES).sort()).toEqual([
      'composite',
      'custom',
    ]);
    // ...and the live-table consistency above already passes with those
    // rows present, proving the exemption works.
  });
});

describe('manifest: safe-construction template assertions', () => {
  const renderableEntries = Object.entries(MODEL_TYPE_CLASSIFICATION).filter(
    ([, entry]) => entry.runtimeRenderable
  );

  it('every supported classification entry is covered by the construction gate (metadata present)', () => {
    const supportedNames = Object.entries(MODEL_TYPE_CLASSIFICATION)
      .filter(([, entry]) => entry.status === 'supported')
      .map(([name]) => name)
      .sort();
    const renderableNames = renderableEntries.map(([name]) => name).sort();
    expect(renderableNames).toEqual(supportedNames);
    expect(renderableNames.length).toBeGreaterThan(0);
  });

  it('EVERY runtime-renderable entry constructs; its actual template, dispatch route, and descriptor row all match the metadata (disposed in finally)', () => {
    expect(renderableEntries.length).toBeGreaterThan(0);
    for (const [name, entry] of renderableEntries) {
      const meta = entry.runtimeRenderable!;
      const fixtureJson = {
        ...(meta.fixtureJson ?? { type: name }),
        name: 'q1',
      };
      const model = new Model({ elements: [fixtureJson] });
      try {
        const question = model.getQuestionByName('q1');
        expect(question).toBeTruthy();
        expect(question!.getTemplate()).toBe(meta.expectedTemplate);

        const actualRoute = question!.isDefaultRendering()
          ? 'template'
          : 'renderer';
        expect(actualRoute).toBe(meta.expectedRoute);
        const actualDispatchKey =
          actualRoute === 'template'
            ? question!.getTemplate()
            : question!.getComponentName();

        const row = DESCRIPTOR_TABLE.find(
          (r) => r.dispatchKey === actualDispatchKey
        );
        expect(row).toBeTruthy();
        expect(row!.status).toBe('supported');
        expect(row!.route).toBe(meta.expectedRoute);
        expect(row!.questionType).toBe(name);
      } finally {
        model.dispose();
      }
    }
  });

  it('a ComponentCollection "custom" fixture (elementsJSON absent) reports getTemplate() === "custom", never the registered name — added then removed', () => {
    const FIXTURE_NAME = 'manifest-fixture-custom-0-5';
    ComponentCollection.Instance.add({
      name: FIXTURE_NAME,
      questionJSON: { type: 'text' },
    });
    try {
      const model = new Model({
        elements: [{ type: FIXTURE_NAME, name: 'q1' }],
      });
      try {
        const question = model.getQuestionByName('q1');
        expect(question?.getTemplate()).toBe('custom');
        expect(question?.getTemplate()).not.toBe(FIXTURE_NAME);
      } finally {
        model.dispose();
      }
    } finally {
      ComponentCollection.Instance.remove(FIXTURE_NAME);
    }
  });

  it('a ComponentCollection "composite" fixture (elementsJSON present) reports getTemplate() === "composite", never the registered name — added then removed', () => {
    const FIXTURE_NAME = 'manifest-fixture-composite-0-5';
    ComponentCollection.Instance.add({
      name: FIXTURE_NAME,
      elementsJSON: [{ type: 'text', name: 'inner' }],
    });
    try {
      const model = new Model({
        elements: [{ type: FIXTURE_NAME, name: 'q1' }],
      });
      try {
        const question = model.getQuestionByName('q1');
        expect(question?.getTemplate()).toBe('composite');
        expect(question?.getTemplate()).not.toBe(FIXTURE_NAME);
      } finally {
        model.dispose();
      }
    } finally {
      ComponentCollection.Instance.remove(FIXTURE_NAME);
    }
  });
});
