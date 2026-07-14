/**
 * `SurveyProgressBar` -- task 1.8: the percentage progress bar. RN port
 * of survey-react-ui's `SurveyProgress` (progress.tsx), bound to
 * `survey.progressValue`/`survey.progressText`/`survey.progressBarAriaLabel`.
 *
 * v1 scope (design: docs/IMPLEMENTATION-PLAN.md row 1.8 -- "v1: percentage
 * bar + text via progressText; button/TOC variants documented deferred"):
 * this component renders the SAME percentage-bar visual for every
 * `progressBarType` upstream routes through its own `SurveyProgress`
 * (`"pages"`/`"questions"`/`"requiredQuestions"`/`"correctQuestions"` --
 * they differ only in what `progressValue`/`progressText` COMPUTE to,
 * already core's own logic, consumed as-is). It does NOT gate on
 * `progressBarType` itself -- upstream's obsolete `"buttons"` value and
 * the newer TOC/page-titles extension (`ProgressButtons`,
 * progressButtons.tsx) render through a materially different component
 * tree (scrollable page list, header/footer titles) and are explicitly
 * DEFERRED; the 1.1 shell (not yet merged) is expected to pick the right
 * element for `progressBarType` the same way upstream's
 * `progressBarComponentName` dispatch does, mounting this component only
 * for the percentage-bar types.
 *
 * Reactive via the 0.4 `SurveyElementBase` mechanism (subscribes the
 * survey model itself -- `progressValue`/`progressText` are plain
 * getters recomputed fresh on every render, not LocalizableStrings).
 */
import * as React from 'react';
import { Text, View } from 'react-native';
import type { Base, SurveyModel } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { composeStyles } from '../theme-rn/recipes/types';

export interface SurveyProgressBarProps {
  survey: SurveyModel;
  testID?: string;
}

export class SurveyProgressBar extends SurveyElementBase<SurveyProgressBarProps> {
  private get survey(): SurveyModel {
    return this.props.survey;
  }

  protected getStateElement(): Base | null {
    return this.survey ?? null;
  }

  protected canRender(): boolean {
    return !!this.survey && this.survey.showProgressBar;
  }

  protected renderElement(): React.JSX.Element {
    const survey = this.survey;
    const { recipes, styles } = this.themeContext;
    const fragments = recipes.progress.fragments;
    const slots = styles.progress;
    const progress = survey.progressValue;
    return (
      <View
        testID={this.props.testID ?? 'survey-progress-bar'}
        accessibilityRole="progressbar"
        accessibilityLabel={survey.progressBarAriaLabel}
        accessibilityValue={{ min: 0, max: 100, now: progress }}
        style={composeStyles(fragments.track, { override: slots?.track })}
      >
        <View
          testID="survey-progress-bar-fill"
          style={[
            { width: `${progress}%` },
            ...composeStyles(fragments.bar, { override: slots?.bar }),
          ]}
        />
        <Text style={composeStyles(fragments.text, { override: slots?.text })}>
          {survey.progressText}
        </Text>
      </View>
    );
  }
}
