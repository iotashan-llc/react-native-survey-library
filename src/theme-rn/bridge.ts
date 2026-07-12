/**
 * Hybrid styling bridge (design: docs/design/0.7-theme-rn.md, "Hybrid
 * bridge (bridge.ts) — pure extraction, live schemas"). Pure class-token
 * extraction against SCHEMAS BUILT FROM LIVE `question.cssClasses` — the
 * component calls the same public getters upstream calls
 * (`getItemClass(item)` / `getControlClass()` / `getRootCss()`) and hands
 * the resulting STRING here; this module never calls a survey-core getter
 * itself. Reading the FINAL string (post any `onUpdateChoiceItemCss`/
 * `onUpdateQuestionCssClasses` host mutation) rather than re-deriving from
 * raw model booleans is deliberate: it's what makes the official
 * class-override hooks keep working in RN even though there is no literal
 * CSS to apply (design point 3).
 *
 * ZERO react-native import (design test plan #6, ESLint-enforced — see
 * eslint.config.mjs's theme-rn/bridge.ts block) — only facade types.
 */
import type { Question } from '../core/facade';
import {
  queueUnknownCssToken,
  flushUnknownCssTokenDiagnostics as flushUnknownCssTokenDiagnosticsSeam,
} from '../diagnostics';

export interface Schema {
  [flag: string]: string[];
}

/**
 * Getter-emitted NON-VARIANT vocabulary (codex impl-review major 3): the
 * public getters embed base/layout classes (`cssClasses.item`,
 * `cssClasses.root`, `mainRoot`, the dynamic `sv-q-col-N`, ...) that map
 * to no variant flag but are absolutely not "unknown" — flagging them
 * produced false-positive diagnostics on every base render. `entries` are
 * whitespace-tokenized like schema entries; `patterns` cover classes the
 * getter STRING-BUILDS (not read from `cssClasses`), e.g. `"sv-q-col-" +
 * colCount`.
 */
export interface KnownVocabularyExtras {
  entries?: readonly string[];
  patterns?: readonly RegExp[];
}

export interface ExtractResult {
  variant: Record<string, boolean>;
  unknownTokens: string[];
}

function tokenize(classString: string): string[] {
  return classString.split(/\s+/).filter(Boolean);
}

/**
 * Whitespace-tokenizes BOTH sides (design point 2). Each `schema[flag]`
 * entry is itself whitespace-tokenized ("multi-class constants ... expand
 * to their token sets"); an entry matches when ALL its tokens are present
 * (AND, within one entry) — a flag is "on" when ANY of its entries match
 * (OR, across entries — this is how the live value and the canonical
 * alias both get a chance). `unknownTokens` is every OBSERVED token that
 * doesn't appear in ANY schema entry (or the getter's known non-variant
 * vocabulary), matched or not — a token that is part of a
 * known-but-unsatisfied compound entry is still "known vocabulary", not
 * unknown.
 */
export function extractTokens(
  classString: string | undefined | null,
  schema: Schema,
  knownExtras?: KnownVocabularyExtras
): ExtractResult {
  const observedTokens = classString ? tokenize(classString) : [];
  const observedSet = new Set(observedTokens);
  const knownVocabulary = new Set<string>();
  const variant: Record<string, boolean> = {};

  for (const [flag, entries] of Object.entries(schema)) {
    let matched = false;
    for (const entry of entries) {
      const entryTokens = tokenize(entry);
      entryTokens.forEach((token) => knownVocabulary.add(token));
      if (
        entryTokens.length > 0 &&
        entryTokens.every((token) => observedSet.has(token))
      ) {
        matched = true;
      }
    }
    variant[flag] = matched;
  }

  for (const entry of knownExtras?.entries ?? []) {
    tokenize(entry).forEach((token) => knownVocabulary.add(token));
  }
  const patterns = knownExtras?.patterns ?? [];

  const unknownTokens = Array.from(
    new Set(
      observedTokens.filter(
        (token) =>
          !knownVocabulary.has(token) &&
          !patterns.some((pattern) => pattern.test(token))
      )
    )
  );
  return { variant, unknownTokens };
}

interface SchemaCacheEntry {
  signature: string;
  schema: Schema;
  knownEntries: string[];
}

interface BuiltSchema {
  schema: Schema;
  knownEntries: string[];
}

