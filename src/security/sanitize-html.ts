/**
 * Sanitizer (design: docs/design/0.9-html-strategy.md, "Sanitizer (A11)").
 *
 * SINGLE-PARSE AST pipeline: the source is parsed exactly ONCE, using the
 * same htmlparser2 configuration `@native-html/transient-render-engine`
 * uses internally (`{ decodeEntities: true, lowerCaseTags: true }` — see
 * `TRenderEngine`'s `htmlParserOptions`), and the result is POSITIVELY
 * reconstructed into a brand-new, private `domhandler` tree: allowlisted
 * nodes/attributes are COPIED into freshly-constructed nodes, everything
 * else is dropped. There is no serialize-then-reparse step and no
 * post-validation mutation window.
 *
 * The returned `dom` is a real `domhandler` `Document` — the `<SanitizedHtml>`
 * adapter hands it to `@native-html/render` via `source={{ dom }}`, which
 * calls `TRenderEngine.buildTTreeFromDoc(document)` directly (confirmed
 * against `node_modules/@native-html/render`'s `SourceLoaderDom` /
 * `useTTree`, and `TRenderEngine.buildTTreeFromDoc`), so the renderer never
 * re-parses our output — no gap for its own parser to disagree with ours.
 */
import {
  DomHandler,
  Document,
  Element,
  Text,
  type AnyNode,
  type ChildNode,
} from 'domhandler';
import { Parser } from 'htmlparser2';
import { validateUri, type UriPolicyConfig } from './uri-policy';

// -----------------------------------------------------------------------
// Tag allowlist / dangerous-subtree set
// -----------------------------------------------------------------------

/** design: "Tag allowlist as before". */
const BASE_ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'p',
  'div',
  'span',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'a',
  'img',
]);

/** `relaxedFormatting` widens FORMATTING ONLY (design: "may widen the
 * FORMATTING allowlist (more tags/attrs)"). All four are inert, no-
 * attribute text-formatting elements — none change the safety pass. */
const RELAXED_EXTRA_TAGS: ReadonlySet<string> = new Set([
  'mark',
  'small',
  'del',
  'ins',
]);

/** design: "Always-dropped-as-subtrees now explicitly includes
 * foreign/raw-text/container elements" — dropped WHOLE, never unwrapped,
 * so raw-text-mode content (script/style/textarea/title-like parsing) is
 * never exposed as ordinary text. */
const DROPPED_SUBTREE_TAGS: ReadonlySet<string> = new Set([
  'svg',
  'math',
  'foreignobject',
  'template',
  'noscript',
  'meta',
  'link',
  'base',
  'style',
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'select',
  'button',
]);

const VOID_TAGS: ReadonlySet<string> = new Set(['br', 'hr']);

/** Per-tag attribute allowlist — deliberately minimal/functional (design
 * calls for "Per-tag attribute allowlist" without enumerating one; no
 * class/id/style/aria-* — there is no CSS class-matching or ARIA-mapping
 * layer in this renderer to make them meaningful, and omitting them is
 * strictly more conservative). `style` is never listed anywhere — it is
 * stripped unconditionally regardless of tag (design: "style stripped
 * unconditionally"). */
const ATTRIBUTE_ALLOWLIST: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(['href']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
};

const BOUNDED_INT_ATTRS: Readonly<
  Record<string, { min: number; max: number }>
> = {
  width: { min: 1, max: 10000 },
  height: { min: 1, max: 10000 },
  rowspan: { min: 1, max: 1000 },
  colspan: { min: 1, max: 1000 },
};

// -----------------------------------------------------------------------
// Resource bounds
// -----------------------------------------------------------------------

export interface ResourceBounds {
  /** Pre-parse cap on the raw source string length (design: "256KB
   * default, configurable down only"). Approximated as UTF-16 code units;
   * a conservative-enough proxy for a DoS guard, not a byte-exact cap. */
  maxSourceLength: number;
  maxNodeCount: number;
  maxDepth: number;
  maxAttributesPerElement: number;
  maxAttributeValueLength: number;
  maxDecodedTextLength: number;
  maxImagesPerDocument: number;
  maxTableRows: number;
  maxTableColumns: number;
}

/** Frozen (review #4): the shared default must never be mutated by a
 * caller who receives it back from `clampBoundsDownOnly`. */
