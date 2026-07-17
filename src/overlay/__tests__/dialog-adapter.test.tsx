/**
 * 2.2 dialog adapter (design docs/design/2.2-dialog-adapter.md v6) —
 * `settings.showDialog` dispatcher over the per-Survey overlay stack.
 *
 * Core's default `confirmActionAsync` wrapper routes through
 * `showConfirmDialog` → `settings.showDialog` (confirm-dialog.ts:13-55),
 * so adapting the BOTTOM of the funnel needs no ownership heuristics:
 * consumer `confirmActionFunc`/`confirmActionAsync` hooks keep their
 * natural precedence, and upstream's own post-hoc footer mutation
 * (titles, danger css, width) runs in core against the handle we
 * return.
 */
import { settings } from '../../core/facade';
import '../../factories/register-all';
import { createOverlayStack } from '../stack';
import type { OverlayPayload } from '../popup-bridge';
import {
  DIALOG_DISPATCHER_SLOT,
  registerDialogHost,
  setDialogAdapterEnabled,
} from '../dialog-adapter';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

type ShowDialogFn = (options: unknown, root?: unknown) => unknown;
type SettingsLike = {
  showDialog?: ShowDialogFn;
} & Record<symbol, unknown>;

const mutableSettings = settings as unknown as SettingsLike;

function slot(): {
  dispatcher: ShowDialogFn;
  previous: ShowDialogFn | undefined;
} | null {
  return (
    (mutableSettings[DIALOG_DISPATCHER_SLOT] as {
      dispatcher: ShowDialogFn;
      previous: ShowDialogFn | undefined;
    }) ?? null
  );
}

function makeStack() {
  return createOverlayStack<OverlayPayload>();
}

const initialShowDialog = mutableSettings.showDialog;

afterEach(() => {
  // Restore pristine settings between tests: drop the branded slot and
  // whatever dispatcher the test left installed.
  delete mutableSettings[DIALOG_DISPATCHER_SLOT];
  mutableSettings.showDialog = initialShowDialog;
  setDialogAdapterEnabled(true);
  setDiagnosticHandler(undefined);
});

describe('dialog adapter — registry install/restore (D2)', () => {
  it('first registration installs the branded dispatcher; last disposal with undefined previous keeps it (persistent)', () => {
    expect(mutableSettings.showDialog).toBe(initialShowDialog);
    const token = registerDialogHost(makeStack());
    const installed = mutableSettings.showDialog;
    expect(typeof installed).toBe('function');
    expect(installed).toBe(slot()!.dispatcher);
    token.dispose();
    // previous was undefined → dispatcher persists.
    expect(mutableSettings.showDialog).toBe(installed);
  });

  it('a consumer-set previous showDialog is displaced while mounted and CAS-restored on last disposal', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    const consumerFn: ShowDialogFn = () => 'consumer';
    mutableSettings.showDialog = consumerFn;
    const token = registerDialogHost(makeStack());
    expect(mutableSettings.showDialog).not.toBe(consumerFn);
    expect(
      payloads.some((p) => p.code === 'dialog-adapter-displaced-show-dialog')
    ).toBe(true);
    token.dispose();
    expect(mutableSettings.showDialog).toBe(consumerFn);
  });

  it('a consumer override installed WHILE mounted survives disposal (CAS)', () => {
    const token = registerDialogHost(makeStack());
    const late: ShowDialogFn = () => 'late-consumer';
    mutableSettings.showDialog = late;
    token.dispose();
    expect(mutableSettings.showDialog).toBe(late);
  });

  it('dispose is idempotent and out-of-order disposal keeps routing sane', () => {
    const a = registerDialogHost(makeStack());
    const b = registerDialogHost(makeStack());
    a.dispose();
    a.dispose();
    expect(typeof mutableSettings.showDialog).toBe('function');
    b.dispose();
  });

  it('a persistent dispatcher is never recaptured as its own previous (round 5)', () => {
    const first = registerDialogHost(makeStack());
    first.dispose(); // persistent (previous undefined)
    const persisted = mutableSettings.showDialog;
    const second = registerDialogHost(makeStack());
    expect(slot()!.previous).toBeUndefined(); // NOT the dispatcher
    second.dispose();
    expect(mutableSettings.showDialog).toBe(persisted);
  });

  it('setDialogAdapterEnabled(false) at zero tokens blocks installation; live-token calls no-op with a diagnostic', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    setDialogAdapterEnabled(false);
    const token = registerDialogHost(makeStack());
    expect(mutableSettings.showDialog).toBe(initialShowDialog);
    // Live token: enable attempt no-ops + diagnoses.
    setDialogAdapterEnabled(true);
    expect(
      payloads.some((p) => p.code === 'dialog-adapter-enable-while-mounted')
    ).toBe(true);
    expect(mutableSettings.showDialog).toBe(initialShowDialog);
    token.dispose();
  });
});

