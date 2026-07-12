/**
 * Non-throwing fallback for a question dispatch-key miss (design:
 * docs/design/0.5-factories.md, "Unsupported fallback", invariant 9 — never
 * throws). NOT in the registry: there is no magic `__unsupported` key (it
 * would be collidable and would pollute `getAllTypes()`). The dispatcher
 * contract is a plain `??`, written by the caller (M1's `<Survey>` question
 * dispatch — see design "Non-goals: no Survey shell/dispatcher wiring
 * beyond fallback resolution"):
 *
 *   RNQuestionFactory.createQuestion(dispatchKey, props) ?? createUnsupportedQuestion(props, missInfo)
 *
 * Renders a neutral title + "Unsupported question type: <type>" box.
 * Theme-token styling arrives with 0.7 — there is no theme pipeline yet to
 * style against. Emits an `unsupported-question-type` diagnostic once per
 * (question, dispatchKey) from the commit phase (`componentDidMount`/
 * `componentDidUpdate`), never during render.
 */
import * as React from 'react';
import { View, Text } from 'react-native';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { reportUnsupportedQuestionTypeOnce } from '../diagnostics';

export interface UnsupportedMissInfo {
  /** The dispatch key the caller looked up and failed to find. */
  dispatchKey: string;
}

export interface UnsupportedQuestionProps extends QuestionElementBaseProps {
  missInfo: UnsupportedMissInfo;
}

export class UnsupportedQuestion extends QuestionElementBase<UnsupportedQuestionProps> {
  componentDidMount(): void {
    super.componentDidMount();
    this.emitDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.emitDiagnostic();
  }

  private emitDiagnostic(): void {
    const question = this.questionBase;
    if (!question) return;
    const { dispatchKey } = this.props.missInfo;
    reportUnsupportedQuestionTypeOnce(question, {
      code: 'unsupported-question-type',
      questionType: question.getType(),
      dispatchKey,
      template: question.getTemplate(),
      componentName: question.getComponentName(),
      name: question.name,
    });
  }

  protected renderElement(): React.JSX.Element {
    const question = this.questionBase;
    return (
      <View>
        <Text>{question.title || question.name}</Text>
        <Text>{`Unsupported question type: ${question.getType()}`}</Text>
      </View>
    );
  }
}

type UnsupportedQuestionComponent =
  React.ComponentType<UnsupportedQuestionProps>;

let currentRenderer: UnsupportedQuestionComponent = UnsupportedQuestion;

/** Pass `undefined` to restore the default `UnsupportedQuestion` renderer. */
export function setUnsupportedQuestionRenderer(
  component: UnsupportedQuestionComponent | undefined
): void {
  currentRenderer = component ?? UnsupportedQuestion;
}

export function createUnsupportedQuestion(
  props: QuestionElementBaseProps,
  missInfo: UnsupportedMissInfo
): React.JSX.Element {
  const Component = currentRenderer;
  return <Component {...props} missInfo={missInfo} />;
}