export const DEFAULT_RESOURCE_BOUNDS: ResourceBounds = Object.freeze({
  maxSourceLength: 256 * 1024,
  maxNodeCount: 5000,
  maxDepth: 32,
  maxAttributesPerElement: 16,
  maxAttributeValueLength: 2048,
  maxDecodedTextLength: 512 * 1024,
  maxImagesPerDocument: 32,
  maxTableRows: 200,
  maxTableColumns: 64,
});

/** Clamps caller overrides DOWN only, reading OWN properties and accepting
 * ONLY finite non-negative integers — a `NaN`/`Infinity`/negative/non-
 * integer value is ignored (keeps the default), so it can NEVER silently
 * disable a ceiling via `Math.min(NaN, cap) === NaN` (review #4). */
function clampBoundsDownOnly(
  overrides: Partial<ResourceBounds> | undefined
): ResourceBounds {
  if (!overrides || typeof overrides !== 'object') {
    return DEFAULT_RESOURCE_BOUNDS;
  }
  const result = { ...DEFAULT_RESOURCE_BOUNDS };
  for (const key of Object.keys(
    DEFAULT_RESOURCE_BOUNDS
  ) as (keyof ResourceBounds)[]) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
    const requested = overrides[key];
    if (
      typeof requested === 'number' &&
      Number.isInteger(requested) &&
      requested >= 0
    ) {
      result[key] = Math.min(requested, DEFAULT_RESOURCE_BOUNDS[key]);
    }
  }
  return result;
}

// -----------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------

export interface SanitizeHtmlConfig {
  /** Widens the FORMATTING tag allowlist only; the safety pass (URI
   * policy, dangerous-subtree removal, no inline CSS) always runs
   * regardless (design: "immutable safety pass always runs"). */
  relaxedFormatting?: boolean;
  /** Resource-bound overrides — DOWN only (see `clampBoundsDownOnly`). */
  bounds?: Partial<ResourceBounds>;
  /** Passed to `validateUri(src, 'image', ...)` for `<img>` elements found
   * inside the HTML content. Exported/threaded through (not wired to
   * Survey-level config yet — that is 1.1) so M1/1.6 callers can supply
   * origin allowlists for embedded images. */
  imageUriConfig?: UriPolicyConfig;
}

export type SanitizeDiagnosticCode =
  | 'resource-bound-exceeded'
  | 'duplicate-attribute'
  | 'uri-rejected'
  | 'remote-image-stripped';

export interface SanitizeDiagnostic {
  code: SanitizeDiagnosticCode;
  detail: string;
}

export interface SanitizeHtmlResult {
  /** A real `domhandler` `Document`, ready for `@native-html/render`'s
   * `source={{ dom }}`. */
  dom: Document;
  mode: 'sanitized' | 'plain-text-fallback';
  diagnostics: SanitizeDiagnostic[];
}

// -----------------------------------------------------------------------
// domhandler tree construction (mirrors DomHandler.addNode's linkage so
// the output is indistinguishable from a "real" parse — parent/prev/next
// all correctly wired for domutils/TRE traversal).
// -----------------------------------------------------------------------

function appendChild(parent: Document | Element, child: ChildNode): void {
  const previousSibling = parent.children[parent.children.length - 1] ?? null;
  parent.children.push(child);
  if (previousSibling) {
    child.prev = previousSibling;
    previousSibling.next = child;
  }
  child.parent = parent;
}

// -----------------------------------------------------------------------
// Source parsing — exactly the TRE/htmlparser2 configuration
// (TRenderEngine.htmlParserOptions default: decodeEntities + lowerCaseTags)
// -----------------------------------------------------------------------

interface DuplicateAttributeHit {
  tag: string;
  name: string;
}

/** Resource-bound accounting gathered DURING the single parse (review #3),
 * so every SOURCE token counts — dropped subtrees, comments, and RAW
 * (pre-dedupe) attributes included — closing the "return before counting"
 * and "count the parser-deduplicated attribs object" bypasses. */
interface ParseAccounting {
  nodeCount: number;
  maxDepth: number;
  maxAttributesPerElement: number;
  maxAttributeValueLength: number;
  decodedTextLength: number;
}