/**
 * Entry-SIGNATURE cache (round-2 fix): identity-only `WeakMap` caching
 * goes stale when `onUpdateQuestionCssClasses` MUTATES the same
 * `cssClasses` object in place (a `survey.css` override does exactly
 * this). The signature is the relevant entries' joined raw values —
 * INCLUDING the known non-variant base keys, whose values feed the known
 * vocabulary and can be overridden too — recomputed cheaply per lookup;
 * the schema rebuilds on any mismatch.
 */
function getOrBuildSchema(
  cache: WeakMap<object, SchemaCacheEntry>,
  cssClasses: Record<string, unknown>,
  relevantKeys: readonly string[],
  knownBaseKeys: readonly string[],
  build: (cssClasses: Record<string, unknown>) => Schema
): BuiltSchema {
  const signature = [...relevantKeys, ...knownBaseKeys]
    .map((key) => String(cssClasses[key] ?? ''))
    .join('\u0000');
  const cached = cache.get(cssClasses);
  if (cached && cached.signature === signature) {
    return { schema: cached.schema, knownEntries: cached.knownEntries };
  }
  const schema = build(cssClasses);
  const knownEntries = knownBaseKeys
    .map((key) => cssClasses[key])
    .filter(
      (value): value is string => typeof value === 'string' && !!value.trim()
    );
  cache.set(cssClasses, { signature, schema, knownEntries });
  return { schema, knownEntries };
}

function getQuestionCssClasses(question: Question): Record<string, unknown> {
  return (question as unknown as { cssClasses: Record<string, unknown> })
    .cssClasses;
}

function aliasEntries(
  cssClasses: Record<string, unknown>,
  liveKey: string,
  canonical: string | undefined
): string[] {
  const entries: string[] = [];
  const live = cssClasses[liveKey];
  if (typeof live === 'string' && live.trim()) entries.push(live);
  if (canonical) entries.push(canonical);
  return entries;
}

// --- ITEM exemplar (select items: checkbox/radio/etc via getItemClass) ---
// Verified upstream (design "Verified upstream facts" + question_baseselect.ts
// getItemClassCore): `disabled` is UNREACHABLE here — the base select
// getter's `getIsDisableAndReadOnlyStyles` second slot is hardcoded
// `false` (survey-element.ts:1219), so `cssClasses.itemDisabled` never
// actually appears in a base select item's class string. Kept in the
// schema (for forward-compat with a host appending it manually) but the
// reachability table below locks it OFF for THIS getter.
// `selectAll` (checkbox subtype, question_checkbox.ts getItemClassCore:
// `.append(this.cssClasses.itemSelectAll, options.isSelectAllItem)`) IS
// reachable — modeled per codex impl-review major 3.
const ITEM_KEY_BY_FLAG = {
  checked: 'itemChecked',
  readOnly: 'itemReadOnly',
  preview: 'itemPreview',
  hover: 'itemHover',
  none: 'itemNone',
  selectAll: 'itemSelectAll',
  error: 'itemOnError',
  disabled: 'itemDisabled',
} as const;
// `sd-item--*` is the type-independent prefix defaultCss.ts uses across
// every select-item subtype (checkbox/radio/imagepicker/...); the
// `sd-{type}--*` suffix half is NOT stable across subtypes, so only the
// `sd-item--*` half is a safe canonical alias here. `selectAll` exists
// ONLY on checkbox, so its checkbox-specific default IS its canonical.
const ITEM_CANONICAL: Partial<Record<keyof typeof ITEM_KEY_BY_FLAG, string>> = {
  checked: 'sd-item--checked',
  readOnly: 'sd-item--readonly',
  preview: 'sd-item--preview',
  hover: 'sd-item--allowhover',
  error: 'sd-item--error',
  disabled: 'sd-item--disabled',
  selectAll: 'sd-checkbox--selectall',
};

// Getter-emitted non-variant vocabulary: `cssClasses.item` (the compound
// base, e.g. "sd-item sd-checkbox sd-selectbase__item"), `itemInline`
// (colCount===0), and the string-built grid class `sv-q-col-<n>`
// (colCount!==0) — question_baseselect.ts getItemClassCore.
const ITEM_KNOWN_BASE_KEYS = ['item', 'itemInline'] as const;
const ITEM_KNOWN_PATTERNS = [/^sv-q-col-\d+$/] as const;

export const ITEM_REACHABILITY: Record<keyof typeof ITEM_KEY_BY_FLAG, boolean> =
  {
    checked: true,
    readOnly: true,
    preview: true,
    hover: true,
    none: true,
    selectAll: true,
    error: true,
    disabled: false,
  };