describe('dialog adapter — presentation + state machine (D3/D4)', () => {
  it('a dialog call presents through the current host stack; apply resolves true once', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const results: boolean[] = [];
    const handle = (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onApply: () => {
        results.push(true);
        return true;
      },
      onCancel: () => {
        results.push(false);
      },
    }) as {
      footerToolbar: {
        getActionById(id: string): { action(): void; title: string };
      };
    };
    expect(stack.entries()).toHaveLength(1);
    const payload = stack.entries()[0]!.payload;
    expect(payload.shape).toBe('dialog');
    // Upstream post-hoc mutation lines (confirm-dialog.ts:46-52).
    const apply = handle.footerToolbar.getActionById('apply');
    const cancel = handle.footerToolbar.getActionById('cancel');
    expect(apply).toBeTruthy();
    expect(cancel).toBeTruthy();
    apply.title = 'Delete';
    apply.action();
    stack.entries()[0]?.payload.onDismissAcknowledged();
    expect(results).toEqual([true]);
    expect(stack.entries()).toHaveLength(0);
    token.dispose();
  });

  it('hide-only dismissal (no apply/cancel) resolves onCancel exactly once via the finalizer', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const results: string[] = [];
    (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onApply: () => true,
      onCancel: () => {
        results.push('cancel');
      },
    });
    const payload = stack.entries()[0]!.payload;
    payload.requestHide(); // HIDE sequence — PopupModel.hide() skips onCancel
    payload.onDismissAcknowledged();
    expect(results).toEqual(['cancel']);
    token.dispose();
    expect(results).toEqual(['cancel']); // teardown adds nothing
  });

  it('apply returning false keeps the dialog open and permits a retry (no latch)', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    let allow = false;
    const applied: boolean[] = [];
    const handle = (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onApply: () => {
        applied.push(allow);
        return allow;
      },
      onCancel: () => undefined,
    }) as { footerToolbar: { getActionById(id: string): { action(): void } } };
    const apply = handle.footerToolbar.getActionById('apply');
    apply.action();
    expect(stack.entries()).toHaveLength(1); // false → stays open
    allow = true;
    apply.action();
    stack.entries()[0]?.payload.onDismissAcknowledged();
    expect(applied).toEqual([false, true]);
    expect(stack.entries()).toHaveLength(0);
    token.dispose();
  });

  it('token disposal while a dialog is open resolves cancel exactly once', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const results: string[] = [];
    (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onApply: () => {
        results.push('apply');
        return true;
      },
      onCancel: () => {
        results.push('cancel');
      },
    });
    expect(stack.entries()).toHaveLength(1);
    token.dispose();
    expect(stack.entries()).toHaveLength(0);
    expect(results).toEqual(['cancel']);
  });

  it('no host: resolves onCancel synchronously with an inert mutable handle + diagnostic', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    const token = registerDialogHost(makeStack());
    token.dispose(); // persistent dispatcher, zero hosts
    const results: string[] = [];
    const handle = (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onApply: () => true,
      onCancel: () => {
        results.push('cancel');
      },
    }) as {
      footerToolbar: {
        getActionById(id: string): { title: string; innerCss: string };
      };
      width: string;
      popupModel: null;
    };
    expect(results).toEqual(['cancel']);
    expect(payloads.some((p) => p.code === 'dialog-no-host')).toBe(true);
    // Upstream mutation lines must not throw on the detached handle.
    const apply = handle.footerToolbar.getActionById('apply');
    const cancel = handle.footerToolbar.getActionById('cancel');
    apply.title = 'OK';
    apply.innerCss = 'sd-btn--danger';
    cancel.title = 'Cancel';
    handle.width = 'min-content';
    expect(handle.width).toBe('min-content');
    expect(handle.popupModel).toBeNull();
  });

  it('REAL core path: paneldynamic confirmDelete routes through the adapter; apply removes, cancel keeps', () => {
    const { Model } =
      jest.requireActual<typeof import('../../core/facade')>(
        '../../core/facade'
      );
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const model = new Model({
      elements: [
        {
          type: 'paneldynamic',
          name: 'pd',
          confirmDelete: true,
          panelCount: 2,
          templateElements: [{ type: 'text', name: 'inner' }],
        },
      ],
    });
    const question = model.getQuestionByName('pd') as unknown as {
      panelCount: number;
      removePanelUI(index: number): void;
    };
    // Confirm only fires for non-empty panel values
    // (isRequireConfirmOnDelete — question_paneldynamic.ts:1604-1610).
    model.data = { pd: [{ inner: 'a' }, { inner: 'b' }] };
    question.removePanelUI(0);
    expect(stack.entries()).toHaveLength(1);
    const payload = stack.entries()[0]!.payload;
    // Upstream retitled the apply button post-hoc through the handle.
    const applyAction = payload.footerActions.getActionById('apply')!;
    applyAction.action();
    stack.entries()[0]?.payload.onDismissAcknowledged();
    expect(question.panelCount).toBe(1);
    // Cancel path on a fresh confirm keeps the panel.
    question.removePanelUI(0);
    const second = stack.entries()[0]!.payload;
    second.requestCancel();
    stack.entries()[0]?.payload.onDismissAcknowledged();
    expect(question.panelCount).toBe(1);
    token.dispose();
  });
});

