#!/usr/bin/env node
/**
 * SCSS default-cascade extractor (design: docs/design/0.6-theme-core.md,
 * "Default-table contract" + test plan #2). Independently parses
 * `var(--sjs-*, <fallback>)` fallback chains out of the reference
 * checkout's `survey-core/src/default-theme/*.scss` and emits a committed
 * fixture (`src/theme-core/__fixtures__/scss-defaults.json`).
 *
 * The fixture is the TEST-ONLY oracle: the shipped registry data
 * (`src/theme-core/registry-data.ts`, generated once by
 * `scripts/generate-registry-data.mjs` and maintained in TS) never
 * imports it — `src/theme-core/__tests__/registry-vs-fixture.test.ts`
 * exhaustively compares the two INDEPENDENT artifacts so the registry
 * can't silently drift from the actual SCSS cascade. This script (plus
 * the fixture) is re-run and re-reviewed whenever the survey-core version
 * band bumps.
 *
 * Scope, mirroring the design's own accounting:
 *  - `variables.scss` is authoritative: every top-level `$name: var(--sjs-x,
 *    fallback);` declaration is captured, with `#{$scssVar}` interpolations
 *    inside the fallback expanded (recursively, against the same file's
 *    `$name: value;` table) so the emitted `rawDefault` is a pure
 *    `--sjs-*`/literal expression with no residual SCSS syntax.
 *  - Every OTHER `default-theme/**\/*.scss` file (mixins.scss's article
 *    font-size hooks, blocks/header.scss's context-dependent header
 *    colors, etc.) is also scanned for `prop: var(--sjs-x, fallback);`
 *    occurrences. A name already captured from variables.scss is not
 *    overwritten (variables.scss wins), but ALL occurrences (not just the
 *    first) are recorded per name in `occurrences`, because some names
 *    (the header title/description colors) are legitimately declared with
 *    DIFFERENT fallbacks under different selector contexts (normal vs.
 *    `.sv-header__background-color--accent`) — the registry's
 *    context-dependent entries are checked against the occurrence set, not
 *    a single positional value.
 *  - A `"none"`/`"normal"`-style stray-quoted SCSS-authoring artifact
 *    around an otherwise-bare CSS keyword fallback (e.g. mixins.scss's
 *    `var(--sjs-article-font-xx-large-textDecoration, "none")`) is
 *    unwrapped to the bare keyword — CSS treats the quoted form as an
 *    invalid declaration and falls back to the property's initial value,
 *    which for every keyword defaulted this way happens to equal the
 *    unwrapped keyword, so this normalization preserves cascade parity.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const REFERENCE_DEFAULT_THEME_DIR =
  process.env.SURVEY_CORE_DEFAULT_THEME_DIR ||
  join(
    REPO_ROOT,
    '..',
    'survey-library',
    'packages',
    'survey-core',
    'src',
    'default-theme'
  );

const OUTPUT_PATH = join(
  REPO_ROOT,
  'src',
  'theme-core',
  '__fixtures__',
  'scss-defaults.json'
);

function listScssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listScssFiles(full));
    } else if (entry.endsWith('.scss')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Expands SASS's 2-arg `rgba(<hex-color>, <alpha>)` convenience overload
 * (a color-mixing function that resolves at SCSS-compile time, distinct
 * from CSS's native `rgba(r, g, b, a)`) into real numeric-channel CSS —
 * `rgba(#fff, 0.25)` -> `rgba(255, 255, 255, 0.25)`. Without this, the
 * SASS-only source text would (correctly) fail the resolver's CSS-only
 * color grammar and get flagged as invalid even on the totally-default
 * (no theme) resolution path. Only the hex-color form is needed — that's
 * the only 2-arg-rgba shape `variables.scss` actually uses.
 */
