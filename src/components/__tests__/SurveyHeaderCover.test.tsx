/**
 * `SurveyHeader` — advanced header / cover (task 5.6). RN port of
 * survey-react-ui's `Header`/`HeaderCell` (components/header.tsx) + the
 * survey-core `Cover`/`CoverCell` model (header.ts).
 *
 * The advanced cover is a SURVEY-LEVEL construct: it exists only after a
 * theme carrying a `header` block (or explicit `headerView: 'advanced'`)
 * is applied via `survey.applyTheme`, which builds a `Cover` and inserts
 * it as the `advanced-header` layout element. This suite drives that path
 * directly (Survey.tsx does the same `applyTheme` on theme change).
 *
 * Contract under test:
 * - when `survey.headerView === 'advanced'` and the cover is non-empty,
 *   the header renders the COVER (background layer + a 3x3 grid placing
 *   logo/title/description in the cell matching their positionX/Y), NOT
 *   the basic title/description column;
 * - the background image goes through the central URI policy (context
 *   `image`) exactly like the logo — a blocked URI drops the image to a
 *   plain color background (never crash) and reports a structured
 *   `image-uri-blocked` diagnostic (source `survey-header-background`);
 * - the basic header is unchanged when `headerView` is `basic`;
 * - height / overlap / textAreaWidth are consumed from the model.
 */
import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Model } from '../../core/facade';
import '../../factories/register-all';
import { SurveyHeader, resolveCoverTextAlign } from '../SurveyHeader';
import { UriPolicyContext } from '../../security/UriPolicyContext';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

const LOGO_URL = 'https://example.com/logo.png';
const BG_URL = 'https://example.com/cover-bg.png';
const ALLOW = { allowedOrigins: ['https://example.com'] };

afterEach(() => {
  setDiagnosticHandler(undefined);
});

/** Build a survey with an advanced-header cover applied (mirrors the
 * runtime `Survey.tsx` → `model.applyTheme(theme)` path). */
function advancedModel(
  header: Record<string, unknown> = {},
  surveyJson: Record<string, unknown> = {}
): Model {
  const model = new Model({
    title: 'Cover Title',
    description: 'Cover Description',
    logo: LOGO_URL,
    ...surveyJson,
  });
  model.applyTheme({
    headerView: 'advanced',
    header: header as any,
  } as any);
  return model;
}

function renderInPolicy(node: React.JSX.Element) {
  return render(
    <UriPolicyContext.Provider value={ALLOW}>{node}</UriPolicyContext.Provider>
  );
}

describe('SurveyHeader — advanced cover render gate', () => {
  it('renders the cover (not the basic header) when headerView is advanced', () => {
    const model = advancedModel({ height: 300 });
    expect(model.headerView).toBe('advanced');
    renderInPolicy(<SurveyHeader survey={model} />);
    expect(screen.getByTestId('survey-header-cover')).toBeTruthy();
    expect(screen.queryByTestId('survey-header')).toBeNull();
    expect(screen.getByText('Cover Title')).toBeTruthy();
    expect(screen.getByText('Cover Description')).toBeTruthy();
  });

  it('renders the BASIC header (not the cover) when headerView is basic', () => {
    const model = new Model({
      title: 'Basic Title',
      description: 'Basic Desc',
    });
    expect(model.headerView).toBe('basic');
    render(<SurveyHeader survey={model} />);
    expect(screen.getByTestId('survey-header')).toBeTruthy();
    expect(screen.queryByTestId('survey-header-cover')).toBeNull();
    expect(screen.getByText('Basic Title')).toBeTruthy();
  });

  it('renders null for an advanced cover with no logo/title/description (cover.isEmpty)', () => {
    const model = new Model({ elements: [{ type: 'empty', name: 'q1' }] });
    model.applyTheme({
      headerView: 'advanced',
      header: { backgroundColor: '#123456' },
    } as any);
    const { toJSON } = render(<SurveyHeader survey={model} />);
    expect(toJSON()).toBeNull();
  });
});

describe('SurveyHeader — advanced cover 3x3 positioning grid', () => {
  it('places logo/title/description into the cell matching their positionX/Y', () => {
    // Fixed height => all three grid rows exist, so gridRow is the literal
    // row number (no empty-row collapse). logo top-right => (1,3);
    // description middle-center => (2,2); title bottom-left => (3,1).
    const model = advancedModel({
      height: 300,
      logoPositionX: 'right',
      logoPositionY: 'top',
      titlePositionX: 'left',
      titlePositionY: 'bottom',
      descriptionPositionX: 'center',
      descriptionPositionY: 'middle',
    });
    renderInPolicy(<SurveyHeader survey={model} />);

    const logoCell = screen.getByTestId('cover-cell-1-3');
    expect(within(logoCell).getByTestId('survey-logo')).toBeTruthy();

    const descCell = screen.getByTestId('cover-cell-2-2');
    expect(within(descCell).getByText('Cover Description')).toBeTruthy();

    const titleCell = screen.getByTestId('cover-cell-3-1');
    expect(within(titleCell).getByText('Cover Title')).toBeTruthy();
  });

  it('collapses empty grid rows when the cover has no explicit height (logo top, title/description bottom render in adjacent visual rows)', () => {
    // No height => getVisibleRows collapse: logo row1, title/desc row3
    // become visual rows 1 and 2.
    const model = advancedModel({});
    renderInPolicy(<SurveyHeader survey={model} />);
    const logoCell = screen.getByTestId('cover-cell-1-1');
    expect(within(logoCell).getByTestId('survey-logo')).toBeTruthy();
    const textCell = screen.getByTestId('cover-cell-2-1');
    expect(within(textCell).getByText('Cover Title')).toBeTruthy();
    expect(within(textCell).getByText('Cover Description')).toBeTruthy();
  });

  it('aligns a right-positioned cell to flex-end (positionX honored)', () => {
    const model = advancedModel({
      height: 300,
      logoPositionX: 'right',
      logoPositionY: 'top',
    });
    renderInPolicy(<SurveyHeader survey={model} />);
    const logoCell = screen.getByTestId('cover-cell-1-3');
    const flat = StyleSheet.flatten(logoCell.props.style);
    expect(flat.alignItems).toBe('flex-end');
  });
});

