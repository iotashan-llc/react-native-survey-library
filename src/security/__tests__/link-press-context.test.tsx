/**
 * Survey-level `onLinkPress` (host opt-in link events; v0.2.1 codex
 * finding: inert anchors exposed a dead a11y link role). Contract under
 * test:
 *
 * - `<Survey onLinkPress>` provides ONE typed handler through
 *   `LinkPressContext`, reaching EVERY `<SanitizedHtml>` sink (titles /
 *   descriptions / errors / completed-page / html question / choices)
 *   without per-sink wiring;
 * - the handler receives `{ url, context }` where `url` is the
 *   press-time policy-REVALIDATED canonical URI and `context` names the
 *   sink (`'title' | 'description' | 'html-question' | 'error' |
 *   'completed' | 'choice' | ...`);
 * - fail-closed: a policy-failing href never reaches the handler — the
 *   sanitizer strips it, the anchor stays plain text (no link role);
 * - a11y-honest: with NO resolvable callback an anchor is plain text —
 *   link role and pressability appear only when a press actually does
 *   something;
 * - an explicit `SanitizedHtml onLinkPress` prop wins over the context
 *   (0.9 per-sink seams unchanged);
 * - handler identity changes are live (reactive across re-renders).
 */
import { Linking } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import '../../factories/register-all';
import { SanitizedHtml } from '../../components/SanitizedHtml';
import { SurveyLocStringViewer } from '../../components/LocStringViewer';
import { SurveyElementBase } from '../../reactivity/SurveyElementBase';
import { LinkPressContext } from '../LinkPressContext';
import type { SurveyLinkPressEvent } from '../LinkPressContext';
import { Survey } from '../../survey/Survey';

const ANCHOR_HTML = '<p><a href="https://example.com/x">click me</a></p>';

let openURLSpy: jest.SpiedFunction<typeof Linking.openURL>;

beforeEach(() => {
  openURLSpy = jest.spyOn(Linking, 'openURL').mockImplementation(() => {
    throw new Error('Linking.openURL must never be called by this library');
  });
});

afterEach(() => {
  openURLSpy.mockRestore();
});