describe('dialog adapter — D8 matrix (throw, routing, onShow, epoch)', () => {
  it('apply-throw with the dialog still open reopens the state (retry works, exception propagates)', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    let boom = true;
    const resolutions: boolean[] = [];
    const handle = (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onApply: () => {
        if (boom) throw new Error('validator exploded');
        resolutions.push(true);
        return true;
      },
      onCancel: () => {
        resolutions.push(false);
      },
    }) as { footerToolbar: { getActionById(id: string): { action(): void } } };
    const apply = handle.footerToolbar.getActionById('apply');
    expect(() => apply.action()).toThrow('validator exploded');
    expect(stack.entries()).toHaveLength(1); // still open
    boom = false;
    apply.action();
    stack.entries()[0]?.payload.onDismissAcknowledged();
    expect(resolutions).toEqual([true]);
    token.dispose();
  });

  it('dialogs route to the LAST live host; disposing it moves new dialogs to the previous host', () => {
    const stackA = makeStack();
    const stackB = makeStack();
    const tokenA = registerDialogHost(stackA);
    const tokenB = registerDialogHost(stackB);
    (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
    });
    expect(stackB.entries()).toHaveLength(1);
    expect(stackA.entries()).toHaveLength(0);
    tokenB.dispose(); // closes B's dialog semantically
    expect(stackB.entries()).toHaveLength(0);
    (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
    });
    expect(stackA.entries()).toHaveLength(1);
    tokenA.dispose();
    expect(stackA.entries()).toHaveLength(0);
  });

  it('consumer onShow fires on a microtask AFTER presentation', async () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const order: string[] = [];
    (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onShow: () => {
        order.push(`onShow:${stack.entries().length}`);
      },
    });
    order.push('sync-after-call');
    await Promise.resolve();
    // Presented BEFORE the consumer callback; entry visible from it.
    expect(order).toEqual(['sync-after-call', 'onShow:1']);
    token.dispose();
  });

  it('a second module epoch swaps impl without changing dispatcher identity (live host survives)', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const dispatcher = mutableSettings.showDialog;
    // Simulate epoch B: fresh registration against the same settings
    // singleton re-runs slot binding (getOrCreateSlot re-binds impl).
    const tokenB = registerDialogHost(makeStack());
    expect(mutableSettings.showDialog).toBe(dispatcher); // identity stable
    tokenB.dispose();
    // Epoch-A host still routes.
    (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
    });
    expect(stack.entries()).toHaveLength(1);
    token.dispose();
    expect(stack.entries()).toHaveLength(0);
  });

  it('post-hoc title mutation through the handle re-renders reactively (upstream confirm retitle)', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const handle = (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
    }) as {
      footerToolbar: { getActionById(id: string): { title: string } };
      width: string | undefined;
      popupModel: { isVisible: boolean } | null;
    };
    handle.footerToolbar.getActionById('apply')!.title = 'Delete forever';
    expect(
      stack.entries()[0]!.payload.footerActions.getActionById('apply')!.title
    ).toBe('Delete forever');
    handle.width = 'min-content'; // configConfirmDialog line — stored
    expect(handle.width).toBe('min-content');
    expect(handle.popupModel?.isVisible).toBe(true);
    token.dispose();
  });
});

