/**
 * Test plan for the reactive base classes port (design:
 * docs/design/0.4-reactive-base.md, A3). Cases 1-11 (incl. 5b) as specified
 * in the design's "Test plan" section, plus review-round hardening:
 * D2 snapshot regression (membership mutation during render), the
 * mount-commit dev warning, D4 mount-batching, and the added-model
 * pre-subscribe gap. Real `SurveyModel`/`Question` fixtures via the facade;
 * instrumentation counts callbacks/revisions, not raw `render()` calls
 * (StrictMode legitimately doubles those).
 */
import * as React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import {
  createQuestion,
  Probe,
  reactRenderingOf,
  readProbe,
  revOf,
} from '../__fixtures__/probe';
import type { ProbeProps } from '../__fixtures__/probe';
import type { SurveyElementBaseState } from '../SurveyElementBase';

describe('SurveyElementBase', () => {
  it('test 1: mounts and subscribes; mutation updates the UI; deny-list blocks state but not the callback', () => {
    const question = createQuestion();
    const ref = React.createRef<Probe>();
    const { rerender } = render(
      <Probe ref={ref} testID="t1" elements={[question]} deniedKeys={[]} />
    );
    const revBeforeAllowed = revOf('t1');

    act(() => {
      question.indent = 2;
    });
    expect(revOf('t1')).toBe(revBeforeAllowed + 1);

    rerender(
      <Probe
        ref={ref}
        testID="t1"
        elements={[question]}
        deniedKeys={['indent']}
      />
    );
    const revBeforeDenied = revOf('t1');
    const callbacksBefore = ref.current!.propertyCallbackCount;

    act(() => {
      question.indent = 9;
    });
    expect(ref.current!.propertyCallbackCount).toBeGreaterThan(callbacksBefore);
    expect(revOf('t1')).toBe(revBeforeDenied);
  });

  it('test 2: unmount unsubscribes both the scalar and array paths (behavioral: no callback on either channel after unmount)', () => {
    const question = createQuestion();
    const addPropertySpy = jest.spyOn(
      question,
      'addOnPropertyValueChangedCallback'
    );
    const addArraySpy = jest.spyOn(question, 'addOnArrayChangedCallback');
    const removePropertySpy = jest.spyOn(
      question,
      'removeOnPropertyValueChangedCallback'
    );
    const removeArraySpy = jest.spyOn(question, 'removeOnArrayChangedCallback');
    const ref = React.createRef<Probe>();

    const { unmount } = render(
      <Probe ref={ref} testID="t2" elements={[question]} />
    );
    const probe = ref.current!;
    expect(question.hasActiveUISubscribers).toBe(true);
    const subscribedPropertyHandler = addPropertySpy.mock.calls[0]?.[0];
    const subscribedArrayHandler = addArraySpy.mock.calls[0]?.[0];
    expect(subscribedPropertyHandler).toBeDefined();
    expect(subscribedArrayHandler).toBeDefined();

    // Positive control: while mounted, BOTH channels observably reach the
    // handlers (scalar via canUsePropInState, array via the isRendering
    // consult) — so the post-unmount equality below is not vacuous.
    const scalarCallsLive = probe.propertyCallbackCount;
    const renderingChecksLive = probe.isRenderingChecks;
    act(() => {
      question.indent = 1;
    });
    expect(probe.propertyCallbackCount).toBeGreaterThan(scalarCallsLive);
    expect(probe.isRenderingChecks).toBeGreaterThan(renderingChecksLive);
    const renderingChecksAfterScalar = probe.isRenderingChecks;
    act(() => {
      question.choices.push({ value: 'live', text: 'Live' });
    });
    expect(probe.isRenderingChecks).toBeGreaterThan(renderingChecksAfterScalar);

    unmount();

    expect(question.hasActiveUISubscribers).toBe(false);
    expect(removePropertySpy).toHaveBeenCalledWith(subscribedPropertyHandler);
    expect(removeArraySpy).toHaveBeenCalledWith(subscribedArrayHandler);

    // Behavioral: mutate BOTH channels after unmount — neither handler may
    // run (design sharp edge #1: dispose() does not clear these, so
    // unmount unsubscribing is the only thing standing between us and a
    // leak).
    const scalarCallsDead = probe.propertyCallbackCount;
    const renderingChecksDead = probe.isRenderingChecks;
    act(() => {
      question.indent = 5;
    });
    act(() => {
      question.choices.push({ value: 'dead', text: 'Dead' });
    });
    expect(probe.propertyCallbackCount).toBe(scalarCallsDead);
    expect(probe.isRenderingChecks).toBe(renderingChecksDead);
  });

  it('test 3: under StrictMode, a single mutation produces exactly one __svRev bump, and unmount stays clean', () => {
    const question = createQuestion();
    const { unmount } = render(
      <React.StrictMode>
        <Probe testID="t3" elements={[question]} />
      </React.StrictMode>
    );
    const revBefore = revOf('t3');

    act(() => {
      question.indent = 3;
    });
    expect(revOf('t3')).toBe(revBefore + 1);

    unmount();
    expect(question.hasActiveUISubscribers).toBe(false);
  });

  it('test 4: a parent re-render with the same model does not churn the subscription registry', () => {
    const question = createQuestion();
    const addPropertySpy = jest.spyOn(
      question,
      'addOnPropertyValueChangedCallback'
    );
    const removePropertySpy = jest.spyOn(
      question,
      'removeOnPropertyValueChangedCallback'
    );

    const { rerender } = render(
      <Probe testID="t4" elements={[question]} tick={0} />
    );
    const addCallsAfterMount = addPropertySpy.mock.calls.length;

    rerender(<Probe testID="t4" elements={[question]} tick={1} />);

    expect(addPropertySpy.mock.calls.length).toBe(addCallsAfterMount);
    expect(removePropertySpy).not.toHaveBeenCalled();
    expect(question.hasActiveUISubscribers).toBe(true);

    const revBefore = revOf('t4');
    act(() => {
      question.indent = 4;
    });
    expect(revOf('t4')).toBe(revBefore + 1);
  });

  it('test 5(a): a full model swap retargets the registry — old model inert, new model live', () => {
    const questionA = createQuestion('swap-a');
    const questionB = createQuestion('swap-b');
    const { rerender } = render(<Probe testID="t5a" elements={[questionA]} />);
    expect(questionA.hasActiveUISubscribers).toBe(true);

    rerender(<Probe testID="t5a" elements={[questionB]} />);

    expect(questionA.hasActiveUISubscribers).toBe(false);
    expect(questionB.hasActiveUISubscribers).toBe(true);

    const revAfterSwap = revOf('t5a');
    act(() => {
      questionA.indent = 9;
    });
    expect(revOf('t5a')).toBe(revAfterSwap);

    act(() => {
      questionB.indent = 9;
    });
    expect(revOf('t5a')).toBe(revAfterSwap + 1);
  });

  it('test 5(b): duplicate registry input [A,A,B] dedupes to exactly one subscription per channel; [A,A,B] -> [B,C] keeps B continuous on BOTH channels', () => {
    const a = createQuestion('overlap-a');
    const b = createQuestion('overlap-b');
    const c = createQuestion('overlap-c');
    const aAddProp = jest.spyOn(a, 'addOnPropertyValueChangedCallback');
    const aAddArr = jest.spyOn(a, 'addOnArrayChangedCallback');
    const aRemProp = jest.spyOn(a, 'removeOnPropertyValueChangedCallback');
    const aRemArr = jest.spyOn(a, 'removeOnArrayChangedCallback');
    const bAddProp = jest.spyOn(b, 'addOnPropertyValueChangedCallback');
    const bAddArr = jest.spyOn(b, 'addOnArrayChangedCallback');
    const bRemProp = jest.spyOn(b, 'removeOnPropertyValueChangedCallback');
    const bRemArr = jest.spyOn(b, 'removeOnArrayChangedCallback');

    const { rerender } = render(<Probe testID="t5b" elements={[a, a, b]} />);
    // Exact dedup: A appears twice in the input but subscribes ONCE per
    // channel.
    expect(aAddProp).toHaveBeenCalledTimes(1);
    expect(aAddArr).toHaveBeenCalledTimes(1);
    expect(bAddProp).toHaveBeenCalledTimes(1);
    expect(bAddArr).toHaveBeenCalledTimes(1);
    expect(a.hasActiveUISubscribers).toBe(true);
    expect(b.hasActiveUISubscribers).toBe(true);

    rerender(<Probe testID="t5b" elements={[b, c]} />);

    expect(a.hasActiveUISubscribers).toBe(false);
    expect(aRemProp).toHaveBeenCalledTimes(1);
    expect(aRemArr).toHaveBeenCalledTimes(1);
    expect(c.hasActiveUISubscribers).toBe(true);
    // B continuity, inspected on BOTH callback channels: never removed,
    // never re-added.
    expect(b.hasActiveUISubscribers).toBe(true);
    expect(bAddProp).toHaveBeenCalledTimes(1);
    expect(bAddArr).toHaveBeenCalledTimes(1);
    expect(bRemProp).not.toHaveBeenCalled();
    expect(bRemArr).not.toHaveBeenCalled();

    // And B is observably live on both channels.
    const revBefore = revOf('t5b');
    act(() => {
      b.indent = 7;
    });
    expect(revOf('t5b')).toBe(revBefore + 1);
    const revAfterScalar = revOf('t5b');
    act(() => {
      b.choices.push({ value: 'z', text: 'Z' });
    });
    expect(revOf('t5b')).toBeGreaterThan(revAfterScalar);
  });

  it('test 5b: the mount reconcile pass closes the render-to-commit gap (D4)', () => {
    const question = createQuestion();
    question.indent = 1;
    let commits = 0;

    function Sibling(): null {
      React.useLayoutEffect(() => {
        question.indent = 42;
      }, []);
      return null;
    }

    render(
      <React.Profiler
        id="root-5b"
        onRender={() => {
          commits += 1;
        }}
      >
        <Sibling />
        <Probe
          testID="t5b-reconcile"
          elements={[question]}
          renderValue={() => String(question.indent)}
        />
      </React.Profiler>
    );

    expect(readProbe('t5b-reconcile').value).toBe('42');
    expect(commits).toBe(2);
  });

  it('D4: multiple probes mounting in ONE tree reconcile in a single batched commit', () => {
    const q1 = createQuestion('batch-1');
    const q2 = createQuestion('batch-2');
    const q3 = createQuestion('batch-3');
    let commits = 0;

    // Baseline is taken right here, immediately before the mount: the
    // Profiler counts every commit of this tree from zero.
    render(
      <React.Profiler
        id="root-mount-batch"
        onRender={() => {
          commits += 1;
        }}
      >
        <Probe testID="mb1" elements={[q1]} />
        <Probe testID="mb2" elements={[q2]} />
        <Probe testID="mb3" elements={[q3]} />
      </React.Profiler>
    );

    // Initial mount + exactly ONE batched D4 reconcile commit for all
    // three probes — not one commit per probe.
    expect(commits).toBe(2);
  });

  it('D4 (swap): a mutation landing in the pre-subscribe gap of a newly-added model is not missed', () => {
    const questionA = createQuestion('gap-a');
    const questionB = createQuestion('gap-b');
    questionB.indent = 1;

    function MutateOnMount({ fire }: { fire: () => void }): null {
      React.useLayoutEffect(() => {
        fire();
      }, [fire]);
      return null;
    }

    const { rerender } = render(
      <Probe
        key="p"
        testID="gap"
        elements={[questionA]}
        renderValue={() => String(questionB.indent)}
      />
    );

    // One update pass: the probe renders with B (still indent=1, render
    // phase), then MutateOnMount's layout effect fires BEFORE the probe's
    // componentDidUpdate subscribes B — the classic pre-subscribe gap,
    // now on the update/swap path.
    rerender(
      <>
        <MutateOnMount
          key="m"
          fire={() => {
            questionB.indent = 42;
          }}
        />
        <Probe
          key="p"
          testID="gap"
          elements={[questionB]}
          renderValue={() => String(questionB.indent)}
        />
      </>
    );

    expect(readProbe('gap').value).toBe('42');
  });

  it('test 6: renderElement mutating the model is defensively suppressed by the render guard', () => {
    const question = createQuestion();
    const ref = React.createRef<Probe>();
    const { rerender } = render(
      <Probe
        ref={ref}
        testID="t6"
        elements={[question]}
        renderValue={() => String(question.indent)}
      />
    );
    const revBefore = revOf('t6');
    const callbacksBefore = ref.current!.propertyCallbackCount;

    // Re-render with the same subscribed element (no add/remove), but this
    // pass's renderElement() mutates the model it is currently rendering.
    act(() => {
      rerender(
        <Probe
          ref={ref}
          testID="t6"
          elements={[question]}
          renderValue={() => String(question.indent)}
          mutateOnRender={() => {
            question.indent = 99;
          }}
        />
      );
    });

    expect(ref.current!.propertyCallbackCount).toBeGreaterThan(callbacksBefore);
    expect(revOf('t6')).toBe(revBefore);
    expect(reactRenderingOf(question)).toBe(0);
    expect(ref.current!.renderElementCalls).toBeLessThan(6);
  });

  it('D2 snapshot: membership mutation during render leaves every involved counter at exactly 0 and suppresses via the CAPTURED list', () => {
    const a = createQuestion('snap-a');
    const b = createQuestion('snap-b');
    const elements = [a];
    const ref = React.createRef<Probe>();
    const { rerender } = render(
      <Probe ref={ref} testID="snap" elements={elements} />
    );
    const revBefore = revOf('snap');

    // This render pass mutates the registry array IN PLACE mid-render
    // (endRendering must decrement the snapshot, not the mutated list),
    // then mutates the OLD element — its handler is still subscribed, and
    // isRendering must consult the captured snapshot (where A's counter is
    // raised), not the post-mutation membership (where it is not).
    act(() => {
      rerender(
        <Probe
          ref={ref}
          testID="snap"
          elements={elements}
          tick={1}
          mutateOnRender={() => {
            if (elements[0] !== b) {
              elements.splice(0, 1, b);
              a.indent = 55;
            }
          }}
        />
      );
    });

    // Every involved counter exactly 0: A not stranded positive, B not
    // driven negative.
    expect(reactRenderingOf(a)).toBe(0);
    expect(reactRenderingOf(b)).toBe(0);
    // The mid-render mutation of A was suppressed; the only bump is D4's
    // added-element reconcile for B.
    expect(revOf('snap')).toBe(revBefore + 1);

    // Post-commit the registry has retargeted: A inert, B live.
    act(() => {
      a.indent = 77;
    });
    expect(revOf('snap')).toBe(revBefore + 1);
    act(() => {
      b.indent = 2;
    });
    expect(revOf('snap')).toBe(revBefore + 2);
  });

  it('test 7: sibling probes under ONE parent re-render share the guard, converge, and restore it to zero', () => {
    const question = createQuestion('t7-q');
    const refA = React.createRef<Probe>();
    const refB = React.createRef<Probe>();
    const siblings = (
      tick: number,
      mutateOnRender?: () => void
    ): React.JSX.Element => (
      <>
        <Probe
          key="a"
          ref={refA}
          testID="t7a"
          elements={[question]}
          renderValue={() => String(question.indent)}
          tick={tick}
          mutateOnRender={mutateOnRender}
        />
        <Probe
          key="b"
          ref={refB}
          testID="t7b"
          elements={[question]}
          renderValue={() => String(question.indent)}
          tick={tick}
        />
      </>
    );
    const { rerender } = render(siblings(0));

    act(() => {
      question.indent = 5;
    });
    expect(readProbe('t7a').value).toBe('5');
    expect(readProbe('t7b').value).toBe('5');
    expect(reactRenderingOf(question)).toBe(0);

    // ONE parent-driven pass re-renders both siblings; A mutates the
    // shared model mid-pass while B is part of the same render batch.
    act(() => {
      rerender(
        siblings(1, () => {
          question.indent = 11;
        })
      );
    });
    expect(reactRenderingOf(question)).toBe(0);
    expect(readProbe('t7a').value).toBe('11');
    expect(readProbe('t7b').value).toBe('11');

    // Drop A's stale mutateOnRender closure before the follow-up mutation
    // — otherwise every subsequent re-render of A would re-fire it and
    // clobber the value under test (D2 restoration only, not repeated
    // re-entrant mutation).
    act(() => {
      rerender(siblings(2));
    });

    // A follow-up, non-concurrent mutation must fully converge both —
    // proving the shared-model guard never leaves an observer stuck.
    act(() => {
      question.indent = 20;
    });
    expect(readProbe('t7a').value).toBe('20');
    expect(readProbe('t7b').value).toBe('20');
    expect(reactRenderingOf(question)).toBe(0);
  });

  it('test 8: a throwing renderElement (with membership mutated mid-throw) restores the guard, and a surviving observer of the SAME model stays live', () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      class Boundary extends React.Component<
        { children: React.ReactNode },
        { hasError: boolean }
      > {
        state = { hasError: false };
        static getDerivedStateFromError(): { hasError: boolean } {
          return { hasError: true };
        }
        render(): React.ReactNode {
          return this.state.hasError ? (
            <Text testID="t8-fallback">error</Text>
          ) : (
            this.props.children
          );
        }
      }

      const throwingQuestion = createQuestion('throw-q');
      const decoyQuestion = createQuestion('decoy-q');
      const survivorRef = React.createRef<Probe>();
      // The throwing probe's registry array — mutated in place DURING the
      // throwing render, so the finally-path must decrement the captured
      // snapshot, not the post-mutation membership.
      const throwingElements = [throwingQuestion];

      render(
        <>
          <Probe
            ref={survivorRef}
            testID="t8-survivor"
            elements={[throwingQuestion]}
            renderValue={() => String(throwingQuestion.indent)}
          />
          <Boundary>
            <Probe
              testID="t8"
              elements={throwingElements}
              throwOnRender
              mutateOnRender={() => {
                throwingElements.splice(0, 1, decoyQuestion);
              }}
            />
          </Boundary>
        </>
      );

      expect(screen.getByTestId('t8-fallback')).toBeTruthy();
      expect(reactRenderingOf(throwingQuestion)).toBe(0);
      expect(reactRenderingOf(decoyQuestion)).toBe(0);

      // The surviving observer watches the THROWING model — if the guard
      // were stranded positive, isRendering would suppress every future
      // update of this model for every observer. It must stay live.
      act(() => {
        throwingQuestion.indent = 3;
      });
      expect(readProbe('t8-survivor').value).toBe('3');
      expect(reactRenderingOf(throwingQuestion)).toBe(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('test 9: never touches the core animation handshake (D3)', () => {
    const question = createQuestion('anim-q');
    const enableSpy = jest.spyOn(question, 'enableOnElementRerenderedEvent');
    const disableSpy = jest.spyOn(question, 'disableOnElementRerenderedEvent');
    const afterRerenderSpy = jest.spyOn(question, 'afterRerender');
    const refA = React.createRef<Probe>();
    const refB = React.createRef<Probe>();

    const { rerender } = render(
      <>
        <Probe ref={refA} testID="t9a" elements={[question]} />
        <Probe ref={refB} testID="t9b" elements={[question]} />
      </>
    );

    act(() => {
      question.indent = 2;
    });

    rerender(
      <>
        <Probe ref={refA} testID="t9a" elements={[question]} tick={1} />
        <Probe ref={refB} testID="t9b" elements={[question]} tick={1} />
      </>
    );

    // Unmount one of two observers.
    rerender(<Probe ref={refA} testID="t9a" elements={[question]} tick={2} />);

    expect(enableSpy).not.toHaveBeenCalled();
    expect(disableSpy).not.toHaveBeenCalled();
    expect(afterRerenderSpy).not.toHaveBeenCalled();
  });

  it('test 10: array push AND splice re-render; a cloned-array mutation does not', () => {
    const question = createQuestion('array-q');
    render(<Probe testID="t10" elements={[question]} />);
    const revBefore = revOf('t10');

    act(() => {
      question.choices.push({ value: 'c', text: 'C' });
    });
    expect(revOf('t10')).toBeGreaterThan(revBefore);
    const revAfterPush = revOf('t10');

    act(() => {
      question.choices.splice(0, 1);
    });
    expect(revOf('t10')).toBeGreaterThan(revAfterPush);
    const revAfterSplice = revOf('t10');

    act(() => {
      const cloned = question.choices.slice();
      cloned.push({ value: 'clone-only', text: 'Clone only' });
    });
    expect(revOf('t10')).toBe(revAfterSplice);
  });

  it('dev-mode warning: a model mutation landing during the mount commit warns (render-to-commit gap invariant); post-mount mutations do not', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const question = createQuestion('warn-q');
      class MountMutator extends Probe {
        componentDidMount(): void {
          super.componentDidMount();
          // Renderer components must never do this — the warning is the
          // house-cleaning signal the design doc demands.
          question.indent = 7;
        }
      }

      render(<MountMutator testID="warn" elements={[question]} />);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('mount commit')
      );

      warnSpy.mockClear();
      act(() => {
        question.indent = 9;
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('test 11: concurrent bursts converge with an EXACT +3 revision delta per observer, and unrelated subclass state survives', () => {
    interface MarkerState extends SurveyElementBaseState {
      marker?: string;
    }
    class StatefulProbe extends Probe {
      constructor(props: ProbeProps) {
        super(props);
        this.state = { marker: 'keep' } as MarkerState;
      }
    }

    const question = createQuestion('concurrent-q');
    const refA = React.createRef<Probe>();
    const refB = React.createRef<Probe>();
    let commits = 0;

    render(
      <React.Profiler
        id="root-11"
        onRender={() => {
          commits += 1;
        }}
      >
        <StatefulProbe
          ref={refA}
          testID="t11a"
          elements={[question]}
          renderValue={() => String(question.indent)}
        />
        <Probe
          ref={refB}
          testID="t11b"
          elements={[question]}
          renderValue={() => String(question.indent)}
        />
      </React.Profiler>
    );

    const revA0 = readProbe('t11a').rev;
    const revB0 = readProbe('t11b').rev;

    act(() => {
      React.startTransition(() => {
        question.indent = 1;
        question.indent = 2;
        question.indent = 3;
      });
    });

    expect(readProbe('t11a').value).toBe('3');
    expect(readProbe('t11b').value).toBe('3');
    // Exact delta: three notifications in one batched burst = exactly +3.
    // An object-form setState computed from stale `this.state` would
    // collapse these into +1 — this is the assertion that catches it.
    expect(readProbe('t11a').rev).toBe(revA0 + 3);
    expect(readProbe('t11b').rev).toBe(revB0 + 3);
    // The functional updater merges — unrelated subclass state intact.
    expect((refA.current!.state as MarkerState).marker).toBe('keep');
    expect(commits).toBeGreaterThan(0);
    expect(commits).toBeLessThan(50);
  });
});
