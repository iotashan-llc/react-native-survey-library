/**
 * `<Survey>` lifecycle-bridge wiring (design: docs/design/1.1-survey-root.md,
 * "Bridge wiring"; 1.2 design "Sequencing" — 1.1 owns install/uninstall on
 * mount/model-swap/unmount, ScrollView host registration, and the
 * render-complete call mirroring core afterRenderPage: a pending
 * `focusingQuestionInfo` -> `focusQuestionInfo()`, else
 * `scrollToTopOnPageChange` — either/or, never both).
 *
 * The bridge and registry modules are MOCKED — these tests pin 1.1's
 * call-site contract against the 1.2 API skeleton, not the bridge's own
 * behavior (that's 1.2's suite). `scrollToTopOnPageChange` is spied to a
 * no-op: with no canceling bridge subscriber, the real funnel would reach
 * core's unguarded `settings.environment` destructure.
 */
import * as React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import { RNElementFactory } from '../../factories/ElementFactory';
import { Survey } from '../Survey';
import { installLifecycleBridge } from '../../lifecycle/bridge';
import { createLifecycleRegistry } from '../../lifecycle/registry';
import { LifecycleContext } from '../../lifecycle/LifecycleContext';
import type {
  LifecycleRegistry,
  ScrollHostHandle,
} from '../../lifecycle/types';

jest.mock('../../lifecycle/bridge', () => ({
  installLifecycleBridge: jest.fn(() => jest.fn()),
}));

jest.mock('../../lifecycle/registry', () => ({
  createLifecycleRegistry: jest.fn((): LifecycleRegistry => ({
    registerElement: jest.fn(() => () => undefined),
    registerScrollHost: jest.fn(() => () => undefined),
    getHandle: jest.fn(() => undefined),
    getScrollHost: jest.fn(() => undefined),
    resolveScrollTarget: jest.fn(() => null),
    clear: jest.fn(),
  })),
}));

const mockInstall = installLifecycleBridge as jest.MockedFunction<
  typeof installLifecycleBridge
>;
const mockCreateRegistry = createLifecycleRegistry as jest.MockedFunction<
  typeof createLifecycleRegistry
>;

const JSON_A = {
  pages: [
    { name: 'p1', elements: [{ type: 'text', name: 'q1' }] },
    { name: 'p2', elements: [{ type: 'text', name: 'q2' }] },
  ],
};

function lastRegistry(): LifecycleRegistry {
  const result =
    mockCreateRegistry.mock.results[mockCreateRegistry.mock.results.length - 1];
  return result!.value as LifecycleRegistry;
}

function lastUninstall(): jest.Mock {
  const result = mockInstall.mock.results[mockInstall.mock.results.length - 1];
  return result!.value as jest.Mock;
}

beforeEach(() => {
  mockInstall.mockClear();
  mockCreateRegistry.mockClear();
});

