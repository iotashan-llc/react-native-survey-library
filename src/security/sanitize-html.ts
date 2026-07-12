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

export const DEFAULT_RESOURCE_BOUNDS: ResourceBounds = {
  maxSourceLength: 256 * 1024,
  maxNodeCount: 5000,
  maxDepth: 32,
  maxAttributesPerElement: 16,
  maxAttributeValueLength: 2048,
  maxDecodedTextLength: 512 * 1024,
  maxImagesPerDocument: 32,
  maxTableRows: 200,
  maxTableColumns: 64,
};

function clampBoundsDownOnly(
  overrides: Partial<ResourceBounds> | undefined
): ResourceBounds {
  if (!overrides) return DEFAULT_RESOURCE_BOUNDS;
  const result = { ...DEFAULT_RESOURCE_BOUNDS };
  for (const key of Object.keys(
    DEFAULT_RESOURCE_BOUNDS
  ) as (keyof ResourceBounds)[]) {
    const requested = overrides[key];
    if (typeof requested === 'number') {
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
  'resource-bound-exceeded' | 'duplicate-attribute' | 'uri-rejected';

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

function parseSource(html: string): {
  root: Document;
  duplicates: DuplicateAttributeHit[];
} {
  const handler = new DomHandler(undefined, {});
  const duplicates: DuplicateAttributeHit[] = [];
  let currentTagName = '';
  let currentAttrNames: Set<string> | null = null;

  const callbacks = {
    onparserinit: handler.onparserinit?.bind(handler),
    onreset: handler.onreset.bind(handler),
    onend: handler.onend.bind(handler),
    onerror: handler.onerror.bind(handler),
    onclosetag: handler.onclosetag.bind(handler),
    onopentagname: (name: string) => {
      currentTagName = name;
      currentAttrNames = new Set();
    },
    onattribute: (name: string) => {
      if (currentAttrNames) {
        if (currentAttrNames.has(name)) {
          duplicates.push({ tag: currentTagName, name });
        }
        currentAttrNames.add(name);
      }
    },
    onopentag: handler.onopentag.bind(handler),
    ontext: handler.ontext.bind(handler),
    oncomment: handler.oncomment.bind(handler),
    oncommentend: handler.oncommentend.bind(handler),
    oncdatastart: handler.oncdatastart.bind(handler),
    oncdataend: handler.oncdataend.bind(handler),
    onprocessinginstruction: handler.onprocessinginstruction.bind(handler),
  };

  // The exact TRE default: `{ decodeEntities: true, lowerCaseTags: true }`
  // (node_modules/@native-html/transient-render-engine TRenderEngine
  // constructor's `htmlParserOptions`). Everything else is left at
  // htmlparser2's own defaults, matching TRE exactly.
  new Parser(callbacks, { decodeEntities: true, lowerCaseTags: true }).end(
    html
  );

  return { root: handler.root, duplicates };
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
  nodeCount: number;
  textLength: number;
  imageCount: number;
  diagnostics: SanitizeDiagnostic[];
  tableStack: TableTracker[];
}

function visitNode(ctx: ReconstructContext, depth: number): void {
  if (depth > ctx.bounds.maxDepth) {
    throw new ResourceBoundExceeded(
      `depth exceeded (${depth} > ${ctx.bounds.maxDepth})`
    );
  }
  ctx.nodeCount += 1;
  if (ctx.nodeCount > ctx.bounds.maxNodeCount) {
    throw new ResourceBoundExceeded(
      `node count exceeded (${ctx.nodeCount} > ${ctx.bounds.maxNodeCount})`
    );
  }
}

/** Recursively reconstructs `sourceChildren` as children of `newParent`.
 * Returns the number of `td`/`th` elements directly reconstructed at this
 * level (used by the `tr` case to check the table-columns bound). */
function reconstructChildren(
  ctx: ReconstructContext,
  sourceChildren: ChildNode[],
  newParent: Document | Element,
  depth: number
): number {
  let directCellCount = 0;
  for (const child of sourceChildren) {
    directCellCount += reconstructNode(ctx, child, newParent, depth);
  }
  return directCellCount;
}

/** Returns 1 if this call produced a direct `td`/`th` child of `newParent`
 * (table-column counting), else 0. */
function reconstructNode(
  ctx: ReconstructContext,
  source: ChildNode,
  newParent: Document | Element,
  depth: number
): number {
  if (source.type === 'text') {
    visitNode(ctx, depth);
    const data = (source as Text).data;
    ctx.textLength += data.length;
    if (ctx.textLength > ctx.bounds.maxDecodedTextLength) {
      throw new ResourceBoundExceeded(
        `decoded text length exceeded (${ctx.textLength} > ${ctx.bounds.maxDecodedTextLength})`
      );
    }
    appendChild(newParent, new Text(data));
    return 0;
  }

  if (
    source.type !== 'tag' &&
    source.type !== 'script' &&
    source.type !== 'style'
  ) {
    // Comments, doctypes/processing instructions, CDATA — always dropped,
    // never visited/counted (design: "comments, doctypes, CDATA,
    // processing instructions" join the always-dropped list).
    return 0;
  }

  const element = source as Element;
  const tagName = element.name.toLowerCase();

  if (DROPPED_SUBTREE_TAGS.has(tagName)) {
    // Whole subtree dropped, never unwrapped — do not visit/count children.
    return 0;
  }

  visitNode(ctx, depth);

  if (!ctx.allowedTags.has(tagName)) {
    // Unknown-but-benign: unwrap — drop this element node but keep
    // reconstructing its children directly under the current parent.
    reconstructChildren(ctx, element.children, newParent, depth);
    return 0;
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
    return 0;
  }

  if (tagName === 'table') {
    ctx.tableStack.push({ rows: 0 });
    reconstructChildren(ctx, element.children, newElement, depth + 1);
    ctx.tableStack.pop();
    return 0;
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
    const cellCount = reconstructChildren(
      ctx,
      element.children,
      newElement,
      depth + 1
    );
    if (cellCount > ctx.bounds.maxTableColumns) {
      throw new ResourceBoundExceeded(
        `table column count exceeded (${cellCount} > ${ctx.bounds.maxTableColumns})`
      );
    }
    return 0;
  }

  reconstructChildren(ctx, element.children, newElement, depth + 1);
  return tagName === 'td' || tagName === 'th' ? 1 : 0;
}

function buildAttributes(
  ctx: ReconstructContext,
  tagName: string,
  sourceAttribs: Record<string, string>
): Record<string, string> {
  const names = Object.keys(sourceAttribs);
  if (names.length > ctx.bounds.maxAttributesPerElement) {
    throw new ResourceBoundExceeded(
      `attributes-per-element exceeded (${names.length} > ${ctx.bounds.maxAttributesPerElement})`
    );
  }

  const allowedForTag = ATTRIBUTE_ALLOWLIST[tagName];
  const result: Record<string, string> = {};
  if (!allowedForTag) return result;

  for (const name of names) {
    if (!allowedForTag.has(name)) continue;
    const value = sourceAttribs[name] ?? '';
    if (value.length > ctx.bounds.maxAttributeValueLength) {
      throw new ResourceBoundExceeded(
        `attribute value length exceeded (${tagName}.${name}: ${value.length} > ${ctx.bounds.maxAttributeValueLength})`
      );
    }

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
      if (validated.ok) {
        result[name] = validated.canonical;
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

/** Cheap, parse-free tag strip for when the source itself is too large to
 * safely parse at all (the pre-parse cap). Deliberately does not attempt
 * entity decoding or any HTML-aware processing — the whole point of this
 * path is to avoid spending parse-proportional work on unbounded input. */
function plainTextFromRawSource(raw: string): Document {
  const stripped = raw.replace(/<[^>]*>/g, '');
  const doc = new Document([]);
  if (stripped.length > 0) {
    appendChild(doc, new Text(stripped));
  }
  return doc;
}

/** Used when a bound is exceeded partway through reconstruction — the
 * source is already fully parsed in memory, so this extracts the text
 * nodes from that EXISTING parse (no HTML re-injection risk: only `.data`
 * strings are ever concatenated, never re-interpreted as markup). */
function plainTextFromParsedTree(root: Document): Document {
  const parts: string[] = [];
  const walk = (node: AnyNode): void => {
    if (node.type === 'text') {
      parts.push((node as Text).data);
    } else if ('children' in node) {
      for (const child of (node as Document | Element).children) walk(child);
    }
  };
  for (const child of root.children) walk(child);
  const doc = new Document([]);
  const text = parts.join('');
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
      dom: plainTextFromRawSource(raw),
      mode: 'plain-text-fallback',
      diagnostics: [
        {
          code: 'resource-bound-exceeded',
          detail: `source length exceeded (${raw.length} > ${bounds.maxSourceLength})`,
        },
      ],
    };
  }

  const { root: sourceRoot, duplicates } = parseSource(raw);

  const allowedTags = config?.relaxedFormatting
    ? new Set([...BASE_ALLOWED_TAGS, ...RELAXED_EXTRA_TAGS])
    : BASE_ALLOWED_TAGS;

  const ctx: ReconstructContext = {
    bounds,
    allowedTags,
    imageUriConfig: config?.imageUriConfig,
    nodeCount: 0,
    textLength: 0,
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
        dom: plainTextFromParsedTree(sourceRoot),
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
