# Differences from `survey-react-ui` (the official web renderer)

`@iotashan-llc/react-native-survey-library` renders the same SurveyJS
`SurveyModel`/theme JSON as `survey-react-ui`, unmodified. Most surveys
look and behave identically. This file documents the places where React
Native's platform (no DOM, no browser chrome, a stricter security
posture) forces observably different behavior — each entry says what
changed, why, and the workaround/migration path if one exists.

This is a living document seeded by task 0.9 (HTML/rich-text security);
later tasks (see `docs/IMPLEMENTATION-PLAN.md`, "Won't support in v1")
add their own entries as they land. Entries are grouped by the feature
area they affect, newest additions at the bottom of each section.

## HTML / rich-text rendering (task 0.9)

SurveyJS lets survey JSON carry HTML in several places (question/panel/
page `description`, `title` via `hasHtml`, the `html` question,
`completedHtml`/`loadingHtml`/`completedHtmlOnCondition`, etc.). Web
renders that HTML with the real browser DOM. This library renders it
through `<SanitizedHtml>` (`src/components/SanitizedHtml.tsx`), a
security-first adapter over `@native-html/render` — necessarily more
restrictive than a browser, by design.

### Tag support is an explicit allowlist, not "any HTML"

Web accepts arbitrary HTML — any tag, any nesting, any browser-supported
feature. This library only renders a fixed tag set: `p div span br hr h1
h2 h3 h4 h5 h6 ul ol li blockquote pre code strong b em i u s sub sup
table thead tbody tr td th a img` (plus `mark small del ins` when the
consuming component opts into `relaxedFormatting`).

- A tag outside the allowlist that isn't specifically dangerous (e.g.
  `<article>`, `<figure>`) is **unwrapped**: the tag itself disappears
  but its text/allowed-descendant content is kept in place.
- A fixed set of dangerous/foreign/raw-text elements (`svg math
  foreignObject template noscript meta link base style script iframe
  object embed form input textarea select button`, plus comments,
  doctypes, CDATA, and processing instructions) is **dropped as a whole
  subtree** — none of their content, including nested text, survives.

**Workaround:** author survey HTML using only the allowlisted tags for
content that must render on RN. There is no per-survey opt-out.

### No inline CSS (`style` attribute stripped unconditionally)

Web renders an element's `style` attribute as authored. This library
strips `style` on every element, always — there is no CSS property/value
allowlist in v1 (documented as a deliberate fidelity loss; a future,
separately-scoped allowlisted CSS parser — no `url()`, no imports — is
recorded but not built). Other attributes follow a minimal, functional
per-tag allowlist (e.g. `<a href>`, `<img src alt width height>`,
`<td>`/`<th>` `colspan`/`rowspan`) — attributes like `class`/`id`/
`onclick`/`data-*` are always dropped; there is no class-based styling
layer in this renderer for `class` to hook into anyway.

**Workaround:** move visual styling for HTML-bearing text into the
survey's Theme JSON (which this library does honor) rather than
per-element inline `style`.

### Links never auto-navigate — host app must opt in

Web's native `<a href>` navigates the browser directly on click/tap.
`<SanitizedHtml>` never calls `Linking.openURL` (or any navigation API)
itself. With no `onLinkPress` prop supplied, a press is silently a
no-op (plus a dev-only diagnostic); with one supplied, it receives the
**policy-revalidated canonical URL** and the host app decides what to do
(open in-app, open externally, ask the user, block it, etc.).

**Workaround:** always pass `onLinkPress` to `<SanitizedHtml>` (or, once
task 1.6/M1 wire the survey-level renderer, the corresponding `<Survey>`
prop) if link presses inside HTML content should do anything at all.

### URL scheme/origin policy is restrictive by default

Web has no equivalent restriction — the browser will request whatever
URL the page references. This library validates every URL through a
central scheme/origin policy (`src/security/uri-policy.ts`) before it
ever reaches a sink:

- Anchor `href` (event-only, human-mediated): a broader scheme set
  (`https http mailto tel`), no origin restriction.
- The automatic-fetch contexts the policy governs (survey/background
  images, video, `choicesByUrl` — wired by later tasks): `https:` only by
  default, and **no origin is fetchable until explicitly allowlisted** —
  IP-literal hosts (in every textual form: dotted, octal, hex, short, and
  bare-decimal), `localhost`/`.local`/private-range hosts, trailing-dot
  host variants, URL-embedded credentials, out-of-range ports, and
  non-default ports (unless that exact origin+port is allowlisted) are all
  denied. `data:` images are supported under a strict rule (allowlisted
  MIME types, strict RFC-4648 base64 including pad bits, a decoded-size
  cap, magic-byte verification) — no other `data:` use is ever permitted.
