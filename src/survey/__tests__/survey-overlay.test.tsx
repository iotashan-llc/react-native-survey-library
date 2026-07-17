/**
 * 2.1 shell integration — the Survey root owns an overlay stack + host
 * and the `onOpenDropdownMenu` device adapter (design D3: fill-if-
 * untouched, identity unsubscribe).
 */
import * as React from 'react';
import { Modal } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { Model, PopupModel } from '../../core/facade';
import '../../factories/register-all';
import { Survey } from '../Survey';
import { OverlayContext } from '../../overlay/OverlayContext';
import { registerPopup } from '../../overlay/popup-bridge';
import type { OverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';

const JSON_A = { elements: [{ type: 'text', name: 'q1' }] };

describe('Survey shell — overlay host', () => {
  it('provides a stack via OverlayContext and mounts the host Modal', () => {
    let seen: OverlayStack<OverlayPayload> | null = null;
    function Probe(): null {
      seen = React.useContext(OverlayContext);
      return null;
    }
    const model = new Model(JSON_A);
    (model as unknown as { pageComponent: string }).pageComponent =
      'overlay-probe';
    const { RNElementFactory } = jest.requireActual<
      typeof import('../../factories/ElementFactory')
    >('../../factories/ElementFactory');
    RNElementFactory.registerElement('overlay-probe', () => <Probe key="p" />);
    render(<Survey model={model as never} />);
    expect(seen).not.toBeNull();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    // A popup registered against the survey's stack presents through the
    // shell's host.
    const popup = new PopupModel('sv-string-viewer', { model: null });
    registerPopup(popup, seen!);
    act(() => {
      popup.show();
    });
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
  });
});

describe('Survey shell — onOpenDropdownMenu device adapter', () => {
  it('fills MISSING screen dims (and derives deviceType) without touching consumer-set fields', () => {
    const model = new Model(JSON_A);
    render(<Survey model={model as never} />);
    // Core computed with no DOM window: dims undefined.
    const options = {
      menuType: 'popup',
      deviceType: 'mobile',
      hasTouchScreen: true,
      screenHeight: undefined,
      screenWidth: undefined,
    } as never;
    act(() => {
      (
        model as unknown as {
          onOpenDropdownMenu: {
            fire(sender: unknown, options: unknown): void;
          };
        }
      ).onOpenDropdownMenu.fire(model, options);
    });
    const filled = options as unknown as {
      screenWidth: number;
      screenHeight: number;
      menuType: string;
    };
    expect(typeof filled.screenWidth).toBe('number');
    expect(filled.screenWidth).toBeGreaterThan(0);
    expect(typeof filled.screenHeight).toBe('number');
    expect(filled.menuType).toBe('popup'); // untouched
  });

  it('a consumer listener registered BEFORE mount keeps its mutation (fill-if-untouched)', () => {
    const model = new Model(JSON_A);
    model.onOpenDropdownMenu.add((_sender, options) => {
      (options as { menuType: string }).menuType = 'dropdown';
      (options as { screenWidth: number }).screenWidth = 1234;
    });
    render(<Survey model={model as never} />);
    const options = {
      menuType: 'popup',
      deviceType: 'mobile',
      hasTouchScreen: true,
      screenHeight: undefined,
      screenWidth: undefined,
    } as never;
    act(() => {
      (
        model as unknown as {
          onOpenDropdownMenu: {
            fire(sender: unknown, options: unknown): void;
          };
        }
      ).onOpenDropdownMenu.fire(model, options);
    });
    const result = options as unknown as {
      menuType: string;
      screenWidth: number;
    };
    expect(result.menuType).toBe('dropdown'); // consumer wins
    expect(result.screenWidth).toBe(1234); // consumer-set: never clobbered
  });

  it('unsubscribes on unmount (identity-based)', () => {
    const model = new Model(JSON_A);
    const baseline = model.onOpenDropdownMenu.length;
    const view = render(<Survey model={model as never} />);
    expect(model.onOpenDropdownMenu.length).toBe(baseline + 1);
    view.unmount();
    expect(model.onOpenDropdownMenu.length).toBe(baseline);
  });
});
