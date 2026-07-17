/**
 * 2.2 dialog adapter (design docs/design/2.2-dialog-adapter.md v6) —
 * installs a `settings.showDialog` dispatcher that presents core
 * dialogs (delete confirmations, direct `showDialog` consumers) through
 * the per-Survey overlay stack.
 *
 * Ownership model (D2):
 * - ALL installer state lives ON the settings singleton under a
 *   `Symbol.for` brand — a second module epoch (HMR) finds the slot,
 *   swaps `impl`, and shares the token registry instead of stacking
 *   installs or misreading the old dispatcher as a consumer value.
 * - `slot.dispatcher` is the ONLY function ever assigned to
 *   `settings.showDialog`; identity checks compare it exclusively.
 * - INSTALL on 0→1 host registrations (capturing `previous` only when
 *   the current value is not our own dispatcher); RESTORE on 1→0 via
 *   CAS, and only when `previous` was a real consumer function — a
 *   persistent dispatcher beats core throwing on
 *   `settings.showDialog(...)` of `undefined` after unmount.
 * - Tokens own their dialogs: disposal semantically closes every live
 *   registration (cancel sequence → resolve false) BEFORE the
 *   last-token decision is re-read (teardown is a transaction; a
 *   re-entrant registration suppresses restoration).
 */
import { ActionContainer, PopupModel, settings } from '../core/facade';
import { reportDiagnostic } from '../diagnostics';
import type { OverlayStack } from './stack';
import { registerPopup } from './popup-bridge';
import type { OverlayPayload, PopupRegistration } from './popup-bridge';

export const DIALOG_DISPATCHER_SLOT: unique symbol = Symbol.for(
  'rnsl.dialogDispatcher'
) as never;

type ShowDialogFn = (options: unknown, rootElement?: unknown) => unknown;

export interface DialogHostToken {
  readonly stack: OverlayStack<OverlayPayload>;
  readonly registrations: Set<PopupRegistration>;
  disposed: boolean;
  dispose(): void;
}

interface DispatcherSlot {
  dispatcher: ShowDialogFn;
  impl: ShowDialogFn;
  previous: ShowDialogFn | undefined;
  enabled: boolean;
  tokens: DialogHostToken[];
}

type SettingsWithSlot = typeof settings & {
  showDialog?: ShowDialogFn;
  [DIALOG_DISPATCHER_SLOT]?: DispatcherSlot;
};

const mutableSettings = settings as SettingsWithSlot;

let displacementReported = false;

/** Test seam (process-lifetime dedupe, same pattern as the bridge's
 * content-miss reporting). */
export function resetDialogAdapterDiagnostics(): void {
  displacementReported = false;
}

/** Once-per-module-evaluation epoch bind: a stale epoch's later calls
 * must NOT restore its old implementation over a newer epoch's. */
let epochBound = false;

function getOrCreateSlot(): DispatcherSlot {
  let slot = mutableSettings[DIALOG_DISPATCHER_SLOT];
  if (!slot) {
    const created: DispatcherSlot = {
      dispatcher: (options: unknown, rootElement?: unknown) =>
        created.impl(options, rootElement),
      // A fresh slot always dispatches to THIS module's implementation.
      impl: adapterShowDialog,
      previous: undefined,
      enabled: true,
      tokens: [],
    };
    slot = created;
    mutableSettings[DIALOG_DISPATCHER_SLOT] = slot;
    epochBound = true;
  } else if (!epochBound) {
    // First touch of an EXISTING slot from this module evaluation
    // (epoch B under HMR): take over the implementation exactly once —
    // a stale epoch's later calls never rebind.
    epochBound = true;
    slot.impl = adapterShowDialog;
  }
  return slot;
}

function liveTokens(slot: DispatcherSlot): DialogHostToken[] {
  return slot.tokens.filter((token) => !token.disposed);
}

function currentToken(slot: DispatcherSlot): DialogHostToken | null {
  const live = liveTokens(slot);
  return live.length > 0 ? live[live.length - 1]! : null;
}

function installIfNeeded(slot: DispatcherSlot): void {
  if (!slot.enabled) return;
  if (mutableSettings.showDialog === slot.dispatcher) return;
  // Recapture guard (design round 5): a persistent dispatcher must not
  // become its own `previous`.
  const current = mutableSettings.showDialog;
  slot.previous = current === slot.dispatcher ? undefined : current;
  if (typeof slot.previous === 'function' && !displacementReported) {
    displacementReported = true;
    reportDiagnostic({
      code: 'dialog-adapter-displaced-show-dialog',
    });
  }
  mutableSettings.showDialog = slot.dispatcher;
}

