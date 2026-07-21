/**
 * choicesByUrl request-time gate (design: probe-verified seam on
 * `settings.web.onBeforeRequestChoices`, docs/DIFFERENCES.md "json-path
 * URLs are policy-checked..." section).
 *
 * The JSON preflight strips disallowed URLs BEFORE `new Model()` — but it
 * cannot see post-construction model mutation, and it never runs for
 * host-constructed models. These suites pin the REQUEST-TIME enforcement:
 * every gated `ChoicesRestful` request URL passes the same central URI
 * policy (`validateUri(url, 'choicesByUrl', config)`) at the moment the
 * request would fire, and the XHR path additionally validates the
 * response's END URL (`xhr.responseURL` — RN populates it natively) so a
 * redirect landing off-allowlist discards the payload fail-closed.
 *
 * The XHR path is the RN runtime path (RN always defines global
 * XMLHttpRequest); Jest/Node has no XHR global, so a FakeXHR pins it —
 * REQUIRED, because hook-URL mutation is honored only in the fetch path
 * and an implementation that "rewrites options.url" would pass fetch-path
 * tests while silently failing on device.
 */
import * as React from 'react';
import { render, act } from '@testing-library/react-native';

import { ChoicesRestful, Model, settings } from '../../core/facade';
import { Survey } from '../../survey/Survey';
import type { SurveyRefHandle } from '../../survey/Survey';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';
import {
  installChoicesByUrlGate,
  registerModelUriPolicy,
  runWithConstructionUriPolicy,
  resetChoicesByUrlGateForTests,
} from '../choices-gate';
import type { UriPolicyConfig } from '../uri-policy';

// ---------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------

type OnLoadHandler = (() => void) | null;

/** Minimal XHR double matching the members core's `sendXmlHttpRequest`
 * touches (open/setRequestHeader/onload/send/status/response/statusText)
 * plus `responseURL` for the end-URL gate. Blocked requests never reach
 * `send` on a REAL instance (the gate swaps in an inert stub), so
 * `FakeXHR.sent` is the "did network I/O start" observable. */
class FakeXHR {
  static created: FakeXHR[] = [];
  static sent: FakeXHR[] = [];
  static reset(): void {
    FakeXHR.created = [];
    FakeXHR.sent = [];
  }
  method = '';
  url = '';
  status = 0;
  statusText = '';
  response = '';
  responseText = '';
  responseURL = '';
  headers: Record<string, string> = {};
  onload: OnLoadHandler = null;
  constructor() {
    FakeXHR.created.push(this);
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(): void {
    FakeXHR.sent.push(this);
  }
  respond(status: number, body: string, responseURL: string): void {
    this.status = status;
    this.statusText = status === 200 ? 'OK' : 'Error';
    this.response = body;
    this.responseText = body;
    this.responseURL = responseURL;
    this.onload?.();
  }
}

const g = globalThis as { XMLHttpRequest?: unknown; fetch?: unknown };

const originalHook = settings.web.onBeforeRequestChoices;

const ALLOW: UriPolicyConfig = {
  allowedOrigins: ['https://api.example.com'],
};

let urlCounter = 0;
const allowedUrl = (): string =>
  `https://api.example.com/items-${++urlCounter}`;
const evilUrl = (): string => `https://evil.example/items-${++urlCounter}`;

interface ChoicesJson {
  elements: Array<{
    type: string;
    name: string;
    choicesByUrl: { url: string };
  }>;
}

const jsonWithUrl = (url: string): ChoicesJson => ({
  elements: [{ type: 'dropdown', name: 'q1', choicesByUrl: { url } }],
});

/** Loose runtime view of the question for members that are protected in
 * typings but real (and stable) on the pinned 2.5.33 build. */
interface DropdownRuntime {
  visibleChoices: Array<{ value: unknown }>;
  choicesByUrl: { url: string; error: unknown };
  isRunningChoices: boolean;
  runChoicesByUrl(): void;
}

function dropdownRuntime(model: unknown, name = 'q1'): DropdownRuntime {
  return (model as { getQuestionByName(n: string): unknown }).getQuestionByName(
    name
  ) as DropdownRuntime;
}

function captureDiagnostics(): DiagnosticPayload[] {
  const seen: DiagnosticPayload[] = [];
  setDiagnosticHandler((payload) => seen.push(payload));
  return seen;
}

function blockedDiagnostics(seen: DiagnosticPayload[]): DiagnosticPayload[] {
  return seen.filter((p) => p.code === 'choices-by-url-blocked');
}

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

afterEach(() => {
  setDiagnosticHandler(undefined);
  settings.web.onBeforeRequestChoices = originalHook;
  resetChoicesByUrlGateForTests();
});

// ---------------------------------------------------------------------
// XHR path (the RN runtime path)
// ---------------------------------------------------------------------

describe('choicesByUrl gate — XHR request-time origin enforcement', () => {
  beforeEach(() => {
    FakeXHR.reset();
    g.XMLHttpRequest = FakeXHR;
  });
  afterEach(() => {
    delete g.XMLHttpRequest;
  });

  it('allowed URL passes through and loads choices', () => {
    const url = allowedUrl();
    const model = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    expect(FakeXHR.sent).toHaveLength(1);
    expect(FakeXHR.sent[0]!.url).toBe(url);
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), url);
    const q = dropdownRuntime(model);
    expect(q.visibleChoices.map((c) => c.value)).toEqual(['a', 'b']);
    expect(q.isRunningChoices).toBe(false);
  });

