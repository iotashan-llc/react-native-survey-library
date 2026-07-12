/**
 * Button recipe tests (docs/design/0.7-metrics-fixture.md, "Button --
 * sd-button.scss"). 13 fixture-locked legal states.
 */
import { StyleSheet } from 'react-native';
import { resolveTheme } from '../../../theme-core/resolve';
import {
  buildButtonRecipe,
  resolveButtonLegalState,
  selectButtonStyles,
} from '../button';
import type { ButtonStateInput, ButtonLegalState } from '../button';
import type { RecipeBuildDiagnostic } from '../types';

const resolved = resolveTheme(undefined);
const iosCtx = { platform: { os: 'ios' as const } };

describe('buildButtonRecipe — formulas from resolved tokens', () => {
  const recipe = buildButtonRecipe(resolved, iosCtx);

  it('paddingVertical=calcSize(2)=16, paddingHorizontal=calcSize(6)=48', () => {
    expect(recipe.fragments.base.paddingVertical).toBe(16);
    expect(recipe.fragments.base.paddingHorizontal).toBe(48);
  });

  it('small: paddingVertical=calcSize(1.5)=12, paddingHorizontal=calcSize(4)=32, flexGrow 1', () => {
    expect(recipe.fragments.small.paddingVertical).toBe(12);
    expect(recipe.fragments.small.paddingHorizontal).toBe(32);
    expect(recipe.fragments.small.flexGrow).toBe(1);
  });

  it('borderRadius = calcCornerRadius(1) = 4', () => {
    expect(recipe.fragments.base.borderRadius).toBe(4);
  });

  it('fontWeight 600 (base-font path, NOT editor), fontSize calcFontSize(1)=16, lineHeight calcLineHeight(1.5)=24', () => {
    expect(recipe.fragments.base.fontWeight).toBe('600');
    expect(recipe.fragments.base.fontSize).toBe(16);
    expect(recipe.fragments.base.lineHeight).toBe(24);
  });

  it('base shadow carries --sjs-shadow-small verbatim', () => {
    expect(Array.isArray(recipe.fragments.base.boxShadow)).toBe(true);
  });

  it('disabled: opacity 0.25', () => {
    expect(recipe.fragments.disabled.opacity).toBe(0.25);
  });
});

describe('button shadow channel plumbing (codex impl-review major 1)', () => {
  const android21 = { platform: { os: 'android' as const, apiLevel: 21 } };

  it('Android <28: base carries the mapper elevation (boxShadow undefined)', () => {
    const recipe = buildButtonRecipe(resolved, android21);
    const flatBase = StyleSheet.flatten(recipe.fragments.base)!;
    expect(flatBase.boxShadow).toBeUndefined();
    expect(typeof flatBase.elevation).toBe('number');
    expect(flatBase.elevation).toBeGreaterThan(0);
  });

  it('Android <28: focused carries the focus-ring elevation and the fallback diagnostic reaches the sink', () => {
    const diagnostics: RecipeBuildDiagnostic[] = [];
    const recipe = buildButtonRecipe(resolved, {
      platform: { os: 'android', apiLevel: 21 },
      diagnostics,
    });
    const flatFocused = StyleSheet.flatten(recipe.fragments.focused)!;
    expect(typeof flatFocused.elevation).toBe('number');
    expect(
      diagnostics.some(
        (d) => d.code === 'theme-rn/android-shadow-elevation-fallback'
      )
    ).toBe(true);
  });
});

