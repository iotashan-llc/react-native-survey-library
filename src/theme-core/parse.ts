/**
 * Bounded, full-match value grammars (design: docs/design/0.6-theme-core.md,
 * "Resolution algorithm" step 4). Every parser here takes an already
 * var()-dereferenced terminal string and either full-matches it to a typed
 * value, or falls back to the caller-supplied fallback plus exactly one
 * `ThemeDiagnostic`. None of these ever throw, and none of them accept a
 * partial match (trailing/leading garbage always falls back) — the
 * resolver's non-throwing-survey guarantee (CLAUDE.md invariant 9) depends
 * on that.
 *
 * `parseCalc` is the one exception to "produces a typed value": it only
 * extracts the SCSS-emitted `calc(<float> * (<operand>))` shape, returning
 * the still-raw `operand` string for the caller to var()-dereference and
 * parse (as a length) itself — see resolve.ts's semantic-derived-default
 * re-evaluation step. This keeps parse.ts free of any dependency on the
 * variable graph.
 */

export interface ThemeDiagnostic {
  code:
    | 'theme-core/invalid-color'
    | 'theme-core/invalid-length'
    | 'theme-core/invalid-font-weight'
    | 'theme-core/invalid-keyword'
    | 'theme-core/invalid-number'
    | 'theme-core/clamped-number'
    | 'theme-core/invalid-shadow'
    | 'theme-core/invalid-string'
    | 'theme-core/var-cycle'
    | 'theme-core/var-unresolved'
    | 'theme-core/invalid-calc';
  variable: string;
  message: string;
  value?: string;
}

export interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ShadowLayer {
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadRadius: number;
  color: ParsedColor;
}

export type FontWeightValue = number | 'lighter' | 'bolder';

export interface ParseResult<T> {
  value: T;
  diagnostics: ThemeDiagnostic[];
}

function diagnostic(
  code: ThemeDiagnostic['code'],
  variable: string,
  message: string,
  value?: string
): ThemeDiagnostic {
  return { code, variable, message, value };
}

function isFiniteFloatToken(token: string): boolean {
  return /^-?(?:\d+\.?\d*|\.\d+)$/.test(token.trim());
}

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

function clampAlpha(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ---------------------------------------------------------------------------
// color
// ---------------------------------------------------------------------------

// Channels are INTEGER-only per the design grammar ("channels finite,
// 0-255 int") — a decimal channel is a non-match (fallback + diagnostic),
// never silently rounded. Alpha stays a float.
const RGB_RE =
  /^rgba?\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)$/;
const HSL_RE =
  /^hsla?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)$/;
const HEX_RE = /^#([0-9a-fA-F]{3,8})$/;

function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const light = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hue < 60) {
    r1 = c;
    g1 = x;
  } else if (hue < 120) {
    r1 = x;
    g1 = c;
  } else if (hue < 180) {
    g1 = c;
    b1 = x;
  } else if (hue < 240) {
    g1 = x;
    b1 = c;
  } else if (hue < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
  };
}

function tryParseColor(raw: string): ParsedColor | undefined {
  const value = raw.trim();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const rgbMatch = value.match(RGB_RE);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    return {
      r: clampByte(Number(r)),
      g: clampByte(Number(g)),
      b: clampByte(Number(b)),
      a: a === undefined ? 1 : clampAlpha(Number(a)),
    };
  }

  const hslMatch = value.match(HSL_RE);
  if (hslMatch) {
    const [, h, s, l, a] = hslMatch;
    const { r, g, b } = hslToRgb(Number(h), Number(s) / 100, Number(l) / 100);
    return { r, g, b, a: a === undefined ? 1 : clampAlpha(Number(a)) };
  }

  const hexMatch = value.match(HEX_RE);
  if (hexMatch && hexMatch[1] !== undefined) {
    const hex = hexMatch[1];
    const expand = (pair: string) =>
      pair.length === 1 ? parseInt(pair + pair, 16) : parseInt(pair, 16);
    if (hex.length === 3) {
      return {
        r: expand(hex.slice(0, 1)),
        g: expand(hex.slice(1, 2)),
        b: expand(hex.slice(2, 3)),
        a: 1,
      };
    }
    if (hex.length === 4) {
      return {
        r: expand(hex.slice(0, 1)),
        g: expand(hex.slice(1, 2)),
        b: expand(hex.slice(2, 3)),
        a: expand(hex.slice(3, 4)) / 255,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }

  return undefined;
}

/** Detects an out-of-range channel/alpha that needed clamping, for the diagnostic. */
function colorNeedsClampDiagnostic(raw: string): boolean {
  const value = raw.trim();
  const rgbMatch = value.match(RGB_RE);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    const channels = [Number(r), Number(g), Number(b)];
    if (channels.some((c) => c < 0 || c > 255)) return true;
    if (a !== undefined && (Number(a) < 0 || Number(a) > 1)) return true;
  }
  return false;
}