  it('disallowed URL at construction never fires a request and fails closed', async () => {
    const seen = captureDiagnostics();
    const url = evilUrl();
    const model = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    expect(FakeXHR.sent).toHaveLength(0);
    await flush();
    const q = dropdownRuntime(model);
    expect(q.visibleChoices).toHaveLength(0);
    expect(q.isRunningChoices).toBe(false);
    expect(q.choicesByUrl.error).toBeTruthy();
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({
        code: 'choices-by-url-blocked',
        phase: 'request',
        url,
        requestUrl: url,
        reason: 'origin-not-allowlisted',
        questionName: 'q1',
      }),
    ]);
  });

  it('relative URL without a policy baseUrl is blocked fail-closed', async () => {
    const seen = captureDiagnostics();
    runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl('items/relative-no-base'))
    );
    expect(FakeXHR.sent).toHaveLength(0);
    await flush();
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({
        phase: 'request',
        reason: 'relative-url-not-allowed',
      }),
    ]);
  });

  it('relative URL resolving against an allowlisted baseUrl passes', () => {
    runWithConstructionUriPolicy(
      { ...ALLOW, baseUrl: 'https://api.example.com/v1/' },
      () => new Model(jsonWithUrl('relative-with-base'))
    );
    expect(FakeXHR.sent).toHaveLength(1);
  });

  it('runtime re-runs are gated through the model registry (post-construction mutation)', async () => {
    const seen = captureDiagnostics();
    const url = allowedUrl();
    const model = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    registerModelUriPolicy(model as object, ALLOW);
    expect(FakeXHR.sent).toHaveLength(1);
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a']), url);
    const q = dropdownRuntime(model);
    expect(q.visibleChoices).toHaveLength(1);
    const evil = evilUrl();
    q.choicesByUrl.url = evil;
    q.runChoicesByUrl();
    expect(FakeXHR.sent).toHaveLength(1);
    await flush();
    expect(q.visibleChoices).toHaveLength(0);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({ phase: 'request', url: evil }),
    ]);
  });

  it('dedupes the blocked diagnostic per (sender, url) across re-runs', async () => {
    const seen = captureDiagnostics();
    const url = allowedUrl();
    const model = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    registerModelUriPolicy(model as object, ALLOW);
    const q = dropdownRuntime(model);
    const evilA = evilUrl();
    const evilB = evilUrl();
    for (const next of [evilA, evilB, evilA]) {
      q.choicesByUrl.url = next;
      q.runChoicesByUrl();
    }
    await flush();
    expect(FakeXHR.sent).toHaveLength(1);
    const codes = blockedDiagnostics(seen).map(
      (p) => (p as { url?: string }).url
    );
    expect(codes).toEqual([evilA, evilB]);
  });

  it('chains a pre-existing host hook AFTER the gate passes and skips it on block', () => {
    captureDiagnostics();
    const hostHook = jest.fn((_s: unknown, options: { request?: FakeXHR }) => {
      options.request?.setRequestHeader('X-Auth', 'token');
    });
    settings.web.onBeforeRequestChoices =
      hostHook as typeof settings.web.onBeforeRequestChoices;
    installChoicesByUrlGate();
    const okUrl = allowedUrl();
    runWithConstructionUriPolicy(ALLOW, () => new Model(jsonWithUrl(okUrl)));
    expect(hostHook).toHaveBeenCalledTimes(1);
    expect(FakeXHR.sent).toHaveLength(1);
    expect(FakeXHR.sent[0]!.headers['X-Auth']).toBe('token');
    runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(evilUrl()))
    );
    expect(hostHook).toHaveBeenCalledTimes(1);
    expect(FakeXHR.sent).toHaveLength(1);
  });

  it('install is idempotent and re-asserts over a later host hook without self-capture', () => {
    captureDiagnostics();
    installChoicesByUrlGate();
    installChoicesByUrlGate();
    const hostHook = jest.fn();
    settings.web.onBeforeRequestChoices =
      hostHook as typeof settings.web.onBeforeRequestChoices;
    installChoicesByUrlGate();
    runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(allowedUrl()))
    );
    expect(hostHook).toHaveBeenCalledTimes(1);
    expect(FakeXHR.sent).toHaveLength(1);
    runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(evilUrl()))
    );
    expect(hostHook).toHaveBeenCalledTimes(1);
    expect(FakeXHR.sent).toHaveLength(1);
  });

  it('an unregistered (host-constructed) model stays trusted — documented boundary', () => {
    const model = new Model(jsonWithUrl(evilUrl()));
    expect(FakeXHR.sent).toHaveLength(1);
    // The ungated request is genuinely in flight (nothing defused it).
    expect(dropdownRuntime(model).isRunningChoices).toBe(true);
  });
});

