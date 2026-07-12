/**
 * Choice-item recipe tests (design: docs/design/0.7-theme-rn.md, "Recipes";
 * docs/design/0.7-metrics-fixture.md, "Choice item (checkbox/radio)").
 * Legal-state tuples are LOCKED exactly per the fixture's enumeration
 * (round-2: "the implementer's selector map enumerates EXACTLY these").
 */
import { StyleSheet } from 'react-native';
import { resolveTheme } from '../../../theme-core/resolve';
import {
  buildItemRecipe,
  resolveItemLegalState,
  selectItemStyles,
  selectIconFill,
} from '../item';
import type { ItemStateInput, ItemLegalState } from '../item';
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

  it('labelStack gap = calcSize(1) = 8; description paddingStart = calcSize(4) = 32 (RN logical prop — RTL-aware; codex impl-review major 7)', () => {
    expect(recipe.fragments.labelStack.gap).toBe(8);
    expect(recipe.fragments.description.paddingStart).toBe(32);
    expect(
      (recipe.fragments.description as { paddingLeft?: number }).paddingLeft
    ).toBeUndefined();
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
    ])!;
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
        const flat = StyleSheet.flatten([r.fragments.decoratorBase, fragment])!;
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
    const flat = StyleSheet.flatten(r.fragments.decoratorBase)!;
    expect(typeof flat.elevation).toBe('number');
    expect(
      diagnostics.some(
        (d) => d.code === 'theme-rn/android-shadow-elevation-fallback'
      )
    ).toBe(true);
  });
});

