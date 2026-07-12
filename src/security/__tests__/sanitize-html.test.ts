/**
 * Design: docs/design/0.9-html-strategy.md, "Sanitizer (A11)". Single-parse
 * AST pipeline: parse once with the exact TRE/htmlparser2 configuration
 * (`{ decodeEntities: true, lowerCaseTags: true }`), positive-reconstruct
 * into a private allowlisted `domhandler` tree (dangerous subtrees dropped
 * whole, unknown-but-benign elements unwrapped), enforce resource bounds,
 * and fall back to plain-text extraction (never a partial render) when any
 * bound is exceeded.
 */
import { Element, Text, type AnyNode, type Document } from 'domhandler';
import { sanitizeHtml, DEFAULT_RESOURCE_BOUNDS } from '../sanitize-html';

/** Test-only serializer (not exported by the library) so assertions read
 * as HTML strings instead of walking domhandler node objects by hand. */
function domToHtml(node: AnyNode | Document): string {
  if (node.type === 'root') {
    return (node as Document).children.map(domToHtml).join('');
  }
  if (node.type === 'text') {
    return (node as Text).data;
  }
  if (node.type === 'tag' || node.type === 'script' || node.type === 'style') {
    const el = node as Element;
    const attrs = Object.entries(el.attribs)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');
    const inner = el.children.map(domToHtml).join('');
    return `<${el.name}${attrs}>${inner}</${el.name}>`;
  }
  return '';
}

function sanitizedHtml(
  raw: string,
  config?: Parameters<typeof sanitizeHtml>[1]
): string {
  return domToHtml(sanitizeHtml(raw, config).dom);
}

describe('sanitizeHtml — tag allowlist (positive reconstruction)', () => {
  const ALLOWED_TAGS = [
    'p',
    'div',
    'span',
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
  ];

  it.each(ALLOWED_TAGS)('keeps <%s> and its text content', (tag) => {
    const html = sanitizedHtml(`<${tag}>hello</${tag}>`);
    expect(html).toBe(`<${tag}>hello</${tag}>`);
  });

  it('keeps void elements br and hr', () => {
    const result = sanitizeHtml('<p>a<br>b<hr>c</p>');
    expect(result.mode).toBe('sanitized');
    const html = domToHtml(result.dom);
    expect(html).toContain('<br>');
    expect(html).toContain('<hr>');
  });

  it('preserves nesting across allowed tags', () => {
    const html = sanitizedHtml(
      '<div><p>a <strong>b <em>c</em></strong></p></div>'
    );
    expect(html).toBe('<div><p>a <strong>b <em>c</em></strong></p></div>');
  });

  it('preserves a table structure', () => {
    const html = sanitizedHtml(
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>'
    );
    expect(html).toBe(
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>'
    );
  });
});

