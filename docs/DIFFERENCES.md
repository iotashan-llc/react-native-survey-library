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

**Residual gap:** an ALLOWED `choicesByUrl` fetch is performed by
survey-core itself, so the policy's manual-redirect rule cannot be
enforced on that one sink from outside; the empirical abort gate lands
with the dropdown task (2.3). Scheme/origin policy IS enforced.

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

### Read-only text never renders as plain text (`isReadOnlyRenderDiv` not ported)

Web can optionally render a read-only text/comment question as a plain
`<div>` instead of a disabled `<textarea>`/`<input>`
(`settings.readOnly.textRenderMode === "div"`). This library always
renders the same `TextInput`/item controls with `editable={false}`,
styled via the read-only recipe fragment, regardless of that setting.

### Choice items render without a dedicated icon primitive (v1)

The checked-state checkmark (checkbox) and filled dot (radiogroup) are
drawn as plain native glyphs (a `✓` `Text` / a small filled `View`)
sized and colored from the item recipe's `iconSize`/`iconFills` tokens,
rather than through a shared icon primitive — task 1.5's `RNIcon`
had not landed when this task shipped. Swapping in a real icon
component later is a presentation-only change; no model or state
contract depends on the glyph shape.

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


## Buttongroup question (task 2.9)

### No overflow-to-dropdown until task 2.5

Web swaps the button row for a dropdown when the container is too
narrow (`buttongroup-dropdown.tsx`, width shrink observer). v0.2 renders a horizontal-scroll row (web parity: overflow-x auto + nowrap); the adaptive dropdown arrives with the 2.5 overlay work. The web `:focus-within` ring is a keyboard-web
affordance with no RN analog.

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

## Dynamic panels (`paneldynamic`, task 2.8a)

### v0.2 supports `displayMode: "list"` only

The list renderer stacks all visible panels with an add-panel button and a
per-panel remove button (delete confirmation routes through the 2.2 dialog
adapter). `displayMode` `"carousel"`/`"tab"` and the progress bar are deferred
to 2.8b/2.8c; a non-list survey renders an unsupported fallback and reports the
`paneldynamic-mode-unsupported` diagnostic rather than a broken frame
(invariant 9).

### Collapsible panels get an explicit toggle

When `panelsState` is `collapsed`/`firstExpanded`/`expanded`, each panel is
collapsible; the RN renderer adds a per-panel expand/collapse toggle (web
collapses via a clickable panel title). `panelsState: "default"` panels are
always expanded and get no toggle.
