/**
 * @jest-environment node
 */

// Test plan #7 (design: docs/design/0.6-theme-core.md): "ESLint fixtures:
// react-native in theme-core fails; survey-core/themes outside
// themes-facade fails." Mirrors src/core/__tests__/lint-fixtures.test.ts's
// pattern — runs the REAL flat config (`eslint.config.mjs`) via ESLint's
// `Linter#verify` API in a plain node child process (Jest's sandboxed VM
// can't dynamically `import()` a real ESM config file).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const THEME_CORE_CONSUMER_FILENAME = join(
  REPO_ROOT,
  'src',
  'theme-core',
  'some-consumer.ts'
);
const OTHER_MODULE_FILENAME = join(REPO_ROOT, 'src', 'some-other.ts');
const THEMES_FACADE_FILENAME = join(REPO_ROOT, 'src', 'core', 'themes.ts');

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

describe('ESLint enforcement — theme-core is pure TS (case: react-native import)', () => {
  const cases: LintCase[] = [
    {
      name: 'react-native import inside theme-core',
      code: "import { StyleSheet } from 'react-native';\nexport const s = StyleSheet.create({});\n",
      filename: THEME_CORE_CONSUMER_FILENAME,
    },
    {
      name: 'react-native subpath import inside theme-core',
      code: "import { Platform } from 'react-native/Libraries/Utilities/Platform';\nexport { Platform };\n",
      filename: THEME_CORE_CONSUMER_FILENAME,
    },
    {
      name: 'react-native import OUTSIDE theme-core is unrestricted by this rule',
      code: "import { StyleSheet } from 'react-native';\nexport const s = StyleSheet.create({});\n",
      filename: OTHER_MODULE_FILENAME,
    },
  ];

  let results: LintResult[];

  beforeAll(() => {
    results = runEslintChecks(cases);
  });

  it('react-native import inside theme-core is flagged by no-restricted-imports', () => {
    const result = results.find(
      (r) => r.name === 'react-native import inside theme-core'
    );
    expect(
      result?.messages.some((m) => m.ruleId === 'no-restricted-imports')
    ).toBe(true);
  });

  it('react-native subpath import inside theme-core is flagged too', () => {
    const result = results.find(
      (r) => r.name === 'react-native subpath import inside theme-core'
    );
    expect(
      result?.messages.some((m) => m.ruleId === 'no-restricted-imports')
    ).toBe(true);
  });

  it('the same import outside theme-core is NOT flagged by this rule', () => {
    const result = results.find(
      (r) =>
        r.name ===
        'react-native import OUTSIDE theme-core is unrestricted by this rule'
    );
    expect(
      result?.messages.some((m) => m.ruleId === 'no-restricted-imports')
    ).toBe(false);
  });
});

describe('ESLint enforcement — survey-core/themes only from the themes-facade', () => {
  const cases: LintCase[] = [
    {
      name: 'survey-core/themes import outside the themes-facade',
      code: "import themes from 'survey-core/themes';\nexport default themes;\n",
      filename: THEME_CORE_CONSUMER_FILENAME,
    },
  ];

  let results: LintResult[];

  beforeAll(() => {
    results = runEslintChecks([
      ...cases,
      { name: 'themes-facade', code: null, filename: THEMES_FACADE_FILENAME },
    ]);
  });

  it('survey-core/themes import outside themes.ts is flagged', () => {
    const result = results.find(
      (r) => r.name === 'survey-core/themes import outside the themes-facade'
    );
    expect(
      result?.messages.some(
        (m) =>
          m.ruleId === 'no-restricted-imports' ||
          m.ruleId === 'no-restricted-syntax'
      )
    ).toBe(true);
  });

  it('themes.ts itself is not flagged by the survey-core import restriction', () => {
    const result = results.find((r) => r.name === 'themes-facade');
    const surveyCoreRestrictionMessages = (result?.messages ?? []).filter(
      (message) =>
        message.ruleId === 'no-restricted-imports' ||
        message.ruleId === 'no-restricted-syntax'
    );
    expect(surveyCoreRestrictionMessages).toEqual([]);
  });
});
