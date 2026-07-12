/**
 * Icon-name → render-ready SVG XML resolution (design:
 * docs/design/1.5-icon-actionbutton.md, "Icon source strategy"). Pure
 * lookup + trust-tier policy, exported separately from `RNIcon` so the
 * contract is directly unit-testable and the component stays presentation
 * + registry-liveness only.
 *
 * Name mapping is core's OWN `getIconNameFromProxy` — `settings.
 * customIcons` indirection + `renamedIcons` legacy/size-suffix mapping
 * (`icon-clear_16x16` → `clear-16x16`, `icon-chevron` →
 * `chevrondown-24x24`) ride upstream logic, never duplicated here
 * (invariant 6 spirit).
 *
 * Raw-source lookup is consumer-first (matches the web renderer's
 * last-write-wins registry semantics):
 *   1. `SvgThemeSets` — raw strings stored by `SvgRegistry.registerIcon`.
 *      Tried under the canonical key AND the `icon-`-prefixed original
 *      (upstream's `registerIcon` stores the UNPROCESSED id here while
 *      `registerIconFromSvg` normalizes it — verified v2.5.33).
 *   2. `SvgRegistry.icons` — `<symbol id="icon-x" …>`-wrapped strings;
 *      losslessly unwrapped back to `<svg …>` (the exact inverse of
 *      upstream `registerIconFromSvg`'s rewrap).
 *   3. Bundled V2 map (`src/core/icons.ts`).
 *
 * Trust tiers (0.9 content-origin framing): consumer-registered strings
 * (paths 1-2) go through `sanitizeIconSvg` — an invalid consumer string
 * falls through to the bundled set rather than shadowing it (upstream's
 * `registerIconFromSvg` likewise returns `false` and registers nothing
 * for malformed input). Bundled strings pass through byte-identical.
 * A full miss returns `xml: null` + a one-shot `unknown-icon` diagnostic.
 */
import {
  getIconNameFromProxy,
  SvgRegistry,
  SvgThemeSets,
} from '../core/facade';
import { bundledIconsV2 } from '../core/icons';
import { sanitizeIconSvg } from '../security/sanitize-svg';
import { reportDiagnostic } from '../diagnostics';

export interface ResolvedIconXml {
  /** Canonical unprefixed registry key the name resolved to. */
  key: string;
  /** Render-ready `<svg …>` markup, or `null` on a miss. */
  xml: string | null;
}

const ICON_PREFIX = 'icon-';

function stripIconPrefix(name: string): string {
  return name.startsWith(ICON_PREFIX)
    ? name.substring(ICON_PREFIX.length)
    : name;
}

/**
 * Inverse of upstream `SvgIconRegistry.registerIconFromSvg`'s rewrap
 * (`<svg {attrs}>{content}</svg>` → `<symbol id="icon-x" {attrs}>{content}
 * </symbol>`): rewrites the wrapper tags back. The retained `id`
 * attribute is inert for SvgXml. Returns null when the stored string is
 * not symbol-shaped (e.g. a consumer called `registerIconFromSymbol`
 * with arbitrary markup) — the caller then hands the string to the
 * sanitizer as-is, whose non-svg-root rejection contains it.
 */
function unwrapRegistrySymbol(stored: string): string | null {
  const trimmed = stored.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('<symbol') || !lower.endsWith('</symbol>')) {
    return null;
  }
  return `<svg${trimmed.substring(
    '<symbol'.length,
    trimmed.length - '</symbol>'.length
  )}</svg>`;
}

/** Consumer-registered raw markup for a canonical key, or null. */
function lookupConsumerRaw(key: string): string | null {
  for (const setName of ['v2', 'v1']) {
    const set = SvgThemeSets[setName];
    const raw = set?.[key] ?? set?.[ICON_PREFIX + key];
    if (raw) return raw;
  }
  const stored = SvgRegistry.icons[key];
  if (stored) return unwrapRegistrySymbol(stored) ?? stored;
  return null;
}

/** One-shot dedupe keys (module lifetime, mirroring the diagnostics module's once-helpers). */
const unknownIconReported = new Set<string>();
const sanitizeDiagnosticsReported = new Set<string>();

export function resolveIconXml(iconName: string): ResolvedIconXml {
  const canonical = getIconNameFromProxy(iconName);
  const key = stripIconPrefix(canonical);

  const consumerRaw = lookupConsumerRaw(key);
  if (consumerRaw !== null) {
    const result = sanitizeIconSvg(consumerRaw);
    if (!sanitizeDiagnosticsReported.has(consumerRaw)) {
      sanitizeDiagnosticsReported.add(consumerRaw);
      for (const diagnostic of result.diagnostics) {
        reportDiagnostic({
          code: 'icon-svg-diagnostic',
          sanitizeCode: diagnostic.code,
          iconKey: key,
          detail: diagnostic.detail,
        });
      }
    }
    if (result.xml !== null) {
      return { key, xml: result.xml };
    }
    // Invalid consumer string: fall through to the bundled set (see
    // module doc) rather than masking a built-in icon behind a broken
    // override.
  }

  const bundled = bundledIconsV2[key];
  if (bundled !== undefined) {
    return { key, xml: bundled };
  }

  if (!unknownIconReported.has(key)) {
    unknownIconReported.add(key);
    reportDiagnostic({ code: 'unknown-icon', iconName, resolvedKey: key });
  }
  return { key, xml: null };
}
