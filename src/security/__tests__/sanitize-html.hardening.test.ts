/**
 * sanitizer hardening — regression tests for the round-2 Codex security
 * review (findings #1 fail-closed remote images, #2 deep-input recursion,
 * #3 bounds bypasses, #4 NaN bounds). Design: docs/design/0.9-html-strategy.md.
 */
import { Element, type AnyNode } from 'domhandler';
import { sanitizeHtml, DEFAULT_RESOURCE_BOUNDS } from '../sanitize-html';

const onlyImg = (result: ReturnType<typeof sanitizeHtml>): Element =>
  result.dom.children[0] as Element;

/** Collects every attribute value in the tree (iterative; avoids
 * JSON.stringify, which would choke on domhandler's circular parent refs). */
function allAttributeValues(root: { children: AnyNode[] }): string[] {
  const values: string[] = [];
  const stack: AnyNode[] = [...root.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (
      node.type === 'tag' ||
      node.type === 'script' ||
      node.type === 'style'
    ) {
      const el = node as Element;
      values.push(...Object.values(el.attribs));
      stack.push(...el.children);
    }
  }
  return values;
}

describe('#1 CRITICAL — remote image sources fail closed (only data: reaches the sink)', () => {
  it('strips an allowlisted REMOTE https img src (redirects cannot be validated through the RN image sink)', () => {
    const result = sanitizeHtml('<img src="https://example.com/i.png">', {
      imageUriConfig: { allowedOrigins: ['https://example.com'] },
    });
    const img = onlyImg(result);
    // Zero-network proof at the sink: no URL is ever handed to the renderer.
    expect(img.attribs.src).toBeUndefined();
    expect(
      result.diagnostics.some((d) => d.code === 'remote-image-stripped')
    ).toBe(true);
  });

  it('the sanitized DOM contains no remote URL anywhere (nothing for a native Image request to follow)', () => {
    const result = sanitizeHtml(
      '<p>x</p><img src="https://cdn.example.com/a.png"><img src="http://cdn.example.com/b.png">',
      { imageUriConfig: { allowedOrigins: ['https://cdn.example.com'] } }
    );
    const values = allAttributeValues(result.dom);
    expect(values.some((v) => /https?:\/\//.test(v))).toBe(false);
    expect(values.some((v) => v.includes('example.com'))).toBe(false);
  });

  it('still keeps a strict valid data:image src (no network, no redirect risk)', () => {
    const result = sanitizeHtml(
      '<img src="data:image/png;base64,iVBORw0KGgo=">'
    );
    expect(onlyImg(result).attribs.src).toBe(
      'data:image/png;base64,iVBORw0KGgo='
    );
  });
});

describe('#2 deep input falls back to plain text (never throws / never partial-render)', () => {
  const WAY_PAST = DEFAULT_RESOURCE_BOUNDS.maxDepth + 20000;

  it('deeply nested ALLOWED elements fall back without throwing', () => {
    const html = '<div>'.repeat(WAY_PAST) + 'x' + '</div>'.repeat(WAY_PAST);
    let result: ReturnType<typeof sanitizeHtml> | undefined;
    expect(() => {
      result = sanitizeHtml(html);
    }).not.toThrow();
    expect(result!.mode).toBe('plain-text-fallback');
  });

  it('deeply nested UNKNOWN (unwrapped) elements count toward depth and fall back without throwing', () => {
    const html = '<x>'.repeat(WAY_PAST) + 'y' + '</x>'.repeat(WAY_PAST);
    let result: ReturnType<typeof sanitizeHtml> | undefined;
    expect(() => {
      result = sanitizeHtml(html);
    }).not.toThrow();
    expect(result!.mode).toBe('plain-text-fallback');
    // The fallback still recovers the text (iterative extraction, no overflow).
    const text =
      (result!.dom.children[0] as { data?: string } | undefined)?.data ?? '';
    expect(text).toContain('y');
  });
});

describe('#3 resource-bound accounting counts ALL source structure (no drop/dedupe bypass)', () => {
  it('counts dropped-subtree elements toward the node-count bound', () => {
    const many = '<script></script>'.repeat(
      DEFAULT_RESOURCE_BOUNDS.maxNodeCount + 1
    );
    expect(sanitizeHtml(many).mode).toBe('plain-text-fallback');
  });

  it('counts RAW (pre-dedupe) attributes toward the attributes-per-element bound', () => {
    const dupAttrs =
      '<a ' +
      'href="x" '.repeat(DEFAULT_RESOURCE_BOUNDS.maxAttributesPerElement + 4) +
      '>t</a>';
    expect(sanitizeHtml(dupAttrs).mode).toBe('plain-text-fallback');
  });

  it('checks attribute value length for NON-allowlisted attributes too', () => {
    const bigVal =
      '<div data-x="' +
      'a'.repeat(DEFAULT_RESOURCE_BOUNDS.maxAttributeValueLength + 10) +
      '">t</div>';
    expect(sanitizeHtml(bigVal).mode).toBe('plain-text-fallback');
  });

  it('counts EFFECTIVE table columns including cells revealed by unwrapping', () => {
    const cols = '<x><td>c</td></x>'.repeat(
      DEFAULT_RESOURCE_BOUNDS.maxTableColumns + 2
    );
    expect(sanitizeHtml(`<table><tr>${cols}</tr></table>`).mode).toBe(
      'plain-text-fallback'
    );
  });
});

describe('#4 NaN / non-finite bounds cannot disable a ceiling', () => {
  it('a NaN maxDepth override keeps the default depth ceiling (still falls back)', () => {
    const deep =
      '<div>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxDepth + 50) +
      'x' +
      '</div>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxDepth + 50);
    expect(sanitizeHtml(deep, { bounds: { maxDepth: NaN } }).mode).toBe(
      'plain-text-fallback'
    );
  });

  it('an Infinity maxNodeCount override keeps the default node ceiling', () => {
    const many = '<span>x</span>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxNodeCount);
    expect(
      sanitizeHtml(`<p>${many}</p>`, {
        bounds: { maxNodeCount: Infinity },
      }).mode
    ).toBe('plain-text-fallback');
  });

  it('a negative / non-integer override is ignored (default kept)', () => {
    const deep =
      '<div>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxDepth + 50) +
      'x' +
      '</div>'.repeat(DEFAULT_RESOURCE_BOUNDS.maxDepth + 50);
    expect(sanitizeHtml(deep, { bounds: { maxDepth: -5 } }).mode).toBe(
      'plain-text-fallback'
    );
    expect(sanitizeHtml(deep, { bounds: { maxDepth: 12.5 } }).mode).toBe(
      'plain-text-fallback'
    );
  });

  it('DEFAULT_RESOURCE_BOUNDS is frozen', () => {
    expect(Object.isFrozen(DEFAULT_RESOURCE_BOUNDS)).toBe(true);
  });
});