function parseSource(html: string): {
  root: Document;
  duplicates: DuplicateAttributeHit[];
  accounting: ParseAccounting;
} {
  const handler = new DomHandler(undefined, {});
  const duplicates: DuplicateAttributeHit[] = [];
  let currentTagName = '';
  let currentAttrNames: Set<string> | null = null;
  let currentAttrCount = 0;
  let depth = 0;

  const accounting: ParseAccounting = {
    nodeCount: 0,
    maxDepth: 0,
    maxAttributesPerElement: 0,
    maxAttributeValueLength: 0,
    decodedTextLength: 0,
  };

  const callbacks = {
    onparserinit: handler.onparserinit?.bind(handler),
    onreset: handler.onreset.bind(handler),
    onend: handler.onend.bind(handler),
    onerror: handler.onerror.bind(handler),
    onclosetag: () => {
      depth = Math.max(0, depth - 1);
      handler.onclosetag();
    },
    onopentagname: (name: string) => {
      currentTagName = name;
      currentAttrNames = new Set();
      currentAttrCount = 0;
      accounting.nodeCount += 1;
    },
    onattribute: (name: string, value?: string) => {
      currentAttrCount += 1;
      if (currentAttrCount > accounting.maxAttributesPerElement) {
        accounting.maxAttributesPerElement = currentAttrCount;
      }
      const valueLength = typeof value === 'string' ? value.length : 0;
      if (valueLength > accounting.maxAttributeValueLength) {
        accounting.maxAttributeValueLength = valueLength;
      }
      if (currentAttrNames) {
        if (currentAttrNames.has(name)) {
          duplicates.push({ tag: currentTagName, name });
        }
        currentAttrNames.add(name);
      }
    },
    onopentag: (name: string, attribs: Record<string, string>) => {
      depth += 1;
      if (depth > accounting.maxDepth) accounting.maxDepth = depth;
      handler.onopentag(name, attribs);
    },
    ontext: (data: string) => {
      accounting.nodeCount += 1;
      accounting.decodedTextLength += data.length;
      handler.ontext(data);
    },
    oncomment: (data: string) => {
      accounting.nodeCount += 1;
      handler.oncomment(data);
    },
    oncommentend: handler.oncommentend.bind(handler),
    oncdatastart: () => {
      accounting.nodeCount += 1;
      handler.oncdatastart();
    },
    oncdataend: handler.oncdataend.bind(handler),
    onprocessinginstruction: (name: string, data: string) => {
      accounting.nodeCount += 1;
      handler.onprocessinginstruction(name, data);
    },
  };

  // The exact TRE default: `{ decodeEntities: true, lowerCaseTags: true }`
  // (node_modules/@native-html/transient-render-engine TRenderEngine
  // constructor's `htmlParserOptions`). Everything else is left at
  // htmlparser2's own defaults, matching TRE exactly.
  new Parser(callbacks, { decodeEntities: true, lowerCaseTags: true }).end(
    html
  );

  return { root: handler.root, duplicates, accounting };
}

/** First bound the parse-time accounting exceeds (review #2/#3), or `null`.
 * Depth/node/attr/value/text are checked here — up front, before any
 * reconstruction — so a tree too deep to safely reconstruct never reaches
 * the reconstruction recursion. */
function firstExceededParseBound(
  accounting: ParseAccounting,
  bounds: ResourceBounds
): string | null {
  if (accounting.nodeCount > bounds.maxNodeCount) {
    return `node count exceeded (${accounting.nodeCount} > ${bounds.maxNodeCount})`;
  }
  if (accounting.maxDepth > bounds.maxDepth) {
    return `depth exceeded (${accounting.maxDepth} > ${bounds.maxDepth})`;
  }
  if (accounting.maxAttributesPerElement > bounds.maxAttributesPerElement) {
    return `attributes-per-element exceeded (${accounting.maxAttributesPerElement} > ${bounds.maxAttributesPerElement})`;
  }
  if (accounting.maxAttributeValueLength > bounds.maxAttributeValueLength) {
    return `attribute value length exceeded (${accounting.maxAttributeValueLength} > ${bounds.maxAttributeValueLength})`;
  }
  if (accounting.decodedTextLength > bounds.maxDecodedTextLength) {
    return `decoded text length exceeded (${accounting.decodedTextLength} > ${bounds.maxDecodedTextLength})`;
  }
  return null;
}

// -----------------------------------------------------------------------
// Bounded-integer / URI attribute validation
// -----------------------------------------------------------------------

function isBoundedInteger(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value)) return false;
  const n = Number(value);
  return n >= min && n <= max;
}

// -----------------------------------------------------------------------
// Reconstruction
// -----------------------------------------------------------------------

