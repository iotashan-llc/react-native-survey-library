/**
 * Ranking recipe tests (task 4.1, design:
 * docs/design/0.7-metrics-fixture.md analog). Fixtures:
 * `default-theme/blocks/sv-ranking.scss` + `sd-ranking.scss`. The recipe
 * owns ONLY model-derived tokens (rank-number readOnly/preview/error, the
 * disabled label opacity) plus the native-interaction ghost/drop-placeholder
 * (invariant 6); the component owns pressed/focused/dragging.
 */
import { StyleSheet } from 'react-native';
import { resolveTheme } from '../../../theme-core/resolve';
import { resolveColorVar } from '../tokenLookup';
import {
  buildRankingRecipe,
  selectRankingItemStyles,
  rankingHandleIconFill,
} from '../ranking';
import type { RankingItemStateInput } from '../ranking';
import { THEME_MANIFEST } from '../../../core/themes';
import * as themesFacade from '../../../core/themes';
import type { ITheme } from '../../../core/facade';

const resolved = resolveTheme(undefined);

function input(
  overrides: Partial<RankingItemStateInput> = {}
): RankingItemStateInput {
  return {
    disabled: false,
    readOnly: false,
    preview: false,
    error: false,
    ghost: false,
    ...overrides,
  };
}

function getManifestTheme(name: string): ITheme {
  const theme = (themesFacade as unknown as Record<string, ITheme | undefined>)[
    name
  ];
  if (!theme) throw new Error(`manifest name ${name} did not resolve`);
  return theme;
}

describe('buildRankingRecipe — formulas from resolved tokens (base-unit 8)', () => {
  const recipe = buildRankingRecipe(resolved);

  it('item content row: flexDirection row, borderRadius calcSize(12.5)=100, paddingVertical calcSize(0.5)=4', () => {
    expect(recipe.fragments.item.flexDirection).toBe('row');
    expect(recipe.fragments.item.borderRadius).toBe(100);
    expect(recipe.fragments.item.paddingVertical).toBe(4);
  });

  it('rankNumber badge: width/height calcSize(5)=40, circular borderRadius 20, borderWidth calcSize(0.25)=2', () => {
    expect(recipe.fragments.rankNumber.width).toBe(40);
    expect(recipe.fragments.rankNumber.height).toBe(40);
    expect(recipe.fragments.rankNumber.borderRadius).toBe(20);
    expect(recipe.fragments.rankNumber.borderWidth).toBe(2);
  });

  it('rankNumberText: fontWeight 600, fontSize = editor font size (16)', () => {
    expect(recipe.fragments.rankNumberText.fontWeight).toBe('600');
    expect(recipe.fragments.rankNumberText.fontSize).toBe(16);
  });

  it('handle: width/height calcSize(3)=24; handleIconSize 24', () => {
    expect(recipe.fragments.handle.width).toBe(24);
    expect(recipe.handleIconSize).toBe(24);
  });

  it('label: marginHorizontal calcSize(2)=16, paddingVertical calcSize(1)=8', () => {
    expect(recipe.fragments.label.marginHorizontal).toBe(16);
    expect(recipe.fragments.label.paddingVertical).toBe(8);
  });

  it('itemGhost (drop-placeholder): height calcSize(5)=40, borderRadius calcSize(12.5)=100', () => {
    expect(recipe.fragments.itemGhost.height).toBe(40);
    expect(recipe.fragments.itemGhost.borderRadius).toBe(100);
  });

  it('formulas track a custom --sjs-base-unit (formula-first, not hardcoded)', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-base-unit': '10px' },
    });
    const customRecipe = buildRankingRecipe(custom);
    // calcSize(5) = 5 * 10 = 50
    expect(customRecipe.fragments.rankNumber.width).toBe(50);
  });
});

describe('selectRankingItemStyles — model-state token composition', () => {
  const recipe = buildRankingRecipe(resolved);

  it('base: item = [item fragment], no ghost, no label-disabled', () => {
    const styles = selectRankingItemStyles(recipe, input());
    expect(styles.item).toEqual([recipe.fragments.item]);
    expect(styles.label).toEqual([recipe.fragments.label]);
    expect(styles.rankNumber).toEqual([recipe.fragments.rankNumber]);
  });

  it('ghost: appends itemGhost to the item slot (native drop-placeholder)', () => {
    const styles = selectRankingItemStyles(recipe, input({ ghost: true }));
    expect(styles.item).toEqual([
      recipe.fragments.item,
      recipe.fragments.itemGhost,
    ]);
  });

  it('disabled: appends labelDisabled (opacity 0.25) to the label slot', () => {
    const styles = selectRankingItemStyles(recipe, input({ disabled: true }));
    expect(styles.label).toEqual([
      recipe.fragments.label,
      recipe.fragments.labelDisabled,
    ]);
    expect(recipe.fragments.labelDisabled.opacity).toBe(0.25);
  });

  it('readOnly: rankNumber gets the readOnly badge background', () => {
    const styles = selectRankingItemStyles(recipe, input({ readOnly: true }));
    expect(styles.rankNumber).toEqual([
      recipe.fragments.rankNumber,
      recipe.fragments.rankNumberReadOnly,
    ]);
  });

  it('preview beats readOnly; error beats preview (badge precedence)', () => {
    expect(
      selectRankingItemStyles(recipe, input({ readOnly: true, preview: true }))
        .rankNumber
    ).toEqual([
      recipe.fragments.rankNumber,
      recipe.fragments.rankNumberPreview,
    ]);
    expect(
      selectRankingItemStyles(
        recipe,
        input({ readOnly: true, preview: true, error: true })
      ).rankNumber
    ).toEqual([recipe.fragments.rankNumber, recipe.fragments.rankNumberError]);
  });
});

describe('rankingHandleIconFill', () => {
  const recipe = buildRankingRecipe(resolved);
  const primary = resolveColorVar(resolved, '--sjs-primary-backcolor').css;
  const foregroundLight = resolveColorVar(
    resolved,
    '--sjs-general-forecolor-light'
  ).css;

  it('enabled handle fills $primary; disabled fills $foreground-light', () => {
    expect(rankingHandleIconFill(recipe, input())).toBe(primary);
    expect(rankingHandleIconFill(recipe, input({ disabled: true }))).toBe(
      foregroundLight
    );
  });
});

describe('ranking recipe — finite platform-correct styles across all 40 themes', () => {
  const STATES: RankingItemStateInput[] = [
    input(),
    input({ ghost: true }),
    input({ disabled: true }),
    input({ readOnly: true }),
    input({ preview: true }),
    input({ error: true }),
  ];

  it.each(THEME_MANIFEST)(
    '%s: every legal state flattens to finite numbers',
    (name) => {
      const themed = resolveTheme(getManifestTheme(name));
      const recipe = buildRankingRecipe(themed);
      for (const state of STATES) {
        const styles = selectRankingItemStyles(recipe, state);
        for (const slot of [styles.item, styles.rankNumber, styles.label]) {
          const flat = StyleSheet.flatten(slot) as Record<string, unknown>;
          for (const value of Object.values(flat)) {
            if (typeof value === 'number') {
              expect(Number.isFinite(value)).toBe(true);
            }
          }
        }
      }
    }
  );
});
