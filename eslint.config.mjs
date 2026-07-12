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
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'survey-core', message: SURVEY_CORE_IMPORT_MESSAGE },
          ],
          patterns: [
            { group: ['survey-core/*'], message: SURVEY_CORE_IMPORT_MESSAGE },
          ],
        },
      ],
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
    ignores: ['node_modules/', 'lib/'],
  },
]);
