/**
 * Shared test support for the reactive base classes port (design:
 * docs/design/0.4-reactive-base.md). Real `SurveyModel`/`Question` fixtures
 * via the facade + a single instrumented `Probe` subclass reused across the
 * test plan's cases. Instrumentation counts callbacks/revisions, never raw
 * `render()` invocations (StrictMode legitimately doubles those).
 */
import * as React from 'react';
import { Text } from 'react-native';
import { screen } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import type { Base, Question } from '../../core/facade';
import { SurveyElementBase } from '../SurveyElementBase';
import type { SurveyElementBaseState } from '../SurveyElementBase';

let fixtureCounter = 0;

/** A real Question fixture (a real SurveyModel child), via the facade. */
export function createQuestion(name?: string): Question {
  fixtureCounter += 1;
  const questionName = name ?? `q${fixtureCounter}`;
  const model = new Model({
    elements: [
      {
        type: 'checkbox',
        name: questionName,
        choices: ['a', 'b'],
      },
    ],
  });
  const question = model.getQuestionByName(questionName) as Question | null;
  if (!question) {
    throw new Error('test fixture: question was not created');
  }
  return question;
}

/** Reads the dynamically-added, model-scoped D2 render guard counter. */
export function reactRenderingOf(base: Base): number {
  return (base as unknown as { reactRendering?: number }).reactRendering ?? 0;
}

export interface ProbePayload {
  rev: number;
  value: string | undefined;
}

export interface ProbeProps {
  testID: string;
  elements: Base[];
  deniedKeys?: string[];
  renderValue?: () => string;
  mutateOnRender?: () => void;
  throwOnRender?: boolean;
  onRenderElement?: () => void;
  tick?: number;
}

/**
 * Instrumented `SurveyElementBase` subclass used by the whole 0.4 test
 * plan. `propertyCallbackCount` counts every `canUsePropInState` entry
 * (the scalar callback's unconditional first step) regardless of whether
 * the guard/deny-list suppresses the resulting `setState` — this is the
 * "subscription-callback invocation" counter the design's test plan calls
 * for, distinct from the `__svRev` revision counter rendered into the tree.
 */
export class Probe extends SurveyElementBase<
  ProbeProps,
  SurveyElementBaseState
> {
  public renderElementCalls = 0;
  public propertyCallbackCount = 0;

  protected getStateElements(): Base[] {
    return this.props.elements;
  }

  protected canUsePropInState(key: string): boolean {
    this.propertyCallbackCount += 1;
    if (this.props.deniedKeys?.includes(key)) {
      return false;
    }
    return true;
  }

  protected renderElement(): React.JSX.Element {
    this.renderElementCalls += 1;
    this.props.onRenderElement?.();
    if (this.props.mutateOnRender) {
      this.props.mutateOnRender();
    }
    if (this.props.throwOnRender) {
      throw new Error('Probe: renderElement throw (test 8 fixture)');
    }
    const payload: ProbePayload = {
      rev: this.state.__svRev ?? 0,
      value: this.props.renderValue ? this.props.renderValue() : undefined,
    };
    return <Text testID={this.props.testID}>{JSON.stringify(payload)}</Text>;
  }
}

export function readProbe(testID: string): ProbePayload {
  const element = screen.getByTestId(testID);
  return JSON.parse(element.props.children as string) as ProbePayload;
}

export function revOf(testID: string): number {
  return readProbe(testID).rev;
}
