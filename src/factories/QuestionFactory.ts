/**
 * RN analog of survey-react-ui's `ReactQuestionFactory`
 * (reactquestion_factory.tsx:3-25) — design: docs/design/0.5-factories.md,
 * "Registries".
 *
 * `Map`-backed, unlike upstream's `{}`-backed `HashTable`: a plain-object
 * registry resolves unregistered exotic keys (`__proto__`, `constructor`,
 * `toString`, ...) through the prototype chain — e.g. `hash['toString']` is
 * `Object.prototype.toString`, a real function, which upstream's `creator ==
 * null` miss check would treat as a registered hit. `Map` has no such
 * hazard: an unregistered key is always a clean miss, and these names can
 * still be registered and dispatched as ordinary data.
 *
 * A missing key returns `null` (API parity with upstream) — the
 * unsupported-type fallback lives OUTSIDE this registry (no magic
 * `__unsupported` key); see `src/components/UnsupportedQuestion.tsx`.
 */
import type * as React from 'react';

export type QuestionCreator<P = unknown> = (props: P) => React.JSX.Element;

export class QuestionFactory {
  private readonly creators = new Map<string, QuestionCreator>();

  public registerQuestion<P = unknown>(
    questionType: string,
    creator: QuestionCreator<P>
  ): void {
    this.creators.set(questionType, creator as QuestionCreator);
  }

  /**
   * RN extension with no upstream equivalent (`ReactQuestionFactory` has no
   * registration-check method — only `ReactElementFactory` does, as
   * `isElementRegistered`). Documented asymmetry, kept deliberately rather
   * than manufactured parity.
   */
  public isQuestionRegistered(questionType: string): boolean {
    return this.creators.has(questionType);
  }

  public getAllTypes(): string[] {
    return Array.from(this.creators.keys()).sort();
  }

  public createQuestion<P = unknown>(
    questionType: string,
    props: P
  ): React.JSX.Element | null {
    const creator = this.creators.get(questionType);
    return creator ? creator(props) : null;
  }
}

export const RNQuestionFactory = new QuestionFactory();