describe('<Survey> bridge wiring', () => {
  it('installs the bridge on mount with the survey and a fresh registry; uninstalls on unmount', () => {
    const model = new Model(JSON_A);
    const { unmount } = render(<Survey model={model} />);
    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(mockInstall).toHaveBeenCalledWith(
      model,
      lastRegistry(),
      expect.anything()
    );
    const uninstall = lastUninstall();
    expect(uninstall).not.toHaveBeenCalled();
    unmount();
    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it('model swap uninstalls the old bridge and installs a fresh one with a fresh registry', () => {
    const modelA = new Model(JSON_A);
    const modelB = new Model(JSON_A);
    const { rerender } = render(<Survey model={modelA} />);
    const firstUninstall = lastUninstall();
    const firstRegistry = lastRegistry();
    rerender(<Survey model={modelB} />);
    expect(firstUninstall).toHaveBeenCalledTimes(1);
    expect(mockInstall).toHaveBeenCalledTimes(2);
    const secondCall = mockInstall.mock.calls[1]!;
    expect(secondCall[0]).toBe(modelB);
    expect(secondCall[1]).not.toBe(firstRegistry);
  });

  it('provides the registry to descendants via LifecycleContext', () => {
    const model = new Model(JSON_A);
    let seen: LifecycleRegistry | undefined;
    const Probe = (): null => {
      seen = React.useContext(LifecycleContext)?.registry;
      return null;
    };
    RNElementFactory.registerElement('sv-page', () => <Probe />);
    render(<Survey model={model} />);
    expect(seen).toBe(lastRegistry());
  });
});

describe('<Survey> scroll host', () => {
  it('registers the ScrollView as the scroll host; getViewport answers after layout and tracks scroll', () => {
    const model = new Model(JSON_A);
    const { getByTestId } = render(<Survey model={model} />);
    const registry = lastRegistry();
    const registerScrollHost = registry.registerScrollHost as jest.Mock;
    expect(registerScrollHost).toHaveBeenCalledTimes(1);
    const handle = registerScrollHost.mock.calls[0]![0] as ScrollHostHandle;

    // Before any layout event the viewport is unknown -> null (bridge
    // scrolls unconditionally, degraded but safe).
    expect(handle.getViewport()).toBeNull();

    const scroll = getByTestId('survey-scroll');
    fireEvent(scroll, 'layout', {
      nativeEvent: { layout: { width: 400, height: 600, x: 0, y: 0 } },
    });
    expect(handle.getViewport()).toEqual({ offsetY: 0, height: 600 });

    fireEvent.scroll(scroll, {
      nativeEvent: {
        contentOffset: { y: 120 },
        layoutMeasurement: { width: 400, height: 600 },
        contentSize: { width: 400, height: 2000 },
      },
    });
    expect(handle.getViewport()).toEqual({ offsetY: 120, height: 600 });
  });

  it('measureTarget resolves null for an unmounted/absent target ref', async () => {
    const model = new Model(JSON_A);
    render(<Survey model={model} />);
    const registry = lastRegistry();
    const handle = (registry.registerScrollHost as jest.Mock).mock
      .calls[0]![0] as ScrollHostHandle;
    await expect(handle.measureTarget({ current: null })).resolves.toBeNull();
  });
});

describe('<Survey> page-change render-complete call', () => {
  it('calls survey.scrollToTopOnPageChange after the active page changes', () => {
    const model = new Model(JSON_A);
    const spy = jest
      .spyOn(model, 'scrollToTopOnPageChange')
      .mockImplementation(() => undefined);
    render(<Survey model={model} />);
    expect(spy).not.toHaveBeenCalled(); // mount is not a page CHANGE
    act(() => {
      model.nextPage();
    });
    expect(spy).toHaveBeenCalled();
  });

  it('routes render-complete to focusQuestionInfo INSTEAD of scrolling when a focus is pending (core afterRenderPage parity, survey.ts:5514-5519)', () => {
    const model = new Model(JSON_A);
    type FocusInternals = {
      focusingQuestionInfo?: unknown;
      focusQuestionInfo(): void;
    };
    const internals = model as unknown as FocusInternals;
    const scrollSpy = jest
      .spyOn(model, 'scrollToTopOnPageChange')
      .mockImplementation(() => undefined);
    const focusSpy = jest
      .spyOn(internals, 'focusQuestionInfo')
      .mockImplementation(() => undefined);
    render(<Survey model={model} />);
    internals.focusingQuestionInfo = { question: undefined, onError: false };
    act(() => {
      model.nextPage();
    });
    expect(focusSpy).toHaveBeenCalled();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('does not call scrollToTopOnPageChange when the survey leaves the running state', () => {
    const model = new Model(JSON_A);
    const spy = jest
      .spyOn(model, 'scrollToTopOnPageChange')
      .mockImplementation(() => undefined);
    render(<Survey model={model} />);
    act(() => {
      model.doComplete();
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
