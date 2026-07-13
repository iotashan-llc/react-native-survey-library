/**
 * SVG-only allowlist sanitizer for CONSUMER-registered icon markup
 * (design: docs/design/1.5-icon-actionbutton.md, "Sanitization decision").
 *
 * Trust framing (0.9 sink matrix): bundled `survey-core/icons/iconsV2`
 * strings are trusted-library-generated and NEVER pass through here —
 * icon-resolution feeds them to `SvgXml` byte-identical. Everything a
 * host registers through `SvgRegistry` is host-CODE input, but
 * "trusted consumer" in practice means "pasted from an icon pack", and
 * react-native-svg's `SvgXml` is a real XML-parse + native-render sink
 * whose `<Image href>`/`<Use href>` support would perform network fetches
 * OUTSIDE the A11 URI policy — an auto-fetch sink smuggled through a
 * render sink. So consumer strings get one cheap structural pass:
 *
 * - single `<svg>` root or the whole string is rejected
 *   (`icon-svg-invalid`, `xml: null`);
 * - element allowlist (drawing primitives + gradient/clip/mask/pattern
 *   plumbing + title/desc/text); everything else — notably `image`,
 *   `foreignObject`, `script`, the `animate*` family — is dropped with an
 *   `icon-svg-sanitized` diagnostic;
 * - `on*` attributes are dropped; `href`/`xlink:href` survive only as
 *   LOCAL fragment references (`#id`), keeping `<use>` of local `<defs>`
 *   while closing external fetches;
 * - everything else passes through untouched (`d`, `fill`, `stroke`,
 *   `viewBox`, `transform`, `style`, …) — react-native-svg ignores what
 *   it doesn't support. CSS `var()` inside `style` won't resolve on RN;
 *   that is a fidelity note, not a security concern.
 *
 * Parsed once with `htmlparser2` (xmlMode — same family as
 * `sanitize-html.ts`'s pipeline), serialized with `dom-serializer`
 * (xmlMode), memoized per raw string (identical result object — icons are
 * small and few; a hard cap guards pathological registries).
 */
import { parseDocument } from 'htmlparser2';
import { Element, isTag, isText, type ChildNode } from 'domhandler';
import render from 'dom-serializer';

export type SvgSanitizeDiagnosticCode =
  'icon-svg-invalid' | 'icon-svg-sanitized';

export interface SvgSanitizeDiagnostic {
  code: SvgSanitizeDiagnosticCode;
  detail: string;
}

export interface SanitizeSvgResult {
  /** Render-ready `<svg …>` markup, or `null` when the input is rejected outright. */
  xml: string | null;
  diagnostics: readonly SvgSanitizeDiagnostic[];
}

/** Lowercased tag names allowed through (camelCase source casing is preserved in output). */
const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'pattern',
  'symbol',
  'use',
  'title',
  'desc',
  'text',
  'tspan',
]);

function isHrefAttribute(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'href' || lower === 'xlink:href' || lower.endsWith(':href');
}

/**
 * Exact local-fragment grammar (codex review, notes): `#` followed by an
 * XML-Name-shaped id — not merely "starts with #", which would admit a
 * bare `#`, embedded whitespace, or other junk the downstream parser
 * might interpret creatively.
 */
const LOCAL_FRAGMENT_PATTERN = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/;

/**
 * Conservative CSS-declaration-list grammar for `style` attributes
 * (codex review minor 4): react-native-svg's own parser THROWS on a
 * declaration without a `:`; every `;`-separated non-empty declaration
 * must be `property: value` with a non-empty property. A style attribute
 * failing this is dropped whole (fail-closed) with a diagnostic.
 */
function isValidStyleAttribute(value: string): boolean {
  for (const declaration of value.split(';')) {
    const trimmed = declaration.trim();
    if (trimmed.length === 0) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex <= 0) return false;
  }
  return true;
}

/**
 * Resource bounds (codex review major 1 — mirrors the 0.9 HTML
 * sanitizer's fail-closed posture): any exceeded bound rejects the WHOLE
 * input (`icon-svg-invalid`), never a partially-processed tree. Sized
 * for icons — generous multiples of every bundled icon, tiny fractions
 * of a DoS payload. The depth cap doubles as the recursion-safety bound:
 * both the filter walk and dom-serializer recurse per level, so depth ≤
 * 32 keeps the stack flat where a 5000-deep `<g>` tree previously
 * produced an uncaught RangeError.
 */
export const SVG_RESOURCE_BOUNDS = Object.freeze({
  /** UTF-16 code units, checked BEFORE parsing. */
  maxSourceLength: 64 * 1024,
  maxElementCount: 512,
  maxDepth: 32,
  maxAttributesPerElement: 64,
  maxAttributeValueLength: 32 * 1024,
});

/** Internal control-flow sentinel: a bound was exceeded — reject the whole input. */
class BoundExceededError extends Error {}

interface WalkBudget {
  elementsSeen: number;
}