describe("resolveItemLegalState + selectItemStyles — the fixture's EXACT 12 legal tuples (codex impl-review major 2)", () => {
  const recipe = buildItemRecipe(resolved, { platform: { os: 'ios' } });
  const mode = { narrow: false, rtl: false };
  const flatten = (arr: object[]) => Object.assign({}, ...arr);

  const baseInput: ItemStateInput = {
    checked: false,
    pressed: false,
    focused: false,
    readOnly: false,
    preview: false,
    error: false,
    allowHover: true,
  };

  // The fixture's 12 legal tuples, expressed as raw-flag inputs and the
  // legal state each must normalize to.
  const tuples: Array<[string, ItemStateInput, ItemLegalState]> = [
    ['base', baseInput, { kind: 'base', checked: false, addOn: undefined }],
    [
      'checked',
      { ...baseInput, checked: true, allowHover: false },
      { kind: 'base', checked: true, addOn: undefined },
    ],
    [
      'readOnly',
      { ...baseInput, readOnly: true, allowHover: false },
      { kind: 'readOnly', checked: false },
    ],
    [
      'checked+readOnly',
      { ...baseInput, checked: true, readOnly: true, allowHover: false },
      { kind: 'readOnly', checked: true },
    ],
    [
      'preview',
      { ...baseInput, preview: true },
      { kind: 'preview', checked: false },
    ],
    [
      'checked+preview',
      { ...baseInput, checked: true, preview: true, allowHover: false },
      { kind: 'preview', checked: true },
    ],
    ['error', { ...baseInput, error: true }, { kind: 'error', checked: false }],
    [
      'checked+error',
      { ...baseInput, checked: true, error: true, allowHover: false },
      { kind: 'error', checked: true },
    ],
    [
      'pressed (gate passed)',
      { ...baseInput, pressed: true },
      { kind: 'pressed' },
    ],
    [
      'focused',
      { ...baseInput, focused: true },
      { kind: 'focused', checked: false },
    ],
    [
      'checked+focused',
      { ...baseInput, checked: true, focused: true, allowHover: false },
      { kind: 'focused', checked: true },
    ],
    [
      'selectAll add-on (composes with base)',
      { ...baseInput, addOn: 'selectAll' },
      { kind: 'base', checked: false, addOn: 'selectAll' },
    ],
  ];

  it.each(tuples)(
    '%s normalizes to its fixture tuple',
    (_name, input, expected) => {
      expect(resolveItemLegalState(input)).toEqual(expected);
    }
  );

  it.each(tuples)(
    '%s selects non-empty container AND decorator slot arrays',
    (_name, input) => {
      const slots = selectItemStyles(recipe, input, mode, 'checkbox');
      expect(slots.container.length).toBeGreaterThan(0);
      expect(slots.decorator.length).toBeGreaterThan(0);
    }
  );

  it('the hover gate is enforced IN the selector: pressed with allowHover=false normalizes away', () => {
    expect(
      resolveItemLegalState({ ...baseInput, pressed: true, allowHover: false })
    ).toEqual({ kind: 'base', checked: false, addOn: undefined });
  });

  it('the hover gate is enforced IN the selector: pressed while readOnly normalizes to readOnly', () => {
    expect(
      resolveItemLegalState({
        ...baseInput,
        pressed: true,
        readOnly: true,
      })
    ).toEqual({ kind: 'readOnly', checked: false });
  });

  it('none/selectAll add-ons are mutually exclusive by type and compose with base/checked only (no delta on stateful tuples)', () => {
    expect(
      resolveItemLegalState({ ...baseInput, readOnly: true, addOn: 'none' })
    ).toEqual({ kind: 'readOnly', checked: false });
  });

  it('container and decorator slots are SEPARATE: state fragments only reach the decorator', () => {
    const base = selectItemStyles(recipe, baseInput, mode, 'checkbox');
    const readOnly = selectItemStyles(
      recipe,
      { ...baseInput, readOnly: true, allowHover: false },
      mode,
      'checkbox'
    );
    // container slot is state-independent
    expect(readOnly.container).toEqual(base.container);
    // decorator slot carries the state delta
    expect(flatten(readOnly.decorator).backgroundColor).not.toEqual(
      flatten(base.decorator).backgroundColor
    );
    // and the container slot does NOT contain decorator metrics
    expect(flatten(base.container).width).toBeUndefined();
  });

  it('readOnly wins over checked for decorator background (state.readOnly = background-dark, no shadow)', () => {
    const checkedOnly = selectItemStyles(
      recipe,
      { ...baseInput, checked: true, allowHover: false },
      mode,
      'checkbox'
    );
    const checkedReadOnly = selectItemStyles(
      recipe,
      { ...baseInput, checked: true, readOnly: true, allowHover: false },
      mode,
      'checkbox'
    );
    expect(flatten(checkedOnly.decorator).backgroundColor).not.toEqual(
      flatten(checkedReadOnly.decorator).backgroundColor
    );
    expect(flatten(checkedReadOnly.decorator).boxShadow).toEqual([]);
  });

  it('pressed (gate passed) changes the decorator background (background-dim-dark)', () => {
    const pressed = selectItemStyles(
      recipe,
      { ...baseInput, pressed: true },
      mode,
      'checkbox'
    );
    const base = selectItemStyles(recipe, baseInput, mode, 'checkbox');
    expect(flatten(pressed.decorator).backgroundColor).not.toEqual(
      flatten(base.decorator).backgroundColor
    );
  });

  it('checked+focused: the focus ring wins the decorator shadow, focus background wins over checked', () => {
    const slots = selectItemStyles(
      recipe,
      { ...baseInput, checked: true, focused: true, allowHover: false },
      mode,
      'checkbox'
    );
    const flat = flatten(slots.decorator);
    expect(flat.boxShadow).toEqual(recipe.fragments.decoratorFocused.boxShadow);
    expect(flat.backgroundColor).toBe(
      recipe.fragments.decoratorFocused.backgroundColor
    );
  });

  it('shape switches the decorator radius fragment (checkbox vs radio)', () => {
    const checkboxSlots = selectItemStyles(recipe, baseInput, mode, 'checkbox');
    const radioSlots = selectItemStyles(recipe, baseInput, mode, 'radio');
    expect(flatten(checkboxSlots.decorator).borderRadius).toBe(2);
    expect(flatten(radioSlots.decorator).borderRadius).toBe(12);
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
