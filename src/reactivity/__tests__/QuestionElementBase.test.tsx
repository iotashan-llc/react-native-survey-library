/**
 * `QuestionElementBase` — RN analog of survey-react-ui's
 * `SurveyQuestionElementBase` (design: docs/design/0.4-reactive-base.md,
 * port map). Covers the as-is carry-overs (getRenderedElements ==
 * [questionBase], canRender/isDisplayMode/creator) and the one genuinely
 * new RN behavior: the captured-pair mounted hook that replaces upstream's
 * DOM `data-rendered` idempotence.
 */
import * as React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
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

class HookProbe extends QuestionElementBase<
  ProbeProps,
  SurveyElementBaseState
> {
  public static events: MountEvent[] = [];

  componentDidMount(): void {
    this.setNativeElement(this.props.nativeRef);
    super.componentDidMount();
  }

  componentDidUpdate(): void {
    this.setNativeElement(this.props.nativeRef);
    super.componentDidUpdate();
  }

  protected onQuestionMounted(question: Question, ref: unknown): void {
    HookProbe.events.push({ kind: 'mount', question, ref });
  }

  protected onQuestionWillUnmount(question: Question, ref: unknown): void {
    HookProbe.events.push({ kind: 'unmount', question, ref });
  }

  protected renderElement(): React.JSX.Element {
    return <Text testID={this.props.testID}>{this.questionBase.name}</Text>;
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
});
