/**
 * `SurveyProgressBar` -- task 1.8: the percentage progress bar. RN port
 * of survey-react-ui's `SurveyProgress` (progress.tsx), bound to
 * `survey.progressValue`/`survey.progressText`/`survey.progressBarAriaLabel`.
 *
 * Scope: this component renders the percentage-bar visual for exactly the
 * `progressBarType` family upstream routes through its own
 * `SurveyProgress`
 * (`"pages"`/`"questions"`/`"requiredQuestions"`/`"correctQuestions"` --
 * they differ only in what `progressValue`/`progressText` COMPUTE to,
 * already core's own logic, consumed as-is). The `"buttons"` route
 * (upstream's obsolete `"buttons"` value AND `"pages"` under the default
 * css type, which `progressBarComponentName` normalizes to `"buttons"`)
 * renders the step-button nav through `SurveyProgressButtons` (task 5.7c)
 * -- a materially different tree (scrollable page-step list) delegated to
 * that component. Any OTHER effective route (a future/unknown type)
 * renders NULL and reports a once-per-instance
 * `progress-bar-type-unsupported` diagnostic (showing the percentage bar
 * for it would misrepresent the survey's config).
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
import { SurveyProgressButtons } from './SurveyProgressButtons';

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
    const normalized = effectiveType.toLowerCase();
    // The percentage-bar family + the buttons step-nav (task 5.7c) are
    // both rendered; only a future/unknown effective route is unsupported.
    if (PERCENTAGE_PROGRESS_TYPES.has(normalized) || normalized === 'buttons') {
      return true;
    }
    this.pendingUnsupportedType = { progressBarType, effectiveType };
    return false;
  }

  protected renderElement(): React.JSX.Element {
    const survey = this.survey;
    // Buttons route (task 5.7c): delegate to the step-button nav. This
    // covers the obsolete `"buttons"` value AND `"pages"` under the
    // default css type (progressBarComponentName normalizes to buttons).
    if (
      effectiveProgressType(survey.progressBarType).toLowerCase() === 'buttons'
    ) {
      return <SurveyProgressButtons survey={survey} />;
    }
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
