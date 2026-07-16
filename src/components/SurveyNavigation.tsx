/**
 * `SurveyNavigation` -- task 1.8: the Prev/Next/Complete/Preview button
 * bar. RN port of survey-react-ui's navigation-bar wiring
 * (`SurveyModel.navigationBar`/`createNavigationActions` in survey.ts;
 * upstream renders each action through `sv-nav-btn`/
 * `SurveyNavigationButton`, a plain `<input type="button">`).
 *
 * RN delta (deliberate, per task 1.8): each visible action renders through
 * the already-built `<ActionButton>` primitive (task 1.5's RN analog of
 * `SurveyActionBarItem`) rather than porting a second, DOM-input-shaped
 * button component -- RN has no faithful analog of a plain
 * `<input type="button">`, and `ActionButton` already implements the
 * FULL `Action` model contract (title/icon/enabled/visible/pressed/mode,
 * DOM-shaped `doAction` event shim, a11y) that `sv-nav-btn` only
 * partially covers.
 *
 * Per invariant 6, visibility is CONSUMED, never re-derived: this
 * component maps `survey.navigationBar.visibleActions` (core's own
 * `ActionContainer`, already filtered) straight onto `<ActionButton>` --
 * it does not re-check `action.isVisible` itself (ActionButton's own
 * `canRender()` does that defensively). Per-action `enabled`/`disabled`
 * during navigation (`isNavigationBlocked`) is likewise core's own
 * `ComputedUpdater`, consumed via each ActionButton's own subscription.
 *
 * Variant mapping (verified against survey-core's `defaultCss.ts`
 * `navigation` block): ONLY `sv-nav-complete` carries `sd-btn--action` --
 * prev/next/start/preview are plain `sd-btn` (the 0.7 button recipe's
 * `"default"` variant).
 *
 * `navigationBar.visibleActions` itself recomputes via a DEBOUNCED
 * (`queueMicrotask`) internal update on the survey-core side
 * (`actions/container.ts`) -- a page-navigation-driven add/remove of a
 * button lags by one microtask; this component's own subscription (via
 * the 0.4 base, `getStateElement() => navigationBar`) picks up the
 * resulting array-changed event whenever it fires, same as upstream's own
 * (equally debounced) behavior on web.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { Base, SurveyModel } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { ActionButton } from './ActionButton';
import type { ButtonKind } from '../theme-rn/recipes/button';
import { composeStyles } from '../theme-rn/recipes/types';
import { calcSize } from '../theme-rn/recipes/tokenLookup';

export interface SurveyNavigationProps {
  survey: SurveyModel;
  testID?: string;
}

/** `defaultCss.ts`'s `navigation.complete: "sd-btn--action ..."` -- every other nav id is plain `sd-btn` (the recipe's implicit "default"). */
const ACTION_VARIANT_OVERRIDES: Readonly<Record<string, ButtonKind>> = {
  'sv-nav-complete': 'action',
};

function variantForAction(actionId: string): ButtonKind {
  return ACTION_VARIANT_OVERRIDES[actionId] ?? 'default';
}

export class SurveyNavigation extends SurveyElementBase<SurveyNavigationProps> {
  private get survey(): SurveyModel {
    return this.props.survey;
  }

  protected getStateElement(): Base | null {
    return this.survey?.navigationBar ?? null;
  }

  protected canRender(): boolean {
    return !!this.survey && this.survey.navigationBar.visibleActions.length > 0;
  }

  protected renderElement(): React.JSX.Element {
    const { resolved, styles } = this.themeContext;
    const slots = styles.navigation;
    const rowStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      gap: calcSize(resolved, 2),
    };
    return (
      <View
        testID={this.props.testID ?? 'survey-navigation'}
        style={composeStyles<ViewStyle>(rowStyle, { override: slots?.root })}
      >
        {this.survey.navigationBar.visibleActions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            variant={variantForAction(action.id)}
            testID={`survey-nav-${action.id}`}
          />
        ))}
      </View>
    );
  }
}
