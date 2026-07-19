/**
 * Import-probe gate (design: docs/design/0.5-factories.md, "Registration &
 * packaging" + test plan #6): component modules export ONLY components —
 * importing one must never register anything. Registration is owned
 * exclusively by the registrar (`src/factories/register-all.ts`) walking
 * the descriptor table; a component module that self-registered at module
 * scope would re-create upstream's pattern, which 0.3's `sideEffects`
 * allowlist would let a tree-shaker silently drop.
 *
 * Each probe runs in an isolated jest module registry: require the
 * component module fresh, THEN require the factory modules fresh, and
 * assert both singletons are still empty. If a component module ever grows
 * a factory/registrar import that registers at module scope, the
 * assertion catches it.
 */

function factoryStateAfterImporting(componentModulePath: string): {
  questionTypes: string[];
  elementTypes: string[];
} {
  let questionTypes: string[] = ['<probe never ran>'];
  let elementTypes: string[] = ['<probe never ran>'];
  jest.isolateModules(() => {
    require(componentModulePath);
    const { RNQuestionFactory } = require('../../factories/QuestionFactory');
    const { RNElementFactory } = require('../../factories/ElementFactory');
    questionTypes = RNQuestionFactory.getAllTypes();
    elementTypes = RNElementFactory.getAllTypes();
  });
  return { questionTypes, elementTypes };
}

describe('component modules are import-side-effect-free', () => {
  it.each([
    ['../EmptyQuestion'],
    ['../UnsupportedQuestion'],
    ['../Comment'],
    ['../Checkbox'],
    ['../Radiogroup'],
    ['../ChoiceItemRow'],
    ['../../questions/BooleanQuestion'],
    ['../../questions/ExpressionQuestion'],
    ['../../questions/RatingQuestion'],
    ['../../questions/TextQuestion'],
    ['../../questions/ImageQuestion'],
    ['../../questions/ButtonGroupQuestion'],
    ['../../questions/CustomQuestion'],
    ['../../questions/CompositeQuestion'],
    ['../../overlay/ListPicker'],
    ['../../overlay/OverlayHost'],
  ])('importing %s registers nothing into either factory', (modulePath) => {
    const { questionTypes, elementTypes } =
      factoryStateAfterImporting(modulePath);
    expect(questionTypes).toEqual([]);
    expect(elementTypes).toEqual([]);
  });

  it('control: importing the registrar DOES register (the probe can tell the difference)', () => {
    const { questionTypes } = factoryStateAfterImporting(
      '../../factories/register-all'
    );
    expect(questionTypes).toEqual([
      'boolean',
      'buttongroup',
      'checkbox',
      'comment',
      'composite',
      'custom',
      'dropdown',
      'empty',
      'expression',
      'image',
      'imagepicker',
      'multipletext',
      'paneldynamic',
      'radiogroup',
      'rating',
      'sv-boolean-checkbox',
      'sv-boolean-radio',
      'sv-rating-dropdown',
      'tagbox',
      'text',
    ]);
  });
});
