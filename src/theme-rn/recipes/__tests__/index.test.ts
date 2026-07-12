/**
 * Aggregate recipe tests (design test plan #1, strengthened per codex
 * impl-review major 9): "Recipe validity across ALL 40 themes" now means
 * FLATTENING every exemplar's exact legal states across every platform
 * tier and asserting the platform shadow-channel outputs + diagnostics —
 * not just finite-number spot checks. Per-recipe timing is budgeted
 * INDIVIDUALLY (< 5ms each, warmed), and the provider mounts under
 * StrictMode for the curated themes.
 */
import * as React from 'react';
import { StrictMode } from 'react';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { buildRecipes } from '../index';
import {
  buildItemRecipe,
  buildInputRecipe,
  buildButtonRecipe,
  buildQuestionTitleRecipe,
  buildUnsupportedQuestionRecipe,
  selectItemStyles,
  selectInputStyles,
  selectButtonStyles,
  selectQuestionTitleStyles,
} from '../index';
import type {
  ItemStateInput,
  InputStateInput,
  ButtonStateInput,
  QuestionTitleVariant,
  RecipeBuildDiagnostic,
} from '../index';
import { resolveTheme } from '../../../theme-core/resolve';
import { SurveyThemeProvider, SurveyThemeContext } from '../../provider';
import type { SurveyThemeContextValue } from '../../provider';
import * as themesFacade from '../../../core/themes';
import { THEME_MANIFEST } from '../../../core/themes';
import type { ITheme } from '../../../core/facade';

function getManifestTheme(name: string): ITheme {
  const theme = (themesFacade as unknown as Record<string, ITheme | undefined>)[
    name
  ];
  if (!theme) throw new Error(`manifest name ${name} did not resolve`);
  return theme;
}

const CURATED = [
  'DefaultLight',
  'SharpDark',
  'ContrastLight',
  'LayeredDark',
  'ThreeDimensionalLight',
] as const;

const MODE = { narrow: false, rtl: false };

// The fixtures' exact legal-state enumerations, as raw selector inputs.
const ITEM_BASE: ItemStateInput = {
  checked: false,
  pressed: false,
  focused: false,
  readOnly: false,
  preview: false,
  error: false,
  allowHover: true,
};
const ITEM_STATES: ItemStateInput[] = [
  ITEM_BASE,
  { ...ITEM_BASE, checked: true, allowHover: false },
  { ...ITEM_BASE, readOnly: true, allowHover: false },
  { ...ITEM_BASE, checked: true, readOnly: true, allowHover: false },
  { ...ITEM_BASE, preview: true },
  { ...ITEM_BASE, checked: true, preview: true, allowHover: false },
  { ...ITEM_BASE, error: true },
  { ...ITEM_BASE, checked: true, error: true, allowHover: false },
  { ...ITEM_BASE, pressed: true },
  { ...ITEM_BASE, focused: true },
  { ...ITEM_BASE, checked: true, focused: true, allowHover: false },
  { ...ITEM_BASE, addOn: 'selectAll' },
];

const INPUT_BASE: InputStateInput = {
  focused: false,
  readOnly: false,
  preview: false,
  error: false,
};
const INPUT_STATES: InputStateInput[] = [
  INPUT_BASE,
  { ...INPUT_BASE, focused: true },
  { ...INPUT_BASE, readOnly: true },
  { ...INPUT_BASE, preview: true },
  { ...INPUT_BASE, error: true },
  { ...INPUT_BASE, error: true, focused: true },
  { ...INPUT_BASE, focused: true, counter: 'normal' },
  { ...INPUT_BASE, focused: true, counter: 'big' },
  { ...INPUT_BASE, disabled: true },
];

const BUTTON_BASE: ButtonStateInput = {
  pressed: false,
  focused: false,
  disabled: false,
  small: false,
  variant: 'default',
};
const BUTTON_STATES: ButtonStateInput[] = (
  ['default', 'action', 'danger'] as const
).flatMap((variant) => [
  { ...BUTTON_BASE, variant },
  { ...BUTTON_BASE, variant, pressed: true },
  { ...BUTTON_BASE, variant, focused: true },
  { ...BUTTON_BASE, variant, disabled: true },
]);
BUTTON_STATES.push({ ...BUTTON_BASE, small: true });