const itemSchemaCache = new WeakMap<object, SchemaCacheEntry>();

function buildItemSchema(cssClasses: Record<string, unknown>): Schema {
  const schema: Schema = {};
  (
    Object.keys(ITEM_KEY_BY_FLAG) as Array<keyof typeof ITEM_KEY_BY_FLAG>
  ).forEach((flag) => {
    schema[flag] = aliasEntries(
      cssClasses,
      ITEM_KEY_BY_FLAG[flag],
      ITEM_CANONICAL[flag]
    );
  });
  return schema;
}

export function getItemVariant(
  question: Question,
  classString: string | undefined
): ExtractResult {
  const cssClasses = getQuestionCssClasses(question);
  const { schema, knownEntries } = getOrBuildSchema(
    itemSchemaCache,
    cssClasses,
    Object.values(ITEM_KEY_BY_FLAG),
    ITEM_KNOWN_BASE_KEYS,
    buildItemSchema
  );
  return extractTokens(classString, schema, {
    entries: knownEntries,
    patterns: ITEM_KNOWN_PATTERNS,
  });
}

// --- CONTROL exemplar (text-like inputs via getControlClass) ---
// Verified upstream (question_textbase.ts getControlCssClassBuilder):
// `controlDisabled` is gated by the SAME dead `isDisabledStyle` path —
// unreachable for this getter too.
const CONTROL_KEY_BY_FLAG = {
  readOnly: 'controlReadOnly',
  preview: 'controlPreview',
  error: 'onError',
  disabled: 'controlDisabled',
} as const;
const CONTROL_CANONICAL: Partial<
  Record<keyof typeof CONTROL_KEY_BY_FLAG, string>
> = {
  readOnly: 'sd-input--readonly',
  preview: 'sd-input--preview',
  error: 'sd-input--error',
  disabled: 'sd-input--disabled',
};

// getControlCssClassBuilder starts from `cssClasses.root` (e.g.
// "sd-input sd-text") — getter-emitted non-variant vocabulary.
const CONTROL_KNOWN_BASE_KEYS = ['root'] as const;

export const CONTROL_REACHABILITY: Record<
  keyof typeof CONTROL_KEY_BY_FLAG,
  boolean
> = {
  readOnly: true,
  preview: true,
  error: true,
  disabled: false,
};

const controlSchemaCache = new WeakMap<object, SchemaCacheEntry>();

function buildControlSchema(cssClasses: Record<string, unknown>): Schema {
  const schema: Schema = {};
  (
    Object.keys(CONTROL_KEY_BY_FLAG) as Array<keyof typeof CONTROL_KEY_BY_FLAG>
  ).forEach((flag) => {
    schema[flag] = aliasEntries(
      cssClasses,
      CONTROL_KEY_BY_FLAG[flag],
      CONTROL_CANONICAL[flag]
    );
  });
  return schema;
}

export function getControlVariant(
  question: Question,
  classString: string | undefined
): ExtractResult {
  const cssClasses = getQuestionCssClasses(question);
  const { schema, knownEntries } = getOrBuildSchema(
    controlSchemaCache,
    cssClasses,
    Object.values(CONTROL_KEY_BY_FLAG),
    CONTROL_KNOWN_BASE_KEYS,
    buildControlSchema
  );
  return extractTokens(classString, schema, { entries: knownEntries });
}

// --- ROOT exemplar (question.getRootCss(), public per design round-1 fix) ---
// `error`/`errorTop`/`errorBottom`/`answered` are embedded via `cssRoot`
// (getCssRoot -> `hasCssError(true)`, INCLUDING warnings) — the opposite
// of the item getter's warning-excluding `hasCssError()`. Both getters'
// output strings are flat by the time they reach the bridge, so no
// special nesting handling is needed here — just the right flag->token
// map for THIS getter's own `cssClasses` keys.
const ROOT_KEY_BY_FLAG = {
  mobile: 'mobile',
  readOnly: 'readOnly',
  disabled: 'disabled',
  preview: 'preview',
  invisible: 'invisible',
  error: 'hasError',
  errorTop: 'hasErrorTop',
  errorBottom: 'hasErrorBottom',
  answered: 'answered',
} as const;

