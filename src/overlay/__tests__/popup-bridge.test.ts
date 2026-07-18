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

describe('popup bridge — generation records (review round 1)', () => {
  it('re-show during dismissal pushes a NEW entry; the old ack removes only the old one and runs its onHiding once', () => {
    let hidings = 0;
    const popup = makePopup({ onHide: () => hidings++ });
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    const first = stack.entries()[0]!;
    popup.hide(); // begins dismissal; presenter ack is async
    expect(first.state).toBe('dismissing');
    popup.show(); // re-show BEFORE the old ack lands
    expect(stack.entries()).toHaveLength(2);
    const second = stack.entries()[1]!;
    expect(second).not.toBe(first);
    expect(second.state).toBe('active');
    // Old presenter finally acks its own generation.
    first.payload.onDismissAcknowledged();
    expect(stack.entries()).toEqual([second]);
    expect(hidings).toBe(1); // old generation's onHiding exactly once
    expect(popup.isVisible).toBe(true); // the re-shown popup survives
    // New entry's own dismissal still completes normally.
    popup.hide();
    second.payload.onDismissAcknowledged();
    expect(stack.entries()).toHaveLength(0);
    expect(hidings).toBe(2);
  });

  it('a stale ack from the OLD generation never dismisses the NEW entry', () => {
    const popup = makePopup();
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    const first = stack.entries()[0]!;
    const firstPayload = first.payload;
    popup.hide();
    popup.show();
    const second = stack.entries()[1]!;
    // Double-ack the old generation: second call must be a no-op.
    firstPayload.onDismissAcknowledged();
    firstPayload.onDismissAcknowledged();
    expect(stack.entries()).toEqual([second]);
    expect(second.state).toBe('active');
  });

  it('footer ActionContainer is disposed exactly once on completed dismissal, never on suspension', () => {
    const popup = makePopup();
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    const entry = stack.entries()[0]!;
    const container = entry.payload.footerActions.container;
    // Suspension (a second popup) must NOT dispose the footer.
    const other = makePopup();
    registerPopup(other, stack);
    other.show();
    expect(container.isDisposed).toBe(false);
    other.hide();
    stack.entries()[1]!.payload.onDismissAcknowledged();
    // Real dismissal disposes it.
    popup.hide();
    entry.payload.onDismissAcknowledged();
    expect(container.isDisposed).toBe(true);
  });

  it('unregister-while-visible disposes the footer container', () => {
    const popup = makePopup();
    const stack = createOverlayStack<OverlayPayload>();
    const registration = registerPopup(popup, stack);
    popup.show();
    const container = stack.entries()[0]!.payload.footerActions.container;
    registration.unregister();
    expect(container.isDisposed).toBe(true);
  });

  it('payload carries the model showCloseButton flag', () => {
    const popup = makePopup();
    popup.showCloseButton = true;
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    expect(stack.entries()[0]!.payload.showCloseButton).toBe(true);
  });
});

describe('popup bridge — real tagbox integration (verification matrix)', () => {
  it('a real tagbox popup: Done footer action lands via updateFooterActions; cancel reverts the pre-open value', () => {
    const { Model } =
      jest.requireActual<typeof import('../../core/facade')>(
        '../../core/facade'
      );
    const model = new Model({
      elements: [
        {
          type: 'tagbox',
          name: 'tags',
          choices: ['a', 'b', 'c'],
        },
      ],
    });
    const question = model.getQuestionByName('tags') as unknown as {
      value: string[];
      renderedValue: string[];
      dropdownListModel: {
        popupModel: InstanceType<typeof PopupModel>;
      };
    };
    question.value = ['a'];
    const popup = question.dropdownListModel.popupModel;
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    const entry = stack.entries()[0]!;
    const footer = entry.payload.footerActions;
    // Raw consumer action (pushed through onFooterActionsCreated as a
    // PLAIN IAction) survived the D5 order into the container.
    const ids = footer.container.actions.map((a) => a.id);
    expect(ids).toContain('sv-dropdown-done-button');
    expect(ids).toContain('cancel');
    // Mutate through the model, then cancel: tagbox's own onCancel
    // wiring (shouldResetAfterCancel under IsTouch) reverts the value.
    question.renderedValue = ['a', 'b'];
    entry.payload.requestCancel();
    entry.payload.onDismissAcknowledged();
    expect(stack.entries()).toHaveLength(0);
    // Core may hand back boxed values that serialize identically —
    // compare through JSON.
    expect(JSON.parse(JSON.stringify(question.value))).toEqual(['a']);
  });
});

describe('popup bridge — reopen produces a fresh generation', () => {
  it('reopen presents a fresh entry with an undisposed footer (real lazy re-arm is pinned in OverlayHost.test)', () => {
    const popup = makePopup();
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    stack.entries()[0]!.payload.requestHide();
    stack.entries()[0]!.payload.onDismissAcknowledged();
    // Reopen: a NEW generation presents (fresh entry + footer).
    popup.show();
    const reopened = stack.entries()[0]!;
    expect(reopened.state).toBe('active');
    expect(reopened.payload.footerActions.container.isDisposed).toBe(false);
    popup.hide();
    reopened.payload.onDismissAcknowledged();
    expect(stack.entries()).toHaveLength(0);
  });
});

