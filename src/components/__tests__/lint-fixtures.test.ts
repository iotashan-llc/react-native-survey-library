/**
 * @jest-environment node
 */

// Design: docs/design/0.9-html-strategy.md, "Sequencing" — `@native-html/*`
// is importable ONLY from the secured `<SanitizedHtml>` adapter (or its
// test fixtures). Every escape hatch outside those two locations must fail
// lint (`no-restricted-imports` for static/type/subpath imports and
// re-exports, `no-restricted-syntax` for `require`/`require.resolve`/
// dynamic `import()`); the adapter itself must pass. Mirrors
// `src/core/__tests__/lint-fixtures.test.ts`'s approach: exercises the
// REAL flat config (`eslint.config.mjs`) via ESLint's `Linter#verify` API
// in a plain `node` child process (Jest's sandboxed VM refuses dynamic
// `import()` of a real ESM config file).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const CONSUMER_FILENAME = join(
  REPO_ROOT,
  'src',
  'components',
  'some-consumer.ts'
);
const ADAPTER_FILENAME = join(
  REPO_ROOT,
  'src',
  'components',
  'SanitizedHtml.tsx'
);
const THEME_CORE_CONSUMER_FILENAME = join(
  REPO_ROOT,
  'src',
  'theme-core',
  'some-consumer.ts'
);

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

describe('ESLint enforcement — @native-html/* boundary (task 0.9)', () => {
  const escapeHatchCases: LintCase[] = [
    {
      name: 'static import',
      code: "import RenderHTML from '@native-html/render';\nexport { RenderHTML };\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'type-only import',
      code: "import type { RenderHTMLProps } from '@native-html/render';\nexport type T = RenderHTMLProps;\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'subpath import',
      code: "import '@native-html/transient-render-engine';\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 're-export',
      code: "export { default } from '@native-html/render';\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'require',
      code: "const nh = require('@native-html/render');\nexport default nh;\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'require (template literal)',
      code: 'const nh = require(`@native-html/render`);\nexport default nh;\n',
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'require.resolve',
      code: "const resolved = require.resolve('@native-html/render');\nexport default resolved;\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'require.resolve (template literal)',
      code: 'const resolved = require.resolve(`@native-html/render`);\nexport default resolved;\n',
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'dynamic import',
      code: "export const pending = import('@native-html/render');\n",
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'dynamic import (template literal)',
      code: 'export const pending = import(`@native-html/render`);\n',
      filename: CONSUMER_FILENAME,
    },
    {
      name: 'static import from theme-core',
      code: "import RenderHTML from '@native-html/render';\nexport { RenderHTML };\n",
      filename: THEME_CORE_CONSUMER_FILENAME,
    },
  ];

  const NATIVE_HTML_RESTRICTION_RULE_IDS = new Set([
    'no-restricted-imports',
    'no-restricted-syntax',
  ]);

  let results: LintResult[];

  beforeAll(() => {
    results = runEslintChecks([
      ...escapeHatchCases,
      { name: 'adapter', code: null, filename: ADAPTER_FILENAME },
    ]);
  });

  it.each(escapeHatchCases.map((c) => c.name))(
    '%s outside the adapter fails lint on the @native-html/* restriction specifically',
    (name) => {
      const result = results.find((r) => r.name === name);
      // Must be flagged by no-restricted-imports/no-restricted-syntax
      // specifically — not just "some lint rule fired" (e.g. prettier or
      // no-unused-vars on the fixture snippet), which would let this test
      // pass without actually proving the @native-html/* rule caught it.
      expect(
        result?.messages.some((message) =>
          message.ruleId
            ? NATIVE_HTML_RESTRICTION_RULE_IDS.has(message.ruleId)
            : false
        )
      ).toBe(true);
    }
  );

  it('SanitizedHtml.tsx itself is not flagged by the @native-html/* import restriction', () => {
    const result = results.find((r) => r.name === 'adapter');
    const nativeHtmlRestrictionMessages = (result?.messages ?? []).filter(
      (message) =>
        message.ruleId === 'no-restricted-imports' ||
        message.ruleId === 'no-restricted-syntax'
    );

    expect(nativeHtmlRestrictionMessages).toEqual([]);
  });
});
