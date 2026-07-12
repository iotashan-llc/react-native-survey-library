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
 * <type>" box, themed via the 0.7 `unsupportedQuestion` recipe (design
 * ownership table: "UnsupportedQuestion themed recipe (promised in 0.5) |
 * 0.7 -- recipe + wiring in the component"). A plain function component
 * reads the theme via `useContext` (not the reactive-binding hooks ban —
 * that's specifically about the survey-core model-subscription mechanism,
 * A3 — a static React Context read is unrelated).
 */
import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { reportUnsupportedQuestionTypeOnce } from '../diagnostics';
import { SurveyThemeContext } from '../theme-rn/provider';
import { composeStyles } from '../theme-rn/recipes/types';

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});

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
  const { recipes, styles: overrides } = React.useContext(SurveyThemeContext);
  const { panel, message, errorAccentBar } =
    recipes.unsupportedQuestion.fragments;
  const { title: titleRecipe } = recipes.unsupportedQuestion;
  // A12 slot overrides compose LAST (recipe < theme < consumer override).
  const slots = overrides.unsupportedQuestion;
  return (
    <View style={styles.row}>
      <View
        style={composeStyles(errorAccentBar, {
          override: slots?.errorAccentBar,
        })}
      />
      <View
        style={composeStyles(panel, { override: slots?.panel })}
        testID="unsupported-question-panel"
      >
        <Text style={titleRecipe.fragments.title}>
          {question.title || question.name}
        </Text>
        <Text
          style={composeStyles(message, { override: slots?.message })}
        >{`Unsupported question type: ${question.getType()}`}</Text>
      </View>
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
