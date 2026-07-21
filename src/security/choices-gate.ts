/**
 * choicesByUrl request-time gate (A11 follow-through; closes the
 * DIFFERENCES.md "request-time abort/redirect gate ... remains a tracked
 * TODO" gap).
 *
 * The JSON preflight (`json-preflight.ts`) strips disallowed URLs BEFORE
 * `new Model()`, but it is a construction-time check on authored JSON: it
 * cannot see post-construction model mutation (`question.choicesByUrl.url
 * = ...` re-runs the request), and it never runs for host-constructed
 * models. This module adds the REQUEST-TIME layer: a composing global
 * hook on `settings.web.onBeforeRequestChoices` — the ONLY seam
 * survey-core exposes that runs per request, including requests fired
 * synchronously inside the `Model` constructor (pinned 2.5.33
 * `ChoicesRestful.sendXmlHttpRequest`: `xhr.open` → `xhr.onload = ...` →
 * `onBeforeRequestChoices(this, {url, request})` → `beforeSendRequest()`
 * → `options.request.send()`).
 *
 * Enforcement per gated request (same policy source as every other sink:
 * `validateUri(url, 'choicesByUrl', config)` — one source of truth):
 *
 * - REQUEST-TIME ORIGIN GATE — `options.url` is the fully text-processed
 *   request-time URL. On violation the request NEVER fires: the XHR path
 *   swaps `options.request` for an inert stub (the URL is baked into the
 *   abandoned xhr — core only calls `options.request.send()`, so no
 *   network I/O occurs); the stub's `send` delivers the fail-closed
 *   contract on a microtask through core's own private-but-real error
 *   path (`beforeLoadRequest` + `onError` → `WebRequestError`, EMPTY
 *   choices via `doEmptyResultCallback`, `unregisterSameRequests` so the
 *   same-request dedupe registry never hangs). The fetch path (Jest/Node
 *   only — RN always defines XMLHttpRequest) gets a pre-aborted
 *   `AbortSignal` (fetch rejects without I/O) plus a scheduled
 *   `beforeLoadRequest` because core's fetch `.catch` never resets
 *   `isRunningValue` (pinned quirk).
 *
 * - END-URL REDIRECT GATE (XHR path) — RN follows redirects inside
 *   NSURLSession/OkHttp with no JS callback and no `redirect: 'manual'`,
 *   so PER-HOP validation is impossible. The achievable fail-closed
 *   mechanism is post-response end-URL validation: the gate wraps the
 *   core-assigned `request.onload` and validates `xhr.responseURL` (RN
 *   populates it from the native stack on both platforms). Off-allowlist
 *   (or unavailable) end URL → the payload is DISCARDED — core's `onload`
 *   never runs, so nothing is parsed and nothing enters the items cache —
 *   and the same fail-closed error path delivers empty choices + a
 *   structured diagnostic. Residual (documented in DIFFERENCES.md): the
 *   GET to the redirect target has already egressed at the native layer
 *   by validation time; the gate prevents the data entering the model,
 *   not the hop itself.
 *
 * WHO is gated: requests fired inside a `runWithConstructionUriPolicy`
 * window (the Survey root wraps its json-path `new Model()` — requests
 * fire before the model instance exists to key a registry, so a
 * synchronous construction-context stack carries the config), and
 * requests whose `sender.getSurvey()` resolves to a model registered via
 * `registerModelUriPolicy` (the Survey root registers its model for
 * runtime re-runs). Anything else — a host-constructed model never
 * handed to `<Survey uriPolicy>` — keeps the documented "trusted/
 * prevalidated by the host" contract and passes through untouched.
 *
 * COMPOSITION: SurveyJS documents this hook for host auth headers; the
 * gate captures any pre-existing hook at install and invokes it only
 * AFTER the gate passes (never for blocked requests). Install is
 * idempotent and re-asserted by the Survey root every commit, so a host
 * hook assigned later is chained rather than left displacing the gate; a
 * reentrancy guard makes a host wrapper that calls back into the
 * displaced gate harmless. The last mounted Survey's unmount restores
 * whatever hook was captured.
 *
 * WATCHLIST: `sender.beforeLoadRequest` / `sender.onError` are
 * TS-private but real runtime methods on the pinned 2.5.33 build —
 * tracked in `src/core/api-surface.ts` (like `_setIsTouch`), pinned
 * behaviorally by `__tests__/choices-gate.test.tsx`.
 */
