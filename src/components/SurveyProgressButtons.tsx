/**
 * `SurveyProgressButtons` — task 5.7c: the step-button progress nav. RN
 * port of survey-react-ui's `SurveyProgressButtons` (progressButtons.tsx).
 *
 * survey-core owns the whole model. This component REUSES the survey's own
 * `ProgressButtons` (`survey.progressBar` — the lazily-created, cached
 * instance; never a hand-built one) as its state element and drives every
 * decision through it:
 * - `visiblePages` → one step per page;
 * - `getItemNumber(page)` → the numbered circle (empty unless
 *   `progressBarShowPageNumbers`);
 * - `showItemTitles` → whether per-step titles render;
 * - `getListElementCss(index)` → the `--passed`/`--current` CssClassBuilder
 *   tokens the recipe composes (invariant 6: model-state styling is read,
 *   never re-derived);
 * - `isListElementClickable(index)` → the press gate + dimmed state;
 * - `clickListElement(page)` → navigation (invariant: nav goes ONLY
 *   through the core model, which calls `survey.tryNavigateToPage`; this
 *   component never sets `currentPage`).
 *
 * Reactive via the 0.4 `SurveyElementBase` mechanism: the state element is
 * the `ProgressButtons` model, whose `onCurrentPageChanged` resets
 * `progressText` (a property change) and whose `visiblePages` is a
 * property array — so a page change / visibility change re-renders and the
 * active/passed highlight and footer text follow.
 *
 * RN responsivity deviation (DIFFERENCES.md → "Progress buttons"): the DOM
 * `ProgressButtonsResponsivityManager` (HTMLElement width measurement →
 * scroll arrows + hide-titles) is replaced by a horizontal `ScrollView`
 * (native touch-scroll). Titles are shown whenever `showItemTitles` is
 * true — no width-driven auto-collapse, and the DOM scroll-arrow buttons
 * are omitted (touch scrolls the row). When titles are hidden the footer
 * shows the model's `footerText` (progress text), matching web's
 * `canShowFooter = !showItemTitles`; the responsive-collapse header (web's
 * `canShowHeader`) has no analog and is not rendered.
 */
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type {
  Base,
  PageModel,
  ProgressButtons,
  SurveyModel,
} from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { composeStyles } from '../theme-rn/recipes/types';

export interface SurveyProgressButtonsProps {
  survey: SurveyModel;
  testID?: string;
}

export class SurveyProgressButtons extends SurveyElementBase<SurveyProgressButtonsProps> {
  private get survey(): SurveyModel {
    return this.props.survey;
  }

  /** The survey's own cached `ProgressButtons` — `progressBar` is typed
   * `any` upstream; narrow it here for the model calls below. */
  private get model(): ProgressButtons {
    return this.survey.progressBar as ProgressButtons;
  }

  /** Subscribe to BOTH the `ProgressButtons` model AND the survey. The
   * model's `onCurrentPageChanged` only fires a property change (via
   * `resetProgressText`) when `progressText` was previously READ/cached —
   * and it is read only for the footer (titles-hidden mode). Subscribing
   * to the survey too guarantees the active/passed highlight re-renders on
   * every `currentPage` change regardless of the footer being shown
   * (the survey fires a `currentPage` property change). `visiblePages`
   * (a model property array) covers page-visibility changes. */
  protected getStateElements(): Base[] {
    if (!this.survey) return [];
    return [
      this.survey.progressBar as unknown as Base,
      this.survey as unknown as Base,
    ];
  }

  protected canRender(): boolean {
    return !!this.survey && this.survey.showProgressBar;
  }

  private readonly handlePress = (page: PageModel, index: number): void => {
    // Nav goes ONLY through the core model, and ONLY for clickable steps.
    if (this.model.isListElementClickable(index)) {
      this.model.clickListElement(page);
    }
  };

  protected renderElement(): React.JSX.Element {
    const model = this.model;
    const { recipes, styles } = this.themeContext;
    const recipe = recipes.progressButtons;
    const overrides = styles.progressButtons;
    const pages = model.visiblePages;
    const showTitles = model.showItemTitles;

    return (
      <View
        testID={this.props.testID ?? 'survey-progress-buttons'}
        accessibilityRole="progressbar"
        accessibilityLabel={model.progressBarAriaLabel}
        style={composeStyles(recipe.fragments.root, {
          override: overrides?.root,
        })}
      >
        <ScrollView
          testID="survey-progress-buttons-scroll"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={StyleSheet.flatten(recipe.fragments.list)}
        >
          {pages.map((page, index) => this.renderStep(page, index, showTitles))}
        </ScrollView>
        {!showTitles ? (
          <View style={recipe.fragments.footer}>
            <Text
              testID="survey-progress-buttons-footer"
              style={composeStyles(recipe.fragments.footerText, {
                override: overrides?.footerText,
              })}
            >
              {model.footerText}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  private renderStep(
    page: PageModel,
    index: number,
    showTitles: boolean
  ): React.JSX.Element {
    const model = this.model;
    const { recipes, styles } = this.themeContext;
    const f = recipes.progressButtons.fragments;
    const overrides = styles.progressButtons;
    // Model-state tokens (invariant 6): read the CssClassBuilder string,
    // never re-derive page passed/current logic.
    const css = model.getListElementCss(index) ?? '';
    const isCurrent = css.includes('--current');
    const isPassed = css.includes('--passed');
    const clickable = model.isListElementClickable(index);
    const number = model.getItemNumber(page);

    return (
      <Pressable
        key={`step-${index}`}
        testID={`survey-progress-step-${index}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isCurrent, disabled: !clickable }}
        disabled={!clickable}
        onPress={() => this.handlePress(page, index)}
        style={composeStyles<ViewStyle>(
          [f.step, ...(clickable ? [] : [f.stepNonClickable])],
          { override: overrides?.step }
        )}
      >
        <View
          style={composeStyles<ViewStyle>(
            [
              f.circle,
              ...(isPassed ? [f.circlePassed] : []),
              ...(isCurrent ? [f.circleCurrent] : []),
            ],
            { override: overrides?.circle }
          )}
        >
          <Text
            style={composeStyles([
              f.number,
              ...(isPassed ? [f.numberPassed] : []),
              ...(isCurrent ? [f.numberCurrent] : []),
            ])}
          >
            {number}
          </Text>
        </View>
        {showTitles
          ? // Route the nav title through the loc-string seam (web parity:
            // progressButtons.tsx uses SurveyElementBase.renderLocString on
            // page.locNavigationTitle) so a markdown/html navigationTitle
            // renders sanitized (invariant 8) rather than as literal tags,
            // and collapseHardLineBreaks applies — matching every sibling
            // title renderer. Deviation: the seam's <Text> has no
            // numberOfLines clamp (web truncates via CSS on an outer
            // container, not the string seam).
            this.renderLocString(
              page.locNavigationTitle,
              composeStyles(f.title, { override: overrides?.title }),
              `step-title-${index}`
            )
          : null}
      </Pressable>
    );
  }
}
