/**
 * Test plan for the reactive base classes port (design:
 * docs/design/0.4-reactive-base.md, A3). Cases 1-11 (incl. 5b) as specified
 * in the design's "Test plan" section. Real `SurveyModel`/`Question`
 * fixtures via the facade; instrumentation counts callbacks/revisions, not
 * raw `render()` calls (StrictMode legitimately doubles those).
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

  it('test 2: unmount unsubscribes both the scalar and array paths', () => {
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

    const { unmount } = render(<Probe testID="t2" elements={[question]} />);
    expect(question.hasActiveUISubscribers).toBe(true);
    const subscribedPropertyHandler = addPropertySpy.mock.calls[0]?.[0];
    const subscribedArrayHandler = addArraySpy.mock.calls[0]?.[0];
    expect(subscribedPropertyHandler).toBeDefined();
    expect(subscribedArrayHandler).toBeDefined();

    unmount();

    expect(question.hasActiveUISubscribers).toBe(false);
    expect(removePropertySpy).toHaveBeenCalledWith(subscribedPropertyHandler);
    expect(removeArraySpy).toHaveBeenCalledWith(subscribedArrayHandler);
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

  it('test 5(b): a partial-overlap diff [A,B] -> [B,C] keeps B subscribed without churn', () => {
    const a = createQuestion('overlap-a');
    const b = createQuestion('overlap-b');
    const c = createQuestion('overlap-c');
    const bAddArraySpy = jest.spyOn(b, 'addOnArrayChangedCallback');
    const bRemoveArraySpy = jest.spyOn(b, 'removeOnArrayChangedCallback');

    const { rerender } = render(<Probe testID="t5b" elements={[a, b]} />);
    expect(a.hasActiveUISubscribers).toBe(true);
    expect(b.hasActiveUISubscribers).toBe(true);
    const bAddCallsAfterMount = bAddArraySpy.mock.calls.length;

    rerender(<Probe testID="t5b" elements={[b, c]} />);

    expect(a.hasActiveUISubscribers).toBe(false);
    expect(c.hasActiveUISubscribers).toBe(true);
    expect(b.hasActiveUISubscribers).toBe(true);
    expect(bAddArraySpy.mock.calls.length).toBe(bAddCallsAfterMount);
    expect(bRemoveArraySpy).not.toHaveBeenCalled();

    const revBefore = revOf('t5b');
    act(() => {
      b.indent = 7;
    });
    expect(revOf('t5b')).toBe(revBefore + 1);
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

  it('test 7: two probes sharing one model converge and restore the render guard to zero', () => {
    const question = createQuestion();
    const refA = React.createRef<Probe>();
    const refB = React.createRef<Probe>();
    const treeA = render(
      <Probe
        ref={refA}
        testID="t7a"
        elements={[question]}
        renderValue={() => String(question.indent)}
      />
    );
    const treeB = render(
      <Probe
        ref={refB}
        testID="t7b"
        elements={[question]}
        renderValue={() => String(question.indent)}
      />
    );

    const readA = (): string | undefined =>
      JSON.parse(treeA.getByTestId('t7a').props.children as string).value;
    const readB = (): string | undefined =>
      JSON.parse(treeB.getByTestId('t7b').props.children as string).value;

    act(() => {
      question.indent = 5;
    });
    expect(readA()).toBe('5');
    expect(readB()).toBe('5');
    expect(reactRenderingOf(question)).toBe(0);

    act(() => {
      treeA.rerender(
        <Probe
          ref={refA}
          testID="t7a"
          elements={[question]}
          renderValue={() => String(question.indent)}
          tick={1}
          mutateOnRender={() => {
            question.indent = 11;
          }}
        />
      );
    });
    expect(reactRenderingOf(question)).toBe(0);
    expect(readA()).toBe('11');

    // Drop A's mutateOnRender before the follow-up mutation — otherwise
    // every subsequent re-render of A would re-fire that stale closure and
    // clobber the value under test, which is not what this assertion is
    // about (D2 restoration only, not repeated re-entrant mutation).
    act(() => {
      treeA.rerender(
        <Probe
          ref={refA}
          testID="t7a"
          elements={[question]}
          renderValue={() => String(question.indent)}
          tick={2}
        />
      );
    });

    // A follow-up, non-concurrent mutation must fully converge both —
    // proving the shared-model guard never leaves an observer stuck.
    act(() => {
      question.indent = 20;
    });
    expect(readA()).toBe('20');
    expect(readB()).toBe('20');
    expect(reactRenderingOf(question)).toBe(0);
  });

  it('test 8: a throwing renderElement still restores the render guard, via an error boundary', () => {
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
      const otherQuestion = createQuestion('other-q');
      const otherRef = React.createRef<Probe>();

      render(
        <>
          <Boundary>
            <Probe testID="t8" elements={[throwingQuestion]} throwOnRender />
          </Boundary>
          <Probe
            ref={otherRef}
            testID="t8-other"
            elements={[otherQuestion]}
            renderValue={() => String(otherQuestion.indent)}
          />
        </>
      );

      expect(screen.getByTestId('t8-fallback')).toBeTruthy();
      expect(reactRenderingOf(throwingQuestion)).toBe(0);

      act(() => {
        otherQuestion.indent = 3;
      });
      expect(readProbe('t8-other').value).toBe('3');
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

  it('test 10: array push/splice re-renders; a cloned-array mutation does not', () => {
    const question = createQuestion('array-q');
    render(<Probe testID="t10" elements={[question]} />);
    const revBefore = revOf('t10');

    act(() => {
      question.choices.push({ value: 'c', text: 'C' });
    });
    expect(revOf('t10')).toBeGreaterThan(revBefore);
    const revAfterPush = revOf('t10');

    act(() => {
      const cloned = question.choices.slice();
      cloned.push({ value: 'clone-only', text: 'Clone only' });
    });
    expect(revOf('t10')).toBe(revAfterPush);
  });

  it('test 11: concurrent bursts converge (non-probative, instrumented)', () => {
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
        <Probe
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

    act(() => {
      React.startTransition(() => {
        question.indent = 1;
        question.indent = 2;
        question.indent = 3;
      });
    });

    expect(readProbe('t11a').value).toBe('3');
    expect(readProbe('t11b').value).toBe('3');
    expect(commits).toBeGreaterThan(0);
    expect(commits).toBeLessThan(50);
  });
});
