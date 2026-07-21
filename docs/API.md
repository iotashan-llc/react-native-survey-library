# API Reference

Public API of `@iotashan-llc/react-native-survey-library` — everything a
**consumer** imports to render a survey. This is the contract for the single
public entry point (`@iotashan-llc/react-native-survey-library`); internal
architecture lives in [`docs/design/`](design/) and is not part of the
supported surface.

The guiding idea: pass your existing SurveyModel JSON and Theme JSON
**unmodified** and get a native survey. Everything below is additive to the
survey-core API you already know — this package re-exports the full
`survey-core` surface (see [survey-core surface](#survey-core-surface)) and
adds the React Native rendering layer.

- **Support matrix** (question types, peer dependencies): see [README](../README.md).
- **Behavioral divergences** from the official web renderer (`survey-react-ui`):
  see [docs/DIFFERENCES.md](DIFFERENCES.md).

---

## Installation

```sh
npm install @iotashan-llc/react-native-survey-library survey-core
```

`survey-core` and a set of capability libraries (SVG, gesture-handler,
reanimated, slider, signature-canvas, webview, expo pickers, expo-video, HTML
renderer) are
**required peer dependencies** — batteries-included, each lazy-loaded only when
a question needs it. Install them once; a missing peer degrades only the
question that needs it (non-throwing fallback + diagnostic), never the whole
survey. The full peer list and what each backs is in the
[README installation table](../README.md#installation).

---

## `<Survey>`

The one component you render. It owns the SurveyModel lifecycle, applies the
theme, installs the security policy, wires your event handlers, and renders the
full survey shell (header, progress, pages, navigation, completion states).

```tsx
import { Survey } from '@iotashan-llc/react-native-survey-library';
import { DefaultLight } from 'survey-core/themes';

<Survey
  json={surveyJson}
  theme={DefaultLight}
  onComplete={(sender) => console.log(sender.data)}
/>;
```

`Survey` is a `forwardRef` component — see [Imperative handle](#imperative-handle-surveyrefhandle).

### Props

`SurveyProps` = `SurveyOwnProps` **&** [`SurveyModelEventProps`](#event-props).
The own props:

| Prop | Type | Required | Description |
|---|---|---|---|
| `json` | `unknown` | one of `json`/`model` | Untrusted SurveyModel JSON. Preflighted against the URL policy **before** the model is constructed, then used to build a model this component **owns** (creates and disposes). Mutually exclusive with `model`. |
| `model` | `SurveyModel` | one of `json`/`model` | A host-constructed model. Treated as **trusted/prevalidated** and **never disposed** by this component. Wins over `json` if both are passed (with a `survey-root-diagnostic` diagnostic). |
| `theme` | `ITheme` | no | A survey-core theme JSON, passed **unmodified**. Fed to both `model.applyTheme` and the internal theme provider. See [Theming](#theming). |
| `styles` | `SurveyComponentStyles` | no | Per-component style overrides layered on top of the theme. See [Style overrides](#style-overrides). |
| `uriPolicy` | `UriPolicyConfig` | no | URL scheme/origin policy for fetches and links. Governs the `json`-path preflight and every render-time sink. See [Security](#security). |
| `onLinkPress` | `SurveyLinkPressHandler` | no | Host opt-in for link presses in sanitized HTML. Without it, links render as plain text (this library never navigates). See [Links](#links-onlinkpress). |
| `onScrollToElement` | `(event: SurveyScrollToElementEvent) => void` | no | Native scroll-interception hook. Called before the survey scrolls to focus an element; `event.preventDefault()` suppresses the native scroll (focus still completes). Not a model event. |
| `on…` (any) | survey-core handler | no | Every `on*` event of the survey-core `SurveyModel`. See [Event props](#event-props). |

> `json` and `model` are mutually exclusive. Both emit a
> `survey-root-diagnostic` (its `rootCode` is `conflicting-props` when both
> are passed — `model` wins — or `missing-model` when neither is, in which
> case nothing renders). Filter on `payload.code === 'survey-root-diagnostic'`,
> then branch on `payload.rootCode`.

`SurveyScrollToElementEvent`:

```ts
interface SurveyScrollToElementEvent {
  elementName: string | undefined;
  preventDefault(): void;
}
```

### Imperative handle (`SurveyRefHandle`)

Attach a `ref` to reach the live model and drive focus/scroll imperatively:

```tsx
import { useRef } from 'react';
import { Survey } from '@iotashan-llc/react-native-survey-library';
import type { SurveyRefHandle } from '@iotashan-llc/react-native-survey-library';

const ref = useRef<SurveyRefHandle>(null);

<Survey ref={ref} json={surveyJson} />;

// later:
ref.current?.focusQuestion('email');
ref.current?.scrollToTop();
const data = ref.current?.model?.data;
```

```ts
interface SurveyRefHandle {
  /** The live model (owned or host-provided), or null before it resolves. */
  model: SurveyModel | null;
  /** Delegates to model.focusQuestion; routes through the native scroll bridge. */
  focusQuestion(name: string): boolean;
  /** Scrolls the survey's host ScrollView to the top. */
  scrollToTop(): void;
}
```

`model` is a live getter — it never returns a stale or disposed instance.

---

## Controlling the model — `json` vs `model`

Two ownership models, chosen by which prop you pass:

**`json` path (library-owned).** You hand raw JSON; the component preflights its
URLs ([Security](#security)), constructs the model, applies the theme, and
**disposes** the model when it is replaced or unmounts. Passing a **deep-equal**
`json` value never recreates the model (survey-react-ui parity) — so an inline
object literal that is structurally unchanged across renders keeps the same
model and its answers. To force a fresh model, pass a genuinely different JSON.

**`model` path (host-owned).** You construct the `SurveyModel` yourself and pass
it. The component never disposes it — its lifetime is yours. Use this when you
need the model before render (to preload data, subscribe to events directly, or
share it across screens). Host models are documented **trusted**: their
construction-time `choicesByUrl` requests fire before this component exists, so
they are not preflighted unless you also pass `uriPolicy` (which arms
request-time enforcement for the model's later runtime fetches — see
[model-path security helpers](#advanced-model-path-helpers)).

```tsx
import { Survey } from '@iotashan-llc/react-native-survey-library';
import { Model } from '@iotashan-llc/react-native-survey-library'; // re-exported from survey-core

const model = new Model(surveyJson);
model.data = savedAnswers;

<Survey model={model} theme={theme} />;
```

See [DIFFERENCES.md → Owned-model lifetime](DIFFERENCES.md#owned-model-lifetime)
and [json-path is policy-checked before the model exists](DIFFERENCES.md#json-path-urls-are-policy-checked-before-the-model-exists-model-path-is-trusted).

---

## Theming

Pass a theme as the `theme` prop — any theme JSON exported by
`survey-core/themes` works unmodified (the pipeline is golden-tested against the
themes `survey-core` ships), as does any hand-authored `ITheme` object:

```tsx
import { DefaultDark } from 'survey-core/themes';

<Survey json={surveyJson} theme={DefaultDark} />;
```

The theme is applied to both the model (`applyTheme`) and the internal
`SurveyThemeProvider`. Changing the `theme` prop re-applies live (compared by a
canonical snapshot, so an equal-but-new-reference object is a no-op). Omitting
`theme` uses survey-core's defaults.

### Style overrides

For per-component tweaks beyond the theme tokens, pass `styles`
(`SurveyComponentStyles`) — a map of per-component slot overrides (item, input,
button, question title, header, navigation, progress, rating, etc.). Hoist the
object so its identity is stable across renders (identity participates in
provider memoization):

```tsx
import type { SurveyComponentStyles } from '@iotashan-llc/react-native-survey-library';

const styles: SurveyComponentStyles = {
  /* per-component override slots — see the SurveyComponentStyles /
     *StyleOverrides types (ItemStyleOverrides, InputStyleOverrides,
     ButtonStyleOverrides, …) */
};

<Survey json={surveyJson} theme={theme} styles={styles} />;
```

### Advanced theme exports

`SurveyThemeProvider` / `SurveyThemeContext` (the provider `<Survey>` mounts
internally), `resolveTheme` (the pure `ITheme → tokens` resolver), `composeStyles`,
and the resolved-theme types (`ResolvedTheme`, `ThemeTokens`, …) are exported for
hosts building their own themed surfaces or reading resolved tokens directly.
Most consumers only need the `theme` and `styles` props.

---

## Security

Security defaults differ from the web renderer **on purpose**. Three
mechanisms, all fail-closed:

1. **HTML is sanitized.** All HTML-bearing content (`completedHtml`,
   descriptions, `html` questions, …) renders through a tag/attribute allowlist
   with inline CSS stripped and resource bounds enforced. Oversized or
   pathological HTML renders as plain text.
2. **Every URL passes a central scheme/origin policy.** Automatic fetches
   (images, backgrounds, `choicesByUrl`, video) are `https:`-only and, by
   default, **no remote origin is fetched at all** until you allowlist it.
   `javascript:`, `data:` (except validated inline images), `file:`, `blob:`,
   and similar schemes are permanently denied. `choicesByUrl` is enforced at
   request time, including redirect end-URLs.
3. **Links never auto-navigate.** Anchor presses surface to your `onLinkPress`
   handler; the host decides whether to navigate.

Configure it through the `uriPolicy` prop. One config covers the JSON preflight
and every render-time sink.

### `uriPolicy` (`UriPolicyConfig`)

```ts
interface UriPolicyConfig {
  /** Automatic-fetch contexts only. Exact origin strings — scheme + host
   *  (+ non-default port). Default []: nothing remote is fetched until listed.
   *  A non-default port must appear WITH its port (e.g. "https://cdn.x.com:8443");
   *  the default-port form does not implicitly cover it. */
  allowedOrigins?: string[];
  /** Automatic-fetch contexts only. A previously-trusted absolute URL used to
   *  resolve relative references. Itself re-validated on every call. */
  baseUrl?: string;
  /** `image` context only. Overrides the 1 MB decoded-byte cap for `data:`
   *  images — DOWN only (values above the default are clamped to it). */
  maxDataImageBytes?: number;
}
```

```tsx
<Survey
  json={surveyJson}
  uriPolicy={{ allowedOrigins: ['https://api.example.com'] }}
/>;
```

An empty/absent policy is the safe default: HTTPS images and `choicesByUrl`
requests to un-allowlisted origins are blocked (fail-closed) with a
`choices-by-url-blocked` / `image-uri-blocked` / `survey-json-blocked-url`
diagnostic. IP-literal hosts, `localhost`/`.local`, and embedded credentials are
always refused.

### Links (`onLinkPress`)

Because the library never navigates, links inside sanitized HTML are inert
unless you provide a handler. `<Survey onLinkPress>` provides one handler to
**every** sanitized-HTML sink in the tree (titles, descriptions, errors,
completed page, `html` questions, choices). On a press that passes the policy's
press-time revalidation, you receive the canonical URL and decide what to do:

```tsx
import { Linking } from 'react-native';

<Survey
  json={surveyJson}
  onLinkPress={(event) => {
    // event.url is the policy-validated canonical href — safe to open
    Linking.openURL(event.url);
  }}
/>;
```

```ts
interface SurveyLinkPressEvent {
  /** Policy-validated canonical form of the pressed href (revalidated at press time). */
  url: string;
  /** Which sink the anchor rendered in ('title' | 'description' | 'html-question'
   *  | 'error' | 'completed' | 'loading' | 'choice' | 'html' | custom). */
  context: SurveyLinkPressContext;
  /** Computed origin: scheme://host[:non-default-port], or null for mailto:/tel:. */
  origin?: string | null;
  /** Lowercase scheme with trailing colon (e.g. "https:"), or null. */
  scheme?: string | null;
}

type SurveyLinkPressHandler = (event: SurveyLinkPressEvent) => void;
```

Without an `onLinkPress` prop (and without a per-sink `SanitizedHtml onLinkPress`),
anchors render as **plain text** — no dead link role, no pressable. The
`LinkPressContext` React context is exported for advanced per-subtree wiring.

### Advanced / model-path helpers

For hosts on the `model` path who want the same enforcement they'd get on the
`json` path, these are exported:

- `preflightSurveyJson(json, uriPolicy?)` → `PreflightResult` — run the same
  pre-model URL preflight over your JSON before constructing the model yourself.
- `installChoicesByUrlGate()`, `registerModelUriPolicy(model, config)`,
  `unregisterModelUriPolicy(model)`, `runWithConstructionUriPolicy(config, fn)` —
  opt a host-constructed model into request-time `choicesByUrl` + redirect
  enforcement.
- `validateUri`, `lintChoicesByUrlTemplate`, `requiresManualRedirect`, and the
  `sanitizeHtml` / `sanitizeIconSvg` functions with their config/result types —
  the raw policy primitives, for custom sinks.

Most consumers only need the `uriPolicy` and `onLinkPress` props. See
[DIFFERENCES.md → security sections](DIFFERENCES.md#url-schemeorigin-policy-is-restrictive-by-default).

---

## Event props

Every `on*` event exposed by the survey-core `SurveyModel` is an optional prop
on `<Survey>`, typed as that event's exact handler. This surface is derived by
the compiler from the installed `survey-core`, so it always matches your
`survey-core` version — there is no hand-maintained list and no arbitrary
model-property passthrough. Handlers are wired to the model on mount and cleanly
unwired on unmount / model swap (no leaked subscriptions).

```tsx
<Survey
  json={surveyJson}
  onValueChanged={(sender, options) => save(sender.data)}
  onCurrentPageChanged={(sender, options) => track(options.newCurrentPage.name)}
  onComplete={(sender) => submit(sender.data)}
/>;
```

Any survey-core event works the same way — `onValueChanging`, `onCompleting`,
`onCurrentPageChanging`, `onStarted`, `onAfterRenderQuestion`,
`onServerValidateQuestions`, `onMatrixRowAdded`, `onDynamicPanelAdded`,
`onErrorCustomText`, `onGetQuestionTitle`, and the rest of the SurveyModel event
API. Consult the [survey-core event
docs](https://surveyjs.io/form-library/documentation/api-reference/survey-data-model)
for each event's `options` shape.

Two `on*` props are **not** model events and are handled specially:
`onScrollToElement` (native scroll bridge) and `onLinkPress`
([Links](#links-onlinkpress)).

> `onAfterRenderPage` fires with `htmlElement: null` (there is no DOM in RN),
> and the other `afterRender*` events do not fire — see
> [DIFFERENCES.md](DIFFERENCES.md#onafterrenderpage-fires-with-htmlelement-null-the-other-afterrender-events-never-fire).

---

## Diagnostics

The library never throws to render a survey — unsupported types, blocked URLs,
missing peer libraries, and other degradations surface as **structured
diagnostics** instead. Register a handler to observe them:

```tsx
import { setDiagnosticHandler } from '@iotashan-llc/react-native-survey-library';
import type { DiagnosticPayload } from '@iotashan-llc/react-native-survey-library';

setDiagnosticHandler((payload: DiagnosticPayload) => {
  // payload.code discriminates the union; log, report to Sentry, etc.
  analytics.track('survey_diagnostic', payload);
});

// restore the default handler:
setDiagnosticHandler(undefined);
```

- `setDiagnosticHandler(handler | undefined)` — install a handler, or pass
  `undefined` to restore the default. The default logs to `console.warn` in
  development only (`__DEV__`); production builds stay silent unless you register
  a handler. A throwing handler is contained (logged once) and never breaks
  rendering.
- `reportDiagnostic(payload)` — the dispatch entry point (mainly for custom
  components that want to emit into the same channel).

`DiagnosticPayload` is a discriminated union keyed on `code`. The full set of
codes:

| Area | `code` values |
|---|---|
| Unsupported / fallback | `unsupported-question-type`, `custom-widget-ignored`, `custom-content-missing`, `element-wrapper-missing`, `paneldynamic-mode-unsupported`, `progress-bar-type-unsupported`, `image-content-mode-unsupported` |
| Survey root / lifecycle | `survey-root-diagnostic`, `lifecycle-diagnostic` |
| Security (URLs) | `survey-json-blocked-url`, `choices-by-url-blocked`, `image-uri-blocked` |
| Security (HTML / SVG) | `sanitized-html-diagnostic`, `sanitized-html-link-press-dropped`, `icon-svg-diagnostic`, `unknown-icon` |
| Theme / layout | `theme-diagnostic`, `theme-rn-unknown-css-token`, `layout-diagnostic` |
| Overlay / dialog | `dialog-adapter-displaced-show-dialog`, `dialog-adapter-enable-while-mounted`, `dialog-no-host` |
| Dropdown / tagbox | `dropdown-select-mode-unsupported`, `dropdown-input-component-missing`, `tagbox-select-mode-unsupported` |
| Text input | `masked-on-typing-downgraded`, `datetime-fallback-invalid-discarded` |
| Media / capability peers | `image-video-lib-unavailable`, `image-youtube-webview-unavailable`, `signaturepad-lib-unavailable`, `imagemap-lib-unavailable`, `file-picker-lib-unavailable`, `file-camera-permission-denied` |
| Matrix | `matrix-null-cell` |

Each payload carries code-specific fields (e.g. `questionName`, `reason`,
`url` — redacted for blocked-URL codes). `DiagnosticHandler` and the individual
payload types (`LifecycleDiagnosticPayload`, `SurveyRootDiagnosticPayload`,
`SurveyJsonBlockedUrlPayload`, `DialogAdapterDisplacedPayload`, …) are exported
for typed handling.

---

## Custom questions

### ComponentCollection (custom & composite)

The standard SurveyJS way to define new question types works unchanged. Register
your **custom** (single wrapped question) or **composite** (a panel of inner
elements) component with survey-core's `ComponentCollection`, then use it by
name in your JSON — the library ships the RN adapters that render both:

```tsx
import { ComponentCollection } from '@iotashan-llc/react-native-survey-library'; // re-exported from survey-core

ComponentCollection.Instance.add({
  name: 'fullname',
  title: 'Full name',
  elementsJSON: [
    { type: 'text', name: 'first', title: 'First' },
    { type: 'text', name: 'last', title: 'Last' },
  ],
});

// then in survey JSON: { type: 'fullname', name: 'applicant' }
```

A `custom` question's value is the inner scalar; a `composite` value is an object
keyed by inner element names. `ComponentCollection`'s `onAfterRender` /
`onAfterRenderContentElement` callbacks do not fire (the repo-wide no-DOM
`afterRender` posture). A malformed `custom` (a `createQuestion` that returns
null) renders a non-throwing fallback + a `custom-content-missing` diagnostic.
See [DIFFERENCES.md → Custom & composite questions](DIFFERENCES.md#custom--composite-questions-componentcollection-task-211).

### Factories (`RNQuestionFactory` / `RNElementFactory`)

For lower-level registration — supplying your own React Native component for a
question type or a survey element key — the two factory singletons are exported:

```tsx
import { RNQuestionFactory } from '@iotashan-llc/react-native-survey-library';

RNQuestionFactory.registerQuestion('my-widget', (props) => <MyWidget {...props} />);
```

`RNQuestionFactory` (question components) and `RNElementFactory` (survey element
keys: pages, wrappers, item components) share the same shape:

```ts
registerQuestion(type, creator) / registerElement(type, creator): void
isQuestionRegistered(type) / isElementRegistered(type): boolean
getAllTypes(): string[]
createQuestion(type, props) / createElement(type, props): React.JSX.Element | null
```

An unregistered type resolves to `null` (a clean miss) — the unsupported-type
fallback lives outside the registry.

### Unsupported-type fallback

- `setUnsupportedQuestionRenderer(renderer | …)` — replace the component shown
  for a question type the library doesn't support.
- `createUnsupportedQuestion(...)`, `UnsupportedQuestion` — the default fallback
  factory/component, with `UnsupportedQuestionProps` / `UnsupportedMissInfo` /
  `UnsupportedQuestionRenderer` types.

---

## Advanced exports

A few lower-level exports exist for consumers who need to customize overlay
behavior; most apps never touch them:

- **`setDialogAdapterEnabled(enabled)`** — toggles the native dialog adapter used
  to present modal survey popups (dropdown/tagbox/confirm sheets). Disable it if
  you provide your own presenter.
- **`OverlayPresenterContext` / `OverlayPresenter` / `OverlayPresenterProps`** —
  the injection seam for supplying a custom overlay presenter (how popups/sheets
  are rendered into your app's layout). Provide an `OverlayPresenter` through the
  context to override the built-in presentation.

## The `…/shim` subpath

```ts
import '@iotashan-llc/react-native-survey-library/shim';
```

`@iotashan-llc/react-native-survey-library/shim` is a **zero-core-import**
subpath that applies the survey-core environment shim (a small set of `global`
patches that make survey-core's require-time code safe under React Native's
no-DOM environment). Importing the package root already applies it — so you only
need this subpath if your app imports `survey-core` **before** it imports the
renderer. In that case, import the shim first, at the very top of your entry
file, so the environment is patched before survey-core evaluates:

```ts
// index.js — before any survey-core import
import '@iotashan-llc/react-native-survey-library/shim';
import { Model } from 'survey-core';
```

If you only ever touch survey-core through this package's exports, you never
need the shim subpath directly.

---

## survey-core surface

The package root **re-exports the entire `survey-core` public API** (through the
internal facade that applies the shim first). So `Model`, `Serializer`,
`ComponentCollection`, `FunctionFactory`, `settings`, `ITheme`, and every other
survey-core export are importable from either `survey-core` directly or from
`@iotashan-llc/react-native-survey-library`:

```tsx
import { Model, Serializer, settings } from '@iotashan-llc/react-native-survey-library';
```

Importing them from the package root guarantees the environment shim is applied
before survey-core is evaluated. `survey-core` remains a tested, **unmodified**
peer dependency — never forked, never patched — so its model, expressions,
validation, and theme JSON behave exactly as they do on web.

---

## See also

- [README](../README.md) — quick start, supported question types, peer-dependency table.
- [docs/DIFFERENCES.md](DIFFERENCES.md) — every observable divergence from
  `survey-react-ui`, each with rationale and workaround.
- [SurveyJS Form Library docs](https://surveyjs.io/form-library/documentation/overview)
  — the SurveyModel JSON schema, expressions, validation, and event `options`
  shapes (all shared with this renderer).