describe('choicesByUrl gate — end-URL redirect enforcement (XHR path)', () => {
  beforeEach(() => {
    FakeXHR.reset();
    g.XMLHttpRequest = FakeXHR;
  });
  afterEach(() => {
    delete g.XMLHttpRequest;
  });

  it('discards the payload when the response end URL is off-allowlist', () => {
    const seen = captureDiagnostics();
    const url = allowedUrl();
    const model = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    expect(FakeXHR.sent).toHaveLength(1);
    const finalUrl = 'https://evil.example/final';
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), finalUrl);
    const q = dropdownRuntime(model);
    expect(q.visibleChoices).toHaveLength(0);
    expect(q.isRunningChoices).toBe(false);
    expect(q.choicesByUrl.error).toBeTruthy();
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({
        phase: 'redirect',
        url: finalUrl,
        requestUrl: url,
        reason: 'origin-not-allowlisted',
        questionName: 'q1',
      }),
    ]);
  });

  it('accepts a redirect that stays on an allowlisted origin', () => {
    const url = allowedUrl();
    const model = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    FakeXHR.sent[0]!.respond(
      200,
      JSON.stringify(['a', 'b']),
      'https://api.example.com/moved-here'
    );
    expect(dropdownRuntime(model).visibleChoices).toHaveLength(2);
  });

  it('fails closed when the runtime exposes no responseURL', () => {
    const seen = captureDiagnostics();
    const url = allowedUrl();
    const model = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), '');
    expect(dropdownRuntime(model).visibleChoices).toHaveLength(0);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({
        phase: 'redirect',
        reason: 'response-url-unavailable',
      }),
    ]);
  });
});

// ---------------------------------------------------------------------
// fetch path (Jest/Node only — RN always has XMLHttpRequest)
// ---------------------------------------------------------------------

describe('choicesByUrl gate — fetch path (Node-only fallback)', () => {
  const originalFetch = g.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    delete g.XMLHttpRequest;
    fetchMock = jest.fn(
      (_url: string, init?: { signal?: { aborted?: boolean } }) => {
        if (init?.signal?.aborted) {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          return Promise.reject(error);
        }
        return Promise.resolve({
          status: 200,
          statusText: 'OK',
          text: () => Promise.resolve(JSON.stringify(['a', 'b'])),
        });
      }
    );
    g.fetch = fetchMock;
  });
  afterEach(() => {
    g.fetch = originalFetch;
  });

  it('allowed URL loads choices through fetch', async () => {
    const url = allowedUrl();
    const model = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dropdownRuntime(model).visibleChoices).toHaveLength(2);
  });

  it('disallowed URL gets a pre-aborted signal (no I/O) and fails closed without a hung isRunning', async () => {
    const seen = captureDiagnostics();
    const model = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(evilUrl()))
    );
    await flush();
    const q = dropdownRuntime(model);
    expect(q.visibleChoices).toHaveLength(0);
    // Core's fetch .catch never resets isRunningValue — the gate must.
    expect(q.isRunningChoices).toBe(false);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({ phase: 'request' }),
    ]);
    const init = fetchMock.mock.calls[0]?.[1] as
      { signal?: { aborted?: boolean } } | undefined;
    expect(init?.signal?.aborted).toBe(true);
  });
});

