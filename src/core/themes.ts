/**
 * The themes-facade (design: docs/design/0.6-theme-core.md, "Module
 * layout" — `themes-facade -> src/core/themes.ts`). The ONLY module in
 * this library allowed to import the `survey-core/themes` subpath — every
 * other module (theme-core included) reaches the 40 preset objects only
 * through `THEME_MANIFEST`/the named re-exports here. ESLint enforces
 * this (`eslint.config.mjs`'s survey-core restriction `ignores` list
 * includes this file alongside `facade.ts`).
 *
 * `import './shim'` first, same ordering contract as `facade.ts` — this
 * subpath is a separate module graph from the main `survey-core` entry
 * and can be evaluated on its own (e.g. by a consumer who only wants
 * themes, not the model/renderer), so it needs its own shim application
 * rather than relying on `facade.ts` having already run.
 *
 * `THEME_MANIFEST` is a named list of exactly the 40 real preset export
 * names, deliberately excluding `__surveyjs_internal_themes_hash` (an
 * internal sentinel survey-core's `themes/index` module also exports —
 * see docs/design/0.6-theme-core.md, "Verified upstream facts").
 */
import './shim';

// eslint-disable-next-line no-restricted-imports -- themes-facade exception, see eslint.config.mjs
export * from 'survey-core/themes';

export const THEME_MANIFEST: readonly string[] = [
  'DefaultLight',
  'DefaultDark',
  'DefaultLightPanelless',
  'DefaultDarkPanelless',
  'SharpLight',
  'SharpDark',
  'SharpLightPanelless',
  'SharpDarkPanelless',
  'BorderlessLight',
  'BorderlessDark',
  'BorderlessLightPanelless',
  'BorderlessDarkPanelless',
  'FlatLight',
  'FlatDark',
  'FlatLightPanelless',
  'FlatDarkPanelless',
  'PlainLight',
  'PlainDark',
  'PlainLightPanelless',
  'PlainDarkPanelless',
  'DoubleBorderLight',
  'DoubleBorderDark',
  'DoubleBorderLightPanelless',
  'DoubleBorderDarkPanelless',
  'LayeredLight',
  'LayeredDark',
  'LayeredLightPanelless',
  'LayeredDarkPanelless',
  'SolidLight',
  'SolidDark',
  'SolidLightPanelless',
  'SolidDarkPanelless',
  'ThreeDimensionalLight',
  'ThreeDimensionalDark',
  'ThreeDimensionalLightPanelless',
  'ThreeDimensionalDarkPanelless',
  'ContrastLight',
  'ContrastDark',
  'ContrastLightPanelless',
  'ContrastDarkPanelless',
];

if (THEME_MANIFEST.length !== 40) {
  throw new Error(
    `THEME_MANIFEST must have exactly 40 entries, has ${THEME_MANIFEST.length}`
  );
}
