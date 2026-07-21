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

The `html` question type (supported since v0.2.1) renders
`question.html` through this same `<SanitizedHtml>` sink rather than
web's `dangerouslySetInnerHTML`, so every constraint in this section
applies to it — the tag allowlist, the stripped remote `<img>` sources,
and the host-opt-in link policy (a link inside html content surfaces
through the survey-level `<Survey onLinkPress>` handler labeled
`context: 'html-question'`; with no handler anywhere the anchor renders
as plain text — see "Links never auto-navigate" below). No new
deviation beyond those already listed here.

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
itself. Link presses are a **host opt-in**:

- `<Survey onLinkPress={(event) => ...}>` receives every anchor press
  from every sanitized-HTML sink in the tree — titles, descriptions,
  errors, the completed/completed-before/loading state pages, the
  `html` question, and choice captions. The event is
  `{ url, context, origin, scheme }`: `url` is the **policy-revalidated
  canonical URL** (re-checked at press time; a policy-failing href never
  fires the event), `context` names the sink (`'title'`,
  `'description'`, `'error'`, `'completed'`, `'html-question'`,
  `'choice'`, ...), and `origin`/`scheme` carry the validation's own
  parse (`'https://example.com'` / `'https:'`; both `null` for opaque
  schemes like `mailto:`/`tel:`) so a host trust decision never has to
  re-parse `url` — and can never re-parse it *differently*. The host
  decides what to do — `Linking.openURL(event.url)` is the host's line
  to write (open in-app, open externally, ask the user, block it).
- Rendering `<SanitizedHtml>` (a public export) directly with its own
  `onLinkPress` prop still works and wins over the survey-level handler
  for that sink.

**A11y honesty:** with NO handler resolvable (no `<Survey onLinkPress>`,
no per-sink prop), anchors render as **plain text** — no link
accessibility role, no pressable. A screen reader is never offered a
"link" that does nothing; the role and pressability appear exactly when
a press actually surfaces an event.

### URL scheme/origin policy is restrictive by default

Web has no equivalent restriction — the browser will request whatever
URL the page references. This library validates every URL through a
central scheme/origin policy (`src/security/uri-policy.ts`) before it
ever reaches a sink:

- Anchor `href` (event-only, human-mediated): a broader scheme set
  (`https http mailto tel`) and no origin restriction — but URL-embedded
  credentials (`https://user@host`, including host-lookalike forms like
  `https://trusted.com@evil.com`) are rejected the same as in fetch
  contexts, and protocol-relative refs (`//host/...`) are never passed
  through unresolved: they resolve against a configured `baseUrl` (and
  re-validate as an absolute link, true origin included) or fail closed.
  Bare relative refs (`/help`, `docs/page`) still pass through unresolved
  for the host to interpret.
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

This fail-closed stripping applies specifically to `<img>` **inside HTML
content** (rendered through the stock renderer's native `Image`).

The other image sinks (image question, imagepicker choice images, survey
logo) do **not** share this fail-closed posture, and the redirect gap
described above is **not** closed for them today. Each validates the URL
**once** against the scheme/origin policy (`src/security/uri-policy.ts`)
and then hands the canonical URL straight to a React Native `<Image>`
(`src/questions/ImageQuestion.tsx`, `src/questions/ImagePickerQuestion.tsx`,
`src/components/LogoImage.tsx`) — there is no redirect-validating transport
in front of that sink. RN `Image` follows HTTP redirects with **no per-hop
validation** (documented at `src/security/sanitize-html.ts`, the `img.src`
branch), so an allowlisted origin that 30x-redirects can still reach a
denied/private origin on these sinks. In other words: the origin allowlist
is enforced only on the **initial** URL, not on redirect targets. This is a
known limitation for these remote-image sinks, tracked for a future
policy-aware transport; it does not affect inline `data:` images (no network
request) or the fail-closed HTML `<img>` path above.

**Workaround:** for HTML content, inline small images as `data:` URIs. For
the image-question / imagepicker / logo sinks, only reference origins you
trust to not redirect off-allowlist (ideally your own origin serving stable,
non-redirecting URLs). `imageUriConfig.allowedOrigins` still gates the
**initial** request origin and the `data:` decoded-size cap.

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

## `<Survey>` root component (task 1.1)

### No arbitrary model-property passthrough props

`survey-react-ui`'s `<Survey>` assigns any unrecognized prop straight
onto the model (`updateSurvey`: `survey[key] = props[key]`), so web code
like `<Survey model={m} showNavigationButtons={false} />` silently works.
This library's `<Survey>` accepts a **typed surface only**: `json`,
`model`, `theme`, `styles`, `uriPolicy`, `onScrollToElement`, plus every
model event as a typed `on*` prop (derived from survey-core's actual
`EventBase` members, so the compiler flags drift).

**Workaround:** set model properties on the model itself
(`model.showNavigationButtons = false`) or in the survey JSON — both
work identically to web.

### `json`-path URLs are policy-checked BEFORE the model exists; `model`-path is trusted

On web, `choicesByUrl` fires its network request the moment the
`SurveyModel` is constructed — before any application code can veto it.
This library preflights the `json` prop against the central URI policy
(scheme/origin allowlist, `uriPolicy` prop) and **strips** any offending
URL-bearing property (`choicesByUrl`, `imageLink`, `logo`,
`backgroundImage`) from a clone before constructing the model. Each
strip emits a `survey-json-blocked-url` diagnostic; the consumer's JSON
object is never mutated. A survey passed as a prebuilt `model` is
documented as **trusted/prevalidated by the host** — no preflight runs
(hosts can call the exported `preflightSurveyJson` themselves before
constructing).

### `choicesByUrl` is ALSO enforced at request time, including redirect end-URLs

The preflight above is a construction-time check on authored JSON. On top
of it, a **request-time gate** (`src/security/choices-gate.ts`, armed
automatically whenever a `<Survey>` is mounted — no consumer opt-in) hooks
survey-core's `settings.web.onBeforeRequestChoices` seam and validates
the request URL of every **gated** `choicesByUrl` request (gated = the
json path, plus any model registered with a `uriPolicy` — see "Scope and
composition" below; ungated host-model requests stay trusted by
contract) — the fully text-processed URL at the moment the request would
fire — against the same central URI policy. This covers what the
preflight cannot see: post-construction model mutation
(`question.choicesByUrl.url = ...` re-runs the request) and dynamic
`{placeholder}` re-runs. On violation the request **never fires** (the
gate defuses the XHR before `send`), the question receives **empty
choices** plus core's own `WebRequestError` (fail-closed, never a crash,
never partial data), and a `choices-by-url-blocked` diagnostic
(`phase: 'request'`, deduped) is emitted. Diagnostic URL fields are
**redacted** — scheme + host + truncated path only; userinfo, query, and
fragment (where embedded credentials/API tokens live) are stripped
before the payload reaches the console or a host diagnostic handler. A
`uriPolicy` config that makes the validator **throw** is treated as a
violation (`reason: 'uri-policy-error'`), never propagated.

**Static cache and request coalescing:** survey-core keeps a
process-wide static results cache (`ChoicesRestful.itemsResult`) and a
same-request coalescing registry, and consults both **before** firing a
request — i.e. before the request-time hook can run — so either could
hand a question choices the gate never saw. The gate closes both
delivery paths for gated questions: a cached payload is served only when
the requesting survey's **own** policy passes both the request URL *and*
the cache entry's recorded final (post-redirect) URL — provenance the
gate records whenever a gated request's payload passes the end-URL check
below. Entries with no recorded provenance (cached by a trusted/ungated
survey) and entries whose provenance fails the requesting policy are
**refetched** through a fresh, fully gated request instead of served;
blocked request URLs fail closed exactly as above (empty choices +
diagnostic, no network). Gated questions never join same-request
coalescing — each fires its own fully gated request (a rare duplicate
concurrent GET between surveys under different policies is the
documented cost).

**Redirects:** React Native follows HTTP redirects inside the native stack
(NSURLSession/OkHttp) with no JS per-hop callback and no
`redirect: 'manual'` — per-hop validation is **not achievable** on the
platform (same constraint as the remote-image sinks above). The gate
enforces the strongest available mechanism instead: after the response
arrives it validates the **final** URL (`xhr.responseURL`, populated from
the native stack on both platforms) and, if the request ended off-policy
— or the runtime exposed no end URL to check — the payload is
**discarded** before core can parse or cache it: empty choices, a
`choices-by-url-blocked` diagnostic (`phase: 'redirect'`). Residual, as
with remote images: by validation time the GET has already egressed to
the redirect target at the native layer — the gate prevents the response
from entering the model, not the hop itself.

