/**
 * The single question → factory dispatch-key rule (design 0.5-factories;
 * upstream `reactSurvey.tsx:284`): a default-rendering question dispatches on
 * its `getTemplate()` (template route); a `renderAs` override dispatches on
 * `getComponentName()` (renderer route). Extracted so `SurveyRowElement` (the
 * row dispatcher) and `CustomQuestion` (task 2.11, which dispatches its inner
 * `contentQuestion`) share ONE rule and can never drift (2.11 review, both
 * peers).
 */
interface DispatchableQuestion {
  isDefaultRendering?(): boolean;
  getTemplate?(): string;
  getComponentName?(): string;
  getType(): string;
}

export function resolveQuestionDispatchKey(
  question: DispatchableQuestion
): string {
  return question.isDefaultRendering?.() !== false
    ? (question.getTemplate?.() ?? question.getType())
    : (question.getComponentName?.() ?? question.getType());
}