// ---------------------------------------------------------------------
// <Survey> wiring — automatic, no consumer opt-in
// ---------------------------------------------------------------------

describe('choicesByUrl gate — <Survey> wiring', () => {
  beforeEach(() => {
    FakeXHR.reset();
    g.XMLHttpRequest = FakeXHR;
  });
  afterEach(() => {
    delete g.XMLHttpRequest;
  });

  it('arms automatically on mount; allowed json-path choicesByUrl loads', () => {
    const url = allowedUrl();
    const ref = React.createRef<SurveyRefHandle>();
    render(<Survey json={jsonWithUrl(url)} uriPolicy={ALLOW} ref={ref} />);
    expect(FakeXHR.sent).toHaveLength(1);
    act(() => {
      FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), url);
    });
    expect(dropdownRuntime(ref.current!.model).visibleChoices).toHaveLength(2);
  });

  it('blocks a post-construction URL mutation at request time (json path)', async () => {
    const seen = captureDiagnostics();
    const url = allowedUrl();
    const ref = React.createRef<SurveyRefHandle>();
    render(<Survey json={jsonWithUrl(url)} uriPolicy={ALLOW} ref={ref} />);
    act(() => {
      FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), url);
    });
    const q = dropdownRuntime(ref.current!.model);
    const evil = evilUrl();
    act(() => {
      q.choicesByUrl.url = evil;
      q.runChoicesByUrl();
    });
    expect(FakeXHR.sent).toHaveLength(1);
    await flush();
    expect(q.visibleChoices).toHaveLength(0);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({ phase: 'request', url: evil }),
    ]);
  });

  it('gates runtime re-runs of a host model when uriPolicy is provided', async () => {
    const seen = captureDiagnostics();
    const url = allowedUrl();
    // Host construction happens OUTSIDE any Survey seam — documented as
    // trusted; the request fires ungated.
    const model = new Model(jsonWithUrl(url));
    expect(FakeXHR.sent).toHaveLength(1);
    render(<Survey model={model} uriPolicy={ALLOW} />);
    const q = dropdownRuntime(model);
    act(() => {
      q.choicesByUrl.url = evilUrl();
      q.runChoicesByUrl();
    });
    expect(FakeXHR.sent).toHaveLength(1);
    await flush();
    expect(blockedDiagnostics(seen)).toHaveLength(1);
  });

  it('keeps a host model without uriPolicy trusted (documented contract)', () => {
    const url = allowedUrl();
    const model = new Model(jsonWithUrl(url));
    render(<Survey model={model} />);
    const q = dropdownRuntime(model);
    act(() => {
      q.choicesByUrl.url = evilUrl();
      q.runChoicesByUrl();
    });
    expect(FakeXHR.sent).toHaveLength(2);
  });

  it('a mutation re-run cannot consume a cache entry poisoned by a permissive Survey (mounted path)', async () => {
    ChoicesRestful.clearCache();
    const seen = captureDiagnostics();
    const evil = evilUrl();
    const permissive: UriPolicyConfig = {
      allowedOrigins: ['https://evil.example'],
    };
    // Permissive Survey legitimately loads (and core caches) the payload.
    const first = render(
      <Survey json={jsonWithUrl(evil)} uriPolicy={permissive} />
    );
    expect(FakeXHR.sent).toHaveLength(1);
    act(() => {
      FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), evil);
    });
    first.unmount();
    // Strict Survey: a post-construction mutation re-run to the cached
    // URL must NOT be served the permissive-cached payload.
    const okUrl = allowedUrl();
    const refB = React.createRef<SurveyRefHandle>();
    render(<Survey json={jsonWithUrl(okUrl)} uriPolicy={ALLOW} ref={refB} />);
    act(() => {
      FakeXHR.sent[1]!.respond(200, JSON.stringify(['x']), okUrl);
    });
    const q = dropdownRuntime(refB.current!.model);
    expect(q.visibleChoices).toHaveLength(1);
    act(() => {
      q.choicesByUrl.url = evil;
      q.runChoicesByUrl();
    });
    await flush();
    expect(FakeXHR.sent).toHaveLength(2);
    expect(q.visibleChoices).toHaveLength(0);
    expect(q.isRunningChoices).toBe(false);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({ phase: 'request', url: evil }),
    ]);
    ChoicesRestful.clearCache();
  });

  it('survives multiple mounts and restores the prior hook after the last unmount', async () => {
    const seen = captureDiagnostics();
    const first = render(
      <Survey json={jsonWithUrl(allowedUrl())} uriPolicy={ALLOW} />
    );
    const refB = React.createRef<SurveyRefHandle>();
    const second = render(
      <Survey json={jsonWithUrl(allowedUrl())} uriPolicy={ALLOW} ref={refB} />
    );
    first.unmount();
    // The gate must still be armed for the surviving Survey.
    const q = dropdownRuntime(refB.current!.model);
    act(() => {
      q.choicesByUrl.url = evilUrl();
      q.runChoicesByUrl();
    });
    await flush();
    expect(blockedDiagnostics(seen)).toHaveLength(1);
    second.unmount();
    expect(settings.web.onBeforeRequestChoices).toBe(originalHook);
  });
});