class ResourceBoundExceeded extends Error {
  constructor(public readonly detail: string) {
    super(detail);
  }
}

interface TableTracker {
  rows: number;
}

interface ReconstructContext {
  bounds: ResourceBounds;
  allowedTags: ReadonlySet<string>;
  imageUriConfig: UriPolicyConfig | undefined;
  imageCount: number;
  diagnostics: SanitizeDiagnostic[];
  tableStack: TableTracker[];
}

/** Secondary depth guard (defense in depth): the PRIMARY depth bound is
 * enforced at parse time (`firstExceededParseBound`) before reconstruction,
 * so this recursion is already guaranteed within `maxDepth` frames — this
 * throw exists only so a hypothetical accounting miss still fails closed
 * rather than overflowing the stack. */
function guardDepth(ctx: ReconstructContext, depth: number): void {
  if (depth > ctx.bounds.maxDepth) {
    throw new ResourceBoundExceeded(
      `depth exceeded (${depth} > ${ctx.bounds.maxDepth})`
    );
  }
}

function reconstructChildren(
  ctx: ReconstructContext,
  sourceChildren: ChildNode[],
  newParent: Document | Element,
  depth: number
): void {
  for (const child of sourceChildren) {
    reconstructNode(ctx, child, newParent, depth);
  }
}

function reconstructNode(
  ctx: ReconstructContext,
  source: ChildNode,
  newParent: Document | Element,
  depth: number
): void {
  if (source.type === 'text') {
    appendChild(newParent, new Text((source as Text).data));
    return;
  }

  if (
    source.type !== 'tag' &&
    source.type !== 'script' &&
    source.type !== 'style'
  ) {
    // Comments, doctypes/processing instructions, CDATA — always dropped.
    return;
  }

  const element = source as Element;
  const tagName = element.name.toLowerCase();

  if (DROPPED_SUBTREE_TAGS.has(tagName)) {
    // Whole subtree dropped, never unwrapped — do not descend.
    return;
  }

  guardDepth(ctx, depth);

  if (!ctx.allowedTags.has(tagName)) {
    // Unknown-but-benign: unwrap — drop this element node but keep its
    // children. The descent counts as a level (depth + 1) so a deep chain
    // of unwrapped tags is bounded exactly like allowed nesting (review #2).
    reconstructChildren(ctx, element.children, newParent, depth + 1);
    return;
  }

  const attribs = buildAttributes(ctx, tagName, element.attribs);
  const newElement = new Element(tagName, attribs, []);
  appendChild(newParent, newElement);

  if (tagName === 'img') {
    ctx.imageCount += 1;
    if (ctx.imageCount > ctx.bounds.maxImagesPerDocument) {
      throw new ResourceBoundExceeded(
        `image count exceeded (${ctx.imageCount} > ${ctx.bounds.maxImagesPerDocument})`
      );
    }
  }

  if (VOID_TAGS.has(tagName)) {
    return;
  }

  if (tagName === 'table') {
    ctx.tableStack.push({ rows: 0 });
    reconstructChildren(ctx, element.children, newElement, depth + 1);
    ctx.tableStack.pop();
    return;
  }

  if (tagName === 'tr') {
    const table = ctx.tableStack[ctx.tableStack.length - 1];
    if (table) {
      table.rows += 1;
      if (table.rows > ctx.bounds.maxTableRows) {
        throw new ResourceBoundExceeded(
          `table row count exceeded (${table.rows} > ${ctx.bounds.maxTableRows})`
        );
      }
    }
    reconstructChildren(ctx, element.children, newElement, depth + 1);
    // EFFECTIVE column count = actual td/th children AFTER unwrapping (cells
    // that were nested inside unknown tags get flattened up to this <tr>),
    // closing the unwrap bypass (review #3).
    const columns = newElement.children.filter(
      (c) => c.type === 'tag' && (c.name === 'td' || c.name === 'th')
    ).length;
    if (columns > ctx.bounds.maxTableColumns) {
      throw new ResourceBoundExceeded(
        `table column count exceeded (${columns} > ${ctx.bounds.maxTableColumns})`
      );
    }
    return;
  }

  reconstructChildren(ctx, element.children, newElement, depth + 1);
}

