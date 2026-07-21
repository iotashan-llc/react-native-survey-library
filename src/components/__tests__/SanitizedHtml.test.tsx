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
import { Linking, StyleSheet } from 'react-native';
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

  it('valid href + host callback: calls the host callback with the canonical URI + validation metadata, never Linking.openURL', () => {
    const onLinkPress = jest.fn();
    const handler = createAnchorOnPress(onLinkPress);
    const event = {} as never;

    expect(() => handler(event, 'https://example.com/x')).not.toThrow();

    expect(onLinkPress).toHaveBeenCalledWith('https://example.com/x', event, {
      origin: 'https://example.com',
      scheme: 'https:',
    });
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('opaque-scheme href (mailto:): metadata carries the scheme and a null origin', () => {
    const onLinkPress = jest.fn();
    const handler = createAnchorOnPress(onLinkPress);
    const event = {} as never;

    handler(event, 'mailto:person@example.com');

    expect(onLinkPress).toHaveBeenCalledWith(
      'mailto:person@example.com',
      event,
      { origin: null, scheme: 'mailto:' }
    );
  });

  it('credentialed href (https://a@evil.com): drops the press — link context rejects userinfo like fetch does', () => {
    const onLinkPress = jest.fn();
    const handler = createAnchorOnPress(onLinkPress);

    expect(() => handler({} as never, 'https://a@evil.com/x')).not.toThrow();

    expect(onLinkPress).not.toHaveBeenCalled();
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('protocol-relative href (//evil.com): drops the press fail-closed (no base to resolve against)', () => {
    const onLinkPress = jest.fn();
    const handler = createAnchorOnPress(onLinkPress);

    expect(() => handler({} as never, '//evil.com/x')).not.toThrow();

    expect(onLinkPress).not.toHaveBeenCalled();
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

describe('<SanitizedHtml> — a11y-honest anchors (link role only when actionable)', () => {
  let openURLSpy: jest.SpiedFunction<typeof Linking.openURL>;

  beforeEach(() => {
    openURLSpy = jest.spyOn(Linking, 'openURL').mockImplementation(() => {
      throw new Error('Linking.openURL must never be called by this library');
    });
  });

  afterEach(() => {
    openURLSpy.mockRestore();
  });

  const HTML = '<p><a href="https://example.com/x">click me</a></p>';

  it('no callback anywhere: the anchor renders as PLAIN TEXT — no link a11y role, no onPress (no dead a11y control)', () => {
    render(<SanitizedHtml html={HTML} contentWidth={320} />);

    const anchor = screen.getByTestId('a');
    expect(anchor.props.accessibilityRole).toBeUndefined();
    expect(anchor.props.onPress).toBeUndefined();
    expect(screen.queryByRole('link')).toBeNull();

    // A press attempt is a structural no-op — and never auto-navigation:
    // the renderer's own default anchor onPress is Linking.openURL, which
    // must never survive the override.
    expect(() => fireEvent.press(screen.getByText('click me'))).not.toThrow();
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('with an onLinkPress callback: the link a11y role IS present (actionable ⇔ exposed)', () => {
    render(
      <SanitizedHtml html={HTML} onLinkPress={jest.fn()} contentWidth={320} />
    );

    expect(screen.getByTestId('a').props.accessibilityRole).toBe('link');
  });

  it('no callback anywhere: the inert anchor carries NO link visual styling (no anchor color, no underline)', () => {
    render(<SanitizedHtml html={HTML} contentWidth={320} />);

    const style = StyleSheet.flatten(
      screen.getByTestId('a').props.style
    ) as Record<string, unknown>;
    expect(style?.textDecorationLine).toBeUndefined();
    expect(style?.color).not.toBe('#245dc1');
  });

  it('with an onLinkPress callback: the anchor keeps its link styling (underline present)', () => {
    render(
      <SanitizedHtml html={HTML} onLinkPress={jest.fn()} contentWidth={320} />
    );

    const style = StyleSheet.flatten(
      screen.getByTestId('a').props.style
    ) as Record<string, unknown>;
    expect(style?.textDecorationLine).toBe('underline');
  });
});
