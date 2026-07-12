/**
 * @jest-environment node
 */

// Design: docs/design/1.2-lifecycle-bridge.md, test plan #1-#7, #9, #10.
// Real SurveyModel via the facade (plain Node — no `document`, so
// survey-core takes the same SSR-safe paths RN does; the unguarded
// `settings.environment` destructure reproduces identically), mocked
// handles/host. Fake timers drive the bridge's flush (setTimeout 0) and
// focus-settle (scrollSettleMs) scheduling.
import { Model } from '../../core/facade';
import type { PageModel, Question, SurveyModel } from '../../core/facade';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';
import { installLifecycleBridge } from '../bridge';
import { createLifecycleRegistry } from '../registry';
import type {
  ElementHandle,
  LifecycleBridgeOptions,
  ScrollHostHandle,
  ScrollRequestInfo,
} from '../types';

const TWO_QUESTIONS_JSON = {
  pages: [
    {
      name: 'page1',
      elements: [
        { type: 'text', name: 'q1', isRequired: true },
        { type: 'text', name: 'q2' },
      ],
    },
  ],
};

const TWO_PAGES_JSON = {
  pages: [
    { name: 'page1', elements: [{ type: 'text', name: 'q1' }] },
    { name: 'page2', elements: [{ type: 'text', name: 'q2' }] },
  ],
};

interface MockHandle {
  handle: ElementHandle;
  focusFirst: jest.Mock;
  a11yFocus: jest.Mock;
}

function makeHandle(focusLands: boolean | 'none' = true): MockHandle {
  const focusFirst = jest.fn(() => focusLands === true);
  const a11yFocus = jest.fn();
  const handle: ElementHandle = {
    containerRef: { current: null },
    ...(focusLands === 'none' ? {} : { focusFirst }),
    a11yFocus,
  };
  return { handle, focusFirst, a11yFocus };
}

interface MockHost {
  host: ScrollHostHandle;
  scrollTo: jest.Mock;
  measureTarget: jest.Mock;
  getViewport: jest.Mock;
}

/** Default measurement puts the target BELOW the viewport (must scroll). */
function makeHost(
  measurement: { y: number; height: number } | null = { y: 800, height: 80 },
  viewport: { offsetY: number; height: number } | null = {
    offsetY: 0,
    height: 600,
  }
): MockHost {
  const scrollTo = jest.fn();
  const measureTarget = jest.fn(async () => measurement);
  const getViewport = jest.fn(() => viewport);
  return {
    host: { scrollTo, measureTarget, getViewport },
    scrollTo,
    measureTarget,
    getViewport,
  };
}

interface Harness {
  model: SurveyModel;
  registry: ReturnType<typeof createLifecycleRegistry>;
  uninstall: () => void;
  mockHost: MockHost;
}

function makeHarness(
  json: object,
  options?: LifecycleBridgeOptions,
  withHost = true
): Harness {
  const model = new Model(json) as unknown as SurveyModel;
  const registry = createLifecycleRegistry();
  const mockHost = makeHost();
  if (withHost) registry.registerScrollHost(mockHost.host);
  const uninstall = installLifecycleBridge(model, registry, options);
  return { model, registry, uninstall, mockHost };
}

function getQuestion(model: SurveyModel, name: string): Question {
  const q = model.getQuestionByName(name) as Question;
  expect(q).toBeTruthy();
  return q;
}

async function flushBridge(): Promise<void> {
  await jest.advanceTimersByTimeAsync(0);
}

async function settleScroll(ms = 300): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
}

