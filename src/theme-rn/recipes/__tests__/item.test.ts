/**
 * Choice-item recipe tests (design: docs/design/0.7-theme-rn.md, "Recipes";
 * docs/design/0.7-metrics-fixture.md, "Choice item (checkbox/radio)").
 * Legal-state tuples are LOCKED exactly per the fixture's enumeration
 * (round-2: "the implementer's selector map enumerates EXACTLY these").
 */
import { StyleSheet } from 'react-native';
import { resolveTheme } from '../../../theme-core/resolve';
import { buildItemRecipe, selectItemStyles, selectIconFill } from '../item';
import type { ItemVariant } from '../item';
import { toBoxShadow, composeShadowLayers } from '../../shadows';
import { resolveColorVar } from '../tokenLookup';
import type { RecipeBuildDiagnostic } from '../types';

const resolved = resolveTheme(undefined);
const iosCtx = { platform: { os: 'ios' as const } };

describe('buildItemRecipe — formulas from resolved tokens (0.7-metrics-fixture.md)', () => {
  const recipe = buildItemRecipe(resolved, iosCtx);

  it('container.paddingVertical = calcSize(1.5) = 12', () => {
    expect(recipe.fragments.container.paddingVertical).toBe(12);
  });

  it('decorator size = calcSize(3) = 24 (both w and h)', () => {
    expect(recipe.fragments.decoratorBase.width).toBe(24);
    expect(recipe.fragments.decoratorBase.height).toBe(24);
  });

  it('checkbox decorator borderRadius = calcCornerRadius(0.5) = 2', () => {
    expect(recipe.fragments.decoratorRadiusCheckbox.borderRadius).toBe(2);
  });

  it('radio decorator borderRadius = size/2 = 12', () => {
    expect(recipe.fragments.decoratorRadiusRadio.borderRadius).toBe(12);
  });

  it('label lineHeight = 1.5 x editorFontSize = 24; fontWeight 400; fontSize 16', () => {
    expect(recipe.fragments.label.lineHeight).toBe(24);
    expect(recipe.fragments.label.fontWeight).toBe('400');
    expect(recipe.fragments.label.fontSize).toBe(16);
  });

  it('rowMode columnGap = calcSize(4) = 32', () => {
    expect(recipe.fragments.rowMode.columnGap).toBe(32);
  });

  it('labelStack gap = calcSize(1) = 8; description paddingLeft = calcSize(4) = 32', () => {
    expect(recipe.fragments.labelStack.gap).toBe(8);
    expect(recipe.fragments.description.paddingLeft).toBe(32);
  });

  it('a non-default theme flows into the formulas (base-unit override changes container padding)', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-base-unit': '10px' },
    });
    const customRecipe = buildItemRecipe(custom, iosCtx);
    expect(customRecipe.fragments.container.paddingVertical).toBe(15);
  });
});

describe('item decorator shadow composition — inner base, innerReset+ring focus, checked clears (codex impl-review major 1; sd-item.scss:9-47)', () => {
  const recipe = buildItemRecipe(resolved, iosCtx);

  it('decorator base carries --sjs-shadow-inner verbatim (sd-item.scss: box-shadow: $shadow-inner, ...)', () => {
    expect(recipe.fragments.decoratorBase.boxShadow).toEqual(
      toBoxShadow(resolved.tokens.shadows.inner)
    );
  });

  it('decorator focused composes innerReset + 2dp primary ring (sd-item.scss:46: $shadow-inner-reset, 0 0 0 2px $primary)', () => {
    const expected = toBoxShadow(
      composeShadowLayers(resolved.tokens.shadows.innerReset, [
        {
          inset: false,
          offsetX: 0,
          offsetY: 0,
          blurRadius: 0,
          spreadRadius: 2,
          color: resolveColorVar(resolved, '--sjs-primary-backcolor'),
        },
      ])
    );
    expect(recipe.fragments.decoratorFocused.boxShadow).toEqual(expected);
  });

  it('decorator checked clears BOTH shadow channels (sd-item.scss:40: box-shadow: none)', () => {
    const flat = StyleSheet.flatten([
      recipe.fragments.decoratorBase,
      recipe.fragments.decoratorChecked,
    ]);
    expect(flat.boxShadow).toEqual([]);
    expect(flat.elevation).toBe(0);
  });

  it('decorator readOnly/preview clear BOTH channels on every tier', () => {
    for (const ctx of [
      iosCtx,
      { platform: { os: 'android' as const, apiLevel: 21 } },
    ]) {
      const r = buildItemRecipe(resolved, ctx);
      for (const fragment of [
        r.fragments.decoratorReadOnly,
        r.fragments.decoratorPreview,
      ]) {
        const flat = StyleSheet.flatten([r.fragments.decoratorBase, fragment]);
        expect(flat.boxShadow).toEqual([]);
        expect(flat.elevation).toBe(0);
      }
    }
  });

  it('Android <28: decorator base carries elevation; shadow diagnostics reach the sink', () => {
    const diagnostics: RecipeBuildDiagnostic[] = [];
    const r = buildItemRecipe(resolved, {
      platform: { os: 'android', apiLevel: 21 },
      diagnostics,
    });
    const flat = StyleSheet.flatten(r.fragments.decoratorBase);
    expect(typeof flat.elevation).toBe('number');
    expect(
      diagnostics.some(
        (d) => d.code === 'theme-rn/android-shadow-elevation-fallback'
      )
    ).toBe(true);
  });
});