function restoreIfLast(slot: DispatcherSlot): void {
  if (liveTokens(slot).length > 0) return;
  // CAS: only restore when we still own the setting, and only restore
  // REAL consumer values — with `previous === undefined` the dispatcher
  // persists so post-unmount core calls hit the no-host fail-safe
  // instead of a TypeError inside core.
  if (
    mutableSettings.showDialog === slot.dispatcher &&
    typeof slot.previous === 'function'
  ) {
    mutableSettings.showDialog = slot.previous;
    slot.previous = undefined;
  }
}

interface DialogOptionsLike {
  componentName: string;
  data: unknown;
  onApply?: () => boolean | void;
  onCancel?: () => void;
  onHide?: () => void;
  onShow?: () => void;
  onDispose?: () => void;
  title?: string;
  displayMode?: string;
  isFocusedContent?: boolean;
  isFocusedContainer?: boolean;
  showCloseButton?: boolean;
  cssClass?: string;
  locale?: string;
}

export interface DialogHandle {
  footerToolbar: InstanceType<typeof ActionContainer>;
  width: string | undefined;
  /** `null` on the detached (no-host) handle. */
  popupModel: InstanceType<typeof PopupModel> | null;
}

const reportedNoHost = new Set<string>();

function detachedHandle(componentName: string): DialogHandle {
  if (!reportedNoHost.has(componentName)) {
    reportedNoHost.add(componentName);
    reportDiagnostic({ code: 'dialog-no-host', componentName });
  }
  // Inert but MUTABLE: upstream showConfirmDialog dereferences
  // getActionById('apply'/'cancel') and assigns title/innerCss —
  // real Action instances whose action() is a no-op.
  const container = new ActionContainer();
  container.setItems([
    { id: 'cancel', title: '', action: () => undefined },
    { id: 'apply', title: '', action: () => undefined },
  ]);
  let width: string | undefined;
  return {
    footerToolbar: container,
    get width() {
      return width;
    },
    set width(value: string | undefined) {
      width = value;
    },
    popupModel: null,
  };
}

/** D3 — presents an IDialogOptions call through the current host's
 * overlay stack; returns the upstream-compatible handle (D4). */
function adapterShowDialog(
  options: unknown,
  _rootElement?: unknown // DOM concept — ignored (D6).
): unknown {
  const opts = options as DialogOptionsLike;
  const slot = getOrCreateSlot();
  const token = currentToken(slot);
  if (!token) {
    // Fail-SAFE: never auto-confirm a destructive action.
    opts.onCancel?.();
    return detachedHandle(opts.componentName);
  }

  // Field table (design D3.3): forward-if-supplied; isModal forced.
  const popupOptions: Record<string, unknown> = { isModal: true };
  for (const key of [
    'title',
    'displayMode',
    'isFocusedContent',
    'isFocusedContainer',
    'showCloseButton',
    'cssClass',
    'locale',
  ] as const) {
    if (opts[key] !== undefined) popupOptions[key] = opts[key];
  }
  const popup = new PopupModel(opts.componentName, opts.data, popupOptions);

  // Resolution state machine (design D3.4): open → applying → terminal.
  // `applying` is a guarded transaction — dismissals during it record a
  // PENDING dismissal; the apply return commits.
  let state: 'open' | 'applying' | 'terminal' = 'open';
  let pendingDismissal = false;

  function terminalCancel(): void {
    state = 'terminal';
    opts.onCancel?.();
  }

  popup.onApply = () => {
    if (state === 'terminal') return false;
    state = 'applying';
    let result: boolean | void;
    try {
      result = opts.onApply?.();
    } catch (error) {
      // Apply-throw exit: leave `applying` deterministically first.
      if (pendingDismissal) terminalCancel();
      else state = 'open';
      throw error;
    }
    if (result !== false) {
      state = 'terminal';
      return true;
    }
    if (pendingDismissal) {
      terminalCancel();
      return true;
    }
    state = 'open'; // validation retry stays possible
    return false;
  };
  popup.onCancel = () => {
    if (state === 'terminal') return;
    if (state === 'applying') {
      pendingDismissal = true;
      return;
    }
    terminalCancel();
  };
  const consumerOnHide = opts.onHide;
  popup.onHide = () => {
    try {
      consumerOnHide?.();
    } finally {
      try {
        // Finalizer: hide-before-resolution resolves cancel (never zero
        // resolutions); during `applying` the apply return commits. A
        // throwing consumer onCancel must not skip the cleanup below.
        if (state === 'open') terminalCancel();
        else if (state === 'applying') pendingDismissal = true;
      } finally {
        token.registrations.delete(registration);
        // Bridge unregister deferred off the model callback.
        Promise.resolve()
          .then(() => registration.unregister())
          .catch(() => undefined);
      }
    }
  };
  const consumerOnDispose = opts.onDispose;
  popup.onDispose = () => {
    try {
      consumerOnDispose?.();
    } finally {
      try {
        // Disposal while visible = terminal cancel (exactly-once guard
        // inside the state machine makes the ordinary-after-hide path a
        // no-op).
        if (state === 'open') terminalCancel();
      } finally {
        token.registrations.delete(registration);
      }
    }
  };

  const registration = registerPopup(popup, token.stack);
  token.registrations.add(registration);
  popup.show();
  // Post-present consumer onShow (design D3.3): the 2.1 bridge runs
  // popup.onShow() BEFORE the entry exists, so a consumer onShow that
  // hides synchronously would race an unpushed record.
  if (opts.onShow) {
    const consumerOnShow = opts.onShow;
    Promise.resolve()
      .then(() => consumerOnShow())
      .catch(() => undefined);
  }

  const entry = token.stack
    .entries()
    .find((candidate) => candidate.payload.popup === popup);
  if (!entry) {
    // Invariant violation — registerPopup + show() must have pushed the
    // entry synchronously. Failing loudly beats retitling a container
    // no presenter renders.
    throw new Error(
      'dialog-adapter: presented popup has no overlay entry (bridge invariant)'
    );
  }
  let width: string | undefined;
  const handle: DialogHandle = {
    footerToolbar: entry.payload.footerActions.container,
    get width() {
      return width;
    },
    set width(value: string | undefined) {
      width = value;
    },
    popupModel: popup,
  };
  return handle;
}

