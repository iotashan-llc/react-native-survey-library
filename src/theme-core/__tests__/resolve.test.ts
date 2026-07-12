/**
 * Core resolver tests (design: docs/design/0.6-theme-core.md, test plan
 * #1, #3, #5, #6, #7). Golden/default-manifest specifics live in sibling
 * files; this covers the resolveTheme() contract end-to-end.
 */
import { resolveTheme } from '../resolve';
import { DefaultLight, LayeredDark } from '../../core/themes';
import type { ITheme } from '../../core/facade';

describe('resolveTheme(undefined) — the cascade-parity default', () => {
  it('resolves without throwing and produces the documented shape', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.tokens.baseUnit).toBe(8);
    expect(resolved.tokens.cornerRadius).toBe(4);
    expect(resolved.meta.colorPalette).toBe('light');
    expect(resolved.meta.isPanelless).toBe(false);
    expect(resolved.meta.themeName).toBeUndefined();
    expect(resolved.background.fit).toBe('cover');
    expect(resolved.background.attachment).toBe('scroll');
    expect(resolved.background.opacity).toBe(1);
    expect(resolved.background.image).toBeUndefined();
    expect(resolved.header.headerView).toBe('basic');
    expect(resolved.header.backgroundKind).toBe('none');
    expect(resolved.diagnostics).toEqual([]);
  });

  it('resolves the primary-backcolor color group to the documented DefaultLight-ish literal (not byte-equal, per the design)', () => {
    const resolved = resolveTheme(undefined);
    // The cascade default for --sjs-primary-backcolor is `var(--primary, #19b394)`.
    expect(resolved.tokens.colors.primaryBackcolor).toEqual({
      r: 0x19,
      g: 0xb3,
      b: 0x94,
      a: 1,
      css: 'rgba(25, 179, 148, 1)',
    });
  });

  it('resolves the 5 article font sizes as 4x/3x/2x/1.5x/1x of the base font-size (16px default)', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.tokens.articleFont.xxLarge.fontSize).toBe(64);
    expect(resolved.tokens.articleFont.xLarge.fontSize).toBe(48);
    expect(resolved.tokens.articleFont.large.fontSize).toBe(32);
    expect(resolved.tokens.articleFont.medium.fontSize).toBe(24);
    expect(resolved.tokens.articleFont.default.fontSize).toBe(16);
  });
});

describe('invariance canaries across real presets', () => {
  it.each([
    ['DefaultLight', DefaultLight],
    ['LayeredDark', LayeredDark],
  ])(
    '%s: baseUnit=8, cornerRadius=4, articleFont preset props identical',
    (_name, theme) => {
      const resolved = resolveTheme(theme as ITheme);
      expect(resolved.tokens.baseUnit).toBe(8);
      expect(resolved.tokens.cornerRadius).toBe(4);
      for (const size of [
        'xxLarge',
        'xLarge',
        'large',
        'medium',
        'default',
      ] as const) {
        const token = resolved.tokens.articleFont[size];
        expect(typeof token.fontSize).toBe('number');
        expect(
          typeof token.fontWeight === 'number' ||
            typeof token.fontWeight === 'string'
        ).toBe(true);
        expect(['none', 'uppercase', 'lowercase', 'capitalize']).toContain(
          token.textCase
        );
      }
    }
  );

  it('LayeredDark real multi-layer shadow-small parses to 3 layers', () => {
    const resolved = resolveTheme(LayeredDark as ITheme);
    expect(resolved.tokens.shadows.small).toHaveLength(3);
    expect(resolved.tokens.shadows.small.every((l) => l.inset === false)).toBe(
      true
    );
  });
});

