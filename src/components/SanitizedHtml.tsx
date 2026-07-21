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
 * 2. The `renderersProps.a.onPress` KEY is ALWAYS passed, replacing the
 *    library's own default (`Linking.openURL` — i.e. auto-navigation;
 *    the renderer merges `renderersProps` with `mergeDeepRight`, so an
 *    OMITTED key would keep that default — the key itself is the
 *    security seam). Its VALUE is a11y-honest: with a resolvable host
 *    callback (the explicit `onLinkPress` prop, else the Survey-level
 *    `LinkPressContext` handler) the guarded press handler is installed
 *    and the anchor is a real link (role + pressable); with NO callback
 *    the value is `undefined`, so the anchor renders as PLAIN TEXT — no
 *    link a11y role, no pressable — never a dead a11y control. On a
 *    press the canonical URI is RE-VALIDATED at press time against
 *    whatever the renderer actually hands back (its own
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
import { Dimensions, StyleSheet } from 'react-native';
import type { GestureResponderEvent, StyleProp, TextStyle } from 'react-native';
import type { ComponentType } from 'react';
import { sanitizeHtml } from '../security/sanitize-html';
import type {
  SanitizeHtmlConfig,
  ResourceBounds,
} from '../security/sanitize-html';
import { validateUri } from '../security/uri-policy';
import type { UriPolicyConfig } from '../security/uri-policy';
import { UriPolicyContext } from '../security/UriPolicyContext';
import { LinkPressContext } from '../security/LinkPressContext';
import type { SurveyLinkPressContext } from '../security/LinkPressContext';
import { reportDiagnostic } from '../diagnostics';

/** Validation metadata computed by the press-time policy revalidation
 * and delivered alongside the canonical URL — so hosts can make trust
 * decisions on the TRUE parsed origin/scheme rather than re-parsing (and
 * possibly re-parsing DIFFERENTLY — the exact bug class the canonical
 * contract exists to close). */
export interface LinkPressValidationMeta {
  /** `scheme://host[:non-default-port]` (lowercase), or `null` for
   * opaque schemes (`mailto:`, `tel:`). */
  origin: string | null;
  /** Lowercase scheme with trailing colon (e.g. `"https:"`). */
  scheme: string | null;
}

export interface SanitizedHtmlProps {
  /** Raw, untrusted author HTML. Sanitized on every render (memoized on
   * the arguments that affect the result). */
  html: string;
  /** Called with the RE-VALIDATED canonical URI when an anchor is
   * pressed. The host owns navigation — this library never calls
   * `Linking.openURL` itself. Wins over the Survey-level
   * `LinkPressContext` handler. With NO callback resolvable from either
   * source, anchors render as PLAIN TEXT (no link a11y role, no
   * pressable) — never a dead control, never auto-navigation. */
  onLinkPress?: (
    canonicalUrl: string,
    event: GestureResponderEvent,
    validation?: LinkPressValidationMeta
  ) => void;
  /** Sink label delivered as `event.context` when the SURVEY-LEVEL
   * `onLinkPress` handler (via `LinkPressContext`) fires — e.g.
   * `'title'`, `'html-question'`, `'completed'`. Defaults to `'html'`.
   * Ignored when the explicit `onLinkPress` prop is in play (that
   * callback already knows its own sink). */
  linkContext?: SurveyLinkPressContext;
  /** Forwarded to the renderer; required for correct text-wrapping
   * layout. Defaults to the window width if omitted. */
  contentWidth?: number;
  /** Widens the FORMATTING tag allowlist only (design: "immutable safety
   * pass always runs" regardless — see `sanitizeHtml`). */
  relaxedFormatting?: boolean;
  /** Resource-bound overrides — DOWN only. */
  bounds?: Partial<ResourceBounds>;
  /** Base text style applied to the rendered HTML root (task 2.9: recipe
   * caption styles must reach HTML captions too — threaded to the
   * renderer's `baseStyle`). */
  baseStyle?: StyleProp<TextStyle>;
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

/**
 * The renderer's DEFAULT anchor element model assigns `accessible: true`
 * + `accessibilityRole: 'link'` from href PRESENCE alone — independent
 * of any press handler. With no host callback that is exactly the dead
 * a11y control the a11y-honest contract forbids: a screen reader
 * announces a link that does nothing. This custom `a` model suppresses
 * the model-level a11y props; the press-gated branch of the renderer's
 * own `getNativePropsForTNode` re-adds `accessibilityRole: 'link'`
 * whenever a real `onPress` is installed — so role/pressability appear
 * IF AND ONLY IF a press actually does something. Lazily built (same
 * deferred-evaluation contract as `getRenderHTML`) and cached for a
 * stable identity (the renderer memoizes its engine on prop identity).
 */
let cachedInertAnchorModels: Record<string, unknown> | undefined;
function getInertAnchorElementModels(): Record<string, unknown> {
  if (!cachedInertAnchorModels) {
    const { defaultHTMLElementModels } = require('@native-html/render') as {
      defaultHTMLElementModels: {
        a: { extend(shape: Record<string, unknown>): unknown };
      };
    };
    cachedInertAnchorModels = {
      a: defaultHTMLElementModels.a.extend({
        getReactNativeProps: () => undefined,
        // The default anchor model ALSO derives link VISUALS (anchor
        // color + underline) from href presence via `getMixedUAStyles` —
        // an inert anchor keeping them is a half-fixed dead control:
        // looks pressable, does nothing. Suppress the styles too so the
        // no-callback anchor reduces to genuinely plain text. (`extend`
        // shallow-merges, so this key must be overridden explicitly.)
        getMixedUAStyles: () => undefined,
      }),
    };
  }
  return cachedInertAnchorModels;
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
    // Deliver the validation result's origin/scheme WITH the canonical
    // URL (review: the true origin was computed then discarded) — the
    // host's trust decision gets the policy's own parse, not a re-parse.
    onLinkPress(revalidated.canonical, event, {
      origin: revalidated.origin,
      scheme: revalidated.scheme,
    });
  };
}

/**
 * Stable memo key over EVERY input that affects the sanitized output
 * (review #7). `bounds`/`imageUriConfig` are plain option objects re-created
 * with a new identity on each caller render, so they can't be memo deps
 * directly — but their VALUES must still bust the memo, or a consumer
 * tightening a bound / revoking an allowlisted origin / changing `baseUrl`
 * would silently keep rendering STALE (less-restrictive) sanitized output.
 * Serializing to a string gives value-equality memoization. Exported for a
 * direct unit test of the "changes-when-inputs-change" contract.
 */
export function sanitizeConfigKey(
  relaxedFormatting: boolean | undefined,
  bounds: SanitizedHtmlProps['bounds'],
  imageUriConfig: UriPolicyConfig | undefined
): string {
  return JSON.stringify({
    relaxedFormatting: !!relaxedFormatting,
    bounds: bounds ?? null,
    imageUriConfig: imageUriConfig ?? null,
  });
}

export function SanitizedHtml(props: SanitizedHtmlProps): React.JSX.Element {
  const {
    html,
    onLinkPress,
    linkContext,
    contentWidth,
    relaxedFormatting,
    bounds,
    imageUriConfig: imageUriConfigProp,
  } = props;

  // Survey-scoped policy default (review round 1 major #2): the explicit
  // prop wins; otherwise the <Survey uriPolicy> context applies, so ONE
  // config reaches preflight AND this sink.
  const contextPolicy = React.useContext(UriPolicyContext);
  const imageUriConfig = imageUriConfigProp ?? contextPolicy;

  const configKey = sanitizeConfigKey(
    relaxedFormatting,
    bounds,
    imageUriConfig
  );
  const sanitizeResult = React.useMemo(() => {
    const config: SanitizeHtmlConfig = {
      relaxedFormatting,
      bounds,
      imageUriConfig,
    };
    return sanitizeHtml(html, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `configKey` (a stable JSON serialization) captures relaxedFormatting/bounds/imageUriConfig by VALUE; re-sanitizing on [html, configKey] is exactly the contract (review #7).
  }, [html, configKey]);

  React.useEffect(() => {
    for (const diagnostic of sanitizeResult.diagnostics) {
      reportDiagnostic({
        code: 'sanitized-html-diagnostic',
        sanitizeCode: diagnostic.code,
        detail: diagnostic.detail,
      });
    }
  }, [sanitizeResult]);

  // Host-callback resolution: the explicit prop wins; otherwise the
  // <Survey onLinkPress> context handler applies, adapted to the
  // low-level `(canonicalUrl, event)` shape with this sink's label.
  const surveyLinkPress = React.useContext(LinkPressContext);
  const resolvedOnLinkPress = React.useMemo(() => {
    if (onLinkPress) return onLinkPress;
    if (!surveyLinkPress) return undefined;
    const context = linkContext ?? 'html';
    return (
      canonicalUrl: string,
      _event: GestureResponderEvent,
      validation?: LinkPressValidationMeta
    ) =>
      surveyLinkPress({
        url: canonicalUrl,
        context,
        origin: validation ? validation.origin : null,
        scheme: validation ? validation.scheme : null,
      });
  }, [onLinkPress, surveyLinkPress, linkContext]);

  const renderersProps = React.useMemo(
    () => ({
      // The `onPress` KEY must ALWAYS be present: the renderer merges
      // `renderersProps` over its defaults with `mergeDeepRight`, so an
      // omitted key would resurrect its default anchor handler —
      // `Linking.openURL`, i.e. auto-navigation (invariant 8 violation).
      // An explicit `undefined` overrides it, and a value-less anchor
      // renders as plain text: no onPress, no link a11y role (the
      // renderer only decorates anchors that received a function) — the
      // a11y-honest no-callback contract.
      a: {
        onPress: resolvedOnLinkPress
          ? createAnchorOnPress(resolvedOnLinkPress)
          : undefined,
      },
    }),
    [resolvedOnLinkPress]
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
      customHTMLElementModels={
        resolvedOnLinkPress ? undefined : getInertAnchorElementModels()
      }
      enableCSSInlineProcessing={false}
      baseStyle={
        props.baseStyle
          ? (StyleSheet.flatten(props.baseStyle) as Record<string, unknown>)
          : undefined
      }
    />
  );
}
