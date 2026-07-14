/**
 * @jest-environment node
 */

// Design: docs/design/1.2-lifecycle-bridge.md, piece 3 (the
// `settings.environment` stub — defense-in-depth behind the bridge) and
// test plan #8. The stub is applied by the FACADE (which imports both the
// shim and survey-core); shim.ts itself keeps its zero-imports invariant
// (0.3), so the `/shim` subpath alone deliberately does NOT stub — that
// boundary is locked by src/core/__tests__/shim.test.ts.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { withRnShapedGlobals } from '../../../test-utils/rn-globals';

type SurveyCoreModule = typeof import('survey-core');

const REQUIRED_Q_JSON = {
  pages: [
    {
      name: 'page1',
      elements: [{ type: 'text', name: 'q1', isRequired: true }],
    },
  ],
};

const STUB_FIELDS = [
  'root',
  'rootElement',
  'popupMountContainer',
  'svgMountContainer',
  'stylesSheetsMountContainer',
] as const;

describe('core/facade — settings.environment stub (1.2 amendment to 0.3)', () => {
  it('A15 headline: invalid required submission no longer throws through the facade', () => {
    withRnShapedGlobals(() => {
      const facade = require('../facade') as SurveyCoreModule;
      const model = new facade.Model(REQUIRED_Q_JSON);

      // Pre-1.2 this threw "Cannot read properties of undefined
      // (reading 'rootElement')" (survey.ts scrollElementToTop's
      // unguarded destructure) — the 0.3-era tripwire in shim.test.ts
      // documented it.
      expect(() => model.completeLastPage()).not.toThrow();
      expect(model.state).toBe('running');
      expect(model.currentPage?.hasErrors(false)).toBe(true);
    });
  });

  it('stub shape: environment object defined, every mount field undefined, and NO document defined', () => {
    withRnShapedGlobals(() => {
      const facade = require('../facade') as SurveyCoreModule;
      const env = facade.settings.environment as unknown as
        Record<string, unknown> | undefined;

      expect(env).toBeDefined();
      for (const field of STUB_FIELDS) {
        expect(env).toHaveProperty(field);
        expect(env?.[field]).toBeUndefined();
      }
      // 0.3 invariant unchanged: the stub must never come with a fake
      // `document` (its absence is what routes survey-core into its
      // SSR-safe paths).
      expect(typeof (globalThis as Record<string, unknown>).document).toBe(
        'undefined'
      );
    });
  });

  it('does not clobber a pre-existing consumer-set settings.environment (??= semantics)', () => {
    withRnShapedGlobals(() => {
      // Consumer flow: /shim subpath first, then raw survey-core, then a
      // consumer-supplied environment, then the renderer's facade.
      require('../shim');
      // eslint-disable-next-line no-restricted-syntax
      const sc = require('survey-core') as SurveyCoreModule;
      const sentinel = { root: undefined, rootElement: undefined };
      (sc.settings as unknown as Record<string, unknown>).environment =
        sentinel;

      const facade = require('../facade') as SurveyCoreModule;
      expect(facade.settings.environment).toBe(sentinel);
    });
  });

  it('sweep (test plan #8): BOTH installed survey-core artifacts (cjs + fesm mjs) have NO truthiness gates on settings.environment', () => {
    // The design's risk note: code that truthiness-checks
    // `settings.environment` (rather than destructuring/reading fields)
    // would take the "environment exists" branch once the stub lands.
    // Lock the "known readers destructure rather than gate" claim with
    // evidence against the actually-installed artifacts — BOTH of them
    // (review round 2): Metro/jest resolve the CJS `main`
    // (survey.core.js), while ESM bundlers resolve the `module`/`import`
    // entry (fesm/survey-core.mjs). A gate appearing in either would
    // change behavior for some consumer.
    // Resolving the installed bundle's PATH is the entire point of this
    // sweep (static evidence against the artifact itself) — nothing is
    // imported/evaluated, so the facade contract isn't in play.
    // eslint-disable-next-line no-restricted-syntax
    const cjsPath = require.resolve('survey-core');
    const fesmPath = join(dirname(cjsPath), 'fesm', 'survey-core.mjs');
    // Loud failure if the package layout ever renames the ESM artifact
    // (rather than a silently-empty sweep).
    expect(existsSync(fesmPath)).toBe(true);

    const gatePatterns = [
      /if\s*\(\s*!?\s*settings\.environment\s*\)/g,
      /!!\s*settings\.environment(?!\s*\.)/g,
      /settings\.environment\s*&&/g,
      /settings\.environment\s*\|\|/g,
      // Ternary gate — but NOT optional chaining (`settings.environment?.x`).
      /settings\.environment\s*\?(?!\.)/g,
    ];
    for (const artifactPath of [cjsPath, fesmPath]) {
      const bundleSource = readFileSync(artifactPath, 'utf8');
      const hits = gatePatterns.flatMap(
        (pattern) => bundleSource.match(pattern) ?? []
      );
      expect(hits).toEqual([]);

      // Sanity: the member-read sites this sweep protects do exist (the
      // sweep isn't green because the file failed to load or the symbol
      // was renamed).
      const memberReads = bundleSource.match(/settings\.environment\./g) ?? [];
      expect(memberReads.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('negative tripwire (review round 2 #6): the stub does NOT make DOM-only paths safe — drag-drop and popup mounting still throw', () => {
    withRnShapedGlobals(() => {
      const facade = require('../facade') as SurveyCoreModule;
      const env = facade.settings.environment as unknown as Record<
        string,
        unknown
      >;

      // dragdrop/dom-adapter.ts (`rootElement` getter):
      //   settings.environment.root.documentElement
      // `root` is undefined in the stub — the dereference throws. If this
      // tripwire ever goes green-by-fake (someone "fixes" the stub with a
      // fake root object), the drag-drop DOM path would silently
      // half-work; reconsider the whole contract instead.
      expect(() => {
        return (env.root as { documentElement: unknown }).documentElement;
      }).toThrow(TypeError);

      // popup-view-model.ts (initializePopupContainer):
      //   getElement(settings.environment.popupMountContainer).appendChild(...)
      // getElement (dom-utils.ts, exported by survey-core) returns a
      // non-string argument as-is — undefined — so the .appendChild call
      // throws. Same reconsider-the-contract rule as above.
      const getElement = (
        facade as unknown as {
          getElement: (element: unknown) => {
            appendChild: (n: unknown) => void;
          };
        }
      ).getElement;
      expect(typeof getElement).toBe('function');
      expect(() => {
        getElement(env.popupMountContainer).appendChild(null);
      }).toThrow(TypeError);
    });
  });
});