import { settings } from '../core/facade';
import { validateUri } from './uri-policy';
import type { UriPolicyConfig } from './uri-policy';
import { reportChoicesByUrlBlockedOnce } from '../diagnostics';

type BeforeRequestChoicesHook = (sender: unknown, options: unknown) => void;

interface WebSettingsLike {
  onBeforeRequestChoices?: BeforeRequestChoicesHook;
}

/** Structural view of the `ChoicesRestful` members the gate binds to.
 * `beforeLoadRequest`/`onError` are protected/private in typings but real
 * prototype methods on 2.5.33 (api-surface watchlist rows pin them). */
interface GatedSender {
  beforeLoadRequest(): void;
  onError(status: string, response: string): void;
  getSurvey?(live?: boolean): unknown;
  owner?: { name?: unknown };
}

interface GateXhrLike {
  onload?: (() => void) | null;
  responseURL?: unknown;
  send?: (body?: unknown) => void;
}

interface GateRequestOptions {
  url?: unknown;
  request?: GateXhrLike;
  fetchOptions?: { signal?: unknown } & Record<string, unknown>;
}

/** Synchronous construction-context stack: `new Model(json)` fires
 * choicesByUrl requests before the model instance can be registry-keyed;
 * Model construction is synchronous, so the innermost pushed config
 * governs every request fired inside the window. */
const constructionStack: Array<UriPolicyConfig | undefined> = [];

/** Model → policy registry for runtime RE-runs (dynamic `{placeholder}`
 * URLs re-trigger on value change; hosts mutate `choicesByUrl.url`).
 * WeakMap: entries die with their models. An entry with an `undefined`
 * config is still GATED (fail-closed defaults — mirrors the preflight,
 * which strips everything under the default empty allowlist); a model
 * with NO entry is trusted (documented host contract). */
const modelPolicies = new WeakMap<
  object,
  { config: UriPolicyConfig | undefined }
>();

let chainedHostHook: BeforeRequestChoicesHook | undefined;
let refCount = 0;
let inGate = false;

function getWebSettings(): WebSettingsLike | null {
  const web = (settings as unknown as { web?: WebSettingsLike }).web;
  return web && typeof web === 'object' ? web : null;
}

function readQuestionName(sender: GatedSender): string | undefined {
  const name = sender.owner?.name;
  return typeof name === 'string' ? name : undefined;
}

/** Microtask delivery mirrors real XHR async ordering — core calls
 * `beforeSendRequest()` (isRunning = true) synchronously AFTER the hook
 * returns, so the blocked delivery must land strictly after it.
 * Promise-based rather than `queueMicrotask` for identical typing across
 * the RN/Jest lib configurations; the callback never throws in practice
 * (core's own error path), but a rejection is contained regardless. */
function scheduleMicrotask(callback: () => void): void {
  Promise.resolve()
    .then(callback)
    .catch((error: unknown) => {
      // Last-resort containment; must never propagate an unhandled
      // rejection out of the gate (same posture as reportDiagnostic).
      console.error(
        '[react-native-survey-library] choices gate delivery threw',
        error
      );
    });
}

function resolvePolicy(sender: GatedSender): {
  gated: boolean;
  config?: UriPolicyConfig | undefined;
} {
  if (constructionStack.length > 0) {
    return {
      gated: true,
      config: constructionStack[constructionStack.length - 1],
    };
  }
  const survey =
    typeof sender.getSurvey === 'function' ? sender.getSurvey() : null;
  if (survey !== null && typeof survey === 'object') {
    const entry = modelPolicies.get(survey);
    if (entry) return { gated: true, config: entry.config };
  }
  return { gated: false };
}

