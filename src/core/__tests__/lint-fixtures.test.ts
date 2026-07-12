/**
 * @jest-environment node
 */

// Case 6 (design: docs/design/0.3-core-facade.md, test plan #6). Every
// survey-core escape hatch outside `src/core/facade.ts` must fail lint
// (`no-restricted-imports` for static/type/subpath imports and re-exports,
// `no-restricted-syntax` for `require`/`require.resolve`/dynamic
// `import()`); the facade itself must pass. Exercises the REAL flat config
// (`eslint.config.mjs`) via ESLint's low-level `Linter#verify` API, so this
// is a regression test of the actual project configuration rather than a
// hand-rolled copy of it.
//
// `eslint.config.mjs` is a real ES module with no CommonJS build, and
// Jest's sandboxed VM refuses dynamic `import()` of it ("A dynamic import
// callback was invoked without --experimental-vm-modules") regardless of
// how the `import()` call is constructed. Rather than changing Jest's
// module system project-wide for one test, this runs the check in a plain
// `node` child process (outside Jest's VM), the same pattern the packaged
// suite (`test:packaged`) uses for its own real-ESM proof.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const CONSUMER_FILENAME = join(REPO_ROOT, 'src', 'core', 'some-consumer.ts');
const FACADE_FILENAME = join(REPO_ROOT, 'src', 'core', 'facade.ts');

interface LintCase {
  name: string;
  code: string | null;
  filename: string;
}

interface LintResult {
  name: string;
  messages: Array<{ ruleId: string | null; message: string }>;
}

function runEslintChecks(cases: LintCase[]): LintResult[] {
  const script = `
    import { readFileSync } from 'node:fs';
    import { Linter } from 'eslint';
    const configModule = await import(${JSON.stringify(
      join(REPO_ROOT, 'eslint.config.mjs')
    )});
    const config = configModule.default;
    const linter = new Linter();
    const cases = ${JSON.stringify(cases)};
    const results = cases.map(({ name, code, filename }) => {
      const source = code === null ? readFileSync(filename, 'utf8') : code;
      const messages = linter
        .verify(source, config, { filename })
        .map((message) => ({ ruleId: message.ruleId, message: message.message }));
      return { name, messages };
    });
    process.stdout.write(JSON.stringify(results));
  `;

  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );

  return JSON.parse(stdout) as LintResult[];
}

describe('ESLint enforcement — survey-core escape hatches (case 6)', () => {
  const escapeHatchCases: LintCase[] = [
    {
      name: 'static import',
      code: "import { Model } from 'survey-core';\nexport { Model };\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'type-only import',
      code: "import type { ITheme } from 'survey-core';\nexport type T = ITheme;\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'subpath import',
      code: "import 'survey-core/themes';\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 're-export',
      code: "export { Model } from 'survey-core';\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'require',
      code: "const surveyCore = require('survey-core');\nexport default surveyCore;\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'require (template literal)',
      code: 'const surveyCore = require(`survey-core`);\nexport default surveyCore;\n',
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'require.resolve',
      code: "const resolved = require.resolve('survey-core');\nexport default resolved;\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'require.resolve (template literal)',
      code: 'const resolved = require.resolve(`survey-core`);\nexport default resolved;\n',
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'dynamic import',
      code: "export const pending = import('survey-core');\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'dynamic import (template literal)',
      code: 'export const pending = import(`survey-core`);\n',
      filename: CONSUMER_FILENAME,
    },
  ];

  const SURVEY_CORE_RESTRICTION_RULE_IDS = new Set([
    'no-restricted-imports',
    'no-restricted-syntax',
  ]);

  let results: LintResult[];

  beforeAll(() => {
    results = runEslintChecks([
      ...escapeHatchCases,
      { name: 'facade', code: null, filename: FACADE_FILENAME },
    ]);
  });

  it.each(escapeHatchCases.map((c) => c.name))(
    '%s outside the facade fails lint on the survey-core restriction specifically',
    (name) => {
      const result = results.find((r) => r.name === name);
      // Must be flagged by no-restricted-imports/no-restricted-syntax
      // specifically — not just "some lint rule fired" (e.g. prettier or
      // no-unused-vars on the fixture snippet), which would let this test
      // pass without actually proving the survey-core rule caught it.
      expect(
        result?.messages.some((message) =>
          message.ruleId
            ? SURVEY_CORE_RESTRICTION_RULE_IDS.has(message.ruleId)
            : false
        )
      ).toBe(true);
    }
  );

  it('facade.ts itself is not flagged by the survey-core import restriction', () => {
    const result = results.find((r) => r.name === 'facade');
    const surveyCoreRestrictionMessages = (result?.messages ?? []).filter(
      (message) =>
        message.ruleId === 'no-restricted-imports' ||
        message.ruleId === 'no-restricted-syntax'
    );

    expect(surveyCoreRestrictionMessages).toEqual([]);
  });
});
