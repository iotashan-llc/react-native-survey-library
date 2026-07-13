/**
 * The icons-facade (design: docs/design/1.5-icon-actionbutton.md, "Icon
 * source strategy"). The ONLY module in this library allowed to import
 * the `survey-core/icons/*` subpaths — everything else reaches the
 * bundled set through `bundledIconsV2` here (same seam pattern as
 * `src/core/themes.ts`, enforced by the same ESLint restriction with an
 * inline exception).
 *
 * `import './shim'` first, same ordering contract as `facade.ts`/
 * `themes.ts` — the icons subpath is its own module graph and must not be
 * the first survey-core code to evaluate without the env shim applied.
 *
 * V2 ONLY, mirroring the web 2.x renderer (survey-react-ui's
 * `reactSurvey.tsx` registers exactly `iconsV2`). The 61 strings are raw
 * `<svg …>` markup (svgo-processed at upstream build) keyed by canonical
 * size-suffixed names (`chevrondown-24x24`, …) — trusted-library-generated
 * content per the 0.9 content-origin framing, consumed byte-identically
 * by icon-resolution's bundled tier. Consumers wanting the V1 set can
 * `SvgRegistry.registerIcons(iconsV1.icons)` themselves; resolution picks
 * those up through the consumer registry paths (sanitized tier).
 */
import './shim';

// eslint-disable-next-line no-restricted-imports -- icons-facade exception, see docs/design/1.5-icon-actionbutton.md
import { icons } from 'survey-core/icons/iconsV2';

export const bundledIconsV2: { readonly [key: string]: string } = icons;
