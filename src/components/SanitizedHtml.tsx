/**
 * `<SanitizedHtml>` — the secured adapter over `@native-html/render`
 * (design: docs/design/0.9-html-strategy.md, "Renderer selection" +
 * "Sanitizer (A11)"). This is the ONLY file in the library allowed to
 * import `@native-html/render` (ESLint-enforced, mirroring the
 * `survey-core` facade rule — see `eslint.config.mjs`).
 *
 * Three defense-in-depth properties, all owned here:
 *
 * 1. `source={{ dom }}` is fed the PRIVATE allowlisted AST produced by
 *    `sanitizeHtml` — the renderer never parses raw author HTML itself.
 * 2. `renderersProps.a.onPress` is ALWAYS installed, replacing the
 *    library's own default (`Linking.openURL` — i.e. auto-navigation).
 *    With no host `onLinkPress` callback, a press is a no-op (dev
 *    diagnostic only). The canonical URI is RE-VALIDATED at press time
 *    against whatever the renderer actually hands back (its own
 *    `useNormalizedUrl` pass) — never trusting a value validated once and
 *    used again elsewhere ("validate one, use another" is exactly what
 *    the design calls out to close). This library's own code path NEVER
 *    calls `Linking.openURL` — `navigateToUrl`/link presses surface as
 *    events only; the host app decides (invariant 8).
 * 3. `enableCSSInlineProcessing={false}` — defense in depth; `style` is
 *    already stripped unconditionally by the sanitizer, but the renderer
 *    is told not to interpret inline CSS at all regardless.
 *
 * `@native-html/render` is `require`d LAZILY (module EVALUATION deferred
 * to first render; the peer stays installed and Metro still statically
 * discovers this literal `require(...)` call — design: "Lazy loading
 * claim narrowed: deferred module evaluation only").
 */
import * as React from 'react';
import { Dimensions } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type { ComponentType } from 'react';
import { sanitizeHtml } from '../security/sanitize-html';
import type {
  SanitizeHtmlConfig,
  ResourceBounds,
} from '../security/sanitize-html';
import { validateUri } from '../security/uri-policy';
import type { UriPolicyConfig } from '../security/uri-policy';
import { reportDiagnostic } from '../diagnostics';

export interface SanitizedHtmlProps {
  /** Raw, untrusted author HTML. Sanitized on every render (memoized on
   * the arguments that affect the result). */
  html: string;
  /** Called with the RE-VALIDATED canonical URI when an anchor is
   * pressed. The host owns navigation — this library never calls
   * `Linking.openURL` itself. Omitting this prop makes every anchor
   * press a no-op (plus a dev diagnostic) rather than silently falling
   * back to auto-navigation. */
  onLinkPress?: (canonicalUrl: string, event: GestureResponderEvent) => void;
  /** Forwarded to the renderer; required for correct text-wrapping
   * layout. Defaults to the window width if omitted. */
  contentWidth?: number;
  /** Widens the FORMATTING tag allowlist only (design: "immutable safety
   * pass always runs" regardless — see `sanitizeHtml`). */
  relaxedFormatting?: boolean;
  /** Resource-bound overrides — DOWN only. */
  bounds?: Partial<ResourceBounds>;
  /** Origin-allowlist / baseUrl config for `<img>` elements found inside
   * the HTML content (context `'image'`). Not wired to Survey-level
   * config yet (that is task 1.1) — threaded through for that caller. */
  imageUriConfig?: UriPolicyConfig;
}

// Lazily required so `@native-html/render`'s module-level code only runs
// once a `<SanitizedHtml>` is actually rendered, not merely imported. The
// lazily-required module's prop type is asserted at the one call site below.
let cachedRenderHTML: ComponentType<Record<string, unknown>> | undefined;
function getRenderHTML(): ComponentType<Record<string, unknown>> {
  if (!cachedRenderHTML) {
    cachedRenderHTML = (
      require('@native-html/render') as {
        default: ComponentType<Record<string, unknown>>;
      }
    ).default;
  }
  return cachedRenderHTML;
}

function warnLinkPressDropped(reason: string): void {
  reportDiagnostic({ code: 'sanitized-html-link-press-dropped', reason });
}

/**
 * Builds the `renderersProps.a.onPress` handler. Exported as a pure
 * factory (no React state, no closures over renderer internals) so the
 * valid/invalid/callback-absent cases can be unit tested directly against
 * synthetic `(event, href)` arguments — the actual shape
 * `@native-html/render`'s `ARenderer` calls its `onPress` with — without
 * needing to coax the renderer's own URL-normalization internals into
 * producing a specific (invalid) value through a full mount.
 *
 * NEVER calls `Linking.openURL` itself under any branch — an invalid or
 * callback-absent press is always a no-op (plus a dev diagnostic), and a
 * valid press only ever calls the HOST-supplied `onLinkPress` (invariant
 * 8: `navigateToUrl`/link presses surface as events, host decides).
 */
export function createAnchorOnPress(
  onLinkPress: SanitizedHtmlProps['onLinkPress']
): (event: GestureResponderEvent, href: unknown) => void {
  return (event, href) => {
    if (typeof href !== 'string') {
      warnLinkPressDropped(
        'anchor press ignored: non-string href from renderer.'
      );
      return;
    }
    // Press-time canonical revalidation (design: "the canonical URI ...
    // is re-validated at press") — never trust a value validated once
    // (at sanitize time) and handed elsewhere unchecked; also never
    // trust whatever the renderer's own URL normalization produced
    // without re-checking it against the same policy.
    const revalidated = validateUri(href, 'link');
    if (!revalidated.ok) {
      warnLinkPressDropped(
        `anchor press ignored: href failed re-validation (${revalidated.reason}).`
      );
      return;
    }
    if (!onLinkPress) {
      warnLinkPressDropped(
        'anchor press ignored: no onLinkPress callback was provided.'
      );
      return;
    }
    onLinkPress(revalidated.canonical, event);
  };
}

export function SanitizedHtml(props: SanitizedHtmlProps): React.JSX.Element {
  const {
    html,
    onLinkPress,
    contentWidth,
    relaxedFormatting,
    bounds,
    imageUriConfig,
  } = props;

  const sanitizeResult = React.useMemo(() => {
    const config: SanitizeHtmlConfig = {
      relaxedFormatting,
      bounds,
      imageUriConfig,
    };
    return sanitizeHtml(html, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `bounds`/`imageUriConfig` are plain option objects re-created per caller render; re-sanitizing whenever `html` (the actual untrusted input) or the boolean flag changes is the meaningful contract here.
  }, [html, relaxedFormatting]);

  React.useEffect(() => {
    for (const diagnostic of sanitizeResult.diagnostics) {
      reportDiagnostic({
        code: 'sanitized-html-diagnostic',
        sanitizeCode: diagnostic.code,
        detail: diagnostic.detail,
      });
    }
  }, [sanitizeResult]);

  const onAnchorPress = React.useMemo(
    () => createAnchorOnPress(onLinkPress),
    [onLinkPress]
  );

  const renderersProps = React.useMemo(
    () => ({
      a: { onPress: onAnchorPress },
    }),
    [onAnchorPress]
  );

  const RenderHTML = getRenderHTML();
  const resolvedContentWidth =
    typeof contentWidth === 'number'
      ? contentWidth
      : Dimensions.get('window').width;

  return (
    <RenderHTML
      source={{ dom: sanitizeResult.dom }}
      contentWidth={resolvedContentWidth}
      renderersProps={renderersProps}
      enableCSSInlineProcessing={false}
    />
  );
}