**Scope and composition:** the `json` path is always gated (with the
`uriPolicy` prop, or the fail-closed defaults when the prop is absent —
mirroring the preflight). A host-constructed `model` fired its
construction-time requests before this library ever saw it (that boundary
is the host's, per the trusted-by-host contract) — but its runtime
RE-runs are gated too whenever a `uriPolicy` prop is passed; without the
prop the model path stays fully trusted. Hosts constructing models
themselves can opt their construction into the gate with the exported
`runWithConstructionUriPolicy(config, () => new Model(json))` +
`registerModelUriPolicy(model, config)`. A pre-existing
`settings.web.onBeforeRequestChoices` host hook (the documented
auth-header seam) keeps working: the gate captures and chains it after
the policy check passes (it is not invoked for blocked requests), and the
last `<Survey>` unmount restores it.

### Owned-model lifetime

A model built from the `json` prop is owned by the component: it is
disposed on unmount and on `json` content change (deep-equality — a new
object with equal content does NOT recreate, matching web). Host-passed
`model`s are never disposed. Web's renderer leaks its event
subscriptions on unmount; this library fully unwires its prop-driven
subscriptions from host-owned models.

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
| `calc()` | `"calc((100% - 300px)/2)"` | `+ - * /` arithmetic with nested parens (the restricted calc type rules: `+`/`-` same-type, `*`/`/` need a plain number) |
| `min()` / `max()` | `"min(100%, 300px)"` | n-ary, nestable inside `calc()` |

Numbers are CSS number tokens — signed and scientific forms parse
(`"+10px"`, `"-10px"`, `"1e2px"`; survey-core emits these for numeric
user widths like `"+10"` or `"1e2"`). Two deliberate deviations from a
browser's CSS engine, both to honor survey-core's own conventions:

- **Bare numbers mean px even inside `min()`/`max()`** — survey-core
  emits `min(100%, 250)` for a numeric user `minWidth`, which a browser
  discards as a type error; this library reads it as 250dp. (So
  `min(1, 300px)` is 1dp here, where web would drop the constraint.)
- **Hex/locale-decimal numerics are NOT parsed** — survey-core's
  numeric check also lets `"0x10"` / `"10,5"` through (emitting
  `"0x10px"` / `"10,5px"`); those degrade per-property with a
  diagnostic, same as any invalid value.

Because widths resolve against a *measured* container, a row's children
render one frame after the row's first `onLayout` (imperceptible in
practice; web computes the same values in its layout pass instead).

### Unsupported units degrade per-property, never crash

Any other CSS unit in a user-set `width`/`minWidth`/`maxWidth` — `em`,
`rem`, `vw`, `vh`, `pt`, `ch`, viewport/font-relative units in general —
and any unparseable value (web lets the browser silently discard those)
produce structured diagnostic data (`layout/unsupported-width-unit` /
`layout/invalid-width`, returned by the resolver; the row renderer —
task 1.4 — forwards them, deduplicated, through the standard
diagnostics seam) and drop just that one constraint: the element falls
back to sharing the row like an unsized element. All other constraints
on the same element keep working.

**Workaround:** express element widths in `px`, `%`, or the `calc()`/
`min()`/`max()` combinations of those — the only forms survey-core's own
row math ever generates.

## Page/panel/row composition (task 1.4)

### Lazy rendering is not supported

`survey.lazyRendering` (and `lazyRenderingFirstBatchSize`) is driven by
DOM scroll observation (`ScrollableContainer`/IntersectionObserver on
web); there is no RN equivalent wired, so rows always render eagerly
and no skeleton placeholders exist. Surveys that enable it still work —
the flag simply has no effect.

### `onAfterRenderPage` fires with `htmlElement: null`; the other `afterRender*` events never fire

The web renderer calls `survey.afterRenderSurvey/afterRenderPage/
afterRenderQuestion` with live DOM nodes during render lifecycles. This
renderer calls core's public `afterRenderPage` from its commit
lifecycles (it owns the page-change scroll/autofocus machine — design-
mode suppression, scroll dedup, deferred `scrollToTopOnPageChange`,
pending-focus routing), so **`onAfterRenderPage` DOES fire — with
`htmlElement: null`** (there is no DOM node to pass).
`afterRenderSurvey`/`afterRenderQuestion` are never called (no DOM
nodes; render-phase side effects violate React 19 contracts). Hosts that
used `onAfterRender*` events for styling should use theme JSON; for
focus/scroll behavior see the next item.

### Expand/add scroll-to-element rides the lifecycle bridge

survey-core schedules internal scroll-to-element timers on
`panel.expand()`, dynamic element adds (`addNewQuestion`/`addElement`
with focus), and page changes. All of them funnel through
`onScrollToTop`, which the native lifecycle bridge intercepts (see the
"Scrolling & focus" section above). Without a bridge-registered
ScrollView the request is safely inert — the facade's environment stub
keeps core's DOM scroll path from throwing, and nothing scrolls.

### Row enter/leave animations are not carried

Core disallows animations headless (the renderer never calls
`enableOnElementRerenderedEvent()`), so `.sd-row--enter/--leave`
fade/slide transitions do not occur. Rows appear and disappear
immediately on visibility/membership changes.

### Narrow-mode multi-element rows stack explicitly

On the web, side-by-side questions collapse to one-per-line on narrow
screens *emergently*: each element's `min-width: min(100%, var(--min-width))`
forces `flex-wrap` onto its own line, and `flex-grow: 1` fills it. That
path needs CSS `min()`/percentages resolved at layout time, which the
all-numeric RN width resolver deliberately does not have. Instead,
narrow mode (the theme provider's `narrow` prop, driven by the survey
root's own width measurement) is an explicit switch: multi-element rows
render as a vertical stack of full-width children separated by the
row-gap metric. While stacked, per-element `width`/`minWidth`/`maxWidth`
are not consulted — a web element whose explicit `max-width` would have
kept it narrower than its line renders full-width here.

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

## Text question rendering (task 1.10)

The `text` question renders as a native `TextInput` for all 13
`inputType`s survey-core allows (settings.ts `questions.inputTypes`).
Web delegates each `inputType` to the browser's own `<input type=…>`
widget; React Native has no such per-type widget set, so the mapping is
explicit — and where no native affordance exists yet, the field falls
back to plain text rather than approximating one.

### Text input inputType fallbacks

`text`, `email`, `url`, `tel`, `number`, and `password` get real native
affordances (keyboard type, autofill hints, secure entry). The other
seven — `date`, `datetime-local`, `time`, `month`, `week`, `color`, and
`range` — render as plain text fields in v1: no native date/time
picker, no color swatch, no slider. Core's VALUE-level validation
(min/max/step, required, validators) runs at commit time exactly as on
web; the FORMAT guarantee a browser widget provides is a different
story — see the next section.

**Migration path:** native date/time pickers are scheduled for M5 and
`range` gets a real slider in task 4.4 (see
`docs/IMPLEMENTATION-PLAN.md`); until then hosts needing a picker UX
should use a custom question or collect the value as text.

### Date/time fallback types: format validation is component-side, not browser-side

On web, `date`/`datetime-local`/`time`/`month`/`week` inputs are native
widgets with a hard contract: the committed value is either
format-valid or `""`. Unparseable text never reaches the model — the
DOM reads it as `input.value === ""` with `validity.badInput` set, and
core surfaces an "Invalid input" error from `validity.badInput` plus
the browser's `validationMessage` (fed through `onKeyUp` into
`dateValidationMessage`). RN has no DOM validity, no
`validationMessage`, and no keyup pipeline, so the renderer reproduces
the contract itself (`src/questions/dateTimeFallback.ts`, WHATWG-shaped
format checks):

- **Commit guard (all five types):** text that fails the HTML format
  check for its `inputType` commits as `""` at blur/submit — web
  parity: the DOM would have read `""` too. Mid-typing commits
  (`textUpdateMode: "onTyping"`) of in-progress partials are simply
  skipped (not `""`-committed), so typing `2024-0…` toward a valid
  month neither commits garbage nor clears the field mid-edit. This
  guard is also a crash guard: committing an unparseable `month` string
  into an unmodified survey-core THROWS (`correctValueType` calls
  `createDate(...).toISOString()` on it), and `datetime-local` hits the
  same path under `settings.storeUtcDates`.
- **Error surface, `date` / `datetime-local`:** the format verdict is
  routed through core's own PUBLIC `onKeyUp` handler (the exact handler
  web wires), which stamps `dateValidationMessage`; core's
  `onCheckForErrors` then reports "Invalid input"
  (`invalidInputErrorText`, localized) at validation time. Same error,
  same text, same timing as web.
- **Error surface, `time` / `month` / `week`: none (divergence).**
  Core's `isDateInputType` covers only `date`/`datetime-local`, so
  there is no sanctioned seam to surface a format error for these three
  without patching core. Discarded input emits the once-per-question
  `datetime-fallback-invalid-discarded` diagnostic (standard diagnostic
  seam) instead of a user-visible error. Hosts that need a visible
  error today should add a `regex` validator; web surfaces
  "Invalid input" via DOM validity here, RN does not.
- **Field display after a discarded commit (divergence):** web keeps
  the unparseable text visible in the widget while the value reads
  `""`; RN's controlled field syncs to the committed model value at
  blur, so the field visibly clears. The value-level outcome is
  identical.

