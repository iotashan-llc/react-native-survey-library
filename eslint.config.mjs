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
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/facade.ts'],
    rules: {
      'no-restricted-imports': ['error', SURVEY_CORE_RESTRICTED_IMPORTS],
      'no-restricted-syntax': [
        'error',
        {
          selector: `CallExpression[callee.name='require'][arguments.0.value=/${SURVEY_CORE_SPECIFIER_PATTERN}/]`,
          message: `require('survey-core') is not allowed outside the facade. ${SURVEY_CORE_IMPORT_MESSAGE}`,
        },
        // `require(`survey-core`)` — a no-substitution template literal —
        // is a distinct AST shape (TemplateLiteral, not Literal) from
        // `require('survey-core')` and needs its own selector, or it
        // bypasses the rule above entirely.
        {
          selector: `CallExpression[callee.name='require'][arguments.0.quasis.0.value.cooked=/${SURVEY_CORE_SPECIFIER_PATTERN}/]`,
          message: `require(\`survey-core\`) is not allowed outside the facade. ${SURVEY_CORE_IMPORT_MESSAGE}`,
        },
        {
          selector: `CallExpression[callee.object.name='require'][callee.property.name='resolve'][arguments.0.value=/${SURVEY_CORE_SPECIFIER_PATTERN}/]`,
          message: `require.resolve('survey-core') is not allowed outside the facade. ${SURVEY_CORE_IMPORT_MESSAGE}`,
        },
        {
          selector: `CallExpression[callee.object.name='require'][callee.property.name='resolve'][arguments.0.quasis.0.value.cooked=/${SURVEY_CORE_SPECIFIER_PATTERN}/]`,
          message: `require.resolve(\`survey-core\`) is not allowed outside the facade. ${SURVEY_CORE_IMPORT_MESSAGE}`,
        },
        {
          selector: `ImportExpression[source.value=/${SURVEY_CORE_SPECIFIER_PATTERN}/]`,
          message: `Dynamic import('survey-core') is not allowed outside the facade. ${SURVEY_CORE_IMPORT_MESSAGE}`,
        },
        {
          selector: `ImportExpression[source.quasis.0.value.cooked=/${SURVEY_CORE_SPECIFIER_PATTERN}/]`,
          message: `Dynamic import(\`survey-core\`) is not allowed outside the facade. ${SURVEY_CORE_IMPORT_MESSAGE}`,
        },
      ],
    },
  },
  {
    // Design: docs/design/0.6-theme-core.md, "Module layout" — theme-core
    // is pure TS with ZERO `react-native` imports (theme-rn, 0.7, is where
    // tokens become StyleSheet). This block's `files` glob is a SUBSET of
    // the general `src/**/*.{ts,tsx}` block above, and ESLint flat config
    // merges same-named rules per matching config object by REPLACING the
    // earlier value, not deep-merging paths/patterns arrays — so the
    // survey-core restriction has to be re-included here too, or a
    // theme-core file would silently lose it.
    files: ['src/theme-core/**/*.{ts,tsx}'],
    rules: {
      // `no-restricted-imports` accepts only ONE options object per
      // `rules` entry (not one-per-array-item), so both restrictions are
      // merged into a single paths/patterns list here.
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
    },
  },
  {
    ignores: ['node_modules/', 'lib/'],
  },
]);
