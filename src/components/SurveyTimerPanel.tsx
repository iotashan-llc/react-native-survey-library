/**
 * `SurveyTimerPanel` — RN port of survey-react-ui's `SurveyTimerPanel`
 * (reacttimerpanel.tsx), task 5.7a: renders the survey timer info at the
 * top or bottom of the survey.
 *
 * survey-core owns ALL timing (SurveyTimerModel / the SurveyTimer singleton
 * interval, `timeLimit`/`timeLimitPerPage`, per-page/per-survey spent
 * counters, `onTimerTick`, and the auto-advance/auto-complete on limit).
 * This component only READS the model's already-computed timer strings and
 * re-renders on the model's per-tick property notifications — it never
 * recomputes timing math (invariant 6).
 *
 * Reactivity (0.4 `SurveyElementBase`): the state element is
 * `survey.timerModel` (parity with upstream `getStateElement()`), whose
 * `text`/`clockMajorText`/`clockMinorText`/`progress`/`spent`/`isRunning`
 * are all `@property`s that fire `onPropertyChanged` on every tick — so a
 * subscriber re-renders each second with the fresh values.
 *
 * Placement: the shell renders this component twice — `location="top"`
 * before the pages and `location="bottom"` after the nav — and each
 * instance self-gates on `survey.isTimerPanelShowingOnTop`/
 * `isTimerPanelShowingOnBottom` (mirroring upstream's layout-element
 * `isInContainer("header")`/`("footer")`), so only the configured slot
 * renders content; the other renders nothing.
 *
 * Documented RN deltas (DIFFERENCES.md → "Survey timer panel"):
 * - Upstream renders a `showTimerAsClock` badge as a `position: fixed`
 *   circle with an SVG progress ring (`icon-timercircle`). RN renders an
 *   INLINE, centered TEXT badge (major + optional minor) in the shell's
 *   top/bottom slot; the SVG progress ring is OMITTED. The plain
 *   `timerInfoText` sentence is rendered instead when `showTimerAsClock`
 *   is false (a css with no `clockTimerRoot`).
 * - `showTimerPanelMode` (`timerInfoMode`: page/survey/combined) is honored
 *   transparently — the model's `clockMajorText`/`clockMinorText`/`text`
 *   already reflect it; nothing mode-specific is computed here.
 */
import * as React from 'react';
import { Text, View } from 'react-native';
import type { Base, SurveyModel, SurveyTimerModel } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { composeStyles } from '../theme-rn/recipes/types';

export interface SurveyTimerPanelProps {
  survey: SurveyModel;
  /** Which shell slot this instance occupies. */
  location: 'top' | 'bottom';
  testID?: string;
}

export class SurveyTimerPanel extends SurveyElementBase<SurveyTimerPanelProps> {
  private get survey(): SurveyModel {
    return this.props.survey;
  }

  private get timerModel(): SurveyTimerModel {
    return this.survey.timerModel;
  }

  /** Subscribe to the timer model — its per-tick `@property` changes drive
   * the re-render (upstream `getStateElement()` parity). */
  protected getStateElement(): Base | null {
    return this.survey ? this.timerModel : null;
  }

  /** Render only in the configured slot AND only while the core timer is
   * running (upstream renders `null` when `!isRunning`). */
  protected canRender(): boolean {
    if (!this.survey || !this.timerModel.isRunning) return false;
    return this.props.location === 'top'
      ? this.survey.isTimerPanelShowingOnTop
      : this.survey.isTimerPanelShowingOnBottom;
  }

  protected renderElement(): React.JSX.Element | null {
    const timerModel = this.timerModel;
    const location = this.props.location;
    const testID = this.props.testID ?? `survey-timer-panel-${location}`;
    const { recipes, styles } = this.themeContext;
    const fragments = recipes.timerPanel.fragments;
    const slots = styles.timerPanel;
    const rootStyle = composeStyles(
      [
        fragments.root,
        location === 'top' ? fragments.rootTop : fragments.rootBottom,
      ],
      { override: slots?.root }
    );
    // The full sentence is the accessible label even in clock mode, so a
    // screen reader hears "…spent 0 sec of 30 sec…" rather than a bare
    // "0:30". `timerModel.text` is the model's already-localized string.
    const accessibilityLabel = timerModel.text || undefined;

    if (timerModel.showTimerAsClock) {
      return (
        <View
          testID={testID}
          accessible
          accessibilityLabel={accessibilityLabel}
          style={rootStyle}
        >
          <View style={composeStyles(fragments.textContainer)}>
            <Text
              testID="survey-timer-panel-major"
              style={composeStyles(fragments.majorText, {
                override: slots?.majorText,
              })}
            >
              {timerModel.clockMajorText}
            </Text>
            {timerModel.clockMinorText ? (
              <Text
                testID="survey-timer-panel-minor"
                style={composeStyles(fragments.minorText, {
                  override: slots?.minorText,
                })}
              >
                {timerModel.clockMinorText}
              </Text>
            ) : null}
          </View>
        </View>
      );
    }

    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={accessibilityLabel}
        style={rootStyle}
      >
        <Text
          testID="survey-timer-panel-text"
          style={composeStyles(fragments.text, { override: slots?.text })}
        >
          {timerModel.text}
        </Text>
      </View>
    );
  }
}
