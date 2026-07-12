/**
 * Shadow mapper tests (design: docs/design/0.7-theme-rn.md, "Shadow
 * mapping (shadows.ts)"; test plan #3). RN 0.86 New Architecture supports
 * `boxShadow` style ARRAYS with per-layer inset+spread — direct 1:1
 * mapping, no layer dropping/inset emulation on iOS or Android >= 29.
 * Android has a documented three-tier fallback (>=29 full, ==28
 * outset-only+diagnostic, <28 elevation heuristic).
 */
import {
  toBoxShadow,
  composeShadowLayers,
  mapShadowForPlatform,
} from '../shadows';
import { resolveTheme } from '../../theme-core/resolve';
import * as themesFacade from '../../core/themes';
import { THEME_MANIFEST } from '../../core/themes';
import type { ITheme } from '../../core/facade';
import type { ShadowLayer } from '../../theme-core/parse';

function getManifestTheme(name: string): ITheme {
  const theme = (themesFacade as unknown as Record<string, ITheme | undefined>)[
    name
  ];
  if (!theme) throw new Error(`manifest name ${name} did not resolve`);
  return theme;
}

const outsetLayer: ShadowLayer = {
  inset: false,
  offsetX: 0,
  offsetY: 2,
  blurRadius: 4,
  spreadRadius: 0,
  color: { r: 0, g: 0, b: 0, a: 0.15 },
};

const insetLayer: ShadowLayer = {
  inset: true,
  offsetX: 0,
  offsetY: 1,
  blurRadius: 2,
  spreadRadius: 0,
  color: { r: 0, g: 0, b: 0, a: 0.1 },
};

describe('toBoxShadow — direct 1:1 mapping', () => {
  it('maps a single outset layer verbatim', () => {
    const result = toBoxShadow([outsetLayer]);
    expect(result).toEqual([
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 4,
        spreadDistance: 0,
        color: 'rgba(0, 0, 0, 0.15)',
        inset: false,
      },
    ]);
  });

  it('maps a multi-layer shadow preserving order and inset flags', () => {
    const result = toBoxShadow([outsetLayer, insetLayer]);
    expect(result).toHaveLength(2);
    expect(result[0]?.inset).toBe(false);
    expect(result[1]?.inset).toBe(true);
    expect(result[1]?.color).toBe('rgba(0, 0, 0, 0.1)');
  });

  it('empty layer array maps to empty boxShadow array', () => {
    expect(toBoxShadow([])).toEqual([]);
  });
});

describe('composeShadowLayers — focus-ring composition', () => {
  it('appends the ring layer to the variant shadow array (mirrors web $shadow-*-reset + ring)', () => {
    const ring: ShadowLayer = {
      inset: false,
      offsetX: 0,
      offsetY: 0,
      blurRadius: 0,
      spreadRadius: 2,
      color: { r: 25, g: 179, b: 148, a: 1 },
    };
    const composed = composeShadowLayers([outsetLayer], [ring]);
    expect(composed).toEqual([outsetLayer, ring]);
  });

  it('composes more than two groups in argument order', () => {
    const composed = composeShadowLayers([outsetLayer], [insetLayer], []);
    expect(composed).toEqual([outsetLayer, insetLayer]);
  });
});

describe('mapShadowForPlatform — iOS (no tiering)', () => {
  it('full fidelity regardless of "version" — inset preserved', () => {
    const result = mapShadowForPlatform([outsetLayer, insetLayer], {
      os: 'ios',
    });
    expect(result.boxShadow).toHaveLength(2);
    expect(result.boxShadow?.[1]?.inset).toBe(true);
    expect(result.elevation).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });
});

