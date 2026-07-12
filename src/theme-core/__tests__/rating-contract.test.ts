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
// and early-returns when `DomDocumentHelper.isAvailable()` is false — true
// in this jest project's `react-native` preset even without the
// RN-shaped-globals wrapper (no `document` global at all), and doubly so
// under it. This test locks that `SurveyModel#applyTheme` therefore never
// throws and never populates `QuestionRatingModel`'s DOM-derived color
// caches for a rating question — so an RN renderer MUST source rating
// colors from `resolveTheme(theme).tokens.colors.specialRed/-Yellow/-Green`
// (this module's own output), never from calling `applyTheme` and reading
// back survey-core's internal state, which stays empty.
import { withRnShapedGlobals } from '../../../test-utils/rn-globals';

type SurveyCoreModule = typeof import('survey-core');

describe('RN rating contract — applyTheme + rating question', () => {
  it('does not throw, and QuestionRatingModel.updateColors no-ops (colorsCalculated stays false)', () => {
    withRnShapedGlobals(() => {
      require('../../core/shim');
      // eslint-disable-next-line no-restricted-syntax -- test exercises the raw module under RN-shaped globals, mirroring src/core/__tests__/shim.test.ts's pattern
      const surveyCore = require('survey-core') as SurveyCoreModule;
      const { Model } = surveyCore;
      // `QuestionRatingModel.colorsCalculated` is a private static field —
      // reachable at runtime (TS privacy is compile-time only), needed
      // here specifically to observe survey-core's internal no-op.
      const QuestionRatingModel = (
        surveyCore as unknown as Record<string, { colorsCalculated: boolean }>
      ).QuestionRatingModel;

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

      // The DOM-only static color cache never got populated — no
      // `document`, so `updateColors` returned before setting it.
      expect(QuestionRatingModel?.colorsCalculated).toBe(false);
    });
  });
});
