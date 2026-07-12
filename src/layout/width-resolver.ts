/**
 * Width-expression resolver (design: docs/design/1.3-width-resolver.md).
 *
 * Translates the CSS width grammar survey-core emits through
 * `SurveyElement.rootStyle` — the DOM renderer's single width binding
 * point (D1: consume rootStyle, never re-derive row math) — into numeric
 * RN styles, given a measured container width in dp.
 *
 * Pure TS: zero react-native imports, zero survey-core imports (rows and
 * elements are typed structurally), diagnostics returned as data and
 * never pushed through the app-wide seam (theme-core precedent; 1.4's
 * row component forwards them post-commit).
 *
 * Supported grammar (D2; DIFFERENCES.md carries the consumer-facing
 * table): `""` | `auto` | bare number (= px, core's own convention) |
 * `<n>px` | `<n>%` | `calc(expr)` | `min(...)`/`max(...)` (n-ary,
 * nestable inside calc). CSS calc type rules enforced: `+`/`-` need
 * same-type operands, `*` needs a plain-number operand, `/` needs a
 * plain non-zero number divisor. Any other unit →
 * `layout/unsupported-width-unit`; anything else unparseable →
 * `layout/invalid-width`. A failed value drops ONLY its own property
 * (element degrades to share-the-space flexGrow behavior); nothing here
 * ever throws (invariant 9 spirit).
 */

export type WidthDiagnosticCode =
  'layout/invalid-width' | 'layout/unsupported-width-unit';

export type WidthProperty = 'flexBasis' | 'minWidth' | 'maxWidth' | 'width';

/** Property-less diagnostic, as produced by `evaluateWidthExpression`
 * (which doesn't know which style property it is resolving). */
export interface WidthValueDiagnostic {
  code: WidthDiagnosticCode;
  /** The offending raw value, stringified verbatim. */
  value: string;
  message: string;
}

export interface WidthDiagnostic extends WidthValueDiagnostic {
  property: WidthProperty;
}

export type WidthValue =
  | { kind: 'dp'; dp: number }
  | { kind: 'auto' }
  | { kind: 'unset' }
  | { kind: 'invalid'; diagnostic: WidthValueDiagnostic };

export interface WidthContext {
  /** Measured width (dp) that CSS `%` resolves against (D3). */
  percentBase: number;
}

/** All-numeric (dp) style subset — safe to hand to Yoga verbatim. */
export interface ResolvedWidthStyle {
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number;
  minWidth?: number;
  maxWidth?: number;
}

export interface WidthResolution {
  style: ResolvedWidthStyle;
  diagnostics: WidthDiagnostic[];
}

/**
 * Structural row shape — accepts a live `QuestionRowModel` or a stub.
 * Elements are any object; `rootStyle` is read structurally at runtime
 * (upstream declares it on `SurveyElement`, not on the `IElement`
 * interface `visibleElements` is typed with, so requiring it here would
 * fail TS's weak-type check against live rows).
 */
export interface RowLike<E extends object = object> {
  visibleElements: ReadonlyArray<E>;
}

export interface RowWidthContext {
  /** Measured row View content width, dp. */
  rowWidth: number;
  /**
   * The inter-element gutter g (dp; theme token, 1.4 supplies it).
   * DOM parity (design, "Row semantics"): a multi-element row widens
   * itself by g (negative margin) and pads each element by g, so `%`
   * resolves against rowWidth + g there — single-element rows resolve
   * against rowWidth alone.
   */
  gutter?: number;
}

