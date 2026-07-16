/**
 * Survey-scoped URI-policy context (task 1.1, review round 1 major #2):
 * ONE `uriPolicy` prop on `<Survey>` must reach every render-time sink —
 * not only the JSON preflight. Sinks keep their explicit config props
 * (prop wins over context; 0.9 seams unchanged).
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { RNElementFactory } from '../../factories/ElementFactory';
import { UriPolicyContext } from '../UriPolicyContext';
import { SanitizedHtml } from '../../components/SanitizedHtml';
import { SurveyHeader } from '../../components/SurveyHeader';
import { Survey } from '../../survey/Survey';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

const CDN_ALLOWED = { allowedOrigins: ['https://cdn.example.com'] };

function captureDiagnostics(): DiagnosticPayload[] {
  const payloads: DiagnosticPayload[] = [];
  setDiagnosticHandler((p) => payloads.push(p));
  return payloads;
}

afterEach(() => {
  setDiagnosticHandler(undefined);
});

describe('SanitizedHtml consumes the survey-scoped policy context', () => {
  // Remote https images are ALWAYS stripped from HTML content (redirect
  // fail-closed rule) — the config-observable is the diagnostic code:
  // origin NOT allowlisted -> 'uri-rejected'; origin allowlisted (policy
  // passed, redirect rule strips) -> 'remote-image-stripped'.
  const HTML = '<p>hi</p><img src="https://cdn.example.com/a.png">';

  function sanitizeCodesOf(payloads: DiagnosticPayload[]): string[] {
    return payloads
      .filter((p) => p.code === 'sanitized-html-diagnostic')
      .map((p) => (p as { sanitizeCode: string }).sanitizeCode);
  }

  it('without any config, the remote <img> origin is rejected outright', () => {
    const payloads = captureDiagnostics();
    render(<SanitizedHtml html={HTML} />);
    expect(sanitizeCodesOf(payloads)).toContain('uri-rejected');
    expect(sanitizeCodesOf(payloads)).not.toContain('remote-image-stripped');
  });

  it('a context-provided allowlist reaches the sink (no explicit prop): origin passes policy', () => {
    const payloads = captureDiagnostics();
    render(
      <UriPolicyContext.Provider value={CDN_ALLOWED}>
        <SanitizedHtml html={HTML} />
      </UriPolicyContext.Provider>
    );
    expect(sanitizeCodesOf(payloads)).toContain('remote-image-stripped');
    expect(sanitizeCodesOf(payloads)).not.toContain('uri-rejected');
  });

  it('an explicit imageUriConfig prop wins over the context', () => {
    const payloads = captureDiagnostics();
    render(
      <UriPolicyContext.Provider value={CDN_ALLOWED}>
        <SanitizedHtml
          html={HTML}
          imageUriConfig={{ allowedOrigins: ['https://other.example'] }}
        />
      </UriPolicyContext.Provider>
    );
    expect(sanitizeCodesOf(payloads)).toContain('uri-rejected');
    expect(sanitizeCodesOf(payloads)).not.toContain('remote-image-stripped');
  });
});

describe('SurveyHeader logo consumes the survey-scoped policy context', () => {
  function headerModel(): Model {
    return new Model({
      title: 'T',
      logo: 'https://cdn.example.com/logo.png',
      elements: [{ type: 'text', name: 'q1' }],
    });
  }

  it('without any config, the remote logo is blocked fail-closed', () => {
    const payloads = captureDiagnostics();
    render(<SurveyHeader survey={headerModel() as never} />);
    expect(screen.queryByTestId('survey-logo-image')).toBeNull();
    expect(payloads.some((p) => p.code === 'image-uri-blocked')).toBe(true);
  });

  it('a context-provided allowlist reaches the logo sink', () => {
    const payloads = captureDiagnostics();
    render(
      <UriPolicyContext.Provider value={CDN_ALLOWED}>
        <SurveyHeader survey={headerModel() as never} />
      </UriPolicyContext.Provider>
    );
    expect(screen.getByTestId('survey-logo-image')).toBeTruthy();
    expect(payloads.some((p) => p.code === 'image-uri-blocked')).toBe(false);
  });
});

describe('<Survey> provides its uriPolicy through the context', () => {
  it('a sink rendered inside the Survey tree receives the uriPolicy prop as its context default', () => {
    // Probe component: registered as the page element so it renders
    // INSIDE Survey's real tree, then reports the context it sees.
    const seen: Array<unknown> = [];
    function ContextProbe(): React.JSX.Element | null {
      seen.push(React.useContext(UriPolicyContext));
      return null;
    }
    // File-scoped registration (the factory has no unregister; key-list
    // assertions live in other test files with their own module registry).
    RNElementFactory.registerElement('uri-policy-probe', () => (
      <ContextProbe key="probe" />
    ));
    // `pageComponent` is a react-layer (non-serialized) model member —
    // set on a host-owned model, exactly how upstream consumers use it.
    const model = new Model({ elements: [{ type: 'text', name: 'q1' }] });
    (model as unknown as { pageComponent: string }).pageComponent =
      'uri-policy-probe';
    render(<Survey model={model as never} uriPolicy={CDN_ALLOWED} />);
    expect(seen).toContain(CDN_ALLOWED);
  });
});
