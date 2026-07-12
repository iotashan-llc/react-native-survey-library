/**
 * RN analog of survey-react-ui's `SurveyQuestionEmpty`
 * (reactquestion_empty.tsx) — the `empty` runtime template's component
 * (design: docs/design/0.5-factories.md, M0 descriptor row). Upstream
 * renders `<div />`: empty, but a present element. RN has no faithful
 * analog of a semantics-free empty block element; an empty `View` is the
 * documented delta — deliberately not `null`, so a real dispatch to this
 * component stays distinguishable from "nothing rendered" the way
 * upstream's `<div/>` is.
 *
 * Side-effect-free (no module-scope registration call) — the descriptor
 * table in `./descriptors.ts` is the single source of registration truth;
 * `register-all.ts` is the only file allowed to call the factories'
 * `register*` methods.
 */
import * as React from 'react';
import { View } from 'react-native';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';

export class EmptyQuestion extends QuestionElementBase {
  protected renderElement(): React.JSX.Element {
    return <View />;
  }
}