describe('popup bridge — round 2 (multi-record teardown, throw safety)', () => {
  it('unregister finalizes EVERY live generation (predecessor dismissing + successor active)', () => {
    let hidings = 0;
    const popup = makePopup({ onHide: () => hidings++ });
    const stack = createOverlayStack<OverlayPayload>();
    const registration = registerPopup(popup, stack);
    popup.show();
    const first = stack.entries()[0]!;
    popup.hide(); // dismissing, ack never arrives (delayed presenter)
    popup.show(); // successor entry
    expect(stack.entries()).toHaveLength(2);
    const firstFooter = first.payload.footerActions.container;
    const secondFooter = stack.entries()[1]!.payload.footerActions.container;
    registration.unregister();
    expect(stack.entries()).toHaveLength(0);
    expect(hidings).toBe(2); // each generation's onHiding exactly once
    expect(firstFooter.isDisposed).toBe(true);
    expect(secondFooter.isDisposed).toBe(true);
  });

  it('a throwing onHide still disposes the footer and clears the record', () => {
    const popup = makePopup({
      onHide: () => {
        throw new Error('consumer onHide blew up');
      },
    });
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack);
    popup.show();
    const entry = stack.entries()[0]!;
    const footer = entry.payload.footerActions.container;
    popup.hide();
    expect(() => entry.payload.onDismissAcknowledged()).toThrow(
      'consumer onHide blew up'
    );
    expect(footer.isDisposed).toBe(true);
    expect(stack.entries()).toHaveLength(0);
    // The registration is still usable: a fresh show presents cleanly.
    popup.show();
    expect(stack.entries()).toHaveLength(1);
  });
});

describe('popup bridge — focus intent (D8 round 2)', () => {
  it('payload derives focusIntent from the model flags', () => {
    const stack = createOverlayStack<OverlayPayload>();
    const content = makePopup();
    content.isFocusedContent = true;
    content.isFocusedContainer = false;
    registerPopup(content, stack);
    content.show();
    expect(stack.entries()[0]!.payload.focusIntent).toBe('content');

    const container = makePopup();
    container.isFocusedContainer = true;
    container.isFocusedContent = false;
    const stack2 = createOverlayStack<OverlayPayload>();
    registerPopup(container, stack2);
    container.show();
    expect(stack2.entries()[0]!.payload.focusIntent).toBe('container');

    // BOTH true: content wins (upstream switchFocus precedence,
    // popup-view-model.ts:240-246 — core defaults both flags true).
    const both = makePopup();
    both.isFocusedContent = true;
    both.isFocusedContainer = true;
    const stack4 = createOverlayStack<OverlayPayload>();
    registerPopup(both, stack4);
    both.show();
    expect(stack4.entries()[0]!.payload.focusIntent).toBe('content');

    const none = makePopup();
    none.isFocusedContent = false;
    none.isFocusedContainer = false;
    const stack3 = createOverlayStack<OverlayPayload>();
    registerPopup(none, stack3);
    none.show();
    expect(stack3.entries()[0]!.payload.focusIntent).toBe('none');
  });
});

describe('popup bridge — exception-safe multi-generation unregister', () => {
  it('a predecessor onHide throw does not abort finalizing the successor', () => {
    let hideCalls = 0;
    const popup = makePopup({
      onHide: () => {
        hideCalls += 1;
        if (hideCalls === 1) throw new Error('first-generation onHide');
      },
    });
    const stack = createOverlayStack<OverlayPayload>();
    const registration = registerPopup(popup, stack);
    popup.show();
    const firstFooter = stack.entries()[0]!.payload.footerActions.container;
    popup.hide(); // dismissing, ack withheld
    popup.show(); // successor
    const secondFooter = stack.entries()[1]!.payload.footerActions.container;
    expect(() => registration.unregister()).toThrow('first-generation onHide');
    expect(stack.entries()).toHaveLength(0);
    expect(hideCalls).toBe(2); // BOTH generations finalized
    expect(firstFooter.isDisposed).toBe(true);
    expect(secondFooter.isDisposed).toBe(true);
  });

  it('a throwing onCancel still finalizes every generation', () => {
    const popup = makePopup({
      onCancel: () => {
        throw new Error('consumer onCancel blew up');
      },
    });
    const stack = createOverlayStack<OverlayPayload>();
    const registration = registerPopup(popup, stack);
    popup.show();
    const footer = stack.entries()[0]!.payload.footerActions.container;
    expect(() => registration.unregister()).toThrow(
      'consumer onCancel blew up'
    );
    expect(stack.entries()).toHaveLength(0);
    expect(footer.isDisposed).toBe(true);
  });
});

describe('popup bridge — round 4 (cancel-throw hide, bounded scroll retry)', () => {
  it('a throwing onCancel still hides the model (semantic-close state consistency)', () => {
    const popup = makePopup({
      onCancel: () => {
        throw new Error('onCancel exploded');
      },
    });
    const stack = createOverlayStack<OverlayPayload>();
    const registration = registerPopup(popup, stack);
    popup.show();
    expect(() => registration.unregister()).toThrow('onCancel exploded');
    expect(popup.isVisible).toBe(false);
    expect(stack.entries()).toHaveLength(0);
  });
});

describe('popup bridge — opener focus seam (2.3 fold 5)', () => {
  it('registerPopup stores openerHandle on the payload; the host restores focus on final removal', () => {
    const popup = makePopup();
    const stack = createOverlayStack<OverlayPayload>();
    registerPopup(popup, stack, { openerHandle: () => 42 });
    popup.show();
    expect(stack.entries()[0]!.payload.openerHandle?.()).toBe(42);
  });
});
