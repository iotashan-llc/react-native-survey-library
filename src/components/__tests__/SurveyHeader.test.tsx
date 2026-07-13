/**
 * `SurveyHeader` — RN port of survey-react-ui's `SurveyHeader`
 * (components/survey-header/survey-header.tsx) + `LogoImage`
 * (logo-image.tsx): the BASIC header of task 1.6 — title, description,
 * logo. Contract under test:
 *
 * - render gate is the MODEL's (`renderedHasHeader` =
 *   `renderedHasTitle || renderedHasLogo`; `showTitle: false` hides
 *   title+description but a logo still renders the header);
 * - title/description render through the locstring viewer (subscribed);
 * - the logo is an RN `Image` whose URI passed the central URI policy
 *   (context `'image'`) — a blocked URI renders NO image and reports a
 *   structured diagnostic (invariant 8/9: fail-closed, never crash);
 * - `logoFit` maps to `resizeMode` (fill → stretch, none → center);
 * - `isLogoBefore`/`isLogoAfter` ordering (logoPosition left/right);
 * - header is reactive via the ported `SurveyElementBase` mechanism: a
 *   survey-level property change (title appearing, logo swap) re-renders
 *   WITHOUT any manual `locLogo.onChanged` clobbering (upstream's
 *   `locLogo.onChanged = function(){...}` overwrite is deliberately NOT
 *   ported — the reactive base + viewer subscriptions cover it).
 */
import { render, screen, act } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { Model } from '../../core/facade';
import '../../factories/register-all';
import { RNElementFactory } from '../../factories/ElementFactory';
import { SurveyHeader } from '../SurveyHeader';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

const LOGO_URL = 'https://example.com/logo.png';

/** `image` is an automatic-fetch context: 0.9's URI policy is fail-closed
 * on ORIGINS — a remote logo renders only when its origin is allowlisted
 * (task 1.1 threads this from Survey-level config). */
const ALLOW_LOGO = { allowedOrigins: ['https://example.com'] };

afterEach(() => {
  setDiagnosticHandler(undefined);
});

function headerChildTestIds(): string[] {
  // Host-component tree (composite children like LogoImage collapse to
  // their rendered Views, which carry the testIDs).
  const json = screen.toJSON() as {
    props?: { testID?: string };
    children?: Array<string | { props?: { testID?: string } }>;
  };
  return (json.children ?? [])
    .map((child) =>
      typeof child === 'string' ? undefined : child.props?.testID
    )
    .filter(Boolean) as string[];
}

describe('SurveyHeader — render gate', () => {
  it('renders null when the model has neither title nor logo', () => {
    const model = new Model({ elements: [{ type: 'empty', name: 'q1' }] });
    expect(model.renderedHasHeader).toBe(false);
    const { toJSON } = render(<SurveyHeader survey={model} />);
    expect(toJSON()).toBeNull();
  });

  it('renders title and description', () => {
    const model = new Model({
      title: 'My Survey',
      description: 'A helpful description',
    });
    render(<SurveyHeader survey={model} />);
    expect(screen.getByTestId('survey-header')).toBeTruthy();
    expect(screen.getByText('My Survey')).toBeTruthy();
    expect(screen.getByText('A helpful description')).toBeTruthy();
  });

  it('renders null with showTitle: false and no logo', () => {
    const model = new Model({ title: 'Hidden', showTitle: false });
    const { toJSON } = render(<SurveyHeader survey={model} />);
    expect(toJSON()).toBeNull();
  });

  it('with showTitle: false but a logo, renders the header with the logo and WITHOUT title/description', () => {
    const model = new Model({
      title: 'Hidden',
      description: 'Also hidden',
      showTitle: false,
      logo: LOGO_URL,
    });
    render(<SurveyHeader survey={model} logoUriConfig={ALLOW_LOGO} />);
    expect(screen.getByTestId('survey-logo-image')).toBeTruthy();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.queryByText('Also hidden')).toBeNull();
  });
});