export interface RowWidthResolution<E extends object> {
  isMultiple: boolean;
  percentBase: number;
  elements: Array<{ element: E } & WidthResolution>;
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

/** Internal parse failure — caught at the `evaluateWidthExpression`
 * boundary; never escapes this module. */
class WidthParseError extends Error {
  constructor(
    public readonly code: WidthDiagnosticCode,
    message: string
  ) {
    super(message);
  }
}

/** `num` = CSS <number> (dimensionless); `len` = resolved length in dp. */
interface Operand {
  type: 'num' | 'len';
  v: number;
}

type Token =
  | { t: 'number'; v: number; unit: string | null }
  | { t: 'ident'; name: string }
  | { t: 'punct'; ch: '(' | ')' | ',' | '+' | '-' | '*' | '/' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (
      ch === '(' ||
      ch === ')' ||
      ch === ',' ||
      ch === '+' ||
      ch === '-' ||
      ch === '*' ||
      ch === '/'
    ) {
      tokens.push({ t: 'punct', ch });
      i++;
      continue;
    }
    const numMatch = /^(?:\d+\.?\d*|\.\d+)/.exec(input.slice(i));
    if (numMatch) {
      i += numMatch[0].length;
      let unit: string | null = null;
      const unitMatch = /^(%|[a-zA-Z]+)/.exec(input.slice(i));
      if (unitMatch) {
        unit = unitMatch[0];
        i += unit.length;
      }
      tokens.push({ t: 'number', v: parseFloat(numMatch[0]), unit });
      continue;
    }
    const identMatch = /^[a-zA-Z][a-zA-Z-]*/.exec(input.slice(i));
    if (identMatch) {
      tokens.push({ t: 'ident', name: identMatch[0] });
      i += identMatch[0].length;
      continue;
    }
    throw new WidthParseError(
      'layout/invalid-width',
      `Unexpected character '${ch}' in width expression`
    );
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly percentBase: number
  ) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  next(): Token | undefined {
    return this.tokens[this.pos++];
  }
  expectPunct(ch: string): void {
    const tok = this.next();
    if (!tok || tok.t !== 'punct' || tok.ch !== ch) {
      throw new WidthParseError(
        'layout/invalid-width',
        `Expected '${ch}' in width expression`
      );
    }
  }
  atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  /**
   * Top-level entry: exactly ONE component — `NUMBER[unit]` or a
   * function value (CSS allows no arithmetic outside calc(); core never
   * emits any). Trailing tokens (`"100px 200px"`) are invalid.
   */
  parseSingleComponent(): Operand {
    const tok = this.next();
    if (!tok) {
      throw new WidthParseError(
        'layout/invalid-width',
        'Empty width expression'
      );
    }
    let result: Operand;
    if (tok.t === 'number') {
      result = this.operandFromNumber(tok.v, tok.unit);
    } else if (tok.t === 'ident') {
      result = this.parseFunction(tok.name);
    } else {
      throw new WidthParseError(
        'layout/invalid-width',
        'Expected a width value'
      );
    }
    if (!this.atEnd()) {
      throw new WidthParseError(
        'layout/invalid-width',
        'Unexpected trailing content in width expression'
      );
    }
    return result;
  }

  /** number-with-unit → Operand. Bare number stays `num` (calc `/2`
   * divisors need it); top level and min/max args coerce later. */
  private operandFromNumber(v: number, unit: string | null): Operand {
    if (unit === null) return { type: 'num', v };
    if (unit === '%') {
      return { type: 'len', v: (v / 100) * this.percentBase };
    }
    if (/^px$/i.test(unit)) return { type: 'len', v };
    throw new WidthParseError(
      'layout/unsupported-width-unit',
      `Unsupported CSS unit '${unit}' (supported: px, %)`
    );
  }