describe('SurveyHeader — advanced cover background image (URI policy)', () => {
  it('renders the background image through the URI policy with fit→resizeMode and opacity', () => {
    const model = advancedModel({
      height: 300,
      backgroundImage: BG_URL,
      backgroundImageFit: 'contain',
      backgroundImageOpacity: 0.5,
    });
    renderInPolicy(<SurveyHeader survey={model} />);
    // ImageBackground forwards source/resizeMode + merges imageStyle onto
    // the underlying <Image> (the testID node), not a separate prop.
    const bg = screen.getByTestId('survey-header-bg');
    expect(bg.props.source).toEqual({ uri: BG_URL });
    expect(bg.props.resizeMode).toBe('contain');
    expect(StyleSheet.flatten(bg.props.style).opacity).toBe(0.5);
  });

  it('drops a blocked background URI to a plain color background and reports image-uri-blocked (source survey-header-background)', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => payloads.push(payload));
    const model = advancedModel({
      height: 300,
      // eslint-disable-next-line no-script-url
      backgroundImage: 'javascript:alert(1)',
      backgroundColor: '#123456',
    });
    render(<SurveyHeader survey={model} />);
    // Cover still renders (color fallback), just no image layer.
    expect(screen.getByTestId('survey-header-cover')).toBeTruthy();
    expect(screen.queryByTestId('survey-header-bg')).toBeNull();
    // (The un-allowlisted logo emits its own survey-logo diagnostic here;
    // scope the assertion to the background sink.)
    const blocked = payloads.filter(
      (p) =>
        p.code === 'image-uri-blocked' &&
        p.source === 'survey-header-background'
    );
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ reason: 'scheme-denied-immutable' });
  });

  it('drops a non-allowlisted remote background origin (fail-closed) and still renders the cover', () => {
    const payloads: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => payloads.push(payload));
    // No UriPolicyContext provider => origin not allowlisted.
    const model = advancedModel({ height: 300, backgroundImage: BG_URL });
    render(<SurveyHeader survey={model} />);
    expect(screen.getByTestId('survey-header-cover')).toBeTruthy();
    expect(screen.queryByTestId('survey-header-bg')).toBeNull();
    expect(payloads).toContainEqual(
      expect.objectContaining({
        code: 'image-uri-blocked',
        source: 'survey-header-background',
        reason: 'origin-not-allowlisted',
      })
    );
  });
});

describe('SurveyHeader — advanced cover dimensions', () => {
  it('applies the model height (renderedHeight px) to the cover root', () => {
    const model = advancedModel({ height: 240 });
    renderInPolicy(<SurveyHeader survey={model} />);
    const flat = StyleSheet.flatten(
      screen.getByTestId('survey-header-cover').props.style
    );
    expect(flat.height).toBe(240);
  });

  it('applies an overlap offset (negative bottom margin) when overlapEnabled with a background', () => {
    // `cover.hasBackground` gates overlap; a serialized backgroundImage
    // satisfies it (backgroundColor is driven by theme cssVariables, not
    // the header JSON — see the model probe).
    const model = advancedModel({
      height: 240,
      overlapEnabled: true,
      backgroundImage: BG_URL,
    });
    renderInPolicy(<SurveyHeader survey={model} />);
    const flat = StyleSheet.flatten(
      screen.getByTestId('survey-header-cover').props.style
    );
    expect(typeof flat.marginBottom).toBe('number');
    expect(flat.marginBottom as number).toBeLessThan(0);
  });
});

describe('SurveyHeader — advanced cover reactivity', () => {
  it('unsubscribes from the survey on unmount (no leak)', () => {
    const model = advancedModel({ height: 300 });
    const view = renderInPolicy(<SurveyHeader survey={model} />);
    expect(model.hasActiveUISubscribers).toBe(true);
    view.unmount();
    expect(model.hasActiveUISubscribers).toBe(false);
  });
});

describe('resolveCoverTextAlign — RTL mirroring (M6 RTL audit)', () => {
  // RN textAlign 'left'/'right' does not follow Yoga direction, so core's
  // logical start/end must be mirrored against the survey direction.
  it('LTR: start→left, end→right, center→center, default→left', () => {
    expect(resolveCoverTextAlign('start', false)).toBe('left');
    expect(resolveCoverTextAlign('end', false)).toBe('right');
    expect(resolveCoverTextAlign('center', false)).toBe('center');
    expect(resolveCoverTextAlign(undefined, false)).toBe('left');
  });

  it('RTL: start→right, end→left, center→center, default→right', () => {
    expect(resolveCoverTextAlign('start', true)).toBe('right');
    expect(resolveCoverTextAlign('end', true)).toBe('left');
    expect(resolveCoverTextAlign('center', true)).toBe('center');
    expect(resolveCoverTextAlign(undefined, true)).toBe('right');
  });
});