describe('dialog adapter — D8 completion (review round 1)', () => {
  it('consumer takeover while host A is mounted survives host B mounting (install only on 0->1)', () => {
    const tokenA = registerDialogHost(makeStack());
    const takeover: ShowDialogFn = () => 'takeover';
    mutableSettings.showDialog = takeover;
    const tokenB = registerDialogHost(makeStack());
    expect(mutableSettings.showDialog).toBe(takeover);
    tokenB.dispose();
    tokenA.dispose();
    expect(mutableSettings.showDialog).toBe(takeover);
  });

  it('open on A, mount B, dispose A: the open dialog closes with cancel; new dialogs route to B', () => {
    const stackA = makeStack();
    const stackB = makeStack();
    const tokenA = registerDialogHost(stackA);
    const results: string[] = [];
    (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onCancel: () => {
        results.push('cancel-A');
      },
    });
    const tokenB = registerDialogHost(stackB);
    tokenA.dispose();
    expect(stackA.entries()).toHaveLength(0);
    expect(results).toEqual(['cancel-A']);
    (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
    });
    expect(stackB.entries()).toHaveLength(1);
    tokenB.dispose();
  });

  it('cancellation arriving DURING applying defers; apply-false then resolves the deferred cancel once', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const results: string[] = [];
    let popupRef: { hide(): void } | null = null;
    const handle = (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onApply: () => {
        // Synchronous dismissal mid-apply (e.g. the yes-action tears
        // the UI down) — then reject the apply.
        popupRef!.hide();
        return false;
      },
      onCancel: () => {
        results.push('cancel');
      },
    }) as {
      footerToolbar: { getActionById(id: string): { action(): void } };
      popupModel: { hide(): void };
    };
    popupRef = handle.popupModel;
    handle.footerToolbar.getActionById('apply').action();
    stack.entries()[0]?.payload.onDismissAcknowledged();
    expect(results).toEqual(['cancel']); // exactly once, deferred
    token.dispose();
  });

  it('apply-throw with a pending dismissal resolves the deferred cancel then rethrows', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const results: string[] = [];
    let popupRef: { hide(): void } | null = null;
    const handle = (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onApply: () => {
        popupRef!.hide();
        throw new Error('yes-action exploded');
      },
      onCancel: () => {
        results.push('cancel');
      },
    }) as {
      footerToolbar: { getActionById(id: string): { action(): void } };
      popupModel: { hide(): void };
    };
    popupRef = handle.popupModel;
    expect(() => handle.footerToolbar.getActionById('apply').action()).toThrow(
      'yes-action exploded'
    );
    stack.entries()[0]?.payload.onDismissAcknowledged();
    expect(results).toEqual(['cancel']);
    token.dispose();
  });

  it('zero-token disable removes a persistent dispatcher; re-enable installs on the next registration', () => {
    const first = registerDialogHost(makeStack());
    first.dispose(); // persistent dispatcher
    const persisted = mutableSettings.showDialog;
    expect(typeof persisted).toBe('function');
    setDialogAdapterEnabled(false);
    expect(mutableSettings.showDialog).toBeUndefined();
    setDialogAdapterEnabled(true);
    expect(mutableSettings.showDialog).toBeUndefined(); // not yet
    const second = registerDialogHost(makeStack());
    expect(typeof mutableSettings.showDialog).toBe('function');
    second.dispose();
  });

  it('popupModel.dispose() while visible resolves cancel exactly once (onDispose composition)', () => {
    const stack = makeStack();
    const token = registerDialogHost(stack);
    const results: string[] = [];
    const consumerDispose = jest.fn();
    const handle = (mutableSettings.showDialog as ShowDialogFn)({
      componentName: 'sv-string-viewer',
      data: { model: null },
      onCancel: () => {
        results.push('cancel');
      },
      onDispose: consumerDispose,
    }) as { popupModel: { dispose(): void } };
    handle.popupModel.dispose();
    expect(consumerDispose).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['cancel']);
    // dispose() never calls hide() (2.5.33) — the adapter must
    // semantically close the bridge so the overlay entry cannot leak.
    expect(stack.entries()).toHaveLength(0);
    token.dispose(); // idempotent against the already-closed bridge
    expect(results).toEqual(['cancel']);
  });
});