const TITLE_STATES: QuestionTitleVariant[] = [
  { required: false, errorTone: false, collapsed: false },
  { required: true, errorTone: false, collapsed: false },
  { required: false, errorTone: true, collapsed: false },
  { required: false, errorTone: false, collapsed: true },
];

type FlatStyle = Record<string, unknown>;

function assertFiniteNumbers(flat: FlatStyle, context: string): void {
  for (const [key, value] of Object.entries(flat)) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error(`${context}: ${key} is not finite (${value})`);
      }
    }
  }
}

/**
 * Platform shadow-channel invariants (codex impl-review majors 1+9):
 *  - boxShadow, when present, is an array of finite-numbered layers with
 *    string colors;
 *  - on the Android elevation tier (<28) NO composed state may carry a
 *    non-empty boxShadow — the shadow must live in `elevation` (a finite
 *    number >= 0);
 *  - on boxShadow-capable tiers `elevation`, when present, is only the
 *    0-clear of a no-shadow state.
 */
function assertShadowChannels(
  flat: FlatStyle,
  tier: 'boxShadow' | 'elevation',
  context: string
): void {
  const boxShadow = flat.boxShadow as
    Array<Record<string, unknown>> | undefined;
  const elevation = flat.elevation as number | undefined;
  if (boxShadow !== undefined) {
    expect(Array.isArray(boxShadow)).toBe(true);
    for (const layer of boxShadow) {
      for (const prop of [
        'offsetX',
        'offsetY',
        'blurRadius',
        'spreadDistance',
      ]) {
        if (layer[prop] !== undefined) {
          expect(Number.isFinite(layer[prop] as number)).toBe(true);
        }
      }
      expect(typeof layer.color).toBe('string');
    }
  }
  if (tier === 'elevation') {
    if (boxShadow !== undefined && boxShadow.length > 0) {
      throw new Error(
        `${context}: non-empty boxShadow leaked onto the Android elevation tier`
      );
    }
    if (elevation !== undefined) {
      expect(Number.isFinite(elevation)).toBe(true);
      expect(elevation).toBeGreaterThanOrEqual(0);
    }
  } else if (elevation !== undefined) {
    expect(elevation).toBe(0);
  }
}

const PLATFORMS = [
  { platform: { os: 'ios' as const }, tier: 'boxShadow' as const },
  {
    platform: { os: 'android' as const, apiLevel: 34 },
    tier: 'boxShadow' as const,
  },
  {
    platform: { os: 'android' as const, apiLevel: 28 },
    tier: 'boxShadow' as const,
  },
  {
    platform: { os: 'android' as const, apiLevel: 21 },
    tier: 'elevation' as const,
  },
];

