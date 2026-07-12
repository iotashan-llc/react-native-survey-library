/**
 * Trivial subclass adding a `cssClasses` prop getter (design:
 * docs/design/0.4-reactive-base.md, port map). As-is port of
 * survey-react-ui's `ReactSurveyElement` (reactquestion_element.tsx:184-191).
 */
import { SurveyElementBase } from './SurveyElementBase';
import type { SurveyElementBaseState } from './SurveyElementBase';

export interface IReactSurveyElementProps {
  cssClasses?: unknown;
}

export class ReactSurveyElement<
  P extends IReactSurveyElementProps = IReactSurveyElementProps,
  S extends SurveyElementBaseState = SurveyElementBaseState,
> extends SurveyElementBase<P, S> {
  protected get cssClasses(): unknown {
    return this.props.cssClasses;
  }
}