function sanitizeAttributes(
  element: Element,
  diagnostics: SvgSanitizeDiagnostic[]
): void {
  const names = Object.keys(element.attribs);
  if (names.length > SVG_RESOURCE_BOUNDS.maxAttributesPerElement) {
    throw new BoundExceededError(
      `attributes-per-element exceeded on <${element.tagName}> (${names.length} > ${SVG_RESOURCE_BOUNDS.maxAttributesPerElement})`
    );
  }
  for (const name of names) {
    const value = element.attribs[name] ?? '';
    if (value.length > SVG_RESOURCE_BOUNDS.maxAttributeValueLength) {
      throw new BoundExceededError(
        `attribute-value length exceeded for "${name}" on <${element.tagName}>`
      );
    }
    const lower = name.toLowerCase();
    if (lower.startsWith('on')) {
      delete element.attribs[name];
      diagnostics.push({
        code: 'icon-svg-sanitized',
        detail: `dropped event-handler attribute "${name}" on <${element.tagName}>`,
      });
      continue;
    }
    if (isHrefAttribute(name)) {
      if (!LOCAL_FRAGMENT_PATTERN.test(value.trim())) {
        delete element.attribs[name];
        diagnostics.push({
          code: 'icon-svg-sanitized',
          detail: `dropped non-local "${name}" on <${element.tagName}> (only exact "#fragment" references are allowed)`,
        });
      }
      continue;
    }
    if (lower === 'style' && !isValidStyleAttribute(value)) {
      delete element.attribs[name];
      diagnostics.push({
        code: 'icon-svg-sanitized',
        detail: `dropped malformed style attribute on <${element.tagName}> (each declaration must be "property: value")`,
      });
    }
  }
}

/**
 * Depth-first in-place filter: keeps allowlisted elements (attributes
 * sanitized) and text nodes; drops every other node kind (disallowed
 * elements with a diagnostic; comments/CDATA/processing instructions
 * silently — they carry no rendering meaning for SvgXml). Depth and
 * element-count budgets are enforced DURING the walk (throwing the
 * internal bound sentinel) so a hostile tree can neither exhaust the
 * stack nor burn unbounded CPU before rejection.
 */
function sanitizeChildren(
  children: ChildNode[],
  diagnostics: SvgSanitizeDiagnostic[],
  budget: WalkBudget,
  depth: number
): ChildNode[] {
  if (depth > SVG_RESOURCE_BOUNDS.maxDepth) {
    throw new BoundExceededError(
      `nesting depth exceeded (> ${SVG_RESOURCE_BOUNDS.maxDepth})`
    );
  }
  const kept: ChildNode[] = [];
  for (const child of children) {
    if (isTag(child)) {
      budget.elementsSeen += 1;
      if (budget.elementsSeen > SVG_RESOURCE_BOUNDS.maxElementCount) {
        throw new BoundExceededError(
          `element count exceeded (> ${SVG_RESOURCE_BOUNDS.maxElementCount})`
        );
      }
      if (!ALLOWED_ELEMENTS.has(child.tagName.toLowerCase())) {
        diagnostics.push({
          code: 'icon-svg-sanitized',
          detail: `dropped disallowed element <${child.tagName}>`,
        });
        continue;
      }
      sanitizeAttributes(child, diagnostics);
      child.children = sanitizeChildren(
        child.children,
        diagnostics,
        budget,
        depth + 1
      );
      kept.push(child);
      continue;
    }
    if (isText(child)) {
      kept.push(child);
    }
  }
  return kept;
}

const CACHE_CAP = 512;
const cache = new Map<string, SanitizeSvgResult>();

function sanitizeIconSvgUncached(raw: string): SanitizeSvgResult {
  const diagnostics: SvgSanitizeDiagnostic[] = [];
  if (raw.length > SVG_RESOURCE_BOUNDS.maxSourceLength) {
    diagnostics.push({
      code: 'icon-svg-invalid',
      detail: `source length exceeded (${raw.length} > ${SVG_RESOURCE_BOUNDS.maxSourceLength})`,
    });
    return { xml: null, diagnostics };
  }

  const document = parseDocument(raw, { xmlMode: true });
  const elementRoots = document.children.filter(isTag);
  const root = elementRoots[0];

  let xml: string | null = null;
  if (
    elementRoots.length !== 1 ||
    !root ||
    root.tagName.toLowerCase() !== 'svg'
  ) {
    diagnostics.push({
      code: 'icon-svg-invalid',
      detail:
        elementRoots.length === 0
          ? 'no element root found (not SVG markup)'
          : `root must be a single <svg> element, got <${elementRoots
              .map((el) => el.tagName)
              .join('>, <')}>`,
    });
  } else {
    const budget: WalkBudget = { elementsSeen: 1 };
    sanitizeAttributes(root, diagnostics);
    root.children = sanitizeChildren(root.children, diagnostics, budget, 1);
    xml = render(root, { xmlMode: true });
  }
  return { xml, diagnostics };
}

/**
 * NEVER throws (RNIcon's never-throw contract, codex review major 1): a
 * bound violation or any unexpected parse/filter/serialize failure
 * returns `xml: null` with an `icon-svg-invalid` diagnostic instead of
 * propagating.
 */
export function sanitizeIconSvg(raw: string): SanitizeSvgResult {
  const cached = cache.get(raw);
  if (cached) return cached;

  let result: SanitizeSvgResult;
  try {
    result = sanitizeIconSvgUncached(raw);
  } catch (error) {
    result = {
      xml: null,
      diagnostics: [
        {
          code: 'icon-svg-invalid',
          detail:
            error instanceof BoundExceededError
              ? `resource bound exceeded: ${error.message}`
              : `sanitizer failure: ${String(
                  error instanceof Error ? error.message : error
                )}`,
        },
      ],
    };
  }

  if (cache.size >= CACHE_CAP) cache.clear();
  cache.set(raw, result);
  return result;
}
