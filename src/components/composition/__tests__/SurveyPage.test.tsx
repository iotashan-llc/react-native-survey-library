/**
 * Task 1.4 — `SurveyPage`: RN analog of survey-react-ui's `SurveyPage`
 * (page.tsx). Composition scope: title/description via the
 * renderLocString seam (upstream gates description on
 * `page._showDescription`), one `SurveyRow` per visible row with the row
 * index driving first-row rhythm. Page-level errors are 1.7 scope;
 * `survey.afterRenderPage` is the 1.2 bridge's concern, not a DOM
 * callback here.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { act } from 'react';

import '../../../factories/register-all';
import { Model } from '../../../core/facade';
import type { PageModel, SurveyModel } from '../../../core/facade';
import { SurveyPage } from '../SurveyPage';

function pageFixture(json: Record<string, unknown>): {
  model: SurveyModel;
  page: PageModel;
} {
  const model = new Model(json);
  // Dynamic element adds schedule survey-core's scroll-to-new-element
  // timer, which dereferences `settings.environment.rootElement` (absent
  // on RN). Cancelling through onScrollToTop is the supported seam — the
  // 1.2 native lifecycle bridge owns this interception at runtime.
  model.onScrollToTop.add((_, options) => {
    options.cancel = true;
  });
  return { model, page: model.currentPage as PageModel };
}

describe('SurveyPage — rows', () => {
  it('renders one sv-row per visible row, first row flush (marginTop 0), later rows on the page rhythm (16)', () => {
    const { model, page } = pageFixture({
      pages: [
        {
          name: 'page1',
          elements: [
            { type: 'empty', name: 'q1' },
            { type: 'empty', name: 'q2' },
          ],
        },
      ],
    });
    render(<SurveyPage page={page} survey={model} creator={{}} />);
    const rows = screen.getAllByTestId('sv-row');
    expect(rows).toHaveLength(2);
    const first = StyleSheet.flatten(rows[0]!.props.style) as Record<
      string,
      unknown
    >;
    const second = StyleSheet.flatten(rows[1]!.props.style) as Record<
      string,
      unknown
    >;
    expect(first.marginTop).toBe(0);
    expect(second.marginTop).toBe(16);
  });
});

describe('SurveyPage — header', () => {
  it('renders the page title and description', () => {
    const { model, page } = pageFixture({
      pages: [
        {
          name: 'page1',
          title: 'Page Title',
          description: 'Page description',
          elements: [{ type: 'empty', name: 'q1' }],
        },
      ],
    });
    render(<SurveyPage page={page} survey={model} creator={{}} />);
    expect(screen.getByText('Page Title')).toBeTruthy();
    expect(screen.getByText('Page description')).toBeTruthy();
  });

  it('renders no header text for an untitled page', () => {
    const { model, page } = pageFixture({
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(<SurveyPage page={page} survey={model} creator={{}} />);
    expect(screen.queryByText(/./)).toBeNull();
  });
});

describe('SurveyPage — add/remove elements (reactive rows array)', () => {
  it('adding a question grows the row list; removing it shrinks it back', () => {
    const { model, page } = pageFixture({
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(<SurveyPage page={page} survey={model} creator={{}} />);
    expect(screen.getAllByTestId('sv-row')).toHaveLength(1);

    let added: unknown;
    act(() => {
      // 'text', not 'empty': addNewQuestion goes through survey-core's
      // QuestionFactory, which does not register 'empty' (JSON
      // deserialization does) — 'empty' here would return null and
      // silently add nothing.
      added = page.addNewQuestion('text', 'q-added');
    });
    expect(added).not.toBeNull();
    expect(screen.getAllByTestId('sv-row')).toHaveLength(2);

    act(() => {
      page.removeElement(added as never);
    });
    expect(screen.getAllByTestId('sv-row')).toHaveLength(1);
  });
});

describe('SurveyPage — visibility', () => {
  it('renders null for an invisible page', () => {
    const { model, page } = pageFixture({
      pages: [
        {
          name: 'page1',
          visible: false,
          elements: [{ type: 'empty', name: 'q1' }],
        },
        {
          name: 'page2',
          elements: [{ type: 'empty', name: 'q2' }],
        },
      ],
    });
    const hidden = model.getPageByName('page1') as PageModel;
    const { toJSON } = render(
      <SurveyPage page={hidden} survey={model} creator={{}} />
    );
    expect(toJSON()).toBeNull();
    expect(page.name).toBe('page2');
  });
});