### Masked inputs: the maxLength cap is applied after formatting, not by the native prop

Web's mask adapter truncates the FORMATTED value to the input's
`maxlength` before writing it back (`InputElementAdapter.
setInputValue`): a mask can restore literals and placeholders past the
raw edit's length, so the cap has to run post-format. RN's native
`maxLength` prop caps the RAW edit BEFORE the mask runs — at the limit
it would swallow legitimate mid-string edits (a fixed-length pattern
mask momentarily exceeds the limit while shifting digits) and cannot
cap what `processInput` expands. So for masked questions the native
`maxLength` prop is intentionally omitted and the renderer applies
web's post-format cap itself (`applyMaskedEdit`), truncating the
formatted draft and clamping the caret. Unmasked questions keep the
native prop. Same observable limit as web through typing and deletion;
the only divergence is which layer enforces it.

### Masked inputs and IME composition: best-effort, single-frame caret control

Web defers value updates around IME composition using DOM composition
events and the keyCode-229 dance; RN 0.86 exposes NO composition
events (`onTextInput` is gone from the New Architecture API), so a
true "defer masking while composing" is not implementable. The
renderer minimizes interference instead:

- The `TextInput` is never left permanently selection-controlled. The
  caret is forced only for the single frame after the mask actually
  reshapes an edit, and control is released back to the native layer on
  the next selection event (one-shot).
- Edits the mask accepts verbatim never touch the `selection` prop at
  all — plain digit entry through a numeric/currency mask stays fully
  native-owned.
- Pre-edit selection tracking (`onSelectionChange`) reconstructs web's
  `beforeinput` args (`createArgs`) exactly, including
  repeated-character edits a bare text diff cannot locate.

**Residual divergence:** composing multi-keystroke IME text directly
into a masked field (e.g. CJK input) can still have the composition
interrupted when the mask rejects or reshapes the composed fragment
mid-flight — on web the mask adapter's `beforeinput`+`preventDefault`
interception is similarly hostile to composition inside masked fields,
but the failure shape differs (web cancels the insert; RN may reset
the composition). Mask vocabularies are effectively ASCII
(numeric/currency/datetime/pattern), so this affects only IME entry of
characters the mask would reject anyway.

### `min`/`max`/`step` render no widget affordance

Web's `<input type="number">` (and date/range types) surface
`min`/`max`/`step` as browser-native UI: spinners that stop at the
bounds, sliders with a fixed track, date pickers that grey out
out-of-range dates. RN's `TextInput` has no equivalent attribute-level
affordance, so `renderedMin`/`renderedMax`/`renderedStep` do not change
what is rendered. The underlying VALUE validation is unaffected — core
enforces min/max/step at commit time (`isValueLessMin`,
`isValueGreaterMax`, `isStepNumberIncorrect`) exactly as on web, where
that validation also runs independently of the browser affordance.

### `autocomplete` tokens pass through on an exact allowlist

`question.autocomplete` carries an HTML autocomplete token. RN's
`TextInput.autoComplete` accepts its own (overlapping) vocabulary, so
tokens are passed through only when RN recognizes them verbatim
(`email`, `tel`, `given-name`, `cc-number`, `off`, …); unmapped tokens
are dropped silently — the prop is omitted and RN/the OS fall back to
their own autofill heuristics. No token is ever guessed or remapped to
a "closest" RN value.

## Comment / radiogroup / checkbox questions (tasks 1.11, 1.12)

### `acceptCarriageReturn:false` filters newlines from typed text instead of intercepting the keypress

Web prevents the Enter keydown at the DOM level (`event.preventDefault()`
in `QuestionCommentModel.onKeyDown`), so a newline never enters the
`<textarea>` buffer. RN's `TextInput` has no equivalent way to intercept
a keypress and stop it from mutating the text buffer for a multiline
field. This library reaches the same end state — no newline ever
visible or committed — by stripping `\r`/`\n`/`\r\n` from the typed text
inside `onChangeText` before it reaches the draft/commit adapter. The
observable difference is only during composition on some IME keyboards
where a newline could theoretically flash before being stripped; the
committed value and the settled draft are identical to web.

### No resize handle for the comment area

Web's `allowResizeComment`/`Question.allowResize` renders a
user-draggable resize handle on the `<textarea>`. RN has no native
equivalent gesture primitive wired for this in v1, so the comment
question always sizes itself the same way regardless of
`allowResize`/`resizeStyle` (only `autoGrow` — content-driven growth via
`onContentSizeChange` — is honored).

### Read-only text/comment plain-text mode renders as `Text`, not `<div>`

Web can optionally render a read-only text/comment question as a plain
`<div>` holding the committed value instead of a disabled
`<input>`/`<textarea>` (`settings.readOnly.textRenderMode === "div"` for
text, `settings.readOnly.commentRenderMode === "div"` for comment — both
default to the input/textarea mode). This is **now supported**: when
`isReadOnlyRenderDiv()` holds, the question renders its committed value
as a plain `Text` node (the RN analog of web's `<div>{value}</div>`)
instead of a disabled `TextInput`. The value is user-entered plain text
(never a `LocalizableString`), so it is rendered directly — the text
question through `inputValue` (the masked display value when a mask is
active, matching web), the comment question through `value`. The plain
`Text` node carries no input-recipe chrome (border/padding), matching
web's unstyled `<div>`. With the default render mode (the shipped
default), a read-only question still renders the disabled `TextInput`
styled via the read-only recipe fragment.

### The radiogroup checked dot is a filled `View`, not an icon primitive

The checkbox checkmark renders through the shared `RNIcon` primitive
(web parity: web draws it with `<use xlinkHref={question.itemSvgIcon}>`
against core's `#icon-check-16x16`; the RN port resolves that same core
icon by name — the leading `#` DOM-sprite fragment marker is stripped —
and sizes/colors it from the item recipe's `iconSize`/`iconFills`
tokens). The radiogroup **checked dot** stays a small filled `View`:
web radios are a CSS-drawn filled circle (the radiogroup `cssClasses`
carry no `itemSvgIconId` in the default, non-preview render), so there
is no icon to adopt there. Both are presentation-only; no model or
state contract depends on the decorator shape.

### Columns are a flat N-column flex-wrap grid, not upstream's column-item redistribution

Web's `colCount > 1` layout (`getColumnsWithColumnItemFlow`/
`getColumnsWithRowItemFlow`) redistributes items into column-major or
row-major buckets with per-column DOM containers. This library's v1
implementation is a simple flex-wrap grid: each item gets a
`${100 / colCount}%`-wide container inside a `flexWrap: 'wrap'` row.
Visually equivalent item ordering for small choice lists; upstream's
exact column-balancing algorithm is not reproduced.

### "Other" item free text uses its own draft/commit adapter, not the primary text adapter

The checkbox/radiogroup "Other (describe)" comment field commits through
`question.otherValue` — a different model surface than the primary
`value`/`inputValue` the task-1.9 `DraftCommitAdapter` is scoped to, and
one whose backing store is mode-dependent (the `comment` property when
`storeOthersAsComment` is true — the default — or the `otherValue`
property plus the value itself when false). A sibling adapter
(`OtherCommentDraftAdapter`) mirrors the same draft/commit timing
(`isInputTextUpdate` gates per-keystroke commit; blur always commits)
and subscribes to both backing properties so external writes stay live
in either mode — functionally equivalent to web, implemented separately.


## Navigation / progress / rating (tasks 1.8, 1.14)

### Only the percentage progress routes render (v1)

`SurveyProgressBar` renders the EFFECTIVE percentage routes: `"questions"`,
`"requiredQuestions"`, `"correctQuestions"` — and `"pages"` only under
`settings.legacyProgressBarView` (mirroring the private
`progressBarComponentName` conversion: under the default css type,
`"pages"` routes to the ProgressButtons tree upstream) — the family upstream
routes through its own percentage `SurveyProgress` component. The
obsolete `"buttons"` value and the TOC/page-titles extension render a
materially different component tree upstream (`ProgressButtons`) and
are deferred: for those types the component renders nothing and reports
a `progress-bar-type-unsupported` diagnostic (once per mounted bar)
instead of showing a misleading percentage visual.

### Progress text renders below the bar, not overlaid

Upstream's visible progress label is a sibling of the bar (its in-bar
copy is hidden by the default theme's CSS). The RN track is a
height-limited, overflow-hidden View, so the label renders as a sibling
BELOW the track — same information, stacked layout instead of a
CSS-positioned overlay.

### Rating required/invalid state is not exposed to assistive technology

The rating item row exposes core's `radiogroup` role
(`a11y_input_ariaRole`) and the question label
(`a11y_input_ariaLabel`, falling back to `processedTitle`), and each
item keeps `radio` + checked semantics. React Native has no
`aria-required`/`aria-invalid` analog on Views, so
`a11y_input_ariaRequired`/`a11y_input_ariaInvalid` are NOT mapped —
required/invalid state reaches users through the rendered error text
(question chrome), not platform accessibility state.


