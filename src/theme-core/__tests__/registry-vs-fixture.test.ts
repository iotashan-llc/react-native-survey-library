/**
 * SCSS-parity via independent extraction fixture (design:
 * docs/design/0.6-theme-core.md, test plan #2 — round-2 fix: a golden of
 * the vendored table only proves self-consistency; this instead compares
 * the hand-authored registry against `scss-defaults.json`,
 * the INDEPENDENT, mechanical output of `scripts/extract-scss-defaults.mjs`
 * parsing the reference checkout's SCSS directly. Regenerate the fixture
 * (`node scripts/extract-scss-defaults.mjs`) and re-review this test's
 * failures whenever the survey-core version band bumps.
 */
import { REGISTRY } from '../registry';
import fixture from '../scss-defaults.json';

interface FixtureVariable {
  name: string;
  rawDefault: string;
  source: string;
  occurrences: { rawDefault: string; source: string }[];
}

const fixtureVars = fixture.variables as FixtureVariable[];
const byName = new Map(fixtureVars.map((v) => [v.name, v]));

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

  describe('non-context-dependent entries: registry default matches the fixture default exactly', () => {
    const cases = Object.values(REGISTRY).filter(
      (e) => e.class !== 'context-dependent'
    );
    it.each(cases.map((e) => [e.name, e] as const))('%s', (_name, entry) => {
      const fixtureEntry = byName.get(entry.name);
      expect(fixtureEntry).toBeDefined();
      expect(entry.default).toBe(fixtureEntry?.rawDefault);
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

  it("every registry entry's source ref matches the fixture's recorded source (or a derived: alias ref)", () => {
    for (const entry of Object.values(REGISTRY)) {
      const fixtureEntry = byName.get(entry.name);
      expect(entry.source).toBe(fixtureEntry?.source);
    }
  });
});