/**
 * Registers a Survey root's overlay stack as a dialog host. The LAST
 * registered live host receives new dialogs; the returned token's
 * `dispose()` is idempotent, safe out-of-order, and independent of the
 * caller's own teardown flags (StrictMode remounts register fresh
 * tokens).
 */
export function registerDialogHost(
  stack: OverlayStack<OverlayPayload>
): DialogHostToken {
  const slot = getOrCreateSlot();
  const token: DialogHostToken = {
    stack,
    registrations: new Set<PopupRegistration>(),
    disposed: false,
    dispose(): void {
      if (token.disposed) return;
      token.disposed = true;
      const index = slot.tokens.indexOf(token);
      if (index >= 0) slot.tokens.splice(index, 1);
      // Teardown transaction: semantically close every dialog this
      // token owns with the dispatcher still installed; collect errors
      // and finish restoration before rethrowing.
      const errors: unknown[] = [];
      for (const registration of [...token.registrations]) {
        try {
          registration.unregister();
        } catch (error) {
          errors.push(error);
        }
      }
      token.registrations.clear();
      try {
        // Last-token status is RE-READ here — a re-entrant registration
        // from a teardown callback suppresses restoration.
        restoreIfLast(slot);
      } finally {
        if (errors.length > 0) {
          throw errors[0];
        }
      }
    },
  };
  const wasEmpty = liveTokens(slot).length === 0;
  slot.tokens.push(token);
  // Install ONLY on the 0->1 transition — a consumer takeover installed
  // while host A is mounted must survive host B mounting.
  if (wasEmpty) installIfNeeded(slot);
  return token;
}

/**
 * PRE-MOUNT configuration only (design D2, round 4/5): with live
 * tokens the call reports `dialog-adapter-enable-while-mounted` and
 * no-ops. At zero tokens, disabling CAS-removes a persistent
 * dispatcher (restoring `previous`, even `undefined`); enabling marks
 * the slot so the NEXT 0→1 registration installs.
 */
export function setDialogAdapterEnabled(enabled: boolean): void {
  const slot = getOrCreateSlot();
  if (liveTokens(slot).length > 0) {
    reportDiagnostic({
      code: 'dialog-adapter-enable-while-mounted',
      requested: enabled,
    });
    return;
  }
  slot.enabled = enabled;
  if (!enabled && mutableSettings.showDialog === slot.dispatcher) {
    // Restoring `undefined` is intentional here (full opt-out returns
    // settings to its pre-install state).
    mutableSettings.showDialog = slot.previous as ShowDialogFn;
    slot.previous = undefined;
  }
}
