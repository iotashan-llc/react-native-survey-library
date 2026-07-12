/**
 * `resolveTheme(theme?) -> ResolvedTheme` (design:
 * docs/design/0.6-theme-core.md, "Resolution algorithm" + "Module layout"
 * — resolve.ts). Pure DATA in, pure DATA out — `ResolvedTheme` contains
 * zero functions (verified by a purity test) and is stable-serializable
 * (deep-equal across identical calls; no shared mutable state between
 * calls).
 *
 * Algorithm (mirrors the design's 6 numbered steps exactly):
 *  1. `rawVariables` = every registry entry's raw default (the NORMAL
 *     context default for context-dependent entries) overlaid with
 *     `theme.cssVariables`.
 *  2. `var()` dereference — `helpers.ts#evaluateVarExpression`'s
 *     tri-state DFS, run per-entry against the full `rawVariables` graph.
 *  3. Semantic-derived (here: the 7 `calc(...)`-shaped) defaults are
 *     evaluated AFTER the dereference in step 2 has already applied the
 *     overlay, so an override of e.g. `--sjs-font-size` flows into the
 *     derived article font sizes.
 *  4. Parse — each dereferenced string is parsed under its registry
 *     grammar; a non-full-match falls back to the registry default
 *     RE-EVALUATED against the (already-overlaid) `rawVariables` — never
 *     a pre-resolved literal.
 *  5. Assemble the `ResolvedTheme` shape.
 *  6. `spacing()` is intentionally NOT part of the output (helpers.ts's
 *     pure standalone fn).
 */
import type { ITheme, IHeader } from '../core/facade';
import { REGISTRY, PRESET_BASE_NAMES, type GrammarSpec } from './registry';
import { DEFAULTS, ACCENT_DEFAULTS } from './defaults';
import { evaluateVarExpression, type RawVariables } from './helpers';
import {
  parseColor,
  parseLength,
  tryParseLength,
  parseFontWeight,
  parseKeyword,
  parseNumber,
  parseShadow,
  parseCalc,
  parseString,
  type ParsedColor,
  type ShadowLayer,
  type FontWeightValue,
  type ThemeDiagnostic,
} from './parse';

export type { ThemeDiagnostic } from './parse';

export interface ColorToken extends ParsedColor {
  css: string;
}

export interface ArticleFontToken {
  fontSize: number;
  textDecoration: string;
  fontWeight: FontWeightValue;
  fontStyle: string;
  fontStretch: string;
  letterSpacing: number;
  lineHeight: number;
  paragraphIndent: number;
  textCase: string;
}

export interface ShadowTokens {
  small: ShadowLayer[];
  smallReset: ShadowLayer[];
  medium: ShadowLayer[];
  large: ShadowLayer[];
  inner: ShadowLayer[];
  innerReset: ShadowLayer[];
}

export interface ArticleFontTokens {
  xxLarge: ArticleFontToken;
  xLarge: ArticleFontToken;
  large: ArticleFontToken;
  medium: ArticleFontToken;
  default: ArticleFontToken;
}

export interface FontFamilyToken {
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeightValue;
}

/**
 * Companion amendment (design: docs/design/0.7-theme-rn.md, "Companion
 * amendments" #2): normalized typography families so 0.7 never re-parses
 * `rawVariables` directly. `editorLineHeight` and `baseLineHeight` are
 * DELIBERATELY separate tokens (1.5x their respective font-size path) —
 * identical at defaults, diverge under a theme that overrides only one of
 * `--sjs-font-editorfont-size` / `--sjs-font-size` (0.7 metrics fixture).
 */
export interface TypographyTokens {
  base: { fontFamily: string; fontSize: number };
  editor: FontFamilyToken;
  questionTitle: FontFamilyToken;
  editorLineHeight: number;
  baseLineHeight: number;
  editorCornerRadius: number;
}

export interface ThemeTokens {
  colors: Record<string, ColorToken>;
  baseUnit: number;
  cornerRadius: number;
  shadows: ShadowTokens;
  articleFont: ArticleFontTokens;
  typography: TypographyTokens;
}

export interface ThemeMeta {
  themeName?: string;
  colorPalette: 'light' | 'dark';
  isPanelless: boolean;
}