// ---------------------------------------------------------------------
// Static cache + same-request coalescing (security review finding 1):
// core's `run()` consults `ChoicesRestful.itemsResult` (static cache) and
// `sendingSameRequests` (coalescing) BEFORE `sendRequest()` — i.e. before
// the `onBeforeRequestChoices` hook ever fires — so both are delivery
// paths that bypass the request-time gate unless gated separately.
// ---------------------------------------------------------------------

describe('choicesByUrl gate — static cache / coalescing enforcement', () => {
  const PERMISSIVE: UriPolicyConfig = {
    allowedOrigins: ['https://evil.example', 'https://api.example.com'],
  };

  beforeEach(() => {
    FakeXHR.reset();
    g.XMLHttpRequest = FakeXHR;
    ChoicesRestful.clearCache();
  });
  afterEach(() => {
    ChoicesRestful.clearCache();
    delete g.XMLHttpRequest;
  });

  it('a strict-policy survey does NOT receive a permissive-cached payload for a URL its policy blocks', async () => {
    const seen = captureDiagnostics();
    const url = evilUrl();
    // Survey 1: permissive policy loads (and core caches) the payload.
    const permissiveModel = runWithConstructionUriPolicy(
      PERMISSIVE,
      () => new Model(jsonWithUrl(url))
    );
    expect(FakeXHR.sent).toHaveLength(1);
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), url);
    expect(dropdownRuntime(permissiveModel).visibleChoices).toHaveLength(2);
    // Survey 2: strict policy, same URL — the cached payload must NOT be
    // handed over; the block must fail closed exactly like a fired
    // request (empty choices + diagnostic), with no network egress.
    const strictModel = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    await flush();
    expect(FakeXHR.sent).toHaveLength(1);
    const q = dropdownRuntime(strictModel);
    expect(q.visibleChoices).toHaveLength(0);
    expect(q.isRunningChoices).toBe(false);
    expect(q.choicesByUrl.error).toBeTruthy();
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({ phase: 'request', url }),
    ]);
  });

  it('a strict-policy question does NOT coalesce onto an in-flight permissive request', async () => {
    const seen = captureDiagnostics();
    const url = evilUrl();
    // Permissive request goes in flight (no response yet).
    const permissiveModel = runWithConstructionUriPolicy(
      PERMISSIVE,
      () => new Model(jsonWithUrl(url))
    );
    expect(FakeXHR.sent).toHaveLength(1);
    // Strict survey, same URL, while the permissive request is in flight:
    // it must NOT register as a same-request waiter.
    const strictModel = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), url);
    await flush();
    expect(FakeXHR.sent).toHaveLength(1);
    expect(dropdownRuntime(permissiveModel).visibleChoices).toHaveLength(2);
    const q = dropdownRuntime(strictModel);
    expect(q.visibleChoices).toHaveLength(0);
    expect(q.isRunningChoices).toBe(false);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({ phase: 'request', url }),
    ]);
  });

  it('serves the cache between gated surveys under the same-passing policy (no refetch)', () => {
    const url = allowedUrl();
    runWithConstructionUriPolicy(ALLOW, () => new Model(jsonWithUrl(url)));
    expect(FakeXHR.sent).toHaveLength(1);
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), url);
    const second = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    // Cache hit is fine when the requesting survey's own policy passes
    // BOTH the request URL and the recorded end URL.
    expect(FakeXHR.sent).toHaveLength(1);
    expect(dropdownRuntime(second).visibleChoices).toHaveLength(2);
  });

  it('refetches (never serves) a cache entry of unknown provenance (loaded by a trusted survey)', () => {
    const url = allowedUrl();
    // Trusted host model loads UNGATED — its cache entry has no recorded
    // end URL, so its provenance is unknown to any policy.
    installChoicesByUrlGate();
    const trusted = new Model(jsonWithUrl(url));
    expect(FakeXHR.sent).toHaveLength(1);
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), url);
    expect(dropdownRuntime(trusted).visibleChoices).toHaveLength(2);
    // A gated survey must not consume it — it refires (fully gated).
    const gated = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    expect(FakeXHR.sent).toHaveLength(2);
    FakeXHR.sent[1]!.respond(200, JSON.stringify(['a', 'b']), url);
    expect(dropdownRuntime(gated).visibleChoices).toHaveLength(2);
  });

  it('refetches when the cached payload arrived via a redirect the strict policy blocks', async () => {
    const seen = captureDiagnostics();
    const url = allowedUrl();
    const finalUrl = 'https://evil.example/final';
    // Permissive survey: request URL passes BOTH policies, but the
    // response landed on evil.example (allowed under permissive only).
    const permissiveModel = runWithConstructionUriPolicy(
      PERMISSIVE,
      () => new Model(jsonWithUrl(url))
    );
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), finalUrl);
    expect(dropdownRuntime(permissiveModel).visibleChoices).toHaveLength(2);
    // Strict survey: request URL passes, but the cache entry's recorded
    // end URL fails the strict policy — refetch instead of serving it.
    const strictModel = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(url))
    );
    expect(FakeXHR.sent).toHaveLength(2);
    FakeXHR.sent[1]!.respond(200, JSON.stringify(['a', 'b']), finalUrl);
    await flush();
    // The fresh request's own end-URL gate then discards the payload.
    expect(dropdownRuntime(strictModel).visibleChoices).toHaveLength(0);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({ phase: 'redirect', url: finalUrl }),
    ]);
  });
});

