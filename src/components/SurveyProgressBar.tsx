/**
 * `SurveyProgressBar` -- task 1.8: the percentage progress bar. RN port
 * of survey-react-ui's `SurveyProgress` (progress.tsx), bound to
 * `survey.progressValue`/`survey.progressText`/`survey.progressBarAriaLabel`.
 *
 * v1 scope (design: docs/IMPLEMENTATION-PLAN.md row 1.8 -- "v1: percentage
 * bar + text via progressText; button/TOC variants documented deferred"):
 * this component renders the percentage-bar visual for exactly the
 * `progressBarType` family upstream routes through its own
 * `SurveyProgress`
 * (`"pages"`/`"questions"`/`"requiredQuestions"`/`"correctQuestions"` --
 * they differ only in what `progressValue`/`progressText` COMPUTE to,
 * already core's own logic, consumed as-is). Upstream's obsolete
 * `"buttons"` value and the newer TOC/page-titles extension
 * (`ProgressButtons`, progressButtons.tsx) render through a materially
 * different component tree (scrollable page list, header/footer titles)
 * and are explicitly DEFERRED -- for those types this component renders
 * NULL and reports a once-per-instance
 * `progress-bar-type-unsupported` diagnostic (review round 1: showing
 * the percentage bar for them would misrepresent the survey's config).
 *
 * Structure (review round 1): the height-limited, overflow-hidden track
 * contains ONLY the fill; the visible `progressText` is the track's
 * SIBLING below it -- upstream renders the fill inside the bar and the
 * visible text outside it (progress.tsx:33-52; the in-bar text copy is
 * the one its default CSS hides), so text inside our clipping track
 * would render cut off.
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
import { reportDiagnostic } from '../diagnostics';

/** The `progressBarType` family upstream's `SurveyProgress` itself renders. */
const PERCENTAGE_PROGRESS_TYPES = new Set([
  'pages',
  'questions',
  'requiredQuestions',
  'correctQuestions',
]);

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

  /** Once-per-instance guard for the unsupported-type diagnostic. */
  private reportedUnsupportedType = false;

  protected canRender(): boolean {
    if (!this.survey || !this.survey.showProgressBar) return false;
    const progressBarType = this.survey.progressBarType;
    if (PERCENTAGE_PROGRESS_TYPES.has(progressBarType)) return true;
    if (!this.reportedUnsupportedType) {
      this.reportedUnsupportedType = true;
      reportDiagnostic({
        code: 'progress-bar-type-unsupported',
        progressBarType,
        message:
          `progressBarType "${progressBarType}" renders a button/TOC ` +
          'component tree upstream and is deferred; the percentage bar ' +
          'is not rendered for it.',
      });
    }
    return false;
  }

  protected renderElement(): React.JSX.Element {
    const survey = this.survey;
    const { recipes, styles } = this.themeContext;
    const fragments = recipes.progress.fragments;
    const slots = styles.progress;
    const progress = survey.progressValue;
    return (
      <View testID={this.props.testID ?? 'survey-progress-bar'}>
        <View
          testID="survey-progress-bar-track"
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
        </View>
        <Text style={composeStyles(fragments.text, { override: slots?.text })}>
          {survey.progressText}
        </Text>
      </View>
    );
  }
}
