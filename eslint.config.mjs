import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

// Design: docs/design/0.3-core-facade.md. `survey-core` must only ever be
// touched from `src/core/facade.ts` (which applies the env shim before
// pulling survey-core in) — everywhere else in this library imports it
// through that facade, or through the `./shim` subpath for the
// model-first import-order contract.
const SURVEY_CORE_IMPORT_MESSAGE =
  "Import survey-core through './core/facade' (or the './shim' subpath for the model-first import-order contract) — never directly. See docs/design/0.3-core-facade.md.";
// esquery's selector-regex syntax (used by no-restricted-syntax below)
// delimits the pattern with unescaped `/` characters, so the `/` inside
// the subpath group has to be backslash-escaped here.
const SURVEY_CORE_SPECIFIER_PATTERN = '^survey-core(\\/.*)?$';

const SURVEY_CORE_RESTRICTED_IMPORTS = {
  paths: [{ name: 'survey-core', message: SURVEY_CORE_IMPORT_MESSAGE }],
  patterns: [
    { group: ['survey-core/*'], message: SURVEY_CORE_IMPORT_MESSAGE },
  ],
};

/**
 * The full non-static escape-hatch selector family for a module specifier
 * pattern: require('x'), require(`x`), require.resolve both forms, and
 * dynamic import() both forms. Same shapes the survey-core restriction
 * enumerates; extracted so the theme-core react-native ban reuses them
 * (codex review minor 12).
 */
function restrictedSyntaxSelectorsFor(pattern, subject, message) {
  return [
    {
      selector: `CallExpression[callee.name='require'][arguments.0.value=/${pattern}/]`,
      message: `require('${subject}') is not allowed here. ${message}`,
    },
    {
      selector: `CallExpression[callee.name='require'][arguments.0.quasis.0.value.cooked=/${pattern}/]`,
      message: `require(\`${subject}\`) is not allowed here. ${message}`,
    },
    {
      selector: `CallExpression[callee.object.name='require'][callee.property.name='resolve'][arguments.0.value=/${pattern}/]`,
      message: `require.resolve('${subject}') is not allowed here. ${message}`,
    },
    {
      selector: `CallExpression[callee.object.name='require'][callee.property.name='resolve'][arguments.0.quasis.0.value.cooked=/${pattern}/]`,
      message: `require.resolve(\`${subject}\`) is not allowed here. ${message}`,
    },
    {
      selector: `ImportExpression[source.value=/${pattern}/]`,
      message: `Dynamic import('${subject}') is not allowed here. ${message}`,
    },
    {
      selector: `ImportExpression[source.quasis.0.value.cooked=/${pattern}/]`,
      message: `Dynamic import(\`${subject}\`) is not allowed here. ${message}`,
    },
  ];
}

const SURVEY_CORE_RESTRICTED_SYNTAX = restrictedSyntaxSelectorsFor(
  SURVEY_CORE_SPECIFIER_PATTERN,
  'survey-core',
  SURVEY_CORE_IMPORT_MESSAGE
);

// Design: docs/design/0.6-theme-core.md, "Module layout" — theme-core is
// pure TS with ZERO `react-native` imports (theme-rn, 0.7, is where
// tokens become StyleSheet/Platform mappings).
const REACT_NATIVE_IMPORT_MESSAGE =
  'theme-core is pure TS with zero react-native imports (design: docs/design/0.6-theme-core.md, "Module layout"). StyleSheet/Platform mapping belongs in theme-rn (0.7).';
const REACT_NATIVE_RESTRICTED_IMPORTS = {
  paths: [{ name: 'react-native', message: REACT_NATIVE_IMPORT_MESSAGE }],
  patterns: [
    {
      group: ['react-native/*', 'react-native-*'],
      message: REACT_NATIVE_IMPORT_MESSAGE,
    },
  ],
};
// Matches 'react-native', 'react-native/<subpath>', and 'react-native-*'
// ecosystem packages ([\/-] = a subpath slash or a hyphenated package).
const REACT_NATIVE_SPECIFIER_PATTERN = '^react-native([\\/-].*)?$';
const REACT_NATIVE_RESTRICTED_SYNTAX = restrictedSyntaxSelectorsFor(
  REACT_NATIVE_SPECIFIER_PATTERN,
  'react-native',
  REACT_NATIVE_IMPORT_MESSAGE
);