## Accessibility (task 1.16)

### Checkbox groups expose a label but no group role

Core assigns the checkbox question's input role `"group"`
(`a11y_input_ariaRole`, question_checkbox.ts:760-762). React Native has
no group accessibility role, so the items container carries the question
label (`a11y_input_ariaLabel` ?? `processedTitle`) without a role;
each item keeps its own `checkbox` role + checked state. Radiogroup and
rating containers DO map their core `radiogroup` role natively.


## Image question (task 2.10)

### `contentMode: "video"` is deferred; `"youtube"` is never supported

v0.2 renders only `renderedMode === "image"`. A video content mode
renders nothing and reports an `image-content-mode-unsupported`
diagnostic (native video arrives with the expo-video capability task);
YouTube iframes are a documented won't-support (WebView/expo-video path
described in the plan).

### A failed image load shows the alt text (web shows nothing)

Web sets `display:none` on a broken `<img>` (`contentNotLoaded`).
Native screens render `renderedAltText` (altText || title) instead —
an accessible fallback beats a silent blank. Load state still routes
through core's own `onLoadHandler`/`onErrorHandler`.

### `imageFit` maps to RN `resizeMode`

contain → contain, cover → cover, fill → stretch, none → center (same
mapping as the header logo). Dimensions come from core's
`renderedWidth`/`renderedHeight` (serializer defaults 200×150); an
`auto` dimension is omitted — RN cannot derive intrinsic size
synchronously, so auto-sized images need explicit `imageWidth`/
`imageHeight` in the JSON.


## Imagepicker question (task 2.7)

The `imagepicker` renders a grid of image-choice tiles; tapping selects
(scalar value for single-select, an array for `multiSelect`). It reuses
the image question's URI-policy image path (task 2.10) and the
checkbox/radiogroup selection semantics, so those questions' differences
apply.

### Columns are a flat N-column flex-wrap grid

Like checkbox/radiogroup (task 1.12), the `colCount`/`getCurrentColCount`
layout is a simple flex-wrap grid — each tile a `${100/cols}%`-wide
container. Upstream's exact column-balancing/responsive-image algorithm
(`responsiveColCount`, per-breakpoint image resizing) is not reproduced;
tile size comes from core's `renderedImageWidth`/`renderedImageHeight`.

### A blocked/failed choice image shows the choice text

Each tile's image loads through the central URI policy
(`validateUri(…, 'image')`, invariant 8) — `data:` inline images and
allowlisted `https:` load; a raw remote (`http`/`https`) source that
fails the policy is dropped **fail-closed** with an `image-uri-blocked`
diagnostic, and the tile renders the choice **text** instead of a blank
image (same fail-closed posture as the image question, task 2.10). Web
would request the URL directly.

### `contentMode` other than `"image"` renders nothing

Like the image question (2.10), only `contentMode: "image"` is supported
in v1 — `"video"`/`"youtube"` render nothing and report an
`image-content-mode-unsupported` diagnostic (native video/WebView paths
are deferred).

## Rating question — `displayMode: "dropdown"` (task 2.5a)

### The drop-down mode presents through the 2.1 overlay sheet

`displayMode: "dropdown"` (core maps it to `renderAs` at load and on a
runtime change, both directions) routes through the `sv-rating-dropdown`
renderer row to an overlay-backed control — the SAME `dropdownListModel`
+ sv-list ListPicker sheet the dropdown/tagbox questions use, never
web's anchored popup. The collapsed control shows core's
`selectedItemLocText` (its `readOnlyText` when read-only, the localized
placeholder when empty), carries combobox a11y (core's input aria
surface; `ariaExpanded` is a string `'true'`/`'false'`), and exposes a
clear affordance named by core's `clearCaption` behind the `allowClear`
gate. The overlay rows are the shared ListPicker's, and their per-row
dispatch resolves the registered `sv-rating-dropdown-item` content —
the localized rate title plus, on the min/max rows, the
`minRateDescription`/`maxRateDescription` text (core stamps that
component on every dropdown-mode list action and puts a `description`
LocalizableString on the min/max actions; probe-verified) — matching
web's registered rating-dropdown-item. The Dropdown-question
differences (overlay sheet, not an anchored list; no inline filter
input) apply — see the Dropdown question section.

The collapsed control materializes its core `DropdownListModel` one
microtask AFTER the mount commit (render purity: construction fires
core property notifications on the question, which must land in
neither render nor the mount-commit window), so the very first tick
renders an inert placeholder. Web constructs the model during render.

### `displayMode: "auto"` auto-collapses via measurement (web parity)

Core's DEFAULT `displayMode` is `"auto"`; on web a `ResizeObserver`
feeds `processResponsiveness`, collapsing the rate buttons to the
dropdown when they overflow and expanding back when they fit. RN wires
the **same measurement seam as buttongroup** (task 2.9/2.5b — see that
section) through the shared `core/processResponsiveness` adapter: an
always-mounted wrapper View's `onLayout` supplies the live available
width and the rate-buttons `ScrollView`'s `onContentSizeChange` supplies
the intrinsic required width; **CORE keeps the decision** (the ±2
deadband, the `renderAs` flip to `"dropdown"` and back), and the same
caller-side gates apply (widths rounded before the call, identical pairs
deduped, invalid-width samples invalidate that dimension, and **design
mode never compacts**). `"buttons"` (never collapses) and `"dropdown"`
(always collapsed) are unchanged — core itself no-ops
`processResponsiveness` for those modes, and the measurement seam is only
mounted while `displayMode === "auto"`.

Two RN mechanics differ from buttongroup because the rating dispatch
**splits into two components** — `RatingQuestion` (buttons, template
`"rating"`) and `RatingDropdownQuestion` (collapsed, renderer
`"sv-rating-dropdown"`) — and an auto-collapse SWAPS them (SurveyRowElement
re-dispatches on the `renderAs` notification), whereas buttongroup is one
self-branching component:

