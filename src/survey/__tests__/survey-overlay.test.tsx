/**
 * 2.1 shell integration — the Survey root owns an overlay stack + host
 * and the `onOpenDropdownMenu` device adapter (design D3: fill-if-
 * untouched, identity unsubscribe).
 */
import * as React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

describe('Survey shell — device adapter untouched-detection (review round 1)', () => {
  function fire(model: InstanceType<typeof Model>, options: unknown): void {
    act(() => {
      (
        model as unknown as {
          onOpenDropdownMenu: {
            fire(sender: unknown, options: unknown): void;
          };
        }
      ).onOpenDropdownMenu.fire(model, options);
    });
  }

  it('an explicit consumer screenWidth of 0 is preserved (nullish, not falsy, detection)', () => {
    const model = new Model(JSON_A);
    render(<Survey model={model as never} />);
    const options = {
      menuType: 'popup',
      deviceType: 'mobile',
      screenWidth: 0,
      screenHeight: undefined,
    } as never;
    fire(model, options);
    const seen = options as unknown as {
      screenWidth: number;
      screenHeight: number;
    };
    expect(seen.screenWidth).toBe(0);
    expect(typeof seen.screenHeight).toBe('number');
    expect(seen.screenHeight).toBeGreaterThan(0);
  });

  it('a NONDEFAULT consumer deviceType survives even when dims were missing', () => {
    const model = new Model(JSON_A);
    render(<Survey model={model as never} />);
    const options = {
      menuType: 'dropdown',
      deviceType: 'desktop', // consumer's explicit choice
      screenWidth: undefined,
      screenHeight: undefined,
    } as never;
    fire(model, options);
    expect((options as unknown as { deviceType: string }).deviceType).toBe(
      'desktop'
    );
  });

  it('consumer-supplied dims drive the tablet refinement of a default deviceType', () => {
    const model = new Model(JSON_A);
    render(<Survey model={model as never} />);
    const options = {
      menuType: 'popup',
      deviceType: 'mobile', // core blind default
      screenWidth: 800,
      screenHeight: 1200,
    } as never;
    fire(model, options);
    expect((options as unknown as { deviceType: string }).deviceType).toBe(
      'tablet'
    );
  });

  it('a consumer handler registered AFTER mount runs after the adapter and owns its mutations (core parity: nothing recomputes deviceType)', () => {
    const model = new Model(JSON_A);
    render(<Survey model={model} />);
    // Late consumer: rewrites dims and deviceType wholesale.
    (
      model as unknown as {
        onOpenDropdownMenu: {
          add(fn: (s: unknown, o: Record<string, unknown>) => void): void;
        };
      }
    ).onOpenDropdownMenu.add((_s, opt) => {
      opt.screenWidth = 800;
      opt.screenHeight = 1200;
      opt.deviceType = 'desktop';
    });
    const options = {
      menuType: 'popup',
      deviceType: 'mobile',
      screenWidth: undefined,
      screenHeight: undefined,
    } as never;
    fire(model, options);
    const seen = options as unknown as {
      deviceType: string;
      screenWidth: number;
    };
    // The late handler's values stand — same as core, where deviceType
    // is computed once before the event and never recomputed.
    expect(seen.deviceType).toBe('desktop');
    expect(seen.screenWidth).toBe(800);
  });
});

describe('Survey shell — dialog host registration (task 2.2)', () => {
  it('mounting installs the dialog dispatcher; core confirms route to THIS survey overlay; unmount tears down', () => {
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
    model.data = { pd: [{ inner: 'a' }, { inner: 'b' }] };
    const view = render(<Survey model={model as never} />);
    const question = model.getQuestionByName('pd') as unknown as {
      panelCount: number;
      removePanelUI(index: number): void;
    };
    act(() => {
      question.removePanelUI(0);
    });
    // The confirm dialog presented through the Survey's own overlay.
    expect(screen.getByTestId('overlay-panel-dialog')).toBeTruthy();
    act(() => {
      // Cancel keeps the panel.
      fireEvent.press(screen.getByTestId('overlay-action-cancel'));
    });
    view.unmount();
    // Post-unmount: a stray confirm resolves cancel (fail-safe), no throw.
    expect(question.panelCount).toBe(2);
    act(() => {
      question.removePanelUI(0);
    });
    expect(question.panelCount).toBe(2);
  });
});

describe('Survey shell — StrictMode dialog host (D8.7)', () => {
  it('StrictMode double-mount keeps a working dialog host; final unmount leaves none', () => {
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
    model.data = { pd: [{ inner: 'a' }, { inner: 'b' }] };
    const view = render(
      <React.StrictMode>
        <Survey model={model as never} />
      </React.StrictMode>
    );
    const question = model.getQuestionByName('pd') as unknown as {
      panelCount: number;
      removePanelUI(index: number): void;
    };
    act(() => {
      question.removePanelUI(0);
    });
    // The confirm presents despite StrictMode's mount/unmount/mount.
    expect(screen.getByTestId('overlay-panel-dialog')).toBeTruthy();
    // Core retitled the buttons through the returned handle (locale
    // strings — confirm-dialog.ts:50-52).
    expect(screen.getByText('OK')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    act(() => {
      fireEvent.press(screen.getByTestId('overlay-action-apply'));
    });
    expect(question.panelCount).toBe(1);
    view.unmount();
    // Post-unmount confirm resolves cancel silently (fail-safe).
    act(() => {
      question.removePanelUI(0);
    });
    expect(question.panelCount).toBe(1);
  });
});
