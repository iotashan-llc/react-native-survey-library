/**
 * Reusable, independently-REACTIVE question error renderer (design:
 * docs/design/M3-matrix-family-plan.md §2a, phasing row 3.3a-pre) —
 * extracted from `QuestionChrome`'s private `renderErrors` so chrome-less
 * matrix cell dispatch (3.3a) can surface a cell question's errors inline
 * without the table base having to know.
 *
 * A `SurveyElementBase`-derived class component (invariant 2): its
 * `getStateElement()` is the `Question` it is given, so it subscribes to
 * that question's notifications on its own — an error appearing or
 * clearing after mount (the `errors` array change / `hasVisibleErrors`
 * property change core fires) re-renders THIS unit with no parent
 * re-render required. A static helper would not be reactive on its own;
 * that is why the extraction is a component, not a pure function (§2a).
 *
 * Returns `null` unless the question has visible errors — preserving
 * `QuestionChrome`'s existing `hasVisibleErrors` gate. Position-specific
 * gating (`showErrorsAboveQuestion` / `showErrorsBelowQuestion`) stays at
 * the chrome call site; cell dispatch renders the default `below` posture
 * inline under the cell body.
 *
 * Tone policy = upstream's (carried over verbatim from the chrome): the
 * PANEL tone follows `currentNotificationType` (highest severity among
 * visible errors; error > warning > info), and core's `calcRenderedErrors`
 * already filters `renderedErrors` to exactly that type — the panel is
 * homogeneous by construction, so per-error tones cannot diverge
 * (survey-element.ts:793-816; sd-error.scss:26-38).
 */
import * as React from 'react';
import { View } from 'react-native';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import type { SurveyElementBaseState } from '../reactivity/SurveyElementBase';
import type { Base, Question } from '../core/facade';
import { composeStyles } from '../theme-rn/recipes/types';

export interface QuestionErrorsProps {
  question: Question;
  /**
   * Which chrome error-panel spacing variant to apply. Chrome passes its
   * `errorLocation`-derived position; the chrome-less cell path takes the
   * default — inline directly under the cell body — i.e. `below`.
   */
  position?: 'above' | 'below';
}

export class QuestionErrors extends SurveyElementBase<
  QuestionErrorsProps,
  SurveyElementBaseState
> {
  protected getStateElement(): Base | null {
    return this.props.question ?? null;
  }

  protected canRender(): boolean {
    return !!this.props.question;
  }

  protected renderElement(): React.JSX.Element | null {
    const question = this.props.question;
    if (!question.hasVisibleErrors) return null;

    const position = this.props.position ?? 'below';
    const { recipes, styles: overrides } = this.themeContext;
    const f = recipes.questionChrome.fragments;
    const chromeOverrides = overrides.questionChrome;
    const panelVariant =
      position === 'above' ? f.errorPanelAbove : f.errorPanelBelow;
    const tone = question.currentNotificationType;
    const panelFragments = [f.errorPanel, panelVariant];
    const itemFragments = [f.errorItem];
    if (tone === 'warning') {
      panelFragments.push(f.errorPanelWarning);
      itemFragments.push(f.errorItemWarning);
    } else if (tone === 'info') {
      panelFragments.push(f.errorPanelInfo);
      itemFragments.push(f.errorItemInfo);
    }
    return (
      <View
        testID={`${question.name}-errors-${position}`}
        accessibilityRole="alert"
        style={composeStyles(panelFragments, {
          override: chromeOverrides?.errorPanel,
        })}
      >
        {question.renderedErrors.map((error, index) =>
          this.renderLocString(
            error.locText,
            composeStyles(itemFragments, {
              override: chromeOverrides?.errorItem,
            }),
            `error-${position}-${index}`,
            'error'
          )
        )}
      </View>
    );
  }
}
