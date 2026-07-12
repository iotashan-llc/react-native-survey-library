/**
 * Recipe contract (design: docs/design/0.7-theme-rn.md, "Recipes —
 * build/select split"). `buildRecipes(resolved, buildCtx)` runs at
 * provider (re)build time and produces `StyleSheet.create`'d ATOMIC style
 * fragments per component plus a discriminated selector map of LEGAL
 * states only (the fixture's explicit tuples — never a blind Cartesian
 * table). `selectStyles(recipe, ...)` runs at render time: array
 * composition of prebuilt fragments, zero object allocation beyond the
 * composed array.
 */
import type { StyleProp, ViewStyle, TextStyle, ImageStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import type { ShadowMapResult } from '../shadows';

export type RNStyle = ViewStyle | TextStyle | ImageStyle;

/** Shadow mapper's platform input (design: shadows.ts's `PlatformShadowSpec`) — a BUILD input, so it participates in the recipe cache key (unlike `narrow`/`rtl`, which are SELECT-time inputs; design: "every recipe build input, spacingMode excluded, participates in the cache key"). */
export interface RecipeBuildPlatform {
  os: 'ios' | 'android';
  apiLevel?: number;
}

/**
 * Build-time diagnostic (codex impl-review majors 1+6): a structural
 * superset of theme-core's `ThemeDiagnostic` (whose closed code union is
 * assignable into `code: string`) that also carries theme-rn codes
 * (`theme-rn/android-shadow-*`). Recipes push into
 * `BuildContext.diagnostics`; `SurveyThemeProvider` flushes post-commit
 * through the 0.5 seam, deduped for the provider's lifetime.
 */
export interface RecipeBuildDiagnostic {
  code: string;
  variable?: string;
  message: string;
  value?: string;
}

export interface BuildContext {
  platform: RecipeBuildPlatform;
  /** Optional build-diagnostics sink (shadow-tier fallbacks, color-var registry fallbacks). */
  diagnostics?: RecipeBuildDiagnostic[];
}

/**
 * Forwards a shadow-map result's diagnostics into the build sink, tagged
 * with the SOURCE token variable (the mapper itself doesn't know which
 * token produced the layers — the recipe does).
 */
export function reportShadowResult(
  buildCtx: BuildContext,
  variable: string,
  result: ShadowMapResult
): void {
  if (!buildCtx.diagnostics) return;
  for (const diagnostic of result.diagnostics) {
    buildCtx.diagnostics.push({
      code: diagnostic.code,
      variable,
      message: diagnostic.message,
    });
  }
}

/**
 * A12 consumer style-override surface (design ownership table: "A12
 * consumer style-override types ... precedence: recipe < theme < consumer
 * override"). `theme` and `override` are both OPTIONAL extra style
 * layers a component may compose on top of the recipe's own selected
 * fragment(s) — `theme` for a future theme-JSON-driven per-component slot
 * (not yet produced by any 0.7 recipe; the type exists so component ports
 * have a stable slot to target), `override` for the consumer-supplied
 * slot from `SurveyComponentStyles` (codex impl-review major 8: typed as
 * RN `StyleProp` so hosts pass exactly what they'd pass to a `style`
 * prop, registered styles and conditional falsy entries included).
 */
export interface StyleOverrideLayers<S extends RNStyle = RNStyle> {
  theme?: StyleProp<S>;
  override?: StyleProp<S>;
}

/**
 * Composes [recipe fragment(s), theme layer, consumer override] in RN
 * array-style precedence (later entries win) — recipe is the base, theme
 * refines it, the consumer's explicit override always wins last. Filters
 * out nullish/false entries so callers can pass optional/conditional
 * layers directly; nested arrays stay nested (RN accepts recursive style
 * arrays).
 */
export function composeStyles<S extends RNStyle = RNStyle>(
  recipeFragments: S | S[] | undefined,
  layers?: StyleOverrideLayers<S>
): StyleProp<S>[] {
  const groups: Array<S | S[] | StyleProp<S> | undefined> = [
    recipeFragments,
    layers?.theme,
    layers?.override,
  ];
  const result: StyleProp<S>[] = [];
  for (const group of groups) {
    if (!group) continue;
    if (Array.isArray(group)) {
      for (const entry of group) {
        if (entry) result.push(entry as StyleProp<S>);
      }
    } else {
      result.push(group as StyleProp<S>);
    }
  }
  return result;
}

export function resolvePlatformFromRN(
  os: 'ios' | 'android' | string,
  version: number | string | undefined
): RecipeBuildPlatform {
  if (os === 'android') {
    const apiLevel =
      typeof version === 'number' ? version : Number(version ?? 0);
    return {
      os: 'android',
      apiLevel: Number.isFinite(apiLevel) ? apiLevel : 0,
    };
  }
  return { os: 'ios' };
}

export type RecipeBuilder<TRecipe> = (
  resolved: ResolvedTheme,
  buildCtx: BuildContext
) => TRecipe;
