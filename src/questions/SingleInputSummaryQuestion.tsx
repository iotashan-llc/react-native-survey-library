/**
 * `singleinputsummary` (task 3.5) — RN counterpart of survey-react-ui's
 * `SurveyQuestionSigleInputSummary` (reactquestion_singleinputsummary.tsx),
 * registered under the element key `sv-singleinput-summary`.
 *
 * PROBE FINDING (2026-07-21): `singleinputsummary` is NOT a survey-core
 * serializer question class — `Serializer.findClass('singleinputsummary')`
 * is `undefined` and it is absent from
 * `Serializer.getChildrenClasses('question', true)`. It is the plain helper
 * class `QuestionSingleInputSummary` (`question`, `noEntry`, `items[]`,
 * `isEmpty()`), dispatched by the web through `ReactElementFactory` under
 * `sv-singleinput-summary` (NOT the question factory — its renderer receives
 * a `summary` prop). So it is an ELEMENT-route descriptor row here (like
 * `sv-list`), NOT a `MODEL_TYPE_CLASSIFICATION` entry (which would trip
 * `diffModelTypeInventory.missingFromLive`, since there is no live question
 * class of that name to match).
 *
 * Its ONLY producer is the matrix/panel `questionsOnPageMode:"inputPerPage"`
 * single-input MODE (`QuestionSingleInputBehavior.createSingleInputSummary`
 * / `question.singleInputSummary`), a documented v0.3 NON-GOAL (design
 * §11.5; DIFFERENCES "Single-input summary"). So this element key is
 * unreachable through normal v0.3 authoring — it is registered as a
 * MINIMAL, correct renderer so a future dispatch resolves cleanly instead
 * of hitting the unsupported fallback, with NO speculative single-input
 * navigation.
 *
 * Render surface (mirrors web, minus the interaction affordances):
 * - empty (`isEmpty()`): render the `noEntry` LocalizableString.
 * - non-empty: render each `items[i].locText` read-only. The per-item
 *   `btnEdit`/`btnRemove` actions are the single-input NAVIGATION surface
 *   (edit → focus that input; remove → drop the entry) — deliberately
 *   omitted, since that mode is the deferred non-goal.
 *
 * Reactivity (invariant 2, class-based): the summary object is a plain
 * helper, not a `Base`, but its wrapped `question` is — subscribing to it
 * re-renders on question notifications (core rebuilds the summary wholesale
 * on data change and the parent passes a fresh instance; this subscription
 * additionally catches in-place question-level changes).
 */
import * as React from 'react';
import { View } from 'react-native';
import type { Base, QuestionSingleInputSummary } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';

export interface SingleInputSummaryProps {
  summary: QuestionSingleInputSummary;
}

export class SingleInputSummary extends SurveyElementBase<SingleInputSummaryProps> {
  protected get summary(): QuestionSingleInputSummary | undefined {
    return (this.props as SingleInputSummaryProps).summary;
  }

  protected canRender(): boolean {
    return !!this.summary;
  }

  protected getStateElement(): Base | null {
    // The summary helper is not a `Base`; its wrapped question is.
    const summary = this.summary;
    return (summary?.question as unknown as Base) ?? null;
  }

  protected renderElement(): React.JSX.Element | null {
    const summary = this.summary;
    if (!summary) return null;
    if (summary.isEmpty()) {
      return (
        <View testID="sv-singleinput-summary-empty">
          {this.renderLocString(summary.noEntry, undefined, 'sv-sis-noentry')}
        </View>
      );
    }
    return (
      <View testID="sv-singleinput-summary">
        {summary.items.map((item, index) => (
          <View key={index} testID={`sv-singleinput-summary-row-${index}`}>
            {this.renderLocString(
              item.locText,
              undefined,
              `sv-sis-item-${index}`
            )}
          </View>
        ))}
      </View>
    );
  }
}
