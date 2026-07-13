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
 * M0 rows: `empty` (supported/template — the only real template registered
 * so far) and `custom`/`composite` (planned — ComponentCollection adapters
 * land in task 2.11; until then a dispatch miss on either falls through to
 * the unsupported-type fallback + diagnostic, which is honest: no adapter
 * exists yet). Everything else arrives per milestone by adding rows here —
 * this table is NOT pre-populated with every future dispatch key.
 */
import type { ComponentType } from 'react';
import { EmptyQuestion } from '../components/EmptyQuestion';
import { Comment } from '../components/Comment';
import { Checkbox } from '../components/Checkbox';
import { Radiogroup } from '../components/Radiogroup';

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
  // Phase 1 — v0.1 (M1). getTemplate() === getType() for all three (no
  // override; verified against a live fixture in manifest.ts's
  // runtimeRenderable construction gate) — dispatchKey === questionType.
  {
    status: 'supported',
    questionType: 'comment',
    dispatchKey: 'comment',
    route: 'template',
    component: () => Comment,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'checkbox',
    dispatchKey: 'checkbox',
    route: 'template',
    component: () => Checkbox,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'radiogroup',
    dispatchKey: 'radiogroup',
    route: 'template',
    component: () => Radiogroup,
    milestone: 'M1',
  },
];
