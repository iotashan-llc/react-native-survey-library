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

## Element/row widths (task 1.3)

Web hands survey-core's computed width strings (`SurveyElement.rootStyle`:
`flexBasis`/`minWidth`/`maxWidth` as CSS text) straight to the browser's
CSS engine. React Native has no CSS engine, so this library evaluates
those strings itself (`src/layout/width-resolver.ts`) against the
measured row width and gives Yoga plain numbers.

### Supported width grammar (everything survey-core itself emits)

| Form | Example | Notes |
|---|---|---|
| empty / `auto` | `""`, `"auto"` | constraint omitted |
| bare number | `"250"`, `250` | treated as px (survey-core's own convention) |
| px | `"300px"` | 1 CSS px = 1 dp |
| percent | `"33.333333%"` | resolves against the measured row width (plus the inter-element gutter on multi-element rows, matching web's gutter geometry) |
| `calc()` | `"calc((100% - 300px)/2)"` | full `+ - * /` arithmetic with nested parens, CSS calc type rules enforced |
| `min()` / `max()` | `"min(100%, 300px)"` | n-ary, nestable inside `calc()` |

Because widths resolve against a *measured* container, a row's children
render one frame after the row's first `onLayout` (imperceptible in
practice; web computes the same values in its layout pass instead).

### Unsupported units degrade per-property, never crash

Any other CSS unit in a user-set `width`/`minWidth`/`maxWidth` — `em`,
`rem`, `vw`, `vh`, `pt`, `ch`, viewport/font-relative units in general —
and any unparseable value (web lets the browser silently discard those)
produce a structured diagnostic (`layout/unsupported-width-unit` /
`layout/invalid-width` through the standard diagnostics seam) and drop
just that one constraint: the element falls back to sharing the row like
an unsized element. All other constraints on the same element keep
working.

**Workaround:** express element widths in `px`, `%`, or the `calc()`/
`min()`/`max()` combinations of those — the only forms survey-core's own
row math ever generates.