describe('sanitizeHtml — dangerous subtrees dropped whole (never unwrapped)', () => {
  // Tags with a normal (non-void, non-implicit-closing) content model:
  // real HTML5 parsing keeps the surrounding <p> intact, so the exact
  // structural match is meaningful here.
  const DANGEROUS_TAGS_WITH_NORMAL_CONTENT_MODEL = [
    'svg',
    'math',
    'template',
    'noscript',
    'style',
    'script',
    'iframe',
    'object',
    'textarea',
    'select',
    'button',
  ];

  it.each(DANGEROUS_TAGS_WITH_NORMAL_CONTENT_MODEL)(
    'drops <%s> AND its text content entirely (no unwrap)',
    (tag) => {
      const html = sanitizedHtml(
        `<p>before<${tag}>secret payload</${tag}>after</p>`
      );
      expect(html).toBe('<p>beforeafter</p>');
      expect(html).not.toContain('secret payload');
    }
  );

  // `meta`/`link`/`base`/`embed`/`input` are VOID elements per the HTML5
  // content model — a real parser never lets them have children at all
  // ("secret payload" ends up as ordinary sibling text, not smuggled
  // content), and `form` is one of the tags that implicitly closes an
  // open `<p>` (also per the HTML5 spec) before it opens, reshaping the
  // surrounding structure. Both are correct, spec-faithful htmlparser2
  // behavior — not a sanitizer bug — so these only assert the actual
  // security property (the element itself, and anything genuinely inside
  // a non-void one, never survives) rather than an exact structural match.
  const VOID_OR_STRUCTURAL_DANGEROUS_TAGS = [
    'meta',
    'link',
    'base',
    'embed',
    'form',
    'input',
  ];

  it.each(VOID_OR_STRUCTURAL_DANGEROUS_TAGS)(
    'never lets <%s> itself survive into the reconstructed output',
    (tag) => {
      const html = sanitizedHtml(
        `<p>before<${tag}>secret payload</${tag}>after</p>`
      );
      expect(html).not.toContain(`<${tag}`);
    }
  );

  it('drops content genuinely nested inside a non-void dangerous tag (form)', () => {
    const html = sanitizedHtml('<form><p>secret payload</p></form><p>kept</p>');
    expect(html).not.toContain('secret payload');
    expect(html).toContain('kept');
  });

  it('keeps sibling text that follows a void dangerous tag unchanged (never "smuggled")', () => {
    const html = sanitizedHtml('<p>before<meta>after</p>');
    expect(html).toBe('<p>beforeafter</p>');
  });

  it('drops <script> even with nested allowed-looking tags inside', () => {
    const html = sanitizedHtml(
      '<p>x</p><script><p>not really a paragraph</p></script>'
    );
    expect(html).toBe('<p>x</p>');
  });

  it('drops <style> content rather than rendering it as text', () => {
    const html = sanitizedHtml('<style>body { color: red; }</style><p>ok</p>');
    expect(html).toBe('<p>ok</p>');
  });

  it('drops foreignObject smuggling inside svg as one whole dropped subtree', () => {
    const html = sanitizedHtml(
      '<svg><foreignObject><p>smuggled</p></foreignObject></svg><p>kept</p>'
    );
    expect(html).toBe('<p>kept</p>');
  });
});

describe('sanitizeHtml — unknown/benign elements unwrap (drop element, keep children)', () => {
  it('unwraps an unrecognized tag but keeps its text', () => {
    const html = sanitizedHtml('<article>hello <b>world</b></article>');
    expect(html).toBe('hello <b>world</b>');
  });

  it('unwraps nested unknown tags', () => {
    const html = sanitizedHtml(
      '<figure><figcaption>caption <i>text</i></figcaption></figure>'
    );
    expect(html).toBe('caption <i>text</i>');
  });
});

describe('sanitizeHtml — comments, doctypes, CDATA, processing instructions', () => {
  it('drops HTML comments entirely, including comment-hidden markup', () => {
    const html = sanitizedHtml('<p>a<!-- <script>evil()</script> -->b</p>');
    expect(html).toBe('<p>ab</p>');
  });

  it('drops a leading doctype declaration', () => {
    const html = sanitizedHtml('<!DOCTYPE html><p>x</p>');
    expect(html).toBe('<p>x</p>');
  });
});

describe('sanitizeHtml — attribute allowlist', () => {
  it('strips style unconditionally, even a benign-looking value', () => {
    const result = sanitizeHtml('<p style="color:red">x</p>');
    const p = result.dom.children[0] as Element;
    expect(p.attribs.style).toBeUndefined();
  });

  it('strips attributes not on the per-tag allowlist (e.g. class, id, onclick)', () => {
    const result = sanitizeHtml(
      '<div class="x" id="y" onclick="evil()" data-foo="bar">z</div>'
    );
    const div = result.dom.children[0] as Element;
    expect(div.attribs).toEqual({});
  });

  it('keeps href on <a> and alt on <img>', () => {
    const result = sanitizeHtml(
      '<a href="https://example.com/x">link</a><img src="https://example.com/i.png" alt="pic">'
    );
    const [a, img] = result.dom.children as Element[];
    expect(a!.attribs.href).toBe('https://example.com/x');
    expect(img!.attribs.alt).toBe('pic');
  });

  it('first occurrence wins for a duplicated attribute', () => {
    const result = sanitizeHtml('<a href="first" href="second">x</a>');
    const a = result.dom.children[0] as Element;
    expect(a.attribs.href).toBe('first');
  });
});

