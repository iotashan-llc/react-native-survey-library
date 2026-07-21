/**
 * Image-map recipe (task 5.4). Fixtures: `default-theme/blocks/
 * sd-imagemap.scss` — the SVG hotspot shapes are IDLE transparent
 * (fill/stroke `transparent`, `stroke-width: 0`) and, when SELECTED, take
 * `--sd-imagemap-selected-fill-color` (default `--sjs-primary-backcolor-light`)
 * / `--sd-imagemap-selected-stroke-color` (default `--sjs-primary-backcolor`)
 * / `stroke-width: 1`. Resolved through the metrics-fixture helpers — never
 * a hardcoded literal (design 0.7-metrics-fixture).
 *
 * Per invariant 6 the recipe owns ONLY these token DEFAULTS: the component
 * prefers each area's / the question's own `idle*`/`selected*` color props
 * (survey-core's `--sd-imagemap-*` CSS-variable cascade) and falls back to
 * these recipe values only when they are unset. The hover state has no
 * touch analog and is not rendered (documented in DIFFERENCES.md).
 */
import { StyleSheet } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcFontSize, calcSize, resolveColorVar } from './tokenLookup';
import type { BuildContext } from './types';

export interface ImageMapRecipe {
  fragments: {
    /** `.sd-imagemap` root (stretches so onLayout measures the available width). */
    container: ViewStyle;
    /** The sized box the base `<Image>` + absolute `<Svg>` overlay share. */
    imageBox: ViewStyle;
    /** Base `<Image>` (dimensions set inline from the measured layout). */
    image: ImageStyle;
    /** Peer-absent fallback wrapper. */
    fallback: ViewStyle;
    /** Fallback message text. */
    fallbackText: TextStyle;
  };
  /** Idle-shape fill when neither area nor question sets one (`transparent`). */
  idleFill: string;
  /** Idle-shape stroke when unset (`transparent`). */
  idleStroke: string;
  /** Idle-shape stroke width when unset (`0`). */
  idleStrokeWidth: number;
  /** Selected-shape fill default (`--sjs-primary-backcolor-light`). */
  selectedFill: string;
  /** Selected-shape stroke default (`--sjs-primary-backcolor`). */
  selectedStroke: string;
  /** Selected-shape stroke width default (`1`). */
  selectedStrokeWidth: number;
}

export function buildImageMapRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): ImageMapRecipe {
  const sink = buildCtx?.diagnostics;
  const selectedFill = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor-light',
    sink
  ).css;
  const selectedStroke = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;
  const fontDesc = resolveColorVar(
    resolved,
    '--sjs-font-questiondescription-color',
    sink
  ).css;

  const fragments = StyleSheet.create({
    container: {
      alignSelf: 'stretch',
      position: 'relative',
    },
    imageBox: {
      position: 'relative',
    },
    image: {
      // resizeMode is set inline ('stretch' with an aspect-preserved box).
    },
    fallback: {
      rowGap: calcSize(resolved, 0.5),
    },
    fallbackText: {
      color: fontDesc,
      fontSize: calcFontSize(resolved, 1),
    },
  });

  return {
    fragments,
    idleFill: 'transparent',
    idleStroke: 'transparent',
    idleStrokeWidth: 0,
    selectedFill,
    selectedStroke,
    selectedStrokeWidth: 1,
  };
}
