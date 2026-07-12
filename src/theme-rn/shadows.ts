/**
 * Shadow mapping (design: docs/design/0.7-theme-rn.md, "Shadow mapping
 * (shadows.ts)"). RN 0.86 New Architecture supports `boxShadow` style
 * ARRAYS with per-layer inset+spread — shadows map DIRECTLY from 0.6's
 * `ShadowLayer[]`, no layer dropping or inset emulation, on iOS and on
 * Android API >= 29. Android gets a documented three-tier runtime
 * fallback (this module's only platform-conditional logic):
 *
 *  - API >= 29: full fidelity (inset supported — documented from
 *    Android 10 / API 29).
 *  - API == 28: outset-only — inset layers are dropped, one diagnostic
 *    is emitted (only when a layer was actually dropped).
 *  - API < 28: elevation heuristic — a single `elevation` number
 *    replaces the shadow entirely (documented last-resort fallback; RN's
 *    `elevation` style prop has no per-layer/inset concept), one
 *    diagnostic is emitted (only when there was something to fall back
 *    from).
 *
 * The border convention (design, "Border mapping (narrowed)") owns
 * FOCUS/ERROR rings on interactive surfaces separately — this module has
 * no border concern; recipes compose token shadows verbatim alongside
 * semantic border slots.
 */
import type { BoxShadowValue } from 'react-native';
import type { ParsedColor, ShadowLayer } from '../theme-core/parse';

export interface ShadowDiagnostic {
  code:
    | 'theme-rn/android-shadow-inset-dropped'
    | 'theme-rn/android-shadow-elevation-fallback';
  message: string;
}

export interface PlatformShadowSpec {
  os: 'ios' | 'android';
  /** Android API level (`Platform.Version`). Ignored on iOS. */
  apiLevel?: number;
}

export interface ShadowMapResult {
  /** Present on iOS and Android API >= 28 (undefined on the elevation-fallback tier). */
  boxShadow: BoxShadowValue[] | undefined;
  /** Present only on the Android < 28 elevation-fallback tier. */
  elevation: number | undefined;
  diagnostics: ShadowDiagnostic[];
}

function toCssColor(c: ParsedColor): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

/** Direct 1:1 mapping — offset, blur, spread, color, inset. No layer dropping. */
export function toBoxShadow(layers: ShadowLayer[]): BoxShadowValue[] {
  return layers.map((layer) => ({
    offsetX: layer.offsetX,
    offsetY: layer.offsetY,
    blurRadius: layer.blurRadius,
    spreadDistance: layer.spreadRadius,
    color: toCssColor(layer.color),
    inset: layer.inset,
  }));
}

/**
 * Focus-ring composition (design: "append the ring layer to the variant's
 * shadow array (mirrors web `$shadow-*-reset + ring` composition)"). Plain
 * concatenation in argument order — kept as a named helper so callers
 * document intent and tests can exercise the contract independently of
 * array-spread call sites.
 */
export function composeShadowLayers(
  ...groups: ShadowLayer[][]
): ShadowLayer[] {
  return groups.flat();
}

/**
 * Android API < 28 last-resort heuristic: RN's `elevation` prop has no
 * per-layer/inset/color concept, so this collapses the layer with the
 * largest blur radius (the dominant visual contributor) into a single
 * bounded integer. Not exact — documented as a lossy fallback, not a
 * faithful shadow reproduction.
 */
function estimateElevation(layers: ShadowLayer[]): number {
  if (layers.length === 0) return 0;
  const primary = layers.reduce((max, layer) =>
    layer.blurRadius > max.blurRadius ? layer : max
  );
  const raw = Math.round((Math.abs(primary.offsetY) + primary.blurRadius / 2) / 2);
  return Math.min(24, Math.max(1, raw));
}

function mapForAndroid(
  layers: ShadowLayer[],
  apiLevel: number
): ShadowMapResult {
  if (apiLevel >= 29) {
    return { boxShadow: toBoxShadow(layers), elevation: undefined, diagnostics: [] };
  }
  if (apiLevel === 28) {
    const outsetLayers = layers.filter((layer) => !layer.inset);
    const droppedCount = layers.length - outsetLayers.length;
    const diagnostics: ShadowDiagnostic[] =
      droppedCount > 0
        ? [
            {
              code: 'theme-rn/android-shadow-inset-dropped',
              message: `Android API 28 does not support inset boxShadow layers; dropped ${droppedCount} inset layer(s).`,
            },
          ]
        : [];
    return { boxShadow: toBoxShadow(outsetLayers), elevation: undefined, diagnostics };
  }
  const diagnostics: ShadowDiagnostic[] =
    layers.length > 0
      ? [
          {
            code: 'theme-rn/android-shadow-elevation-fallback',
            message: `Android API ${apiLevel} does not support boxShadow; approximated with a single elevation value (lossy fallback).`,
          },
        ]
      : [];
  return {
    boxShadow: undefined,
    elevation: estimateElevation(layers),
    diagnostics,
  };
}

/** Main entry recipes call: platform-tiered shadow mapping. */
export function mapShadowForPlatform(
  layers: ShadowLayer[],
  platform: PlatformShadowSpec
): ShadowMapResult {
  if (platform.os === 'ios') {
    return { boxShadow: toBoxShadow(layers), elevation: undefined, diagnostics: [] };
  }
  return mapForAndroid(layers, platform.apiLevel ?? 0);
}