function buildAttributes(
  ctx: ReconstructContext,
  tagName: string,
  sourceAttribs: Record<string, string>
): Record<string, string> {
  // Attribute COUNT and VALUE LENGTH bounds are enforced at parse time over
  // the RAW attribute stream (review #3); here `sourceAttribs` is already
  // the parser-deduplicated, in-bounds object.
  const allowedForTag = ATTRIBUTE_ALLOWLIST[tagName];
  const result: Record<string, string> = {};
  if (!allowedForTag) return result;

  for (const name of Object.keys(sourceAttribs)) {
    if (!allowedForTag.has(name)) continue;
    const value = sourceAttribs[name] ?? '';

    const boundedInt = BOUNDED_INT_ATTRS[name];
    if (boundedInt) {
      if (isBoundedInteger(value, boundedInt.min, boundedInt.max)) {
        result[name] = value;
      }
      continue;
    }

    if (name === 'href') {
      const validated = validateUri(value, 'link');
      if (validated.ok) {
        result[name] = validated.canonical;
      } else {
        ctx.diagnostics.push({
          code: 'uri-rejected',
          detail: `a.href rejected: ${validated.reason}`,
        });
      }
      continue;
    }

    if (name === 'src' && tagName === 'img') {
      const validated = validateUri(value, 'image', ctx.imageUriConfig);
      if (validated.ok && validated.scheme === 'data:') {
        // Only inline `data:` images reach the renderer's native Image sink.
        result[name] = validated.canonical;
      } else if (validated.ok) {
        // A remote (https) image passed scheme/origin policy, but the RN
        // Image sink follows HTTP redirects with no per-hop validation —
        // so an allowlisted origin could 30x-redirect to a denied one.
        // Design: "Redirects fail CLOSED … where per-hop validation is
        // impossible on a platform, that fetch context fails closed."
        // Strip the source (fail closed); alt text still renders (review #1).
        ctx.diagnostics.push({
          code: 'remote-image-stripped',
          detail: `img.src remote source stripped (fail-closed redirect policy): ${validated.origin ?? 'remote'}`,
        });
      } else {
        ctx.diagnostics.push({
          code: 'uri-rejected',
          detail: `img.src rejected: ${validated.reason}`,
        });
      }
      continue;
    }

    result[name] = value;
  }

  return result;
}

// -----------------------------------------------------------------------
// Plain-text fallback (never a partial render)
// -----------------------------------------------------------------------

/** Hard cap applied to EVERY plain-text fallback's rendered output (review
 * — bounded sanitizer output). The source-size bound alone does NOT bound
 * rendered text: a raw string just over `maxSourceLength`, or a parsed tree
 * whose text nodes sum to far more than any single parse bound, would
 * otherwise dump arbitrarily large content into one Text node (render
 * stall / memory). Cap the rendered fallback text at `maxDecodedTextLength`
 * — the SAME "total decoded text" ceiling the normal parse path enforces —
 * replacing over-limit content with an ellipsis marker so the FINAL string
 * length never exceeds the cap. */
function capFallbackText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const ELLIPSIS = '…';
  if (maxLength <= ELLIPSIS.length) return text.slice(0, maxLength);
  return text.slice(0, maxLength - ELLIPSIS.length) + ELLIPSIS;
}

/** `<script>`/`<style>` bodies are RAW-TEXT content: stripping only the
 * tags would leave their ENTIRE body as visible text. Remove those
 * subtrees whole first — matching the sanitized path, where both are
 * always dropped as subtrees, so their body never renders as content. */
const RAW_TEXT_SUBTREE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Cheap, parse-free tag strip for when the source itself is too large to
 * safely parse at all (the pre-parse cap). Deliberately does not attempt
 * entity decoding or any HTML-aware processing — the whole point of this
 * path is to avoid spending parse-proportional work on unbounded input.
 * `<script>`/`<style>` bodies are dropped and the result is length-capped
 * so the fallback never renders script/style text or unbounded content. */
function plainTextFromRawSource(raw: string, bounds: ResourceBounds): Document {
  const withoutRawText = raw.replace(RAW_TEXT_SUBTREE_RE, '');
  const stripped = withoutRawText.replace(/<[^>]*>/g, '');
  const doc = new Document([]);
  const text = capFallbackText(stripped, bounds.maxDecodedTextLength);
  if (text.length > 0) {
    appendChild(doc, new Text(text));
  }
  return doc;
}

/** True for nodes whose ENTIRE subtree the sanitizer drops (never
 * unwrapped): `script`/`style` (their own domhandler node types) plus every
 * other always-dropped-as-subtree tag. Their text must never surface in the
 * plain-text fallback either. */