- `javascript: vbscript: file: about: blob: filesystem: intent: content:
  jar:` are denied everywhere, unconditionally — no configuration can
  widen this set.

### Remote `<img>` sources inside HTML content are stripped (fail-closed)

Web loads any `<img src>` directly. A native React Native `Image` request,
however, **follows HTTP redirects with no way to validate each hop** — so an
allowlisted origin could 30x-redirect to a denied one, defeating the origin
policy. Because per-hop redirect validation is not guaranteed on the
platform, this library **fails closed**: a remote (`http`/`https`) `<img>`
source inside sanitized HTML content is stripped entirely (a
`remote-image-stripped` diagnostic is emitted; the element's `alt` text
still renders). Only strict inline `data:` images — which involve no network
request at all — render from HTML `<img>` tags.

This applies specifically to `<img>` inside HTML content (rendered through
the stock renderer's native `Image`). Other image sinks (image question,
imagepicker, choice images, survey logo, background image) are wired by
later tasks (1.1/M2/M4) through a policy-aware, redirect-validating
transport and can load allowlisted remote images.

**Workaround:** inline small images as `data:` URIs, or serve HTML-embedded
imagery from the (later) transport-backed image sinks rather than raw
`<img>` tags. `imageUriConfig.allowedOrigins` remains meaningful for those
other sinks and for the `data:` decoded-size cap.

### Oversized/pathological HTML renders as plain text, not a partial DOM

Web will attempt to render arbitrarily large or deeply-nested HTML.
This library enforces resource bounds (source size, node count, depth,
attributes per element, attribute value length, total decoded text,
images per document, table dimensions) and, if any bound is exceeded,
extracts and renders the content as **plain text** instead — never a
partially-sanitized tree. This is a correctness/availability trade-off
specific to a mobile client's memory and render-cost constraints; web
has no equivalent ceiling.

**Workaround:** none needed for realistically-authored survey content —
the defaults are generous (256KB source, 5000 nodes, 512KB of text,
etc.). If legitimate content is hitting a bound, treat it as a signal to
simplify the HTML rather than expecting the same rendering as web.

## Scrolling & focus (task 1.2 — native lifecycle bridge)

Web scrolls/focuses through the DOM (`scrollIntoView`, element focus).
This library intercepts survey-core's single scroll/focus funnel
(`onScrollToTop`) and drives the registered ScrollView + native inputs
instead (`docs/design/1.2-lifecycle-bridge.md`).

### `onScrollToTop`'s `allow` is locked `false` — consumers cannot re-allow

On web a consumer handler may set `options.allow = true/false` to steer
core's own DOM scrolling. Here the bridge owns scrolling: `allow` is
locked `false` for the whole dispatch (a reassignment is ignored and
surfaces the `allow-override-ignored` diagnostic). The event stays fully
observable.

**Workaround:** to suppress or customize the native scroll, use the
renderer-level scroll event (`<Survey>`'s `onScrollToElement` prop, task
1.1 — built on the bridge's `onScrollRequest` seam; returning `false`
suppresses the native scroll only, focus still completes).

### `Question.focus(onError, scrollIfVisible: true)` force-scroll is lost

Web forwards `scrollIfVisible: true` down to `scrollIntoView`, forcing a
scroll even when the question is already visible. The fired
`ScrollToTopEvent` does not carry that flag, so the bridge always skips
the scroll when the target is fully visible in the viewport. The focus
itself still completes — only the redundant scroll motion differs.

**Workaround:** none; if upstream adds the flag to the event, the bridge
will honor it.

### `question.focusIn()` fires from the native input's `onFocus`

Web fires `focusIn` (→ `onFocusInQuestion`, `lastActiveQuestion`) from a
DOM focus-bubble listener on the survey root. Here each input component
fires `question.focusIn()` from its own `onFocus` handler (the
`ElementHandle.focusFirst` ownership contract) — same event timing
semantics (fires when focus actually lands, once per focus), different
mechanism. Consumers observing `onFocusInQuestion` see equivalent
behavior.

## Icons (task 1.5)

