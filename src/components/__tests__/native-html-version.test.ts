/**
 * @jest-environment node
 */

// Version gate (round-2 review #10). The single-parse `source={{ dom }}`
// contract this library relies on is version-sensitive: `@native-html/
// render` must hand our PRIVATE reconstructed domhandler tree straight to
// `TRenderEngine.buildTTreeFromDoc` without re-parsing. `^1.0.3` would
// permit a future `1.9.x` with different DOM-source behavior, so both the
// peerDependency and the devDependency are pinned to `~1.0.3` (1.0.x only),
// and the RESOLVED install must fall inside that band.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('@native-html/render version gate', () => {
  const pkg = readJson(join(REPO_ROOT, 'package.json'));
  const peer = (pkg.peerDependencies as Record<string, string>)[
    '@native-html/render'
  ];
  const dev = (pkg.devDependencies as Record<string, string>)[
    '@native-html/render'
  ];

  it('pins the peer + dev specs to the 1.0.x band (~1.0.3, not ^1.0.3)', () => {
    expect(peer).toBe('~1.0.3');
    expect(dev).toBe('~1.0.3');
  });

  it('resolves an installed version inside the 1.0.x band', () => {
    const installed = readJson(
      join(REPO_ROOT, 'node_modules', '@native-html', 'render', 'package.json')
    );
    expect(String(installed.version).startsWith('1.0.')).toBe(true);
  });
});
