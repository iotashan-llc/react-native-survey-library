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
import { SurveyLocStringViewer } from '../components/LocStringViewer';
import { SurveyHeader } from '../components/SurveyHeader';
import { LogoImage } from '../components/LogoImage';
import { SurveyPage } from '../components/composition/SurveyPage';
import { SurveyPanel } from '../components/composition/SurveyPanel';

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

  // M1, task 1.6 — element-route rows (RNElementFactory keyspace;
  // `questionType` mirrors the dispatch key: element keys are not
  // serializer class names and are exempt from the classification gate —
  // see manifest.ts `diffManifestConsistency`, `route === 'element'`).
  {
    status: 'supported',
    questionType: 'sv-string-viewer',
    // = LocalizableString.defaultRenderer — every renderLocString call
    // dispatches here unless the string's owner names another renderer.
    dispatchKey: 'sv-string-viewer',
    route: 'element',
    component: () => SurveyLocStringViewer,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'survey-header',
    dispatchKey: 'survey-header',
    route: 'element',
    component: () => SurveyHeader,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'sv-logo-image',
    dispatchKey: 'sv-logo-image',
    route: 'element',
    component: () => LogoImage,
    milestone: 'M1',
  },

  // M1, task 1.4 — composition element rows. `sv-page` mirrors upstream's
  // ReactElementFactory key (page.tsx registers "sv-page"); `panel` is the
  // key `SurveyRowElement` dispatches when a row element `isPanel`
  // (upstream: `element.getTemplate()` -> "panel" in the element factory).
  {
    status: 'supported',
    questionType: 'sv-page',
    dispatchKey: 'sv-page',
    route: 'element',
    component: () => SurveyPage,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'panel',
    dispatchKey: 'panel',
    route: 'element',
    component: () => SurveyPanel,
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
