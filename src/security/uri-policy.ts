/**
 * Central URI policy (design: docs/design/0.9-html-strategy.md, "Central
 * URI policy (A11)"). A pure, side-effect-free function that decides
 * whether a URI may be used in a given rendering/fetch context, and
 * returns a CANONICAL string that sinks must consume — never the raw
 * input (closes the "validate one string, use another" class of bug).
 *
 * Deliberately does not use the host runtime's `URL`/`atob` globals:
 * React Native's URL polyfill behavior varies across engines/versions,
 * and this module needs identical, auditable behavior in Jest (Node) and
 * on-device (Hermes). Scheme/authority parsing and base64 decoding are
 * hand-rolled below instead.
 */

/** Sink categories the policy has distinct defaults for (sink-to-owner
 * matrix, design doc). `link` is event-only/human-mediated (anchor
 * presses); the rest are automatic-fetch (the library or a capability lib
 * makes a network request with no human gesture in between). */
export type UriContext =
  'link' | 'image' | 'background' | 'choicesByUrl' | 'video';

const AUTOMATIC_FETCH_CONTEXTS: ReadonlySet<UriContext> = new Set([
  'image',
  'background',
  'choicesByUrl',
  'video',
]);

function isAutomaticFetchContext(context: UriContext): boolean {
  return AUTOMATIC_FETCH_CONTEXTS.has(context);
}

/** Automatic-fetch contexts must use fail-closed/manual redirect handling
 * at the actual network call site (design: "Redirects fail CLOSED") — this
 * is the policy fact those future call sites (M1/M2) consume; `validateUri`
 * itself makes no network calls. */
export function requiresManualRedirect(context: UriContext): boolean {
  return isAutomaticFetchContext(context);
}

export interface UriPolicyConfig {
  /**
   * Automatic-fetch contexts only. Exact origin strings (e.g.
   * `"https://cdn.example.com"` or, for a non-default port,
   * `"https://cdn.example.com:8443"`). Default `[]` — "same-config-
   * declared origins only": nothing is fetchable until a consumer lists
   * it (design: "default: empty = same-config-declared origins only").
   * A non-default-port URL must appear here WITH its port to pass; the
   * default-port form of the same host does not implicitly cover it.
   */
  allowedOrigins?: string[];
  /**
   * Automatic-fetch contexts only. A previously-trusted absolute URL used
   * to resolve a relative reference. Re-validated (as an absolute URL, in
   * the same context) on every call — "itself policy-validated" — so it
   * must itself pass `allowedOrigins` etc.
   */
  baseUrl?: string;
  /**
   * `image` context only. Overrides the default 1MB decoded-byte cap for
   * `data:` images — DOWN only. A value above the default is clamped to
   * the default; this config can only tighten, never loosen, the cap.
   */
  maxDataImageBytes?: number;
}

export interface UriValidationOk {
  ok: true;
  /** The string sinks MUST consume in place of the raw input. */
  canonical: string;
  /** Lowercase, trailing colon included (e.g. `"https:"`), or `null` for
   * a relative `link` value passed through unresolved. */
  scheme: string | null;
  /** `scheme://host[:port]` (lowercase), or `null` for opaque schemes
   * (`mailto:`, `tel:`), `data:` images, and unresolved relative links. */
  origin: string | null;
}

export interface UriValidationFail {
  ok: false;
  /** Stable, machine-checkable reason code. */
  reason: string;
}

export type UriValidationResult = UriValidationOk | UriValidationFail;

/** Never overridable by any config, for any context (design: "Immutable
 * per-context deny set"). `data:` is excepted ONLY for `image` context,
 * under the strict data-image rule below — handled as a special case
 * BEFORE this set is consulted for that one combination. */
const IMMUTABLE_DENY_SCHEMES: ReadonlySet<string> = new Set([
  // eslint-disable-next-line no-script-url -- this literal IS the denylist entry.
  'javascript:',
  'vbscript:',
  'file:',
  'about:',
  'blob:',
  'filesystem:',
  'intent:',
  'content:',
  'jar:',
  'data:',
]);