describe('SurveyHeader — logo', () => {
  it('renders an Image with the validated URI; serializer defaults: height 40, width omitted (logoWidth default "auto" → renderedLogoWidth undefined — documented RN delta)', () => {
    const model = new Model({ title: 't', logo: LOGO_URL });
    render(<SurveyHeader survey={model} logoUriConfig={ALLOW_LOGO} />);
    const image = screen.getByTestId('survey-logo-image');
    expect(image.props.source).toEqual({ uri: LOGO_URL });
    const flat = StyleSheet.flatten(image.props.style);
    expect(flat.width).toBeUndefined();
    expect(flat.height).toBe(40);
  });

  it('applies explicit numeric logoWidth/logoHeight from the survey JSON', () => {
    const model = new Model({
      title: 't',
      logo: LOGO_URL,
      logoWidth: '300px',
      logoHeight: '60px',
    });
    render(<SurveyHeader survey={model} logoUriConfig={ALLOW_LOGO} />);
    const flat = StyleSheet.flatten(
      screen.getByTestId('survey-logo-image').props.style
    );
    expect(flat.width).toBe(300);
    expect(flat.height).toBe(60);
  });

  it('maps logoFit to resizeMode (default contain; fill → stretch; none → center)', () => {
    const model = new Model({ title: 't', logo: LOGO_URL });
    const view = render(
      <SurveyHeader survey={model} logoUriConfig={ALLOW_LOGO} />
    );
    expect(screen.getByTestId('survey-logo-image').props.resizeMode).toBe(
      'contain'
    );
    act(() => {
      model.logoFit = 'fill';
    });
    expect(screen.getByTestId('survey-logo-image').props.resizeMode).toBe(
      'stretch'
    );
    act(() => {
      model.logoFit = 'none';
    });
    expect(screen.getByTestId('survey-logo-image').props.resizeMode).toBe(
      'center'
    );
    view.unmount();
  });

  it('renders NO image and reports a structured diagnostic for a blocked URI scheme', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => payloads.push(payload));
    const model = new Model({
      title: 't',
      // eslint-disable-next-line no-script-url
      logo: 'javascript:alert(1)',
    });
    render(<SurveyHeader survey={model} />);
    expect(screen.queryByTestId('survey-logo-image')).toBeNull();
    const blocked = payloads.filter((p) => p.code === 'image-uri-blocked');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ source: 'survey-logo' });
  });

  it('renders NO image for a remote origin NOT in the allowlist (0.9 fail-closed automatic-fetch default) and reports origin-not-allowlisted', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => payloads.push(payload));
    const model = new Model({ title: 't', logo: LOGO_URL });
    render(<SurveyHeader survey={model} />);
    expect(screen.queryByTestId('survey-logo-image')).toBeNull();
    expect(payloads).toContainEqual(
      expect.objectContaining({
        code: 'image-uri-blocked',
        source: 'survey-logo',
        reason: 'origin-not-allowlisted',
      })
    );
  });

  it('orders logo before the text block for the default logoPosition ("left")', () => {
    const model = new Model({ title: 't', logo: LOGO_URL });
    expect(model.isLogoBefore).toBe(true);
    render(<SurveyHeader survey={model} logoUriConfig={ALLOW_LOGO} />);
    expect(headerChildTestIds()).toEqual(['survey-logo', 'survey-header-text']);
  });

  it('orders logo after the text block for logoPosition "right"', () => {
    const model = new Model({
      title: 't',
      logo: LOGO_URL,
      logoPosition: 'right',
    });
    expect(model.isLogoAfter).toBe(true);
    render(<SurveyHeader survey={model} logoUriConfig={ALLOW_LOGO} />);
    expect(headerChildTestIds()).toEqual(['survey-header-text', 'survey-logo']);
  });
});

describe('SurveyHeader — reactivity (ported SurveyElementBase mechanism)', () => {
  it('appears when a title is assigned to a previously headerless survey', () => {
    const model = new Model({ elements: [{ type: 'empty', name: 'q1' }] });
    const { toJSON } = render(<SurveyHeader survey={model} />);
    expect(toJSON()).toBeNull();
    act(() => {
      model.title = 'Now present';
    });
    expect(screen.getByText('Now present')).toBeTruthy();
  });

  it('updates the title text in place (locstring subscription)', () => {
    const model = new Model({ title: 'First title' });
    render(<SurveyHeader survey={model} />);
    act(() => {
      model.title = 'Second title';
    });
    expect(screen.getByText('Second title')).toBeTruthy();
    expect(screen.queryByText('First title')).toBeNull();
  });

  it('swaps the logo image when survey.logo changes', () => {
    const model = new Model({ title: 't', logo: LOGO_URL });
    render(<SurveyHeader survey={model} logoUriConfig={ALLOW_LOGO} />);
    const nextUrl = 'https://example.com/logo-two.png';
    act(() => {
      model.logo = nextUrl;
    });
    expect(screen.getByTestId('survey-logo-image').props.source).toEqual({
      uri: nextUrl,
    });
  });

  it('unsubscribes from the survey on unmount (no leak)', () => {
    const model = new Model({ title: 'Leak' });
    const view = render(<SurveyHeader survey={model} />);
    expect(model.hasActiveUISubscribers).toBe(true);
    view.unmount();
    expect(model.hasActiveUISubscribers).toBe(false);
  });
});

