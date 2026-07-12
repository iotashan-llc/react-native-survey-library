/**
 * Design: docs/design/1.5-icon-actionbutton.md, "Icon source strategy" —
 * `resolveIconXml` rides core's OWN name resolution
 * (`getIconNameFromProxy`: `settings.customIcons` remap + `renamedIcons`
 * legacy/size-suffix mapping), then looks raw SVG up consumer-first
 * (SvgThemeSets → SvgRegistry.icons symbol-unwrap → bundled V2 map).
 * Bundled hits pass through byte-identical (trusted tier); consumer-
 * registered strings are sanitized (see sanitize-svg tests); misses
 * return null with a one-shot `unknown-icon` diagnostic — never a throw.
 */
import { settings, SvgRegistry, SvgThemeSets } from '../../core/facade';
import { bundledIconsV2 } from '../../core/icons';
import { resolveIconXml } from '../icon-resolution';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

const customIcons = settings.customIcons as Record<string, string>;

/** Removes every trace of a consumer registration from the shared core singletons. */
function unregister(...ids: string[]): void {
  for (const id of ids) {
    delete SvgRegistry.icons[id];
    for (const set of Object.keys(SvgThemeSets)) {
      delete SvgThemeSets[set]?.[id];
    }
  }
}

describe('resolveIconXml — bundled trusted tier', () => {
  it('resolves a canonical size-suffixed name byte-identically from the bundled V2 map', () => {
    const { key, xml } = resolveIconXml('icon-chevrondown-24x24');
    expect(key).toBe('chevrondown-24x24');
    expect(xml).toBe(bundledIconsV2['chevrondown-24x24']);
  });

  it('maps a legacy size-suffixed name through renamedIcons (icon-clear_16x16 -> clear-16x16)', () => {
    const { key, xml } = resolveIconXml('icon-clear_16x16');
    expect(key).toBe('clear-16x16');
    expect(xml).toBe(bundledIconsV2['clear-16x16']);
  });

  it('accepts unprefixed legacy names (chevron -> chevrondown-24x24)', () => {
    const { key, xml } = resolveIconXml('chevron');
    expect(key).toBe('chevrondown-24x24');
    expect(xml).toBe(bundledIconsV2['chevrondown-24x24']);
  });
});

describe('resolveIconXml — consumer registrations', () => {
  afterEach(() => {
    unregister(
      'my-custom-search-1-5',
      'chevrondown-24x24',
      'only-registry-icon-1-5',
      'evil-icon-1-5'
    );
    delete customIcons['icon-search'];
    setDiagnosticHandler(undefined);
  });

  it('follows a settings.customIcons remap to a consumer-registered icon', () => {
    SvgRegistry.registerIcon(
      'my-custom-search-1-5',
      '<svg viewBox="0 0 16 16"><path d="M0 0h16v16z"/></svg>'
    );
    customIcons['icon-search'] = 'my-custom-search-1-5';
    const { key, xml } = resolveIconXml('icon-search');
    expect(key).toBe('my-custom-search-1-5');
    expect(xml).toContain('M0 0h16v16z');
  });

  it('lets a consumer registration override a bundled icon (web last-write-wins parity)', () => {
    SvgRegistry.registerIcon(
      'chevrondown-24x24',
      '<svg viewBox="0 0 10 10"><path d="M1 1L9 9"/></svg>'
    );
    const { xml } = resolveIconXml('icon-chevrondown-24x24');
    expect(xml).toContain('M1 1L9 9');
    expect(xml).not.toBe(bundledIconsV2['chevrondown-24x24']);
  });

  it('unwraps a symbol-wrapped registerIconFromSvg registration back to renderable <svg>', () => {
    SvgRegistry.registerIconFromSvg(
      'only-registry-icon-1-5',
      '<svg viewBox="0 0 8 8"><rect width="8" height="8"/></svg>'
    );
    const { xml } = resolveIconXml('icon-only-registry-icon-1-5');
    expect(xml).not.toBeNull();
    expect(xml!.trimStart().startsWith('<svg')).toBe(true);
    expect(xml).toContain('viewBox="0 0 8 8"');
    expect(xml).toContain('<rect');
    expect(xml).not.toContain('<symbol');
  });

  it('sanitizes consumer-registered SVG and forwards sanitize diagnostics once (cached)', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    SvgRegistry.registerIcon(
      'evil-icon-1-5',
      '<svg viewBox="0 0 4 4" onload="x()"><image href="https://evil.example/x.png"/><path d="M0 0h4"/></svg>'
    );
    const first = resolveIconXml('icon-evil-icon-1-5');
    expect(first.xml).not.toBeNull();
    expect(first.xml).not.toContain('evil.example');
    expect(first.xml).not.toContain('onload');
    expect(first.xml).toContain('M0 0h4');
    const sanitizeReports = seen.filter(
      (p) => p.code === 'icon-svg-diagnostic'
    );
    expect(sanitizeReports.length).toBeGreaterThan(0);

    const countAfterFirst = seen.length;
    const second = resolveIconXml('icon-evil-icon-1-5');
    expect(second.xml).toBe(first.xml);
    expect(seen.length).toBe(countAfterFirst);
  });
});

describe('resolveIconXml — misses', () => {
  afterEach(() => setDiagnosticHandler(undefined));

  it('returns null for an unknown icon and reports unknown-icon exactly once per key', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    const first = resolveIconXml('icon-definitely-not-real-1-5');
    expect(first.xml).toBeNull();
    const second = resolveIconXml('icon-definitely-not-real-1-5');
    expect(second.xml).toBeNull();
    const misses = seen.filter((p) => p.code === 'unknown-icon');
    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({
      code: 'unknown-icon',
      iconName: 'icon-definitely-not-real-1-5',
      resolvedKey: 'definitely-not-real-1-5',
    });
  });
});
