/**
 * 2.1 OverlayHost (design D2/D7/D8) — single persistent RN Modal over
 * the entry stack; suspended entries stay MOUNTED but isolated; the
 * presenter protocol (visible/requestHide/requestCancel/onDidShow/
 * onDidDismiss) is injectable via OverlayPresenterContext.
 */
import * as React from 'react';
import { Modal } from 'react-native';
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

  it('backdrop press cancels a sheet but NOT a modal dialog', () => {
    const sheetCancel = jest.fn();
    const sheet = harness({ onCancel: sheetCancel });
    const view = render(<OverlayHost stack={sheet.stack} />);
    act(() => {
      sheet.popup.show();
    });
    fireEvent.press(screen.getByTestId('overlay-backdrop'));
    expect(sheetCancel).toHaveBeenCalledTimes(1);
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

  it('Android back (onRequestClose) runs the cancel sequence on the ACTIVE entry', () => {
    const onCancel = jest.fn();
    const { stack, popup } = harness({ onCancel });
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    act(() => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
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
    act(() => {
      fireEvent.press(screen.getByTestId('overlay-close'));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(stack.entries()).toHaveLength(0);
  });

  it('iOS accessibility escape on the panel runs the cancel sequence', () => {
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
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
