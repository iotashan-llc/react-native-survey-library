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
