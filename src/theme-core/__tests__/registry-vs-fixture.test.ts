/**
 * SCSS-parity via independent extraction fixture (design:
 * docs/design/0.6-theme-core.md, test plan #2; codex review critical 1).
 *
 * TWO independent artifacts are compared exhaustively here:
 *  - the SHIPPED registry data (`../registry-data.ts`, generated once by
 *    scripts/generate-registry-data.mjs, reviewed, maintained in TS), and
 *  - the TEST-ONLY extraction fixture
 *    (`../__fixtures__/scss-defaults.json`, the mechanical output of
 *    scripts/extract-scss-defaults.mjs parsing the reference checkout's
 *    SCSS directly).
 *
 * The comparison is only meaningful while the two stay independent — the
 * first test locks that the production modules never import the fixture.
 * Regenerate both (extract first, then generate) and re-review whenever
 * the survey-core version band bumps.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRY, MULTI_DEFAULT_JUSTIFICATIONS } from '../registry';
import fixture from '../__fixtures__/scss-defaults.json';

interface FixtureVariable {
  name: string;
  rawDefault: string | null;
  source: string;
  occurrences: { rawDefault: string | null; source: string }[];
}

const fixtureVars = fixture.variables as FixtureVariable[];
const byName = new Map(fixtureVars.map((v) => [v.name, v]));

describe('independence: production registry never imports the test-only fixture', () => {
  it.each(['registry.ts', 'registry-data.ts', 'defaults.ts', 'resolve.ts'])(
    '%s has no import/require of scss-defaults.json or the __fixtures__ dir',
    (filename) => {
      const source = readFileSync(join(__dirname, '..', filename), 'utf8');
      // Prose mentions in comments are fine; module REQUESTS are not.
      expect(source).not.toMatch(
        /(?:import|require|from)\s*\(?\s*['"][^'"]*(?:scss-defaults\.json|__fixtures__)[^'"]*['"]/
      );
    }
  );
});

describe('registry <-> scss-defaults.json fixture', () => {
  it('the registry has an entry for every variable the extractor found', () => {
    const missing = fixtureVars
      .map((v) => v.name)
      .filter((name) => !REGISTRY[name]);
    expect(missing).toEqual([]);
  });

  it('the fixture accounts for every registry entry (no registry entry is invented/unsourced)', () => {
    const unaccounted = Object.keys(REGISTRY).filter(
      (name) => !byName.has(name)
    );
    expect(unaccounted).toEqual([]);
  });

  describe('non-context-dependent entries: registry default matches the fixture default exactly (incl. null-for-null)', () => {
    const cases = Object.values(REGISTRY).filter(
      (e) => e.class !== 'context-dependent'
    );
    it.each(cases.map((e) => [e.name, e] as const))('%s', (_name, entry) => {
      const fixtureEntry = byName.get(entry.name);
      expect(fixtureEntry).toBeDefined();
      expect(entry.default).toBe(fixtureEntry?.rawDefault ?? null);
    });
  });

  describe('context-dependent entries: both normal and accent defaults appear among the fixture occurrences', () => {
    const cases = Object.values(REGISTRY).filter(
      (e) => e.class === 'context-dependent'
    );
    it.each(cases.map((e) => [e.name, e] as const))('%s', (_name, entry) => {
      const fixtureEntry = byName.get(entry.name);
      expect(fixtureEntry).toBeDefined();
      const occurrenceValues = new Set(
        fixtureEntry?.occurrences.map((o) => o.rawDefault) ?? []
      );
      expect(occurrenceValues.has(entry.default)).toBe(true);
      expect(entry.accentDefault).toBeDefined();
      expect(occurrenceValues.has(entry.accentDefault as string)).toBe(true);
    });
  });

  it("every registry entry's source ref matches the fixture's recorded source", () => {
    for (const entry of Object.values(REGISTRY)) {
      const fixtureEntry = byName.get(entry.name);
      expect(entry.source).toBe(fixtureEntry?.source);
    }
  });
});

describe('per-use fallback divergence rule (codex review major 4)', () => {
  // Every non-web-only name whose occurrences carry MORE THAN ONE distinct
  // fallback expression must either be context-dependent (the header trio,
  // where the divergence IS the context mechanism) or carry an explicit
  // justification + expose the divergent expressions as alternates for
  // 0.7's per-consumer recipes. Web-only names are ignored by design
  // (documented non-goal) and exempt.
  const multiDefault = fixtureVars.filter((v) => {
    const distinct = new Set(
      v.occurrences.map((o) => o.rawDefault).filter((d) => d !== null)
    );
    return distinct.size > 1;
  });

  it('the divergent-name set is non-empty (this rule actually bites — e.g. --sjs-border-default)', () => {
    expect(multiDefault.map((v) => v.name)).toContain('--sjs-border-default');
  });

  it.each(multiDefault.map((v) => [v.name, v] as const))(
    '%s: context-dependent, web-only, or justified with alternates exposed',
    (_name, v) => {
      const entry = REGISTRY[v.name];
      expect(entry).toBeDefined();
      if (!entry) return;
      if (entry.class === 'context-dependent' || entry.class === 'web-only') {
        return;
      }
      expect(MULTI_DEFAULT_JUSTIFICATIONS[v.name]).toBeTruthy();
      const divergent = [
        ...new Set(
          v.occurrences
            .map((o) => o.rawDefault)
            .filter((d): d is string => d !== null && d !== entry.default)
        ),
      ];
      const alternateExpressions = (entry.alternates ?? []).map(
        (a) => a.expression
      );
      expect(alternateExpressions).toEqual(expect.arrayContaining(divergent));
    }
  );
});

describe('explicit grammar assignments (codex review major 5 — no suffix-heuristic misclassifications)', () => {
  const EXPECTED_GRAMMAR_KINDS: Record<string, string> = {
    // semantic background colors — previously misclassified as strings
    '--sjs-editor-background': 'color',
    '--sjs-question-background': 'color',
    '--sjs-editorpanel-backcolor': 'color',
    '--sjs-questionpanel-backcolor': 'color',
    '--sjs-editorpanel-hovercolor': 'color',
    '--sjs-questionpanel-hovercolor': 'color',
    // hex-color default despite the 'shadow' name — previously shadow
    '--sjs-special-shadow': 'color',
    // 20px literal default — previously forced calc
    '--sjs-font-headerdescription-size': 'length',
    // calc-dialect defaults — previously classified length
    '--sjs-font-headertitle-size': 'calc',
    '--sjs-font-pagetitle-size': 'calc',
    '--sjs-font-surveytitle-size': 'calc',
    // sanity pins
    '--sjs-editorpanel-cornerRadius': 'length',
    '--sjs-questionpanel-cornerRadius': 'length',
    '--sjs-font-size': 'length',
    '--sjs-font-family': 'string',
    '--sjs-font-surveytitle-weight': 'fontWeight',
    '--sjs-article-font-default-fontSize': 'length',
    '--base-unit': 'length',
    '--primary': 'color',
  };

  it.each(Object.entries(EXPECTED_GRAMMAR_KINDS))(
    '%s has grammar kind %s',
    (name, kind) => {
      expect(REGISTRY[name]?.grammar.kind).toBe(kind);
    }
  );
});
