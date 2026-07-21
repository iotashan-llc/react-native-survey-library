/**
 * `SurveyTOC` (task 5.7b) — RN port of survey-react-ui's
 * `SurveyProgressToc` (progressToc.tsx). survey-core owns the whole TOC:
 * `createTOCListModel(survey)` returns a `ListModel<Action>` of one nav
 * Action per page (the active item tracks `survey.currentPage`, and each
 * Action navigates through `survey.tryNavigateToPage`), plus the
 * `TOCModel` bundles the mobile-drawer `PopupModel`. This component only
 * RENDERS that model through the shared `ListPicker` (wide side column)
 * or, on mobile, a hamburger toggle that opens the model's PopupModel in
 * the existing overlay stack. These tests pin: one row per page; a row
 * tap navigates via the core Action; the active row reflects (and
 * follows) `currentPage`; `showTOC:false` renders nothing; and the
 * mobile toggle opens the popup list.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';
import { OverlayHost } from '../../overlay/OverlayHost';
import { SurveyTOC } from '../SurveyTOC';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function tocSurvey(extra: Record<string, unknown> = {}): Model {
  return new Model({
    showTOC: true,
    pages: [
      {
        name: 'p1',
        title: 'Page One',
        elements: [{ type: 'text', name: 'q1' }],
      },
      {
        name: 'p2',
        title: 'Page Two',
        elements: [{ type: 'text', name: 'q2' }],
      },
      {
        name: 'p3',
        title: 'Page Three',
        elements: [{ type: 'text', name: 'q3' }],
      },
    ],
    ...extra,
  });
}

describe('SurveyTOC — wide side column', () => {
  it('renders the TOC list with one item per page', async () => {
    const model = tocSurvey();
    render(<SurveyTOC survey={model} location="left" />);
    // ActionContainer.visibleActions recomputes on a debounced microtask
    // (shared list contract) — flush before asserting rows.
    await flush();
    expect(screen.getByTestId('sv-list')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p1')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p2')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p3')).toBeTruthy();
  });

  it('a row tap navigates via the core Action (survey.currentPage changes)', async () => {
    const model = tocSurvey();
    render(<SurveyTOC survey={model} location="left" />);
    await flush();
    expect(model.currentPage.name).toBe('p1');
    fireEvent.press(screen.getByTestId('sv-list-item-p2'));
    expect(model.currentPage.name).toBe('p2');
  });

  it('the active row reflects currentPage and follows a navigation', async () => {
    const model = tocSurvey();
    render(<SurveyTOC survey={model} location="left" />);
    await flush();
    expect(
      screen.getByTestId('sv-list-item-p1').props.accessibilityState?.checked
    ).toBe(true);
    expect(
      screen.getByTestId('sv-list-item-p2').props.accessibilityState?.checked
    ).toBe(false);
    // Navigate through the core Action; the active highlight must follow.
    fireEvent.press(screen.getByTestId('sv-list-item-p2'));
    await flush();
    expect(model.currentPage.name).toBe('p2');
    expect(
      screen.getByTestId('sv-list-item-p1').props.accessibilityState?.checked
    ).toBe(false);
    expect(
      screen.getByTestId('sv-list-item-p2').props.accessibilityState?.checked
    ).toBe(true);
  });

  it('renders nothing when showTOC is false (non-throwing fallback)', () => {
    const model = tocSurvey({ showTOC: false });
    const { toJSON } = render(<SurveyTOC survey={model} location="left" />);
    expect(toJSON()).toBeNull();
    expect(screen.queryByTestId('sv-list')).toBeNull();
  });

  it('an in-place showTOC false→true toggle replaces the empty frame with the built TOC', async () => {
    // Regression (5.7b review #1): the model is built post-render in
    // componentDidUpdate; without the built-now forceUpdate the flip
    // render's null frame would persist until an unrelated property fired.
    const model = tocSurvey({ showTOC: false });
    render(<SurveyTOC survey={model} location="left" />);
    expect(screen.queryByTestId('sv-list')).toBeNull();
    act(() => {
      model.showTOC = true;
    });
    await flush();
    expect(screen.getByTestId('sv-list')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p1')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p3')).toBeTruthy();
  });

  it('the item set follows survey.pages (add / remove a page)', async () => {
    // Regression (5.7b review #2): createTOCListModel registers a `pages`
    // property listener that calls listModel.setItems(getTOCItems(...)),
    // and the ListPicker re-derives rows from renderedActions — so a page
    // added or removed on a mounted TOC must update the row set.
    const model = tocSurvey();
    render(<SurveyTOC survey={model} location="left" />);
    await flush();
    expect(screen.queryByTestId('sv-list-item-p4')).toBeNull();
    act(() => {
      const page = model.addNewPage('p4');
      page.title = 'Page Four';
      page.addNewQuestion('text', 'q4');
    });
    await flush();
    expect(screen.getByTestId('sv-list-item-p4')).toBeTruthy();
    act(() => {
      model.removePage(model.getPageByName('p2'));
    });
    await flush();
    expect(screen.queryByTestId('sv-list-item-p2')).toBeNull();
    expect(screen.getByTestId('sv-list-item-p1')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p4')).toBeTruthy();
  });
});

describe('SurveyTOC — mobile toggle + popup', () => {
  it('the hamburger opens the TOC list in the overlay popup', async () => {
    const model = tocSurvey();
    const stack = createOverlayStack<OverlayPayload>();
    render(
      <>
        <SurveyTOC survey={model} location="mobile" stack={stack} />
        <OverlayHost stack={stack} />
      </>
    );
    expect(screen.getByTestId('survey-toc-toggle')).toBeTruthy();
    // Closed: no list yet.
    expect(screen.queryByTestId('sv-list')).toBeNull();
    fireEvent.press(screen.getByTestId('survey-toc-toggle'));
    await flush();
    // Open: the ListPicker ('sv-list') is presented with one row per page.
    expect(screen.getByTestId('sv-list')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p1')).toBeTruthy();
    expect(screen.getByTestId('sv-list-item-p3')).toBeTruthy();
  });
});
