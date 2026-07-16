/**
 * @jest-environment node
 */

// Honest interception proof (review round 2, findings #1 critical + #7).
//
// bridge.test.ts imports the facade, whose 1.2 amendment has ALREADY
// stubbed `settings.environment` before any test runs — so its
// "never hits the destructure" assertions are masked by the stub and
// prove nothing about interception. This suite FORCES
// `settings.environment` back to `undefined` (the raw RN reality before
// the stub) so the A15 TypeError is live again: every "does not throw"
// below is true ONLY if the bridge's cancellation actually kept core out
// of the `const { rootElement } = settings.environment` destructure
// (survey.ts:5872).
//
// The critical case: survey-core's EventBase.fire hands the SAME mutable
// options object to every subscriber (event.ts:17-23), so a consumer
// subscribed AFTER the bridge could reassign `allow = true` and re-open
// core's DOM path. The bridge must make cancellation irreversible for
// the dispatch.
import { Model, settings } from '../../core/facade';
import type { SurveyModel } from '../../core/facade';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';
import { installLifecycleBridge } from '../bridge';
import { createLifecycleRegistry } from '../registry';

const REQUIRED_Q_JSON = {
  pages: [
    {
      name: 'page1',
      elements: [{ type: 'text', name: 'q1', isRequired: true }],
    },
  ],
};

describe('lifecycle/bridge — interception with settings.environment undefined (unmasked)', () => {
  let savedEnvironment: unknown;
  let diagnostics: DiagnosticPayload[];

  beforeEach(() => {
    jest.useFakeTimers();
    diagnostics = [];
    setDiagnosticHandler((payload) => diagnostics.push(payload));
    savedEnvironment = (settings as unknown as Record<string, unknown>)
      .environment;
    (settings as unknown as Record<string, unknown>).environment = undefined;
  });

  afterEach(() => {
    (settings as unknown as Record<string, unknown>).environment =
      savedEnvironment;
    setDiagnosticHandler(undefined);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function makeModel(): SurveyModel {
    return new Model(REQUIRED_Q_JSON) as unknown as SurveyModel;
  }

  it('baseline (unbridged): the funnel throws the A15 TypeError — proves this suite is NOT masked by the facade stub', () => {
    const model = makeModel();
    expect(() => model.completeLastPage()).toThrow(/rootElement/);
  });

  it('bridged: the same call cannot reach the destructure', () => {
    const model = makeModel();
    const uninstall = installLifecycleBridge(model, createLifecycleRegistry());
    try {
      expect(() => model.completeLastPage()).not.toThrow();
      expect(model.state).toBe('running');
    } finally {
      uninstall();
    }
  });

  it('CRITICAL regression: a later subscriber reassigning allow=true cannot re-open core DOM path; observers still read false', () => {
    const model = makeModel();
    const uninstall = installLifecycleBridge(model, createLifecycleRegistry());
    try {
      model.onScrollToTop.add((_s, opts) => {
        // Hostile/buggy consumer subscribed AFTER the bridge tries to
        // re-enable core's own scroll handling.
        opts.allow = true;
      });
      const seenAfterReassign: boolean[] = [];
      model.onScrollToTop.add((_s, opts) => {
        seenAfterReassign.push(opts.allow);
      });

      // With `allow` actually flipped back to true, core reaches the
      // settings.environment destructure and this throws.
      expect(() => model.completeLastPage()).not.toThrow();
      expect(seenAfterReassign).toEqual([false]);
    } finally {
      uninstall();
    }
  });

  it('reassignment attempts surface the allow-override-ignored diagnostic once per install', () => {
    const model = makeModel();
    const uninstall = installLifecycleBridge(model, createLifecycleRegistry());
    try {
      model.onScrollToTop.add((_s, opts) => {
        opts.allow = true;
      });
      expect(() => model.completeLastPage()).not.toThrow();
      expect(() => model.completeLastPage()).not.toThrow();

      const overrides = diagnostics.filter(
        (p) =>
          p.code === 'lifecycle-diagnostic' &&
          p.lifecycleCode === 'allow-override-ignored'
      );
      expect(overrides).toHaveLength(1);
    } finally {
      uninstall();
    }
  });
});
