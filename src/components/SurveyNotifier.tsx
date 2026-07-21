/**
 * `SurveyNotifier` — task 5.7c: the floating toast. RN port of
 * survey-react-ui's `NotifierComponent` (components/notifier.tsx).
 *
 * survey-core owns the toast state: `survey.notify(message, type,
 * showActions)` drives the survey's own `Notifier` (`survey.notifier`),
 * which this component uses as its state element. The `Notifier` sets
 * `isDisplayed`/`active`/`message`/`css` (info/error/success) and owns the
 * auto-hide timer + the `waitUserAction` actions — this component only
 * reflects them. Reactive via the 0.4 `SurveyElementBase` mechanism (state
 * element = `survey.notifier`, whose `@property` fields notify on change).
 *
 * - Type styling is read from the notifier's own `css` string
 *   (`Notifier.getCssClass` → `sv-save-data_info`/`_error`/`_success`) and
 *   mapped to the recipe variant (invariant 6: the type→style mapping is
 *   consumed, never re-derived).
 * - Auto-hide: the model clears `active` on its `settings.notifications
 *   .lifetime` timer; this component mounts only while `active` (RN
 *   deviation from web's CSS `visibility` transition — DIFFERENCES.md →
 *   "Notifier toast").
 * - `waitUserAction`: the model skips the auto-hide timer and makes its
 *   actions visible; they render through the shared `ActionButton`.
 * - Non-throwing fallback: no active message → renders null.
 *
 * Placement: mounted in the Survey shell's overlay layer as an absolute
 * band at the bottom of the survey root (RN deviation from web's viewport
 * `position: fixed`).
 */
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Action, Base, Notifier, SurveyModel } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { ActionButton } from './ActionButton';
import { composeStyles } from '../theme-rn/recipes/types';

type NotifierAction = React.ComponentProps<typeof ActionButton>['action'];

export interface SurveyNotifierProps {
  survey: SurveyModel;
  testID?: string;
}

export class SurveyNotifier extends SurveyElementBase<SurveyNotifierProps> {
  private get survey(): SurveyModel {
    return this.props.survey;
  }

  private get notifier(): Notifier {
    return this.survey.notifier;
  }

  protected getStateElement(): Base | null {
    return this.survey ? (this.survey.notifier as unknown as Base) : null;
  }

  protected canRender(): boolean {
    const notifier = this.notifier;
    // Non-throwing fallback: nothing to show until the model activates a
    // message. `active` gates the auto-hide (web keeps the DOM with
    // visibility:hidden; RN unmounts).
    return (
      !!notifier &&
      notifier.isDisplayed &&
      notifier.active &&
      !!notifier.message
    );
  }

  protected renderElement(): React.JSX.Element {
    const notifier = this.notifier;
    const { recipes, styles } = this.themeContext;
    const recipe = recipes.notifier;
    const overrides = styles.notifier;
    const css = notifier.css ?? '';
    const isError = css.includes('_error');
    const isSuccess = css.includes('_success');
    const emphasis = isError || isSuccess;
    const visibleActions = notifier.actionBar.getVisibleActions() as Action[];
    const hasButtons = visibleActions.length > 0;

    return (
      <View pointerEvents="box-none" style={localStyles.layer}>
        <View
          testID={this.props.testID ?? 'survey-notifier'}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={composeStyles(
            [
              recipe.fragments.root,
              ...(hasButtons ? [recipe.fragments.rootWithButtons] : []),
              isError
                ? recipe.fragments.variantError
                : isSuccess
                  ? recipe.fragments.variantSuccess
                  : recipe.fragments.variantInfo,
            ],
            { override: overrides?.root }
          )}
        >
          <Text
            style={composeStyles(
              [
                recipe.fragments.message,
                emphasis
                  ? recipe.fragments.messageEmphasis
                  : recipe.fragments.messageInfo,
              ],
              { override: overrides?.message }
            )}
          >
            {notifier.message}
          </Text>
          {hasButtons ? (
            <View testID="notifier-actions" style={recipe.fragments.actions}>
              {visibleActions.map((action) => (
                <ActionButton
                  key={action.id}
                  action={action as NotifierAction}
                  testID={`notifier-action-${action.id}`}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  }
}

/** The overlay band: an absolute layer pinned to the bottom-center of the
 * survey root (RN analog of web's viewport `position: fixed`). Positioning
 * is a component concern, not a theme token — the pill styling itself lives
 * in the notifier recipe. */
const localStyles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
  },
});