// Design: docs/design/1.3-width-resolver.md, "ESLint purity fence" —
// the layout width resolver is pure TS with ZERO react-native imports
// (numbers in, numbers out; 1.4's components own onLayout/PixelRatio).
const LAYOUT_REACT_NATIVE_IMPORT_MESSAGE =
  'src/layout is pure TS with zero react-native imports (design: docs/design/1.3-width-resolver.md, "ESLint purity fence"). onLayout/PixelRatio wiring belongs in the 1.4 composition components.';
const LAYOUT_REACT_NATIVE_RESTRICTED_IMPORTS = {
  paths: [
    { name: 'react-native', message: LAYOUT_REACT_NATIVE_IMPORT_MESSAGE },
  ],
  patterns: [
    {
      group: ['react-native/*', 'react-native-*'],
      message: LAYOUT_REACT_NATIVE_IMPORT_MESSAGE,
    },
  ],
};
const LAYOUT_REACT_NATIVE_RESTRICTED_SYNTAX = restrictedSyntaxSelectorsFor(
  REACT_NATIVE_SPECIFIER_PATTERN,
  'react-native',
  LAYOUT_REACT_NATIVE_IMPORT_MESSAGE
);

// Design: docs/design/0.9-html-strategy.md, "Sequencing" — `@native-html/*`
// (the HTML renderer) is importable ONLY from the secured
// `<SanitizedHtml>` adapter (which always installs `renderersProps.a.
// onPress`, disables inline-CSS processing, and feeds the renderer the
// PRIVATE sanitized AST — never raw author HTML) or from its test
// fixtures. Everywhere else in the library must go through that adapter,
// the same seam the `survey-core` facade rule enforces above.
const NATIVE_HTML_IMPORT_MESSAGE =
  "Import '@native-html/*' only from './components/SanitizedHtml' (the secured adapter) — never directly. See docs/design/0.9-html-strategy.md.";
const NATIVE_HTML_SPECIFIER_PATTERN = '^@native-html\\/.*$';
const NATIVE_HTML_RESTRICTED_IMPORTS = {
  paths: [],
  patterns: [
    { group: ['@native-html/*'], message: NATIVE_HTML_IMPORT_MESSAGE },
  ],
};
const NATIVE_HTML_RESTRICTED_SYNTAX = restrictedSyntaxSelectorsFor(
  NATIVE_HTML_SPECIFIER_PATTERN,
  '@native-html/*',
  NATIVE_HTML_IMPORT_MESSAGE
);

// Design: docs/design/1.5-icon-actionbutton.md, "Dependencies, boundaries,
// gates" — `react-native-svg` (the icon-rendering capability peer) is
// importable ONLY from `src/components/RNIcon.tsx`, which lazy-requires it
// and feeds `SvgXml` exclusively resolved + trust-tier-sanitized markup.
// Everywhere else renders icons through `<RNIcon>` — the same seam pattern
// as the survey-core facade and @native-html/* rules above.
const RNSVG_IMPORT_MESSAGE =
  "Import 'react-native-svg' only from './components/RNIcon' (the icon adapter) — never directly. See docs/design/1.5-icon-actionbutton.md.";
const RNSVG_SPECIFIER_PATTERN = '^react-native-svg(\\/.*)?$';
const RNSVG_RESTRICTED_IMPORTS = {
  paths: [{ name: 'react-native-svg', message: RNSVG_IMPORT_MESSAGE }],
  patterns: [
    { group: ['react-native-svg/*'], message: RNSVG_IMPORT_MESSAGE },
  ],
};
const RNSVG_RESTRICTED_SYNTAX = restrictedSyntaxSelectorsFor(
  RNSVG_SPECIFIER_PATTERN,
  'react-native-svg',
  RNSVG_IMPORT_MESSAGE
);

