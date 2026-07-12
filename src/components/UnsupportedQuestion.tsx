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
 * `UnsupportedQuestion` is the FIXED lifecycle owner (review round 3): it
 * always mounts, owning the reactive subscription (via
 * `QuestionElementBase`) and the commit-phase `unsupported-question-type`
 * diagnostic — once per (question, dispatchKey), never during render. The
 * renderer configured through `setUnsupportedQuestionRenderer()` is
 * PRESENTATION-ONLY: it renders INSIDE `renderElement()` and cannot
 * displace the diagnostic/reactivity contract (swapping the whole
 * component would silently lose both).
 *
 * Default presentation: a neutral title + "Unsupported question type:
 * <type>" box. Theme-token styling arrives with 0.7 — there is no theme
 * pipeline yet to style against.
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

/**
 * Presentation component contract for `setUnsupportedQuestionRenderer`:
 * receives the full fallback props; owns pixels only. Lifecycle
 * (diagnostics + reactive subscription) stays with `UnsupportedQuestion`.
 */
export type UnsupportedQuestionRenderer =
  React.ComponentType<UnsupportedQuestionProps>;

function DefaultUnsupportedPresentation(
  props: UnsupportedQuestionProps
): React.JSX.Element {
  const { question } = props;
  return (
    <View>
      <Text>{question.title || question.name}</Text>
      <Text>{`Unsupported question type: ${question.getType()}`}</Text>
    </View>
  );
}

let currentPresentation: UnsupportedQuestionRenderer =
  DefaultUnsupportedPresentation;

/**
 * Swaps the PRESENTATION of the fallback (pass `undefined` to restore the
 * default box). The configured component renders inside the fixed
 * `UnsupportedQuestion` wrapper, which keeps owning the once-per-
 * (question, dispatchKey) diagnostic and the reactive subscription — a
 * custom renderer cannot accidentally opt out of either.
 */
export function setUnsupportedQuestionRenderer(
  component: UnsupportedQuestionRenderer | undefined
): void {
  currentPresentation = component ?? DefaultUnsupportedPresentation;
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
    const Presentation = currentPresentation;
    return <Presentation {...this.props} />;
  }
}

export function createUnsupportedQuestion(
  props: QuestionElementBaseProps,
  missInfo: UnsupportedMissInfo
): React.JSX.Element {
  return <UnsupportedQuestion {...props} missInfo={missInfo} />;
}