  /** sum := product (('+'|'-') product)* — same-type operands (CSS calc). */
  parseSum(): Operand {
    let left = this.parseProduct();
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.t !== 'punct' || (tok.ch !== '+' && tok.ch !== '-')) {
        return left;
      }
      this.next();
      const right = this.parseProduct();
      if (left.type !== right.type) {
        throw new WidthParseError(
          'layout/invalid-width',
          `'${tok.ch}' requires operands of the same type (length${tok.ch}length or number${tok.ch}number)`
        );
      }
      left = {
        type: left.type,
        v: tok.ch === '+' ? left.v + right.v : left.v - right.v,
      };
    }
  }

  /** product := factor (('*'|'/') factor)* — CSS calc type rules. */
  private parseProduct(): Operand {
    let left = this.parseFactor();
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.t !== 'punct' || (tok.ch !== '*' && tok.ch !== '/')) {
        return left;
      }
      this.next();
      const right = this.parseFactor();
      if (tok.ch === '*') {
        if (left.type === 'len' && right.type === 'len') {
          throw new WidthParseError(
            'layout/invalid-width',
            "'*' requires at least one plain-number operand"
          );
        }
        left = {
          type: left.type === 'len' || right.type === 'len' ? 'len' : 'num',
          v: left.v * right.v,
        };
      } else {
        if (right.type !== 'num') {
          throw new WidthParseError(
            'layout/invalid-width',
            "'/' requires a plain-number divisor"
          );
        }
        if (right.v === 0) {
          throw new WidthParseError(
            'layout/invalid-width',
            'Division by zero in width expression'
          );
        }
        left = { type: left.type, v: left.v / right.v };
      }
    }
  }

  /** factor := ('+'|'-')? atom */
  private parseFactor(): Operand {
    const tok = this.peek();
    if (tok && tok.t === 'punct' && (tok.ch === '+' || tok.ch === '-')) {
      this.next();
      const operand = this.parseFactor();
      return tok.ch === '-' ? { ...operand, v: -operand.v } : operand;
    }
    return this.parseAtom();
  }

  /** atom := NUMBER[unit] | '(' sum ')' | func */
  private parseAtom(): Operand {
    const tok = this.next();
    if (!tok) {
      throw new WidthParseError(
        'layout/invalid-width',
        'Unexpected end of width expression'
      );
    }
    if (tok.t === 'number') return this.operandFromNumber(tok.v, tok.unit);
    if (tok.t === 'punct' && tok.ch === '(') {
      const inner = this.parseSum();
      this.expectPunct(')');
      return inner;
    }
    if (tok.t === 'ident') return this.parseFunction(tok.name);
    throw new WidthParseError(
      'layout/invalid-width',
      'Expected a value in width expression'
    );
  }

  /** calc(sum) | min(args) | max(args); unknown functions/keywords fail. */
  parseFunction(name: string): Operand {
    const lower = name.toLowerCase();
    if (lower !== 'calc' && lower !== 'min' && lower !== 'max') {
      throw new WidthParseError(
        'layout/invalid-width',
        `Unsupported keyword or function '${name}' in width expression`
      );
    }
    this.expectPunct('(');
    if (lower === 'calc') {
      const inner = this.parseSum();
      this.expectPunct(')');
      return inner;
    }
    // min()/max(): n-ary; each arg is a full sum. Bare-number args coerce
    // to px (core emits `min(100%, 250)` for a user-set numeric minWidth).
    const args: number[] = [];
    for (;;) {
      const arg = this.parseSum();
      args.push(arg.v);
      const tok = this.next();
      if (tok && tok.t === 'punct' && tok.ch === ',') continue;
      if (tok && tok.t === 'punct' && tok.ch === ')') break;
      throw new WidthParseError(
        'layout/invalid-width',
        `Expected ',' or ')' in ${lower}()`
      );
    }
    return {
      type: 'len',
      v: lower === 'min' ? Math.min(...args) : Math.max(...args),
    };
  }
}

function sanitizeBase(base: number): number {
  return Number.isFinite(base) && base > 0 ? base : 0;
}

/**
 * Evaluate one width value against a percent base (dp). Never throws.
 * Exported for reuse (design, D4): 1.1's `survey.renderedWidth`, 1.7's
 * `questionTitleWidth`. The result is unrounded and unclamped —
 * used-value clamping (negative → 0) happens in `resolveWidthStyle`.
 */
