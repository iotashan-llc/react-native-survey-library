/**
 * `QuestionElementBase` — RN analog of survey-react-ui's
 * `SurveyQuestionElementBase` (design: docs/design/0.4-reactive-base.md,
 * port map). Covers the as-is carry-overs (getRenderedElements ==
 * [questionBase], canRender/isDisplayMode/creator) and the one genuinely
 * new RN behavior: the captured-pair mounted hook that replaces upstream's
 * DOM `data-rendered` idempotence. A nullish native ref means NO mounted
 * pair — `onQuestionMounted` only ever fires with a concrete ref.
 *
 * The probes feed `setNativeElement` from a real native `ref` callback
 * inside `renderElement` (the documented usage): React attaches child host
 * refs before the parent's commit lifecycles run, so the reconcile in
 * componentDidMount/DidUpdate always sees the settled ref — no lifecycle
 * overrides in the probes.
 */
import * as React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { Base, Question } from '../../core/facade';
import { QuestionElementBase } from '../QuestionElementBase';
import type { SurveyElementBaseState } from '../SurveyElementBase';

function createQuestion(name: string): Question {
  const model = new Model({ elements: [{ type: 'text', name }] });
  const question = model.getQuestionByName(name) as Question | null;
  if (!question) throw new Error('fixture question missing');
  return question;
}

interface ProbeProps {
  testID: string;
  question: Question;
  creator?: unknown;
  nativeRef?: unknown;
  isDisplayMode?: boolean;
}

type MountEvent = {
  kind: 'mount' | 'unmount';
  question: Question;
  ref: unknown;
};

/**
 * Maps the real host instance to the controllable `nativeRef` sentinel:
 * while a host instance is attached, the sentinel is the native element;
 * when the prop is absent (or the instance detaches), it is nullish.
 */
class HookProbe extends QuestionElementBase<
  ProbeProps,
  SurveyElementBaseState
> {
  public static events: MountEvent[] = [];

  protected onQuestionMounted(question: Question, ref: unknown): void {
    HookProbe.events.push({ kind: 'mount', question, ref });
  }

  protected onQuestionWillUnmount(question: Question, ref: unknown): void {
    HookProbe.events.push({ kind: 'unmount', question, ref });
  }

  protected renderElement(): React.JSX.Element {
    return (
      <Text
        testID={this.props.testID}
        ref={(instance) => {
          this.setNativeElement(instance ? this.props.nativeRef : undefined);
        }}
      >
        {this.questionBase.name}
      </Text>
    );
  }
}