describe('mapShadowForPlatform — Android tiering', () => {
  it('API >= 29: full fidelity, inset documented from Android 10 (API 29)', () => {
    const result = mapShadowForPlatform([outsetLayer, insetLayer], {
      os: 'android',
      apiLevel: 29,
    });
    expect(result.boxShadow).toHaveLength(2);
    expect(result.boxShadow?.[1]?.inset).toBe(true);
    expect(result.elevation).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });

  it('API 34 (well above 29): still full fidelity', () => {
    const result = mapShadowForPlatform([outsetLayer, insetLayer], {
      os: 'android',
      apiLevel: 34,
    });
    expect(result.boxShadow).toHaveLength(2);
    expect(result.diagnostics).toEqual([]);
  });

  it('API 28: outset-only — inset layers dropped, one diagnostic emitted', () => {
    const result = mapShadowForPlatform([outsetLayer, insetLayer], {
      os: 'android',
      apiLevel: 28,
    });
    expect(result.boxShadow).toHaveLength(1);
    expect(result.boxShadow?.[0]?.inset).toBe(false);
    expect(result.elevation).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe(
      'theme-rn/android-shadow-inset-dropped'
    );
  });

  it('API 28 with no inset layers at all: zero diagnostics (nothing was dropped)', () => {
    const result = mapShadowForPlatform([outsetLayer], {
      os: 'android',
      apiLevel: 28,
    });
    expect(result.boxShadow).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  it('API < 28: elevation heuristic fallback — no boxShadow, one diagnostic, elevation bounded and non-negative', () => {
    const result = mapShadowForPlatform([outsetLayer, insetLayer], {
      os: 'android',
      apiLevel: 21,
    });
    expect(result.boxShadow).toBeUndefined();
    expect(result.elevation).toBeGreaterThanOrEqual(1);
    expect(result.elevation).toBeLessThanOrEqual(24);
    expect(Number.isFinite(result.elevation)).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe(
      'theme-rn/android-shadow-elevation-fallback'
    );
  });

  it('API < 28 with an empty layer list: elevation 0, no diagnostic (nothing to fall back from)', () => {
    const result = mapShadowForPlatform([], { os: 'android', apiLevel: 16 });
    expect(result.boxShadow).toBeUndefined();
    expect(result.elevation).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });
});

describe('validity across all 40 themes x 6 shadow tokens x both platform tiers', () => {
  const shadowKeys = [
    'small',
    'smallReset',
    'medium',
    'large',
    'inner',
    'innerReset',
  ] as const;
  const platforms: Array<{ os: 'ios' | 'android'; apiLevel?: number }> = [
    { os: 'ios' },
    { os: 'android', apiLevel: 34 },
    { os: 'android', apiLevel: 28 },
    { os: 'android', apiLevel: 21 },
  ];

  it.each(THEME_MANIFEST)(
    '%s: every shadow token x platform tier maps without NaN/negative/unparsed values',
    (name) => {
      const resolved = resolveTheme(getManifestTheme(name));
      for (const key of shadowKeys) {
        const layers = resolved.tokens.shadows[key];
        for (const platform of platforms) {
          const result = mapShadowForPlatform(layers, platform);
          if (result.boxShadow) {
            for (const layer of result.boxShadow) {
              expect(Number.isFinite(layer.offsetX as number)).toBe(true);
              expect(Number.isFinite(layer.offsetY as number)).toBe(true);
              expect(Number.isFinite(layer.blurRadius as number)).toBe(true);
              expect(layer.blurRadius as number).toBeGreaterThanOrEqual(0);
              expect(
                Number.isFinite(layer.spreadDistance as number)
              ).toBe(true);
              expect(typeof layer.color).toBe('string');
              expect(layer.color).toMatch(/^rgba\(/);
            }
          }
          if (result.elevation !== undefined) {
            expect(Number.isFinite(result.elevation)).toBe(true);
            expect(result.elevation).toBeGreaterThanOrEqual(0);
            expect(result.elevation).toBeLessThanOrEqual(24);
          }
        }
      }
    }
  );
});

describe('curated shadow snapshots — DefaultLight/SharpDark/ContrastLight/LayeredDark/ThreeDimensionalLight', () => {
  it.each([
    'DefaultLight',
    'SharpDark',
    'ContrastLight',
    'LayeredDark',
    'ThreeDimensionalLight',
  ])('%s: small shadow maps stably (iOS)', (name) => {
    const resolved = resolveTheme(getManifestTheme(name));
    expect(
      mapShadowForPlatform(resolved.tokens.shadows.small, { os: 'ios' })
        .boxShadow
    ).toMatchSnapshot();
  });
});
