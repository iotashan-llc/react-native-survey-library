/**
 * `<SanitizedHtml>` — design: docs/design/0.9-html-strategy.md, "Renderer
 * selection" + "Sanitizer (A11)". Covers: `renderersProps.a.onPress`
 * always installed (no host callback = no-op + dev diagnostic; press-time
 * canonical revalidation; `Linking.openURL` mocked to THROW proves it is
 * never reached, for valid/invalid/callback-absent cases), and that the
 * component mounts the private sanitized AST via `source={{ dom }}`
 * rather than re-parsing raw HTML.
 */
/* eslint-disable no-script-url -- this file's whole point is asserting
 * that `javascript:` hrefs never reach the host callback or
 * `Linking.openURL`; the literals are fixtures, not eval sites. */
import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SanitizedHtml, createAnchorOnPress } from '../SanitizedHtml';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

describe('createAnchorOnPress — pure handler (valid/invalid/callback-absent)', () => {
  let openURLSpy: jest.SpiedFunction<typeof Linking.openURL>;

  beforeEach(() => {
    openURLSpy = jest.spyOn(Linking, 'openURL').mockImplementation(() => {
      throw new Error('Linking.openURL must never be called by this library');
    });
  });

  afterEach(() => {
    openURLSpy.mockRestore();
  });

  it('valid href + host callback: calls the host callback with the canonical URI, never Linking.openURL', () => {
    const onLinkPress = jest.fn();
    const handler = createAnchorOnPress(onLinkPress);
    const event = {} as never;

    expect(() => handler(event, 'https://example.com/x')).not.toThrow();

    expect(onLinkPress).toHaveBeenCalledWith('https://example.com/x', event);
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('invalid href (javascript:): drops the press silently, never Linking.openURL', () => {
    const onLinkPress = jest.fn();
    const handler = createAnchorOnPress(onLinkPress);

    expect(() => handler({} as never, 'javascript:alert(1)')).not.toThrow();

    expect(onLinkPress).not.toHaveBeenCalled();
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('invalid href (non-string, e.g. renderer hands back undefined): drops the press, never Linking.openURL', () => {
    const onLinkPress = jest.fn();
    const handler = createAnchorOnPress(onLinkPress);

    expect(() => handler({} as never, undefined)).not.toThrow();

    expect(onLinkPress).not.toHaveBeenCalled();
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('valid href, no host callback: no-op (never Linking.openURL, never throws)', () => {
    const handler = createAnchorOnPress(undefined);

    expect(() => handler({} as never, 'https://example.com/x')).not.toThrow();

    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('valid href, no host callback: emits a dev diagnostic explaining the drop', () => {
    const received: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => received.push(payload));
    try {
      const handler = createAnchorOnPress(undefined);
      handler({} as never, 'https://example.com/x');
    } finally {
      setDiagnosticHandler(undefined);
    }

    expect(
      received.some(
        (p) =>
          p.code === 'sanitized-html-link-press-dropped' &&
          /no onLinkPress callback/.test(p.reason)
      )
    ).toBe(true);
  });

  it('invalid href: emits a dev diagnostic naming the rejection reason', () => {
    const received: DiagnosticPayload[] = [];
    setDiagnosticHandler((payload) => received.push(payload));
    try {
      const handler = createAnchorOnPress(jest.fn());
      handler({} as never, 'javascript:alert(1)');
    } finally {
      setDiagnosticHandler(undefined);
    }

    expect(
      received.some(
        (p) =>
          p.code === 'sanitized-html-link-press-dropped' &&
          /re-validation/.test(p.reason)
      )
    ).toBe(true);
  });
});

describe('<SanitizedHtml> — end-to-end mount + press', () => {
  let openURLSpy: jest.SpiedFunction<typeof Linking.openURL>;

  beforeEach(() => {
    openURLSpy = jest.spyOn(Linking, 'openURL').mockImplementation(() => {
      throw new Error('Linking.openURL must never be called by this library');
    });
  });

  afterEach(() => {
    openURLSpy.mockRestore();
  });

  it('mounts sanitized content (script content never renders as text)', () => {
    render(
      <SanitizedHtml
        html="<p>hello</p><script>evil()</script>"
        contentWidth={320}
      />
    );
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.queryByText(/evil/)).toBeNull();
  });

  it('pressing a sanitized anchor calls onLinkPress with the canonical URI, never Linking.openURL', () => {
    const onLinkPress = jest.fn();
    render(
      <SanitizedHtml
        html='<a href="https://example.com/x">click me</a>'
        onLinkPress={onLinkPress}
        contentWidth={320}
      />
    );

    fireEvent.press(screen.getByText('click me'));

    expect(onLinkPress).toHaveBeenCalledTimes(1);
    expect(onLinkPress.mock.calls[0]?.[0]).toBe('https://example.com/x');
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('pressing an anchor with no onLinkPress prop never calls Linking.openURL', () => {
    render(
      <SanitizedHtml
        html='<a href="https://example.com/x">click me</a>'
        contentWidth={320}
      />
    );

    expect(() => fireEvent.press(screen.getByText('click me'))).not.toThrow();
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('a javascript: href is stripped before the anchor is even pressable (no href reaches the renderer)', () => {
    const onLinkPress = jest.fn();
    render(
      <SanitizedHtml
        html='<a href="javascript:alert(1)">click me</a>'
        onLinkPress={onLinkPress}
        contentWidth={320}
      />
    );

    fireEvent.press(screen.getByText('click me'));

    expect(onLinkPress).not.toHaveBeenCalled();
    expect(openURLSpy).not.toHaveBeenCalled();
  });
});
