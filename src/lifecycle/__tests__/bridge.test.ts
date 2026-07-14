/**
 * @jest-environment node
 */

// Design: docs/design/1.2-lifecycle-bridge.md, test plan #1-#7, #9, #10.
// Real SurveyModel via the facade (plain Node — no `document`, so
// survey-core takes the same SSR-safe paths RN does), mocked
// handles/host. Fake timers drive the bridge's flush (setTimeout 0) and
// focus-settle (scrollSettleMs) scheduling.
//
// HONESTY NOTE (review round 2 #7): importing the facade above installs
// the settings.environment stub before any test here runs, so this
// suite CANNOT prove the bridge keeps core away from the unguarded
// destructure — bridge.interception.test.ts is the unmasked proof
// (settings.environment forced back to undefined there).
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

const COLLAPSED_PANEL_JSON = {
  pages: [
    {
      name: 'page1',
      elements: [
        {
          type: 'panel',
          name: 'panel1',
          state: 'collapsed',
          elements: [{ type: 'text', name: 'pq1' }],
        },
        { type: 'text', name: 'q1' },
      ],
    },
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

      // The regression that motivated A15 ("Cannot read properties of
      // undefined (reading 'rootElement')"). Here the facade stub also
      // protects; the UNMASKED interception proof lives in
      // bridge.interception.test.ts.
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
      // focusIn OWNERSHIP (review round 2 #5): the bridge only INITIATES
      // focus (focusFirst); question.focusIn() is fired by the
      // component's native input from its actual onFocus event
      // (ElementHandle.focusFirst contract) — a synchronous boolean
      // cannot prove async native focus landed, and synthesizing it here
      // would double-fire onFocusInQuestion once components wire onFocus.
      expect(focusInSpy).not.toHaveBeenCalled();
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

    it('panel.expand() (scroll-only shape: elementId === question.inputId) scrolls WITHOUT synthesizing focus', async () => {
      // Review round 2 #2: panel expansion fires the funnel with
      // `question` NON-null (panel.ts:2499 — `element: q, question: q,
      // id: q.inputId`, NO onScolledCallback), so `question != null` is
      // NOT a focus-intent discriminator. The real focus caller
      // (question.ts:1618) passes `id: this.id`; panel expand passes
      // `id: q.inputId` (= id + "i"). The bridge discriminates on
      // elementId === question.id — web parity: panel expand scrolls to
      // the first question but never focuses its input (no callback).
      const { model, registry, mockHost } = makeHarness(COLLAPSED_PANEL_JSON);
      const pq1 = getQuestion(model, 'pq1');
      const mock = makeHandle(true);
      registry.registerElement(pq1, mock.handle);
      const focusInSpy = jest.fn();
      model.onFocusInQuestion.add(focusInSpy);

      const panel = model.getPanelByName('panel1');
      expect(panel).toBeTruthy();
      panel!.expand();
      // Core defers the expand-scroll via setTimeout(…, 15) when the
      // panel content isn't rendered yet (panel.ts:2496-2501); 16 covers
      // that timer PLUS the bridge's 0ms flush scheduled at the t=15
      // boundary (jest's async advance won't fire a boundary-scheduled
      // timer within the same advance, nor on a +0 advance).
      await jest.advanceTimersByTimeAsync(16);

      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await settleScroll();
      expect(mock.focusFirst).not.toHaveBeenCalled();
      expect(mock.a11yFocus).not.toHaveBeenCalled();
      expect(focusInSpy).not.toHaveBeenCalled();
    });

    it('question.focus() (focus shape: elementId === question.id) completes the focus intent', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const mock = makeHandle(true);
      registry.registerElement(q1, mock.handle);

      q1.focus();
      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await settleScroll();
      expect(mock.focusFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('test plan #3 — cross-page focus (the 1.1 render-complete seam)', () => {
    // The seam 1.1 MUST wire on page render completion — an EXACT mirror
    // of web's afterRenderPage (survey.ts:5514-5519): while a focus is
    // parked in focusingQuestionInfo, afterRenderPage SKIPS
    // scrollToTopOnPageChange and calls PRIVATE focusQuestionInfo()
    // (review round 2 #3; the method's existence is pinned by the
    // api-surface watchlist so core drift fails loudly).
    function runRenderCompleteSeam(model: SurveyModel): void {
      const seam = model as unknown as {
        focusingQuestionInfo?: unknown;
        focusQuestionInfo(): void;
      };
      if (seam.focusingQuestionInfo) {
        seam.focusQuestionInfo();
      } else {
        model.scrollToTopOnPageChange();
      }
    }

    it('focusQuestion() parks focusingQuestionInfo across the page change; the seam executes the parked focus', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_PAGES_JSON);
      const q2 = getQuestion(model, 'q2');
      const mock = makeHandle(true);
      registry.registerElement(q2, mock.handle);

      expect(model.currentPageNo).toBe(0);
      expect(model.focusQuestion('q2')).toBe(true);
      expect(model.currentPageNo).toBe(1);

      // Two-phase: the focus is parked waiting for the page render; the
      // seam must take the focusQuestionInfo() branch.
      expect(
        (model as unknown as { focusingQuestionInfo?: unknown })
          .focusingQuestionInfo
      ).toBeTruthy();
      runRenderCompleteSeam(model);

      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await settleScroll();
      expect(mock.focusFirst).toHaveBeenCalledTimes(1);
    });

    it('plain page change (nothing parked): the seam takes the scrollToTopOnPageChange branch and scrolls the page without focus', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_PAGES_JSON);
      const page2 = model.pages[1] as PageModel;
      const pageMock = makeHandle('none');
      registry.registerElement(page2, pageMock.handle);

      expect(model.nextPage()).toBe(true);
      expect(
        (model as unknown as { focusingQuestionInfo?: unknown })
          .focusingQuestionInfo
      ).toBeFalsy();
      runRenderCompleteSeam(model);

      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await settleScroll();
      expect(pageMock.a11yFocus).not.toHaveBeenCalled();
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

  describe('review round 2 #4 — async ordering and coalescing races', () => {
    it('focus→page same tick: ONE scroll to the LAST target (the page); the focus intent is retained, not dropped', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const page = model.pages[0] as PageModel;
      const qMock = makeHandle(true);
      const pageMock = makeHandle('none');
      registry.registerElement(q1, qMock.handle);
      registry.registerElement(page, pageMock.handle);

      q1.focus();
      page.scrollToTop();

      await flushBridge();
      expect(mockHost.measureTarget).toHaveBeenCalledTimes(1);
      expect(mockHost.measureTarget).toHaveBeenCalledWith(
        pageMock.handle.containerRef
      );
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await settleScroll();
      // The scroll target coalesced to the page, but q1's focus intent
      // must survive (coalesced SEPARATELY from the scroll target).
      expect(qMock.focusFirst).toHaveBeenCalledTimes(1);
    });

    it('page→focus same tick: ONE scroll to the question; focus completes', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const page = model.pages[0] as PageModel;
      const qMock = makeHandle(true);
      const pageMock = makeHandle('none');
      registry.registerElement(q1, qMock.handle);
      registry.registerElement(page, pageMock.handle);

      page.scrollToTop();
      q1.focus();

      await flushBridge();
      expect(mockHost.measureTarget).toHaveBeenCalledTimes(1);
      expect(mockHost.measureTarget).toHaveBeenCalledWith(
        qMock.handle.containerRef
      );
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await settleScroll();
      expect(qMock.focusFirst).toHaveBeenCalledTimes(1);
    });

    it('a measurement superseded mid-flight never scrolls (stale drop)', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const q2 = getQuestion(model, 'q2');
      const mock1 = makeHandle(true);
      const mock2 = makeHandle(true);
      registry.registerElement(q1, mock1.handle);
      registry.registerElement(q2, mock2.handle);

      let resolveFirst!: (m: { y: number; height: number } | null) => void;
      mockHost.measureTarget
        .mockImplementationOnce(
          () =>
            new Promise<{ y: number; height: number } | null>((resolve) => {
              resolveFirst = resolve;
            })
        )
        .mockImplementationOnce(async () => ({ y: 900, height: 80 }));

      q1.focus();
      await flushBridge(); // flush 1 starts and parks on measureTarget
      q2.focus(); // supersedes while measure 1 is in flight
      await flushBridge(); // flush 2 completes: scroll to q2

      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      expect(mockHost.scrollTo).toHaveBeenCalledWith(900, true);

      // The STALE measurement lands late — it must be dropped, never
      // scrolled (pre-fix it scrolled to q1 AFTER the q2 scroll).
      resolveFirst({ y: 800, height: 80 });
      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);

      await settleScroll();
      expect(mock2.focusFirst).toHaveBeenCalledTimes(1);
      expect(mock1.focusFirst).not.toHaveBeenCalled();
    });

    it('a second FOCUS request during the settle window supersedes the first completion (old settle canceled)', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const q2 = getQuestion(model, 'q2');
      const mock1 = makeHandle(true);
      const mock2 = makeHandle(true);
      registry.registerElement(q1, mock1.handle);
      registry.registerElement(q2, mock2.handle);

      q1.focus();
      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(150); // mid-settle

      q2.focus();
      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(2);

      await settleScroll();
      await settleScroll(); // drain any leftover (pre-fix: q1's leaked timer)
      expect(mock2.focusFirst).toHaveBeenCalledTimes(1);
      expect(mock1.focusFirst).not.toHaveBeenCalled();
    });

    it('a SCROLL-ONLY request during the settle window re-parks the focus intent (completes exactly once, after the new scroll)', async () => {
      const { model, registry, mockHost } = makeHarness(TWO_QUESTIONS_JSON);
      const q1 = getQuestion(model, 'q1');
      const page = model.pages[0] as PageModel;
      const qMock = makeHandle(true);
      const pageMock = makeHandle('none');
      registry.registerElement(q1, qMock.handle);
      registry.registerElement(page, pageMock.handle);

      q1.focus();
      await flushBridge();
      await jest.advanceTimersByTimeAsync(150); // mid-settle

      page.scrollToTop();
      await flushBridge();
      expect(mockHost.scrollTo).toHaveBeenCalledTimes(2);
      expect(qMock.focusFirst).not.toHaveBeenCalled();

      await settleScroll();
      await settleScroll(); // drain — must NOT double-complete
      expect(qMock.focusFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('test plan #10 — the onScrollRequest consult seam', () => {
    it('returning false suppresses the NATIVE SCROLL ONLY: focus intent still initiates (focusIn stays component-owned)', async () => {
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
      // Ownership (review round 2 #5): the bridge never fires focusIn —
      // the component's native onFocus does.
      expect(focusInSpy).not.toHaveBeenCalled();
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
