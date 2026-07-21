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
 * - CACHE-DELIVERY GATE (security review finding 1) — core's `run()`
 *   consults the static `itemsResult` cache and the `sendingSameRequests`
 *   coalescing registry BEFORE `sendRequest()`, so both deliver choices
 *   without this hook ever firing. The gate wraps those two statics
 *   (installed/restored with the hook): a gated sender is served from
 *   the cache only when its OWN policy passes the request URL AND the
 *   entry's recorded end-URL provenance; gated senders never coalesce.
 *   See `wrappedGetCachedItemsResult`/`wrappedAddSameRequest`.
 *
 * DIAGNOSTICS: blocked-URL payload fields are REDACTED (scheme + host +
 * truncated path — userinfo/query/fragment stripped) so embedded
 * credentials or query tokens never reach the console or a host handler;
 * dedupe still keys on the raw URL. A THROWING `validateUri` (hostile
 * host config) is a violation (`'uri-policy-error'`), never a propagated
 * exception.
 *
 * WATCHLIST: `sender.beforeLoadRequest` / `sender.onError` /
 * `sender.processedUrl` / `sender.objHash` and the statics
 * `getCachedItemsResult` / `addSameRequest` are TS-private/protected but
 * real on the pinned 2.5.33 build — tracked in `src/core/api-surface.ts`
 * (like `_setIsTouch`), pinned behaviorally by
 * `__tests__/choices-gate.test.tsx`.
 */
import { ChoicesRestful, settings } from '../core/facade';
import { redactUriForDiagnostics, validateUri } from './uri-policy';
import type { UriPolicyConfig, UriValidationResult } from './uri-policy';
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
  /** The fully text-processed request URL — set by `run()` BEFORE the
   * cache/coalescing lookups, so it is readable at cache-delivery time. */
  processedUrl?: unknown;
  /** Core's cache/coalescing key (`itemsResult`/`sendingSameRequests`). */
  objHash?: unknown;
}

/** Structural view of the private-in-typings STATICS core's `run()`
 * consults BEFORE `sendRequest()` — i.e. before the request-time hook can
 * fire. Both are delivery paths that must be gated separately (security
 * review finding 1); api-surface watchlist rows pin them. */
interface ChoicesRestfulCacheStatics {
  getCachedItemsResult(obj: unknown): boolean;
  addSameRequest(obj: unknown): boolean;
}

const cacheStatics = ChoicesRestful as unknown as ChoicesRestfulCacheStatics;

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

/** Senders with a gate frame currently on the synchronous call stack.
 * Same-sender re-entry (a host wrapper calling the displaced gate back
 * for the SAME request) is skipped — the outer frame already validated
 * it, and skipping is what breaks the recursion. A DIFFERENT sender's
 * request fired synchronously from inside the chained host hook gets its
 * own full validation frame (security review finding 4 — the old global
 * boolean guard let such a request through UNVALIDATED). */
const activeGateSenders: unknown[] = [];

/** `objHash` → final (post-redirect) end URL, recorded when a GATED
 * request's payload passed the end-URL check and was handed to core (the
 * only moment the payload can enter core's static `itemsResult` cache).
 * Cache-delivery provenance: a gated sender may consume a cached payload
 * only when its OWN policy passes both the request URL and this recorded
 * end URL; an entry with no record here (cached by a trusted/ungated
 * survey, or by the Node-only fetch path) is refetched instead — fail
 * closed, never served blind. Growth is bounded by distinct request
 * hashes — the same bound as core's own static `itemsResult` — and the
 * map is cleared when the last Survey releases the gate. */
const endUrlByHash = new Map<string, string>();

let originalGetCachedItemsResult: ((obj: unknown) => boolean) | undefined;
let originalAddSameRequest: ((obj: unknown) => boolean) | undefined;

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

/** `validateUri` guarded fail-CLOSED: a THROW (hostile/broken host
 * config object) is a violation with the stable reason
 * `'uri-policy-error'`, never a propagated exception into core's request
 * path or an XHR onload callback (security review finding 4). */
function safeValidateUri(
  url: string,
  config: UriPolicyConfig | undefined
): UriValidationResult {
  try {
    return validateUri(url, 'choicesByUrl', config);
  } catch {
    return { ok: false, reason: 'uri-policy-error' };
  }
}

function readProcessedUrl(sender: GatedSender): string {
  return typeof sender.processedUrl === 'string' ? sender.processedUrl : '';
}

