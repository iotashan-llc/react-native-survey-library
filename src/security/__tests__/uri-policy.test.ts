/**
 * Design: docs/design/0.9-html-strategy.md, "Central URI policy (A11)".
 * Exhaustive scheme matrix x contexts x obfuscation corpus, plus the
 * data-image rule, relative-URL/baseUrl semantics, and the choicesByUrl
 * JSON-time lint. `validateUri` is a pure function — no network, no I/O —
 * so every case here is a direct assertion on its return value.
 */
/* eslint-disable no-script-url -- this file's whole point is asserting
 * that `javascript:`/`vbscript:` URIs get denied; the literals are
 * fixtures, not eval sites. */
import {
  validateUri,
  lintChoicesByUrlTemplate,
  requiresManualRedirect,
  type UriContext,
} from '../uri-policy';

const FETCH_CONTEXTS: UriContext[] = [
  'image',
  'background',
  'choicesByUrl',
  'video',
];
const ALL_CONTEXTS: UriContext[] = ['link', ...FETCH_CONTEXTS];

describe('validateUri — scheme matrix x contexts', () => {
  describe('link context: broad scheme allowlist, no origin restriction', () => {
    it.each(['https', 'http', 'mailto', 'tel'])(
      'allows %s: in link context',
      (scheme) => {
        const raw =
          scheme === 'mailto'
            ? 'mailto:person@example.com'
            : scheme === 'tel'
              ? 'tel:+15551234567'
              : `${scheme}://example.com/path`;
        const result = validateUri(raw, 'link');
        expect(result.ok).toBe(true);
      }
    );

    it('allows a non-default port with no allowlist (link has no origin restriction)', () => {
      const result = validateUri('https://example.com:8443/x', 'link');
      expect(result.ok).toBe(true);
    });

    it('allows an IP-literal host (link has no host restriction)', () => {
      const result = validateUri('http://192.168.1.5/x', 'link');
      expect(result.ok).toBe(true);
    });

    it('allows localhost (link has no host restriction)', () => {
      const result = validateUri('http://localhost:3000/x', 'link');
      expect(result.ok).toBe(true);
    });

    it('allows credentials in the URL (link has no credentials restriction)', () => {
      const result = validateUri('https://user:pass@example.com/x', 'link');
      expect(result.ok).toBe(true);
    });
  });

  describe.each(FETCH_CONTEXTS)('%s context (automatic-fetch)', (context) => {
    it('denies https without an allowlisted origin (default-deny)', () => {
      const result = validateUri('https://example.com/x', context);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('origin-not-allowlisted');
    });

    it('allows https when the exact origin is allowlisted', () => {
      const result = validateUri('https://example.com/x', context, {
        allowedOrigins: ['https://example.com'],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.canonical).toBe('https://example.com/x');
        expect(result.scheme).toBe('https:');
        expect(result.origin).toBe('https://example.com');
      }
    });

    it('denies http: by default even with the host allowlisted under https', () => {
      const result = validateUri('http://example.com/x', context, {
        allowedOrigins: ['https://example.com'],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('scheme-not-allowed');
    });

    it('denies mailto:/tel: (not in fetch-context scheme allowlist)', () => {
      const mailto = validateUri('mailto:a@example.com', context);
      const tel = validateUri('tel:+15551234567', context);
      expect(mailto.ok).toBe(false);
      expect(tel.ok).toBe(false);
    });

    it('denies an IP-literal host even if scheme is https', () => {
      const result = validateUri('https://192.168.1.5/x', context, {
        allowedOrigins: ['https://192.168.1.5'],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('ip-literal-host');
    });

    it('denies an IPv6-literal host', () => {
      const result = validateUri('https://[::1]/x', context);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('ip-literal-host');
    });

    it('denies localhost', () => {
      const result = validateUri('https://localhost/x', context);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('private-or-local-host');
    });

    it('denies .local hosts', () => {
      const result = validateUri('https://printer.local/x', context);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('private-or-local-host');
    });

    it('denies URL-embedded credentials even when the origin is allowlisted', () => {
      const result = validateUri('https://user:pass@example.com/x', context, {
        allowedOrigins: ['https://example.com'],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('credentials-in-url');
    });

    it('denies a non-default port not present in the allowlist', () => {
      const result = validateUri('https://example.com:8443/x', context, {
        allowedOrigins: ['https://example.com'],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('non-default-port');
    });

    it('allows a non-default port when that exact origin+port is allowlisted', () => {
      const result = validateUri('https://example.com:8443/x', context, {
        allowedOrigins: ['https://example.com:8443'],
      });
      expect(result.ok).toBe(true);
    });

    it('requires manual/fail-closed redirects', () => {
      expect(requiresManualRedirect(context)).toBe(true);
    });
  });

  it('link context does not require manual redirects', () => {
    expect(requiresManualRedirect('link')).toBe(false);
  });
});

describe('validateUri — immutable deny set (never overridable)', () => {
  const denied = [
    'javascript:alert(1)',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'about:blank',
    'blob:https://example.com/uuid',
    'filesystem:https://example.com/temporary/x',
    'intent://example.com/#Intent;end',
    'content://media/external/images',
    'jar:https://example.com/x.jar!/y',
  ];

  it.each(ALL_CONTEXTS)(
    'denies every immutable scheme in %s context',
    (context) => {
      for (const raw of denied) {
        const result = validateUri(raw, context, {
          allowedOrigins: ['https://example.com'],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('scheme-denied-immutable');
      }
    }
  );

  it('denies data: outside image context even with an allowlisted "origin"', () => {
    for (const context of [
      'link',
      'background',
      'choicesByUrl',
      'video',
    ] as UriContext[]) {
      const result = validateUri('data:image/png;base64,iVBORw0KGgo=', context);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('scheme-denied-immutable');
    }
  });

  it('cannot be widened by config (no such config knob exists)', () => {
    // Deliberately passing an unknown escape-hatch key to prove the type
    // surface offers no override; validateUri must still deny.
    const result = validateUri('javascript:alert(1)', 'link', {
      // @ts-expect-error -- 'allowedSchemes' is not a UriPolicyConfig key.
      allowedSchemes: ['javascript:'],
    });
    expect(result.ok).toBe(false);
  });
});

describe('validateUri — control-character REJECTION (not stripping)', () => {
  const base = 'https://example.com/x';

  it.each([
    ['NUL', '\u0000'],
    ['tab', '\t'],
    ['newline', '\n'],
    ['carriage return', '\r'],
    ['BOM', '\uFEFF'],
    ['line separator U+2028', '\u2028'],
    ['paragraph separator U+2029', '\u2029'],
    ['other C0 (bell)', '\u0007'],
    ['DEL', '\u007F'],
  ])(
    'rejects a URL with an embedded %s anywhere in the string',
    (_label, ch) => {
      const withCharAtStart = ch + base;
      const withCharInMiddle = 'https://exa' + ch + 'mple.com/x';
      const withCharAtEnd = base + ch;
      for (const raw of [withCharAtStart, withCharInMiddle, withCharAtEnd]) {
        const result = validateUri(raw, 'link');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('control-character');
      }
    }
  );

  it('rejects the classic tab-embedded javascript: obfuscation rather than stripping to a valid scheme', () => {
    const result = validateUri('java\tscript:alert(1)', 'link');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('control-character');
  });

  it('rejects a newline-embedded scheme obfuscation', () => {
    const result = validateUri('java\nscript:alert(1)', 'link');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('control-character');
  });

  it('rejects empty and whitespace-only input', () => {
    expect(validateUri('', 'link').ok).toBe(false);
    expect(validateUri('   ', 'link').ok).toBe(false);
  });

  it('trims plain ASCII boundary spaces (not a control character)', () => {
    const result = validateUri('  https://example.com/x  ', 'link');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.canonical).toBe('https://example.com/x');
  });
});

describe('validateUri — scheme obfuscation corpus', () => {
  it('rejects uppercase/mixed-case javascript: (case-insensitive scheme match)', () => {
    for (const raw of [
      'JAVASCRIPT:alert(1)',
      'JavaScript:alert(1)',
      'jAvAsCrIpT:alert(1)',
    ]) {
      const result = validateUri(raw, 'link');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('scheme-denied-immutable');
    }
  });

  it('normalizes an allowed scheme case to lowercase in canonical output', () => {
    const result = validateUri('HTTPS://example.com/x', 'link');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scheme).toBe('https:');
      expect(result.canonical.startsWith('https://')).toBe(true);
    }
  });

  it('denies protocol-relative URLs in fetch contexts without a baseUrl', () => {
    const result = validateUri('//evil.example.com/x', 'image');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('relative-url-not-allowed');
  });

  it('does not let a protocol-relative reference smuggle a different origin via baseUrl', () => {
    const result = validateUri('//evil.example.com/x', 'image', {
      baseUrl: 'https://trusted.example.com/base/',
      allowedOrigins: ['https://trusted.example.com'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('origin-not-allowlisted');
  });

  it('rejects data: with embedded whitespace in the base64 payload', () => {
    const result = validateUri('data:image/png;base64,iVBORw0K Ggo=', 'image');
    expect(result.ok).toBe(false);
  });

  it('rejects data: with percent-escapes', () => {
    const result = validateUri(
      'data:image/png;base64,iVBORw0K%20Ggo=',
      'image'
    );
    expect(result.ok).toBe(false);
  });

  it('rejects data: with extra parameters (e.g. charset)', () => {
    const result = validateUri(
      'data:image/png;charset=US-ASCII;base64,iVBORw0KGgo=',
      'image'
    );
    expect(result.ok).toBe(false);
  });
});

describe('validateUri — data-image rule', () => {
  // Minimal valid signatures, base64-encoded.
  const PNG_MAGIC_B64 = 'iVBORw0KGgo='; // 89 50 4E 47 0D 0A 1A 0A (+ pad)
  const JPEG_MAGIC_B64 = '/9j/'; // FF D8 FF
  const GIF_MAGIC_B64 = 'R0lGODlh'; // "GIF89a" + 2 more bytes, GIF8 9 a
  const WEBP_MAGIC_B64 = 'UklGRgAAAABXRUJQ'; // "RIFF" + 4 size bytes + "WEBP"

  it('accepts a well-formed png data-image', () => {
    const result = validateUri(
      `data:image/png;base64,${PNG_MAGIC_B64}`,
      'image'
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.origin).toBeNull();
  });

  it('accepts jpeg and jpg spellings', () => {
    expect(
      validateUri(`data:image/jpeg;base64,${JPEG_MAGIC_B64}`, 'image').ok
    ).toBe(true);
    expect(
      validateUri(`data:image/jpg;base64,${JPEG_MAGIC_B64}`, 'image').ok
    ).toBe(true);
  });

  it('accepts gif', () => {
    expect(
      validateUri(`data:image/gif;base64,${GIF_MAGIC_B64}`, 'image').ok
    ).toBe(true);
  });

  it('accepts webp', () => {
    expect(
      validateUri(`data:image/webp;base64,${WEBP_MAGIC_B64}`, 'image').ok
    ).toBe(true);
  });

  it('rejects a mime/magic-byte mismatch (png mime, jpeg bytes)', () => {
    const result = validateUri(
      `data:image/png;base64,${JPEG_MAGIC_B64}`,
      'image'
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe('data-image-magic-bytes-mismatch');
  });

  it('rejects an unsupported declared media type (svg is not in the allowlist)', () => {
    const result = validateUri(
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'image'
    );
    expect(result.ok).toBe(false);
  });

  it('rejects data: image outside the image context', () => {
    const result = validateUri(
      `data:image/png;base64,${PNG_MAGIC_B64}`,
      'background'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('scheme-denied-immutable');
  });

  it('rejects a decoded-size over the 1MB default cap, computed from encoded length', () => {
    // ~1.4MB decoded once base64-decoded (encoded length * 3/4).
    const hugePayload = 'A'.repeat(1900000);
    const result = validateUri(`data:image/png;base64,${hugePayload}`, 'image');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('data-image-too-large');
  });

  it('honors a caller-supplied cap that is LOWER than the default (down-only)', () => {
    const result = validateUri(
      `data:image/png;base64,${PNG_MAGIC_B64}`,
      'image',
      { maxDataImageBytes: 4 }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('data-image-too-large');
  });

  it('ignores a caller-supplied cap that is HIGHER than the default (down-only, clamps to default)', () => {
    // A cap request above the 1MB default must not raise the ceiling: the
    // 1.9MB-decoded payload above must still be rejected even if the config
    // asks for a 10MB cap.
    const hugePayload = 'A'.repeat(1900000);
    const result = validateUri(
      `data:image/png;base64,${hugePayload}`,
      'image',
      { maxDataImageBytes: 10 * 1024 * 1024 }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('data-image-too-large');
  });

  it('rejects malformed base64 (length not a multiple of 4)', () => {
    const result = validateUri('data:image/png;base64,iVBOR', 'image');
    expect(result.ok).toBe(false);
  });

  it('rejects an empty payload', () => {
    const result = validateUri('data:image/png;base64,', 'image');
    expect(result.ok).toBe(false);
  });
});

describe('validateUri — relative-URL / baseUrl semantics', () => {
  it('rejects a relative fetch-context URL with no baseUrl configured', () => {
    const result = validateUri('logo.png', 'image');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('relative-url-not-allowed');
  });

  it('resolves a relative path against a validated, allowlisted baseUrl', () => {
    const result = validateUri('logo.png', 'image', {
      baseUrl: 'https://trusted.example.com/assets/',
      allowedOrigins: ['https://trusted.example.com'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonical).toBe(
        'https://trusted.example.com/assets/logo.png'
      );
      expect(result.origin).toBe('https://trusted.example.com');
    }
  });

  it('resolves an absolute-path relative reference against the baseUrl origin', () => {
    const result = validateUri('/logo.png', 'image', {
      baseUrl: 'https://trusted.example.com/assets/deep/',
      allowedOrigins: ['https://trusted.example.com'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonical).toBe('https://trusted.example.com/logo.png');
    }
  });

  it('resolves dot-segments against the baseUrl', () => {
    const result = validateUri('../logo.png', 'image', {
      baseUrl: 'https://trusted.example.com/assets/deep/',
      allowedOrigins: ['https://trusted.example.com'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonical).toBe(
        'https://trusted.example.com/assets/logo.png'
      );
    }
  });

  it('rejects resolution when the baseUrl itself is invalid (not allowlisted)', () => {
    const result = validateUri('logo.png', 'image', {
      baseUrl: 'https://untrusted.example.com/assets/',
      allowedOrigins: ['https://trusted.example.com'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('base-url-invalid');
  });

  it('rejects resolution when the baseUrl is itself relative', () => {
    const result = validateUri('logo.png', 'image', {
      baseUrl: '/assets/',
      allowedOrigins: ['https://trusted.example.com'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('base-url-invalid');
  });

  it('link context passes relative values through to the host unresolved', () => {
    const result = validateUri('/local/path?x=1#y', 'link');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonical).toBe('/local/path?x=1#y');
      expect(result.origin).toBeNull();
    }
  });
});

describe('lintChoicesByUrlTemplate', () => {
  it('accepts a template with substitutions only in path/query', () => {
    expect(
      lintChoicesByUrlTemplate(
        'https://api.example.com/{region}/items?query={q}'
      )
    ).toEqual({ ok: true });
  });

  it('rejects a substitution in the host position', () => {
    const result = lintChoicesByUrlTemplate('https://{host}/items');
    expect(result.ok).toBe(false);
  });

  it('rejects a substitution in the scheme position', () => {
    const result = lintChoicesByUrlTemplate('{scheme}://api.example.com/items');
    expect(result.ok).toBe(false);
  });

  it('rejects a substitution in the port position', () => {
    const result = lintChoicesByUrlTemplate(
      'https://api.example.com:{port}/items'
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a substitution in a protocol-relative authority', () => {
    const result = lintChoicesByUrlTemplate('//{host}/items');
    expect(result.ok).toBe(false);
  });

  it('accepts substitutions anywhere in a schemeless relative-path template', () => {
    const result = lintChoicesByUrlTemplate('items/{id}');
    expect(result).toEqual({ ok: true });
  });

  it('accepts a template with no substitutions at all', () => {
    expect(lintChoicesByUrlTemplate('https://api.example.com/items')).toEqual({
      ok: true,
    });
  });
});

describe('requiresManualRedirect', () => {
  it.each(FETCH_CONTEXTS)('is true for %s (automatic-fetch)', (context) => {
    expect(requiresManualRedirect(context)).toBe(true);
  });

  it('is false for link (event-only, human-mediated)', () => {
    expect(requiresManualRedirect('link')).toBe(false);
  });
});