function isDroppedSubtreeNode(node: AnyNode): boolean {
  if (node.type === 'script' || node.type === 'style') return true;
  return (
    node.type === 'tag' && DROPPED_SUBTREE_TAGS.has((node as Element).name)
  );
}

/** Used when a bound is exceeded — the source is already fully parsed in
 * memory, so this extracts its text nodes (no HTML re-injection risk: only
 * `.data` strings are ever concatenated, never re-interpreted as markup).
 * ITERATIVE (explicit stack) so an arbitrarily deep parsed tree — exactly
 * the input that tripped the depth bound — never overflows the JS call
 * stack here (review #2). Dangerous subtrees (`script`/`style`/etc.) are
 * skipped whole, and extraction STOPS once the cap is reached, so the
 * rendered fallback is script/style-free and length-bounded. */
function plainTextFromParsedTree(
  root: Document,
  bounds: ResourceBounds
): Document {
  const cap = bounds.maxDecodedTextLength;
  const parts: string[] = [];
  let total = 0;
  const stack: AnyNode[] = [];
  for (let i = root.children.length - 1; i >= 0; i--) {
    stack.push(root.children[i]!);
  }
  while (stack.length > 0 && total < cap) {
    const node = stack.pop()!;
    if (isDroppedSubtreeNode(node)) continue;
    if (node.type === 'text') {
      const data = (node as Text).data;
      parts.push(data);
      total += data.length;
    } else if ('children' in node) {
      const kids = (node as Document | Element).children;
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
    }
  }
  const doc = new Document([]);
  const text = capFallbackText(parts.join(''), cap);
  if (text.length > 0) {
    appendChild(doc, new Text(text));
  }
  return doc;
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

export function sanitizeHtml(
  raw: string,
  config?: SanitizeHtmlConfig
): SanitizeHtmlResult {
  const bounds = clampBoundsDownOnly(config?.bounds);

  if (typeof raw !== 'string' || raw.length === 0) {
    return { dom: new Document([]), mode: 'sanitized', diagnostics: [] };
  }

  if (raw.length > bounds.maxSourceLength) {
    return {
      dom: plainTextFromRawSource(raw, bounds),
      mode: 'plain-text-fallback',
      diagnostics: [
        {
          code: 'resource-bound-exceeded',
          detail: `source length exceeded (${raw.length} > ${bounds.maxSourceLength})`,
        },
      ],
    };
  }

  const { root: sourceRoot, duplicates, accounting } = parseSource(raw);

  // Parse-time bounds (node count, depth, raw attrs, attr value length,
  // decoded text) are checked BEFORE reconstruction (review #2/#3), so a
  // tree too deep/large to reconstruct falls back to plain text (extracted
  // iteratively from the already-parsed tree) instead of recursing into it.
  const parseBoundDetail = firstExceededParseBound(accounting, bounds);
  if (parseBoundDetail) {
    return {
      dom: plainTextFromParsedTree(sourceRoot, bounds),
      mode: 'plain-text-fallback',
      diagnostics: [
        { code: 'resource-bound-exceeded', detail: parseBoundDetail },
      ],
    };
  }

  const allowedTags = config?.relaxedFormatting
    ? new Set([...BASE_ALLOWED_TAGS, ...RELAXED_EXTRA_TAGS])
    : BASE_ALLOWED_TAGS;

  const ctx: ReconstructContext = {
    bounds,
    allowedTags,
    imageUriConfig: config?.imageUriConfig,
    imageCount: 0,
    diagnostics: [],
    tableStack: [],
  };

  const newRoot = new Document([]);
  try {
    reconstructChildren(ctx, sourceRoot.children, newRoot, 0);
  } catch (error) {
    if (error instanceof ResourceBoundExceeded) {
      return {
        dom: plainTextFromParsedTree(sourceRoot, bounds),
        mode: 'plain-text-fallback',
        diagnostics: [
          { code: 'resource-bound-exceeded', detail: error.detail },
        ],
      };
    }
    throw error;
  }

  for (const dup of duplicates) {
    ctx.diagnostics.push({
      code: 'duplicate-attribute',
      detail: `duplicate attribute "${dup.name}" on <${dup.tag}> — first occurrence wins`,
    });
  }

  return { dom: newRoot, mode: 'sanitized', diagnostics: ctx.diagnostics };
}