Web renders icons as `<svg><use xlink:href="#icon-x"/></svg>` against a
DOM sprite that `survey-react-ui` builds by registering the bundled
`iconsV2` set into `SvgRegistry`. This library resolves the same icon
names (including `settings.customIcons` remaps and every legacy/
size-suffixed alias core's `getIconNameFromProxy` handles) to raw SVG
markup and renders it through `react-native-svg`'s `SvgXml` via
`<RNIcon>`. Name resolution and override precedence match web
(consumer registrations beat bundled icons).

### Consumer-registered icon SVG is sanitized

Icons registered through `SvgRegistry.registerIcon`/`registerIcons` are
parse-validated against an SVG-only allowlist before rendering: drawing
primitives, gradient/clip/mask/pattern plumbing and `title`/`desc`/text
survive; `image`, `foreignObject`, `script`, the `animate*` family and
`on*` attributes are dropped (with structured diagnostics), and
`href`/`xlink:href` survive only as local `#fragment` references. Web
injects registered markup into the DOM sprite unmodified. Rationale:
`SvgXml` supports `<Image href>`/`<Use href>` network fetches, which
would bypass the library's URL policy (see the HTML section) if icon
markup went in raw. The bundled `survey-core` icon set is trusted and
rendered byte-identical.

**Workaround:** none needed for normal vector icons (paths, shapes,
gradients all pass). If a custom icon needs raster imagery, render it
with your own component instead of the icon registry.

### Icons registered after mount need `registerIcons()`

Upstream's `SvgRegistry.registerIcon()` (singular) does not fire
`onIconsChanged`, so an already-mounted icon won't re-resolve — the
same staleness the web sprite has. Register icons before rendering the
survey, or use `SvgRegistry.registerIcons({...})` (plural), which fires
the change event and re-renders mounted `<RNIcon>`s.

### Default icon size is 24, not 16

Web's bare `createSvg` falls back to 16px when no size is provided;
`<RNIcon>`'s default is 24 (matching `Action.iconSize`'s model
default). Action-driven call sites always pass the model's `iconSize`,
so this only affects direct `<RNIcon>` usage without a `size` prop.

### CSS custom properties inside icon `style` attributes do not resolve

A few core icons (e.g. `timercircle`) carry `style` attributes
referencing CSS variables (`var(--sd-timer-…)`). React Native has no
CSS-variable cascade, so those declarations are inert. Affected
components own their RN-side styling when they land (timer panel task).

## Text input editing (task 1.9)

Web renders text inputs uncontrolled: the DOM input owns in-progress
text. React Native's `TextInput` is used controlled here (architecture
invariant 3), with an explicit draft/commit adapter honoring
`textUpdateMode`. Commit timing, validation timing, expression timing,
and the external-write policy all mirror web exactly (verified against
`survey-react-ui`'s `updateDomElement`); the entries below are the
observable edges of the controlled pattern itself.

### External or transformed writes while typing move the cursor

When the model rewrites a value mid-edit — a trigger or
`onValueChanging` handler changing the committed text, or
`survey.setValue` from host code while the field is focused — the
adapter replaces the in-progress draft, exactly as web overwrites the
DOM input's buffer (its `updateDomElement` has no focus check). On a
focused controlled `TextInput` that replacement also repositions the
cursor (platform-dependent, typically to the end) and can abandon an
in-flight IME composition. Web's uncontrolled input has the same
caret-jump on genuine external writes; the difference is only that RN's
controlled pattern makes the value prop the single source of truth, so
the reset is guaranteed rather than browser-dependent. Self-commits
(the user's own typing under `textUpdateMode: "onTyping"`) never
trigger this — the committed value loosely equals the draft, so the
draft is left alone.

**Workaround:** avoid rewriting a question's value from
`onValueChanging`/triggers while the user is actively editing it, or
use `textUpdateMode: "onBlur"` (the default) so rewrites land at blur
time.

### Masked text questions never commit per keystroke

Not a divergence — survey-core itself downgrades masked questions
(`maskType` other than `"none"`) to blur-commit on every platform,
including web (`QuestionTextModel.getIsInputTextUpdate`). But because
RN hosts often expect live masking, this library makes the contract
explicit: the draft/commit adapter enforces the blur-commit gate
independently of that core internal and emits a one-shot
`masked-on-typing-downgraded` diagnostic (through the standard
diagnostic seam) when a survey or question requested
`textUpdateMode: "onTyping"` on a masked question. Per-keystroke mask
formatting of the visible text (the web `InputElementAdapter` role)
arrives with the text question component (task 1.10).
