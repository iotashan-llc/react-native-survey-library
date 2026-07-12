#!/usr/bin/env node
/**
 * Packaged-entry test suite (design: docs/design/0.3-core-facade.md, test
 * plan #7; extended by docs/design/0.5-factories.md, "Registration &
 * packaging"). Proves the exports map + ESM story survives an actual
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
 *   7d. import('<pkg>') registers exactly the M0 supported descriptor
 *       keys into RNQuestionFactory/RNElementFactory                  → exit 0
 *       (registrar side effect survives packaging)
 *
 * This does NOT prove Metro/Hermes fidelity (Node isn't Hermes) — that's
 * covered elsewhere (0.2 release gate, example app). It proves the
 * packed artifact's package.json `exports` map resolves the way this
 * design intends, under real Node ESM resolution rules.
 *
 * `react` is a real, explicitly-installed dependency here (its published
 * build is plain JS/CJS, importable under vanilla Node). `react-native`'s
 * published entry is NOT — it's Flow-typed source with no build step of
 * its own, meant to be consumed through Metro/Babel, and fails a raw
 * Node ESM parse (`SyntaxError: Unexpected token 'typeof'`). Since 0.5
 * wired the registrar (and its component modules) into the package root,
 * `import('<pkg>')` now transitively touches `react-native`'s `View`/
 * `Text` exports — so this harness supplies a minimal same-shaped ESM
 * stub instead of letting npm auto-install the real peer dependency; see
 * `writeReactNativeStub` below. Keep its export list in sync with the
 * `react-native` symbols component modules import.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIR);

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const PKG_NAME = pkg.name;
const SURVEY_CORE_VERSION = pkg.devDependencies['survey-core'];
const REACT_VERSION = pkg.devDependencies['react'];

if (!SURVEY_CORE_VERSION) {
  throw new Error('survey-core devDependency not found in package.json');
}
if (!REACT_VERSION) {
  throw new Error('react devDependency not found in package.json');
}

function writeReactNativeStub(consumerDir) {
  const stubDir = join(consumerDir, 'node_modules', 'react-native');
  mkdirSync(stubDir, { recursive: true });
  writeFileSync(
    join(stubDir, 'package.json'),
    JSON.stringify(
      {
        name: 'react-native',
        version: '0.0.0-packaged-entry-stub',
        type: 'module',
        main: './index.js',
      },
      null,
      2
    )
  );
  writeFileSync(
    join(stubDir, 'index.js'),
    "// Minimal stub for the packaged-entry harness — see this script's\n" +
      "// header comment. Real 'react-native' can't be parsed by plain Node.\n" +
      "// Values only need to exist as named exports; nothing in the\n" +
      '// 7a-7e cases actually renders a component.\n' +
      "export const View = 'View';\n" +
      "export const Text = 'Text';\n" +
      // `SanitizedHtml` (design: docs/design/0.9-html-strategy.md) reads
      // `Dimensions.get('window').width` at module scope for its default
      // `contentWidth` fallback.
      "export const Dimensions = { get: () => ({ width: 0, height: 0 }) };\n"
  );
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
  {
    id: '7d',
    description:
      "registrar side effect survives packaging: import('<pkg>') registers exactly the M0 supported descriptor-table keys " +
      '(design: docs/design/0.5-factories.md, "Registration & packaging" — must track src/factories/descriptors.ts as milestones land)',
    script: `${RN_PREAMBLE}
const pkg = await import(${JSON.stringify(PKG_NAME)});
const expectedQuestionTypes = JSON.stringify(['empty']);
const expectedElementTypes = JSON.stringify([]);
const actualQuestionTypes = JSON.stringify(pkg.RNQuestionFactory.getAllTypes());
const actualElementTypes = JSON.stringify(pkg.RNElementFactory.getAllTypes());
if (actualQuestionTypes !== expectedQuestionTypes) {
  throw new Error(
    'RNQuestionFactory: expected ' + expectedQuestionTypes + ' got ' + actualQuestionTypes
  );
}
if (actualElementTypes !== expectedElementTypes) {
  throw new Error(
    'RNElementFactory: expected ' + expectedElementTypes + ' got ' + actualElementTypes
  );
}
console.log('7d: OK', actualQuestionTypes, actualElementTypes);
`,
    expectSuccess: true,
  },
  {
    id: '7e',
    description:
      "theme-core survives packaging: import('<pkg>') exposes resolveTheme and a zero-arg call " +
      'resolves the cascade-parity default (design: docs/design/0.6-theme-core.md; guards against ' +
      'runtime-JSON-import regressions under real Node ESM — ERR_IMPORT_ATTRIBUTE_MISSING)',
    script: `${RN_PREAMBLE}
const pkg = await import(${JSON.stringify(PKG_NAME)});
if (typeof pkg.resolveTheme !== 'function') {
  throw new Error('resolveTheme is not exported from the package root');
}
const resolved = pkg.resolveTheme();
if (resolved.tokens.baseUnit !== 8) {
  throw new Error('expected baseUnit 8, got ' + resolved.tokens.baseUnit);
}
if (resolved.tokens.cornerRadius !== 4) {
  throw new Error('expected cornerRadius 4, got ' + resolved.tokens.cornerRadius);
}
if (resolved.tokens.colors.primaryBackcolor.css !== 'rgba(25, 179, 148, 1)') {
  throw new Error(
    'expected primaryBackcolor rgba(25, 179, 148, 1), got ' +
      resolved.tokens.colors.primaryBackcolor.css
  );
}
if (typeof pkg.spacing !== 'function' || pkg.spacing(8, 1.5) !== 12) {
  throw new Error('spacing helper missing or wrong');
}
console.log('7e: OK');
`,
    expectSuccess: true,
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

  log('== Installing tarball + survey-core + react into the temp consumer ==');
  // --legacy-peer-deps: npm 7+ otherwise auto-installs the package's
  // peerDependencies, which would pull the REAL react-native — Flow-typed
  // source that a plain Node ESM parse rejects (see header comment). The
  // peers this harness actually needs are installed explicitly (react,
  // survey-core); react-native gets the minimal stub written below.
  run(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--legacy-peer-deps',
      tarballPath,
      `survey-core@${SURVEY_CORE_VERSION}`,
      `react@${REACT_VERSION}`,
    ],
    { cwd: consumerDir }
  );

  log(
    '== Writing the react-native ESM stub (post-install, so npm cannot clobber it) =='
  );
  writeReactNativeStub(consumerDir);

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
