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
 * M0 rows: `empty` (supported/template). `custom`/`composite` are
 * ComponentCollection runtime templates — supported as of task 2.11
 * (`getTemplate()` === "custom"/"composite", not the registered type name;
 * they render the live `contentQuestion`/`contentPanel`). M1 rows so far:
 * the task-1.6 element-route rows (`sv-string-viewer`, `survey-header`,
 * `sv-logo-image`), `boolean` (template + two renderer-route rows for
 * `checkbox`/`radio` renderAs modes, task 1.13), `expression`
 * (template, task 1.15) and `text` (template, task 1.10). Everything
 * else arrives per milestone by adding
 * rows here — this table is NOT pre-populated with every future dispatch
 * key.
 */
import type { ComponentType } from 'react';
import { EmptyQuestion } from '../components/EmptyQuestion';
import { Comment } from '../components/Comment';
import { Checkbox } from '../components/Checkbox';
import { Radiogroup } from '../components/Radiogroup';
import { SurveyLocStringViewer } from '../components/LocStringViewer';
import { SurveyHeader } from '../components/SurveyHeader';
import { LogoImage } from '../components/LogoImage';
import { SurveyPage } from '../components/composition/SurveyPage';
import { SurveyPanel } from '../components/composition/SurveyPanel';
import {
  BooleanCheckboxQuestion,
  BooleanQuestion,
  BooleanRadioQuestion,
} from '../questions/BooleanQuestion';
import { ExpressionQuestion } from '../questions/ExpressionQuestion';
import {
  RatingPillItem,
  RatingQuestion,
  RatingSmileyItem,
  RatingStarItem,
} from '../questions/RatingQuestion';
import { TextQuestion } from '../questions/TextQuestion';
import { HtmlQuestion } from '../questions/HtmlQuestion';
import { MultipleTextQuestion } from '../questions/MultipleTextQuestion';
import { DropdownQuestionElement } from '../questions/DropdownQuestion';
import {
  RatingDropdownItemContent,
  RatingDropdownQuestionElement,
} from '../questions/RatingDropdownQuestion';
import { TagboxQuestionElement } from '../questions/TagboxQuestion';
import { ImageQuestion } from '../questions/ImageQuestion';
import { ImagePickerQuestion } from '../questions/ImagePickerQuestion';
import { ButtonGroupQuestionElement } from '../questions/ButtonGroupQuestion';
import { PanelDynamicQuestion } from '../questions/PanelDynamicQuestion';
import { MatrixQuestionElement } from '../questions/MatrixQuestion';
import { MatrixDropdownQuestionElement } from '../questions/MatrixDropdownQuestion';
import { MatrixDynamicQuestionElement } from '../questions/MatrixDynamicQuestion';
import { CustomQuestion } from '../questions/CustomQuestion';
import { CompositeQuestion } from '../questions/CompositeQuestion';
import { SingleInputSummary } from '../questions/SingleInputSummaryQuestion';
import { ListItemGroupContent, ListPickerElement } from '../overlay/ListPicker';

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
  // Task 1.14 (rating): the template row for the default button-row
  // rendering, plus three element-route rows for the per-item dispatch
  // (`question.itemComponent`, an internal-to-question factory concept
  // -- see RatingQuestion.tsx's doc comment). Task 2.5a adds the
  // renderer-route row below for `displayMode: "dropdown"` (core maps
  // displayMode to `renderAs`); the overlay rows come from the shared
  // sv-list/ListPicker popup, whose per-row dispatch resolves the
  // `sv-rating-dropdown-item` element row below (external review C3 --
  // probe-refuted the earlier "collapsed display, not an overlay row"
  // note: core stamps that key on EVERY dropdown-mode list action). The
  // RN collapsed display renders inside RatingDropdownQuestion directly.
  {
    status: 'supported',
    questionType: 'rating',
    dispatchKey: 'rating',
    route: 'template',
    component: () => RatingQuestion,
    milestone: 'M1',
  },
  // Task 2.5a (rating displayMode:"dropdown"): renderer-route row, same
  // mechanism as boolean 1.13 -- registering ("rating","dropdown") makes
  // `getComponentName()` resolve this key and `isDefaultRendering()` go
  // false, so SurveyRowElement's existing dispatch routes it. Points at
  // the OverlayContext WRAPPER (2.5 R4): the class alone would toggle
  // the PopupModel with no RN Modal bridged.
  {
    status: 'supported',
    questionType: 'rating',
    dispatchKey: 'sv-rating-dropdown',
    route: 'renderer',
    renderAs: 'dropdown',
    component: () => RatingDropdownQuestionElement,
    milestone: 'M2',
  },
  // Task 2.5a follow-up (external review C3) -- overlay row content for
  // dropdown-mode rating actions. Core stamps component
  // 'sv-rating-dropdown-item' on every list action, and the min/max
  // actions carry a `description` LocalizableString
  // (minRateDescription/maxRateDescription); ListPicker dispatches each
  // row's `item.component` through RNElementFactory, so without this
  // row the title-only fallback silently dropped those descriptions
  // (web renders them via its registered rating-dropdown-item).
  {
    status: 'supported',
    questionType: 'sv-rating-dropdown-item',
    dispatchKey: 'sv-rating-dropdown-item',
    route: 'element',
    component: () => RatingDropdownItemContent,
    milestone: 'M2',
  },
  // Task 2.1 — overlay list picker (upstream registry name "sv-list";
  // PopupModel contentComponentName dispatch).
  {
    status: 'supported',
    questionType: 'sv-list',
    dispatchKey: 'sv-list',
    route: 'element',
    component: () => ListPickerElement,
    milestone: 'M2',
  },
  // Task 2.1 — nested subitem group row content (upstream registry name
  // "sv-list-item-group"; Action.setSubItems dispatch).
  {
    status: 'supported',
    questionType: 'sv-list-item-group',
    dispatchKey: 'sv-list-item-group',
    route: 'element',
    component: () => ListItemGroupContent,
    milestone: 'M2',
  },
  // Task 2.3 — dropdown question (overlay-backed; the element wrapper
  // binds the per-Survey stack).
  {
    status: 'supported',
    questionType: 'dropdown',
    dispatchKey: 'dropdown',
    route: 'template',
    component: () => DropdownQuestionElement,
    milestone: 'M2',
  },
  // Task 2.4 — tagbox question (multi-select overlay; chips control).
  {
    status: 'supported',
    questionType: 'tagbox',
    dispatchKey: 'tagbox',
    route: 'template',
    component: () => TagboxQuestionElement,
    milestone: 'M2',
  },
  // Task 2.6 — multipletext question.
  {
    status: 'supported',
    questionType: 'multipletext',
    dispatchKey: 'multipletext',
    route: 'template',
    component: () => MultipleTextQuestion,
    milestone: 'M2',
  },
  // Task 2.9 — buttongroup question. ONE template row in BOTH modes
  // (2.5b R1): overflow compaction flips `renderAs` to 'dropdown' but
  // registers NOTHING in RendererFactory, so `isDefaultRendering()`
  // stays true and dispatch stays on `getTemplate()` === 'buttongroup';
  // the element wrapper self-branches on renderAs.
  {
    status: 'supported',
    questionType: 'buttongroup',
    dispatchKey: 'buttongroup',
    route: 'template',
    component: () => ButtonGroupQuestionElement,
    milestone: 'M2',
  },
  // Task 2.10 — image question (static display + scaling modes).
  {
    status: 'supported',
    questionType: 'image',
    dispatchKey: 'image',
    route: 'template',
    component: () => ImageQuestion,
    milestone: 'M2',
  },
  // v0.2.1 pull-forward (from M5, task 5.3) — html question. Value-less
  // display (QuestionNonValue); renders `question.html` through the 0.9
  // SanitizedHtml sink (allowlist + URI policy + no auto-navigation,
  // invariant 8). No renderAs variants upstream (a single "html" key);
  // template route, dispatchKey === questionType.
  {
    status: 'supported',
    questionType: 'html',
    dispatchKey: 'html',
    route: 'template',
    component: () => HtmlQuestion,
    milestone: 'M2',
  },
  // Task 2.7 — imagepicker question (image-choice grid; single/multi select).
  {
    status: 'supported',
    questionType: 'imagepicker',
    dispatchKey: 'imagepicker',
    route: 'template',
    component: () => ImagePickerQuestion,
    milestone: 'M2',
  },
  // Task 2.8a — paneldynamic (LIST mode + add/remove).
  {
    status: 'supported',
    questionType: 'paneldynamic',
    dispatchKey: 'paneldynamic',
    route: 'template',
    component: () => PanelDynamicQuestion,
    milestone: 'M2',
  },
  // Task 3.2 (M3) — simple matrix (single/multi-select radio/checkbox
  // tiles over the 3.1a MatrixGrid). getTemplate() === 'matrix' (no
  // override); template route, dispatchKey === questionType. The
  // OverlayContext-free `…QuestionElement` wrapper keeps the family shape
  // uniform (simple matrix has no nested cell overlays).
  {
    status: 'supported',
    questionType: 'matrix',
    dispatchKey: 'matrix',
    route: 'template',
    component: () => MatrixQuestionElement,
    milestone: 'M3',
  },
  // Task 3.3a (M3) — matrixdropdown (static rows) over renderedTable:
  // MatrixTableBase two-level split + chrome-less cell dispatch (design
  // M3 §2/§4). getTemplate() === 'matrixdropdown'; template route. Cell
  // questions dispatch through the SAME factory rows (dropdown/text/
  // boolean/…), so no `sv-matrix-*` element rows exist (design §6).
  {
    status: 'supported',
    questionType: 'matrixdropdown',
    dispatchKey: 'matrixdropdown',
    route: 'template',
    component: () => MatrixDropdownQuestionElement,
    milestone: 'M3',
  },
  // Task 3.4 (M3) — matrixdynamic (dynamic rows) over the SAME
  // MatrixTableBase via the §1 hooks (add-row buttons + empty
  // placeholder; per-action remove/detail cells in the shared walk).
  // getTemplate() === 'matrixdynamic'; template route. Web's
  // `sv-matrixdynamic-add-btn`/`sv-matrixdynamic-actions-cell`/
  // `sv-placeholder-matrixdynamic` element registrations are collapsed
  // into the RN components (design §6 — no element rows).
  {
    status: 'supported',
    questionType: 'matrixdynamic',
    dispatchKey: 'matrixdynamic',
    route: 'template',
    component: () => MatrixDynamicQuestionElement,
    milestone: 'M3',
  },
  // Task 3.5 (M3) — singleinputsummary, the phase-3 tail type. PROBE
  // FINDING (2026-07-21): `singleinputsummary` is NOT a serializer question
  // class (`Serializer.findClass` is undefined; absent from
  // getChildrenClasses('question')). It is the plain helper
  // `QuestionSingleInputSummary`, dispatched by web through
  // ReactElementFactory under `sv-singleinput-summary` (its renderer takes
  // a `summary` prop, not a question). So it is an ELEMENT-route row — NOT
  // a MODEL_TYPE_CLASSIFICATION entry (that would trip
  // `diffModelTypeInventory.missingFromLive`, since no live question class
  // matches). Its only producer — the
  // `questionsOnPageMode:"inputPerPage"` single-input MODE — is a v0.3
  // NON-GOAL (design §11.5; DIFFERENCES "Single-input summary"), so the key
  // is unreachable through normal v0.3 authoring; registered as a minimal
  // correct renderer so a future dispatch resolves cleanly instead of the
  // unsupported fallback.
  {
    status: 'supported',
    questionType: 'sv-singleinput-summary',
    dispatchKey: 'sv-singleinput-summary',
    route: 'element',
    component: () => SingleInputSummary,
    milestone: 'M3',
  },
  {
    status: 'supported',
    questionType: 'sv-rating-item',
    dispatchKey: 'sv-rating-item',
    route: 'element',
    component: () => RatingPillItem,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'sv-rating-item-star',
    dispatchKey: 'sv-rating-item-star',
    route: 'element',
    component: () => RatingStarItem,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'sv-rating-item-smiley',
    dispatchKey: 'sv-rating-item-smiley',
    route: 'element',
    component: () => RatingSmileyItem,
    milestone: 'M1',
  },
  {
    status: 'supported',
    questionType: 'text',
    dispatchKey: 'text',
    route: 'template',
    component: () => TextQuestion,
    milestone: 'M1',
  },
  // Task 2.11 — ComponentCollection custom adapter. getTemplate() === 'custom'
  // regardless of the registered type name; renders contentQuestion (input-only)
  // through the normal dispatcher.
  {
    status: 'supported',
    questionType: 'custom',
    dispatchKey: 'custom',
    route: 'template',
    component: () => CustomQuestion,
    milestone: 'M2',
  },
  // Task 2.11 — ComponentCollection composite adapter. getTemplate() ===
  // 'composite'; renders contentPanel through the SurveyPanel composition.
  {
    status: 'supported',
    questionType: 'composite',
    dispatchKey: 'composite',
    route: 'template',
    component: () => CompositeQuestion,
    milestone: 'M2',
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
