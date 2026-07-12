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

function sanitizeAttributes(
  element: Element,
  diagnostics: SvgSanitizeDiagnostic[]
): void {
  for (const name of Object.keys(element.attribs)) {
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
      const value = element.attribs[name] ?? '';
      if (!value.trim().startsWith('#')) {
        delete element.attribs[name];
        diagnostics.push({
          code: 'icon-svg-sanitized',
          detail: `dropped non-local "${name}" on <${element.tagName}> (only "#fragment" references are allowed)`,
        });
      }
    }
  }
}

/**
 * Depth-first in-place filter: keeps allowlisted elements (attributes
 * sanitized) and text nodes; drops every other node kind (disallowed
 * elements with a diagnostic; comments/CDATA/processing instructions
 * silently — they carry no rendering meaning for SvgXml).
 */
function sanitizeChildren(
  children: ChildNode[],
  diagnostics: SvgSanitizeDiagnostic[]
): ChildNode[] {
  const kept: ChildNode[] = [];
  for (const child of children) {
    if (isTag(child)) {
      if (!ALLOWED_ELEMENTS.has(child.tagName.toLowerCase())) {
        diagnostics.push({
          code: 'icon-svg-sanitized',
          detail: `dropped disallowed element <${child.tagName}>`,
        });
        continue;
      }
      sanitizeAttributes(child, diagnostics);
      child.children = sanitizeChildren(child.children, diagnostics);
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

export function sanitizeIconSvg(raw: string): SanitizeSvgResult {
  const cached = cache.get(raw);
  if (cached) return cached;

  const diagnostics: SvgSanitizeDiagnostic[] = [];
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
    sanitizeAttributes(root, diagnostics);
    root.children = sanitizeChildren(root.children, diagnostics);
    xml = render(root, { xmlMode: true });
  }

  const result: SanitizeSvgResult = { xml, diagnostics };
  if (cache.size >= CACHE_CAP) cache.clear();
  cache.set(raw, result);
  return result;
}
