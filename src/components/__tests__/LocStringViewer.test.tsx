/**
 * `SurveyLocStringViewer` — RN port of survey-react-ui's
 * `SurveyLocStringViewer` (string-viewer.tsx): the single component every
 * model-driven string renders through (task 1.6). Contract under test:
 *
 * - plain strings render as RN `Text` (upstream: `<span>`);
 * - `onStringChanged` subscription drives re-render (add on mount,
 *   remove+re-add across updates, remove on unmount — upstream lifecycle
 *   preserved);
 * - HTML-bearing strings (`hasHtml`, i.e. markdown/html via
 *   `onTextMarkdown`) render through `<SanitizedHtml>` — never raw markup
 *   as text, never `dangerouslySetInnerHTML` (invariant 8/A11);
 * - non-multiline strings collapse hard newlines (upstream: plain
 *   `.sv-string-viewer` has HTML whitespace collapsing; only
 *   `--multiline` — `allowLineBreaks`, serializer `type === "text"` —
 *   gets `white-space: pre-line`. RN `Text` always honors `\n`, so the
 *   viewer collapses them for non-multiline strings to preserve upstream
 *   rendering);
 * - `SurveyElementBase.renderLocString` dispatches through
 *   `RNElementFactory` under `locStr.renderAs` (upstream
 *   reactquestion_element.tsx:8-18) with the plain-Text fallback ONLY on
 *   a factory miss.
 */
import * as React from 'react';
import { render, screen, act } from '@testing-library/react-native';

import { Model, LocalizableString } from '../../core/facade';
import { SurveyElementBase } from '../../reactivity/SurveyElementBase';
import { RNElementFactory } from '../../factories/ElementFactory';
import '../../factories/register-all';
import { SurveyLocStringViewer } from '../LocStringViewer';

function markdownToBold(model: InstanceType<typeof Model>): void {
  model.onTextMarkdown.add((_sender, options) => {
    options.html = options.text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  });
}

describe('SurveyLocStringViewer — plain text path', () => {
  it('renders the string as queryable text', () => {
    const model = new Model({ title: 'Hello survey' });
    render(<SurveyLocStringViewer model={model.locTitle} />);
    expect(screen.getByText('Hello survey')).toBeTruthy();
  });

  it('renders null for a missing model (upstream: `if (!this.locStr) return null`)', () => {
    const { toJSON } = render(
      <SurveyLocStringViewer model={undefined as never} />
    );
    expect(toJSON()).toBeNull();
  });

  it('applies the style prop to the Text element', () => {
    const model = new Model({ title: 'Styled' });
    render(
      <SurveyLocStringViewer model={model.locTitle} style={{ fontSize: 30 }} />
    );
    const text = screen.getByText('Styled');
    const flat = Object.assign(
      {},
      ...[text.props.style].flat(Infinity).filter(Boolean)
    );
    expect(flat.fontSize).toBe(30);
  });

  it('collapses hard newlines for a non-multiline string (title: serializer type "string" → allowLineBreaks false)', () => {
    const model = new Model({ title: 'line one\nline two' });
    expect(model.locTitle.allowLineBreaks).toBe(false);
    render(<SurveyLocStringViewer model={model.locTitle} />);
    expect(screen.getByText('line one line two')).toBeTruthy();
  });

  it('collapses bare-CR line endings too (legacy \\r-only JSON: HTML treats CR as whitespace like LF) — asserted on the RAW children, not the whitespace-normalizing text matcher', () => {
    const model = new Model({ title: 'line one\rline two' });
    render(<SurveyLocStringViewer model={model.locTitle} />);
    const text = screen.getByText(/line one/);
    expect(text.props.children).toBe('line one line two');
  });

  it('preserves hard newlines for a multiline string (description: serializer type "text" → allowLineBreaks true)', () => {
    const model = new Model({
      title: 't',
      description: 'line one\nline two',
    });
    expect(model.locDescription.allowLineBreaks).toBe(true);
    render(<SurveyLocStringViewer model={model.locDescription} />);
    expect(screen.getByText('line one\nline two')).toBeTruthy();
  });
});

describe('SurveyLocStringViewer — onStringChanged subscription', () => {
  it('re-renders when the underlying string changes', () => {
    const model = new Model({ title: 'Before' });
    render(<SurveyLocStringViewer model={model.locTitle} />);
    act(() => {
      model.title = 'After';
    });
    expect(screen.getByText('After')).toBeTruthy();
    expect(screen.queryByText('Before')).toBeNull();
  });

  it('subscribes on mount and unsubscribes on unmount (no leak; measured as a DELTA — core itself holds a listener on locTitle for its titleIsEmpty cache)', () => {
    const model = new Model({ title: 'Leak check' });
    const baseline = model.locTitle.onStringChanged.length;
    const view = render(<SurveyLocStringViewer model={model.locTitle} />);
    expect(model.locTitle.onStringChanged.length).toBe(baseline + 1);
    view.unmount();
    expect(model.locTitle.onStringChanged.length).toBe(baseline);
  });

  it('survives a StrictMode remount cycle with a balanced listener count and live reactivity (React 19 dev double-mount)', () => {
    const model = new Model({ title: 'Strict' });
    const baseline = model.locTitle.onStringChanged.length;
    const view = render(
      <React.StrictMode>
        <SurveyLocStringViewer model={model.locTitle} />
      </React.StrictMode>
    );
    expect(model.locTitle.onStringChanged.length).toBe(baseline + 1);
    act(() => {
      model.title = 'Strict v2';
    });
    expect(screen.getByText('Strict v2')).toBeTruthy();
    view.unmount();
    expect(model.locTitle.onStringChanged.length).toBe(baseline);
  });

  it('retargets the subscription when the model prop is swapped', () => {
    const alpha = new Model({ title: 'Alpha' });
    const beta = new Model({ title: 'Beta' });
    const alphaBaseline = alpha.locTitle.onStringChanged.length;
    const betaBaseline = beta.locTitle.onStringChanged.length;
    const view = render(<SurveyLocStringViewer model={alpha.locTitle} />);
    view.rerender(<SurveyLocStringViewer model={beta.locTitle} />);
    expect(alpha.locTitle.onStringChanged.length).toBe(alphaBaseline);
    expect(beta.locTitle.onStringChanged.length).toBe(betaBaseline + 1);
    expect(screen.getByText('Beta')).toBeTruthy();
    act(() => {
      beta.title = 'Beta changed';
    });
    expect(screen.getByText('Beta changed')).toBeTruthy();
  });
});