describe('QuestionElementBase', () => {
  beforeEach(() => {
    HookProbe.events = [];
  });

  it('canRender() requires both questionBase and creator (as-is)', () => {
    const question = createQuestion('q-canrender');
    render(<HookProbe testID="cr-1" question={question} creator={undefined} />);
    expect(screen.queryByTestId('cr-1')).toBeNull();

    render(<HookProbe testID="cr-2" question={question} creator={{}} />);
    expect(screen.getByTestId('cr-2')).toBeTruthy();
  });

  it('getRenderedElements() returns [questionBase] so the question shares the render guard', () => {
    const question = createQuestion('q-guard');
    let sawReactRenderingDuringRender = false;
    class GuardProbe extends QuestionElementBase<
      ProbeProps,
      SurveyElementBaseState
    > {
      protected renderElement(): React.JSX.Element {
        sawReactRenderingDuringRender =
          ((this.questionBase as unknown as { reactRendering?: number })
            .reactRendering ?? 0) > 0;
        return <Text testID={this.props.testID}>ok</Text>;
      }
    }
    render(<GuardProbe testID="guard-1" question={question} creator={{}} />);
    expect(sawReactRenderingDuringRender).toBe(true);
    expect(
      (question as unknown as { reactRendering?: number }).reactRendering
    ).toBe(0);
  });

  it('isDisplayMode falls back to questionBase.isInputReadOnly (as-is)', () => {
    const question = createQuestion('q-display');
    class DisplayProbe extends QuestionElementBase<
      ProbeProps,
      SurveyElementBaseState
    > {
      protected renderElement(): React.JSX.Element {
        return (
          <Text testID={this.props.testID}>{String(this.isDisplayMode)}</Text>
        );
      }
    }
    const { rerender } = render(
      <DisplayProbe testID="display-1" question={question} creator={{}} />
    );
    expect(screen.getByTestId('display-1').props.children).toBe('false');

    question.readOnly = true;
    rerender(
      <DisplayProbe testID="display-1" question={question} creator={{}} />
    );
    expect(screen.getByTestId('display-1').props.children).toBe('true');
  });

  it('captured-pair mounted hook: mount old pair -> clean old pair -> mount new pair -> clean current pair exactly once', () => {
    const questionA = createQuestion('q-pair-a');
    const questionB = createQuestion('q-pair-b');
    const refA = { id: 'ref-a' };
    const refB = { id: 'ref-b' };

    const { rerender, unmount } = render(
      <HookProbe
        testID="pair-1"
        question={questionA}
        creator={{}}
        nativeRef={refA}
      />
    );
    expect(HookProbe.events).toEqual([
      { kind: 'mount', question: questionA, ref: refA },
    ]);

    rerender(
      <HookProbe
        testID="pair-1"
        question={questionB}
        creator={{}}
        nativeRef={refB}
      />
    );
    expect(HookProbe.events).toEqual([
      { kind: 'mount', question: questionA, ref: refA },
      { kind: 'unmount', question: questionA, ref: refA },
      { kind: 'mount', question: questionB, ref: refB },
    ]);

    unmount();
    expect(HookProbe.events).toEqual([
      { kind: 'mount', question: questionA, ref: refA },
      { kind: 'unmount', question: questionA, ref: refA },
      { kind: 'mount', question: questionB, ref: refB },
      { kind: 'unmount', question: questionB, ref: refB },
    ]);
  });

  it('captured-pair mounted hook does not re-fire when neither question nor ref changes', () => {
    const question = createQuestion('q-pair-stable');
    const ref = { id: 'stable-ref' };
    const { rerender } = render(
      <HookProbe
        testID="pair-2"
        question={question}
        creator={{}}
        nativeRef={ref}
      />
    );
    expect(HookProbe.events).toHaveLength(1);

    rerender(
      <HookProbe
        testID="pair-2"
        question={question}
        creator={{}}
        nativeRef={ref}
      />
    );
    expect(HookProbe.events).toHaveLength(1);
  });

  it('nullish ref on mount: no mounted pair, no hook calls — and unmounting without a pair stays silent', () => {
    const question = createQuestion('q-null-initial');
    const { unmount } = render(
      <HookProbe testID="null-1" question={question} creator={{}} />
    );
    expect(HookProbe.events).toEqual([]);

    unmount();
    expect(HookProbe.events).toEqual([]);
  });

  it('ref detach (A -> nullish) cleans the old pair WITHOUT a mount(nullish); reattach (nullish -> B) mounts without a spurious cleanup', () => {
    const question = createQuestion('q-detach');
    const refA = { id: 'ref-a' };
    const refB = { id: 'ref-b' };
    const { rerender } = render(
      <HookProbe
        testID="detach-1"
        question={question}
        creator={{}}
        nativeRef={refA}
      />
    );
    expect(HookProbe.events).toEqual([{ kind: 'mount', question, ref: refA }]);

    // Detach: cleanup of the captured pair only — onQuestionMounted must
    // never fire with a nullish ref.
    rerender(<HookProbe testID="detach-1" question={question} creator={{}} />);
    expect(HookProbe.events).toEqual([
      { kind: 'mount', question, ref: refA },
      { kind: 'unmount', question, ref: refA },
    ]);

    // Reattach: a fresh mount, no cleanup (there was no pair to clean).
    rerender(
      <HookProbe
        testID="detach-1"
        question={question}
        creator={{}}
        nativeRef={refB}
      />
    );
    expect(HookProbe.events).toEqual([
      { kind: 'mount', question, ref: refA },
      { kind: 'unmount', question, ref: refA },
      { kind: 'mount', question, ref: refB },
    ]);
  });

  it('question-only transition while detached (nullish ref) emits nothing', () => {
    const questionA = createQuestion('q-detached-a');
    const questionB = createQuestion('q-detached-b');
    const { rerender } = render(
      <HookProbe testID="detached-q" question={questionA} creator={{}} />
    );
    rerender(
      <HookProbe testID="detached-q" question={questionB} creator={{}} />
    );
    expect(HookProbe.events).toEqual([]);
  });

  it('question-only transition with a stable concrete ref re-fires the pair hook', () => {
    const questionA = createQuestion('q-only-a');
    const questionB = createQuestion('q-only-b');
    const ref = { id: 'stable' };
    const { rerender } = render(
      <HookProbe
        testID="q-only"
        question={questionA}
        creator={{}}
        nativeRef={ref}
      />
    );
    rerender(
      <HookProbe
        testID="q-only"
        question={questionB}
        creator={{}}
        nativeRef={ref}
      />
    );
    expect(HookProbe.events).toEqual([
      { kind: 'mount', question: questionA, ref },
      { kind: 'unmount', question: questionA, ref },
      { kind: 'mount', question: questionB, ref },
    ]);
  });

  it('ref-only transition with a stable question re-fires the pair hook', () => {
    const question = createQuestion('q-ref-only');
    const refA = { id: 'ref-a' };
    const refB = { id: 'ref-b' };
    const { rerender } = render(
      <HookProbe
        testID="ref-only"
        question={question}
        creator={{}}
        nativeRef={refA}
      />
    );
    rerender(
      <HookProbe
        testID="ref-only"
        question={question}
        creator={{}}
        nativeRef={refB}
      />
    );
    expect(HookProbe.events).toEqual([
      { kind: 'mount', question, ref: refA },
      { kind: 'unmount', question, ref: refA },
      { kind: 'mount', question, ref: refB },
    ]);
  });

  it('real callback ref: the actual host instance flows through mount and (captured) through cleanup', () => {
    const events: MountEvent[] = [];
    class RealRefProbe extends QuestionElementBase<
      ProbeProps,
      SurveyElementBaseState
    > {
      protected onQuestionMounted(question: Question, ref: unknown): void {
        events.push({ kind: 'mount', question, ref });
      }
      protected onQuestionWillUnmount(question: Question, ref: unknown): void {
        events.push({ kind: 'unmount', question, ref });
      }
      protected renderElement(): React.JSX.Element {
        return (
          <Text
            testID={this.props.testID}
            ref={(instance) => {
              this.setNativeElement(instance);
            }}
          >
            real
          </Text>
        );
      }
    }

    const question = createQuestion('q-real-ref');
    const { unmount } = render(
      <RealRefProbe testID="real-1" question={question} creator={{}} />
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('mount');
    expect(events[0]!.question).toBe(question);
    expect(events[0]!.ref).toBeTruthy();
    const mountedInstance = events[0]!.ref;

    unmount();
    expect(events).toHaveLength(2);
    expect(events[1]!.kind).toBe('unmount');
    expect(events[1]!.question).toBe(question);
    // The CAPTURED pair flows into cleanup — the same host instance, even
    // though React may have detached the live ref by now.
    expect(events[1]!.ref).toBe(mountedInstance);
  });

  it('dev-mode warning: onQuestionMounted mutating the model warns (mount-commit invariant); post-mount mutation does not', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      class MountMutatorProbe extends QuestionElementBase<
        ProbeProps,
        SurveyElementBaseState
      > {
        // Real question components subscribe their question (upstream
        // getStateElement pattern) — required for the handler (and its
        // warning) to fire at all.
        protected getStateElement(): Base {
          return this.questionBase;
        }
        protected onQuestionMounted(question: Question): void {
          question.indent = 5;
        }
        protected renderElement(): React.JSX.Element {
          return (
            <Text
              testID={this.props.testID}
              ref={(instance) => {
                this.setNativeElement(instance);
              }}
            >
              warn
            </Text>
          );
        }
      }

      const question = createQuestion('q-warn');
      render(
        <MountMutatorProbe testID="warn-1" question={question} creator={{}} />
      );
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
});
