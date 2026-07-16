/**
 * @jest-environment node
 */

// Cases 2, 4, 5 (design: docs/design/0.3-core-facade.md, test plan).
import { withRnShapedGlobals } from '../../../test-utils/rn-globals';

type SurveyCoreModule = typeof import('survey-core');

function requireShimmedSurveyCore(): SurveyCoreModule {
  require('../shim');
  // Exercising shim.ts directly (not through the facade) is the point of
  // these tests.
  // eslint-disable-next-line no-restricted-syntax
  return require('survey-core') as SurveyCoreModule;
}

describe('core/shim — applySurveyCoreShims', () => {
  it('case 2: loads survey-core and supports a headless valid-completion lifecycle', () => {
    withRnShapedGlobals(() => {
      const { Model } = requireShimmedSurveyCore();

      const model = new Model({
        pages: [
          {
            name: 'page1',
            elements: [{ type: 'text', name: 'q1' }],
          },
        ],
      });

      expect(model.currentPageNo).toBe(0);
      model.setValue('q1', 'hello survey');
      expect(model.getValue('q1')).toBe('hello survey');

      const completed = model.completeLastPage();

      expect(completed).toBe(true);
      expect(model.state).toBe('completed');
    });
  });

  it('case 2: invalid required submission STILL fails through the shim-only path (the 1.2 fix lives in the facade, keeping /shim zero-core-import)', () => {
    withRnShapedGlobals(() => {
      const { Model } = requireShimmedSurveyCore();

      const model = new Model({
        pages: [
          {
            name: 'page1',
            elements: [{ type: 'text', name: 'q1', isRequired: true }],
          },
        ],
      });

      // scrollElementToTop (survey.ts:5872) destructures
      // `settings.environment`, which is `undefined` in RN (no
      // `document`) — "Cannot read properties of undefined (reading
      // 'rootElement')". Task 1.2 (A15) fixed this at the FACADE, which
      // passes survey-core's `settings` back into
      // `applySurveyCoreShims(settings)` (see environment-stub.test.ts);
      // shim.ts alone deliberately does NOT stub it — its zero-imports
      // invariant means it never touches survey-core, so the `/shim`
      // subpath stays zero-core-import. This tripwire now locks THAT
      // boundary. Asserted specifically so it can't be satisfied by an
      // unrelated error.
      expect(() => model.completeLastPage()).toThrow(/rootElement/);
    });
  });

  it('case 4: applying the shim twice is idempotent and does not throw', () => {
    withRnShapedGlobals(() => {
      expect(() => {
        require('../shim');
        require('../shim');
      }).not.toThrow();
    });
  });

  it('case 4: does not override a pre-existing global.addEventListener', () => {
    withRnShapedGlobals(() => {
      const sentinel = (): void => {};
      (globalThis as unknown as Record<string, unknown>).addEventListener =
        sentinel;

      require('../shim');

      expect(
        (globalThis as unknown as Record<string, unknown>).addEventListener
      ).toBe(sentinel);
    });
  });

  it('case 5: does not define document after the shim is applied', () => {
    withRnShapedGlobals(() => {
      require('../shim');

      expect(
        typeof (globalThis as unknown as Record<string, unknown>).document
      ).toBe('undefined');
    });
  });
});