describe('SurveyLocStringViewer — sanitized rich text path', () => {
  it('renders an HTML-bearing string through SanitizedHtml (bold segment present, raw markup absent)', () => {
    const model = new Model({ title: 'Hello **bold** world' });
    markdownToBold(model);
    expect(model.locTitle.hasHtml).toBe(true);
    render(<SurveyLocStringViewer model={model.locTitle} />);
    expect(screen.getByText(/bold/)).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(screen.queryByText(/<b>/)).toBeNull();
  });

  it('re-renders the rich-text path on string change', () => {
    const model = new Model({ title: 'A **first** value' });
    markdownToBold(model);
    render(<SurveyLocStringViewer model={model.locTitle} />);
    act(() => {
      model.title = 'A **second** value';
    });
    expect(screen.getByText(/second/)).toBeTruthy();
    expect(screen.queryByText(/first/)).toBeNull();
  });
});

describe('registration + SurveyElementBase.renderLocString dispatch', () => {
  it('register-all registers the viewer under LocalizableString.defaultRenderer ("sv-string-viewer")', () => {
    expect(LocalizableString.defaultRenderer).toBe('sv-string-viewer');
    expect(RNElementFactory.isElementRegistered('sv-string-viewer')).toBe(true);
  });

  it('renderLocString dispatches through the factory — the rendered element SUBSCRIBES (the M0 fallback never did)', () => {
    const model = new Model({ title: 'Dispatched' });
    const baseline = model.locTitle.onStringChanged.length;
    render(<>{SurveyElementBase.renderLocString(model.locTitle)}</>);
    expect(screen.getByText('Dispatched')).toBeTruthy();
    expect(model.locTitle.onStringChanged.length).toBe(baseline + 1);
    act(() => {
      model.title = 'Dispatched v2';
    });
    expect(screen.getByText('Dispatched v2')).toBeTruthy();
  });

  it('falls back to the NORMAL viewer when renderAs names an unregistered element (never blank)', () => {
    const owner = {
      getLocale: () => '',
      getMarkdownHtml: () => undefined as unknown as string,
      getProcessedText: (text: string) => text,
      getRenderer: () => 'not-a-registered-renderer',
      getRendererContext: (locStr: unknown) => locStr,
    };
    const locStr = new LocalizableString(owner as never, false, 'fallback');
    locStr.text = 'plain fallback';
    expect(locStr.renderAs).toBe('not-a-registered-renderer');
    render(<>{SurveyElementBase.renderLocString(locStr)}</>);
    expect(screen.getByText('plain fallback')).toBeTruthy();
  });

  it('an hasHtml string on a custom-renderer miss STILL routes through SanitizedHtml — raw markup never renders as literal text (regression)', () => {
    const owner = {
      getLocale: () => '',
      getMarkdownHtml: (text: string) => {
        const html = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        return html === text ? (undefined as unknown as string) : html;
      },
      getProcessedText: (text: string) => text,
      getRenderer: () => 'not-a-registered-renderer',
      getRendererContext: (locStr: unknown) => locStr,
    };
    const locStr = new LocalizableString(owner as never, true, 'richmiss');
    locStr.text = 'has **bold** markup';
    expect(locStr.renderAs).toBe('not-a-registered-renderer');
    expect(locStr.hasHtml).toBe(true);
    render(<>{SurveyElementBase.renderLocString(locStr)}</>);
    expect(screen.getByText(/bold/)).toBeTruthy();
    expect(screen.queryByText(/<b>/)).toBeNull();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('the miss fallback SUBSCRIBES (it is the real viewer, not a static Text)', () => {
    const owner = {
      getLocale: () => '',
      getMarkdownHtml: () => undefined as unknown as string,
      getProcessedText: (text: string) => text,
      getRenderer: () => 'not-a-registered-renderer',
      getRendererContext: (locStr: unknown) => locStr,
    };
    const locStr = new LocalizableString(owner as never, false, 'live');
    locStr.text = 'first value';
    const baseline = locStr.onStringChanged.length;
    render(<>{SurveyElementBase.renderLocString(locStr)}</>);
    expect(locStr.onStringChanged.length).toBe(baseline + 1);
    act(() => {
      locStr.text = 'second value';
    });
    expect(screen.getByText('second value')).toBeTruthy();
  });
});