// ---------------------------------------------------------------------
// Diagnostic URL redaction (security review finding 3): blocked-URL
// diagnostics must not leak embedded credentials or query/fragment
// secrets to the dev console / host handlers.
// ---------------------------------------------------------------------

describe('choicesByUrl gate — diagnostic URL redaction', () => {
  beforeEach(() => {
    FakeXHR.reset();
    g.XMLHttpRequest = FakeXHR;
    ChoicesRestful.clearCache();
  });
  afterEach(() => {
    ChoicesRestful.clearCache();
    delete g.XMLHttpRequest;
  });

  it('strips userinfo, query, and fragment from the request-phase diagnostic', async () => {
    const seen = captureDiagnostics();
    const secretUrl =
      'https://user:secretpass@evil.example/cb?token=SECRETTOKEN#sekrit';
    runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(secretUrl))
    );
    expect(FakeXHR.sent).toHaveLength(0);
    await flush();
    const blocked = blockedDiagnostics(seen);
    expect(blocked).toHaveLength(1);
    const payload = JSON.stringify(blocked[0]);
    expect(payload).not.toContain('secretpass');
    expect(payload).not.toContain('SECRETTOKEN');
    expect(payload).not.toContain('sekrit');
    expect(blocked[0]).toEqual(
      expect.objectContaining({
        phase: 'request',
        url: 'https://evil.example/cb',
        requestUrl: 'https://evil.example/cb',
      })
    );
  });

  it('truncates long paths and redacts the redirect-phase end URL', async () => {
    const seen = captureDiagnostics();
    const url = allowedUrl();
    runWithConstructionUriPolicy(ALLOW, () => new Model(jsonWithUrl(url)));
    const longPath = '/' + 'a'.repeat(60);
    const finalUrl = `https://evil.example${longPath}?leak=SECRETTOKEN`;
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), finalUrl);
    await flush();
    const blocked = blockedDiagnostics(seen);
    expect(blocked).toHaveLength(1);
    const payload = JSON.stringify(blocked[0]);
    expect(payload).not.toContain('SECRETTOKEN');
    const redacted = (blocked[0] as { url: string }).url;
    expect(redacted.startsWith('https://evil.example/')).toBe(true);
    expect(redacted.length).toBeLessThan(finalUrl.length);
    expect(redacted).not.toContain('?');
  });
});