function expandSassRgbaHexShorthand(value) {
  return value.replace(
    /rgba\(\s*#([0-9a-fA-F]{3,6})\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g,
    (whole, hex, alpha) => {
      const expand = (pair) =>
        pair.length === 1 ? parseInt(pair + pair, 16) : parseInt(pair, 16);
      let r;
      let g;
      let b;
      if (hex.length === 3) {
        r = expand(hex[0]);
        g = expand(hex[1]);
        b = expand(hex[2]);
      } else if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        return whole;
      }
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  );
}

/** Strip a matched pair of enclosing double quotes around a bare keyword. */
function unwrapStrayQuotes(rawValue) {
  const trimmed = expandSassRgbaHexShorthand(normalizeWhitespace(rawValue));
  if (
    trimmed.length >= 2 &&
    trimmed.startsWith('"') &&
    trimmed.endsWith('"') &&
    trimmed.indexOf('"', 1) === trimmed.length - 1
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Collapses runs of whitespace/newlines (from multi-line SCSS var() calls) to single spaces. */
function normalizeWhitespace(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

/**
 * Splits a `var(...)`-call's argument list at the first TOP-LEVEL comma
 * (paren-depth-aware), returning [varName, fallbackOrUndefined].
 */
function splitVarArgs(argsText) {
  let depth = 0;
  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      return [argsText.slice(0, i).trim(), argsText.slice(i + 1).trim()];
    }
  }
  return [argsText.trim(), undefined];
}

/** Finds the matching close-paren index for the '(' at openIndex. */
function findMatchingParen(text, openIndex) {
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
 * Finds every top-level `var(--sjs-NAME[, fallback])` call in `text` and
 * returns [{ name, fallback }]. Nested var() calls inside a fallback are
 * left untouched (the resolver dereferences those at runtime) — the
 * extractor only needs each variable's OWN immediate declaration.
 */
function findVarCalls(text) {
  const calls = [];
  const re = /var\(\s*(--sjs-[a-zA-Z0-9-]+)\s*(,)?/g;
  let match;
  while ((match = re.exec(text))) {
    const openIndex = text.indexOf('(', match.index);
    const closeIndex = findMatchingParen(text, openIndex);
    if (closeIndex === -1) continue;
    const inner = text.slice(openIndex + 1, closeIndex);
    const [name, fallback] = splitVarArgs(inner);
    calls.push({ name, fallback, start: match.index, end: closeIndex + 1 });
  }
  return calls;
}

/** Builds the `$scssName -> rawValue` table from variables.scss. */
function buildScssVarTable(source) {
  const table = new Map();
  const lines = source.split('\n');
  let acc = '';
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (acc === '' && /^\s*\$[a-zA-Z0-9-]+\s*:/.test(line)) {
      startLine = i;
    }
    if (startLine !== -1) {
      acc += line + '\n';
      if (/;\s*$/.test(line)) {
        const m = acc.match(/^\s*\$([a-zA-Z0-9-]+)\s*:\s*([\s\S]*);\s*$/);
        if (m) {
          table.set(m[1], { value: m[2].trim(), line: startLine + 1 });
        }
        acc = '';
        startLine = -1;
      }
    }
  }
  return table;
}

/**
 * Recursively expands SCSS `$name` references against `scssVarTable` —
 * both string-interpolated (`#{$name}`, used inline in a larger literal)
 * and bare (`$name` used directly as a function-argument VALUE, e.g.
 * `var(--sjs-x, $font-size)`; SCSS substitutes the value with no `#{}`
 * needed there) — plus the one SCSS FUNCTION interpolation the
 * default-theme sources actually use, `#{calcSize(m)}` (variables.scss's
 * calcSize emits `calc(m * (#{$base-unit}))`, or the bare base-unit chain
 * when m === 1). Any other residual Sass construct fails the
 * generation-time validation in main() rather than leaking into the
 * fixture.
 */
function expandInterpolations(value, scssVarTable, depth = 0, seen = new Set()) {
  if (depth > 10) return value;
  value = value.replace(
    /#\{calcSize\(\s*(-?\d+(?:\.\d+)?)\s*\)\}/g,
    (_whole, multiplier) => {
      const baseUnitEntry = scssVarTable.get('base-unit');
      const baseChain = baseUnitEntry
        ? expandInterpolations(
            baseUnitEntry.value,
            scssVarTable,
            depth + 1,
            seen
          )
        : 'var(--sjs-base-unit, var(--base-unit, 8px))';
      return Number(multiplier) === 1
        ? baseChain
        : `calc(${multiplier} * (${baseChain}))`;
    }
  );
  return value.replace(
    /#\{\$([a-zA-Z0-9-]+)\}|\$([a-zA-Z0-9-]+)/g,
    (whole, braced, bare) => {
      const name = braced || bare;
      if (seen.has(name)) return whole;
      const entry = scssVarTable.get(name);
      if (!entry) return whole;
      return expandInterpolations(
        entry.value,
        scssVarTable,
        depth + 1,
        new Set([...seen, name])
      );
    }
  );
}

function extractFromVariablesScss(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const scssVarTable = buildScssVarTable(source);
  const results = new Map();
  for (const [, entry] of scssVarTable) {
    const calls = findVarCalls(entry.value);
    for (const call of calls) {
      // A FALLBACKLESS reference (e.g. var(--sjs-default-font-family)) is
      // still a consumed variable — recorded with rawDefault null so the
      // registry covers it (codex review major 3); a with-fallback
      // occurrence elsewhere upgrades it.
      const expanded =
        call.fallback === undefined
          ? null
          : unwrapStrayQuotes(
              expandInterpolations(call.fallback, scssVarTable)
            );
      const existing = results.get(call.name);
      if (!existing || (existing.rawDefault === null && expanded !== null)) {
        results.set(call.name, {
          name: call.name,
          rawDefault: expanded,
          file: 'variables.scss',
          line: entry.line,
        });
      }
    }
  }
  return results;
}

function extractFromOtherScss(filePath, relPath, scssVarTable) {
  const source = readFileSync(filePath, 'utf8');
  const lines = source.split('\n');
  const found = [];
  lines.forEach((line, idx) => {
    const calls = findVarCalls(line);
    for (const call of calls) {
      found.push({
        name: call.name,
        rawDefault:
          call.fallback === undefined
            ? null
            : unwrapStrayQuotes(
                expandInterpolations(call.fallback, scssVarTable)
              ),
        file: relPath,
        line: idx + 1,
      });
    }
  });
  return found;
}

/**
 * LHS custom-property DECLARATIONS (`--sjs-x: value;`) — e.g.
 * variables.scss's `:root { --sjs-transition-duration: 150ms; }` and the
 * slider/paneldynamic runtime-machinery declarations in blocks/*.scss. A
 * declared value IS the cascade's value when no theme sets the name, so a
 * declaration outranks any var()-fallback occurrence as the primary
 * default (codex review major 3).
 */
function extractLhsDeclarations(filePath, relPath, scssVarTable) {
  const source = readFileSync(filePath, 'utf8');
  const lines = source.split('\n');
  const found = [];
  const re = /^\s*(--sjs-[a-zA-Z0-9-]+)\s*:\s*([^;]+);/;
  lines.forEach((line, idx) => {
    const m = line.match(re);
    if (!m) return;
    found.push({
      name: m[1],
      rawDefault: unwrapStrayQuotes(
        expandInterpolations(m[2], scssVarTable)
      ),
      file: relPath,
      line: idx + 1,
      isDeclaration: true,
    });
  });
  return found;
}

/**
 * A bare `color: $scssVarName;` declaration (no literal `var(--sjs-...`
 * call on that line) that references a `--sjs-*`-backed SCSS variable —
 * e.g. blocks/header.scss's `color: $font-headerdescription-color;` in the
 * accent-header context. Expands to that SCSS variable's OWN top-level
 * default (its `variables.scss` `var(--sjs-x, fallback)` declaration),
 * which is exactly the value the cascade produces here.
 */
function extractBareScssVarRefs(filePath, relPath, scssVarTable, primary) {
  const source = readFileSync(filePath, 'utf8');
  const lines = source.split('\n');
  const found = [];
  const re = /:\s*\$([a-zA-Z0-9-]+)\s*;/g;
  lines.forEach((line, idx) => {
    if (line.includes('var(')) return;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line))) {
      const scssName = m[1];
      const entry = scssVarTable.get(scssName);
      if (!entry) continue;
      const calls = findVarCalls(entry.value);
      const sjsCall = calls.find((c) => c.fallback !== undefined);
      if (!sjsCall || !primary.has(sjsCall.name)) continue;
      found.push({
        name: sjsCall.name,
        rawDefault: primary.get(sjsCall.name).rawDefault,
        file: relPath,
        line: idx + 1,
      });
    }
  });
  return found;
}