describe('sanitizeHtml — bounded-integer attributes (width/height/rowspan/colspan)', () => {
  it('keeps a valid width/height on img within 1-10000', () => {
    const result = sanitizeHtml(
      '<img src="https://example.com/i.png" width="100" height="9999">'
    );
    const img = result.dom.children[0] as Element;
    expect(img.attribs.width).toBe('100');
    expect(img.attribs.height).toBe('9999');
  });

  it('drops width when it is not a plain integer (e.g. has a unit)', () => {
    const result = sanitizeHtml(
      '<img src="https://example.com/i.png" width="100px">'
    );
    const img = result.dom.children[0] as Element;
    expect(img.attribs.width).toBeUndefined();
  });

  it('drops width when it is zero or exceeds 10000', () => {
    const zero = sanitizeHtml(
      '<img src="https://example.com/i.png" width="0">'
    );
    const tooBig = sanitizeHtml(
      '<img src="https://example.com/i.png" width="10001">'
    );
    expect((zero.dom.children[0] as Element).attribs.width).toBeUndefined();
    expect((tooBig.dom.children[0] as Element).attribs.width).toBeUndefined();
  });

  it('keeps valid rowspan/colspan on td within 1-1000, drops out-of-range', () => {
    const ok = sanitizeHtml(
      '<table><tr><td rowspan="2" colspan="1000">x</td></tr></table>'
    );
    const bad = sanitizeHtml(
      '<table><tr><td rowspan="1001">x</td></tr></table>'
    );
    const okTd = ((ok.dom.children[0] as Element).children[0] as Element)
      .children[0] as Element;
    const badTd = ((bad.dom.children[0] as Element).children[0] as Element)
      .children[0] as Element;
    expect(okTd.attribs.rowspan).toBe('2');
    expect(okTd.attribs.colspan).toBe('1000');
    expect(badTd.attribs.rowspan).toBeUndefined();
  });
});

describe('sanitizeHtml — href/src go through the URI policy', () => {
  it('strips href when the scheme is javascript: (immutable deny)', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    const a = result.dom.children[0] as Element;
    expect(a.attribs.href).toBeUndefined();
  });

  it('strips href for an obfuscated (tab-embedded) javascript: scheme', () => {
    const result = sanitizeHtml('<a href="java&#9;script:alert(1)">click</a>');
    const a = result.dom.children[0] as Element;
    expect(a.attribs.href).toBeUndefined();
  });

  it('keeps a plain https href unchanged (link context, no origin restriction)', () => {
    const result = sanitizeHtml(
      '<a href="https://example.com/x?y=1">click</a>'
    );
    const a = result.dom.children[0] as Element;
    expect(a.attribs.href).toBe('https://example.com/x?y=1');
  });

  it('drops img src by default (image context default-denies without an allowlisted origin)', () => {
    const result = sanitizeHtml('<img src="https://example.com/i.png">');
    const img = result.dom.children[0] as Element;
    expect(img.attribs.src).toBeUndefined();
  });

  it('keeps img src when the origin is allowlisted via imageUriConfig', () => {
    const result = sanitizeHtml('<img src="https://example.com/i.png">', {
      imageUriConfig: { allowedOrigins: ['https://example.com'] },
    });
    const img = result.dom.children[0] as Element;
    expect(img.attribs.src).toBe('https://example.com/i.png');
  });

  it('keeps a strict valid data:image src on img (image context data-image rule)', () => {
    const result = sanitizeHtml(
      '<img src="data:image/png;base64,iVBORw0KGgo=">'
    );
    const img = result.dom.children[0] as Element;
    expect(img.attribs.src).toBe('data:image/png;base64,iVBORw0KGgo=');
  });
});

