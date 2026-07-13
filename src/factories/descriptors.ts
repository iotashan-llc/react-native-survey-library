/**
 * Descriptor table — the SINGLE source of registration truth (design:
 * docs/design/0.5-factories.md, "Descriptor table" + "Registration &
 * packaging"). `register-all.ts` walks `supported` rows only and is the
 * ONLY file allowed to call a factory's `register*` method; component
 * modules stay side-effect-free.
 *
 * Discriminated union on `status`: a `supported` row carries a
 * `component` thunk (required) and no `reason`; a `planned`/`unsupported`
 * row carries a `reason` (required) and no `component` — round 2 of the
 * design review rejected structural placeholder components as dishonest,
 * so there is nothing to resolve for a planned row.
 *
 * `route` picks the target registry: `template` and `renderer` both go to
 * `RNQuestionFactory` (a `renderer` row's component is ALSO registered
 * with survey-core's `RendererFactory` under `(questionType, renderAs)` ->
 * `dispatchKey`, so `question.getComponentName()` resolves to the same
 * key); `element` goes to `RNElementFactory` (a disjoint keyspace).
 *
 * M0 rows: `empty` (supported/template) and `custom`/`composite` (planned
 * — ComponentCollection adapters land in task 2.11; until then a dispatch
 * miss on either falls through to the unsupported-type fallback +
 * diagnostic, which is honest: no adapter exists yet). M1 rows so far:
 * `boolean` (template + two renderer-route rows for `checkbox`/`radio`
 * renderAs modes, task 1.13) and `expression` (template, task 1.15).
 * Everything else arrives per milestone by adding rows here — this table
 * is NOT pre-populated with every future dispatch key.
 */
import type { ComponentType } from 'react';
import { EmptyQuestion } from '../components/EmptyQuestion';
import {
  BooleanCheckboxQuestion,
  BooleanQuestion,
  BooleanRadioQuestion,
} from '../questions/BooleanQuestion';
import { ExpressionQuestion } from '../questions/ExpressionQuestion';

export type DescriptorRoute = 'template' | 'renderer' | 'element';

interface DescriptorCommon {
  questionType: string;
  dispatchKey: string;
  route: DescriptorRoute;
}

export interface SupportedDescriptor extends DescriptorCommon {
  status: 'supported';
  renderAs?: string;
  // docs/design/0.5-factories.md ("Descriptor table"): a heterogeneous
  // registry of question components necessarily erases each component's
  // own prop type here; `createQuestion`/`createElement` callers already
  // pass an untyped props bag (mirrors upstream's own `(props: any) =>
  // JSX.Element` creator signature).
  component: () => ComponentType<any>;
  milestone: string;
}

export interface PlannedOrUnsupportedDescriptor extends DescriptorCommon {
  status: 'planned' | 'unsupported';
  milestone?: string;
  reason: string;
}

export type Descriptor = SupportedDescriptor | PlannedOrUnsupportedDescriptor;

export const DESCRIPTOR_TABLE: readonly Descriptor[] = [
  {
    status: 'supported',
    questionType: 'empty',
    dispatchKey: 'empty',
    route: 'template',
    component: () => EmptyQuestion,
    milestone: 'M0',
  },
  // Task 1.13 (boolean): three rows, one per `renderAs` mode (verified
  // against survey-react-ui's boolean.tsx/boolean-checkbox.tsx/
  // boolean-radio.tsx). `renderAs: "default"` (the property's own
  // Serializer default) has no registered renderer, so
  // `isDefaultRendering()` is true and dispatch goes through
  // `getTemplate() === "boolean"` (template route); "checkbox"/"radio"
  // dispatch via `getComponentName()` (renderer route) — the registrar
  // (register-all.ts) ALSO wires these into survey-core's
  // `RendererFactory` under `("boolean", renderAs)`, mirroring upstream's
  // own registration calls.
  {
    status: 'supported',
    questionType: 'boolean',
    dispatchKey: 'boolean',
    route: 'template',
    component: () => BooleanQuestion,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'boolean',
    dispatchKey: 'sv-boolean-checkbox',
    route: 'renderer',
    renderAs: 'checkbox',
    component: () => BooleanCheckboxQuestion,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'boolean',
    dispatchKey: 'sv-boolean-radio',
    route: 'renderer',
    renderAs: 'radio',
    component: () => BooleanRadioQuestion,
    milestone: 'M1',
  },
  // Task 1.15 (expression): read-only computed display, no renderAs
  // variants upstream (reactquestion_expression.tsx registers a single
  // "expression" key).
  {
    status: 'supported',
    questionType: 'expression',
    dispatchKey: 'expression',
    route: 'template',
    component: () => ExpressionQuestion,
    milestone: 'M1',
  },
  {
    status: 'planned',
    questionType: 'custom',
    dispatchKey: 'custom',
    route: 'template',
    milestone: 'M2',
    reason:
      'ComponentCollection custom-question adapter lands in task 2.11 (A4). ' +
      'QuestionCustomModel.getTemplate() returns "custom" regardless of the ' +
      "registered custom type's own name — until the adapter exists, a " +
      'dispatch miss on this key falls through to the unsupported-type ' +
      'fallback + diagnostic.',
  },
  {
    status: 'planned',
    questionType: 'composite',
    dispatchKey: 'composite',
    route: 'template',
    milestone: 'M2',
    reason:
      'ComponentCollection composite-question adapter lands in task 2.11 ' +
      '(A4). QuestionCompositeModel.getTemplate() returns "composite" ' +
      "regardless of the registered custom type's own name — until the " +
      'adapter exists, a dispatch miss on this key falls through to the ' +
      'unsupported-type fallback + diagnostic.',
  },
];
