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
import { settings, surveyCss } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { composeStyles } from '../theme-rn/recipes/types';
import { reportDiagnostic } from '../diagnostics';

/** The EFFECTIVE progress routes upstream's percentage `SurveyProgress`
 * itself registers (sv-progress-pages/questions/correctquestions/
 * requiredquestions — progress.tsx:58-75), compared case-insensitively
 * the way `progressBarComponentName` builds the route. */
const PERCENTAGE_PROGRESS_TYPES = new Set([
  'pages',
  'questions',
  'requiredquestions',
  'correctquestions',
  // onSetting-normalized singular spellings (survey.ts progressBarType).
  'requiredquestion',
  'correctquestion',
]);

/**
 * Mirror of upstream's PRIVATE `progressBarComponentName` conversion
 * (survey.ts:2942-2949), from the same public inputs: under the default
 * css type with the legacy view disabled, `"pages"` routes to the
 * `progress-buttons` component tree — NOT the percentage bar.
 */
function effectiveProgressType(progressBarType: string): string {
  const css = surveyCss as { currentType?: string };
  if (
    !settings.legacyProgressBarView &&
    css.currentType === 'default' &&
    progressBarType.toLowerCase() === 'pages'
  ) {
    return 'buttons';
  }
  return progressBarType;
}

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

  /** Set during render, flushed from the commit lifecycles (repo
   * pattern: no diagnostics during a speculative/discardable render);
   * once per mounted instance. */
  private pendingUnsupportedType:
    { progressBarType: string; effectiveType: string } | undefined;
  private reportedUnsupportedType = false;

  componentDidMount(): void {
    super.componentDidMount();
    this.flushUnsupportedTypeDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushUnsupportedTypeDiagnostic();
  }

  private flushUnsupportedTypeDiagnostic(): void {
    const pending = this.pendingUnsupportedType;
    if (!pending || this.reportedUnsupportedType) return;
    this.reportedUnsupportedType = true;
    reportDiagnostic({
      code: 'progress-bar-type-unsupported',
      progressBarType: pending.progressBarType,
      effectiveType: pending.effectiveType,
      message:
        `progressBarType "${pending.progressBarType}" (effective route ` +
        `"${pending.effectiveType}") renders a button/TOC component tree ` +
        'upstream and is deferred; the percentage bar is not rendered ' +
        'for it.',
    });
  }

  protected canRender(): boolean {
    this.pendingUnsupportedType = undefined;
    if (!this.survey || !this.survey.showProgressBar) return false;
    const progressBarType = this.survey.progressBarType;
    const effectiveType = effectiveProgressType(progressBarType);
    if (PERCENTAGE_PROGRESS_TYPES.has(effectiveType.toLowerCase())) {
      return true;
    }
    this.pendingUnsupportedType = { progressBarType, effectiveType };
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