describe('sanitizeHtml — bypass corpus', () => {
  it('does not let an implied-close/table-scope trick smuggle a script into rendered output', () => {
    // A <td> auto-closed by a following <script> at the same scope must not
    // leave the script's raw-text content reachable as ordinary text.
    const html = sanitizedHtml(
      '<table><tr><td>cell<script>evil()</script></td></tr></table>'
    );
    expect(html).not.toContain('evil()');
  });

  it('drops MathML smuggling the same way as SVG', () => {
    const html = sanitizedHtml(
      '<math><mtext><p>smuggled</p></mtext></math><p>kept</p>'
    );
    expect(html).toBe('<p>kept</p>');
  });

  it('drops <template> content (inert-but-parsed subtree)', () => {
    const html = sanitizedHtml(
      '<template><p>not live</p></template><p>live</p>'
    );
    expect(html).toBe('<p>live</p>');
  });

  it('resists entity double-decode for a javascript: href', () => {
    // &amp;#106; decodes once (by the parser) to the literal text "&#106;",
    // which must NOT be decoded a second time into "j" by anything
    // downstream — the attribute value the sanitizer sees is already
    // fully (single-pass) decoded by htmlparser2, and a literal `&#106;`
    // string is not a valid scheme character, so validateUri correctly
    // rejects/does not construct "javascript:".
    const result = sanitizeHtml('<a href="&amp;#106;avascript:alert(1)">x</a>');
    const a = result.dom.children[0] as Element;
    expect(a.attribs.href).not.toMatch(/^javascript:/i);
  });

  it('does not let an attribute value break out into a second attribute', () => {
    // A raw `"` inside what looks like an attribute value cannot create a
    // second, unsanitized attribute — htmlparser2's tokenizer resolves this
    // deterministically and the sanitizer only ever sees the resulting
    // (single) attribs object, never re-parses attribute text itself.
    const result = sanitizeHtml('<div title=\'x" onclick="evil()\'>y</div>');
    const div = result.dom.children[0] as Element;
    expect(div.attribs.onclick).toBeUndefined();
  });

  it('rejects an uppercase JAVASCRIPT: href scheme', () => {
    const result = sanitizeHtml('<a href="JAVASCRIPT:alert(1)">x</a>');
    const a = result.dom.children[0] as Element;
    expect(a.attribs.href).toBeUndefined();
  });

  it('rejects a protocol-relative href used as an image src smuggling attempt', () => {
    const result = sanitizeHtml('<img src="//evil.example.com/i.png">');
    const img = result.dom.children[0] as Element;
    expect(img.attribs.src).toBeUndefined();
  });

  it('rejects data: smuggling a non-image mime through the img src', () => {
    const result = sanitizeHtml(
      '<img src="data:text/html;base64,PHNjcmlwdD5ldmlsKCk8L3NjcmlwdD4=">'
    );
    const img = result.dom.children[0] as Element;
    expect(img.attribs.src).toBeUndefined();
  });
});

describe('sanitizeHtml — resource bounds (exceed -> plain-text fallback, never partial-render)', () => {
  it('falls back to plain text when the pre-parse source cap is exceeded', () => {
    const huge =
      '<p>' + 'a'.repeat(DEFAULT_RESOURCE_BOUNDS.maxSourceLength + 10) + '</p>';
    const result = sanitizeHtml(huge);
    expect(result.mode).toBe('plain-text-fallback');
    expect(
      result.diagnostics.some((d) => d.code === 'resource-bound-exceeded')
    ).toBe(true);
    // The fallback dom must be a flat, allowlist-free text-only document —
    // never a partially-reconstructed tree.
    expect(result.dom.children.every((c) => c.type === 'text')).toBe(true);
  });

  it('falls back to plain text when node count is exceeded', () => {
    const many =
      '<p>' +
      '<span>x</span>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxNodeCount) +
      '</p>';
    const result = sanitizeHtml(many);
    expect(result.mode).toBe('plain-text-fallback');
    expect(
      result.diagnostics.some((d) => d.code === 'resource-bound-exceeded')
    ).toBe(true);
  });

  it('falls back to plain text when depth is exceeded', () => {
    const deep =
      '<div>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxDepth + 5) +
      'x' +
      '</div>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxDepth + 5);
    const result = sanitizeHtml(deep);
    expect(result.mode).toBe('plain-text-fallback');
  });

  it('falls back to plain text when attributes-per-element is exceeded', () => {
    const attrs = Array.from(
      { length: DEFAULT_RESOURCE_BOUNDS.maxAttributesPerElement + 5 },
      (_, i) => `data-a${i}="1"`
    ).join(' ');
    const result = sanitizeHtml(`<div ${attrs}>x</div>`);
    expect(result.mode).toBe('plain-text-fallback');
  });

  it('falls back to plain text when an attribute value length is exceeded', () => {
    const longHref =
      'https://example.com/' +
      'a'.repeat(DEFAULT_RESOURCE_BOUNDS.maxAttributeValueLength);
    const result = sanitizeHtml(`<a href="${longHref}">x</a>`);
    expect(result.mode).toBe('plain-text-fallback');
  });

  it('falls back to plain text when decoded text total is exceeded', () => {
    const bigText =
      '<p>' +
      'a'.repeat(DEFAULT_RESOURCE_BOUNDS.maxDecodedTextLength + 10) +
      '</p>';
    const result = sanitizeHtml(bigText);
    expect(result.mode).toBe('plain-text-fallback');
  });

  it('falls back to plain text when images-per-document is exceeded', () => {
    const manyImages = Array.from(
      { length: DEFAULT_RESOURCE_BOUNDS.maxImagesPerDocument + 1 },
      () => '<img src="https://example.com/i.png">'
    ).join('');
    const result = sanitizeHtml(manyImages, {
      imageUriConfig: { allowedOrigins: ['https://example.com'] },
    });
    expect(result.mode).toBe('plain-text-fallback');
  });

  it('falls back to plain text when table row count is exceeded', () => {
    const rows = Array.from(
      { length: DEFAULT_RESOURCE_BOUNDS.maxTableRows + 1 },
      () => '<tr><td>x</td></tr>'
    ).join('');
    const result = sanitizeHtml(`<table>${rows}</table>`);
    expect(result.mode).toBe('plain-text-fallback');
  });

  it('falls back to plain text when table column count is exceeded', () => {
    const cols = Array.from(
      { length: DEFAULT_RESOURCE_BOUNDS.maxTableColumns + 1 },
      () => '<td>x</td>'
    ).join('');
    const result = sanitizeHtml(`<table><tr>${cols}</tr></table>`);
    expect(result.mode).toBe('plain-text-fallback');
  });

  it('caller-supplied bounds only tighten (down-only), never loosen', () => {
    // Requesting a HIGHER maxDepth than the default must not raise the
    // ceiling past the built-in default.
    const deep =
      '<div>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxDepth + 5) +
      'x' +
      '</div>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxDepth + 5);
    const result = sanitizeHtml(deep, { bounds: { maxDepth: 1000 } });
    expect(result.mode).toBe('plain-text-fallback');
  });

  it('preserves the underlying text (order-preserving) in the plain-text fallback', () => {
    const html =
      '<p>' + 'z'.repeat(DEFAULT_RESOURCE_BOUNDS.maxSourceLength + 10) + '</p>';
    const result = sanitizeHtml(html);
    const text = result.dom.children.map((c) => (c as Text).data).join('');
    expect(text).toContain('z');
  });
});

