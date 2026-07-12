/**
 * uri-policy hardening — regression tests for the round-2 Codex security
 * review (findings #4 config hardening, #5 canonical port drop, #6 IP/
 * local-host normalization gaps, #8 choicesByUrl authority injection, #11
 * base64 pad-bit laxity). Design: docs/design/0.9-html-strategy.md.
 */
import {
  validateUri,
  lintChoicesByUrlTemplate,
  type UriPolicyConfig,
} from '../uri-policy';

const listed = (origins: string[]): UriPolicyConfig => ({
  allowedOrigins: origins,
});

describe('#5 REAL BUG — canonical must preserve an allowlisted non-default port', () => {
  it('keeps the explicit non-default port in canonical AND origin', () => {
    const r = validateUri(
      'https://cdn.example.com:8443/a/b?x=1',
      'image',
      listed(['https://cdn.example.com:8443'])
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.canonical).toBe('https://cdn.example.com:8443/a/b?x=1');
    expect(r.origin).toBe('https://cdn.example.com:8443');
  });

  it('canonical authority round-trips to the returned origin (no silent port drop to 443)', () => {
    const r = validateUri(
      'https://cdn.example.com:8443/logo.png',
      'image',
      listed(['https://cdn.example.com:8443'])
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The canonical string a sink consumes must carry :8443 — never
    // collapse to the default 443.
    expect(r.canonical.startsWith('https://cdn.example.com:8443/')).toBe(true);
    // Re-validating the canonical against the same allowlist must agree.
    const again = validateUri(r.canonical, 'image', listed([r.origin!]));
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.origin).toBe(r.origin);
  });

  it('normalizes an explicit default :443 out of canonical and origin', () => {
    const r = validateUri(
      'https://cdn.example.com:443/x',
      'image',
      listed(['https://cdn.example.com'])
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.origin).toBe('https://cdn.example.com');
    expect(r.canonical).toBe('https://cdn.example.com/x');
  });

  it('rejects a port outside 1-65535', () => {
    expect(
      validateUri(
        'https://h.example.com:0/x',
        'image',
        listed(['https://h.example.com:0'])
      ).ok
    ).toBe(false);
    expect(
      validateUri(
        'https://h.example.com:70000/x',
        'image',
        listed(['https://h.example.com:70000'])
      ).ok
    ).toBe(false);
    expect(
      validateUri(
        'https://h.example.com:99999/x',
        'image',
        listed(['https://h.example.com:99999'])
      ).ok
    ).toBe(false);
  });
});