describe('sparse theme overlay', () => {
  it('overriding one base color changes only that token + its derived dependents; all else === undefined-golden', () => {
    const base = resolveTheme(undefined);
    const sparse = resolveTheme({
      cssVariables: { '--sjs-primary-backcolor': 'rgba(1, 2, 3, 1)' },
    });
    expect(sparse.tokens.colors.primaryBackcolor).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 1,
      css: 'rgba(1, 2, 3, 1)',
    });
    // ALL OTHER color tokens === the undefined-golden, exactly — not just
    // one spot-checked neighbor (design: "all else === undefined-golden").
    for (const key of Object.keys(base.tokens.colors)) {
      if (key === 'primaryBackcolor') continue;
      expect(sparse.tokens.colors[key]).toEqual(base.tokens.colors[key]);
    }
    expect(sparse.tokens.baseUnit).toBe(base.tokens.baseUnit);
    expect(sparse.tokens.cornerRadius).toBe(base.tokens.cornerRadius);
    expect(sparse.tokens.shadows).toEqual(base.tokens.shadows);
    expect(sparse.tokens.articleFont).toEqual(base.tokens.articleFont);
    expect(sparse.background).toEqual(base.background);
    expect(sparse.meta).toEqual(base.meta);
  });

  it('overriding --sjs-font-size flows into all 5 derived article fontSizes', () => {
    const resolved = resolveTheme({
      cssVariables: { '--sjs-font-size': '20px' },
    });
    expect(resolved.tokens.articleFont.default.fontSize).toBe(20);
    expect(resolved.tokens.articleFont.medium.fontSize).toBe(30);
    expect(resolved.tokens.articleFont.large.fontSize).toBe(40);
    expect(resolved.tokens.articleFont.xLarge.fontSize).toBe(60);
    expect(resolved.tokens.articleFont.xxLarge.fontSize).toBe(80);
  });

  it('an invalid explicit override falls back to the registry default RE-EVALUATED against other overrides', () => {
    const resolved = resolveTheme({
      cssVariables: {
        '--sjs-font-size': '20px',
        '--sjs-article-font-default-fontSize': 'not-a-length',
      },
    });
    expect(resolved.tokens.articleFont.default.fontSize).toBe(20);
    expect(
      resolved.diagnostics.some(
        (d) => d.variable === '--sjs-article-font-default-fontSize'
      )
    ).toBe(true);
  });

  it('an invalid CALC OPERAND re-evaluates the derived default post-overlay — never yields 0 (codex review major 7 exact regression)', () => {
    const resolved = resolveTheme({
      cssVariables: {
        '--sjs-font-size': '20px',
        '--sjs-article-font-xx-large-fontSize': 'calc(4 * (garbage))',
      },
    });
    // Default for xx-large fontSize is calc(4 * (var(--sjs-font-size, 16px)))
    // — re-evaluated against the 20px override => 80, NOT 0.
    expect(resolved.tokens.articleFont.xxLarge.fontSize).toBe(80);
    expect(
      resolved.diagnostics.some(
        (d) => d.variable === '--sjs-article-font-xx-large-fontSize'
      )
    ).toBe(true);
  });

  it('a theme-introduced var() cycle invalidates all members; the token falls back to the registry default (codex review critical 2 end-to-end)', () => {
    const resolved = resolveTheme({
      cssVariables: {
        '--sjs-primary-backcolor':
          'var(--sjs-primary-backcolor-light, rgba(9, 9, 9, 1))',
        '--sjs-primary-backcolor-light': 'var(--sjs-primary-backcolor)',
      },
    });
    // The internal rgba(9,9,9,1) fallback must NOT revive the cycle member;
    // the registry default (var(--primary, #19b394)) applies instead.
    expect(resolved.tokens.colors.primaryBackcolor).toEqual({
      r: 0x19,
      g: 0xb3,
      b: 0x94,
      a: 1,
      css: 'rgba(25, 179, 148, 1)',
    });
    expect(
      resolved.diagnostics.some((d) => d.code === 'theme-core/var-cycle')
    ).toBe(true);
  });
});

describe('resolveTheme() zero-arg call (codex review minor 13)', () => {
  it('the theme parameter is optional and a zero-arg call equals resolveTheme(undefined)', () => {
    expect(resolveTheme()).toEqual(resolveTheme(undefined));
  });
});