export interface ThemeBackground {
  image?: string;
  fit: 'auto' | 'contain' | 'cover';
  attachment: 'scroll' | 'fixed';
  opacity: number;
}

export type HeaderBackgroundKind = 'none' | 'accent' | 'custom';

export interface ThemeHeader {
  rawHeader: IHeader | undefined;
  headerView: 'basic' | 'advanced';
  /** Raw classification of --sjs-header-backcolor, mirroring Cover.updateHeaderClasses' literal check — pre-dereference. */
  backgroundKind: HeaderBackgroundKind;
  /**
   * Whether the accent CONTEXT is active for title/description colors:
   * `backgroundKind === 'accent'` AND neither title nor description color
   * explicitly set (the sv-header__background-color--accent class is
   * suppressed by any explicit color — header.ts:113-126). Distinct from
   * `backgroundKind`, which is the raw classification alone.
   */
  accentContextActive: boolean;
  colors: {
    raw: {
      backgroundColor?: string;
      titleColor?: string;
      descriptionColor?: string;
    };
    resolved: {
      backgroundColor: ColorToken;
      titleColor: ColorToken;
      descriptionColor: ColorToken;
    };
  };
}

export interface ResolvedTheme {
  tokens: ThemeTokens;
  meta: ThemeMeta;
  background: ThemeBackground;
  header: ThemeHeader;
  rawVariables: RawVariables;
  extras: Record<string, string>;
  diagnostics: ThemeDiagnostic[];
}

function toCssColor(c: ParsedColor): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

function toColorToken(c: ParsedColor): ColorToken {
  return { ...c, css: toCssColor(c) };
}

