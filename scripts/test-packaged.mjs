#!/usr/bin/env node
/**
 * Packaged-entry test suite (design: docs/design/0.3-core-facade.md, test
 * plan #7). Proves the exports map + ESM story survives an actual
 * `yarn pack` → install → real Node ESM `import()`, by package specifier
 * only (never a `lib/...` path — the exports map itself is what's under
 * test):
 *
 *   7a. import('<pkg>/shim') then import('survey-core')   → exit 0
 *       (model-first import-order contract)
 *   7b. import('<pkg>') then import('survey-core')        → exit 0
 *       (renderer-first; proves the packed facade chain applies the shim)
 *   7c. bare import('survey-core')                        → nonzero exit
 *       (negative control)
 *
 * This does NOT prove Metro/Hermes fidelity (Node isn't Hermes) — that's
 * covered elsewhere (0.2 release gate, example app). It proves the
 * packed artifact's package.json `exports` map resolves the way this
 * design intends, under real Node ESM resolution rules.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIR);

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const PKG_NAME = pkg.name;
const SURVEY_CORE_VERSION = pkg.devDependencies['survey-core'];

if (!SURVEY_CORE_VERSION) {
  throw new Error('survey-core devDependency not found in package.json');
}

// Same descriptor logic as test-utils/rn-globals.ts, inlined for a plain
// Node child process (no jest, no TS, no restore-in-finally needed — this
// process is single-use). `Object.defineProperty` (not plain assignment)
// is required: Node ships a getter-only global `navigator`, and ESM
// modules are always strict mode, so `globalThis.navigator = ...` throws.
const RN_PREAMBLE = `
function definePatchedGlobal(key, value) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}
definePatchedGlobal('window', globalThis);
definePatchedGlobal('navigator', { product: 'ReactNative', maxTouchPoints: undefined });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  definePatchedGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
}
delete globalThis.addEventListener;
delete globalThis.removeEventListener;
delete globalThis.ResizeObserver;
if (typeof document !== 'undefined') {
  throw new Error('precondition failed: document is defined');
}
if (globalThis.window !== globalThis) {
  throw new Error('precondition failed: window !== global');
}
`;

const cases = [
  {
    id: '7a',
    description:
      "model-first contract: import('<pkg>/shim') then import('survey-core')",
    script: `${RN_PREAMBLE}
await import(${JSON.stringify(`${PKG_NAME}/shim`)});
await import('survey-core');
console.log('7a: OK');
`,
    expectSuccess: true,
  },
  {
    id: '7b',
    description:
      "renderer-first: import('<pkg>') then import('survey-core')",
    script: `${RN_PREAMBLE}
await import(${JSON.stringify(PKG_NAME)});
await import('survey-core');
console.log('7b: OK');
`,
    expectSuccess: true,
  },
  {
    id: '7c',
    description: "negative control: bare import('survey-core') crashes",
    script: `${RN_PREAMBLE}
await import('survey-core');
console.log('7c: UNEXPECTED SUCCESS');
`,
    expectSuccess: false,
  },
];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, args, options) {
  log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
    cwd: REPO_ROOT,
    ...options,
  });
}

let consumerDir;
let tarballPath;
let failures = 0;

try {
  log('== Building lib/ (yarn prepare) ==');
  run('yarn', ['prepare']);

  consumerDir = mkdtempSync(join(tmpdir(), 'rn-survey-lib-packaged-'));
  tarballPath = join(consumerDir, 'package.tgz');

  log('== Packing tarball (yarn pack) ==');
  run('yarn', ['pack', '--out', tarballPath]);

  log(`== Setting up temp consumer at ${consumerDir} ==`);
  writeFileSync(
    join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'packaged-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
      },
      null,
      2
    )
  );

  log('== Installing tarball + survey-core into the temp consumer ==');
  run(
    'npm',
    ['install', '--no-audit', '--no-fund', tarballPath, `survey-core@${SURVEY_CORE_VERSION}`],
    { cwd: consumerDir }
  );

  log('== Running packaged-entry cases ==');
  for (const testCase of cases) {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', testCase.script],
      { cwd: consumerDir, encoding: 'utf8' }
    );
    const succeeded = result.status === 0;
    const pass = succeeded === testCase.expectSuccess;

    log(
      `-- ${testCase.id}: ${testCase.description}\n` +
        `   exit=${result.status} expectSuccess=${testCase.expectSuccess} => ${
          pass ? 'PASS' : 'FAIL'
        }`
    );
    if (result.stdout.trim()) log(`   stdout: ${result.stdout.trim()}`);
    if (!pass && result.stderr.trim()) {
      log(`   stderr: ${result.stderr.trim()}`);
    }

    if (!pass) failures += 1;
  }
} finally {
  if (consumerDir) {
    rmSync(consumerDir, { recursive: true, force: true });
  }
}

if (failures > 0) {
  log(`\n${failures} packaged-entry case(s) FAILED.`);
  process.exit(1);
} else {
  log(`\nAll packaged-entry cases passed.`);
}