// getCssRoot (question.ts:1386 + survey-element.ts:1024) embeds these
// non-variant layout/structure keys into `cssRoot` — getter-emitted
// vocabulary, not unknown tokens (codex impl-review major 3).
const ROOT_KNOWN_BASE_KEYS = [
  'mainRoot',
  'flowRoot',
  'titleLeftRoot',
  'titleTopRoot',
  'titleBottomRoot',
  'descriptionUnderInputRoot',
  'small',
  'withFrame',
  'compact',
  'collapsed',
  'expandableAnimating',
  'expanded',
  'expandable',
  'nested',
  'asCell',
  'noPointerEventsMode',
] as const;

export const ROOT_REACHABILITY: Record<keyof typeof ROOT_KEY_BY_FLAG, boolean> =
  {
    mobile: true,
    readOnly: true,
    disabled: false,
    preview: true,
    invisible: true,
    error: true,
    errorTop: true,
    errorBottom: true,
    answered: true,
  };

const rootSchemaCache = new WeakMap<object, SchemaCacheEntry>();

function buildRootSchema(cssClasses: Record<string, unknown>): Schema {
  const schema: Schema = {};
  (
    Object.keys(ROOT_KEY_BY_FLAG) as Array<keyof typeof ROOT_KEY_BY_FLAG>
  ).forEach((flag) => {
    schema[flag] = aliasEntries(cssClasses, ROOT_KEY_BY_FLAG[flag], undefined);
  });
  return schema;
}

export function getRootVariant(
  question: Question,
  classString: string | undefined
): ExtractResult {
  const cssClasses = getQuestionCssClasses(question);
  const { schema, knownEntries } = getOrBuildSchema(
    rootSchemaCache,
    cssClasses,
    Object.values(ROOT_KEY_BY_FLAG),
    ROOT_KNOWN_BASE_KEYS,
    buildRootSchema
  );
  return extractTokens(classString, schema, { entries: knownEntries });
}

// --- BUTTONGROUP exemplar (ButtonGroupItemModel.labelClass) ---
// The design's bridge point 5 promise ("disabled reachable for
// buttongroup — locked by tests"; codex impl-review major 3): unlike the
// base select/text getters, ButtonGroupItemModel's labelClass appends
// `cssClasses.itemDisabled` LIVE on `question.isReadOnly ||
// !item.isEnabled` (question_buttongroup.ts:242) — the disabled family is
// a REACHABLE variant for this getter.
const BUTTONGROUP_KEY_BY_FLAG = {
  selected: 'itemSelected',
  hover: 'itemHover',
  disabled: 'itemDisabled',
} as const;
const BUTTONGROUP_CANONICAL: Partial<
  Record<keyof typeof BUTTONGROUP_KEY_BY_FLAG, string>
> = {
  selected: 'sv-button-group__item--selected',
  hover: 'sv-button-group__item--hover',
  disabled: 'sv-button-group__item--disabled',
};

const BUTTONGROUP_KNOWN_BASE_KEYS = ['item'] as const;

export const BUTTONGROUP_REACHABILITY: Record<
  keyof typeof BUTTONGROUP_KEY_BY_FLAG,
  boolean
> = {
  selected: true,
  hover: true,
  disabled: true,
};

const buttonGroupSchemaCache = new WeakMap<object, SchemaCacheEntry>();

function buildButtonGroupSchema(cssClasses: Record<string, unknown>): Schema {
  const schema: Schema = {};
  (
    Object.keys(BUTTONGROUP_KEY_BY_FLAG) as Array<
      keyof typeof BUTTONGROUP_KEY_BY_FLAG
    >
  ).forEach((flag) => {
    schema[flag] = aliasEntries(
      cssClasses,
      BUTTONGROUP_KEY_BY_FLAG[flag],
      BUTTONGROUP_CANONICAL[flag]
    );
  });
  return schema;
}

export function getButtonGroupItemVariant(
  question: Question,
  classString: string | undefined
): ExtractResult {
  const cssClasses = getQuestionCssClasses(question);
  const { schema, knownEntries } = getOrBuildSchema(
    buttonGroupSchemaCache,
    cssClasses,
    Object.values(BUTTONGROUP_KEY_BY_FLAG),
    BUTTONGROUP_KNOWN_BASE_KEYS,
    buildButtonGroupSchema
  );
  return extractTokens(classString, schema, { entries: knownEntries });
}

// --- Unknown-token queue (design point 4: "no diagnostics during render") ---
export function queueUnknownTokens(
  question: Question,
  tokens: readonly string[]
): void {
  tokens.forEach((token) => queueUnknownCssToken(question, token));
}

export function flushUnknownTokenDiagnostics(question: Question): void {
  flushUnknownCssTokenDiagnosticsSeam(question);
}
