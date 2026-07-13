/**
 * Survey-header recipe (task 1.6 — basic header: title/description/logo).
 * Fixture: upstream `default-theme/blocks/sd-title.scss`
 * (`.sd-title.sd-container-modern__title` container + `.sd-header__text`
 * column), `mixins.scss:187-197` (`survey_title`/`survey_description`
 * font formulas), `variables.scss:65-71` (surveytitle/surveydescription
 * fallback chains), and `default.m600.scss`'s `--mobile` MODIFIER tier —
 * RN IS the mobile context (`.sd-root-modern--mobile`), so the fixture
 * is the mobile rule set, NOT the base m600 tier (which still lays the
 * header out as a desktop row with 24dp padding):
 * - `--sd-page-vertical-padding: calc(2 * base-unit)` (m600.scss:11-16),
 * - `.sd-title.sd-container-modern__title { flex-direction: column }`
 *   (m600.scss:32-34),
 * - `.sd-header__text { min-width: 100% }` (m600.scss:36-38).
 * Every metric is FORMULA-first from resolved tokens
 * (0.7-metrics-fixture.md rule).
 *
 * Documented deltas:
 * - The container accent `box-shadow: 0px 2px 0px $primary`
 *   (sd-title.scss:19) is a blur-0, spread-0 bottom hairline — mapped to
 *   a 2dp bottom border (identical pixels, no cross-platform shadow
 *   machinery for what is visually a border).
 * - `--sjs-font-surveytitle-size`'s registry default is a `calc()`
 *   expression; the recipe's var lookup handles terminal px values and
 *   falls back to the mixin's own formula (`2 x --sjs-font-size`) for
 *   calc-shaped or missing values — same net number for the default
 *   theme, and explicit `NNpx` theme overrides win.
 */
import { StyleSheet } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import { evaluateVarExpression } from '../../theme-core/helpers';
import { REGISTRY } from '../../theme-core/registry';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcSize, calcFontSize, resolveColorVar } from './tokenLookup';
import type { BuildContext } from './types';

export interface HeaderRecipe {
  fragments: {
    /** `.sd-title.sd-container-modern__title` — the header container. */
    root: ViewStyle;
    /** `.sd-header__text` — the title+description column. */
    textBlock: ViewStyle;
    title: TextStyle;
    description: TextStyle;
    /** The logo wrapper (`.sd-logo`). */
    logo: ViewStyle;
    /** `.sd-logo__image`. */
    logoImage: ImageStyle;
  };
}

/**
 * Dereferences a non-color `--sjs-*` variable: the post-overlay raw value
 * when the theme sets it, else the registry default RE-EVALUATED against
 * the post-overlay environment (the same rule `resolveColorVar` follows —
 * tokenLookup.ts "REGISTRY-AWARE"). Returns `undefined` when neither
 * yields a terminal value.
 */
function resolveRawVar(
  resolved: ResolvedTheme,
  name: string
): string | undefined {
  const own = evaluateVarExpression(resolved.rawVariables, `var(${name})`);
  if (own.value !== undefined) return own.value;
  const registryDefault = REGISTRY[name]?.default;
  if (!registryDefault) return undefined;
  return evaluateVarExpression(resolved.rawVariables, registryDefault).value;
}

/** Terminal `NNpx`/bare-number values only; `calc()`-shaped or missing → `undefined` (caller supplies the mixin formula). */
function resolvePxVar(
  resolved: ResolvedTheme,
  name: string
): number | undefined {
  const value = resolveRawVar(resolved, name);
  if (value === undefined) return undefined;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(?:px)?$/);
  return match ? parseFloat(match[1] as string) : undefined;
}

function resolveWeightVar(
  resolved: ResolvedTheme,
  name: string,
  fallback: TextStyle['fontWeight']
): TextStyle['fontWeight'] {
  const value = resolveRawVar(resolved, name)?.trim();
  return value ? (value as TextStyle['fontWeight']) : fallback;
}

function resolveFamilyVar(
  resolved: ResolvedTheme,
  name: string
): string | undefined {
  const value = resolveRawVar(resolved, name)?.trim();
  if (value) return value;
  return resolved.tokens.typography.base.fontFamily || undefined;
}

export function buildHeaderRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): HeaderRecipe {
  const sink = buildCtx?.diagnostics;

  // survey_title mixin (mixins.scss:188): var(--sjs-font-surveytitle-size,
  // calc(2 * var(--sjs-font-size))) — lineHeight multiply(1.25, size).
  const titleFontSize =
    resolvePxVar(resolved, '--sjs-font-surveytitle-size') ??
    calcFontSize(resolved, 2);
  // survey_description mixin (mixins.scss:194): var(
  // --sjs-font-surveydescription-size, var(--sjs-font-size)) — lineHeight
  // multiply(1.5, size).
  const descriptionFontSize =
    resolvePxVar(resolved, '--sjs-font-surveydescription-size') ??
    calcFontSize(resolved, 1);

  const fragments = StyleSheet.create({
    root: {
      // .sd-title.sd-container-modern__title: display flex + align-items
      // center + gap calcSize(4) (sd-title.scss:13-19); the mobile
      // modifier flips it to a COLUMN (m600.scss:32-34) and sets
      // --sd-page-vertical-padding = calc(2 * base-unit) (m600.scss:15).
      flexDirection: 'column',
      alignItems: 'center',
      gap: calcSize(resolved, 4),
      padding: calcSize(resolved, 2),
      // box-shadow: 0px 2px 0px $primary (sd-title.scss:19) — see the
      // header docblock delta note.
      borderBottomWidth: 2,
      borderBottomColor: resolveColorVar(
        resolved,
        '--sjs-primary-backcolor',
        sink
      ).css,
    },
    textBlock: {
      // .sd-header__text: column, gap calcSize(1), flex-grow 1
      // (sd-title.scss:30-34); the mobile modifier adds min-width: 100%
      // (m600.scss:36-38) so the text spans the full header width under
      // the column layout; flexShrink so a long title wraps instead of
      // overflowing (RN flexbox needs it explicit).
      flexDirection: 'column',
      gap: calcSize(resolved, 1),
      flexGrow: 1,
      flexShrink: 1,
      minWidth: '100%',
    },
    title: {
      fontSize: titleFontSize,
      lineHeight: 1.25 * titleFontSize,
      fontWeight: resolveWeightVar(
        resolved,
        '--sjs-font-surveytitle-weight',
        '700'
      ),
      fontFamily: resolveFamilyVar(resolved, '--sjs-font-surveytitle-family'),
      color: resolveColorVar(resolved, '--sjs-font-surveytitle-color', sink)
        .css,
    },
    description: {
      fontSize: descriptionFontSize,
      lineHeight: 1.5 * descriptionFontSize,
      fontWeight: resolveWeightVar(
        resolved,
        '--sjs-font-surveydescription-weight',
        '400'
      ),
      fontFamily: resolveFamilyVar(
        resolved,
        '--sjs-font-surveydescription-family'
      ),
      color: resolveColorVar(
        resolved,
        '--sjs-font-surveydescription-color',
        sink
      ).css,
    },
    logo: {
      // .sd-logo carries no metrics of its own in the basic header; the
      // wrapper exists as an override slot + testID host.
    },
    logoImage: {
      // .sd-logo__image { margin-top: calcSize(1) } (sd-title.scss:25-27).
      marginTop: calcSize(resolved, 1),
    },
  });

  return { fragments };
}