const LINK_ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  'https:',
  'http:',
  'mailto:',
  'tel:',
]);

/** Automatic-fetch contexts: https: only by default (design: "Automatic-
 * fetch contexts ... = https: only by default"). */
const FETCH_ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['https:']);

const DEFAULT_PORT_FOR_SCHEME: Record<string, number> = {
  'https:': 443,
  'http:': 80,
};

/** C0 controls, DEL, BOM, and the Unicode line/paragraph separators.
 * Matched against the RAW string before any trimming — presence anywhere
 * is a hard rejection, never a strip-and-continue (design: "Rejection
 * (not stripping) of embedded C0/NUL/BOM/Unicode-separator chars"). */
// eslint-disable-next-line no-control-regex -- intentional: this IS the control-character detector.
const CONTROL_OR_SEPARATOR_CHARS = /[\u0000-\u001F\u007F\uFEFF\u2028\u2029]/;

const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):([\s\S]*)$/;

function fail(reason: string): UriValidationFail {
  return { ok: false, reason };
}

function ok(
  canonical: string,
  scheme: string | null,
  origin: string | null
): UriValidationOk {
  return { ok: true, canonical, scheme, origin };
}

// ---------------------------------------------------------------------
// Authority (host/port/userinfo) parsing
// ---------------------------------------------------------------------

interface ParsedAuthority {
  userinfo: string | null;
  host: string;
  port: number | null;
}

/** Parses a `//`-prefixed authority component. Returns `null` if it isn't
 * shaped like `//...` at all (opaque scheme, e.g. `mailto:x@y.com`). */
function splitSchemeRest(rest: string): {
  authority: string | null;
  pathAndRest: string;
} {
  if (!rest.startsWith('//')) {
    return { authority: null, pathAndRest: rest };
  }
  const afterSlashes = rest.slice(2);
  let end = afterSlashes.length;
  for (const marker of ['/', '?', '#']) {
    const idx = afterSlashes.indexOf(marker);
    if (idx !== -1 && idx < end) end = idx;
  }
  return {
    authority: afterSlashes.slice(0, end),
    pathAndRest: afterSlashes.slice(end),
  };
}

function parseAuthority(authority: string): ParsedAuthority | null {
  const atIndex = authority.lastIndexOf('@');
  const userinfo = atIndex === -1 ? null : authority.slice(0, atIndex);
  const hostAndPort = atIndex === -1 ? authority : authority.slice(atIndex + 1);
  if (hostAndPort.length === 0) return null;

  if (hostAndPort.startsWith('[')) {
    // IPv6 literal, e.g. [::1] or [::1]:8080
    const closeIdx = hostAndPort.indexOf(']');
    if (closeIdx === -1) return null;
    const host = hostAndPort.slice(0, closeIdx + 1);
    const portPart = hostAndPort.slice(closeIdx + 1);
    const port = parsePort(portPart);
    if (portPart.length > 0 && port === null) return null;
    return { userinfo, host, port };
  }

  const colonIdx = hostAndPort.indexOf(':');
  if (colonIdx === -1) {
    return { userinfo, host: hostAndPort, port: null };
  }
  const host = hostAndPort.slice(0, colonIdx);
  const portPart = hostAndPort.slice(colonIdx);
  const port = parsePort(portPart);
  if (port === null) return null;
  return { userinfo, host, port };
}

function parsePort(colonAndDigits: string): number | null {
  if (colonAndDigits.length === 0) return null;
  const match = /^:(\d+)$/.exec(colonAndDigits);
  if (!match) return null;
  return Number(match[1]);
}

const IPV4_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function isIpLiteralHost(host: string): boolean {
  if (host.startsWith('[') && host.endsWith(']')) return true; // IPv6
  return IPV4_PATTERN.test(host);
}

function isLocalOrPrivateHostname(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local')
  );
}