function readObjHash(sender: GatedSender): string | undefined {
  return typeof sender.objHash === 'string' ? sender.objHash : undefined;
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

/**
 * Cache-delivery gate (security review finding 1). Core's `run()` calls
 * `getCachedItemsResult` (static results cache) and `addSameRequest`
 * (same-request coalescing) BEFORE `sendRequest()` — both hand choices to
 * a question without the request-time hook ever firing. These wrappers
 * (installed/restored with the hook) close that bypass for GATED senders;
 * ungated senders defer to core untouched:
 *
 * - Cache read: served only when the requesting sender's OWN policy
 *   passes the request URL AND the entry's recorded end-URL provenance
 *   (`endUrlByHash`). A failing/unknown check returns `false` WITHOUT
 *   delivering — `run()` then falls through to `sendRequest()`, where the
 *   request-time gate either fires a fresh, fully gated request (refetch)
 *   or blocks it with the full fail-closed contract (empty choices +
 *   diagnostic). No blocking/reporting happens here — the downstream gate
 *   owns that, keeping one enforcement path.
 * - Coalescing: gated senders NEVER register as same-request waiters (the
 *   in-flight request they would join may be ungated or under a different
 *   policy, and its delivery bypasses the hook). Each fires its own fully
 *   gated request; the rare duplicate concurrent GET is the documented
 *   cost. Returning `false` without touching core's registry also means
 *   gated senders never become coalescing leaders — a later trusted
 *   sender simply fires its own request (no hang).
 */
function wrappedGetCachedItemsResult(obj: unknown): boolean {
  const original = originalGetCachedItemsResult;
  if (!original) return false;
  const sender = obj as GatedSender;
  const { gated, config } = resolvePolicy(sender);
  if (!gated) return original(obj);
  const verdict = safeValidateUri(readProcessedUrl(sender), config);
  if (!verdict.ok) return false;
  const hash = readObjHash(sender);
  const endUrl = hash !== undefined ? endUrlByHash.get(hash) : undefined;
  if (endUrl === undefined) return false;
  const endVerdict = safeValidateUri(endUrl, config);
  if (!endVerdict.ok) return false;
  return original(obj);
}

function wrappedAddSameRequest(obj: unknown): boolean {
  const original = originalAddSameRequest;
  if (!original) return false;
  const { gated } = resolvePolicy(obj as GatedSender);
  if (!gated) return original(obj);
  return false;
}

function installCacheDeliveryGate(): void {
  if (cacheStatics.getCachedItemsResult !== wrappedGetCachedItemsResult) {
    originalGetCachedItemsResult =
      cacheStatics.getCachedItemsResult.bind(ChoicesRestful);
    cacheStatics.getCachedItemsResult = wrappedGetCachedItemsResult;
  }
  if (cacheStatics.addSameRequest !== wrappedAddSameRequest) {
    originalAddSameRequest = cacheStatics.addSameRequest.bind(ChoicesRestful);
    cacheStatics.addSameRequest = wrappedAddSameRequest;
  }
}

function uninstallCacheDeliveryGate(): void {
  if (
    originalGetCachedItemsResult &&
    cacheStatics.getCachedItemsResult === wrappedGetCachedItemsResult
  ) {
    cacheStatics.getCachedItemsResult = originalGetCachedItemsResult;
  }
  if (
    originalAddSameRequest &&
    cacheStatics.addSameRequest === wrappedAddSameRequest
  ) {
    cacheStatics.addSameRequest = originalAddSameRequest;
  }
  originalGetCachedItemsResult = undefined;
  originalAddSameRequest = undefined;
  endUrlByHash.clear();
}

function blockRequest(
  sender: GatedSender,
  options: GateRequestOptions,
  url: string,
  reason: string
): void {
  // URL fields are REDACTED (scheme + host + truncated path; userinfo/
  // query/fragment stripped — where credentials and tokens live); the
  // dedupe key keeps the RAW url so distinct blocked URLs that redact
  // alike still each report once (security review finding 3).
  reportChoicesByUrlBlockedOnce(
    sender as object,
    {
      code: 'choices-by-url-blocked',
      phase: 'request',
      url: redactUriForDiagnostics(url),
      requestUrl: redactUriForDiagnostics(url),
      reason,
      questionName: readQuestionName(sender),
    },
    'request|' + url + '|' + reason
  );
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
  reportChoicesByUrlBlockedOnce(
    sender as object,
    {
      code: 'choices-by-url-blocked',
      phase: 'redirect',
      url: redactUriForDiagnostics(endUrl),
      requestUrl: redactUriForDiagnostics(requestUrl),
      reason,
      questionName: readQuestionName(sender),
    },
    'redirect|' + endUrl + '|' + reason
  );
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
  // Captured NOW (core keys its own itemsResult write to the same
  // send-time hash via `loadingObjHash`) — the sender's URL may have
  // been mutated again by response time.
  const hashAtSend = readObjHash(sender);
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
    const verdict = safeValidateUri(endUrl, config);
    if (!verdict.ok) {
      // DISCARD: core's onload never runs — the body is never parsed,
      // never cached, never reaches the question.
      blockLoadedResponse(sender, endUrl, requestUrl, verdict.reason);
      return;
    }
    // Record cache provenance BEFORE handing over to core (whose onLoad
    // is the write into the static itemsResult cache): future gated
    // cache reads re-validate this end URL under THEIR OWN policy.
    if (hashAtSend !== undefined) endUrlByHash.set(hashAtSend, endUrl);
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
  const verdict = safeValidateUri(url, config);
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
  // Reentrancy guard, scoped PER SENDER: a host wrapper that captured a
  // reference to this gate and calls back into it for the SAME request
  // is skipped (the outer frame already validated it; skipping breaks
  // the recursion). A DIFFERENT sender's request fired synchronously
  // from inside the chained host hook still gets full validation — a
  // global boolean here would let it through ungated (finding 4).
  if (activeGateSenders.indexOf(senderRaw) !== -1) return;
  activeGateSenders.push(senderRaw);
  try {
    gateImpl(senderRaw, optionsRaw);
  } finally {
    activeGateSenders.pop();
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
  installCacheDeliveryGate();
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
  uninstallCacheDeliveryGate();
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
  activeGateSenders.length = 0;
  constructionStack.length = 0;
  uninstallCacheDeliveryGate();
}
