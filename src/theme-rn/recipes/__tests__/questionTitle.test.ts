/**
 * Question-title recipe tests (docs/design/0.7-metrics-fixture.md,
 * "Question title + number -- sd-element.scss"). 4 fixture-locked legal
 * states (number slot unconditional -- always present, not part of the
 * enumeration).
 */
import { resolveTheme } from '../../../theme-core/resolve';
import {
  buildQuestionTitleRecipe,
  selectQuestionTitleStyles,
} from '../questionTitle';
import type { QuestionTitleVariant } from '../questionTitle';

const resolved = resolveTheme(undefined);

describe('buildQuestionTitleRecipe — formulas from resolved tokens', () => {
  const recipe = buildQuestionTitleRecipe(resolved);

  it('title fontSize 16, weight 600, lineHeight = 1.5 x questiontitle-size = 24', () => {
    expect(recipe.fragments.title.fontSize).toBe(16);
    expect(recipe.fragments.title.fontWeight).toBe('600');
    expect(recipe.fragments.title.lineHeight).toBe(24);
  });

  it('number fontSize=calcFontSize(0.75)=12, lineHeight=calcLineHeight(1)=16', () => {
    expect(recipe.fragments.number.fontSize).toBe(12);
    expect(recipe.fragments.number.lineHeight).toBe(16);
  });

  it('number paddingTop=calcSize(0.625)=5, paddingBottom=calcSize(0.375)=3, paddingEnd(paddingRight)=calcSize(1)=8', () => {
    expect(recipe.fragments.number.paddingTop).toBe(5);
    expect(recipe.fragments.number.paddingBottom).toBe(3);
    expect(recipe.fragments.number.paddingRight).toBe(8);
  });

  it('number gutter is a fixed 40dp width (calcSize(5))', () => {
    expect(recipe.fragments.numberGutter.width).toBe(40);
  });

  it('a non-default theme flows into the title formula (questiontitle-size override)', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-font-questiontitle-size': '20px' },
    });
    const customRecipe = buildQuestionTitleRecipe(custom);
    expect(customRecipe.fragments.title.fontSize).toBe(20);
    expect(customRecipe.fragments.title.lineHeight).toBe(30);
  });
});

describe('selectQuestionTitleStyles — 4 fixture-locked legal states', () => {
  const recipe = buildQuestionTitleRecipe(resolved);
  const base: QuestionTitleVariant = {
    required: false,
    errorTone: false,
    collapsed: false,
  };
  const states: QuestionTitleVariant[] = [
    base,
    { ...base, required: true },
    { ...base, errorTone: true },
    { ...base, collapsed: true },
  ];

  it.each(states.map((v, i) => [i, v] as const))(
    'legal state %i selects without throwing',
    (_i, variant) => {
      expect(selectQuestionTitleStyles(recipe, variant).length).toBeGreaterThan(
        0
      );
    }
  );

  it('errorTone changes the title color', () => {
    const flat = (arr: object[]) => Object.assign({}, ...arr);
    const plain = flat(selectQuestionTitleStyles(recipe, base));
    const error = flat(
      selectQuestionTitleStyles(recipe, { ...base, errorTone: true })
    );
    expect(plain.color).not.toEqual(error.color);
  });
});
