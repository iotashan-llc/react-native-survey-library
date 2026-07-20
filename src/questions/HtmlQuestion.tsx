/**
 * `html` question type (v0.2.1 pull-forward from M5; scope analysis:
 * all deps exist now). RN analog of survey-react-ui's `SurveyQuestionHtml`
 * (reactquestion_html.tsx) — a value-less DISPLAY question
 * (`QuestionHtmlModel extends QuestionNonValue`, no title/value) whose
 * `html` property carries author markup.
 *
 * Upstream renders `locHtml.renderedHtml` through `dangerouslySetInnerHTML`.
 * This library renders that SAME processed string through `<SanitizedHtml>`
 * (task 0.9): the allowlisted-tag sanitizer, the URI/scheme policy, and the
 * no-auto-navigation link handling (invariant 8) all apply — a link inside
 * html content surfaces as an event (host decides) rather than navigating.
 * It renders through `<SanitizedHtml>` DIRECTLY, not through
 * `SurveyLocStringViewer`: that viewer's `hasHtml` branch is gated on
 * MARKDOWN conversion (`LocalizableString.hasHtml` → `owner.getMarkdownHtml`,
 * false with no markdown handler), so it would render the raw markup as
 * literal `Text`. The html question's content is always author HTML, so it
 * always goes through the sanitizer.
 *
 * Reactivity: setting `html` fires the model's `onPropertyChanged`
 * EventBase but NOT `addOnPropertyValueChangedCallback` — the API
 * `SurveyElementBase` subscribes through — because localizable-string
 * writes route around that callback path (empirically verified against
 * survey-core 2.5.33). So this component owns a direct
 * `locHtml.onStringChanged` subscription, mirroring upstream's
 * `locHtml.onChanged` install and `SurveyLocStringViewer`'s pattern. The
 * subscription is reconciled against the currently-bound `locHtml` on every
 * commit (retargeting cleanly if the question prop is swapped), the same
 * shape the reactive base uses for its own subscription set. The
 * `getStateElement()` override still subscribes to the question for OTHER
 * property changes (visibility, read-only) as its siblings do.
 * `canRender()` also requires `!!question.html` — upstream's own guard: an
 * empty-html question renders nothing rather than an empty box.
 */
import * as React from 'react';
import { View } from 'react-native';
import type { Base, LocalizableString } from '../core/facade';
import { QuestionHtmlModel } from '../core/facade';
import { SanitizedHtml } from '../components/SanitizedHtml';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import type { SurveyElementBaseState } from '../reactivity/SurveyElementBase';

interface HtmlQuestionState extends SurveyElementBaseState {
  htmlRev?: number;
}

export class HtmlQuestion extends QuestionElementBase<
  QuestionElementBaseProps,
  HtmlQuestionState
> {
  private subscribedLocHtml: LocalizableString | undefined;

  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get htmlQuestion(): QuestionHtmlModel {
    return this.questionBase as QuestionHtmlModel;
  }

  private onLocHtmlChanged = (): void => {
    // Reuse the shared D2 render guard: evaluating `renderedHtml` during a
    // render pass must never re-enter setState (React-19 contract).
    if (this.isRendering) return;
    this.setState((state) => ({ htmlRev: (state.htmlRev ?? 0) + 1 }));
  };

  /** Reconcile the `onStringChanged` subscription against the currently
   * bound `locHtml` — subscribes on mount, retargets on a question swap,
   * no-ops when unchanged. Needs no `prevProps`, so `componentDidUpdate`
   * keeps the base's zero-arg signature. */
  private reconcileLocHtmlSubscription(): void {
    const next = this.htmlQuestion.locHtml;
    if (next === this.subscribedLocHtml) return;
    if (this.subscribedLocHtml) {
      this.subscribedLocHtml.onStringChanged.remove(this.onLocHtmlChanged);
    }
    this.subscribedLocHtml = next;
    next.onStringChanged.add(this.onLocHtmlChanged);
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.reconcileLocHtmlSubscription();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.reconcileLocHtmlSubscription();
  }

  componentWillUnmount(): void {
    super.componentWillUnmount();
    if (this.subscribedLocHtml) {
      this.subscribedLocHtml.onStringChanged.remove(this.onLocHtmlChanged);
      this.subscribedLocHtml = undefined;
    }
  }

  protected canRender(): boolean {
    return super.canRender() && !!this.htmlQuestion.html;
  }

  protected renderElement(): React.JSX.Element {
    const question = this.htmlQuestion;
    return (
      <View testID={`sv-html-${question.name}`}>
        <SanitizedHtml html={question.locHtml.renderedHtml} />
      </View>
    );
  }
}
