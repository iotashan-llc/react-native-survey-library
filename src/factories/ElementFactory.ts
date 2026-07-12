/**
 * RN analog of survey-react-ui's `ReactElementFactory`
 * (element-factory.tsx:3-27) — design: docs/design/0.5-factories.md,
 * "Registries". Same `Map`-backed rationale as `QuestionFactory`. Its
 * keyspace is disjoint from `RNQuestionFactory`'s — `sv-page`,
 * `questionErrorComponent` values, wrappers, per-question item components,
 * etc. — checked separately in the coverage manifest.
 */
import type * as React from 'react';

export type ElementCreator<P = unknown> = (props: P) => React.JSX.Element;

export class ElementFactory {
  private readonly creators = new Map<string, ElementCreator>();

  public registerElement<P = unknown>(
    elementType: string,
    creator: ElementCreator<P>
  ): void {
    this.creators.set(elementType, creator as ElementCreator);
  }

  public isElementRegistered(elementType: string): boolean {
    return this.creators.has(elementType);
  }

  public getAllTypes(): string[] {
    return Array.from(this.creators.keys()).sort();
  }

  public createElement<P = unknown>(
    elementType: string,
    props: P
  ): React.JSX.Element | null {
    const creator = this.creators.get(elementType);
    return creator ? creator(props) : null;
  }
}

export const RNElementFactory = new ElementFactory();
