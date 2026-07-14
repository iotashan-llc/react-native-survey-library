/**
 * Task 1.4 — `SurveyPage`: RN analog of survey-react-ui's `SurveyPage`
 * (page.tsx). Composition scope: title/description via the
 * renderLocString seam (upstream gates description on
 * `page._showDescription`), one `SurveyRow` per visible row with the row
 * index driving first-row rhythm. Page-level errors are 1.7 scope;
 * `survey.afterRenderPage` is the 1.2 bridge's concern, not a DOM
 * callback here.
 */
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { act } from 'react';

import '../../../factories/register-all';
import { Model } from '../../../core/facade';
import type { PageModel, SurveyModel } from '../../../core/facade';
import { SurveyThemeProvider } from '../../../theme-rn/provider';
import { SurveyPage } from '../SurveyPage';

/** RNTL's ReactTestInstance without depending on react-test-renderer's (untyped) package. */
type TestInstance = ReturnType<typeof screen.getByTestId>;

function flatStyle(element: TestInstance): Record<string, unknown> {
  return StyleSheet.flatten(element.props.style) as Record<string, unknown>;
}

function firstRowMarginTop(): unknown {
  return flatStyle(screen.getAllByTestId('sv-row')[0]!).marginTop;
}

function pageFixture(json: Record<string, unknown>): {
  model: SurveyModel;
  page: PageModel;
} {
  const model = new Model(json);
  // Dynamic element adds schedule survey-core's scroll-to-new-element
  // timer. Cancelling through onScrollToTop keeps it out of these
  // component-scoped tests — at runtime the 1.2 lifecycle bridge owns
  // this interception (and the facade's environment stub keeps the
  // un-bridged path from touching DOM APIs).
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
    expect(screen.getByTestId('sv-page-header')).toBeTruthy();
  });

  it('renders no header at all for an untitled page', () => {
    const { model, page } = pageFixture({
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(<SurveyPage page={page} survey={model} creator={{}} />);
    expect(screen.queryByTestId('sv-page-header')).toBeNull();
    expect(screen.queryByText(/./)).toBeNull();
  });
});

describe('SurveyPage — header-adjacent first-row spacing (sd-row.scss `.sd-page__title/.sd-page__description ~`)', () => {
  it('title-only page: first row marginTop calcSize(3)=24', () => {
    const { model, page } = pageFixture({
      pages: [
        {
          name: 'page1',
          title: 'Title Only',
          elements: [{ type: 'empty', name: 'q1' }],
        },
      ],
    });
    render(<SurveyPage page={page} survey={model} creator={{}} />);
    expect(firstRowMarginTop()).toBe(24);
  });

  it('description-only page: first row marginTop 24 (the `.sd-page__description ~` arm)', () => {
    const { model, page } = pageFixture({
      pages: [
        {
          name: 'page1',
          description: 'Description only',
          elements: [{ type: 'empty', name: 'q1' }],
        },
      ],
    });
    render(<SurveyPage page={page} survey={model} creator={{}} />);
    expect(screen.getByText('Description only')).toBeTruthy();
    expect(firstRowMarginTop()).toBe(24);
  });

  it('headerless page: first row stays flush (marginTop 0, `.sd-row:first-of-type`)', () => {
    const { model, page } = pageFixture({
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(<SurveyPage page={page} survey={model} creator={{}} />);
    expect(firstRowMarginTop()).toBe(0);
  });

  it('COMPACT titled page: first row keeps --sd-base-vertical-padding 32 (compact rows are exempt from calcSize(3))', () => {
    const { model, page } = pageFixture({
      pages: [
        {
          name: 'page1',
          title: 'Compact Title',
          elements: [{ type: 'empty', name: 'q1' }],
        },
      ],
    });
    (model as unknown as { isCompact: boolean }).isCompact = true;
    render(<SurveyPage page={page} survey={model} creator={{}} />);
    expect(firstRowMarginTop()).toBe(32);
  });
});

describe('SurveyPage — direction root (A7 RTL primitive at the composition root)', () => {
  it('wraps the page in SurveyDirectionRoot; rtl mode stamps direction "rtl"', () => {
    const { model, page } = pageFixture({
      elements: [{ type: 'empty', name: 'q1' }],
    });
    render(
      <SurveyThemeProvider rtl>
        <SurveyPage page={page} survey={model} creator={{}} />
      </SurveyThemeProvider>
    );
    const root = screen.getByTestId('sv-direction-root');
    expect(flatStyle(root).direction).toBe('rtl');
    expect(within(root).getByTestId('sv-page')).toBeTruthy();
  });

  it('RTL row geometry stays LOGICAL: a two-up row under rtl keeps marginStart -16 / paddingStart 16 (Yoga flips them against the inherited direction)', () => {
    const { model, page } = pageFixture({
      elements: [
        { type: 'empty', name: 'ra' },
        { type: 'empty', name: 'rb', startWithNewLine: false },
      ],
    });
    render(
      <SurveyThemeProvider rtl>
        <SurveyPage page={page} survey={model} creator={{}} />
      </SurveyThemeProvider>
    );
    fireEvent(screen.getAllByTestId('sv-row')[0]!, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 800, height: 0 } },
    });
    expect(flatStyle(screen.getByTestId('sv-row-content')).marginStart).toBe(
      -16
    );
    expect(
      flatStyle(screen.getByTestId('sv-row-element-rb')).paddingStart
    ).toBe(16);
  });
});

describe('SurveyPage — narrow mode (page-level stacking integration)', () => {
  it('a two-up page row under the narrow provider stacks to a column', () => {
    const { model, page } = pageFixture({
      elements: [
        { type: 'empty', name: 'na' },
        { type: 'empty', name: 'nb', startWithNewLine: false },
      ],
    });
    render(
      <SurveyThemeProvider narrow>
        <SurveyPage page={page} survey={model} creator={{}} />
      </SurveyThemeProvider>
    );
    fireEvent(screen.getAllByTestId('sv-row')[0]!, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 0 } },
    });
    const content = flatStyle(screen.getByTestId('sv-row-content'));
    expect(content.flexDirection).toBe('column');
    expect(content.marginStart).toBeUndefined();
    expect(
      flatStyle(screen.getByTestId('sv-row-element-na')).flexBasis
    ).toBeUndefined();
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
