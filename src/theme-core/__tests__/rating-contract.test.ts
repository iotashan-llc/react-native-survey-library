/**
 * @jest-environment node
 */

// RN rating contract test (design: docs/design/0.6-theme-core.md, test
// plan #8): "under RN-shaped globals, `applyTheme` + rating question ->
// `updateColors` no-ops (locks review's correction; rating colors
// documented as 0.7 token consumers)."
//
// `QuestionRatingModel.updateColors` (question_rating.ts:324-334) reads
// `theme.cssVariables` DOM-side via `getRGBColor(..., this.rootElement)`
// and early-returns when `DomDocumentHelper.isAvailable()` is false —
// true in Node/RN (no `document` global). This test locks that
// `SurveyModel#applyTheme` therefore never throws and never populates the
// DOM-derived color caches for a rating question — so an RN renderer MUST
// source rating colors from
// `resolveTheme(theme).tokens.colors.specialRed/-Yellow/-Green` (this
// module's own output), never from calling `applyTheme` and reading back
// survey-core's internal state, which stays empty.
//
// Assertion mechanics (codex review major 10 — the first version of this
// test read the STATIC `QuestionRatingModel.colorsCalculated`, but
// `updateColors` WRITES `this.colorsCalculated` on the INSTANCE, so the
// static read was vacuously false regardless of behavior): the test now
// (a) spies on `QuestionRatingModel.prototype.updateColors` to prove
// applyTheme actually reached it, and (b) asserts the INSTANCE-level
// `colorsCalculated` — set to `false` by `themeChanged` immediately
// before the `updateColors` call (question_rating.ts:950-952) and set to
// `true` only if `updateColors` runs PAST its early returns — stayed
// false: called AND early-returned.
import { withRnShapedGlobals } from '../../../test-utils/rn-globals';

type SurveyCoreModule = typeof import('survey-core');

interface RatingPrototype {
  updateColors: (themeVariables: unknown) => void;
}

describe('RN rating contract — applyTheme + rating question', () => {
  it('does not throw; updateColors IS invoked but early-returns (instance colorsCalculated stays false)', () => {
    withRnShapedGlobals(() => {
      require('../../core/shim');
      // eslint-disable-next-line no-restricted-syntax -- test exercises the raw module under RN-shaped globals, mirroring src/core/__tests__/shim.test.ts's pattern
      const surveyCore = require('survey-core') as SurveyCoreModule;
      const { Model } = surveyCore;
      const QuestionRatingModel = (
        surveyCore as unknown as Record<string, { prototype: RatingPrototype }>
      ).QuestionRatingModel;
      expect(QuestionRatingModel).toBeDefined();

      const prototype = QuestionRatingModel!.prototype;
      const originalUpdateColors = prototype.updateColors;
      expect(typeof originalUpdateColors).toBe('function');
      let updateColorsCalls = 0;
      prototype.updateColors = function patched(
        this: unknown,
        themeVariables: unknown
      ) {
        updateColorsCalls++;
        return originalUpdateColors.call(this, themeVariables);
      };

      try {
        const model = new Model({
          elements: [{ type: 'rating', name: 'q1', rateMax: 5 }],
        });
        const question = model.getQuestionByName('q1');
        expect(question).toBeTruthy();
        expect(question.getType()).toBe('rating');

        expect(() => {
          model.applyTheme({
            themeName: 'default',
            colorPalette: 'light',
            isPanelless: false,
            cssVariables: {
              '--sjs-special-red': 'rgba(229, 10, 62, 1)',
              '--sjs-special-yellow': 'rgba(255, 152, 20, 1)',
              '--sjs-special-green': 'rgba(25, 179, 148, 1)',
            },
          });
        }).not.toThrow();

        // (a) the applyTheme -> themeChanged -> updateColors path really
        // executed — this is not a vacuous "nothing happened" pass...
        expect(updateColorsCalls).toBeGreaterThan(0);
        // ...(b) and it early-returned before computing colors: the
        // INSTANCE flag `themeChanged` resets to false right before
        // calling updateColors was never flipped to true.
        expect(
          (question as unknown as { colorsCalculated?: boolean })
            .colorsCalculated
        ).toBe(false);
      } finally {
        prototype.updateColors = originalUpdateColors;
      }
    });
  });
});
