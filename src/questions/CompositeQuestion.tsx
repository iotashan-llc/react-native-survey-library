/**
 * `composite` question adapter (task 2.11) — a ComponentCollection runtime type
 * with `elementsJSON`/`createElements` (a panel of inner elements). Dispatch key
 * is `getTemplate()` = `"composite"` (NOT the registered `getType()` name).
 *
 * Renders the LIVE `question.contentPanel` (a PanelModel built by the model
 * ctor) through the EXISTING `SurveyPanel` composition — each inner question
 * gets its own `QuestionChrome` (title) via the normal panel → row →
 * SurveyRowElement path; the composite's OWN title comes from the outer row
 * wrapper. Value is an object keyed by inner element names, aggregated by the
 * model (the renderer never touches it). Plan:
 * docs/design/2.11-custom-composite-plan.md.
 *
 * a11y: RN 0.86's `accessibilityRole` does NOT accept `'group'` — the `role`
 * prop maps ARIA roles, so the wrapper carries `role="group"` + an
 * outer-title-derived label. The group is owned HERE only (SurveyPanel applies
 * no role), so there is no duplicate group (2.11 review).
 */
import * as React from 'react';
import { View } from 'react-native';
import type { Base, PanelModel, SurveyModel } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyPanel } from '../components/composition/SurveyPanel';

interface CompositeModelLike {
  name: string;
  contentPanel: PanelModel;
  survey: SurveyModel;
  processedTitle?: string;
}

export class CompositeQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get composite(): CompositeModelLike {
    return this.questionBase as unknown as CompositeModelLike;
  }

  protected renderElement(): React.JSX.Element {
    const question = this.composite;
    const label = question.processedTitle;
    return (
      <View
        testID={`composite-question-${question.name}`}
        role="group"
        aria-label={label}
        accessibilityLabel={label}
      >
        <SurveyPanel
          element={question.contentPanel}
          survey={question.survey}
          creator={this.creator}
        />
      </View>
    );
  }
}