describe('sanitizeHtml — relaxedFormatting (widens formatting only, safety pass immutable)', () => {
  it('does not allow mark/small/del/ins by default', () => {
    const html = sanitizedHtml('<mark>hi</mark>');
    expect(html).toBe('hi'); // unwrapped, not an allowlisted tag by default
  });

  it('allows mark/small/del/ins under relaxedFormatting', () => {
    const html = sanitizedHtml('<mark>hi</mark>', { relaxedFormatting: true });
    expect(html).toBe('<mark>hi</mark>');
  });

  it('still drops <script> under relaxedFormatting (immutable safety pass)', () => {
    const html = sanitizedHtml('<p>a</p><script>evil()</script>', {
      relaxedFormatting: true,
    });
    expect(html).toBe('<p>a</p>');
  });

  it('still strips javascript: hrefs under relaxedFormatting (immutable safety pass)', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">x</a>', {
      relaxedFormatting: true,
    });
    const a = result.dom.children[0] as Element;
    expect(a.attribs.href).toBeUndefined();
  });

  it('still strips style under relaxedFormatting (immutable safety pass)', () => {
    const result = sanitizeHtml('<p style="color:red">x</p>', {
      relaxedFormatting: true,
    });
    const p = result.dom.children[0] as Element;
    expect(p.attribs.style).toBeUndefined();
  });
});

describe('sanitizeHtml — output shape (domhandler-compatible, ready for source={{dom}})', () => {
  it('returns a real domhandler Document with correctly linked parent/prev/next', () => {
    const result = sanitizeHtml('<p>a</p><p>b</p>');
    const [first, second] = result.dom.children as Element[];
    expect(first!.parent).toBe(result.dom);
    expect(second!.parent).toBe(result.dom);
    expect(first!.next).toBe(second);
    expect(second!.prev).toBe(first);
  });

  it('links a text child to its element parent', () => {
    const result = sanitizeHtml('<p>hi</p>');
    const p = result.dom.children[0] as Element;
    const text = p.children[0] as Text;
    expect(text.parent).toBe(p);
    expect(text.type).toBe('text');
  });
});