function blockRequest(
  sender: GatedSender,
  options: GateRequestOptions,
  url: string,
  reason: string
): void {
  reportChoicesByUrlBlockedOnce(sender as object, {
    code: 'choices-by-url-blocked',
    phase: 'request',
    url,
    requestUrl: url,
    reason,
    questionName: readQuestionName(sender),
  });
  const deliverBlocked = (): void => {
    // Core's own error path delivers the whole fail-closed contract:
    // WebRequestError on the sender, EMPTY choices via
    // doEmptyResultCallback, and unregisterSameRequests so the dedupe
    // registry (and any queued same-hash waiters) resolve cleanly.
    sender.beforeLoadRequest();
    sender.onError('blocked-by-uri-policy: ' + reason, '');
  };
  if (options.request) {
    // XHR path: the URL was baked into the (now abandoned) xhr by
    // core's `xhr.open` BEFORE this hook ran — mutating `options.url`
    // would be a silent no-op. Swapping the request object is the only
    // send-prevention seam; core's remaining touch is
    // `options.request.send()`. Microtask delivery mirrors real XHR
    // async ordering (core calls `beforeSendRequest()` after the hook).
    options.request = {
      send: (): void => {
        scheduleMicrotask(deliverBlocked);
      },
    };
    return;
  }
  // fetch path (Jest/Node only; RN never takes it): a pre-aborted signal
  // makes fetch reject without any network I/O; core's `.catch` routes to
  // `onError` but never calls `beforeLoadRequest` (pinned quirk — the
  // question would report isRunningChoices forever), so schedule it here.
  const fetchOptions = options.fetchOptions ?? {};
  options.fetchOptions = fetchOptions;
  if (typeof AbortController === 'function') {
    const controller = new AbortController();
    controller.abort();
    fetchOptions.signal = controller.signal;
  } else {
    // No AbortController in this runtime: force a scheme fetch rejects.
    options.url = 'about:blocked-by-uri-policy';
  }
  scheduleMicrotask(() => {
    sender.beforeLoadRequest();
  });
}

function blockLoadedResponse(
  sender: GatedSender,
  endUrl: string,
  requestUrl: string,
  reason: string
): void {
  reportChoicesByUrlBlockedOnce(sender as object, {
    code: 'choices-by-url-blocked',
    phase: 'redirect',
    url: endUrl,
    requestUrl,
    reason,
    questionName: readQuestionName(sender),
  });
  sender.beforeLoadRequest();
  sender.onError('blocked-by-uri-policy-redirect: ' + reason, '');
}

/** Wraps the core-assigned `request.onload` (assigned BEFORE the hook
 * fires — pinned call order) with the end-URL validation. Runs AFTER the
 * chained host hook so the wrap lands on the final request object. */
function armEndUrlGate(
  sender: GatedSender,
  options: GateRequestOptions,
  config: UriPolicyConfig | undefined,
  requestUrl: string
): void {
  const request = options.request;
  if (!request) return; // fetch path: no post-response seam (Node-only).
  const coreOnload = request.onload;
  if (typeof coreOnload !== 'function') return;
  request.onload = (): void => {
    const endUrlRaw = request.responseURL;
    const endUrl = typeof endUrlRaw === 'string' ? endUrlRaw : '';
    if (endUrl.length === 0) {
      // No end URL to validate — fail closed rather than trust blindly.
      blockLoadedResponse(
        sender,
        endUrl,
        requestUrl,
        'response-url-unavailable'
      );
      return;
    }
    const verdict = validateUri(endUrl, 'choicesByUrl', config);
    if (!verdict.ok) {
      // DISCARD: core's onload never runs — the body is never parsed,
      // never cached, never reaches the question.
      blockLoadedResponse(sender, endUrl, requestUrl, verdict.reason);
      return;
    }
    coreOnload.call(request);
  };
}