// ---------------------------------------------------------------------
// data: image rule
// ---------------------------------------------------------------------

const DATA_IMAGE_PATTERN =
  /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/]*={0,2})$/;

const DEFAULT_MAX_DATA_IMAGE_BYTES = 1_048_576; // 1MB

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64CharValue(char: string): number {
  return BASE64_ALPHABET.indexOf(char);
}

/** Decodes only as many leading bytes as needed for a magic-byte check —
 * never the whole (potentially large, attacker-controlled) payload.
 * Bitwise ops are the correct, standard tool for base64 bit-packing —
 * disabled per-line rather than widened as a style exception elsewhere. */
function decodeBase64Prefix(payload: string, minBytes: number): number[] {
  const bytes: number[] = [];
  for (let i = 0; i + 4 <= payload.length && bytes.length < minBytes; i += 4) {
    const c0 = base64CharValue(payload[i] ?? '');
    const c1 = base64CharValue(payload[i + 1] ?? '');
    const rawC2 = payload[i + 2] ?? '';
    const rawC3 = payload[i + 3] ?? '';
    const c2 = rawC2 === '=' ? -1 : base64CharValue(rawC2);
    const c3 = rawC3 === '=' ? -1 : base64CharValue(rawC3);
    if (c0 < 0 || c1 < 0) break;
    // eslint-disable-next-line no-bitwise -- base64 bit-packing.
    bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
    if (c2 >= 0)
      // eslint-disable-next-line no-bitwise -- base64 bit-packing.
      bytes.push((((c1 & 0xf) << 4) | (c2 >> 2)) & 0xff);
    if (c3 >= 0)
      // eslint-disable-next-line no-bitwise -- base64 bit-packing.
      bytes.push((((c2 & 0x3) << 6) | c3) & 0xff);
  }
  return bytes;
}

function bytesStartWith(bytes: number[], signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

type CanonicalImageMime = 'png' | 'jpeg' | 'gif' | 'webp';

const MAGIC_BYTES_MIN_LENGTH: Record<CanonicalImageMime, number> = {
  png: 8,
  jpeg: 3,
  gif: 6,
  webp: 12,
};

function checkMagicBytes(mime: CanonicalImageMime, bytes: number[]): boolean {
  switch (mime) {
    case 'png':
      return bytesStartWith(
        bytes,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      );
    case 'jpeg':
      return bytesStartWith(bytes, [0xff, 0xd8, 0xff]);
    case 'gif':
      return (
        bytes.length >= 6 &&
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) &&
        bytes[5] === 0x61
      );
    case 'webp':
      return (
        bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        bytesStartWith(bytes.slice(8, 12), [0x57, 0x45, 0x42, 0x50])
      );
  }
}

function validateDataImageUri(
  raw: string,
  schemeText: string,
  config: UriPolicyConfig | undefined
): UriValidationResult {
  // Normalize only the scheme token's casing; the media type and base64
  // payload are matched with case-sensitive strictness below.
  const rest = raw.slice(schemeText.length);
  const normalized = 'data:' + rest;
  const match = DATA_IMAGE_PATTERN.exec(normalized);
  if (!match) return fail('data-image-invalid-mime-or-format');

  const [, mimeToken, payload] = match;
  if (!payload || payload.length === 0 || payload.length % 4 !== 0) {
    return fail('data-image-invalid-base64');
  }

  const paddingMatch = /[=]+$/.exec(payload);
  const paddingCount = paddingMatch ? paddingMatch[0].length : 0;
  const decodedByteLength = (payload.length / 4) * 3 - paddingCount;

  const requestedCap = config?.maxDataImageBytes;
  const effectiveCap =
    requestedCap != null
      ? Math.min(requestedCap, DEFAULT_MAX_DATA_IMAGE_BYTES)
      : DEFAULT_MAX_DATA_IMAGE_BYTES;
  if (decodedByteLength > effectiveCap) {
    return fail('data-image-too-large');
  }

  const canonicalMime: CanonicalImageMime =
    mimeToken === 'jpg' ? 'jpeg' : (mimeToken as CanonicalImageMime);
  const minBytes = MAGIC_BYTES_MIN_LENGTH[canonicalMime];
  const prefixBytes = decodeBase64Prefix(payload, minBytes);
  if (!checkMagicBytes(canonicalMime, prefixBytes)) {
    return fail('data-image-magic-bytes-mismatch');
  }

  return ok(normalized, 'data:', null);
}

