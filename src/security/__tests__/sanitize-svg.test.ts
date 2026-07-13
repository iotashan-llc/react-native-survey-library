/**
 * @jest-environment node
 */

// Design: docs/design/1.5-icon-actionbutton.md, "Sanitization decision" —
// consumer-registered icon SVG is parse-validated against an svg-only
// allowlist before it ever reaches react-native-svg's `SvgXml` (a real
// XML-parse + native-render sink that supports `<Image href>` remote
// fetches — an auto-fetch sink smuggled through a render sink if left
// open). Bundled core icons bypass this (trusted-library-generated per
// the 0.9 content-origin framing); that split lives in icon-resolution,
// not here — this module sanitizes whatever string it is given.
import { sanitizeIconSvg } from '../sanitize-svg';

describe('sanitizeIconSvg — allowlist pipeline', () => {
  it('passes a clean drawing-primitive icon through with its geometry and viewBox intact', () => {
    const raw =
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M16.5 10.5L12.5 14.5"/></svg>';
    const result = sanitizeIconSvg(raw);
    expect(result.xml).not.toBeNull();
    expect(result.xml).toContain('<svg');
    expect(result.xml).toContain('viewBox="0 0 24 24"');
    expect(result.xml).toContain('M16.5 10.5L12.5 14.5');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('keeps nested allowlisted structure (g, defs, linearGradient, stop, local use)', () => {
    const raw =
      '<svg viewBox="0 0 24 24"><defs><linearGradient id="grad"><stop offset="0" stop-color="red"/></linearGradient></defs><g fill="url(#grad)"><rect width="24" height="24"/></g><use href="#grad"/></svg>';
    const result = sanitizeIconSvg(raw);
    expect(result.xml).toContain('linearGradient');
    expect(result.xml).toContain('stop-color="red"');
    expect(result.xml).toContain('<use');
    expect(result.xml).toContain('href="#grad"');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('drops <image> (remote-fetch capable) with a diagnostic, keeping the rest', () => {
    const raw =
      '<svg viewBox="0 0 24 24"><image href="https://evil.example/x.png"/><path d="M0 0h24"/></svg>';
    const result = sanitizeIconSvg(raw);
    expect(result.xml).not.toBeNull();
    expect(result.xml).not.toContain('image');
    expect(result.xml).not.toContain('evil.example');
    expect(result.xml).toContain('M0 0h24');
    expect(
      result.diagnostics.some((d) => d.code === 'icon-svg-sanitized')
    ).toBe(true);
  });

  it('drops foreignObject, script and animate elements', () => {
    const raw =
      '<svg viewBox="0 0 8 8"><script>alert(1)</script><foreignObject><div/></foreignObject><animate attributeName="x"/><animateTransform attributeName="transform"/><circle r="4"/></svg>';
    const result = sanitizeIconSvg(raw);
    expect(result.xml).not.toContain('script');
    expect(result.xml).not.toContain('alert(1)');
    expect(result.xml).not.toContain('foreignObject');
    expect(result.xml).not.toContain('animate');
    expect(result.xml).toContain('<circle');
  });

  it('drops on* event-handler attributes', () => {
    const raw =
      '<svg viewBox="0 0 8 8" onload="steal()"><path d="M0 0" onclick="x()"/></svg>';
    const result = sanitizeIconSvg(raw);
    expect(result.xml).not.toContain('onload');
    expect(result.xml).not.toContain('onclick');
    expect(result.xml).not.toContain('steal');
    expect(result.xml).toContain('M0 0');
    expect(
      result.diagnostics.some((d) => d.code === 'icon-svg-sanitized')
    ).toBe(true);
  });

  it('drops external href/xlink:href but keeps local fragment references', () => {
    const raw =
      '<svg viewBox="0 0 8 8"><use xlink:href="https://evil.example/sprite.svg#i"/><use href="#local-ok"/></svg>';
    const result = sanitizeIconSvg(raw);
    expect(result.xml).not.toContain('evil.example');
    expect(result.xml).toContain('href="#local-ok"');
  });

  it('rejects a non-svg root outright (xml: null + icon-svg-invalid)', () => {
    const result = sanitizeIconSvg('<div><svg viewBox="0 0 8 8"/></div>');
    expect(result.xml).toBeNull();
    expect(result.diagnostics.some((d) => d.code === 'icon-svg-invalid')).toBe(
      true
    );
  });

  it('rejects non-markup garbage', () => {
    const result = sanitizeIconSvg('not svg at all');
    expect(result.xml).toBeNull();
    expect(result.diagnostics.some((d) => d.code === 'icon-svg-invalid')).toBe(
      true
    );
  });

  it('memoizes per raw string: same input returns the identical result object', () => {
    const raw = '<svg viewBox="0 0 4 4"><path d="M0 0h4"/></svg>';
    const first = sanitizeIconSvg(raw);
    const second = sanitizeIconSvg(raw);
    expect(second).toBe(first);
  });
});

describe('sanitizeIconSvg — resource bounds + never-throw (codex review major 1)', () => {
  it('a 5000-deep allowlisted <g> tree is rejected, NOT a RangeError', () => {
    const deep =
      '<svg viewBox="0 0 4 4">' +
      '<g>'.repeat(5000) +
      '<path d="M0 0h4"/>' +
      '</g>'.repeat(5000) +
      '</svg>';
    let result: ReturnType<typeof sanitizeIconSvg> | undefined;
    expect(() => {
      result = sanitizeIconSvg(deep);
    }).not.toThrow();
    expect(result!.xml).toBeNull();
    expect(result!.diagnostics.some((d) => d.code === 'icon-svg-invalid')).toBe(
      true
    );
  });

  it('rejects oversized source before parsing', () => {
    const huge =
      '<svg viewBox="0 0 4 4"><path d="M' +
      '0 0h4 '.repeat(20000) +
      '"/></svg>';
    expect(huge.length).toBeGreaterThan(64 * 1024);
    const result = sanitizeIconSvg(huge);
    expect(result.xml).toBeNull();
    expect(result.diagnostics.some((d) => d.code === 'icon-svg-invalid')).toBe(
      true
    );
  });

  it('rejects a pathological element count', () => {
    const wide =
      '<svg viewBox="0 0 4 4">' + '<path d="M0 0h1"/>'.repeat(600) + '</svg>';
    const result = sanitizeIconSvg(wide);
    expect(result.xml).toBeNull();
    expect(result.diagnostics.some((d) => d.code === 'icon-svg-invalid')).toBe(
      true
    );
  });
});

describe('sanitizeIconSvg — style validation + href grammar (codex review minor 4)', () => {
  it('keeps a well-formed style attribute', () => {
    const result = sanitizeIconSvg(
      '<svg viewBox="0 0 4 4"><path d="M0 0h4" style="fill:red; stroke-width:2"/></svg>'
    );
    expect(result.xml).toContain('style="fill:red; stroke-width:2"');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('drops a malformed style attribute (declaration without ":" crashes react-native-svg\'s parser)', () => {
    const result = sanitizeIconSvg(
      '<svg viewBox="0 0 4 4"><path d="M0 0h4" style="color"/></svg>'
    );
    expect(result.xml).toContain('M0 0h4');
    expect(result.xml).not.toContain('style=');
    expect(
      result.diagnostics.some((d) => d.code === 'icon-svg-sanitized')
    ).toBe(true);
  });

  it('rejects fragment references outside the exact grammar (bare "#", embedded whitespace)', () => {
    const result = sanitizeIconSvg(
      '<svg viewBox="0 0 4 4"><use href="#"/><use href="#foo bar"/><use href="#ok-ref_1.x"/></svg>'
    );
    expect(result.xml).toContain('href="#ok-ref_1.x"');
    expect(result.xml).not.toContain('href="#"');
    expect(result.xml).not.toContain('foo bar');
  });
});
