/**
 * 2.1 OverlayHost (design D2/D7/D8) — single persistent RN Modal over
 * the entry stack; suspended entries stay MOUNTED but isolated; the
 * presenter protocol (visible/requestHide/requestCancel/onDidShow/
 * onDidDismiss) is injectable via OverlayPresenterContext.
 */
import * as React from 'react';
import { AccessibilityInfo, Modal, StyleSheet, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PopupModel } from '../../core/facade';
import '../../factories/register-all';
import { createOverlayStack } from '../stack';
import { registerPopup } from '../popup-bridge';
import type { OverlayPayload } from '../popup-bridge';
import { OverlayHost } from '../OverlayHost';
import {
  OverlayPresenterContext,
  type OverlayPresenterProps,
} from '../OverlayPresenterContext';

function harness(overrides: Record<string, unknown> = {}) {
  const stack = createOverlayStack<OverlayPayload>();
  const popup = new PopupModel('sv-string-viewer', { model: null }, overrides);
  const registration = registerPopup(popup, stack);
  return { stack, popup, registration };
}

describe('OverlayHost — presentation', () => {
  it('renders no visible Modal while the stack is empty; presents on show', () => {
    const { stack, popup } = harness();
    render(<OverlayHost stack={stack} />);
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    act(() => {
      popup.show();
    });
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    expect(screen.getByTestId('overlay-panel-sheet')).toBeTruthy();
  });

  it('a modal popup renders the dialog shape with title and footer actions', () => {
    const { stack, popup } = harness({ isModal: true, title: 'Confirm it' });
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    expect(screen.getByTestId('overlay-panel-dialog')).toBeTruthy();
    expect(screen.getByText('Confirm it')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Apply')).toBeTruthy();
  });

  it('backdrop press DISMISSES a sheet (hide, no cancel) but NOT a modal dialog', () => {
    // Upstream clickOutside plain-hides (popup-view-model.ts:286-289);
    // cancel/revert belongs to the footer Cancel button only.
    const sheetCancel = jest.fn();
    const sheet = harness({ onCancel: sheetCancel });
    const view = render(<OverlayHost stack={sheet.stack} />);
    act(() => {
      sheet.popup.show();
    });
    fireEvent.press(screen.getByTestId('overlay-backdrop'));
    expect(sheetCancel).not.toHaveBeenCalled();
    expect(sheet.popup.isVisible).toBe(false);
    view.unmount();

    const dialogCancel = jest.fn();
    const dialog = harness({ isModal: true, onCancel: dialogCancel });
    render(<OverlayHost stack={dialog.stack} />);
    act(() => {
      dialog.popup.show();
    });
    fireEvent.press(screen.getByTestId('overlay-backdrop'));
    expect(dialogCancel).not.toHaveBeenCalled();
    expect(dialog.popup.isVisible).toBe(true);
  });

  it('Android back (onRequestClose) dismisses the ACTIVE sheet entry (hide, no cancel)', () => {
    // Upstream Escape mapping: non-modal popups plain-hide
    // (popup-view-model.ts:213-218); only the modal view-model cancels
    // (popup-modal-view-model.ts:63-68) — dialog case pinned in
    // dismiss-semantics.test.tsx.
    const onCancel = jest.fn();
    const { stack, popup } = harness({ onCancel });
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    act(() => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(popup.isVisible).toBe(false);
  });

  it('the default presenter acks dismissal: the entry leaves and onHiding runs once', () => {
    const { stack, popup } = harness();
    const spyOnHiding = jest.spyOn(popup, 'onHiding');
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    act(() => {
      popup.hide();
    });
    expect(stack.entries()).toHaveLength(0);
    expect(spyOnHiding).toHaveBeenCalledTimes(1);
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
  });

  it('a suspended entry stays MOUNTED but isolated (pointerEvents none, a11y hidden)', () => {
    const first = harness();
    render(<OverlayHost stack={first.stack} />);
    act(() => {
      first.popup.show();
    });
    const second = new PopupModel(
      'sv-string-viewer',
      { model: null },
      { isModal: true }
    );
    registerPopup(second, first.stack);
    act(() => {
      second.show();
    });
    const suspended = screen.getByTestId('overlay-entry-suspended', {
      includeHiddenElements: true,
    });
    expect(suspended.props.pointerEvents).toBe('none');
    expect(suspended.props.accessibilityElementsHidden).toBe(true);
    expect(suspended.props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
    // Active dialog present simultaneously.
    expect(screen.getByTestId('overlay-panel-dialog')).toBeTruthy();
    // Dismissing the dialog restores the sheet as the active panel.
    act(() => {
      second.hide();
    });
    expect(screen.getByTestId('overlay-panel-sheet')).toBeTruthy();
    expect(
      screen.queryByTestId('overlay-entry-suspended', {
        includeHiddenElements: true,
      })
    ).toBeNull();
    expect(first.popup.isVisible).toBe(true);
  });
});

describe('OverlayHost — presenter injection (D7)', () => {
  it('a custom presenter receives the protocol and its requestCancel drives the MODEL', () => {
    const seen: Array<{ visible: boolean; state: string }> = [];
    let capturedProps: OverlayPresenterProps | null = null;
    function FakePresenter(props: OverlayPresenterProps): null {
      capturedProps = props;
      seen.push({ visible: props.visible, state: props.entry.state });
      React.useEffect(() => {
        props.onDidShow();
      }, [props]);
      return null;
    }
    const onCancel = jest.fn();
    const { stack, popup } = harness({ onCancel });
    render(
      <OverlayPresenterContext.Provider value={FakePresenter}>
        <OverlayHost stack={stack} />
      </OverlayPresenterContext.Provider>
    );
    act(() => {
      popup.show();
    });
    expect(capturedProps).not.toBeNull();
    act(() => {
      capturedProps!.requestCancel();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(popup.isVisible).toBe(false);
    // The fake presenter acks the dismissal itself.
    act(() => {
      capturedProps!.onDidDismiss();
    });
    expect(stack.entries()).toHaveLength(0);
  });
});

describe('OverlayHost — review round 1 regressions', () => {
  it('suspension and restoration preserve content MOUNT IDENTITY (no unmount/remount)', () => {
    let mounts = 0;
    function Probe(): React.JSX.Element {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return <React.Fragment />;
    }
    const stack = createOverlayStack<OverlayPayload>();
    const popup = new PopupModel('sv-string-viewer', { model: null });
    registerPopup(popup, stack);
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    // Splice the probe into the live payload's content.
    const entry = stack.entries()[0]!;
    const original = entry.payload.renderContent.bind(entry.payload);
    entry.payload.renderContent = () => (
      <React.Fragment>
        <Probe />
        {original()}
      </React.Fragment>
    );
    const child = new PopupModel('sv-string-viewer', { model: null });
    registerPopup(child, stack);
    act(() => {
      // Force a re-render so the probe mounts once while active.
      child.show();
    });
    expect(mounts).toBe(1);
    act(() => {
      child.hide(); // ack from DefaultPresenter effect restores parent
    });
    expect(mounts).toBe(1); // suspend->restore never remounted content
  });

  it('a popup shown BEFORE the host subscribes still presents (post-subscribe reconciliation)', () => {
    const stack = createOverlayStack<OverlayPayload>();
    const popup = new PopupModel('sv-string-viewer', { model: null });
    registerPopup(popup, stack);
    popup.show(); // pushed before OverlayHost ever mounts/subscribes
    render(<OverlayHost stack={stack} />);
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    expect(screen.getByTestId('overlay-panel-sheet')).toBeTruthy();
  });

  it('Android back is a NO-OP while the top entry is dismissing under a delayed presenter', () => {
    const parentCancel = jest.fn();
    const stack = createOverlayStack<OverlayPayload>();
    const parent = new PopupModel(
      'sv-string-viewer',
      { model: null },
      {
        onCancel: parentCancel,
      }
    );
    const child = new PopupModel('sv-string-viewer', { model: null });
    registerPopup(parent, stack);
    registerPopup(child, stack);
    // Delayed presenter: never acks dismissal on its own.
    function Frozen(_props: OverlayPresenterProps): React.JSX.Element {
      return <React.Fragment />;
    }
    render(
      <OverlayPresenterContext.Provider value={Frozen}>
        <OverlayHost stack={stack} />
      </OverlayPresenterContext.Provider>
    );
    act(() => {
      parent.show();
      child.show();
      child.hide(); // dismissing, ack pending forever
    });
    act(() => {
      fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    });
    // The suspended parent must NOT receive the cancel.
    expect(parentCancel).not.toHaveBeenCalled();
    expect(parent.isVisible).toBe(true);
  });

  it('a factory miss renders a fallback panel with a single Close action wired to HIDE', () => {
    const onCancel = jest.fn();
    const onHide = jest.fn();
    const stack = createOverlayStack<OverlayPayload>();
    const popup = new PopupModel(
      'sv-no-such-component',
      { model: null },
      {
        onCancel,
        onHide,
      }
    );
    registerPopup(popup, stack);
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    const close = screen.getByTestId('overlay-fallback-close');
    // No cancel/apply footer on the fallback panel.
    expect(screen.queryByTestId('overlay-action-cancel')).toBeNull();
    act(() => {
      fireEvent.press(close);
    });
    expect(onCancel).not.toHaveBeenCalled(); // HIDE, not cancel
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(stack.entries()).toHaveLength(0);
  });

  it('showCloseButton renders a header close affordance running the CANCEL sequence', () => {
    const onCancel = jest.fn();
    const stack = createOverlayStack<OverlayPayload>();
    const popup = new PopupModel(
      'sv-string-viewer',
      { model: null },
      {
        onCancel,
      }
    );
    popup.showCloseButton = true;
    registerPopup(popup, stack);
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    // Icon-only ✕ close must carry an accessible name (a11y-high).
    const closeBtn = screen.getByTestId('overlay-close');
    expect(closeBtn.props.accessibilityLabel).toBe('Close');
    act(() => {
      fireEvent.press(closeBtn);
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(stack.entries()).toHaveLength(0);
  });

  it('iOS accessibility escape on a sheet panel dismisses without cancel', () => {
    // Same upstream Escape mapping as Android back; the dialog-cancels
    // case is pinned in dismiss-semantics.test.tsx.
    const onCancel = jest.fn();
    const stack = createOverlayStack<OverlayPayload>();
    const popup = new PopupModel(
      'sv-string-viewer',
      { model: null },
      {
        onCancel,
      }
    );
    registerPopup(popup, stack);
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    act(() => {
      fireEvent(
        screen.getByTestId('overlay-panel-sheet'),
        'accessibilityEscape'
      );
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(popup.isVisible).toBe(false);
  });
});

describe('OverlayHost — real sv-list lazy re-arm across reopen (verification matrix)', () => {
  it('endReached fires the observer per open while data remains; reopen re-arms', async () => {
    const { Action, ListModel } =
      jest.requireActual<typeof import('../../core/facade')>(
        '../../core/facade'
      );
    const actions = Array.from(
      { length: 12 },
      (_, i) => new Action({ id: `a${i}`, title: `a${i}`, visible: true })
    );
    const listModel = new ListModel({
      items: actions,
      onSelectionChanged: () => undefined,
      allowSelection: true,
    } as never);
    const observed: boolean[] = [];
    listModel.isAllDataLoaded = false;
    listModel.loadingIndicatorVisibilityObserver = (isVisible: boolean) => {
      observed.push(isVisible);
    };
    const stack = createOverlayStack<OverlayPayload>();
    const popup = new PopupModel('sv-list', { model: listModel });
    registerPopup(popup, stack);
    render(<OverlayHost stack={stack} />);
    await act(async () => {
      popup.show();
      await Promise.resolve();
    });
    fireEvent(screen.getByTestId('sv-list-flatlist'), 'endReached');
    expect(observed).toEqual([true]);
    // Owner loads a page; core marks everything loaded; the gate closes.
    act(() => {
      listModel.isAllDataLoaded = true;
    });
    fireEvent(screen.getByTestId('sv-list-flatlist'), 'endReached');
    expect(observed).toEqual([true]);
    // Close, owner resets for the next open (2.3 adapter behavior),
    // reopen: a FRESH entry/picker re-arms the same observer.
    await act(async () => {
      popup.hide();
      await Promise.resolve();
    });
    expect(stack.entries()).toHaveLength(0);
    listModel.isAllDataLoaded = false;
    await act(async () => {
      popup.show();
      await Promise.resolve();
    });
    fireEvent(screen.getByTestId('sv-list-flatlist'), 'endReached');
    expect(observed).toEqual([true, true]);
  });

  it("a footer action carrying 'sd-btn--danger' innerCss renders the danger variant", () => {
    const stack = createOverlayStack<OverlayPayload>();
    const popup = new PopupModel(
      'sv-string-viewer',
      { model: null },
      {
        isModal: true,
      }
    );
    registerPopup(popup, stack);
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    const apply = stack
      .entries()[0]!
      .payload.footerActions.getActionById('apply')! as unknown as {
      innerCss: string;
    };
    act(() => {
      apply.innerCss = 'sd-btn--danger';
    });
    const button = screen.getByTestId('overlay-action-apply');
    const dangerStyle = StyleSheet.flatten(button.props.style);
    // The danger recipe paints the destructive background (red-family),
    // distinct from the default variant.
    const other = StyleSheet.flatten(
      screen.getByTestId('overlay-action-cancel').props.style
    );
    expect(dangerStyle.backgroundColor).toBeTruthy();
    expect(dangerStyle.backgroundColor).not.toBe(other.backgroundColor);
  });
});

describe('OverlayHost — opener focus restoration (2.3 seam)', () => {
  it('restores a11y focus to the opener handle when the entry unmounts after dismissal', () => {
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    try {
      const stack = createOverlayStack<OverlayPayload>();
      const popup = new PopupModel('sv-string-viewer', { model: null });
      registerPopup(popup, stack, { openerHandle: () => 77 });
      render(<OverlayHost stack={stack} />);
      act(() => {
        popup.show();
      });
      focusSpy.mockClear();
      act(() => {
        popup.hide(); // default presenter acks; entry unmounts
      });
      expect(focusSpy).toHaveBeenCalledWith(77);
    } finally {
      focusSpy.mockRestore();
    }
  });

  it('does NOT restore opener focus on a StrictMode setup→cleanup→setup mount (PR #29 review, major #5)', () => {
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    try {
      const stack = createOverlayStack<OverlayPayload>();
      const popup = new PopupModel('sv-string-viewer', { model: null });
      registerPopup(popup, stack, { openerHandle: () => 77 });
      render(
        <React.StrictMode>
          <OverlayHost stack={stack} />
        </React.StrictMode>
      );
      act(() => {
        popup.show(); // opens; StrictMode double-invokes effects
      });
      // Focus returns to the opener only when the stack fully empties —
      // never while a popup is merely shown.
      expect(focusSpy).not.toHaveBeenCalledWith(77);
    } finally {
      focusSpy.mockRestore();
    }
  });

  it('a hide→show reselect (stack never empties) does NOT steal focus to the opener (PR #29 review r2 #5)', () => {
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    try {
      const stack = createOverlayStack<OverlayPayload>();
      const popupA = new PopupModel('sv-string-viewer', { model: null });
      const popupB = new PopupModel('sv-string-viewer', { model: null });
      registerPopup(popupA, stack, { openerHandle: () => 77 });
      registerPopup(popupB, stack, { openerHandle: () => 88 });
      render(<OverlayHost stack={stack} />);
      act(() => {
        popupA.show();
      });
      focusSpy.mockClear();
      // Reselect: open B before A is gone — the stack never reaches
      // empty, so the opener must NOT be refocused mid-swap.
      act(() => {
        popupB.show();
        popupA.hide();
      });
      expect(focusSpy).not.toHaveBeenCalledWith(77);
      // Now genuinely close everything → the last opener is restored.
      focusSpy.mockClear();
      act(() => {
        popupB.hide();
      });
      expect(focusSpy).toHaveBeenCalledWith(88);
    } finally {
      focusSpy.mockRestore();
    }
  });

  it('a nested popup dismissed together with its host in one batch restores the SESSION ROOT opener (PR #29 review r3 #1)', () => {
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    try {
      const stack = createOverlayStack<OverlayPayload>();
      const host = new PopupModel('sv-string-viewer', { model: null });
      const nested = new PopupModel('sv-string-viewer', { model: null });
      // 77 = the ROOT opener (e.g. the dropdown control); 88 = a nested
      // popup opened over it whose opener lives inside the Modal.
      registerPopup(host, stack, { openerHandle: () => 77 });
      registerPopup(nested, stack, { openerHandle: () => 88 });
      render(<OverlayHost stack={stack} />);
      act(() => {
        host.show(); // root entry active
      });
      act(() => {
        nested.show(); // root suspended beneath the nested entry
      });
      focusSpy.mockClear();
      // Both dismissed in ONE batch — no intermediate render promotes the
      // root, so keying on the top `active` entry would strand 88.
      act(() => {
        nested.hide();
        host.hide();
      });
      expect(focusSpy).toHaveBeenCalledWith(77);
      expect(focusSpy).not.toHaveBeenCalledWith(88);
    } finally {
      focusSpy.mockRestore();
    }
  });

  it('restores the opener even when a descendant presenter effect hides the popup on mount (PR #29 review r5 #1)', () => {
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    try {
      // A presenter that hides its entry immediately from a mount effect
      // (descendant passive effects run BEFORE the host's), flipping the
      // live entry to dismissing. The host's render-time opener snapshot
      // must still drive the restore.
      function HidingPresenter(
        props: OverlayPresenterProps
      ): React.JSX.Element {
        const { visible, requestHide, entry, onDidDismiss } = props;
        React.useEffect(() => {
          if (visible) requestHide();
        }, [visible, requestHide]);
        // Ack the dismissal so the entry actually leaves the stack.
        React.useEffect(() => {
          if (entry.state === 'dismissing') onDidDismiss();
        }, [entry.state, onDidDismiss]);
        return <View testID="hiding-presenter" />;
      }
      const stack = createOverlayStack<OverlayPayload>();
      const popup = new PopupModel('sv-string-viewer', { model: null });
      registerPopup(popup, stack, { openerHandle: () => 77 });
      render(
        <OverlayPresenterContext.Provider value={HidingPresenter}>
          <OverlayHost stack={stack} />
        </OverlayPresenterContext.Provider>
      );
      act(() => {
        popup.show();
      });
      expect(focusSpy).toHaveBeenCalledWith(77);
    } finally {
      focusSpy.mockRestore();
    }
  });
});