function main() {
  const files = listScssFiles(REFERENCE_DEFAULT_THEME_DIR);
  const variablesScssPath = files.find((f) => f.endsWith('variables.scss'));
  if (!variablesScssPath) {
    throw new Error(
      `variables.scss not found under ${REFERENCE_DEFAULT_THEME_DIR}`
    );
  }

  const primary = extractFromVariablesScss(variablesScssPath);
  const scssVarTable = buildScssVarTable(readFileSync(variablesScssPath, 'utf8'));
  const occurrences = new Map();
  const declarations = new Map();
  for (const [name, entry] of primary) {
    occurrences.set(name, [entry]);
  }

  for (const file of files) {
    const relPath = relative(REFERENCE_DEFAULT_THEME_DIR, file).replace(
      /\\/g,
      '/'
    );
    const found = [
      ...extractLhsDeclarations(file, relPath, scssVarTable),
      ...(file === variablesScssPath
        ? []
        : [
            ...extractFromOtherScss(file, relPath, scssVarTable),
            ...extractBareScssVarRefs(file, relPath, scssVarTable, primary),
          ]),
    ];
    for (const entry of found) {
      const list = occurrences.get(entry.name) || [];
      list.push(entry);
      occurrences.set(entry.name, list);
      if (entry.isDeclaration && !declarations.has(entry.name)) {
        declarations.set(entry.name, entry);
      }
    }
  }

  // Second pass: legacy (non-`--sjs-`) alias edges, e.g. `--primary`,
  // `--base-unit`, `--font-family` — never declared with their own
  // `$name: var(--alias, ...)` line; they only ever appear NESTED inside
  // an `--sjs-*` variable's own fallback chain (that nesting IS their
  // definition — the terminal literal the alias resolves to when neither
  // the `--sjs-*` name nor the alias itself is set). Discovered by
  // scanning every already-extracted `rawDefault` for a nested
  // `var(--nonSjsName, ...)` and lifting that nested call's own fallback
  // out as the alias's default.
  const aliasRe = /var\(\s*(--(?!sjs-)[a-zA-Z0-9-]+)\s*,\s*/g;
  for (const [name, entry] of primary) {
    let m;
    aliasRe.lastIndex = 0;
    while ((m = aliasRe.exec(entry.rawDefault))) {
      const aliasName = m[1];
      if (occurrences.has(aliasName)) continue;
      const openIndex = entry.rawDefault.indexOf('(', m.index);
      const closeIndex = findMatchingParen(entry.rawDefault, openIndex);
      const inner = entry.rawDefault.slice(openIndex + 1, closeIndex);
      const [, aliasFallback] = splitVarArgs(inner);
      if (aliasFallback === undefined) continue;
      occurrences.set(aliasName, [
        {
          name: aliasName,
          rawDefault: unwrapStrayQuotes(aliasFallback),
          file: `derived:${name}`,
          line: entry.line,
        },
      ]);
    }
  }

  const names = [...occurrences.keys()].sort();
  const fixture = {
    generatedAt: '<git-tracked, non-deterministic field intentionally omitted>',
    sourceDir: relative(REPO_ROOT, REFERENCE_DEFAULT_THEME_DIR).replace(
      /\\/g,
      '/'
    ),
    variables: names.map((name) => {
      const list = occurrences.get(name);
      // Primary priority: an LHS DECLARATION (the cascade value when
      // nothing sets the name) > variables.scss's canonical fallback >
      // the first with-fallback occurrence anywhere > null (fallbackless
      // consumption only).
      const variablesScssEntry = primary.get(name);
      const primaryEntry =
        declarations.get(name) ||
        (variablesScssEntry && variablesScssEntry.rawDefault !== null
          ? variablesScssEntry
          : undefined) ||
        list.find((e) => e.rawDefault !== null) ||
        list[0];
      return {
        name,
        rawDefault: primaryEntry.rawDefault,
        source: `${primaryEntry.file}:${primaryEntry.line}`,
        occurrences: list.map((e) => ({
          rawDefault: e.rawDefault,
          source: `${e.file}:${e.line}`,
        })),
      };
    }),
  };

  validate(fixture, files);

  writeFileSync(OUTPUT_PATH, JSON.stringify(fixture, null, 2) + '\n');
  console.log(
    `Extracted ${fixture.variables.length} variables (${fixture.variables.filter((v) => v.name.startsWith('--sjs-')).length} --sjs-*, ${fixture.variables.filter((v) => v.rawDefault === null).length} fallbackless) -> ${relative(REPO_ROOT, OUTPUT_PATH)}`
  );
}

/**
 * Generation-time validation (codex review major 3):
 *  1. Residual-Sass check — no emitted default may still contain `#{...}`
 *     interpolation or a `$name` reference.
 *  2. Completeness check — the emitted `--sjs-*` name set must EQUAL an
 *     independently grep-derived set of every `var(--sjs-...)` use and
 *     every `--sjs-...:` LHS declaration across the scanned tree.
 * Any failure throws: a fixture must never be committed with silently
 * dropped or half-parsed entries.
 */
function validate(fixture, files) {
  const residual = [];
  for (const v of fixture.variables) {
    for (const occ of v.occurrences) {
      if (occ.rawDefault === null) continue;
      if (/#\{/.test(occ.rawDefault) || /\$[a-zA-Z]/.test(occ.rawDefault)) {
        residual.push(`${v.name} @ ${occ.source}: ${occ.rawDefault}`);
      }
    }
  }
  if (residual.length > 0) {
    throw new Error(
      `Residual Sass constructs in emitted defaults:\n${residual.join('\n')}`
    );
  }

  const grepNames = new Set();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/var\(\s*(--sjs-[a-zA-Z0-9-]+)/g)) {
      grepNames.add(m[1]);
    }
    for (const m of source.matchAll(/^\s*(--sjs-[a-zA-Z0-9-]+)\s*:/gm)) {
      grepNames.add(m[1]);
    }
  }
  const emitted = new Set(
    fixture.variables.map((v) => v.name).filter((n) => n.startsWith('--sjs-'))
  );
  const missing = [...grepNames].filter((n) => !emitted.has(n)).sort();
  const extra = [...emitted].filter((n) => !grepNames.has(n)).sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `--sjs-* name-set mismatch vs grep-derived ground truth.\nMissing from fixture: ${JSON.stringify(missing)}\nUnaccounted in fixture: ${JSON.stringify(extra)}`
    );
  }
}

main();
