/**
 * Extracts the kitchen-sink survey JSON from the example app's TS module
 * into `parity/kitchen-sink.json` so the web-parity page
 * (`parity/index.html`) renders the EXACT same model the RN example
 * renders. Run after editing example/src/kitchen-sink.ts:
 *
 *   node scripts/build-parity.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'example/src/kitchen-sink.ts'), 'utf8');

// The module is a single `export const kitchenSinkJson = {...} as const;`
// plus a const the object references — evaluate it with the TS-only
// syntax stripped rather than hand-parsing.
const stripped = source
  .replace(/^export const kitchenSinkJson =/m, 'globalThis.__ks =')
  .replace(/as const;\s*$/m, ';');

// eslint-disable-next-line no-new-func
new Function(stripped)();
const json = globalThis.__ks;
if (!json || !Array.isArray(json.pages)) {
  throw new Error('kitchen-sink extraction failed');
}

writeFileSync(
  join(root, 'parity/kitchen-sink.json'),
  `${JSON.stringify(json, null, 2)}\n`
);
console.log(
  `parity/kitchen-sink.json written (${json.pages.length} pages,`,
  `${json.pages.reduce((n, p) => n + p.elements.length, 0)} elements)`
);
