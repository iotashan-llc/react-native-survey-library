/**
 * `<SanitizedHtml>` hardening — round-2 Codex security review (#1 fail-
 * closed remote images, zero-network proof at the mount boundary; #7 the
 * sanitize memo must key on EVERY input, so a tightened bound / revoked
 * origin / changed baseUrl never renders stale, less-restrictive output).
 */
import { Image } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SanitizedHtml, sanitizeConfigKey } from '../SanitizedHtml';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

describe('#1 zero-network proof — a remote <img> reaches no network sink at mount', () => {
  it('mounts a remote-image document without ANY fetch call (belt-and-suspenders)', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('no network call may originate from a sanitized image');
    });
    try {
      expect(() => {
        render(
          <SanitizedHtml
            html='<p>ok</p><img src="https://cdn.example.com/tracker.png">'
            imageUriConfig={{ allowedOrigins: ['https://cdn.example.com'] }}
            contentWidth={320}
          />
        );
      }).not.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.getByText('ok')).toBeTruthy();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('no remote URI ever reaches the REAL image sink (Image.getSize / getSizeWithHeaders)', () => {
    // The renderer's IMG path resolves natural dimensions via
    // `Image.getSize(uri, …)` / `Image.getSizeWithHeaders(uri, headers, …)`
    // (node_modules/@native-html/render/src/elements/useIMGElementState.ts) —
    // that native call is what would issue the redirect-following network
    // request. Spy on BOTH and assert no `http(s)` URI ever reaches them.
    const getSizeSpy = jest
      .spyOn(Image, 'getSize')
      .mockImplementation((() => {}) as unknown as typeof Image.getSize);
    const getSizeWithHeadersSpy = jest
      .spyOn(Image, 'getSizeWithHeaders')
      .mockImplementation(
        (() => {}) as unknown as typeof Image.getSizeWithHeaders
      );
    try {
      render(
        <SanitizedHtml
          html={
            '<p>ok</p>' +
            '<img src="https://cdn.example.com/a.png">' +
            '<img src="http://cdn.example.com/b.png">'
          }
          imageUriConfig={{ allowedOrigins: ['https://cdn.example.com'] }}
          contentWidth={320}
        />
      );
      const urisSeen = [
        ...getSizeSpy.mock.calls.map((c) => String(c[0])),
        ...getSizeWithHeadersSpy.mock.calls.map((c) => String(c[0])),
      ];
      expect(urisSeen.some((u) => /^https?:/i.test(u))).toBe(false);
      expect(screen.getByText('ok')).toBeTruthy();
    } finally {
      getSizeSpy.mockRestore();
      getSizeWithHeadersSpy.mockRestore();
    }
  });

  it('a data: image DOES reach the sink (proving the spy exercises the real path) but ONLY as a data: URI', () => {
    const getSizeSpy = jest
      .spyOn(Image, 'getSize')
      .mockImplementation((() => {}) as unknown as typeof Image.getSize);
    const getSizeWithHeadersSpy = jest
      .spyOn(Image, 'getSizeWithHeaders')
      .mockImplementation(
        (() => {}) as unknown as typeof Image.getSizeWithHeaders
      );
    try {
      render(
        <SanitizedHtml
          html='<img src="data:image/png;base64,iVBORw0KGgo=">'
          contentWidth={320}
        />
      );
      const urisSeen = [
        ...getSizeSpy.mock.calls.map((c) => String(c[0])),
        ...getSizeWithHeadersSpy.mock.calls.map((c) => String(c[0])),
      ];
      // The real sink IS reached for the (safe, network-free) data: image —
      // this proves the previous test's "not reached" is meaningful, not a
      // false negative from the sink never being wired.
      expect(urisSeen.length).toBeGreaterThan(0);
      expect(urisSeen.every((u) => u.startsWith('data:'))).toBe(true);
      expect(urisSeen.some((u) => /^https?:/i.test(u))).toBe(false);
    } finally {
      getSizeSpy.mockRestore();
      getSizeWithHeadersSpy.mockRestore();
    }
  });
});

describe('#7 sanitizeConfigKey — changes when ANY sanitizer input changes', () => {
  it('differs when a resource bound is tightened', () => {
    const a = sanitizeConfigKey(false, undefined, undefined);
    const b = sanitizeConfigKey(false, { maxNodeCount: 10 }, undefined);
    expect(a).not.toBe(b);
  });

  it('differs when an allowlisted origin is revoked / changed', () => {
    const a = sanitizeConfigKey(false, undefined, {
      allowedOrigins: ['https://a.example.com'],
    });
    const b = sanitizeConfigKey(false, undefined, {
      allowedOrigins: [],
    });
    expect(a).not.toBe(b);
  });

  it('differs when baseUrl changes', () => {
    const a = sanitizeConfigKey(false, undefined, {
      baseUrl: 'https://a.example.com/',
    });
    const b = sanitizeConfigKey(false, undefined, {
      baseUrl: 'https://b.example.com/',
    });
    expect(a).not.toBe(b);
  });

  it('is stable across equal-value objects with different identities', () => {
    const a = sanitizeConfigKey(
      true,
      { maxDepth: 8 },
      {
        allowedOrigins: ['https://a.example.com'],
      }
    );
    const b = sanitizeConfigKey(
      true,
      { maxDepth: 8 },
      {
        allowedOrigins: ['https://a.example.com'],
      }
    );
    expect(a).toBe(b);
  });
});

describe('#7 re-sanitizes (no stale memo) when bounds tighten across a rerender', () => {
  afterEach(() => setDiagnosticHandler(undefined));

  it('emits a fresh resource-bound-exceeded diagnostic when a tighter bound is applied on rerender', () => {
    const received: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => received.push(p));

    const html = '<p>' + '<span>x</span>'.repeat(50) + '</p>';
    const { rerender } = render(
      <SanitizedHtml html={html} contentWidth={320} />
    );
    // Default bounds: nothing exceeded.
    expect(
      received.some(
        (p) =>
          p.code === 'sanitized-html-diagnostic' &&
          p.sanitizeCode === 'resource-bound-exceeded'
      )
    ).toBe(false);

    // Tighten a bound so the SAME html now exceeds it. A correct memo key
    // re-sanitizes; a stale one (keyed only on html) would not.
    rerender(
      <SanitizedHtml
        html={html}
        bounds={{ maxNodeCount: 5 }}
        contentWidth={320}
      />
    );
    expect(
      received.some(
        (p) =>
          p.code === 'sanitized-html-diagnostic' &&
          p.sanitizeCode === 'resource-bound-exceeded'
      )
    ).toBe(true);
  });
});