// ---------------------------------------------------------------------
// Relative-URL resolution (RFC 3986 5.3, simplified — no query-relative
// edge cases beyond what fetch-context sinks need)
// ---------------------------------------------------------------------

interface AbsoluteParts {
  schemeColon: string; // e.g. "https:"
  authority: string; // e.g. "example.com:8443"
  path: string; // e.g. "/a/b"
  query: string | null; // without leading '?'
}

function parseAbsoluteParts(url: string): AbsoluteParts | null {
  const schemeMatch = SCHEME_PATTERN.exec(url);
  if (!schemeMatch) return null;
  const schemeColon = schemeMatch[1]!.toLowerCase() + ':';
  const rest = schemeMatch[2]!;
  const { authority, pathAndRest } = splitSchemeRest(rest);
  if (authority === null) return null;
  const hashIdx = pathAndRest.indexOf('#');
  const withoutFragment =
    hashIdx === -1 ? pathAndRest : pathAndRest.slice(0, hashIdx);
  const queryIdx = withoutFragment.indexOf('?');
  const path =
    queryIdx === -1 ? withoutFragment : withoutFragment.slice(0, queryIdx);
  const query = queryIdx === -1 ? null : withoutFragment.slice(queryIdx + 1);
  return { schemeColon, authority, path: path || '/', query };
}

function removeDotSegments(path: string): string {
  const output: string[] = [];
  let input = path;
  // Bounded by input length shrinking (or being sliced) every branch;
  // resource-bounds table (0.9 sanitizer side) governs attacker-controlled
  // HTML, not this URL-path utility, but the loop is still structurally
  // terminating on its own.
  while (input.length > 0) {
    if (input.startsWith('../')) {
      input = input.slice(3);
    } else if (input.startsWith('./')) {
      input = input.slice(2);
    } else if (input.startsWith('/./')) {
      input = '/' + input.slice(3);
    } else if (input === '/.') {
      input = '/';
    } else if (input.startsWith('/../')) {
      input = '/' + input.slice(4);
      output.pop();
    } else if (input === '/..') {
      input = '/';
      output.pop();
    } else if (input === '.' || input === '..') {
      input = '';
    } else {
      const match = /^\/?[^/]*/.exec(input);
      const segment = match && match[0].length > 0 ? match[0] : input;
      output.push(segment);
      input = input.slice(segment.length);
    }
  }
  return output.join('');
}

function resolveRelative(raw: string, base: AbsoluteParts): string {
  if (raw.startsWith('//')) {
    return base.schemeColon + raw;
  }
  if (raw.startsWith('/')) {
    return base.schemeColon + '//' + base.authority + raw;
  }
  if (raw.startsWith('?')) {
    return base.schemeColon + '//' + base.authority + base.path + raw;
  }
  if (raw.startsWith('#')) {
    const q = base.query !== null ? '?' + base.query : '';
    return base.schemeColon + '//' + base.authority + base.path + q + raw;
  }
  const hashIdx = raw.indexOf('#');
  const withoutFragment = hashIdx === -1 ? raw : raw.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? '' : raw.slice(hashIdx);
  const queryIdx = withoutFragment.indexOf('?');
  const relPath =
    queryIdx === -1 ? withoutFragment : withoutFragment.slice(0, queryIdx);
  const relQuery = queryIdx === -1 ? '' : withoutFragment.slice(queryIdx);

  const baseDir = base.path.slice(0, base.path.lastIndexOf('/') + 1);
  const mergedPath = removeDotSegments(baseDir + relPath);
  return (
    base.schemeColon + '//' + base.authority + mergedPath + relQuery + fragment
  );
}

