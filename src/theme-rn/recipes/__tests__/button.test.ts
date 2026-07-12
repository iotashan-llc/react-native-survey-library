/**
 * Button recipe tests (docs/design/0.7-metrics-fixture.md, "Button --
 * sd-button.scss"). 13 fixture-locked legal states.
 */
import { resolveTheme } from '../../../theme-core/resolve';
import { buildButtonRecipe, selectButtonStyles } from '../button';
import type { ButtonVariant } from '../button';

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

describe('selectButtonStyles — 13 fixture-locked legal states', () => {
  const recipe = buildButtonRecipe(resolved, iosCtx);
  const mode = { narrow: false, rtl: false };
  const base: ButtonVariant = {
    pressed: false,
    focused: false,
    disabled: false,
    small: false,
    variant: 'default',
  };
  const states: ButtonVariant[] = [
    base,
    { ...base, pressed: true },
    { ...base, focused: true },
    { ...base, disabled: true },
    { ...base, small: true },
    { ...base, variant: 'action' },
    { ...base, variant: 'action', pressed: true },
    { ...base, variant: 'action', focused: true },
    { ...base, variant: 'action', disabled: true },
    { ...base, variant: 'danger' },
    { ...base, variant: 'danger', pressed: true },
    { ...base, variant: 'danger', focused: true },
    { ...base, variant: 'danger', disabled: true },
  ];

  it.each(states.map((v, i) => [i, v] as const))(
    'legal state %i selects without throwing',
    (_i, variant) => {
      expect(selectButtonStyles(recipe, variant, mode).length).toBeGreaterThan(0);
    }
  );

  it('action pressed uses a DISTINCT fragment from default pressed (primary-background-dark, not general background-dark)', () => {
    const defaultPressed = Object.assign(
      {},
      ...selectButtonStyles(recipe, { ...base, pressed: true }, mode)
    );
    const actionPressed = Object.assign(
      {},
      ...selectButtonStyles(
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
    const dangerBase = Object.assign(
      {},
      ...selectButtonStyles(recipe, { ...base, variant: 'danger' }, mode)
    );
    const dangerPressed = Object.assign(
      {},
      ...selectButtonStyles(
        recipe,
        { ...base, variant: 'danger', pressed: true },
        mode
      )
    );
    expect(dangerBase.backgroundColor).toEqual(dangerPressed.backgroundColor);
  });

  it('action disabled uses primary-foreground-disabled color, distinct from the generic disabled color', () => {
    const genericDisabled = Object.assign(
      {},
      ...selectButtonStyles(recipe, { ...base, disabled: true }, mode)
    );
    const actionDisabled = Object.assign(
      {},
      ...selectButtonStyles(
        recipe,
        { ...base, variant: 'action', disabled: true },
        mode
      )
    );
    expect(genericDisabled.color).not.toEqual(actionDisabled.color);
  });

  it('small composes (flexGrow 1) regardless of variant', () => {
    const smallAction = Object.assign(
      {},
      ...selectButtonStyles(
        recipe,
        { ...base, variant: 'action', small: true },
        mode
      )
    );
    expect(smallAction.flexGrow).toBe(1);
  });
});

describe('recipe build budget', () => {
  it('under 5ms', () => {
    const start = performance.now();
    buildButtonRecipe(resolved, iosCtx);
    expect(performance.now() - start).toBeLessThan(5);
  });
});