describe('selectItemStyles — exactly the 12 fixture-locked legal states', () => {
  const recipe = buildItemRecipe(resolved, { platform: { os: 'ios' } });
  const mode = { narrow: false, rtl: false };

  const legalStates: ItemVariant[] = [
    {
      checked: false,
      readOnly: false,
      preview: false,
      error: false,
      pressed: false,
      focused: false,
    },
    {
      checked: true,
      readOnly: false,
      preview: false,
      error: false,
      pressed: false,
      focused: false,
    },
    {
      checked: false,
      readOnly: true,
      preview: false,
      error: false,
      pressed: false,
      focused: false,
    },
    {
      checked: true,
      readOnly: true,
      preview: false,
      error: false,
      pressed: false,
      focused: false,
    },
    {
      checked: false,
      readOnly: false,
      preview: true,
      error: false,
      pressed: false,
      focused: false,
    },
    {
      checked: true,
      readOnly: false,
      preview: true,
      error: false,
      pressed: false,
      focused: false,
    },
    {
      checked: false,
      readOnly: false,
      preview: false,
      error: true,
      pressed: false,
      focused: false,
    },
    {
      checked: true,
      readOnly: false,
      preview: false,
      error: true,
      pressed: false,
      focused: false,
    },
    {
      checked: false,
      readOnly: false,
      preview: false,
      error: false,
      pressed: true,
      focused: false,
    },
    {
      checked: false,
      readOnly: false,
      preview: false,
      error: false,
      pressed: false,
      focused: true,
    },
    {
      checked: true,
      readOnly: false,
      preview: false,
      error: false,
      pressed: false,
      focused: true,
    },
    {
      checked: false,
      readOnly: false,
      preview: false,
      error: false,
      pressed: false,
      focused: false,
      none: true,
    },
  ];

  it.each(legalStates.map((v, i) => [i, v] as const))(
    'legal state %i selects without throwing and returns a non-empty style array',
    (_i, variant) => {
      const styles = selectItemStyles(recipe, variant, mode, 'checkbox');
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
    }
  );

  it('readOnly wins over checked for decorator background (state.readOnly = background-dark, no shadow)', () => {
    const checkedOnly = selectItemStyles(
      recipe,
      {
        checked: true,
        readOnly: false,
        preview: false,
        error: false,
        pressed: false,
        focused: false,
      },
      mode,
      'checkbox'
    );
    const checkedReadOnly = selectItemStyles(
      recipe,
      {
        checked: true,
        readOnly: true,
        preview: false,
        error: false,
        pressed: false,
        focused: false,
      },
      mode,
      'checkbox'
    );
    const flatten = (arr: object[]) => Object.assign({}, ...arr);
    expect(flatten(checkedOnly).backgroundColor).not.toEqual(
      flatten(checkedReadOnly).backgroundColor
    );
  });

  it('pressed is gated by allowHover && !readOnly (selector accepts the flag directly -- caller enforces the gate before calling)', () => {
    const pressed = selectItemStyles(
      recipe,
      {
        checked: false,
        readOnly: false,
        preview: false,
        error: false,
        pressed: true,
        focused: false,
      },
      mode,
      'checkbox'
    );
    const base = selectItemStyles(
      recipe,
      {
        checked: false,
        readOnly: false,
        preview: false,
        error: false,
        pressed: false,
        focused: false,
      },
      mode,
      'checkbox'
    );
    const flatten = (arr: object[]) => Object.assign({}, ...arr);
    expect(flatten(pressed).backgroundColor).not.toEqual(
      flatten(base).backgroundColor
    );
  });

  it('shape switches the decorator radius fragment (checkbox vs radio)', () => {
    const checkboxStyles = selectItemStyles(
      recipe,
      {
        checked: false,
        readOnly: false,
        preview: false,
        error: false,
        pressed: false,
        focused: false,
      },
      mode,
      'checkbox'
    );
    const radioStyles = selectItemStyles(
      recipe,
      {
        checked: false,
        readOnly: false,
        preview: false,
        error: false,
        pressed: false,
        focused: false,
      },
      mode,
      'radio'
    );
    const flatten = (arr: object[]) => Object.assign({}, ...arr);
    expect(flatten(checkboxStyles).borderRadius).toBe(2);
    expect(flatten(radioStyles).borderRadius).toBe(12);
  });
});

describe('selectIconFill — 0.7-metrics-fixture.md icon.fill table (round-2 corrected)', () => {
  const recipe = buildItemRecipe(resolved, iosCtx);

  it('unchecked -> transparent', () => {
    expect(
      selectIconFill(recipe, {
        checked: false,
        focused: false,
        readOnly: false,
        preview: false,
      })
    ).toBe('transparent');
  });

  it('checked -> primary-foreground', () => {
    expect(
      selectIconFill(recipe, {
        checked: true,
        focused: false,
        readOnly: false,
        preview: false,
      })
    ).toBe(resolved.tokens.colors.primaryForecolor!.css);
  });

  it('checked+focused -> primary', () => {
    expect(
      selectIconFill(recipe, {
        checked: true,
        focused: true,
        readOnly: false,
        preview: false,
      })
    ).toBe(resolved.tokens.colors.primaryBackcolor!.css);
  });

  it('checked+readOnly -> foreground', () => {
    expect(
      selectIconFill(recipe, {
        checked: true,
        focused: false,
        readOnly: true,
        preview: false,
      })
    ).toBe(resolved.tokens.colors.generalForecolor!.css);
  });

  it('preview -> foreground', () => {
    expect(
      selectIconFill(recipe, {
        checked: false,
        focused: false,
        readOnly: false,
        preview: true,
      })
    ).toBe(resolved.tokens.colors.generalForecolor!.css);
  });
});

describe('recipe build budget (coarse guard, design test plan #1)', () => {
  it('building the item recipe for a theme takes well under 5ms', () => {
    const start = performance.now();
    buildItemRecipe(resolved, iosCtx);
    expect(performance.now() - start).toBeLessThan(5);
  });
});
