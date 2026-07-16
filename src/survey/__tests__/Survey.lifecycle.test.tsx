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
  LifecycleBridgeOptions,
  LifecycleRegistry,
  ScrollHostHandle,
  ScrollRequestInfo,
} from '../../lifecycle/types';

jest.mock('../../lifecycle/bridge', () => ({
  installLifecycleBridge: jest.fn(() => jest.fn()),
}));

jest.mock('../../lifecycle/registry', () => ({
  ...jest.requireActual('../../lifecycle/registry'),
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

describe('<Survey> onScrollToElement consult wiring (bridge onScrollRequest seam)', () => {
  function lastOptions(): LifecycleBridgeOptions {
    const call = mockInstall.mock.calls[mockInstall.mock.calls.length - 1]!;
    return call[2] as LifecycleBridgeOptions;
  }

  function requestInfoFor(
    model: InstanceType<typeof Model>
  ): ScrollRequestInfo {
    const question = model.getQuestionByName('q1');
    return {
      element: question,
      question,
      page: model.pages[0]!,
      viaPageFallback: false,
    } as unknown as ScrollRequestInfo;
  }

  it('consults the prop handler with the element name; no preventDefault -> scroll allowed (true)', () => {
    const model = new Model(JSON_A);
    const handler = jest.fn();
    render(<Survey model={model} onScrollToElement={handler} />);
    const consult = lastOptions().onScrollRequest;
    expect(consult).toBeDefined();
    const allowed = consult!(requestInfoFor(model));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toMatchObject({ elementName: 'q1' });
    expect(allowed).toBe(true);
  });

  it('preventDefault() suppresses the native scroll (returns false)', () => {
    const model = new Model(JSON_A);
    const handler = jest.fn((event: { preventDefault(): void }): void =>
      event.preventDefault()
    );
    render(<Survey model={model} onScrollToElement={handler} />);
    const allowed = lastOptions().onScrollRequest!(requestInfoFor(model));
    expect(allowed).toBe(false);
  });

  it('consults the LATEST handler identity without reinstalling; absent handler allows the scroll', () => {
    const model = new Model(JSON_A);
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(
      <Survey model={model} onScrollToElement={first} />
    );
    rerender(<Survey model={model} onScrollToElement={second} />);
    expect(mockInstall).toHaveBeenCalledTimes(1); // no reinstall on prop swap
    expect(lastOptions().onScrollRequest!(requestInfoFor(model))).toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    rerender(<Survey model={model} />);
    expect(lastOptions().onScrollRequest!(requestInfoFor(model))).toBe(true);
    expect(second).toHaveBeenCalledTimes(1); // removed handler not consulted
  });
});

describe('<Survey> render-complete: core afterRenderPage machine (review round 1)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('mount defers scrollToTopOnPageChange(false) (the initial autofocus path); a page change defers (true)', () => {
    const model = new Model(JSON_A);
    const spy = jest
      .spyOn(model, 'scrollToTopOnPageChange')
      .mockImplementation(() => undefined);
    render(<Survey model={model} />);
    expect(spy).not.toHaveBeenCalled(); // deferred via setTimeout(…, 1)
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(spy).toHaveBeenCalledWith(false); // isCurrentPageRendered undefined
    spy.mockClear();
    act(() => {
      model.nextPage();
    });
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(spy).toHaveBeenCalledWith(true); // page change reset the flag
  });

  it('a pending focusingQuestionInfo suppresses the scroll and routes to focusQuestionInfo (survey.ts:5514-5519)', () => {
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
    act(() => {
      jest.advanceTimersByTime(2);
    });
    scrollSpy.mockClear();
    internals.focusingQuestionInfo = { question: undefined, onError: false };
    act(() => {
      model.nextPage();
    });
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(focusSpy).toHaveBeenCalled();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('suppresses the scroll entirely in design mode (isDesignMode gate the old seam lacked)', () => {
    const model = new Model(JSON_A);
    (model as unknown as { setDesignMode(on: boolean): void }).setDesignMode(
      true
    );
    const spy = jest
      .spyOn(model, 'scrollToTopOnPageChange')
      .mockImplementation(() => undefined);
    render(<Survey model={model} />);
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('schedules no NEW render-complete call after the survey leaves the running state', () => {
    const model = new Model(JSON_A);
    const spy = jest
      .spyOn(model, 'scrollToTopOnPageChange')
      .mockImplementation(() => undefined);
    render(<Survey model={model} />);
    act(() => {
      jest.advanceTimersByTime(2);
    });
    spy.mockClear();
    act(() => {
      model.doComplete();
    });
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fires render-complete exactly once per page: once on mount (mount-reconciliation update included), never on unrelated model updates, once per page change (review round 2)', () => {
    const model = new Model(JSON_A);
    const spy = jest
      .spyOn(
        model as unknown as { afterRenderPage(el: unknown): void },
        'afterRenderPage'
      )
      .mockImplementation(() => undefined);
    render(<Survey model={model} />);
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => {
      model.title = 'changed'; // unrelated model update re-renders the root
    });
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => {
      model.nextPage();
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a same-PageModel remount after completed→clear() re-fires render-complete (gate resets when no page presents — review round 3)', () => {
    const onePage = {
      pages: [{ name: 'only', elements: [{ type: 'text', name: 'q1' }] }],
    };
    const model = new Model(onePage);
    const spy = jest
      .spyOn(
        model as unknown as { afterRenderPage(el: unknown): void },
        'afterRenderPage'
      )
      .mockImplementation(() => undefined);
    render(<Survey model={model} />);
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => {
      model.doComplete();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => {
      model.clear(); // back to running — SAME PageModel instance
    });
    expect(model.state).toBe('running');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('core still invokes renderCallback (behavioral drift gate for the not-listable member)', () => {
    const model = new Model(JSON_A);
    render(<Survey model={model} />);
    const callback = jest.fn();
    model.renderCallback = callback;
    (model as unknown as { render(el?: unknown): void }).render();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('<Survey> model swap is an ordered transaction (review round 1)', () => {
  const JSON_B = {
    pages: [{ name: 'p1', elements: [{ type: 'text', name: 'qb' }] }],
  };
  const THEME = { cssVariables: { '--sjs-general-backcolor': '#ffffff' } };

  it('detaches the old root wiring BEFORE disposing; theme/mobile land on the NEW model; the ref never exposes the old model after the swap', () => {
    const log: string[] = [];
    const applyThemeTargets: unknown[] = [];
    const realDispose = Model.prototype.dispose;
    const realApplyTheme = Model.prototype.applyTheme;
    const disposeSpy = jest
      .spyOn(Model.prototype, 'dispose')
      .mockImplementation(function (this: InstanceType<typeof Model>) {
        const events = this as unknown as {
          onComplete: { isEmpty: boolean };
          renderCallback?: () => void;
          hasActiveUISubscribers: boolean;
          activePage?: { hasActiveUISubscribers: boolean } | null;
        };
        // Two-phase contract (review round 2): by dispose time the keyed
        // remount has unmounted the ENTIRE old tree — no 0.4 reactive
        // subscriber (root, page, question) may still be attached.
        const pageSubscribers =
          events.activePage?.hasActiveUISubscribers ?? false;
        log.push(
          `dispose(handlersDetached=${events.onComplete.isEmpty},` +
            `renderCallbackCleared=${events.renderCallback === undefined},` +
            `uiSubscribers=${events.hasActiveUISubscribers},` +
            `pageSubscribers=${pageSubscribers})`
        );
        realDispose.call(this);
      });
    const themeSpy = jest
      .spyOn(Model.prototype, 'applyTheme')
      .mockImplementation(function (
        this: InstanceType<typeof Model>,
        theme: Parameters<typeof realApplyTheme>[0]
      ) {
        applyThemeTargets.push(this);
        log.push('applyTheme');
        realApplyTheme.call(this, theme);
      });
    mockInstall.mockImplementation(() => {
      const uninstall = jest.fn(() => {
        log.push('bridgeUninstall');
      });
      return uninstall;
    });
    try {
      // Owned-json path: the component constructs AND disposes the model.
      const ref = React.createRef<import('../Survey').SurveyRefHandle>();
      const onComplete = jest.fn();
      const { rerender } = render(
        <Survey ref={ref} json={JSON_A} theme={THEME} onComplete={onComplete} />
      );
      const oldModel = ref.current!.model!;
      log.length = 0; // only observe the SWAP sequence
      applyThemeTargets.length = 0;
      rerender(
        <Survey ref={ref} json={JSON_B} theme={THEME} onComplete={onComplete} />
      );
      const newModel = ref.current!.model!;
      expect(newModel).not.toBe(oldModel);
      // Ordered transaction: bridge uninstall precedes dispose; dispose
      // sees events already detached and renderCallback cleared.
      const uninstallIndex = log.indexOf('bridgeUninstall');
      const disposeIndex = log.findIndex((entry) =>
        entry.startsWith('dispose(')
      );
      expect(uninstallIndex).toBeGreaterThanOrEqual(0);
      expect(disposeIndex).toBeGreaterThanOrEqual(0);
      expect(uninstallIndex).toBeLessThan(disposeIndex);
      expect(log[disposeIndex]).toBe(
        'dispose(handlersDetached=true,renderCallbackCleared=true,' +
          'uiSubscribers=false,pageSubscribers=false)'
      );
      // Theme lands on the NEW model, never re-applied to the old one
      // during the swap.
      expect(applyThemeTargets).toContain(newModel);
      expect(applyThemeTargets).not.toContain(oldModel);
      // The ref exposes the live (new) model.
      expect(ref.current!.model).toBe(newModel);
      expect(oldModel.isDisposed).toBe(true);
    } finally {
      disposeSpy.mockRestore();
      themeSpy.mockRestore();
      mockInstall.mockImplementation(() => jest.fn());
    }
  });
});
