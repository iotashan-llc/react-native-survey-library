/**
 * 2.1 popup bridge (design D4/D5) — PopupModel ↔ overlay stack wiring,
 * tested against REAL core PopupModels (invariant 6).
 *
 * Sequences pinned (upstream oracle popuptests.ts:1818-1875 +
 * popup.ts:129-145,226-229):
 * - registration reconciles an ALREADY-visible model immediately;
 * - show: model.onShow() fires once, then the entry is pushed;
 * - hide path: isVisible=false fires ONLY onVisibilityChanged; the
 *   bridge begins dismissal; onHiding() (which itself runs onHide) fires
 *   EXACTLY ONCE after the presenter acks — never on suspension;
 * - cancel: onCancel() THEN hide();
 * - unregister-while-visible = semantic close (cancel sequence) then
 *   removal;
 * - content dispatch by registry name; miss → element-wrapper-missing
 *   diagnostic + fallback payload with a Close action wired to HIDE;
 * - footer: raw IAction[] → model.updateFooterActions(raw) → the
 *   RETURNED array feeds ActionContainer.setItems (a consumer pushing a
 *   RAW action through onFooterActionsCreated must not throw);
 * - suspension (a second popup presenting) triggers NO model lifecycle
 *   on the first popup.
 */
import { PopupModel } from '../../core/facade';
import '../../factories/register-all';
import { createOverlayStack } from '../stack';
import { registerPopup } from '../popup-bridge';
import type { OverlayPayload } from '../popup-bridge';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

function makePopup(
  overrides: Record<string, unknown> = {}
): InstanceType<typeof PopupModel> {
  return new PopupModel('sv-list', { model: null }, overrides);
}

afterEach(() => {
  setDiagnosticHandler(undefined);
});

describe('popup bridge — lifecycle sequences', () => {
  it('show: onShow fires once, then the entry lands active in the stack', () => {
    const calls: string[] = [];
    const popup = makePopup({ onShow: () => calls.push('onShow') });
    const stack = createOverlayStack<OverlayPayload>();
    stack.subscribe(() => calls.push(`stack:${stack.entries().length}`));
    registerPopup(popup, stack);
    expect(stack.entries()).toHaveLength(0);
    popup.show();
    expect(calls).toEqual(['onShow', 'stack:1']);
    expect(stack.activeEntry()!.state).toBe('active');
  });

  it('an already-visible model reconciles at registration', () => {
    const popup = makePopup();
    popup.show();
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    expect(stack.entries()).toHaveLength(1);
  });

  it('hide: dismissal begins; onHiding fires exactly once AFTER the presenter ack', () => {
    const calls: string[] = [];
    const popup = makePopup({ onHide: () => calls.push('onHide') });
    const spyOnHiding = jest.spyOn(popup, 'onHiding');
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    popup.hide();
    const entry = stack.entries()[0]!;
    expect(entry.state).toBe('dismissing');
    expect(spyOnHiding).not.toHaveBeenCalled();
    entry.payload.onDismissAcknowledged();
    expect(spyOnHiding).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['onHide']); // onHide runs INSIDE onHiding
    // A duplicate ack must not re-run onHiding.
    entry.payload.onDismissAcknowledged();
    expect(spyOnHiding).toHaveBeenCalledTimes(1);
  });

  it('cancel sequence: onCancel THEN hide', () => {
    const calls: string[] = [];
    const popup = makePopup({
      onCancel: () => calls.push('onCancel'),
    });
    const stack = createOverlayStack<OverlayPayload>();
    const registration = registerPopup(popup, stack);
    popup.show();
    registration.cancel();
    expect(calls).toEqual(['onCancel']);
    expect(popup.isVisible).toBe(false);
    expect(stack.entries()[0]!.state).toBe('dismissing');
  });

  it('unregister while visible runs the cancel sequence, then removes', () => {
    const calls: string[] = [];
    const popup = makePopup({ onCancel: () => calls.push('onCancel') });
    const stack = createOverlayStack<OverlayPayload>();
    const registration = registerPopup(popup, stack);
    popup.show();
    registration.unregister();
    expect(calls).toEqual(['onCancel']);
    expect(popup.isVisible).toBe(false);
    expect(stack.entries()).toHaveLength(0);
  });

  it('suspension triggers NO lifecycle on the suspended popup', () => {
    const first = makePopup();
    const spyOnHiding = jest.spyOn(first, 'onHiding');
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(first, stack);
    first.show();
    const second = makePopup();
    registerPopup(second, stack);
    second.show();
    expect(stack.entries()[0]!.state).toBe('suspended');
    expect(first.isVisible).toBe(true);
    expect(spyOnHiding).not.toHaveBeenCalled();
  });
});

describe('popup bridge — content dispatch + footer', () => {
  it('content resolves through RNElementFactory by contentComponentName', () => {
    // 'sv-string-viewer' is a real registered element route; 'sv-list'
    // arrives with the ListPicker phase.
    const popup = new PopupModel('sv-string-viewer', { model: null });
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    const payload = stack.entries()[0]!.payload;
    expect(payload.contentMiss).toBe(false);
    expect(payload.renderContent()).toBeTruthy();
  });

  it('a registry miss reports element-wrapper-missing and yields a closable fallback', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((p) => payloads.push(p));
    const popup = new PopupModel('sv-not-registered', {});
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    const payload = stack.entries()[0]!.payload;
    expect(payload.contentMiss).toBe(true);
    expect(
      payloads.some(
        (p) =>
          p.code === 'element-wrapper-missing' &&
          p.componentName === 'sv-not-registered'
      )
    ).toBe(true);
    // The fallback Close runs the HIDE sequence (nothing to revert).
    payload.closeFallback();
    expect(popup.isVisible).toBe(false);
  });

  it('footer: raw array → updateFooterActions → returned array reaches the container; a raw consumer push does not throw', () => {
    const popup = makePopup();
    popup.onFooterActionsCreated.add((_sender, options) => {
      // The tagbox pattern: push a RAW IAction into the array.
      options.actions.push({ id: 'done', title: 'Done' });
    });
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    const payload = stack.entries()[0]!.payload;
    const ids = payload.footerActions.actions.map((a) => a.id);
    expect(ids).toEqual(['cancel', 'done']);
  });

  it('modal dialogs seed cancel + apply; apply returning false keeps the popup open', () => {
    let applyResult = false;
    const popup = makePopup({
      isModal: true,
      onApply: () => applyResult,
    });
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    const payload = stack.entries()[0]!.payload;
    const ids = payload.footerActions.actions.map((a) => a.id);
    expect(ids).toEqual(['cancel', 'apply']);
    const apply = payload.footerActions.getActionById('apply')!;
    apply.action();
    expect(popup.isVisible).toBe(true); // onApply false → stays open
    applyResult = true;
    apply.action();
    expect(popup.isVisible).toBe(false);
  });
});