- The cached required + live available widths live on a **per-question
  measurer** (`ResponsivenessMeasurer`, keyed by question identity) that
  survives the component swap, rather than on a single component instance.
  So a widen while collapsed still flips back from the cached required
  width with no fresh content event (buttongroup's cached-required pin).
- While collapsed, the buttons `ScrollView` is unmounted, so the required
  width is **not re-measured until the buttons view remounts** (buttongroup
  keeps a hidden measuring row and re-measures live). If the rate scale
  grows while collapsed, the carried required width is briefly stale; the
  next widen flips back to the buttons, which immediately re-measure the
  wider row and re-collapse — self-correcting in one extra flip, never a
  crash. (An `"auto"` rating that mounts already collapsed with no
  in-session buttons render — reachable only by an imperative
  `displayMode` toggle, not by serialization, which coerces a persisted
  `renderAs: "dropdown"` to `displayMode: "dropdown"` — has no carried
  required width and stays collapsed until re-narrowed through the buttons
  view.)

## Buttongroup question (task 2.9, overflow 2.5b)

### Overflow-to-dropdown measures via ScrollView content-vs-viewport, not a ResizeObserver

Web drives `Question.processResponsiveness(requiredWidth,
availableWidth)` from a `ResizeObserver` over the rendered row
(`responsivity-manager.ts` scrollWidth vs offsetWidth). RN has no
resize observer, so the renderer feeds the same core method from two
native callbacks: an **always-mounted wrapper View's `onLayout`**
supplies the live available width in BOTH modes, and the row
ScrollView's `onContentSizeChange` supplies the intrinsic required
width (row mode only — the value is **cached**, so widening while
compact still flips back even though the compact control renders no
ScrollView to re-emit a content event). CORE keeps the decision: the
±2 deadband, the `renderAs` flip to `'dropdown'` and back, and the lazy
retained `dropdownListModel` are all unmodified core behavior
(compat-pinned in `process-responsiveness-compat.test.ts`). Caller-side
gates match the web driver: widths are rounded to integers before the
call (web scrollWidth is integral; core rounds only availableWidth),
identical pairs are deduped, and **design mode never compacts** (web's
`needResponsiveness()` gate is also caller-side). Dispatch stays on the
single `buttongroup` template row in both modes — no RendererFactory
registration, the renderer self-branches on `question.renderAs`.

### Mount-already-compact briefly renders no collapsed control (but never a tappable/screen-readable row)

`renderAs` is a serialized core property, so a survey persisted while
compact REMOUNTS compact — but the collapsed control gates on the
lazily-built `dropdownListModel` VM, which render purity forbids
constructing during render or the mount commit. Until the first
measurement event (or, after a question swap under identical geometry, a
deferred post-commit microtask) materializes the VM, the compact control
is not yet rendered. The measure host that carries the button row is
still mounted for measurement, but its **hide/interaction/accessibility
props gate on compact MODE (`renderAs`), NOT on VM presence** — so from
the very first frame the row is off-screen (`opacity: 0`, absolute),
non-interactive (`pointerEvents: 'none'`), and a11y-hidden
(`accessibilityElementsHidden` / `importantForAccessibility:
'no-hide-descendants'`). The row can therefore never be tapped or
screen-read during the pending frame; the only divergence is a brief
frame with the collapsed control absent (an empty collapsed area) before
the VM lands. Web has no such window (the ResizeObserver decision lands
before paint). Deliberate render-purity consequence, not a bug.

The web `:focus-within` ring is a keyboard-web affordance with no RN
analog.

## Multipletext question (task 2.6)

### Flex rows instead of a `<table>`

Web renders `<table class="sd-multipletext">` with `<td>` title/editor
cells (`reactquestion_multipletext.tsx`). RN has no table primitive, so
each core row (`question.getRows()`) becomes a flex row and each cell an
equal-flex column — title above its input rather than beside it. Column
count, row splitting, and error-row visibility (`itemErrorLocation`)
all stay core-driven; only the visual arrangement inside a cell differs.

### Item editors are real `QuestionTextModel`s — text-question differences apply

Each item's `editor` renders through the same `TextQuestion` used for
standalone text questions, so every task-1.9/1.10 difference
(draft/commit `textUpdateMode`, inputType keyboard mapping, mask
behavior) applies unchanged inside multipletext cells.

## Confirmation dialogs / `settings.showDialog` (task 2.2)

### The adapter owns `settings.showDialog` while a Survey is mounted

Core's default `confirmActionAsync` routes delete confirmations
(paneldynamic, matrixdynamic, file) through `settings.showDialog`
(confirm-dialog.ts) — in RN the renderer installs a dispatcher there on
the first `<Survey>` mount and presents dialogs through the
last-mounted Survey's overlay (web renders into `rootElement`). A
consumer `settings.showDialog` set BEFORE the first mount is displaced
while Surveys are mounted and restored on the last unmount
(`dialog-adapter-displaced-show-dialog` diagnostic); opt out entirely
with `setDialogAdapterEnabled(false)` (pre-mount only). Consumer
`confirmActionFunc` / `confirmActionAsync` hooks keep their upstream
precedence untouched.

### `showDialog` returns a compatibility handle, not a `PopupBaseViewModel`

Only `footerToolbar` (the real footer ActionContainer — post-hoc
title/innerCss mutations re-render), `width` (stored-only, no visual
effect in v1), and `popupModel` (`null` when no Survey is mounted) are
provided. Coordinate positioning options (`verticalPosition`,
`horizontalPosition`, `showPointer`, `setWidthByTarget`,
`positionMode`, `canShrink`), DOM callbacks (`getTargetCallback`,
`getAreaCallback`, `onBlur`), and `rootElement`/`cssClass` containment
are ignored. Consumer `onShow` fires on a microtask AFTER presentation
(web fires it during the show transition). With NO Survey mounted, a
dialog call resolves its `onCancel` immediately (fail-safe — never
auto-confirm a destructive action) and reports `dialog-no-host`.

## Dropdown question (task 2.3)

### The control never hosts an inline filter input

Web's dropdown control embeds a text input (`inputMode='none'` on
touch) with hint prefix/suffix autocomplete affordances
(dropdown-base.tsx). The RN control is a button showing the selected
item's text (or `inputStringRendered`, or the placeholder); typing
happens in the overlay's search box (core's own touch behavior —
`setSearchEnabled` on open). Hint strings are dropped.

### Popup is the 2.1 overlay sheet, never an anchored list

No coordinate anchoring (won't-support): the choice list presents as
the overlay sheet with search/lazy-load/nested-group behavior from the
shared ListPicker.

### Lazy-load paging is serialized

Core fires `onChoicesLazyLoad` with no in-flight guard (concurrent
skips on rapid scrolling). The RN picker gates its end-reached trigger
on the owning question's `isReady`, so exactly one page loads at a
time.

### The interactive control materializes one microtask after mount

The control materializes its core `DropdownListModel` one microtask
AFTER the mount commit (render purity — the same discipline as
rating-dropdown/buttongroup: construction fires core property
notifications on the question, which must land in neither render nor
the mount-commit window). For that single tick the control renders a
**non-interactive** VM-free frame showing the question-level value fold
(`readOnlyText` when read-only → `selectedItemLocText` → the raw value
→ the placeholder) — real text, but no press/a11y/clear affordance
until the next tick. Web constructs the model during render and has no
such window.

## Tagbox question (task 2.4)

The `tagbox` (multi-select) question reuses the dropdown's overlay
machinery, so every Dropdown-question difference above applies (overlay
sheet not an anchored list; search lives in the overlay; combobox a11y;
no inline filter input). The tagbox-specific differences:

### Selected values render as chips, not inline tokens

Web's tagbox renders selected values as inline tokens inside the input
box with autocomplete typing. The RN control shows each selected value
as a **chip** (a pill with the value text + a ✕ remove affordance),
wrapping onto multiple lines. There is no inline typing in the control —
adding values happens by opening the overlay sheet and tapping choices
(core's touch behavior). A chip's ✕ removes just that value; the
clear-all ✕ (when `allowClear`) empties the whole selection.

### The overlay stays open across selections

Selecting a choice **adds** it to the array and **keeps the sheet open**
(core toggles membership through `listModel.onItemClick` without hiding
the popup per-select — the same shared 2.1 ListPicker, unchanged). Re-
tapping a selected row removes it. Web keeps its dropdown open the same
way; the difference is only that the RN list is the overlay sheet.

### `renderAs: "select"` degrades to a non-interactive value display

On web, `renderAs: "select"` renders a native `<select>` element. Core
builds the overlay/touch view model (`dropdownListModel`) only for the
default popup rendering, so a `"select"` dropdown has **no**
`dropdownListModel` and there is no sheet to open. Rather than crash on
the missing model (`getTemplate()` still routes the question to this
component), the RN control degrades to a **non-interactive** display of
the selected value (or placeholder) and emits a one-shot
`dropdown-select-mode-unsupported` diagnostic. There is no native
`<select>` analog in React Native; use the default dropdown rendering
for an interactive picker.

The one-microtask deferred materialization above applies to the tagbox
too, with two tagbox-specific notes. First, the pre-materialization
frame renders the chips and the placeholder VM-free (both are
question-level members), so a committed value never blinks — only the
opener's press/a11y and the clear affordance wait for the next tick.
Second, unlike dropdown's, core's tagbox `dropdownListModel` getter has
**no** `renderAs` gate (it would construct even in `"select"` mode), so
on RN it is this renderer discipline that keeps a select-mode mount
construction-free: a tagbox mounted with `renderAs: "select"` never
builds a `DropdownListModel` at all, and the select fallback's
placeholder stays live through the loc-string viewer's own
subscription instead of a VM state element.

### The "Other (describe)" comment renders inside the control

Selecting the "Other" choice sets the question's
`isShowingChoiceComment`, which the shared `QuestionChrome` does **not**
render for dropdown (`showCommentArea` stays false — that is a separate
question-level feature). The RN dropdown therefore hosts its own comment
`TextInput` directly below the control, backed by the same
`OtherCommentDraftAdapter` used by checkbox/radiogroup — so
`textUpdateMode`/`storeOthersAsComment` behavior matches those types
(see the checkbox/radiogroup section). Web renders the same comment as a
sibling input; the value-level outcome is identical.

### a11y mirrors core's INPUT aria surface

The control carries core's **input** aria role
(`vm.ariaInputRole ?? vm.ariaQuestionRole` — `combobox` under the
default `searchEnabled`, not a hardcoded `button`), the question label,
core's localized clear caption (`vm.clearCaption`, not a bare `✕`
glyph), and a live `expanded` state driven by `vm.ariaExpanded` (which
core re-emits on open/close). Web reads the same input aria surface on
its inner input element. (Note for maintainers: `ariaExpanded` is a
string `'true'`/`'false'`, so it is compared to `'true'`, not to a
boolean.)

### Custom item component: an unregistered name falls back to value text

`showInputFieldComponent` names a custom item component
(`inputFieldComponentName`) for the selected value. If that name is not
registered in `RNElementFactory`, the control does **not** show an empty
placeholder (core suppresses `showSelectedItemLocText` when a component
name exists, and its DOM-cleaning fallback leaves `inputStringRendered`
empty on RN); instead it renders the selected item's localized text and
emits a `dropdown-input-component-missing` diagnostic. Register the
custom component before rendering for the intended custom UI.

## Dynamic panels — carousel & tab modes (task 2.8b/2.8c)

### Tab overflow is a horizontal scroll, not an overflow-to-popup

Web's paneldynamic `displayMode: "tab"` adaptively measures which tabs fit and
overflows the rest into a popup action container. This renderer has no DOM
measurement loop, so the tab strip is a horizontal `ScrollView`: overflowing tabs
scroll into view instead of collapsing into a popup. Carousel mode shows a single
panel with prev/next controls + a text progress indicator ("N of M"); `tab` mode
shows a scrollable tab strip + the current panel. In both modes survey-core gates
the Add button to the LAST panel (matching web).

## Dynamic panels (`paneldynamic`, task 2.8a)

### `displayMode`: list, carousel, and tab are all supported

The list renderer stacks all visible panels with an add-panel button and a
per-panel remove button (delete confirmation routes through the 2.2 dialog
adapter). `displayMode: "carousel"` (a single panel with prev/next controls
plus the text progress indicator) and `displayMode: "tab"` (a scrollable tab
strip plus the current panel) also render — see the carousel & tab section
above. Only an unrecognized `displayMode` falls back to the non-throwing
unsupported view with a `paneldynamic-mode-unsupported` diagnostic rather than
a broken frame (invariant 9).

### Collapsible panels get an explicit toggle

When `panelsState` is `collapsed`/`firstExpanded`/`expanded`, each panel is
collapsible; the RN renderer adds a per-panel expand/collapse toggle (web
collapses via a clickable panel title). `panelsState: "default"` panels are
always expanded and get no toggle.

## Custom & composite questions (ComponentCollection, task 2.11)

### After-render callbacks are not fired

`ComponentCollection`'s `onAfterRender` / `onAfterRenderContentElement`
callbacks receive a DOM `HTMLElement` on web. This renderer has no DOM and
does not fire them (the repo-wide no-`afterRender` posture — see the custom
widgets note). Custom/composite otherwise render fully: a `custom` question
renders its inner `contentQuestion`'s input (the outer question owns the
title/description/errors chrome); a `composite` renders its `contentPanel`
(each inner question renders its own title). Value shapes match core: a
`custom` value is the inner scalar; a `composite` value is an object keyed by
inner element names. A malformed custom (a `createQuestion` callback returning
null) renders nothing renderable rather than crashing, with a
`custom-content-missing` diagnostic.