function gateImpl(senderRaw: unknown, optionsRaw: unknown): void {
  const sender = senderRaw as GatedSender;
  const options = (optionsRaw ?? {}) as GateRequestOptions;
  const { gated, config } = resolvePolicy(sender);
  if (!gated) {
    chainedHostHook?.(senderRaw, optionsRaw);
    return;
  }
  const url = typeof options.url === 'string' ? options.url : '';
  const verdict = validateUri(url, 'choicesByUrl', config);
  if (!verdict.ok) {
    // Host hook deliberately NOT called for a blocked request — it exists
    // to decorate real requests (auth headers), and must not resurrect one.
    blockRequest(sender, options, url, verdict.reason);
    return;
  }
  chainedHostHook?.(senderRaw, optionsRaw);
  armEndUrlGate(sender, options, config, url);
}

const gate: BeforeRequestChoicesHook = (senderRaw, optionsRaw) => {
  // Reentrancy guard: a host wrapper that captured a reference to this
  // gate and calls back into it must not recurse into double validation.
  if (inGate) return;
  inGate = true;
  try {
    gateImpl(senderRaw, optionsRaw);
  } finally {
    inGate = false;
  }
};

/**
 * Idempotent arm. A pre-existing hook (SurveyJS-documented host seam for
 * auth headers — including core's default no-op) is captured ONCE, at
 * first install, and chained after the gate passes; when a host hook
 * displaced the gate, re-asserting captures the DISPLACING hook as the
 * new chain target (the previous capture was already inside it or
 * abandoned by the host's own assignment).
 */
export function installChoicesByUrlGate(): void {
  const web = getWebSettings();
  if (!web) return;
  const current = web.onBeforeRequestChoices;
  if (current === gate) return;
  chainedHostHook = typeof current === 'function' ? current : undefined;
  web.onBeforeRequestChoices = gate;
}

/** Mount-scoped refcount: each `<Survey>` acquires on mount and releases
 * on unmount; the LAST release restores the captured hook (teardown), so
 * multiple concurrently mounted Surveys share the gate safely. */
export function acquireChoicesByUrlGate(): void {
  refCount += 1;
  installChoicesByUrlGate();
}

export function releaseChoicesByUrlGate(): void {
  if (refCount > 0) refCount -= 1;
  if (refCount !== 0) return;
  const web = getWebSettings();
  if (web && web.onBeforeRequestChoices === gate) {
    web.onBeforeRequestChoices = chainedHostHook;
  }
  chainedHostHook = undefined;
}

/** Registers `model`'s runtime re-runs for gating. `config` may be
 * `undefined` — still gated, with the fail-closed defaults. */
export function registerModelUriPolicy(
  model: object,
  config: UriPolicyConfig | undefined
): void {
  modelPolicies.set(model, { config });
}

/** Returns `model` to the documented trusted-by-host contract. */
export function unregisterModelUriPolicy(model: object): void {
  modelPolicies.delete(model);
}

/**
 * Arms the gate and runs `build` (synchronous — `new Model(json)`) with
 * `config` governing every choicesByUrl request fired inside the window.
 * Exported for hosts on the `model` path that want construction-time
 * gating for models they build themselves (pair with
 * `registerModelUriPolicy` for runtime re-runs).
 */
export function runWithConstructionUriPolicy<T>(
  config: UriPolicyConfig | undefined,
  build: () => T
): T {
  installChoicesByUrlGate();
  constructionStack.push(config);
  try {
    return build();
  } finally {
    constructionStack.pop();
  }
}

/** Test-only: clears module state (never exported from the package). */
export function resetChoicesByUrlGateForTests(): void {
  refCount = 0;
  chainedHostHook = undefined;
  inGate = false;
  constructionStack.length = 0;
}