export default defineConfig([
  {
    extends: fixupConfigRules(compat.extends('@react-native', 'prettier')),
    plugins: { prettier },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'prettier/prettier': 'error',
    },
  },
  {
    // Both the survey-core AND @native-html/* restrictions apply, MERGED
    // into a single rule value here — ESLint flat config REPLACES (not
    // deep-merges) a rule's value across matching config objects for the
    // same file, so two separate blocks each setting their own
    // `no-restricted-imports`/`no-restricted-syntax` on this same
    // `src/**/*.{ts,tsx}` glob would silently make the LATER block's
    // restriction the only one enforced, dropping the earlier one for
    // every file both blocks match. The per-file exceptions below (the
    // facade, the adapter, its fixtures) each re-narrow to just the ONE
    // restriction that should still apply there, in blocks that come
    // AFTER this one so they win.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.paths,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.paths,
            ...RNSVG_RESTRICTED_IMPORTS.paths,
          ],
          patterns: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.patterns,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.patterns,
            ...RNSVG_RESTRICTED_IMPORTS.patterns,
          ],
        },
      ],
      // Note: `require(`survey-core`)` — a no-substitution template
      // literal — is a distinct AST shape (TemplateLiteral, not Literal)
      // from `require('survey-core')`; restrictedSyntaxSelectorsFor emits
      // both shapes for every escape hatch.
      'no-restricted-syntax': [
        'error',
        ...SURVEY_CORE_RESTRICTED_SYNTAX,
        ...NATIVE_HTML_RESTRICTED_SYNTAX,
        ...RNSVG_RESTRICTED_SYNTAX,
      ],
    },
  },
  {
    // `src/core/facade.ts` is the one place survey-core may be imported
    // directly — re-narrow to the native-html + react-native-svg
    // restrictions here (still fully enforced; the facade has no business
    // touching either).
    files: ['src/core/facade.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...NATIVE_HTML_RESTRICTED_IMPORTS.paths,
            ...RNSVG_RESTRICTED_IMPORTS.paths,
          ],
          patterns: [
            ...NATIVE_HTML_RESTRICTED_IMPORTS.patterns,
            ...RNSVG_RESTRICTED_IMPORTS.patterns,
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...NATIVE_HTML_RESTRICTED_SYNTAX,
        ...RNSVG_RESTRICTED_SYNTAX,
      ],
    },
  },
  {
    // `<SanitizedHtml>` is the one place `@native-html/*` may be imported
    // — re-narrow to the survey-core + react-native-svg restrictions here
    // (still fully enforced; the adapter still must go through the facade
    // for any survey-core types it needs).
    files: [
      'src/components/SanitizedHtml.tsx',
      'src/components/__fixtures__/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.paths,
            ...RNSVG_RESTRICTED_IMPORTS.paths,
          ],
          patterns: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.patterns,
            ...RNSVG_RESTRICTED_IMPORTS.patterns,
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...SURVEY_CORE_RESTRICTED_SYNTAX,
        ...RNSVG_RESTRICTED_SYNTAX,
      ],
    },
  },
  {
    // `<RNIcon>` is the one place `react-native-svg` may be imported
    // (lazy-required; SvgXml only ever receives resolved + trust-tier-
    // sanitized markup) — re-narrow to the survey-core + native-html
    // restrictions here.
    files: ['src/components/RNIcon.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.paths,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.paths,
          ],
          patterns: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.patterns,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.patterns,
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...SURVEY_CORE_RESTRICTED_SYNTAX,
        ...NATIVE_HTML_RESTRICTED_SYNTAX,
      ],
    },
  },
  {
    // `ImageMapQuestion` (task 5.4) is the SECOND sanctioned
    // `react-native-svg` sink: it lazy-requires the shape primitives
    // (`Svg`/`Rect`/`Circle`/`Polygon`) to draw the tappable hotspot
    // overlay — a fundamentally geometric use, distinct from RNIcon's
    // sanitized-markup `SvgXml`. Re-narrow to the survey-core + native-html
    // restrictions here (same seam pattern as the RNIcon exception above).
    files: ['src/questions/ImageMapQuestion.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.paths,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.paths,
          ],
          patterns: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.patterns,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.patterns,
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...SURVEY_CORE_RESTRICTED_SYNTAX,
        ...NATIVE_HTML_RESTRICTED_SYNTAX,
      ],
    },
  },
  {
    // Design: docs/design/0.6-theme-core.md, "Module layout" — theme-core
    // is pure TS with ZERO `react-native` imports (theme-rn, 0.7, is where
    // tokens become StyleSheet). This block's `files` glob is a SUBSET of
    // the general `src/**/*.{ts,tsx}` blocks above, and ESLint flat config
    // merges same-named rules per matching config object by REPLACING the
    // earlier value, not deep-merging paths/patterns arrays — so the
    // survey-core AND native-html restrictions both have to be
    // re-included here too, or a theme-core file would silently lose them.
    files: ['src/theme-core/**/*.{ts,tsx}'],
    rules: {
      // `no-restricted-imports` accepts only ONE options object per
      // `rules` entry (not one-per-array-item), so all three restrictions
      // are merged into a single paths/patterns list here. Likewise
      // `no-restricted-syntax` REPLACES (not extends) the general blocks'
      // value for theme-core files, so every restriction's selectors must
      // be re-included (codex review minor 12: static imports alone left
      // require/require.resolve/import() escape hatches open).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.paths,
            ...REACT_NATIVE_RESTRICTED_IMPORTS.paths,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.paths,
          ],
          patterns: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.patterns,
            ...REACT_NATIVE_RESTRICTED_IMPORTS.patterns,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.patterns,
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...SURVEY_CORE_RESTRICTED_SYNTAX,
        ...REACT_NATIVE_RESTRICTED_SYNTAX,
        ...NATIVE_HTML_RESTRICTED_SYNTAX,
      ],
    },
  },
  {
    // Design: docs/design/1.3-width-resolver.md, "ESLint purity fence" —
    // src/layout is pure TS with ZERO react-native imports, same
    // directory-wide fence as theme-core above (and the same flat-config
    // caveat: this block REPLACES the general blocks' rule values for
    // layout files, so the survey-core and native-html restrictions must
    // be re-included or they'd silently vanish here).
    files: ['src/layout/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.paths,
            ...LAYOUT_REACT_NATIVE_RESTRICTED_IMPORTS.paths,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.paths,
          ],
          patterns: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.patterns,
            ...LAYOUT_REACT_NATIVE_RESTRICTED_IMPORTS.patterns,
            ...NATIVE_HTML_RESTRICTED_IMPORTS.patterns,
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...SURVEY_CORE_RESTRICTED_SYNTAX,
        ...LAYOUT_REACT_NATIVE_RESTRICTED_SYNTAX,
        ...NATIVE_HTML_RESTRICTED_SYNTAX,
      ],
    },
  },
  {
    // Design: docs/design/0.7-theme-rn.md, test plan #6 — "no
    // react-native import in bridge.ts" (the pure class-token extraction
    // engine; SCOPED TO THIS ONE FILE, unlike theme-core's directory-wide
    // ban — shadows.ts/recipes/provider.tsx in the same theme-rn/
    // directory legitimately need react-native for StyleSheet/Platform/
    // boxShadow types, so this can't be a `theme-rn/**` glob).
    files: ['src/theme-rn/bridge.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.paths,
            ...REACT_NATIVE_RESTRICTED_IMPORTS.paths,
          ],
          patterns: [
            ...SURVEY_CORE_RESTRICTED_IMPORTS.patterns,
            ...REACT_NATIVE_RESTRICTED_IMPORTS.patterns,
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...SURVEY_CORE_RESTRICTED_SYNTAX,
        ...REACT_NATIVE_RESTRICTED_SYNTAX,
      ],
    },
  },
  {
    ignores: ['node_modules/', 'lib/'],
  },
]);