describe('SanitizedHtml consumes the survey-scoped link-press context', () => {
  it('a context-provided handler makes the anchor actionable: link role present, press delivers {url, context} (default context "html")', () => {
    const handler = jest.fn();
    render(
      <LinkPressContext.Provider value={handler}>
        <SanitizedHtml html={ANCHOR_HTML} contentWidth={320} />
      </LinkPressContext.Provider>
    );

    expect(screen.getByTestId('a').props.accessibilityRole).toBe('link');
    fireEvent.press(screen.getByText('click me'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      url: 'https://example.com/x',
      context: 'html',
    } satisfies SurveyLinkPressEvent);
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('the linkContext prop labels the sink in the delivered event', () => {
    const handler = jest.fn();
    render(
      <LinkPressContext.Provider value={handler}>
        <SanitizedHtml
          html={ANCHOR_HTML}
          linkContext="completed"
          contentWidth={320}
        />
      </LinkPressContext.Provider>
    );

    fireEvent.press(screen.getByText('click me'));

    expect(handler).toHaveBeenCalledWith({
      url: 'https://example.com/x',
      context: 'completed',
    });
  });

  it('an explicit onLinkPress prop wins over the context handler (per-sink seam unchanged)', () => {
    const contextHandler = jest.fn();
    const propHandler = jest.fn();
    render(
      <LinkPressContext.Provider value={contextHandler}>
        <SanitizedHtml
          html={ANCHOR_HTML}
          onLinkPress={propHandler}
          contentWidth={320}
        />
      </LinkPressContext.Provider>
    );

    fireEvent.press(screen.getByText('click me'));

    expect(propHandler).toHaveBeenCalledTimes(1);
    expect(propHandler.mock.calls[0]?.[0]).toBe('https://example.com/x');
    expect(contextHandler).not.toHaveBeenCalled();
  });

  it('fail-closed: a policy-failing href (javascript:) with a context handler present — no link role, handler never fires', () => {
    const html = '<p><a href="javascript:alert(1)">bad link</a></p>';
    const handler = jest.fn();
    render(
      <LinkPressContext.Provider value={handler}>
        <SanitizedHtml html={html} contentWidth={320} />
      </LinkPressContext.Provider>
    );

    const anchor = screen.getByTestId('a');
    expect(anchor.props.accessibilityRole).toBeUndefined();
    expect(anchor.props.onPress).toBeUndefined();

    expect(() => fireEvent.press(screen.getByText('bad link'))).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('handler identity changes are live: a re-rendered provider value receives the next press', () => {
    const first = jest.fn();
    const second = jest.fn();
    const view = render(
      <LinkPressContext.Provider value={first}>
        <SanitizedHtml html={ANCHOR_HTML} contentWidth={320} />
      </LinkPressContext.Provider>
    );
    fireEvent.press(screen.getByText('click me'));
    expect(first).toHaveBeenCalledTimes(1);

    view.rerender(
      <LinkPressContext.Provider value={second}>
        <SanitizedHtml html={ANCHOR_HTML} contentWidth={320} />
      </LinkPressContext.Provider>
    );
    fireEvent.press(screen.getByText('click me'));

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });
});

describe('LocString viewer HTML path threads the sink label', () => {
  function markdownToAnchor(model: InstanceType<typeof Model>): void {
    model.onTextMarkdown.add((_sender, options) => {
      options.html = options.text.replace(
        /\*\*(.+?)\*\*/g,
        '<a href="https://example.com/t">$1</a>'
      );
    });
  }

  it('SurveyLocStringViewer forwards linkContext to the SanitizedHtml branch', () => {
    const model = new Model({ title: 'go **click me** now' });
    markdownToAnchor(model);
    expect(model.locTitle.hasHtml).toBe(true);
    const handler = jest.fn();
    render(
      <LinkPressContext.Provider value={handler}>
        <SurveyLocStringViewer model={model.locTitle} linkContext="title" />
      </LinkPressContext.Provider>
    );

    fireEvent.press(screen.getByText('click me'));

    expect(handler).toHaveBeenCalledWith({
      url: 'https://example.com/t',
      context: 'title',
    });
  });

  it('renderLocString threads a linkContext through the factory dispatch', () => {
    const model = new Model({ title: 'go **click me** now' });
    markdownToAnchor(model);
    const handler = jest.fn();
    render(
      <LinkPressContext.Provider value={handler}>
        {SurveyElementBase.renderLocString(
          model.locTitle,
          undefined,
          undefined,
          'description'
        )}
      </LinkPressContext.Provider>
    );

    fireEvent.press(screen.getByText('click me'));

    expect(handler).toHaveBeenCalledWith({
      url: 'https://example.com/t',
      context: 'description',
    });
  });
});

describe('<Survey onLinkPress> reaches every sink', () => {
  /** Row content renders after the responsive row measures itself (same
   * helper as the kitchen-sink shell tests). */
  function layoutRows(): void {
    for (const row of screen.getAllByTestId('sv-row')) {
      fireEvent(row, 'layout', {
        nativeEvent: { layout: { width: 400, height: 100, x: 0, y: 0 } },
      });
    }
  }

  it('html question sink: press delivers {url, context: "html-question"}', () => {
    const handler = jest.fn();
    render(
      <Survey
        json={{
          elements: [{ type: 'html', name: 'h1', html: ANCHOR_HTML }],
        }}
        onLinkPress={handler}
      />
    );
    layoutRows();

    fireEvent.press(screen.getByText('click me'));

    expect(handler).toHaveBeenCalledWith({
      url: 'https://example.com/x',
      context: 'html-question',
    });
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('question title sink (markdown → HTML): press delivers {url, context: "title"}', () => {
    const model = new Model({
      elements: [{ type: 'text', name: 'q1', title: 'go **click me** now' }],
    });
    model.onTextMarkdown.add((_sender, options) => {
      options.html = options.text.replace(
        /\*\*(.+?)\*\*/g,
        '<a href="https://example.com/t">$1</a>'
      );
    });
    const handler = jest.fn();
    render(<Survey model={model as never} onLinkPress={handler} />);
    layoutRows();

    fireEvent.press(screen.getByText('click me'));

    expect(handler).toHaveBeenCalledWith({
      url: 'https://example.com/t',
      context: 'title',
    });
  });

  it('completed-page sink: press delivers {url, context: "completed"}', () => {
    const model = new Model({
      completedHtml: '<p><a href="https://example.com/c">done link</a></p>',
      elements: [{ type: 'text', name: 'q1' }],
    });
    const handler = jest.fn();
    render(<Survey model={model as never} onLinkPress={handler} />);
    act(() => {
      model.doComplete();
    });

    fireEvent.press(screen.getByText('done link'));

    expect(handler).toHaveBeenCalledWith({
      url: 'https://example.com/c',
      context: 'completed',
    });
  });

  it('no onLinkPress on <Survey>: anchors inside the tree stay plain text (no link role, no onPress)', () => {
    render(
      <Survey
        json={{
          elements: [{ type: 'html', name: 'h1', html: ANCHOR_HTML }],
        }}
      />
    );
    layoutRows();

    const anchor = screen.getByTestId('a');
    expect(anchor.props.accessibilityRole).toBeUndefined();
    expect(anchor.props.onPress).toBeUndefined();
    expect(() => fireEvent.press(screen.getByText('click me'))).not.toThrow();
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('a swapped Survey-level handler receives the next press (reactive through the class tree)', () => {
    const first = jest.fn();
    const second = jest.fn();
    const json = {
      elements: [{ type: 'html', name: 'h1', html: ANCHOR_HTML }],
    };
    const view = render(<Survey json={json} onLinkPress={first} />);
    layoutRows();
    fireEvent.press(screen.getByText('click me'));
    expect(first).toHaveBeenCalledTimes(1);

    view.rerender(<Survey json={json} onLinkPress={second} />);
    fireEvent.press(screen.getByText('click me'));

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });
});