describe('header', () => {
  it('accent context: backgroundColor === var(--sjs-primary-backcolor) literal classifies as accent, and title/description colors use the accent fallback chain', () => {
    const resolved = resolveTheme({
      cssVariables: {
        '--sjs-header-backcolor': 'var(--sjs-primary-backcolor)',
      },
    });
    expect(resolved.header.backgroundKind).toBe('accent');
    // accent fallback for title/description color = primary-foreground chain.
    expect(resolved.header.colors.resolved.titleColor).toEqual(
      resolved.tokens.colors.primaryForecolor
    );
  });

  it('normal (non-accent) context uses the page-title/description fallback chain', () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.header.backgroundKind).toBe('none');
    expect(resolved.header.colors.resolved.titleColor).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0.91,
      css: 'rgba(0, 0, 0, 0.91)',
    });
  });

  it('header present with no explicit headerView implies advanced (applyTheme rule)', () => {
    const resolved = resolveTheme({ header: { height: 300 } });
    expect(resolved.header.headerView).toBe('advanced');
    expect(resolved.header.rawHeader).toEqual({ height: 300 });
  });

  it('explicit headerView is honored verbatim', () => {
    const resolved = resolveTheme({
      header: { height: 300 },
      headerView: 'basic',
    });
    expect(resolved.header.headerView).toBe('basic');
  });

  it('one-sided override deactivates the accent context: accent backcolor + explicit descriptionColor means titleColor uses the NORMAL chain (codex review major 8b — mirrors Cover.updateHeaderClasses gating the accent class on !titleColor && !descriptionColor)', () => {
    const resolved = resolveTheme({
      cssVariables: {
        '--sjs-header-backcolor': 'var(--sjs-primary-backcolor)',
        '--sjs-font-headerdescription-color': 'rgba(1, 2, 3, 1)',
      },
    });
    // Raw classification stays accent...
    expect(resolved.header.backgroundKind).toBe('accent');
    // ...but the accent CONTEXT is inactive (an explicit title/description
    // color suppresses the sv-header__background-color--accent class), so
    // the unset titleColor resolves via the NORMAL (page-title) chain.
    expect(resolved.header.colors.resolved.titleColor).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0.91,
      css: 'rgba(0, 0, 0, 0.91)',
    });
    expect(resolved.header.colors.resolved.descriptionColor).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 1,
      css: 'rgba(1, 2, 3, 1)',
    });
  });

  it('an INVALID explicit header color falls back to the DEREFERENCED context default, not black (codex review major 8a)', () => {
    const resolved = resolveTheme({
      cssVariables: {
        '--sjs-font-headertitle-color': 'garbage-not-a-color',
      },
    });
    // Normal-context default chain: var(--sjs-font-pagetitle-color,
    // var(--sjs-general-dim-forecolor, rgba(0, 0, 0, 0.91))) — must be
    // dereferenced before being used as the parse fallback (previously the
    // unresolved var() expression was handed to parseColor and produced
    // opaque black).
    expect(resolved.header.colors.resolved.titleColor).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0.91,
      css: 'rgba(0, 0, 0, 0.91)',
    });
    expect(
      resolved.diagnostics.some(
        (d) => d.variable === '--sjs-font-headertitle-color'
      )
    ).toBe(true);
  });
});

describe('background', () => {
  it('unwraps a url() background image and preserves the fixed attachment (0.6 does not diagnose it)', () => {
    const resolved = resolveTheme({
      backgroundImage: 'url(https://example.com/a.png)',
      backgroundImageAttachment: 'fixed',
    });
    expect(resolved.background.image).toBe('https://example.com/a.png');
    expect(resolved.background.attachment).toBe('fixed');
  });

  it('passes a bare (non-url()-wrapped) image URI through verbatim', () => {
    const resolved = resolveTheme({
      backgroundImage: 'data:image/png;base64,abc',
    });
    expect(resolved.background.image).toBe('data:image/png;base64,abc');
  });

  it('clamps an out-of-range backgroundOpacity with a diagnostic', () => {
    const resolved = resolveTheme({ backgroundOpacity: 5 });
    expect(resolved.background.opacity).toBe(1);
    expect(resolved.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('purity', () => {
  it('repeated calls with the same input deep-equal, including diagnostics arrays', () => {
    const theme: ITheme = {
      cssVariables: { '--sjs-primary-backcolor': 'rgba(9,9,9,1)' },
    };
    const a = resolveTheme(theme);
    const b = resolveTheme(theme);
    expect(a).toEqual(b);
  });

  it('output contains zero functions anywhere (pure data)', () => {
    const resolved = resolveTheme(undefined);
    const seen = new Set<unknown>();
    let functionsFound = 0;
    const walk = (value: unknown) => {
      if (value === null || typeof value !== 'object') {
        if (typeof value === 'function') functionsFound++;
        return;
      }
      if (seen.has(value)) return;
      seen.add(value);
      for (const v of Object.values(value as Record<string, unknown>)) {
        walk(v);
      }
    };
    walk(resolved);
    expect(functionsFound).toBe(0);
  });

  it('extras carries unknown cssVariables keys verbatim', () => {
    const resolved = resolveTheme({
      cssVariables: { '--totally-unknown-var': 'hello' },
    });
    expect(resolved.extras['--totally-unknown-var']).toBe('hello');
  });

  it('rawVariables exposes the full overlaid cascade environment', () => {
    const resolved = resolveTheme({
      cssVariables: { '--sjs-primary-backcolor': 'rgba(9,9,9,1)' },
    });
    expect(resolved.rawVariables['--sjs-primary-backcolor']).toBe(
      'rgba(9,9,9,1)'
    );
    expect(resolved.rawVariables['--sjs-secondary-backcolor']).toBeDefined();
  });
});