describe('#6 IP-literal / local-host normalization gaps', () => {
  const ipForms = [
    'https://2130706433/x', // decimal loopback
    'https://0x7f000001/x', // hex loopback
    'https://0177.0.0.1/x', // octal-ish
    'https://127.1/x', // short form
    'https://127.0.0.1/x', // dotted quad (baseline)
    'https://192.168.1.1/x', // RFC-1918
    'https://169.254.1.1/x', // link-local
  ];
  it.each(ipForms)(
    'rejects %s as an IP literal even if that exact string is allowlisted',
    (url) => {
      // Extract origin form for the allowlist (defense in depth: the ban
      // must fire BEFORE the allowlist, so even an allowlisted numeric
      // host is refused).
      const origin = url.slice(0, url.indexOf('/', 'https://'.length));
      const r = validateUri(url, 'image', listed([origin]));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('ip-literal-host');
    }
  );

  it('rejects an IPv6 literal host', () => {
    const r = validateUri(
      'https://[::1]/x',
      'image',
      listed(['https://[::1]'])
    );
    expect(r.ok).toBe(false);
  });

  it('strips a terminal DNS dot before the local-host check (localhost.)', () => {
    const r = validateUri(
      'https://localhost./x',
      'image',
      listed(['https://localhost.'])
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private-or-local-host');
  });

  it('strips a terminal DNS dot before the .local check (printer.local.)', () => {
    const r = validateUri(
      'https://printer.local./x',
      'image',
      listed(['https://printer.local.'])
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private-or-local-host');
  });

  it('canonicalizes a trailing dot on an allowlisted public host (example.com. == example.com)', () => {
    const r = validateUri(
      'https://example.com./x',
      'image',
      listed(['https://example.com'])
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.origin).toBe('https://example.com');
  });

  it('still accepts a genuine public host with numeric-looking labels that have an alpha TLD', () => {
    const r = validateUri(
      'https://1e100.net/x',
      'image',
      listed(['https://1e100.net'])
    );
    expect(r.ok).toBe(true);
  });
});

describe('#4 config hardening (own-props, primitive-string origins, no substring/inherited match)', () => {
  it('ignores allowedOrigins passed as a bare string (no substring match)', () => {
    const r = validateUri('https://cdn.example.com/x', 'image', {
      // A string has .includes too — a naive check would substring-match.
      allowedOrigins: 'https://cdn.example.com' as unknown as string[],
    });
    expect(r.ok).toBe(false);
  });

  it('does not honor allowedOrigins inherited from the prototype chain', () => {
    const proto = { allowedOrigins: ['https://evil.example.com'] };
    const cfg = Object.create(proto) as UriPolicyConfig;
    const r = validateUri('https://evil.example.com/x', 'image', cfg);
    expect(r.ok).toBe(false);
  });

  it('ignores non-string entries inside allowedOrigins', () => {
    const r = validateUri('https://cdn.example.com/x', 'image', {
      allowedOrigins: [
        123 as unknown as string,
        { toString: () => 'https://cdn.example.com' } as unknown as string,
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('a NaN maxDataImageBytes does not disable the decoded-size cap', () => {
    // A NaN cap must NOT silently disable the ceiling (Math.min(NaN,
    // default) === NaN, and `x > NaN` is false). Payload length is a
    // multiple of 4 (all 'A' = value 0, valid pad bits) and decodes to
    // > 1MB (default cap), so the size check fires BEFORE magic bytes.
    const bigPayload = 'A'.repeat(1_398_104); // (len/4)*3 = 1_048_578 > 1MB
    const r = validateUri(`data:image/png;base64,${bigPayload}`, 'image', {
      maxDataImageBytes: NaN,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('data-image-too-large');
  });
});

describe('#8 choicesByUrl lint — authority injection via post-scheme substitution', () => {
  it('rejects a substitution that can create the authority after the scheme colon', () => {
    // `{slashes}` could expand to `//`, forming `https://evil.example/x`.
    const r = lintChoicesByUrlTemplate('https:{slashes}evil.example/x');
    expect(r.ok).toBe(false);
  });

  it('rejects a substitution forming a protocol-relative authority', () => {
    expect(lintChoicesByUrlTemplate('{slashes}evil.example/x').ok).toBe(false);
  });

  it('still accepts a substitution confined to the path or query of a literal absolute URL', () => {
    expect(
      lintChoicesByUrlTemplate('https://api.example.com/items?q={term}').ok
    ).toBe(true);
    expect(
      lintChoicesByUrlTemplate('https://api.example.com/items/{id}').ok
    ).toBe(true);
  });

  it('two-layer defense: a lint-passing template whose placeholder expands to a hostile absolute URL is caught at request time', () => {
    const template = 'https://api.example.com/items?q={term}';
    expect(lintChoicesByUrlTemplate(template).ok).toBe(true);
    // Request-time: the FULLY RESOLVED url is validated. A benign encoded
    // value stays on the allowlisted origin and passes.
    const benign = template.replace('{term}', encodeURIComponent('a b&c'));
    expect(
      validateUri(benign, 'choicesByUrl', listed(['https://api.example.com']))
        .ok
    ).toBe(true);
    // A hostile expansion that escapes to another origin is refused at
    // request time regardless of the lint verdict.
    const hostile = 'https://evil.example.com/items?q=x';
    expect(
      validateUri(hostile, 'choicesByUrl', listed(['https://api.example.com']))
        .ok
    ).toBe(false);
  });
});

describe('#11 base64 pad-bit strictness (RFC 4648)', () => {
  it('rejects a data image whose final group has non-zero pad bits', () => {
    // iVBORw0KGgo= is valid (o=40, 40 % 4 === 0). Swapping the last data
    // char to p (41, 41 % 4 === 1) leaves the PNG magic bytes intact but
    // sets non-zero pad bits — must be rejected.
    const r = validateUri('data:image/png;base64,iVBORw0KGgp=', 'image');
    expect(r.ok).toBe(false);
  });

  it('still accepts the canonical valid pad-bit form', () => {
    const r = validateUri('data:image/png;base64,iVBORw0KGgo=', 'image');
    expect(r.ok).toBe(true);
  });
});