describe('SurveyHeader — logo wrapper dispatch (upstream getElementWrapperComponentName/Data parity)', () => {
  it('default path: the logo resolves through the factory under the core-provided "sv-logo-image" key with the survey as data', () => {
    const model = new Model({ title: 't', logo: LOGO_URL });
    expect(model.getElementWrapperComponentName(model, 'logo-image')).toBe(
      'sv-logo-image'
    );
    expect(model.getElementWrapperComponentData(model, 'logo-image')).toBe(
      model
    );
    render(<SurveyHeader survey={model} logoUriConfig={ALLOW_LOGO} />);
    expect(screen.getByTestId('survey-logo-image')).toBeTruthy();
  });

  it('a host onElementWrapperComponentName override routes the logo to the custom registered element (host wrapper extension surface honored)', () => {
    const received: unknown[] = [];
    RNElementFactory.registerElement(
      'custom-logo-probe',
      (props: { data?: unknown }) => {
        received.push(props.data);
        return <Text testID="custom-logo-probe">custom logo</Text>;
      }
    );
    const model = new Model({ title: 't', logo: LOGO_URL });
    model.onElementWrapperComponentName.add((_, options) => {
      if (options.reason === 'logo-image') {
        options.componentName = 'custom-logo-probe';
      }
    });
    render(<SurveyHeader survey={model} />);
    expect(screen.getByTestId('custom-logo-probe')).toBeTruthy();
    expect(screen.queryByTestId('survey-logo-image')).toBeNull();
    // Identity asserts (deep-walking a SurveyModel in toEqual recurses
    // into DOM-flavored getters and explodes off-platform); render COUNT
    // is not the contract — the 0.4 base class re-renders once after
    // mount by design (D4 reconcile).
    expect(received.length).toBeGreaterThanOrEqual(1);
    received.forEach((data) => expect(data).toBe(model));
  });

  it('a host onElementWrapperComponentData override reaches the custom element as its data prop (transformed data not silently dropped)', () => {
    const received: unknown[] = [];
    RNElementFactory.registerElement(
      'custom-logo-data-probe',
      (props: { data?: unknown }) => {
        received.push(props.data);
        return <Text testID="custom-logo-data-probe">wrapped</Text>;
      }
    );
    const model = new Model({ title: 't', logo: LOGO_URL });
    const transformed = { survey: model, badge: 'wrapped' };
    model.onElementWrapperComponentName.add((_, options) => {
      if (options.reason === 'logo-image') {
        options.componentName = 'custom-logo-data-probe';
      }
    });
    model.onElementWrapperComponentData.add((_, options) => {
      if (options.reason === 'logo-image') {
        options.data = transformed;
      }
    });
    render(<SurveyHeader survey={model} />);
    expect(screen.getByTestId('custom-logo-data-probe')).toBeTruthy();
    expect(received.length).toBeGreaterThanOrEqual(1);
    received.forEach((data) => expect(data).toBe(transformed));
  });

  it('fail-closed on a factory miss: an unregistered wrapper name renders NO logo (header itself survives) + one element-wrapper-missing diagnostic', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => payloads.push(payload));
    const model = new Model({ title: 'Still here', logo: LOGO_URL });
    model.onElementWrapperComponentName.add((_, options) => {
      if (options.reason === 'logo-image') {
        options.componentName = 'never-registered-logo';
      }
    });
    render(<SurveyHeader survey={model} logoUriConfig={ALLOW_LOGO} />);
    expect(screen.getByText('Still here')).toBeTruthy();
    expect(screen.queryByTestId('survey-logo')).toBeNull();
    expect(screen.queryByTestId('survey-logo-image')).toBeNull();
    const missing = payloads.filter(
      (p) => p.code === 'element-wrapper-missing'
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      componentName: 'never-registered-logo',
      reason: 'logo-image',
    });
  });
});

describe('SurveyHeader — registration', () => {
  it('register-all registers "survey-header" and "sv-logo-image" element keys', () => {
    expect(RNElementFactory.isElementRegistered('survey-header')).toBe(true);
    expect(RNElementFactory.isElementRegistered('sv-logo-image')).toBe(true);
  });
});