describe('recipe validity — 40 themes x 4 platform tiers x EXACT legal states, flattened (codex impl-review major 9)', () => {
  it.each(THEME_MANIFEST)(
    '%s: every exemplar legal state flattens to valid platform-correct styles',
    (name) => {
      const resolved = resolveTheme(getManifestTheme(name));
      for (const { platform, tier } of PLATFORMS) {
        const diagnostics: RecipeBuildDiagnostic[] = [];
        const recipes = buildRecipes(resolved, { platform, diagnostics });

        for (const shape of ['checkbox', 'radio'] as const) {
          ITEM_STATES.forEach((state, i) => {
            const slots = selectItemStyles(recipes.item, state, MODE, shape);
            const context = `${name}/${platform.os}${
              'apiLevel' in platform ? platform.apiLevel : ''
            }/item[${i}]/${shape}`;
            const flatDecorator = StyleSheet.flatten(slots.decorator)!;
            assertFiniteNumbers(flatDecorator, context);
            assertShadowChannels(flatDecorator, tier, context);
            assertFiniteNumbers(StyleSheet.flatten(slots.container)!, context);
          });
        }

        INPUT_STATES.forEach((state, i) => {
          const flat = StyleSheet.flatten(
            selectInputStyles(recipes.input, state, MODE)
          )!;
          const context = `${name}/input[${i}]`;
          assertFiniteNumbers(flat, context);
          assertShadowChannels(flat, tier, context);
        });

        BUTTON_STATES.forEach((state, i) => {
          const flat = StyleSheet.flatten(
            selectButtonStyles(recipes.button, state, MODE)
          )!;
          const context = `${name}/button[${i}]`;
          assertFiniteNumbers(flat, context);
          assertShadowChannels(flat, tier, context);
        });

        TITLE_STATES.forEach((state, i) => {
          const flat = StyleSheet.flatten(
            selectQuestionTitleStyles(recipes.questionTitle, state)
          )!;
          assertFiniteNumbers(flat, `${name}/title[${i}]`);
        });

        // Diagnostics tier contract: android codes appear ONLY on android
        // tiers, and the elevation tier reports its fallback whenever the
        // theme carries any shadow layers at all.
        const androidCodes = diagnostics.filter((d) =>
          d.code.startsWith('theme-rn/android')
        );
        if (platform.os === 'ios') {
          expect(androidCodes).toEqual([]);
        }
        if (tier === 'elevation') {
          const hasAnyShadow = Object.values(resolved.tokens.shadows).some(
            (layers) => layers.length > 0
          );
          if (hasAnyShadow) {
            expect(
              androidCodes.some(
                (d) => d.code === 'theme-rn/android-shadow-elevation-fallback'
              )
            ).toBe(true);
          }
        }
      }
    }
  );
});

describe('per-recipe build budget — < 5ms EACH, warmed (design test plan #1; codex impl-review major 9)', () => {
  const resolved = resolveTheme(getManifestTheme('DefaultLight'));
  const ctx = { platform: { os: 'ios' as const } };

  beforeAll(() => {
    // Warm module/JIT state so the timed runs reflect steady-state cost.
    buildRecipes(resolved, ctx);
  });

  const cases: Array<[string, () => unknown]> = [
    ['item', () => buildItemRecipe(resolved, ctx)],
    ['input', () => buildInputRecipe(resolved, ctx)],
    ['button', () => buildButtonRecipe(resolved, ctx)],
    ['questionTitle', () => buildQuestionTitleRecipe(resolved, ctx)],
    [
      'unsupportedQuestion',
      () => buildUnsupportedQuestionRecipe(resolved, ctx),
    ],
  ];

  it.each(cases)('%s builds in under 5ms', (_name, build) => {
    // Best-of-3 to keep shared-CI scheduling noise out of the signal
    // while still catching a real per-recipe regression.
    let best = Infinity;
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      build();
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(5);
  });
});

describe('StrictMode mount — provider + recipes survive double-invoked lifecycles (codex impl-review major 9)', () => {
  function Consumer({
    onValue,
  }: {
    onValue: (value: SurveyThemeContextValue) => void;
  }) {
    const value = React.useContext(SurveyThemeContext);
    onValue(value);
    return React.createElement(Text, null, 'ok');
  }

  it.each(CURATED)('%s mounts under StrictMode without throwing', (name) => {
    const seen: SurveyThemeContextValue[] = [];
    expect(() =>
      render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            SurveyThemeProvider,
            { theme: getManifestTheme(name) },
            React.createElement(Consumer, {
              onValue: (v: SurveyThemeContextValue) => seen.push(v),
            })
          )
        )
      )
    ).not.toThrow();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]?.recipes.item).toBeDefined();
  });
});

describe('curated recipe golden snapshots', () => {
  it.each(CURATED)('%s: recipes build to a stable snapshot (iOS)', (name) => {
    const resolved = resolveTheme(getManifestTheme(name));
    const recipes = buildRecipes(resolved, { platform: { os: 'ios' } });
    expect(recipes).toMatchSnapshot();
  });
});