describe('lifecycle/bridge — installLifecycleBridge', () => {
  let diagnostics: DiagnosticPayload[];

  beforeEach(() => {
    jest.useFakeTimers();
    diagnostics = [];
    setDiagnosticHandler((payload) => diagnostics.push(payload));
  });

  afterEach(() => {
    setDiagnosticHandler(undefined);
    jest.useRealTimers();
  });

  describe('test plan #1 — invalid submit (the A15 headline)', () => {
    it('cancels core scroll (allow=false), never hits the settings.environment destructure, scrolls natively, and completes focus intent', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const mock = makeHandle(true);
      registry.registerElement(q1, mock.handle);

      const seenByConsumer: Array<{ allow: boolean; question: string }> = [];
      model.onScrollToTop.add((_s, opts) => {
        seenByConsumer.push({
          allow: opts.allow,
          question: (opts.question as Question | null)?.name ?? '',
        });
      });
      const focusInSpy = jest.fn();
      model.onFocusInQuestion.add(focusInSpy);

      // The regression that motivated A15: with `settings.environment`
      // undefined this used to throw "Cannot read properties of
      // undefined (reading 'rootElement')".
      expect(() => model.completeLastPage()).not.toThrow();
      expect(model.state).toBe('running');

      // Consumer observability (test plan #9): handler subscribed AFTER
      // install still fired, seeing allow already false.
      expect(seenByConsumer).toEqual([{ allow: false, question: 'q1' }]);

      await flushBridge();
      expect(mockHost.measureTarget).toHaveBeenCalledWith(
        mock.handle.containerRef
      );
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      expect(mockHost.scrollTo).toHaveBeenCalledWith(800, true);

      // Focus completes only after the bounded scroll settle.
      expect(mock.focusFirst).not.toHaveBeenCalled();
      await settleScroll();
      expect(mock.focusFirst).toHaveBeenCalledTimes(1);
      // focusFirst landed (returned true) -> question.focusIn() parity.
      expect(focusInSpy).toHaveBeenCalledTimes(1);
      expect(mock.a11yFocus).not.toHaveBeenCalled();
    });

    it('honors topInset when scrolling', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON, {
        topInset: 50,
      });
      const q1 = getQuestion(model, 'q1');
      registry.registerElement(q1, makeHandle().handle);

      model.completeLastPage();
      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledWith(750, true);
    });
  });

  describe('test plan #2 — scroll-only intent (question null)', () => {
    it('scrolls the page handle without any focus completion', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const page = model.pages[0] as PageModel;
      const mock = makeHandle(true);
      registry.registerElement(page, mock.handle);

      page.scrollToTop();

      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await settleScroll();
      expect(mock.focusFirst).not.toHaveBeenCalled();
      expect(mock.a11yFocus).not.toHaveBeenCalled();
    });
  });

  describe('test plan #3 — cross-page focus', () => {
    it('focusQuestion() changes the page; the 1.1 render-complete simulation re-enters the funnel and lands focus on the new page', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_PAGES_JSON);
      const q2 = getQuestion(model, 'q2');
      const mock = makeHandle(true);
      registry.registerElement(q2, mock.handle);

      expect(model.currentPageNo).toBe(0);
      expect(model.focusQuestion('q2')).toBe(true);
      expect(model.currentPageNo).toBe(1);

      // Two-phase: core parked the focus in focusingQuestionInfo waiting
      // for the page render. Simulate 1.1's render-complete call, which
      // executes the parked focus (web: afterRenderPage does this).
      (
        model as unknown as { focusQuestionInfo: () => void }
      ).focusQuestionInfo();

      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await settleScroll();
      expect(mock.focusFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('test plan #4 — scrollIfVisible semantics', () => {
    it('skips the scroll when the target is already fully visible; focus still runs', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const mock = makeHandle(true);
      registry.registerElement(q1, mock.handle);
      // Fully inside the {offsetY: 0, height: 600} viewport.
      mockHost.measureTarget.mockResolvedValue({ y: 100, height: 80 });

      model.completeLastPage();
      await flushBridge();
      expect(mockHost.scrollTo).not.toHaveBeenCalled();

      // No scroll -> no settle wait; focus completes on the flush.
      expect(mock.focusFirst).toHaveBeenCalledTimes(1);
    });

    it('scrolls unconditionally when the host cannot report a viewport', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      registry.registerElement(q1, makeHandle().handle);
      mockHost.measureTarget.mockResolvedValue({ y: 100, height: 80 });
      mockHost.getViewport.mockReturnValue(null);

      model.completeLastPage();
      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledWith(100, true);
    });
  });

  describe('test plan #5 — install/uninstall lifecycle', () => {
    it('uninstall removes the subscription and clears the registry; later funnel entries are inert', async () => {
      const { model, registry, uninstall, mockHost } =
        makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      registry.registerElement(q1, makeHandle().handle);

      uninstall();
      expect(registry.getHandle(q1)).toBeUndefined();
      expect(registry.getScrollHost()).toBeUndefined();

      // Core proceeds uncanceled now — the facade's settings.environment
      // stub (this task's shim amendment) is what keeps this from
      // throwing.
      expect(() => model.completeLastPage()).not.toThrow();
      await flushBridge();
      await settleScroll();
      expect(mockHost.scrollTo).not.toHaveBeenCalled();
    });

    it('model swap: a fresh install on the new model works; the old model stays inert', async () => {
      const first = makeHarness(TWO_QUESTIONS_JSON);
      first.uninstall();

      const second = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(second.model, 'q1');
      second.registry.registerElement(q1, makeHandle().handle);

      second.model.completeLastPage();
      await flushBridge();
      expect(second.mockHost.scrollTo).toHaveBeenCalledTimes(1);
      expect(first.mockHost.scrollTo).not.toHaveBeenCalled();
    });
  });

  describe('test plan #6 — fallbacks', () => {
    it('unregistered question falls back to its registered page handle; focus intent falls back to a11yFocus', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const page = model.pages[0] as PageModel;
      const pageMock = makeHandle('none');
      registry.registerElement(page, pageMock.handle);

      model.completeLastPage();
      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await settleScroll();
      // No focusFirst on the page handle -> a11y focus lands there.
      expect(pageMock.a11yFocus).toHaveBeenCalledTimes(1);
    });

    it('focusFirst returning false falls back to a11yFocus (no focusIn)', async () => {
      const { model, registry } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const mock = makeHandle(false);
      registry.registerElement(q1, mock.handle);
      const focusInSpy = jest.fn();
      model.onFocusInQuestion.add(focusInSpy);

      model.completeLastPage();
      await flushBridge();
      await settleScroll();
      expect(mock.focusFirst).toHaveBeenCalledTimes(1);
      expect(mock.a11yFocus).toHaveBeenCalledTimes(1);
      expect(focusInSpy).not.toHaveBeenCalled();
    });

    it('no scroll host: no-op + no-scroll-host diagnostic once; focus intent still completes', async () => {
      const { model, registry } = makeHarness(
        TWO_QUESTIONS_JSON,
        undefined,
        false
      );
      const q1 = getQuestion(model, 'q1');
      const mock = makeHandle(true);
      registry.registerElement(q1, mock.handle);

      model.completeLastPage();
      await flushBridge();
      model.completeLastPage();
      await flushBridge();

      const hostDiags = diagnostics.filter(
        (p) =>
          p.code === 'lifecycle-diagnostic' &&
          p.lifecycleCode === 'no-scroll-host'
      );
      expect(hostDiags).toHaveLength(1);
      expect(mock.focusFirst).toHaveBeenCalled();
    });

    it('a REJECTING measureTarget is contained: no scroll, no unhandled rejection, focus intent still completes', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      try {
        const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
        const q1 = getQuestion(model, 'q1');
        const mock = makeHandle(true);
        registry.registerElement(q1, mock.handle);
        mockHost.measureTarget.mockRejectedValue(new Error('host detached'));

        model.completeLastPage();
        await flushBridge();

        expect(mockHost.scrollTo).not.toHaveBeenCalled();
        expect(mock.focusFirst).toHaveBeenCalledTimes(1);
      } finally {
        consoleError.mockRestore();
      }
    });

    it('fully unresolvable target: no scroll, target-unregistered diagnostic', async () => {
      const { model, mockHost } = makeHarness(TWO_QUESTIONS_JSON);

      model.completeLastPage();
      await flushBridge();

      expect(mockHost.scrollTo).not.toHaveBeenCalled();
      const diag = diagnostics.filter(
        (p) =>
          p.code === 'lifecycle-diagnostic' &&
          p.lifecycleCode === 'target-unregistered'
      );
      expect(diag).toHaveLength(1);
    });
  });

  describe('test plan #7 — same-tick coalescing', () => {
    it('two same-tick requests coalesce into ONE scroll to the LAST target', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const q2 = getQuestion(model, 'q2');
      const mock1 = makeHandle(true);
      const mock2 = makeHandle(true);
      registry.registerElement(q1, mock1.handle);
      registry.registerElement(q2, mock2.handle);

      q1.focus();
      q2.focus();

      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      expect(mockHost.measureTarget).toHaveBeenCalledTimes(1);
      expect(mockHost.measureTarget).toHaveBeenCalledWith(
        mock2.handle.containerRef
      );
      await settleScroll();
      expect(mock2.focusFirst).toHaveBeenCalledTimes(1);
      expect(mock1.focusFirst).not.toHaveBeenCalled();
    });
  });

  describe('test plan #10 — the onScrollRequest consult seam', () => {
    it('returning false suppresses the NATIVE SCROLL ONLY: focus intent still completes with focusIn parity', async () => {
      const infos: ScrollRequestInfo[] = [];
      const onScrollRequest = jest.fn((info: ScrollRequestInfo) => {
        infos.push(info);
        return false;
      });
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON, {
        onScrollRequest,
      });
      const q1 = getQuestion(model, 'q1');
      const mock = makeHandle(true);
      registry.registerElement(q1, mock.handle);
      const focusInSpy = jest.fn();
      model.onFocusInQuestion.add(focusInSpy);

      model.completeLastPage();
      await flushBridge();

      expect(mockHost.scrollTo).not.toHaveBeenCalled();
      expect(infos).toHaveLength(1);
      expect(infos[0]?.element).toBe(q1);
      expect(infos[0]?.question).toBe(q1);
      expect(infos[0]?.viaPageFallback).toBe(false);

      expect(mock.focusFirst).toHaveBeenCalledTimes(1);
      expect(focusInSpy).toHaveBeenCalledTimes(1);
    });

    it('returning true keeps the normal scroll path', async () => {
      const onScrollRequest = jest.fn(() => true);
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON, {
        onScrollRequest,
      });
      const q1 = getQuestion(model, 'q1');
      registry.registerElement(q1, makeHandle().handle);

      model.completeLastPage();
      await flushBridge();
      expect(onScrollRequest).toHaveBeenCalledTimes(1);
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
    });

    it('a throwing consult callback is contained and treated as true', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      try {
        const onScrollRequest = jest.fn(() => {
          throw new Error('consumer bug');
        });
        const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON, {
          onScrollRequest,
        });
        const q1 = getQuestion(model, 'q1');
        registry.registerElement(q1, makeHandle().handle);

        expect(() => model.completeLastPage()).not.toThrow();
        await flushBridge();
        expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it('reports viaPageFallback to the consult seam when the page handle stood in', async () => {
      const infos: ScrollRequestInfo[] = [];
      const { model, registry } = makeHarness(TWO_QUESTIONS_JSON, {
        onScrollRequest: (info) => {
          infos.push(info);
          return false;
        },
      });
      const page = model.pages[0] as PageModel;
      registry.registerElement(page, makeHandle('none').handle);

      model.completeLastPage();
      await flushBridge();

      expect(infos).toHaveLength(1);
      expect(infos[0]?.element).toBe(page);
      expect(infos[0]?.viaPageFallback).toBe(true);
    });
  });
});