function toCamelCase(sjsName: string): string {
  return sjsName
    .replace(/^--sjs-/, '')
    .replace(/-([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
}

const SIZE_KEYS = [
  'xx-large',
  'x-large',
  'large',
  'medium',
  'default',
] as const;
const SIZE_OUTPUT_KEYS = [
  'xxLarge',
  'xLarge',
  'large',
  'medium',
  'default',
] as const;
const ARTICLE_PROPS = [
  'textDecoration',
  'fontWeight',
  'fontStyle',
  'fontStretch',
  'letterSpacing',
  'lineHeight',
  'paragraphIndent',
  'textCase',
] as const;

/**
 * Resolves one registry entry to a dereferenced terminal string, given the
 * full overlaid `rawVariables` environment. Falls back to the registry's
 * OWN default RE-EVALUATED against the same environment (never a
 * pre-resolved literal) when the override value's `var()` dereference
 * itself fails to produce anything.
 */
function dereferenceEntry(
  name: string,
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): string {
  const raw = rawVariables[name];
  if (raw === undefined) return '';
  // Resolve BY NAME through the graph (`var(name)`), never by evaluating
  // the entry's raw value as a standalone top-level expression: the
  // standalone form treats the entry's own definition as a REFERRING
  // expression, letting a cycle member's internal fallback revive it at
  // the top level (codex review critical 2, end-to-end case). Through the
  // graph, a member is guaranteed-invalid and the registry-default path
  // below applies instead.
  const { value, diagnostics: derefDiagnostics } = evaluateVarExpression(
    rawVariables,
    `var(${name})`
  );
  diagnostics.push(...derefDiagnostics);
  if (value !== undefined) return value;

  // The override's own var() chain was entirely unresolved (e.g. a cycle
  // introduced by the theme) — fall back to the registry default,
  // re-evaluated against the same post-overlay environment.
  return dereferenceDefault(name, rawVariables, diagnostics);
}

/**
 * Dereferences the REGISTRY's default for `name` (not `rawVariables[name]`,
 * which may hold a theme override) against the full post-overlay
 * environment. Used both when an override's own dereference fails, and as
 * the "fallback" string handed to a grammar parser — a registry default
 * is itself often a `var()` chain (e.g. `var(--sjs-font-size, 16px)`) and
 * must be re-evaluated post-overlay per the design's derived-expression
 * rule, never used as a raw, unevaluated literal.
 */
function dereferenceDefault(
  name: string,
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): string {
  const registryDefault = REGISTRY[name]?.default ?? '';
  const result = evaluateVarExpression(rawVariables, registryDefault);
  diagnostics.push(...result.diagnostics);
  return result.value ?? registryDefault;
}

/** Parses a dereferenced string under its registry grammar, given a fallback string to use on a non-match. */
function parseByGrammar(
  grammar: GrammarSpec,
  dereferenced: string,
  fallback: string,
  name: string,
  diagnostics: ThemeDiagnostic[]
): unknown {
  switch (grammar.kind) {
    case 'color': {
      const r = parseColor(dereferenced, fallback, name);
      diagnostics.push(...r.diagnostics);
      return r.value;
    }
    case 'length': {
      const r = parseLength(dereferenced, fallback, name);
      diagnostics.push(...r.diagnostics);
      return r.value;
    }
    case 'fontWeight': {
      const r = parseFontWeight(dereferenced, fallback, name);
      diagnostics.push(...r.diagnostics);
      return r.value;
    }
    case 'keyword': {
      const r = parseKeyword(dereferenced, grammar.allowed, fallback, name);
      diagnostics.push(...r.diagnostics);
      return r.value;
    }
    case 'number': {
      const r = parseNumber(
        dereferenced,
        { min: grammar.min, max: grammar.max },
        fallback,
        name
      );
      diagnostics.push(...r.diagnostics);
      return r.value;
    }
    case 'shadow': {
      const r = parseShadow(dereferenced, fallback, name);
      diagnostics.push(...r.diagnostics);
      return r.value;
    }
    case 'string': {
      const r = parseString(dereferenced, fallback, name);
      diagnostics.push(...r.diagnostics);
      return r.value;
    }
    case 'calc': {
      // Handled by resolveCalcLength — this branch only reached if a calc
      // entry's grammar is looked up generically elsewhere.
      return dereferenced;
    }
  }
}

/**
 * Resolves a `calc(<n> * (<operand>))`-shaped entry to a number: the
 * operand (already fully var()-dereferenced by `dereferenceEntry`) is
 * itself parsed as a length. Returns undefined — a FAILURE signal, never
 * a made-up 0 — when the value is neither the calc dialect with a
 * length-resolvable operand nor a plain length; the caller then
 * re-evaluates the registry default post-overlay (codex review major 7).
 */
function calcOrLength(value: string): number | undefined {
  const calc = parseCalc(value);
  if (calc) {
    const operand = tryParseLength(calc.operand);
    return operand === undefined ? undefined : calc.multiplier * operand;
  }
  return tryParseLength(value);
}

function resolveCalcLength(
  name: string,
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): number {
  const dereferenced = dereferenceEntry(name, rawVariables, diagnostics);
  const primary = calcOrLength(dereferenced);
  if (primary !== undefined) return primary;

  // Neither calc-shaped with a valid operand nor a plain length —
  // re-evaluate the registry default post-overlay (never a pre-resolved
  // literal, never a made-up 0).
  const fallbackDeref = dereferenceDefault(name, rawVariables, diagnostics);
  const fallback = calcOrLength(fallbackDeref) ?? 0;
  diagnostics.push({
    code: 'theme-core/invalid-calc',
    variable: name,
    message: 'value did not full-match the calc() dialect; used fallback',
    value: dereferenced,
  });
  return fallback;
}

function resolveEntry(
  name: string,
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): unknown {
  const entry = REGISTRY[name];
  if (!entry) return undefined;
  if (entry.grammar.kind === 'calc') {
    return resolveCalcLength(name, rawVariables, diagnostics);
  }
  const dereferenced = dereferenceEntry(name, rawVariables, diagnostics);
  // The fallback handed to the grammar parser must itself be dereferenced
  // post-overlay (design: "derived-expression defaults RE-EVALUATE
  // post-overlay") — a registry default is very often a `var()` chain
  // (e.g. `var(--sjs-font-size, 16px)`), never a pre-resolved literal.
  // Its own dereference diagnostics are only relevant if the fallback
  // actually ends up used, so they're computed into a scratch array and
  // merged in only then (keeps the clean/no-override path diagnostic-free).
  const defaultDerefDiagnostics: ThemeDiagnostic[] = [];
  const dereferencedDefault = dereferenceDefault(
    name,
    rawVariables,
    defaultDerefDiagnostics
  );
  const before = diagnostics.length;
  const result = parseByGrammar(
    entry.grammar,
    dereferenced,
    dereferencedDefault,
    name,
    diagnostics
  );
  if (diagnostics.length > before) {
    diagnostics.push(...defaultDerefDiagnostics);
  }
  return result;
}

function buildRawVariables(theme: ITheme | undefined): RawVariables {
  return { ...DEFAULTS, ...(theme?.cssVariables ?? {}) };
}

function resolveColors(
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): Record<string, ColorToken> {
  const colors: Record<string, ColorToken> = {};
  for (const name of PRESET_BASE_NAMES) {
    const entry = REGISTRY[name];
    if (!entry || entry.grammar.kind !== 'color') continue;
    const value = resolveEntry(name, rawVariables, diagnostics) as ParsedColor;
    colors[toCamelCase(name)] = toColorToken(value);
  }
  return colors;
}

function resolveShadows(
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): ShadowTokens {
  const get = (name: string) =>
    resolveEntry(name, rawVariables, diagnostics) as ShadowLayer[];
  return {
    small: get('--sjs-shadow-small'),
    smallReset: get('--sjs-shadow-small-reset'),
    medium: get('--sjs-shadow-medium'),
    large: get('--sjs-shadow-large'),
    inner: get('--sjs-shadow-inner'),
    innerReset: get('--sjs-shadow-inner-reset'),
  };
}

function resolveArticleFont(
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): ArticleFontTokens {
  const result = {} as ArticleFontTokens;
  SIZE_KEYS.forEach((sizeKey, i) => {
    const outputKey = SIZE_OUTPUT_KEYS[i] as keyof ArticleFontTokens;
    const fontSizeName = `--sjs-article-font-${sizeKey}-fontSize`;
    const fontSize = resolveEntry(
      fontSizeName,
      rawVariables,
      diagnostics
    ) as number;
    const token = { fontSize } as ArticleFontToken;
    for (const prop of ARTICLE_PROPS) {
      const name = `--sjs-article-font-${sizeKey}-${prop}`;
      (token as unknown as Record<string, unknown>)[prop] = resolveEntry(
        name,
        rawVariables,
        diagnostics
      );
    }
    result[outputKey] = token;
  });
  return result;
}

/**
 * Font-family chains (`--sjs-font-family` and its editor/questionTitle
 * dependents) all terminate at `--sjs-default-font-family` — a
 * documented, deliberately fallback-less runtime hook (registry-data.ts:
 * "an optional runtime hook; unset in the pure cascade, so dependent
 * font-family chains resolve to inherit"). An unresolved family caused by
 * THAT hook being unset is NOT a malformed-theme condition (the real CSS
 * cascade's answer here is `inherit`, not an error), so that ONE case
 * stays diagnostic-free.
 *
 * Every other dereference failure IS forwarded (codex impl-review minor
 * 10 — the old blanket discard also swallowed genuine cycles and dangling
 * host references): `var-cycle` diagnostics always pass through, and
 * `var-unresolved` is suppressed only when the same evaluation shows the
 * unset `--sjs-default-font-family` terminal hook as the cause.
 */
function resolveFamily(
  name: string,
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): string {
  const { value, diagnostics: derefDiagnostics } = evaluateVarExpression(
    rawVariables,
    `var(${name})`
  );
  const terminalHookUnset = derefDiagnostics.some(
    (d) =>
      d.code === 'theme-core/var-unresolved' &&
      d.variable === '--sjs-default-font-family'
  );
  for (const diagnostic of derefDiagnostics) {
    if (terminalHookUnset && diagnostic.code === 'theme-core/var-unresolved') {
      continue;
    }
    diagnostics.push(diagnostic);
  }
  return (value ?? '').trim();
}

function resolveTypography(
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): TypographyTokens {
  const baseFontSize = resolveEntry(
    '--sjs-font-size',
    rawVariables,
    diagnostics
  ) as number;
  const editorFontSize = resolveEntry(
    '--sjs-font-editorfont-size',
    rawVariables,
    diagnostics
  ) as number;
  return {
    base: {
      fontFamily: resolveFamily('--sjs-font-family', rawVariables, diagnostics),
      fontSize: baseFontSize,
    },
    editor: {
      fontFamily: resolveFamily(
        '--sjs-font-editorfont-family',
        rawVariables,
        diagnostics
      ),
      fontSize: editorFontSize,
      fontWeight: resolveEntry(
        '--sjs-font-editorfont-weight',
        rawVariables,
        diagnostics
      ) as FontWeightValue,
    },
    questionTitle: {
      fontFamily: resolveFamily(
        '--sjs-font-questiontitle-family',
        rawVariables,
        diagnostics
      ),
      fontSize: resolveEntry(
        '--sjs-font-questiontitle-size',
        rawVariables,
        diagnostics
      ) as number,
      fontWeight: resolveEntry(
        '--sjs-font-questiontitle-weight',
        rawVariables,
        diagnostics
      ) as FontWeightValue,
    },
    editorLineHeight: 1.5 * editorFontSize,
    baseLineHeight: 1.5 * baseFontSize,
    editorCornerRadius: resolveEntry(
      '--sjs-editorpanel-cornerRadius',
      rawVariables,
      diagnostics
    ) as number,
  };
}

/** `url(...)` unwrap for a background image URI — the SCSS/CSS `url()` wrapper isn't meaningful to a bare RN image source. */
function unwrapUrl(value: string): string {
  const match = value.trim().match(/^url\(\s*['"]?(.*?)['"]?\s*\)$/);
  return match ? (match[1] ?? value) : value;
}

function resolveBackground(
  theme: ITheme | undefined,
  diagnostics: ThemeDiagnostic[]
): ThemeBackground {
  const fit = theme?.backgroundImageFit ?? 'cover';
  const attachment = theme?.backgroundImageAttachment ?? 'scroll';
  const opacityRaw = theme?.backgroundOpacity;
  let opacity = 1;
  if (opacityRaw !== undefined) {
    const result = parseNumber(
      String(opacityRaw),
      { min: 0, max: 1 },
      '1',
      '--sjs-theme-backgroundOpacity'
    );
    diagnostics.push(...result.diagnostics);
    opacity = result.value;
  }
  return {
    image: theme?.backgroundImage
      ? unwrapUrl(theme.backgroundImage)
      : undefined,
    fit,
    attachment,
    opacity,
  };
}

function classifyBackgroundKind(rawBackcolor: string): HeaderBackgroundKind {
  if (!rawBackcolor || rawBackcolor === 'transparent') return 'none';
  if (rawBackcolor === 'var(--sjs-primary-backcolor)') return 'accent';
  return 'custom';
}

function resolveHeaderColor(
  name: string,
  useAccentChain: boolean,
  theme: ITheme | undefined,
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): { raw: string | undefined; resolved: ColorToken } {
  const entry = REGISTRY[name];
  const rawOverride = theme?.cssVariables?.[name];
  const contextDefaultExpr = useAccentChain
    ? (entry?.accentDefault ?? entry?.default ?? 'transparent')
    : (entry?.default ?? 'transparent');
  // Dereference the selected context default FIRST — it is a var() chain
  // (e.g. var(--sjs-font-pagetitle-color, ...)) and must be a terminal
  // color string before it can serve as parseColor's fallback (codex
  // review major 8a: passing the unresolved expression produced black).
  const contextDefaultDeref = evaluateVarExpression(
    rawVariables,
    contextDefaultExpr
  );
  const contextFallback = contextDefaultDeref.value ?? 'transparent';

  if (rawOverride === undefined) {
    const parsed = parseColor(contextFallback, contextFallback, name);
    diagnostics.push(...contextDefaultDeref.diagnostics);
    diagnostics.push(...parsed.diagnostics);
    return { raw: undefined, resolved: toColorToken(parsed.value) };
  }

  // Resolve the override BY NAME through the graph (same cycle-safety
  // rationale as dereferenceEntry — rawVariables already carries the
  // override post-overlay).
  const { value, diagnostics: derefDiagnostics } = evaluateVarExpression(
    rawVariables,
    `var(${name})`
  );
  diagnostics.push(...derefDiagnostics);
  const parsed = parseColor(value ?? contextFallback, contextFallback, name);
  diagnostics.push(...parsed.diagnostics);
  return { raw: rawOverride, resolved: toColorToken(parsed.value) };
}

function resolveHeader(
  theme: ITheme | undefined,
  rawVariables: RawVariables,
  diagnostics: ThemeDiagnostic[]
): ThemeHeader {
  const rawBackcolor = theme?.cssVariables?.['--sjs-header-backcolor'] ?? '';
  const backgroundKind = classifyBackgroundKind(rawBackcolor);

  // Raw classification (mirroring Cover.updateHeaderClasses' literal
  // check) is NOT the same thing as the accent CONTEXT being active for
  // title/description colors: the sv-header__background-color--accent
  // class is only appended when backgroundColorAccent && !titleColor &&
  // !descriptionColor (header.ts:113-126) — ANY explicit title or
  // description color suppresses the class, so the un-overridden one
  // falls back through the NORMAL chain (codex review major 8b).
  const rawTitleOverride =
    theme?.cssVariables?.['--sjs-font-headertitle-color'];
  const rawDescriptionOverride =
    theme?.cssVariables?.['--sjs-font-headerdescription-color'];
  const accentContextActive =
    backgroundKind === 'accent' &&
    rawTitleOverride === undefined &&
    rawDescriptionOverride === undefined;

  const backgroundColor = resolveHeaderColor(
    '--sjs-header-backcolor',
    accentContextActive,
    theme,
    rawVariables,
    diagnostics
  );
  const titleColor = resolveHeaderColor(
    '--sjs-font-headertitle-color',
    accentContextActive,
    theme,
    rawVariables,
    diagnostics
  );
  const descriptionColor = resolveHeaderColor(
    '--sjs-font-headerdescription-color',
    accentContextActive,
    theme,
    rawVariables,
    diagnostics
  );

  // applyTheme's implicit rule: header present + no explicit headerView => 'advanced'.
  const headerView: 'basic' | 'advanced' =
    theme?.headerView ?? (theme?.header ? 'advanced' : 'basic');

  return {
    rawHeader: theme?.header,
    headerView,
    backgroundKind,
    accentContextActive,
    colors: {
      raw: {
        backgroundColor: backgroundColor.raw,
        titleColor: titleColor.raw,
        descriptionColor: descriptionColor.raw,
      },
      resolved: {
        backgroundColor: backgroundColor.resolved,
        titleColor: titleColor.resolved,
        descriptionColor: descriptionColor.resolved,
      },
    },
  };
}

function resolveExtras(theme: ITheme | undefined): Record<string, string> {
  const extras: Record<string, string> = {};
  const cssVariables = theme?.cssVariables ?? {};
  for (const [name, value] of Object.entries(cssVariables)) {
    if (!REGISTRY[name]) extras[name] = value;
  }
  return extras;
}

export function resolveTheme(theme?: ITheme): ResolvedTheme {
  const diagnostics: ThemeDiagnostic[] = [];
  const rawVariables = buildRawVariables(theme);

  const colors = resolveColors(rawVariables, diagnostics);
  const baseUnit = resolveEntry(
    '--sjs-base-unit',
    rawVariables,
    diagnostics
  ) as number;
  const cornerRadius = resolveEntry(
    '--sjs-corner-radius',
    rawVariables,
    diagnostics
  ) as number;
  const shadows = resolveShadows(rawVariables, diagnostics);
  const articleFont = resolveArticleFont(rawVariables, diagnostics);
  const typography = resolveTypography(rawVariables, diagnostics);

  const tokens: ThemeTokens = {
    colors,
    baseUnit,
    cornerRadius,
    shadows,
    articleFont,
    typography,
  };

  const meta: ThemeMeta = {
    themeName: theme?.themeName,
    colorPalette: theme?.colorPalette === 'dark' ? 'dark' : 'light',
    isPanelless: theme?.isPanelless ?? false,
  };

  const background = resolveBackground(theme, diagnostics);
  const header = resolveHeader(theme, rawVariables, diagnostics);
  const extras = resolveExtras(theme);

  return {
    tokens,
    meta,
    background,
    header,
    rawVariables,
    extras,
    diagnostics,
  };
}

// Re-exported for 0.7 / debugging convenience — not part of the "pure
// output" contract (these are inputs, not ResolvedTheme fields).
export { ACCENT_DEFAULTS };