// ---------------------------------------------------------------------
// validateUri
// ---------------------------------------------------------------------

export function validateUri(
  raw: string,
  context: UriContext,
  config?: UriPolicyConfig
): UriValidationResult {
  if (typeof raw !== 'string' || raw.length === 0) return fail('empty');
  if (CONTROL_OR_SEPARATOR_CHARS.test(raw)) return fail('control-character');

  const trimmed = raw.replace(/^ +/, '').replace(/ +$/, '');
  if (trimmed.length === 0) return fail('empty');

  const schemeMatch = SCHEME_PATTERN.exec(trimmed);

  if (!schemeMatch) {
    return validateRelative(trimmed, context, config);
  }

  const schemeText = schemeMatch[1]!; // original casing, e.g. "HTTPS"
  const schemeLower = schemeText.toLowerCase() + ':';
  const rest = schemeMatch[2]!;

  if (IMMUTABLE_DENY_SCHEMES.has(schemeLower)) {
    if (schemeLower === 'data:' && context === 'image') {
      return validateDataImageUri(trimmed, schemeText + ':', config);
    }
    return fail('scheme-denied-immutable');
  }

  if (context === 'link') {
    return validateLinkAbsolute(schemeLower, rest);
  }

  if (!FETCH_ALLOWED_SCHEMES.has(schemeLower)) {
    return fail('scheme-not-allowed');
  }

  return validateFetchAbsolute(schemeLower, rest, config);
}

function validateLinkAbsolute(
  schemeLower: string,
  rest: string
): UriValidationResult {
  if (!LINK_ALLOWED_SCHEMES.has(schemeLower)) {
    return fail('scheme-not-allowed');
  }
  const canonical = schemeLower + rest;
  const { authority } = splitSchemeRest(rest);
  if (authority === null) {
    // Opaque scheme (mailto:, tel:) — no network origin.
    return ok(canonical, schemeLower, null);
  }
  const parsedAuthority = parseAuthority(authority);
  if (!parsedAuthority) {
    // Malformed authority: still human-mediated, still pass through with
    // no computed origin rather than rejecting outright.
    return ok(canonical, schemeLower, null);
  }
  const origin = computeOrigin(schemeLower, parsedAuthority);
  return ok(canonical, schemeLower, origin);
}

function computeOrigin(
  schemeLower: string,
  authority: ParsedAuthority
): string {
  const hostLower = authority.host.toLowerCase();
  const defaultPort = DEFAULT_PORT_FOR_SCHEME[schemeLower];
  const includePort = authority.port !== null && authority.port !== defaultPort;
  return (
    schemeLower + '//' + hostLower + (includePort ? ':' + authority.port : '')
  );
}

function validateFetchAbsolute(
  schemeLower: string,
  rest: string,
  config: UriPolicyConfig | undefined
): UriValidationResult {
  const { authority, pathAndRest } = splitSchemeRest(rest);
  if (authority === null) return fail('malformed-uri');
  const parsedAuthority = parseAuthority(authority);
  if (!parsedAuthority) return fail('malformed-uri');

  if (parsedAuthority.userinfo !== null) return fail('credentials-in-url');
  if (isIpLiteralHost(parsedAuthority.host)) return fail('ip-literal-host');
  if (isLocalOrPrivateHostname(parsedAuthority.host)) {
    return fail('private-or-local-host');
  }

  const hostLower = parsedAuthority.host.toLowerCase();
  const defaultPort = DEFAULT_PORT_FOR_SCHEME[schemeLower];
  const isNonDefaultPort =
    parsedAuthority.port !== null && parsedAuthority.port !== defaultPort;
  const originWithPort =
    schemeLower +
    '//' +
    hostLower +
    (parsedAuthority.port !== null ? ':' + parsedAuthority.port : '');
  const originDefaultForm = schemeLower + '//' + hostLower;

  const allowedOrigins = config?.allowedOrigins ?? [];
  const isAllowlisted =
    allowedOrigins.includes(originWithPort) ||
    (!isNonDefaultPort && allowedOrigins.includes(originDefaultForm));

  if (!isAllowlisted) {
    return fail(
      isNonDefaultPort ? 'non-default-port' : 'origin-not-allowlisted'
    );
  }

  const canonical = schemeLower + '//' + hostLower + pathAndRest;
  const origin = isNonDefaultPort ? originWithPort : originDefaultForm;
  return ok(canonical, schemeLower, origin);
}