export function evaluateWidthExpression(
  raw: unknown,
  percentBase: number
): WidthValue {
  if (raw === null || raw === undefined) return { kind: 'unset' };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return {
        kind: 'invalid',
        diagnostic: {
          code: 'layout/invalid-width',
          value: String(raw),
          message: 'Width must be a finite number',
        },
      };
    }
    return { kind: 'dp', dp: raw };
  }
  if (typeof raw !== 'string') {
    return {
      kind: 'invalid',
      diagnostic: {
        code: 'layout/invalid-width',
        value: String(raw),
        message: `Unsupported width value of type ${typeof raw}`,
      },
    };
  }
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'unset' };
  if (/^auto$/i.test(trimmed)) return { kind: 'auto' };
  try {
    const parser = new Parser(tokenize(trimmed), sanitizeBase(percentBase));
    // Top level is a single component (CSS allows no arithmetic outside
    // calc(); core never emits it): NUMBER[unit] or a function value.
    const result = parser.parseSingleComponent();
    if (!Number.isFinite(result.v)) {
      throw new WidthParseError(
        'layout/invalid-width',
        'Width expression did not resolve to a finite number'
      );
    }
    // A dimensionless top-level result is px — core's own bare-number
    // convention (getRenderedWidthFromWidth).
    return { kind: 'dp', dp: result.v };
  } catch (error) {
    const isParseError = error instanceof WidthParseError;
    return {
      kind: 'invalid',
      diagnostic: {
        code: isParseError ? error.code : 'layout/invalid-width',
        value: raw,
        message: isParseError
          ? error.message
          : 'Failed to parse width expression',
      },
    };
  }
}

/**
 * Translate one live `rootStyle` object (either upstream shape — see the
 * design's "Verified upstream facts") into all-numeric RN styles.
 * `flexGrow`/`flexShrink` pass through when numeric (the grid branch's
 * `flexShrink: 0` must survive); `flexBasis`/`minWidth`/`maxWidth`
 * evaluate through the grammar; `auto`/unset/failed values are OMITTED
 * (never defaulted), and failures surface as returned diagnostics.
 */
export function resolveWidthStyle(
  rootStyle: unknown,
  ctx: WidthContext
): WidthResolution {
  const style: ResolvedWidthStyle = {};
  const diagnostics: WidthDiagnostic[] = [];
  if (rootStyle === null || typeof rootStyle !== 'object') {
    return { style, diagnostics };
  }
  const source = rootStyle as Record<string, unknown>;
  const percentBase = sanitizeBase(ctx.percentBase);

  for (const key of ['flexGrow', 'flexShrink'] as const) {
    const v = source[key];
    if (typeof v === 'number' && Number.isFinite(v)) style[key] = v;
  }
  for (const property of ['flexBasis', 'minWidth', 'maxWidth'] as const) {
    const result = evaluateWidthExpression(source[property], percentBase);
    if (result.kind === 'dp') {
      // CSS used-value clamping: negative lengths floor at 0.
      style[property] = Math.max(0, result.dp);
    } else if (result.kind === 'invalid') {
      diagnostics.push({ ...result.diagnostic, property });
    }
    // 'auto' / 'unset' → property omitted.
  }
  return { style, diagnostics };
}

/**
 * Resolve every visible element of a row. Owns the ONE place the DOM
 * gutter-parity rule lives (design, D3/D4): multi-element rows resolve
 * `%` against rowWidth + gutter; single-element rows against rowWidth.
 * `isMultiple` mirrors `getRowCss`'s `rowMultiple` rule
 * (`visibleElements.length > 1`).
 */
export function resolveRowWidths<E extends object>(
  row: RowLike<E>,
  ctx: RowWidthContext
): RowWidthResolution<E> {
  const rowWidth = sanitizeBase(ctx.rowWidth);
  const gutter = sanitizeBase(ctx.gutter ?? 0);
  const visibleElements = row.visibleElements ?? [];
  const isMultiple = visibleElements.length > 1;
  const percentBase = isMultiple ? rowWidth + gutter : rowWidth;
  return {
    isMultiple,
    percentBase,
    elements: visibleElements.map((element) => ({
      element,
      ...resolveWidthStyle((element as { rootStyle?: unknown }).rootStyle, {
        percentBase,
      }),
    })),
  };
}