export function parseColor(
  raw: string,
  fallback: string,
  variable: string
): ParseResult<ParsedColor> {
  const parsed = tryParseColor(raw);
  if (parsed) {
    const diagnostics: ThemeDiagnostic[] = [];
    if (colorNeedsClampDiagnostic(raw)) {
      diagnostics.push(
        diagnostic(
          'theme-core/invalid-color',
          variable,
          'color channel/alpha out of range; clamped',
          raw
        )
      );
    }
    return { value: parsed, diagnostics };
  }
  const fallbackParsed = tryParseColor(fallback);
  return {
    value: fallbackParsed ?? { r: 0, g: 0, b: 0, a: 1 },
    diagnostics: [
      diagnostic(
        'theme-core/invalid-color',
        variable,
        'value did not full-match any supported color syntax; used fallback',
        raw
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// length
// ---------------------------------------------------------------------------

const PX_RE = /^(-?(?:\d+\.?\d*|\.\d+))px$/;

/**
 * Strict length parse: `<float>px` or bare `0` -> number; anything else ->
 * undefined (no fallback semantics). Exported for resolve.ts's calc-entry
 * handling, which needs a failure SIGNAL (undefined) rather than
 * parseLength's fallback-plus-diagnostic behavior.
 */
export function tryParseLength(raw: string): number | undefined {
  const value = raw.trim();
  const pxMatch = value.match(PX_RE);
  if (pxMatch) return Number(pxMatch[1]);
  if (value === '0') return 0;
  return undefined;
}

export function parseLength(
  raw: string,
  fallback: string,
  variable: string
): ParseResult<number> {
  const parsed = tryParseLength(raw);
  if (parsed !== undefined) return { value: parsed, diagnostics: [] };
  const fallbackParsed = tryParseLength(fallback);
  return {
    value: fallbackParsed ?? 0,
    diagnostics: [
      diagnostic(
        'theme-core/invalid-length',
        variable,
        'value did not full-match <float>px (or bare 0); used fallback',
        raw
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// fontWeight
// ---------------------------------------------------------------------------

const FONT_WEIGHT_KEYWORDS: Record<string, FontWeightValue> = {
  normal: 400,
  bold: 700,
  lighter: 'lighter',
  bolder: 'bolder',
};

function tryParseFontWeight(raw: string): FontWeightValue | undefined {
  const value = raw.trim();
  if (value in FONT_WEIGHT_KEYWORDS) return FONT_WEIGHT_KEYWORDS[value];
  if (isFiniteFloatToken(value)) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1 && n <= 1000) return n;
  }
  return undefined;
}

export function parseFontWeight(
  raw: string,
  fallback: string,
  variable: string
): ParseResult<FontWeightValue> {
  const parsed = tryParseFontWeight(raw);
  if (parsed !== undefined) return { value: parsed, diagnostics: [] };
  const fallbackParsed = tryParseFontWeight(fallback);
  return {
    value: fallbackParsed ?? 400,
    diagnostics: [
      diagnostic(
        'theme-core/invalid-font-weight',
        variable,
        'value did not full-match a 1-1000 weight or normal|bold|lighter|bolder; used fallback',
        raw
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// keyword
// ---------------------------------------------------------------------------

export function parseKeyword<T extends string>(
  raw: string,
  allowed: readonly T[],
  fallback: string,
  variable: string
): ParseResult<T> {
  const value = raw.trim();
  if ((allowed as readonly string[]).includes(value)) {
    return { value: value as T, diagnostics: [] };
  }
  const fallbackTrimmed = fallback.trim();
  // `allowed` is always a non-empty closed union per registry contract.
  const fallbackValue = (allowed as readonly string[]).includes(fallbackTrimmed)
    ? (fallbackTrimmed as T)
    : (allowed[0] as T);
  return {
    value: fallbackValue,
    diagnostics: [
      diagnostic(
        'theme-core/invalid-keyword',
        variable,
        `value is not one of [${allowed.join(', ')}]; used fallback`,
        raw
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// number / opacity
// ---------------------------------------------------------------------------

export interface NumberRange {
  min?: number;
  max?: number;
}

function tryParseNumber(raw: string): number | undefined {
  const value = raw.trim();
  if (!isFiniteFloatToken(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseNumber(
  raw: string,
  range: NumberRange,
  fallback: string,
  variable: string
): ParseResult<number> {
  const parsed = tryParseNumber(raw);
  if (parsed === undefined) {
    const fallbackParsed = tryParseNumber(fallback) ?? 0;
    return {
      value: fallbackParsed,
      diagnostics: [
        diagnostic(
          'theme-core/invalid-number',
          variable,
          'value did not full-match a finite number; used fallback',
          raw
        ),
      ],
    };
  }
  const min = range.min ?? -Infinity;
  const max = range.max ?? Infinity;
  if (parsed < min || parsed > max) {
    const clamped = Math.min(max, Math.max(min, parsed));
    return {
      value: clamped,
      diagnostics: [
        diagnostic(
          'theme-core/clamped-number',
          variable,
          `value ${parsed} outside [${min}, ${max}]; clamped`,
          raw
        ),
      ],
    };
  }
  return { value: parsed, diagnostics: [] };
}

// ---------------------------------------------------------------------------
// shadow
// ---------------------------------------------------------------------------

/** Paren-depth-aware split of a comma-separated shadow value at TOP-LEVEL commas only. */
function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

/** Tokenizes a single shadow layer into space-separated tokens, keeping color() calls intact. */
function tokenizeLayer(layer: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  const trimmed = layer.trim();
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ' ' && depth === 0) {
      if (current.length > 0) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function tryParseShadowLayer(layer: string): ShadowLayer | undefined {
  let tokens = tokenizeLayer(layer);
  let inset = false;
  if (tokens[0] === 'inset') {
    inset = true;
    tokens = tokens.slice(1);
  }
  // Trailing `inset` is also valid CSS shadow syntax.
  if (tokens[tokens.length - 1] === 'inset') {
    inset = true;
    tokens = tokens.slice(0, -1);
  }
  if (tokens.length < 3 || tokens.length > 5) return undefined;

  const colorToken = tokens[tokens.length - 1];
  if (colorToken === undefined) return undefined;
  const isColorLike =
    /^(rgba?|hsla?)\(/.test(colorToken) ||
    colorToken.startsWith('#') ||
    colorToken === 'transparent';
  // A layer's color is REQUIRED — a colorless `<lengths>`-only layer is a
  // non-match (never invent black; the web cascade would use currentColor,
  // which theme-core cannot know).
  if (!isColorLike) return undefined;
  const lengthTokens = tokens.slice(0, -1);
  if (lengthTokens.length < 2 || lengthTokens.length > 4) return undefined;

  const lengths: number[] = [];
  for (const t of lengthTokens) {
    const len = tryParseLength(t);
    if (len === undefined) return undefined;
    lengths.push(len);
  }
  const offsetX = lengths[0];
  const offsetY = lengths[1];
  if (offsetX === undefined || offsetY === undefined) return undefined;

  const color = tryParseColor(colorToken);
  if (!color) return undefined;

  return {
    inset,
    offsetX,
    offsetY,
    blurRadius: lengths[2] ?? 0,
    spreadRadius: lengths[3] ?? 0,
    color,
  };
}

/**
 * Parses a full comma-separated shadow list. Every layer must be nonempty
 * and full-match the layer grammar — an empty layer (trailing comma,
 * double comma) or a colorless/partial layer invalidates the WHOLE value
 * (full-match rule; nothing is silently discarded).
 */
function tryParseShadowList(raw: string): ShadowLayer[] | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const layers = splitTopLevel(trimmed).map((l) => l.trim());
  const parsedLayers: ShadowLayer[] = [];
  for (const layer of layers) {
    if (layer.length === 0) return undefined;
    const parsed = tryParseShadowLayer(layer);
    if (!parsed) return undefined;
    parsedLayers.push(parsed);
  }
  return parsedLayers;
}

export function parseShadow(
  raw: string,
  fallback: string,
  variable: string
): ParseResult<ShadowLayer[]> {
  const parsedLayers = tryParseShadowList(raw);
  if (parsedLayers) return { value: parsedLayers, diagnostics: [] };

  const fallbackLayers = tryParseShadowList(fallback) ?? [];
  return {
    value: fallbackLayers,
    diagnostics: [
      diagnostic(
        'theme-core/invalid-shadow',
        variable,
        'value did not full-match the box-shadow layer grammar; used fallback',
        raw
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// calc (syntax-only; caller dereferences + parses the operand as a length)
// ---------------------------------------------------------------------------

export interface ParsedCalc {
  multiplier: number;
  operand: string;
}

/** Full-match check: is `text` exactly one balanced `var(...)` call? */
function isBalancedVarCall(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('var(')) return false;
  const closeIndex = findMatchingParenIndex(trimmed, 3);
  return closeIndex === trimmed.length - 1;
}

function findMatchingParenIndex(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parses exactly the SCSS-emitted calc dialect:
 * `calc(<float> * (<operand>))` where `<operand>` is precisely ONE
 * balanced group containing either a `var(...)` call (dereferenced by the
 * caller) or a length token (`<float>px` / bare `0`). Anything else —
 * addition, a missing operand group, an unbalanced or multi-group operand
 * (`(8px)(9px)`), a non-length non-var operand — returns null (caller
 * falls back + diagnoses). Paren-matching is done with a scan, not a
 * greedy regex, so unbalanced content can never sneak through as an
 * "operand".
 */
export function parseCalc(raw: string): ParsedCalc | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('calc(') || !trimmed.endsWith(')')) return null;
  const outerClose = findMatchingParenIndex(trimmed, 4);
  if (outerClose !== trimmed.length - 1) return null;
  const inner = trimmed.slice(5, outerClose);

  const starIndex = inner.indexOf('*');
  if (starIndex === -1) return null;
  const multiplierText = inner.slice(0, starIndex).trim();
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(multiplierText)) return null;

  const operandPart = inner.slice(starIndex + 1).trim();
  if (!operandPart.startsWith('(')) return null;
  const operandClose = findMatchingParenIndex(operandPart, 0);
  // The operand must be exactly ONE balanced group with nothing after it.
  if (operandClose !== operandPart.length - 1) return null;
  const operand = operandPart.slice(1, operandClose).trim();

  // Operand grammar: a single balanced var() call OR a length token.
  const operandIsValid =
    isBalancedVarCall(operand) || tryParseLength(operand) !== undefined;
  if (!operandIsValid) return null;

  return { multiplier: Number(multiplierText), operand };
}

// ---------------------------------------------------------------------------
// string (bounded passthrough — font-family lists and other out-of-`tokens`
// -scope registry entries that don't fit any of the typed grammars above)
// ---------------------------------------------------------------------------

export function parseString(
  raw: string,
  fallback: string,
  variable: string
): ParseResult<string> {
  const value = raw.trim();
  if (value.length > 0) return { value, diagnostics: [] };
  return {
    value: fallback.trim(),
    diagnostics: [
      diagnostic(
        'theme-core/invalid-string',
        variable,
        'value was empty; used fallback',
        raw
      ),
    ],
  };
}