function validateRelative(
  trimmed: string,
  context: UriContext,
  config: UriPolicyConfig | undefined
): UriValidationResult {
  if (context === 'link') {
    return ok(trimmed, null, null);
  }

  const baseUrl = config?.baseUrl;
  if (!baseUrl) return fail('relative-url-not-allowed');

  const baseCheck = validateUri(baseUrl, context, {
    allowedOrigins: config?.allowedOrigins,
    maxDataImageBytes: config?.maxDataImageBytes,
  });
  if (!baseCheck.ok) return fail('base-url-invalid');

  const baseParts = parseAbsoluteParts(baseCheck.canonical);
  if (!baseParts) return fail('base-url-invalid');

  const resolved = resolveRelative(trimmed, baseParts);
  return validateUri(resolved, context, config);
}

// ---------------------------------------------------------------------
// choicesByUrl JSON-time lint (design: "(a) JSON-time lint: substitutions
// forbidden in scheme/authority/port positions"). Request-time validation
// of the fully-resolved URL is just `validateUri(resolved, 'choicesByUrl',
// config)` — no separate function needed for that half.
// ---------------------------------------------------------------------

export interface ChoicesByUrlLintResult {
  ok: boolean;
  reason?: string;
}

export function lintChoicesByUrlTemplate(
  template: string
): ChoicesByUrlLintResult {
  if (typeof template !== 'string' || template.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  // The substring (if any) that must not contain a `{` substitution
  // placeholder: the scheme token, and/or the authority up to the next
  // `/`, `?`, or `#`. `null` means the template has no scheme/authority
  // component at all (a schemeless relative-path reference), in which
  // case a placeholder anywhere is safely confined to the path.
  let authorityRegion: string | null = null;

  const schemeMatch = SCHEME_PATTERN.exec(template);
  if (schemeMatch) {
    const rest = schemeMatch[2]!;
    authorityRegion = rest.startsWith('//')
      ? schemeMatch[1] + '://' + firstSegment(rest.slice(2))
      : schemeMatch[1] + ':'; // opaque scheme (mailto:-shaped), the token itself is injectable
  } else if (template.startsWith('//')) {
    // Protocol-relative: still has an authority component.
    authorityRegion = '//' + firstSegment(template.slice(2));
  } else {
    // No letter-starting scheme match at all — covers the case where the
    // SCHEME ITSELF is a placeholder, e.g. `{scheme}://host/items`: the
    // whole prefix up to and including the authority is suspect.
    const schemeSepIdx = template.indexOf('://');
    if (schemeSepIdx !== -1) {
      authorityRegion =
        template.slice(0, schemeSepIdx) +
        '://' +
        firstSegment(template.slice(schemeSepIdx + 3));
    }
  }

  if (authorityRegion !== null && authorityRegion.includes('{')) {
    return { ok: false, reason: 'substitution-in-authority-position' };
  }
  return { ok: true };
}

/** Returns the leading substring of `text` up to (not including) the
 * first `/`, `?`, or `#` — `text` must already have any scheme/`//`
 * prefix stripped by the caller. */
function firstSegment(text: string): string {
  let end = text.length;
  for (const marker of ['/', '?', '#']) {
    const idx = text.indexOf(marker);
    if (idx !== -1 && idx < end) end = idx;
  }
  return text.slice(0, end);
}