// ---------------------------------------------------------------------
// Reentrancy + throwing policy (security review finding 4): a synchronous
// re-entrant request fired from inside the chained host hook must still
// be validated, and a THROWING validateUri (hostile/broken config) must
// block fail-closed instead of propagating.
// ---------------------------------------------------------------------

describe('choicesByUrl gate — reentrancy and throwing-policy fail-closed', () => {
  beforeEach(() => {
    FakeXHR.reset();
    g.XMLHttpRequest = FakeXHR;
    ChoicesRestful.clearCache();
  });
  afterEach(() => {
    ChoicesRestful.clearCache();
    delete g.XMLHttpRequest;
  });

  it('validates a DIFFERENT request fired synchronously from inside the chained host hook', async () => {
    const seen = captureDiagnostics();
    const urlB = allowedUrl();
    const modelB = runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(urlB))
    );
    registerModelUriPolicy(modelB as object, ALLOW);
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a']), urlB);
    const qB = dropdownRuntime(modelB);
    const evil = evilUrl();
    let reentered = false;
    const hostHook = jest.fn(() => {
      if (reentered) return;
      reentered = true;
      // Synchronously trigger ANOTHER question's (blocked) request while
      // the gate frame for the first request is still on the stack.
      qB.choicesByUrl.url = evil;
      qB.runChoicesByUrl();
    });
    settings.web.onBeforeRequestChoices =
      hostHook as typeof settings.web.onBeforeRequestChoices;
    installChoicesByUrlGate();
    runWithConstructionUriPolicy(
      ALLOW,
      () => new Model(jsonWithUrl(allowedUrl()))
    );
    await flush();
    // The re-entrant evil request must have been blocked: no evil XHR
    // was ever sent, and the block was reported.
    expect(FakeXHR.sent.map((x) => x.url)).not.toContain(evil);
    expect(qB.visibleChoices).toHaveLength(0);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({ phase: 'request', url: evil }),
    ]);
  });

  it('treats a validateUri THROW at request time as a violation (fail-closed, uri-policy-error)', async () => {
    const seen = captureDiagnostics();
    const throwingConfig = {} as UriPolicyConfig;
    Object.defineProperty(throwingConfig, 'allowedOrigins', {
      configurable: true,
      enumerable: true,
      get(): string[] {
        throw new Error('hostile config');
      },
    });
    const url = allowedUrl();
    let model: unknown;
    expect(() => {
      model = runWithConstructionUriPolicy(
        throwingConfig,
        () => new Model(jsonWithUrl(url))
      );
    }).not.toThrow();
    expect(FakeXHR.sent).toHaveLength(0);
    await flush();
    const q = dropdownRuntime(model);
    expect(q.visibleChoices).toHaveLength(0);
    expect(q.isRunningChoices).toBe(false);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({
        phase: 'request',
        reason: 'uri-policy-error',
      }),
    ]);
  });

  it('treats a validateUri THROW at end-URL time as a violation (payload discarded)', async () => {
    const seen = captureDiagnostics();
    let throwNow = false;
    const flippableConfig = {} as UriPolicyConfig;
    Object.defineProperty(flippableConfig, 'allowedOrigins', {
      configurable: true,
      enumerable: true,
      get(): string[] {
        if (throwNow) throw new Error('hostile config');
        return ['https://api.example.com'];
      },
    });
    const url = allowedUrl();
    const model = runWithConstructionUriPolicy(
      flippableConfig,
      () => new Model(jsonWithUrl(url))
    );
    expect(FakeXHR.sent).toHaveLength(1);
    throwNow = true;
    FakeXHR.sent[0]!.respond(200, JSON.stringify(['a', 'b']), url);
    await flush();
    const q = dropdownRuntime(model);
    expect(q.visibleChoices).toHaveLength(0);
    expect(q.isRunningChoices).toBe(false);
    expect(blockedDiagnostics(seen)).toEqual([
      expect.objectContaining({
        phase: 'redirect',
        reason: 'uri-policy-error',
      }),
    ]);
  });
});
