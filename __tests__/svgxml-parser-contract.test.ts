/**
 * Real-parser contract (codex review minor 4): everything `sanitizeIconSvg`
 * ACCEPTS must survive react-native-svg's ACTUAL parser — the second,
 * different parser downstream of the allowlist. The root `__mocks__`
 * stub replaces only the bare `react-native-svg` specifier; requiring the
 * parser module by subpath gets the real implementation without loading
 * the native-component index.
 *
 * Lives at the repo root (not `src/`) deliberately: the ESLint
 * react-native-svg boundary restricts `src/**` to RNIcon, and this suite
 * needs the real parser directly.
 */
import { sanitizeIconSvg } from '../src/security/sanitize-svg';
import { bundledIconsV2 } from '../src/core/icons';

const { parse } = require('react-native-svg/lib/commonjs/xml') as {
  parse: (xml: string) => unknown;
};

/** Sanitize, assert acceptance, then hand the output to the REAL parser. */
function sanitizedParses(raw: string): unknown {
  const result = sanitizeIconSvg(raw);
  expect(result.xml).not.toBeNull();
  let ast: unknown;
  expect(() => {
    ast = parse(result.xml!);
  }).not.toThrow();
  expect(ast).not.toBeNull();
  return ast;
}

describe('sanitized output ⨯ react-native-svg real parser', () => {
  it('clean drawing primitives parse', () => {
    sanitizedParses(
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M16.5 10.5L12.5 14.5"/></svg>'
    );
  });

  it('every bundled V2 icon parses (trusted passthrough really is renderable)', () => {
    for (const [key, xml] of Object.entries(bundledIconsV2)) {
      let ast: unknown;
      expect(() => {
        ast = parse(xml);
      }).not.toThrow();
      if (ast === null) {
        throw new Error(`bundled icon ${key} parsed to null`);
      }
    }
  });

  it('camelCase/namespace-carrying markup parses (linearGradient, xmlns, gradient stops)', () => {
    sanitizedParses(
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="grad"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="24" height="24" fill="url(#grad)"/></svg>'
    );
  });

  it('a malformed style declaration (no ":") is stripped by the sanitizer so the parser cannot crash on it', () => {
    // react-native-svg 15.x throws while parsing a style declaration
    // without a colon; the sanitizer must not let it through.
    sanitizedParses(
      '<svg viewBox="0 0 4 4"><path d="M0 0h4" style="color"/></svg>'
    );
  });

  it('a well-formed style declaration passes through and parses', () => {
    sanitizedParses(
      '<svg viewBox="0 0 4 4"><path d="M0 0h4" style="fill:red; stroke-width:2"/></svg>'
    );
  });

  it('numeric entities decode at sanitize time and parse', () => {
    sanitizedParses(
      '<svg viewBox="0 0 4 4"><title>a &#38; b</title><path d="M0 0h4"/></svg>'
    );
  });

  it('duplicate attributes collapse deterministically and parse', () => {
    sanitizedParses(
      '<svg viewBox="0 0 4 4"><path d="M0 0h4" fill="red" fill="blue"/></svg>'
    );
  });

  it('local use references parse', () => {
    sanitizedParses(
      '<svg viewBox="0 0 8 8"><defs><circle id="dot" r="2"/></defs><use href="#dot" x="2" y="2"/></svg>'
    );
  });
});
