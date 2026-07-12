/**
 * SurveyThemeProvider tests (design: docs/design/0.7-theme-rn.md,
 * "Provider"; test plan #4). Memoization policy: canonicalized sorted-key
 * snapshot of the SUPPORTED ITheme fields as prefilter+deep-compare key;
 * context identity (resolved/recipes references) changes iff the
 * snapshot differs -- a same-reference theme object MUTATED between
 * renders IS detected (snapshot-based, not reference-based).
 */
import * as React from 'react';
import { StrictMode } from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SurveyThemeProvider, SurveyThemeContext } from '../provider';
import type { SurveyThemeContextValue } from '../provider';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';
import type { ITheme } from '../../core/facade';

function Consumer({
  onValue,
}: {
  onValue: (value: SurveyThemeContextValue) => void;
}) {
  const value = React.useContext(SurveyThemeContext);
  onValue(value);
  return <Text>consumer</Text>;
}

describe('SurveyThemeProvider — snapshot memoization', () => {
  it('re-rendering with the SAME theme reference (unmutated) keeps resolved/recipes IDENTITY-stable', () => {
    const theme: ITheme = { themeName: 'DefaultLight' };
    const seen: SurveyThemeContextValue[] = [];
    const { rerender } = render(
      <SurveyThemeProvider theme={theme}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    rerender(
      <SurveyThemeProvider theme={theme}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]?.resolved).toBe(seen[1]?.resolved);
    expect(seen[0]?.recipes).toBe(seen[1]?.recipes);
  });

  it('rebuilding an EQUAL-but-different-reference theme object keeps identity stable (deep-compare, not reference)', () => {
    const seen: SurveyThemeContextValue[] = [];
    const { rerender } = render(
      <SurveyThemeProvider theme={{ themeName: 'DefaultLight' }}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    rerender(
      <SurveyThemeProvider theme={{ themeName: 'DefaultLight' }}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    expect(seen[0]?.resolved).toBe(seen[1]?.resolved);
    expect(seen[0]?.recipes).toBe(seen[1]?.recipes);
  });

  it('a genuinely different theme value produces a NEW resolved/recipes identity', () => {
    const seen: SurveyThemeContextValue[] = [];
    const { rerender } = render(
      <SurveyThemeProvider theme={{ themeName: 'DefaultLight' }}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    rerender(
      <SurveyThemeProvider theme={{ themeName: 'DefaultDark' }}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    expect(seen[0]?.resolved).not.toBe(seen[1]?.resolved);
    expect(seen[0]?.resolved.meta.themeName).toBe('DefaultLight');
    expect(seen[1]?.resolved.meta.themeName).toBe('DefaultDark');
  });

  it('mutating the SAME-REFERENCE theme object between renders IS detected (snapshot-based)', () => {
    const theme: ITheme = { themeName: 'DefaultLight' };
    const seen: SurveyThemeContextValue[] = [];
    const { rerender } = render(
      <SurveyThemeProvider theme={theme}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    theme.themeName = 'DefaultDark'; // same object, mutated in place
    rerender(
      <SurveyThemeProvider theme={theme}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    expect(seen[0]?.resolved).not.toBe(seen[1]?.resolved);
    expect(seen[1]?.resolved.meta.themeName).toBe('DefaultDark');
  });

  it('mode (narrow) prop changes update context WITHOUT re-resolving the theme (resolved/recipes stay identity-stable)', () => {
    const theme: ITheme = { themeName: 'DefaultLight' };
    const seen: SurveyThemeContextValue[] = [];
    const { rerender } = render(
      <SurveyThemeProvider theme={theme} narrow={false}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    rerender(
      <SurveyThemeProvider theme={theme} narrow={true}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    expect(seen[0]?.mode.narrow).toBe(false);
    expect(seen[1]?.mode.narrow).toBe(true);
    expect(seen[0]?.resolved).toBe(seen[1]?.resolved);
    expect(seen[0]?.recipes).toBe(seen[1]?.recipes);
  });

  it('an explicit rtl prop override wins over the I18nManager default', () => {
    const seen: SurveyThemeContextValue[] = [];
    render(
      <SurveyThemeProvider rtl={true}>
        <Consumer onValue={(v) => seen.push(v)} />
      </SurveyThemeProvider>
    );
    expect(seen[0]?.mode.rtl).toBe(true);
  });
});

describe('SurveyThemeProvider — diagnostics (post-commit, deduped across re-resolutions)', () => {
  afterEach(() => setDiagnosticHandler(undefined));

  it('emits a resolver diagnostic post-commit through the shared seam', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    render(
      <SurveyThemeProvider
        theme={{ cssVariables: { '--sjs-primary-backcolor': 'not-a-color' } }}
      >
        <Text>x</Text>
      </SurveyThemeProvider>
    );
    const themeDiagnostics = seen.filter((p) => p.code === 'theme-diagnostic');
    expect(themeDiagnostics.length).toBeGreaterThan(0);
  });

  it('StrictMode double-invocation does not double-emit the same diagnostic', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    render(
      <StrictMode>
        <SurveyThemeProvider
          theme={{
            cssVariables: { '--sjs-primary-backcolor': 'not-a-color' },
          }}
        >
          <Text>x</Text>
        </SurveyThemeProvider>
      </StrictMode>
    );
    const themeDiagnostics = seen.filter((p) => p.code === 'theme-diagnostic');
    const uniqueKeys = new Set(
      themeDiagnostics.map((p) =>
        p.code === 'theme-diagnostic' ? `${p.diagnosticCode}|${p.variable}` : ''
      )
    );
    expect(themeDiagnostics.length).toBe(uniqueKeys.size);
  });

  it('re-resolving with the SAME bad value again does not re-emit (deduped across re-resolutions for the provider lifetime)', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    const badTheme: ITheme = {
      cssVariables: { '--sjs-primary-backcolor': 'not-a-color' },
    };
    const { rerender } = render(
      <SurveyThemeProvider theme={badTheme}>
        <Text>x</Text>
      </SurveyThemeProvider>
    );
    const afterFirst = seen.filter((p) => p.code === 'theme-diagnostic').length;
    // Force a re-resolve with an EQUIVALENT (but different reference) bad theme.
    rerender(
      <SurveyThemeProvider
        theme={{ cssVariables: { '--sjs-primary-backcolor': 'not-a-color' } }}
      >
        <Text>x</Text>
      </SurveyThemeProvider>
    );
    const afterSecond = seen.filter(
      (p) => p.code === 'theme-diagnostic'
    ).length;
    expect(afterSecond).toBe(afterFirst);
  });

  it('a fixed backgroundImageAttachment normalizes to scroll and emits theme-attachment-unsupported through the same seam', () => {
    const seen: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => seen.push(payload));
    const captured: SurveyThemeContextValue[] = [];
    render(
      <SurveyThemeProvider theme={{ backgroundImageAttachment: 'fixed' }}>
        <Consumer onValue={(v) => captured.push(v)} />
      </SurveyThemeProvider>
    );
    expect(captured[0]?.normalizedBackground.attachment).toBe('scroll');
    const attachmentDiagnostics = seen.filter(
      (p) =>
        p.code === 'theme-diagnostic' &&
        p.diagnosticCode === 'theme-attachment-unsupported'
    );
    expect(attachmentDiagnostics).toHaveLength(1);
  });
});

describe('SurveyThemeProvider — default context value (no provider in tree)', () => {
  it('a bare consumer without a provider gets the undefined-theme default', () => {
    const seen: SurveyThemeContextValue[] = [];
    render(<Consumer onValue={(v) => seen.push(v)} />);
    expect(seen[0]?.resolved.meta.themeName).toBeUndefined();
    expect(seen[0]?.recipes).toBeDefined();
    expect(seen[0]?.normalizedBackground.attachment).toBe('scroll');
  });
});