## Overlay dismissal semantics (2.1 overlay host)

### Sheet dismissal commits; only the footer Cancel button reverts

The 2.1 overlay presents core popups as a sheet (non-modal) or dialog
(modal). Web ground truth for dismissal (survey-core 2.5.33):
clicking outside a popup runs `PopupBaseViewModel.clickOutside()`, which
plain-hides with **no** `onCancel` (`popup-view-model.ts:286-289`; modal
popups no-op it entirely — `popup-modal-view-model.ts:60-62`), and
Escape plain-hides non-modal popups (`popup-view-model.ts:213-218`)
while the modal view-model overrides it to cancel
(`popup-modal-view-model.ts:63-68`). The revert path is exclusively the
footer **Cancel** button (`PopupBaseViewModel.cancel()` →
`model.onCancel()` — `popup-view-model.ts:293-296`); the tagbox's
touch-mode `previousValue` rollback hangs off exactly that `onCancel`
(`dropdownMultiSelectListModel.ts:85-110`), and its footer **Done**
button plain-hides, i.e. commits.

The RN mapping matches: a sheet's backdrop tap, Android hardware back,
and iOS accessibility-escape all run the **hide** sequence — the sheet
closes and any values already committed to the model (e.g. tagbox
selections, which commit per toggle) are **kept**. A dialog ignores the
backdrop, and back/escape on a dialog run the **cancel** sequence, like
web's modal Escape. The tagbox sheet's footer renders core's own
Cancel (revert to the value at open) and Done (commit and close)
actions, so both explicit affordances exist on RN.

### Header close button (`showCloseButton`) cancels — a deliberate deviation

Web's popup header ✕ plain-hides (`clickClose` —
`popup-view-model.ts:281-284`). RN keeps the ✕ on the **cancel**
sequence: an explicit close affordance on a dialog reads as "discard",
and dialog-adapter resolution semantics (task 2.2) already treat
hide-before-resolution as cancel, so the observable dialog outcome is
identical; core popups never set `showCloseButton` on the dropdown/
tagbox sheets, so the sheet revert path cannot re-enter through it. If
a consumer popup sets `showCloseButton` on a non-modal popup and needs
web's hide-only ✕, that is the one observable divergence.

## Matrix (simple) question (task 3.2)

### No `<table>` — a flex-`View` grid inside a horizontal `ScrollView`

The single-select / multi-select matrix renders through the M3 3.1a
`MatrixGrid` primitive: a flex-`View` grid, not an HTML `<table>`. Column
widths are resolved once (against the measured outer width) and shared
across the header and every body row so columns stay aligned without
browser table auto-layout. The row-title column lives **inside** the one
horizontal `ScrollView` as each row's first cell, so on a wide matrix it
scrolls together with the data columns — there is no CSS `position:sticky`
pinned first column (a split-pane pinned column is a deferred, optional
3.1b enhancement). The grid is always wrapped in a horizontal ScrollView
(inert when the content fits); core's `horizontalScroll` flag is not
consulted — an always-present scroll affordance can only ever *add* the
ability to scroll, never clip.

### Cells are radio/checkbox tiles driven by the row model — no nested questions

Each cell is a radio (default) or checkbox (`cellType: "checkbox"`) **tile**
whose checked state comes straight from `row.isChecked(column)` and whose
tap calls `row.cellClick(column)` — the same `MatrixRowModel` seam the web
renderer uses. There is no `renderedTable` and there are no nested cell
`Question` instances (those are the matrixdropdown/matrixdynamic family,
tasks 3.3/3.4). Single-select commits the `{ row: column }` value shape;
multi-select toggles a `{ row: [column, …] }` array, and an `isExclusive`
column clears the other selections in its row. `hasCellText` (rubric) cells
render tappable localized text instead of a radio/checkbox decorator.

### Mobile card flip is survey-`isMobile`-driven (600px), not self-measured

Web stacks a narrow matrix into per-row cards (its `isMobile` /
`displayMode: "list"` path). This library ships that stacked-card path
(3.1b): when the survey flag `isMobile` is true (`<Survey>`'s 600px
`NARROW_BREAKPOINT` layout flip, or `displayMode: "list"`), each row renders
as a **card** — the row text is the card title and each column becomes a
`{columnLabel, tile}` pair (the label is `column.locText`); a wide screen
keeps the horizontal-scroll grid. Unlike web the matrix does **not**
self-measure its own intrinsic width to auto-stack on a wide screen — it is
a survey-flag flip only (a wide matrix on a wide screen scrolls
horizontally; see the matrixdropdown card entry below). `alternateRows` and
`verticalAlign` are still not carried — the grid applies uniform cell
geometry. `rowOrder: "random"` is honored by rendering core's
already-shuffled `visibleRows` order as-is (RN never reshuffles).

### Row-level validation surfaces on the row, not per cell

Whole-question `eachRowRequired` (`RequiredInAllRowsError`) and
`eachRowUnique` (`EachRowUniqueError`) render through the normal
`QuestionChrome` error slot, exactly like any other question's errors
(matrix dispatches as an ordinary chrome-wrapped question). In addition,
the per-row `row.hasError` flag tints that row's tiles (the shared item
recipe's error decorator) and marks the row header inline, so a respondent
sees *which* rows are missing an answer. Tile tinting follows core's
`getItemClass` gate exactly: with `eachRowRequired`/`eachRowUnique` set the
tint is per-row (`row.hasError`); with neither set, a question-level
visible error (e.g. an unanswered `isRequired` matrix at validation) tints
**all** tiles via the question's `hasCssError()` — web parity, no
divergence.

### The check glyph is fixed — consumer `itemSvgIconId` overrides are not honored

The checkbox checkmark (and the preview check glyph) always render core's
default `icon-check-16x16`. Web reads `question.itemSvgIcon`, which honors
a consumer-customized `cssClasses.itemSvgIconId`/`itemPreviewSvgIconId`;
the RN tile cannot read that getter in render because it dereferences
`question.cssClasses`, which is built lazily on first access and fires a
`cssRoot` property change — a setState-in-render hazard. Customizing the
matrix check glyph via css classes is therefore not supported in v0.3
(render-purity trade-off).

### Rubric cell lookup stringifies the row key (numeric rows resolve correctly)

`hasCellText` (rubric) cells look up their text with the row key passed as
`String(row.name)`. Web passes the raw `row.name`, and a **numeric** row
value is then misread as a row *index* by `MatrixCells.
getCellRowColumnValue` (`question_matrix.ts`) — web resolves the wrong
row's rubric text (or none) for `rows: [1, 2, …]`. The cells JSON is
string-keyed, so RN's stringified key resolves the intended cell text for
every row value — a deliberate, favorable divergence.

### Grid a11y has no native grid/rowheader/columnheader roles

