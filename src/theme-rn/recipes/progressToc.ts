/**
 * Table-of-contents recipe (task 5.7b). Fixture harvested from upstream
 * `default-theme/blocks/sd-progress-toc.scss`:
 * - `.sv_progress-toc` — the side column: `padding: calcSize(1)`,
 *   `background: $background`, `min-width: calcSize(32)`,
 *   `max-width: calcSize(42)`.
 * - `.sv_progress-toc--left` / `--right` — the 1px `$border` divider on
 *   the inner edge.
 * - `.sv_progress-toc--mobile` — the floating hamburger badge:
 *   `background-color: $background-dim`, `border-radius: calcSize(3)`, a
 *   `calcSize(3)` inner glyph box; `use { fill: $foreground-light }` is
 *   the glyph tint.
 *
 * SCOPE (invariant: reuse the overlay list stack; invariant 6: never
 * duplicate core's model-state styling). The TOC list is rendered
 * through the shared `ListPicker`, so a row's per-item and ACTIVE-row
 * highlight are owned by the `listItem` recipe's selected variant — the
 * RN analog of scss's
 * `.sv_progress-toc .sv-list__item--selected .sv-list__item-body`
 * ($primary-light). This recipe therefore owns ONLY the column
 * container + the mobile toggle; it does not re-harvest item/item--active
 * tokens (documented in DIFFERENCES.md → "Table of contents").
 */
import { StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcSize, calcFontSize, resolveColorVar } from './tokenLookup';
import type { BuildContext } from './types';

export interface ProgressTocRecipe {
  fragments: {
    /** `.sv_progress-toc` — the wide side column (padding + bg + width band). */
    container: ViewStyle;
    /** `.sv_progress-toc--left` — divider on the right edge. */
    containerLeft: ViewStyle;
    /** `.sv_progress-toc--right` — divider on the left edge. */
    containerRight: ViewStyle;
    /** `.sv_progress-toc--mobile` — the hamburger toggle touch target. */
    toggle: ViewStyle;
    /** The hamburger glyph (`use { fill: $foreground-light }`). */
    toggleGlyph: TextStyle;
  };
}

export function buildProgressTocRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): ProgressTocRecipe {
  const sink = buildCtx?.diagnostics;
  const background = resolveColorVar(
    resolved,
    '--sjs-general-backcolor',
    sink
  ).css;
  const border = resolveColorVar(resolved, '--sjs-border-light', sink).css;
  const backgroundDim = resolveColorVar(
    resolved,
    '--sjs-general-backcolor-dim',
    sink
  ).css;
  const glyph = resolveColorVar(
    resolved,
    '--sjs-general-forecolor-light',
    sink
  ).css;

  const fragments = StyleSheet.create({
    container: {
      // .sv_progress-toc { padding: calcSize(1); background: $background;
      // min-width: calcSize(32); max-width: calcSize(42); height: 100% }.
      paddingVertical: calcSize(resolved, 1),
      paddingHorizontal: calcSize(resolved, 1),
      backgroundColor: background,
      minWidth: calcSize(resolved, 32),
      maxWidth: calcSize(resolved, 42),
    },
    containerLeft: {
      // .sv_progress-toc--left { border-right: 1px solid $border }.
      borderRightWidth: 1,
      borderRightColor: border,
    },
    containerRight: {
      // .sv_progress-toc--right { border-left: 1px solid $border }.
      borderLeftWidth: 1,
      borderLeftColor: border,
    },
    toggle: {
      // .sv_progress-toc--mobile { background-color: $background-dim;
      // border-radius: calcSize(3) } with a comfortable (calcSize(6))
      // native touch target for the calcSize(3) glyph box.
      alignSelf: 'flex-end',
      alignItems: 'center',
      justifyContent: 'center',
      width: calcSize(resolved, 6),
      height: calcSize(resolved, 6),
      borderRadius: calcSize(resolved, 3),
      backgroundColor: backgroundDim,
    },
    toggleGlyph: {
      fontSize: calcFontSize(resolved, 1.5),
      color: glyph,
    },
  });

  return { fragments };
}