describe("resolveButtonLegalState + selectButtonStyles — the fixture's EXACT 13 legal tuples (codex impl-review major 2)", () => {
  const recipe = buildButtonRecipe(resolved, iosCtx);
  const mode = { narrow: false, rtl: false };
  const flatten = (arr: object[]) => Object.assign({}, ...arr);
  const base: ButtonStateInput = {
    pressed: false,
    focused: false,
    disabled: false,
    small: false,
    variant: 'default',
  };

  const tuples: Array<[string, ButtonStateInput, ButtonLegalState]> = [
    ['base', base, { variant: 'default', state: 'base', small: false }],
    [
      'pressed',
      { ...base, pressed: true },
      { variant: 'default', state: 'pressed', small: false },
    ],
    [
      'focused',
      { ...base, focused: true },
      { variant: 'default', state: 'focused', small: false },
    ],
    [
      'disabled',
      { ...base, disabled: true },
      { variant: 'default', state: 'disabled', small: false },
    ],
    [
      'small (composes)',
      { ...base, small: true },
      { variant: 'default', state: 'base', small: true },
    ],
    [
      'action',
      { ...base, variant: 'action' },
      { variant: 'action', state: 'base', small: false },
    ],
    [
      'actionPressed',
      { ...base, variant: 'action', pressed: true },
      { variant: 'action', state: 'pressed', small: false },
    ],
    [
      'action+focused',
      { ...base, variant: 'action', focused: true },
      { variant: 'action', state: 'focused', small: false },
    ],
    [
      'actionDisabled',
      { ...base, variant: 'action', disabled: true },
      { variant: 'action', state: 'disabled', small: false },
    ],
    [
      'danger',
      { ...base, variant: 'danger' },
      { variant: 'danger', state: 'base', small: false },
    ],
    [
      'dangerPressed (=danger)',
      { ...base, variant: 'danger', pressed: true },
      { variant: 'danger', state: 'pressed', small: false },
    ],
    [
      'danger+focused',
      { ...base, variant: 'danger', focused: true },
      { variant: 'danger', state: 'focused', small: false },
    ],
    [
      'dangerDisabled',
      { ...base, variant: 'danger', disabled: true },
      { variant: 'danger', state: 'disabled', small: false },
    ],
  ];

  it.each(tuples)(
    '%s normalizes to its fixture tuple',
    (_name, input, expected) => {
      expect(resolveButtonLegalState(input)).toEqual(expected);
    }
  );

  it.each(tuples)('%s selects a non-empty style array', (_name, input) => {
    expect(selectButtonStyles(recipe, input, mode).length).toBeGreaterThan(0);
  });

  it('illegal Cartesian inputs collapse to ONE legal tuple: disabled beats pressed beats focused', () => {
    expect(
      resolveButtonLegalState({
        ...base,
        disabled: true,
        pressed: true,
        focused: true,
      })
    ).toEqual({ variant: 'default', state: 'disabled', small: false });
    expect(
      resolveButtonLegalState({ ...base, pressed: true, focused: true })
    ).toEqual({ variant: 'default', state: 'pressed', small: false });
  });

  it('action pressed uses a DISTINCT fragment from default pressed (primary-background-dark, not general background-dark)', () => {
    const defaultPressed = flatten(
      selectButtonStyles(recipe, { ...base, pressed: true }, mode)
    );
    const actionPressed = flatten(
      selectButtonStyles(
        recipe,
        { ...base, variant: 'action', pressed: true },
        mode
      )
    );
    expect(defaultPressed.backgroundColor).not.toEqual(
      actionPressed.backgroundColor
    );
  });

  it('danger pressed is unchanged (same background as danger base)', () => {
    const dangerBase = flatten(
      selectButtonStyles(recipe, { ...base, variant: 'danger' }, mode)
    );
    const dangerPressed = flatten(
      selectButtonStyles(
        recipe,
        { ...base, variant: 'danger', pressed: true },
        mode
      )
    );
    expect(dangerBase.backgroundColor).toEqual(dangerPressed.backgroundColor);
  });

  it('action disabled uses primary-foreground-disabled color, distinct from the generic disabled color', () => {
    const genericDisabled = flatten(
      selectButtonStyles(recipe, { ...base, disabled: true }, mode)
    );
    const actionDisabled = flatten(
      selectButtonStyles(
        recipe,
        { ...base, variant: 'action', disabled: true },
        mode
      )
    );
    expect(genericDisabled.color).not.toEqual(actionDisabled.color);
  });

  it('small composes (flexGrow 1) regardless of variant and state', () => {
    const smallAction = flatten(
      selectButtonStyles(
        recipe,
        { ...base, variant: 'action', small: true },
        mode
      )
    );
    expect(smallAction.flexGrow).toBe(1);
    const smallDisabled = flatten(
      selectButtonStyles(recipe, { ...base, small: true, disabled: true }, mode)
    );
    expect(smallDisabled.flexGrow).toBe(1);
  });
});

describe('recipe build budget', () => {
  it('under 5ms', () => {
    const start = performance.now();
    buildButtonRecipe(resolved, iosCtx);
    expect(performance.now() - start).toBeLessThan(5);
  });
});