React Native exposes no ARIA grid semantics. Each tile is an
`accessibilityRole` of `radio` (single-select) or `checkbox`
(multi-select) with a `{ checked, disabled }` state and an
`accessibilityLabel` synthesized from core's `getCellAriaLabel(row,
column)` (the localized row title + column title). There is no
`role="grid"`/`columnheader`/`rowheader` wrapper and no header/cell
association beyond that per-tile label.

## Matrix dropdown question (task 3.3a)

### Cell questions render chrome-less — the column header is the cell title

Each `matrixdropdown` cell holds a genuine `Question` instance built by
core (`column.createCellQuestion(row)`), and RN dispatches it through the
**same registered per-type renderer** a top-level question uses — a
dropdown cell opens the 2.1 overlay sheet, a text cell drafts/commits
through the 1.9 adapter, boolean/comment/expression cells render their
normal components. What is deliberately **not** rendered is the per-cell
`QuestionChrome`: no per-cell title/description/comment chrome (the column
header carries the title, matching web's `renderQuestionBody`). Cell
errors are rendered by the reusable, reactive `QuestionErrors` unit
(extracted from `QuestionChrome`, 3.3a-pre) **inline under the cell body**
— under each non-choice question cell, and exactly once per
`showInMultipleColumns` exploded choice group at its `isFirstChoice` cell
(where core attaches the shared question's error). The walker skips core's
rendered error affordances (`isErrorsRow` rows / `isErrorsCell` cells)
entirely, so errors appear exactly once — neither doubled nor dropped. The
separate top/bottom `cellErrorLocation` error row collapses to inline in
v0.3.

### No `<table>` — the renderedTable walks into the shared flex-View grid

The walker consumes `renderedTable.headerRow` / `renderedRows` /
`footerRow` faithfully and lays them out through the same 3.1a
`MatrixGrid` primitive as the simple matrix (one horizontal `ScrollView`,
one shared column-dp array stamped on header/body/footer — see the 3.2
section's grid notes, which all apply). Rendered rows are keyed off the
stable source `row.id` and cell leaves off the immutable
`cell.question.uniqueId`, so a `renderedTable` reset (column/`isRequired`/
layout changes destroy and lazily rebuild the rendered wrapper) reconciles
surviving cell questions **in place** — an uncommitted text draft and cell
focus survive the reset instead of being discarded with a remount.

### `showInMultipleColumns` renders one choice item per cell

A checkbox/radiogroup column with `showInMultipleColumns` is exploded by
core into per-choice cells sharing ONE question; RN renders a single
radio/checkbox item per cell (never the whole control N times) driven by
the shared question's `isItemSelected`/`clickItemHandler` (checkbox uses
the explicit two-arg toggle form; radiogroup the single-arg select form).
The item caption is hidden (the exploded column header carries the choice
text) and each cell's `accessibilityLabel` is synthesized from core's
`getCellAriaLabel` (row title + column title). An `isActionsCell` (which
also carries an `item`) resolves before any choice path, and an
`isOtherChoice` cell renders the controlled Other-comment adapter, not an
item button. `columnColCount` is not applied to exploded cells (core
applies `colCount` only to an un-exploded child question's own layout).

### Transposed layout renders as a plain vertical grid + diagnostic

With `transposeData: true` (or `columnLayout: "vertical"`) on a wide
screen, `isColumnLayoutHorizontal` is genuinely false and core builds a
vertical renderedTable (columns become rows). RN walks those renderedRows
faithfully as a plain, non-sticky grid — no axis-swapping of its own — and
emits a deduped `matrix-vertical-layout` layout diagnostic noting possible
polish gaps. The totals footer is absent in this layout (core's
`showFooter` gate), matching web.

### Totals render as read-only expression cells in a column-aligned footer

`totalType` columns render core's footer `expression` questions through
the normal expression renderer, aligned to the shared column-dp array
(the footer is a column-aligned band, not a full-width strip);
`totalText` renders in the footer's row-title slot. The footer band is
gated on `renderedTable.showFooter`. On mobile (`isMobile`, where
`showFooter` is **true** because `isColumnLayoutHorizontal` forces
horizontal) the totals render instead as a **totals summary card** appended
after the data cards — the footer text is the card title and each
`totalType` column is a `{columnLabel, total}` pair — matching web, which
also emits `<tfoot>` on phones. Totals are absent only in the wide
transposed layout (`transposeData: true` on a wide screen, where
`showFooter` is genuinely false).

### Mobile stacked-card layout (task 3.1b)

On mobile (`isMobile` — `<Survey>`'s 600px layout flip, or
`displayMode: "list"`) the renderedTable-backed matrix family
(`matrixdropdown`/`matrixdynamic`) stacks into **cards** instead of the
wide horizontal-scroll grid, matching web's mobile table. Engagement is the
survey `isMobile` flag flip only (core rebuilds `renderedTable` for mobile
on `onMobileChanged`, so `isColumnLayoutHorizontal` becomes true and the
mobile cell shape is used) — the matrix does **not** self-measure its own
intrinsic width, so a wide matrix on a wide screen scrolls horizontally
rather than auto-stacking (web additionally uses a ResizeObserver). Each
renderedRow becomes one card: the row text is the card title, every data
cell is a `{columnLabel, cellContent}` pair (the label is the cell's
responsive column title, `cell.column.locTitle`), and the co-located mobile
actions (`remove-row` + `show-detail-mobile`, which core groups into one
end-actions container on mobile) render at the card foot. The **exact same**
chrome-less cell dispatch, `QuestionErrors`, choice-item and Other-comment
renderers the wide grid uses are reused verbatim — only the layout differs,
so cell reactivity, draft/commit, and OverlayContext for nested cell
dropdowns are unchanged. An expanded detail panel renders as a full-width
block below its card (the SurveyPanel owns its own layout), and the totals
footer becomes a totals summary card (see the totals entry above). A runtime
mobile flip re-renders grid ↔ cards through the same renderedTable-reset
retarget the family already uses. Core **disables** `showInMultipleColumns`
explosion on mobile (`IsMultiplyColumn = isShowInMultipleColumns &&
!isMobile`, question_matrixdropdownbase.ts:1696), so such a column renders
as ONE whole-question card pair — the column label above the entire
checkbox/radiogroup with its choice captions **shown** (a normal question
cell), never per-choice exploded cells. A required column's card label
carries the same required marker the wide header band renders
(`cell.requiredMark`, set only when `column.isRenderedRequired`), matching
web's mobile `SurveyQuestionMatrixHeaderRequired`; a cell hidden per row by
its column `visibleIf` is omitted **whole** (no orphan label/slot),
reactively both directions, as web omits the cell. The dp column-width
allocation and the horizontal ScrollView are skipped entirely in card mode
(cards take the natural available width, no measurement defer).

### Detail panels render FULL-WIDTH — core's leading/trailing detail-row slots are dropped (task 3.3b)

`detailPanelMode: "underRow" | "underRowSingle"` is supported. The
detail-toggle actions cell renders a real button: press calls the row
model's `showHideDetailPanelClick()` (both the wide `show-detail` action
and the mobile `show-detail-mobile` id route to the same core toggle), the
icon flips between core's own `getDetailPanelIconId` glyphs
(`expanddetails-16x16`/`collapsedetails-16x16`), and the button exposes
`accessibilityRole: "button"` with an `{ expanded }` a11y state and core's
localized Show/Hide Details label. One presentation divergence: web's
mobile `show-detail-mobile` is a **titled text button** (`showTitle: true`
— the localized Show/Hide Details string is the visible button label);
RN renders the same icon-only button on every width and carries that
string as the `accessibilityLabel` instead. Web's `aria-controls`
panel-id wiring has no RN analog and is not carried.

An expanded row's detail rendered row is emitted as a **full-width band**
spanning the whole grid content width — an approved divergence from web,
which keeps a leading row-header slot (`colSpans: 2` with row text) and an
optional trailing actions slot around the panel cell (`createDetailPanelRow`).
The leading slot is empty chrome on every width (`buttonCell.isEmpty`);
the trailing actions slot is empty in web's wide mode but **populated** in
web's mobile mode, where `show-detail-mobile` co-locates with `remove-row`
in the shared end-actions container. The RN band drops both flanking slots
— pure chrome removal in the wide layout, but on mobile this also omits
that populated trailing actions slot from the detail row (the same actions
stay reachable from the data row's own actions cell, subject to the 3.4
per-action-rendering item below) — and renders the row's real
`row.detailPanel` `PanelModel` edge-to-edge through the same
SurveyPanel/SurveyRow composition paneldynamic uses, so nested questions
dispatch through the factory **with full question chrome** (title/
description/errors) — the matrix's chrome-less rule applies to grid cells,
not to detail-panel content. Expanding, collapsing, and `underRowSingle`'s
expand-one-collapses-others rule are all core-enforced state the renderer
follows; collapse keeps the panel instance, so values entered in a detail
panel persist across collapse/expand (they live in the row value, e.g.
`{ r1: { d1: … } }`).

### Row actions are plain themed buttons; custom row actions remain no-ops

Actions cells render PER ACTION (the 3.4 obligation, now met): the walk
iterates the cell's `ActionContainer` and renders every supported action
side by side — `remove-row` as the matrixdynamic remove button,
`show-detail`/`show-detail-mobile` as the detail toggle — so web's mobile
co-location of `show-detail-mobile` + `remove-row` in one shared end cell
renders both. They are plain themed `Pressable`s, never an
`AdaptiveActionContainer`: custom row actions (`onGetMatrixRowActions`)
and action overflow-to-popup remain v1 unsupported — an unknown
`action.id` renders nothing (no crash), and an actions cell with no
supported actions renders as an inert, aligned placeholder. An
unsupported `cellType` (e.g. `file` before M5) degrades to the
non-throwing fallback panel **in that one cell** with a structured
diagnostic — the rest of the matrix keeps working.

## Matrix dynamic question (task 3.4)

### Add/remove affordances are plain themed buttons driven by core's renderedTable gates

The add-row button(s) render exactly where core says
(`renderedTable.showAddRowOnTop`/`showAddRowOnBottom` — computed from
`addRowLocation`; the RN renderer never recomputes placement), captioned
with `addRowText`, and call core's **`addRowUI()`** wrapper (guards
inside core; the button is absent — not disabled — at `maxRowCount` /
`allowAddRows: false`, mirroring web's `canAddRow` gate). Per-row removal
renders as a delete-glyph button inside the shared actions cell (see the
per-action item above), a11y-labeled with `removeRowText`, calling
**`removeRowUI(row)`** — presence is core-gated by `canRemoveRows &&
canRemoveRow(row)` (honoring `minRowCount`, `lockedRowCount`, and the
`onMatrixRenderRemoveButton` event), so remove buttons disappear entirely
at `minRowCount` and the whole actions column appears/disappears with
row removability (a full renderedTable rebuild core drives).

### `confirmDelete` presents through the RN dialog adapter

The delete confirmation is core's own flow: `removeRowUI` →
`confirmActionAsync` → `settings.showDialog` → the task-2.2 dialog
adapter → the overlay host — identical to paneldynamic's
`confirmDelete`. The RN renderer never builds the dialog; Apply removes
the row, Cancel keeps it, and with no overlay host mounted the adapter's
fail-safe CANCELS (the row is kept, never silently deleted). Web instead
shows its DOM popup.

### The empty-state placeholder is full-width; its add button gates on `showAddRow`

With `hideColumnsIfEmpty: true` and no rows, the grid is replaced by the
full-width `noRowsText` placeholder (matching web's
`sv-placeholder-matrixdynamic`), whose add button gates on the
STANDALONE `renderedTable.showAddRow` — NOT the in-table
`showAddRowOnTop`/`showAddRowOnBottom` (both false while the table is
hidden). The first row is added from the placeholder itself.

### Row drag reorder is deferred to task 4.3

`allowRowReorder` produces core's drag-handle cells, which render inert
(an empty aligned slot, no gesture wiring) until the M4 drag primitive
lands (4.1/4.3). Web's `DragDropMatrixRows` DOM machinery is bypassed
entirely (the repo-wide no-DOM posture).

## Single-input summary (`singleinputsummary`, task 3.5)

### The type is registered and rendered; the `inputPerPage` mode that produces it is a v0.3 non-goal

`singleinputsummary` is registered and rendered — but as an **element**,
not a question type. It is NOT a survey-core serializer question class:
`Serializer.findClass('singleinputsummary')` is `undefined` and it never
appears in `Serializer.getChildrenClasses('question', true)`. It is the
plain helper `QuestionSingleInputSummary` (`question`, `noEntry`,
`items[]`, `isEmpty()`), which survey-react-ui dispatches through its
element factory under the key **`sv-singleinput-summary`** (the renderer
receives a `summary` prop, not a question). This library registers the
same key on the RN element factory with a minimal, correct renderer:
empty summaries render the `noEntry` string, non-empty summaries render
each item's `locText` read-only.

The item-level **edit / remove** affordances (`btnEdit` / `btnRemove`,
which web draws as icon buttons) are deliberately omitted: they are the
single-input **navigation** surface (edit → focus that input; remove →
drop the entry), which belongs to the deferred mode below.

The summary's ONLY producer is the matrix/panel single-input rendering
mode — the survey-level **`questionsOnPageMode: "inputPerPage"`** driving
`question.singleInputQuestion` / `QuestionSingleInputBehavior.createSingleInputSummary`
— and that mode is a **documented v0.3 NON-GOAL for the matrix family**
(design M3 §11.5, resolution 5). In v0.3 a matrix always renders its full
grid/cards; the one-input-at-a-time flow that would surface this summary
is not wired. The type therefore ships as a clean-dispatching element
(never the unsupported fallback) even though it is unreachable through
normal v0.3 authoring. Because it is an element key (not a serializer
class name), it lives in the descriptor table's element route and the
`ELEMENT_KEY_INVENTORY`, not in `MODEL_TYPE_CLASSIFICATION` (a class-name
entry there would trip the model-type inventory gate against the live
survey-core build).

## Ranking question (task 4.1)

The `ranking` question is supported. Reorder is driven **entirely through
the core model** — `question.dragDropRankingChoices.reorderRankedItem(q, i, j)`
followed by `q.setValue()` in default mode, and
`question.handleKeydownSelectToRank(evt, item, key, /* isNeedFocus */ false)`
in `selectToRankEnabled` mode. The RN renderer never reimplements the
ordering array, so `value`, `onValueChanged`, `min/maxSelectedChoices`
gating, and validation stay 100% core-correct.

### Drag is a native gesture (gesture-handler + reanimated), not HTML5 drag-and-drop

Web's `DragDropRankingChoices` uses pointer events + a cloned DOM
shortcut and mutates the model **continuously** on every `dragOver`
(`afterDragOver` → `reorderRankedItem` per hovered slot). RN instead
wraps each row in a **react-native-gesture-handler `Gesture.Pan()`** with
a **reanimated** `translateY` shared value, both **lazy-required** inside
an isolated hooks child (`RankingDragRow`, the ChoiceItemRow precedent —
invariant 7). The drag animates on the UI thread and **commits ONCE on
release** via the same `reorderRankedItem` + `setValue` primitive; it does
**not** reproduce web's per-`dragOver` model splices (continuous model
mutation fights the shared-value animation and churns re-renders). The
drop-placeholder / dragging **"ghost"** is web's **model-driven** state
(core sets `currentDropTarget` → `itemGhostMod`) which the commit-once RN
drag never produces, so it has **no ported analog** — the recipe carries no
ghost fragment and the placeholder styling is **deferred** to the Layer-2
device-gate work (when/if a continuous drop-target model is adopted).

The fine drag Pan wrapper engages **only in default single-list ranking**.
In `selectToRank` mode it is **disabled** (button reorder is the affordance
there): mapping a Pan target to the correct slot spans two areas and
multiple slots, and a single `ArrowUp`/`ArrowDown` per drag would collapse a
multi-slot move to one step — the two-area drop-index math is unverified
on-device, so v1 gates it off rather than ship a wrong reorder.

`react-native-gesture-handler` and `react-native-reanimated` are
**required peerDependencies** (batteries-included, A10). The consumer app
must mount a `GestureHandlerRootView` at its root and add the
reanimated/worklets Babel plugin (last plugin) — the standard setup for
either library. When the peers are absent, `RankingDragRow` degrades to
the accessible move controls below (no crash).

### Accessible move controls replace fine drag as the primary affordance

Every ranked row renders explicit **move-up / move-down** buttons (and,
in `selectToRank` mode, **add / remove** buttons) that drive the same
core reorder API. This is the a11y-first path: ranking is fully operable
without the fine drag gesture (which needs a UI thread and is verified on
the New-Arch example via maestro, not in jest). The buttons disable at
the list boundaries and whenever the question is read-only or the item is
disabled (gated through `getItemEnabled` /
`checkMaxSelectedChoicesUnreached`, never a hand-rolled length check). The
web keyboard handler's post-move `setTimeout(focusItem, 1)` is **not**
scheduled — the renderer calls the direct `reorderRankedItem` primitive
(and passes `isNeedFocus: false` on the selectToRank path), so no timer is
left querying the null RN `domNode`; screen-reader focus management is the
platform's own.

### `selectToRank` stacks its two areas vertically (RN chooses the layout)

In `selectToRankEnabled` mode the renderer draws two areas (unranked ↔
ranked). It does **not** read `renderedSelectToRankAreasLayout`
(`horizontal`/`vertical`): the facade never sets survey-core's `IsMobile`,
so that getter would always report the desktop `horizontal` value. RN
screens are narrow, so the renderer stacks the areas **vertically**
itself regardless of the property. `selectToRankSwapAreas` is likewise
not honored (it only reorders the horizontal columns).

### Rank-number focus outline and move keyframe animations are not ported

The web rank-number `:focus` outline ring and the
`svdragdropmoveup`/`svdragdropmovedown` slide keyframes are web-only
affordances with no ported analog; reorder is applied without the slide
animation (the release-time reanimated translate is the only motion).
DIFFERENCES for the item's `readOnly`/`preview`/`error` badge backgrounds
and the disabled-label opacity are carried through the ranking recipe
from the model's `getItemClass` string (bridge extraction, invariant 6).
