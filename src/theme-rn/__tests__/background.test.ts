/**
 * Background normalization (design ownership table: "backgroundImageAttachment:
 * 'fixed' mapping + diagnostic (0.6 deferred it here) | 0.7 -- normalized
 * to scroll at style time + theme-attachment-unsupported diagnostic"). RN
 * has no CSS `background-attachment: fixed` concept (no viewport-relative
 * fixed background layer) -- `fixed` normalizes to `scroll` behavior with
 * a diagnostic; `scroll` passes through unchanged, diagnostic-free.
 */
import { normalizeBackground } from '../background';
import type { ThemeBackground } from '../../theme-core/resolve';

function background(overrides: Partial<ThemeBackground> = {}): ThemeBackground {
  return {
    image: undefined,
    fit: 'cover',
    attachment: 'scroll',
    opacity: 1,
    ...overrides,
  };
}

describe('normalizeBackground', () => {
  it('scroll attachment passes through unchanged, no diagnostic', () => {
    const result = normalizeBackground(
      background({ attachment: 'scroll', image: 'https://x/y.png' })
    );
    expect(result.normalized).toEqual({
      image: 'https://x/y.png',
      fit: 'cover',
      attachment: 'scroll',
      opacity: 1,
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('fixed attachment normalizes to scroll, with a theme-attachment-unsupported diagnostic', () => {
    const result = normalizeBackground(background({ attachment: 'fixed' }));
    expect(result.normalized.attachment).toBe('scroll');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('theme-attachment-unsupported');
  });

  it('preserves fit/opacity/image verbatim regardless of attachment normalization', () => {
    const result = normalizeBackground(
      background({
        attachment: 'fixed',
        fit: 'contain',
        opacity: 0.5,
        image: 'a.png',
      })
    );
    expect(result.normalized.fit).toBe('contain');
    expect(result.normalized.opacity).toBe(0.5);
    expect(result.normalized.image).toBe('a.png');
  });

  it('no image: still normalizes attachment, diagnostic still fires for fixed', () => {
    const result = normalizeBackground(
      background({ attachment: 'fixed', image: undefined })
    );
    expect(result.normalized.image).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
  });
});
