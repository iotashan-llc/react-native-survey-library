/**
 * @jest-environment node
 */

// Test plan #6 (design: docs/design/0.7-theme-rn.md): "ESLint/purity:
// recipes/bridge import only facade types + tokens; no react-native
// import in bridge.ts." Mirrors src/theme-core/__tests__/lint-fixtures.test.ts's
// pattern -- runs the REAL flat config via ESLint's `Linter#verify` API
// in a plain node child process (Jest's sandboxed VM can't dynamically
// `import()` a real ESM config file).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const BRIDGE_FILENAME = join(REPO_ROOT, 'src', 'theme-rn', 'bridge.ts');
const OTHER_THEME_RN_FILENAME = join(
  REPO_ROOT,
  'src',
  'theme-rn',
  'shadows.ts'
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

describe('ESLint enforcement — bridge.ts is pure (no react-native import)', () => {
  const cases: LintCase[] = [
    {
      name: 'react-native import inside bridge.ts',
      code: "import { StyleSheet } from 'react-native';\nexport const s = StyleSheet.create({});\n",
      filename: BRIDGE_FILENAME,
    },
    {
      name: 'react-native subpath import inside bridge.ts',
      code: "import { Platform } from 'react-native/Libraries/Utilities/Platform';\nexport { Platform };\n",
      filename: BRIDGE_FILENAME,
    },
    {
      name: 'react-native import in ANOTHER theme-rn file is unrestricted by this rule (shadows.ts/recipes need it)',
      code: "import { StyleSheet } from 'react-native';\nexport const s = StyleSheet.create({});\n",
      filename: OTHER_THEME_RN_FILENAME,
    },
    {
      name: 'require of react-native inside bridge.ts',
      code: "const rn = require('react-native');\nexport default rn;\n",
      filename: BRIDGE_FILENAME,
    },
  ];

  let results: LintResult[];

  beforeAll(() => {
    results = runEslintChecks(cases);
  });

  it('react-native import inside bridge.ts is flagged by no-restricted-imports', () => {
    const result = results.find(
      (r) => r.name === 'react-native import inside bridge.ts'
    );
    expect(
      result?.messages.some((m) => m.ruleId === 'no-restricted-imports')
    ).toBe(true);
  });

  it('react-native subpath import inside bridge.ts is flagged too', () => {
    const result = results.find(
      (r) => r.name === 'react-native subpath import inside bridge.ts'
    );
    expect(
      result?.messages.some((m) => m.ruleId === 'no-restricted-imports')
    ).toBe(true);
  });

  it('require of react-native inside bridge.ts is flagged via no-restricted-syntax', () => {
    const result = results.find(
      (r) => r.name === 'require of react-native inside bridge.ts'
    );
    expect(
      result?.messages.some((m) => m.ruleId === 'no-restricted-syntax')
    ).toBe(true);
  });

  it('the same import in ANOTHER theme-rn file is NOT flagged by this rule', () => {
    const result = results.find(
      (r) =>
        r.name ===
        'react-native import in ANOTHER theme-rn file is unrestricted by this rule (shadows.ts/recipes need it)'
    );
    expect(
      result?.messages.some((m) => m.ruleId === 'no-restricted-imports')
    ).toBe(false);
  });
});
