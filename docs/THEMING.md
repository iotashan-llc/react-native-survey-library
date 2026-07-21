# Theming

How to style a survey rendered by `@iotashan-llc/react-native-survey-library`.

The guiding idea is the same as everywhere else in this library: you pass your
existing SurveyJS **Theme JSON unmodified** and it renders natively — no
WebView, no CSS, no build-config changes. This guide covers applying a theme,
what the theme pipeline does under the hood, overriding individual component
styles, and the advanced exports for hosts that render survey pieces
standalone.

- For the `<Survey>` prop table and a condensed version of this material, see
  [`docs/API.md`](./API.md) ("Theming").
- For the exact list of what renders differently from the official web renderer
  (`survey-react-ui`), see [`docs/DIFFERENCES.md`](./DIFFERENCES.md).
- For a runnable example, see the example app's theme switcher.

---

## 1. Applying a theme — the `theme` prop

Pass any SurveyJS theme JSON (`ITheme`) to the `<Survey theme>` prop. It is
forwarded **unmodified** to two places at once:

1. `model.applyTheme(theme)` — so survey-core's own theme-aware model logic
   (panelless layout, header/cover config, etc.) sees it.
2. The internal `SurveyThemeProvider` — which resolves it into React Native
   styles for the renderer.

```tsx
import { Survey } from '@iotashan-llc/react-native-survey-library';
import { DefaultDark } from 'survey-core/themes';

export default function Screen() {
  return <Survey json={surveyJson} theme={DefaultDark} />;
}
```

Omitting `theme` renders with survey-core's built-in defaults (the equivalent
of `DefaultLight`'s base tokens).

### The 40 built-in themes

The renderer is validated against **all 40 themes** that `survey-core` ships,
with golden snapshots for the curated set. Import any of them by name from
`survey-core/themes` and pass it straight through:

```tsx
import { SharpDark, FlatLightPanelless } from 'survey-core/themes';
```

There are **10 theme families**, each in **4 variants** — light / dark ×
panelled / panelless:

| Family | Light | Dark | Light · panelless | Dark · panelless |
|---|---|---|---|---|
| Default | `DefaultLight` | `DefaultDark` | `DefaultLightPanelless` | `DefaultDarkPanelless` |
| Sharp | `SharpLight` | `SharpDark` | `SharpLightPanelless` | `SharpDarkPanelless` |
| Borderless | `BorderlessLight` | `BorderlessDark` | `BorderlessLightPanelless` | `BorderlessDarkPanelless` |
| Flat | `FlatLight` | `FlatDark` | `FlatLightPanelless` | `FlatDarkPanelless` |
| Plain | `PlainLight` | `PlainDark` | `PlainLightPanelless` | `PlainDarkPanelless` |
| Double Border | `DoubleBorderLight` | `DoubleBorderDark` | `DoubleBorderLightPanelless` | `DoubleBorderDarkPanelless` |
| Layered | `LayeredLight` | `LayeredDark` | `LayeredLightPanelless` | `LayeredDarkPanelless` |
| Solid | `SolidLight` | `SolidDark` | `SolidLightPanelless` | `SolidDarkPanelless` |
| 3-Dimensional | `ThreeDimensionalLight` | `ThreeDimensionalDark` | `ThreeDimensionalLightPanelless` | `ThreeDimensionalDarkPanelless` |
| Contrast | `ContrastLight` | `ContrastDark` | `ContrastLightPanelless` | `ContrastDarkPanelless` |

- **Dark / light** is carried by the theme's `colorPalette` field
  (`"light"` | `"dark"`). The renderer reads it verbatim; there is no automatic
  OS-appearance switch — pick the dark or light variant yourself (e.g. from
  `useColorScheme()`).
- **Panelless** variants set `isPanelless: true`, which survey-core uses to
  render questions without their surrounding panel chrome.

### Hand-authored `ITheme`

A theme is a plain JSON object — you don't have to use a built-in one. Any
valid `ITheme` works, including a partial one that only sets a few CSS
variables:

```tsx
import { Survey } from '@iotashan-llc/react-native-survey-library';
import type { ITheme } from '@iotashan-llc/react-native-survey-library'; // re-exported from survey-core

const brand: ITheme = {
  colorPalette: 'light',
  isPanelless: false,
  cssVariables: {
    '--sjs-primary-backcolor': '#6C5CE7',
    '--sjs-general-backcolor': '#FFFFFF',
    '--sjs-corner-radius': '12px',
    '--sjs-base-unit': '8px',
  },
};

<Survey json={surveyJson} theme={brand} />;
```

The supported `ITheme` fields are exactly survey-core's:
`themeName`, `colorPalette`, `isPanelless`, `backgroundImage`,
`backgroundImageFit`, `backgroundImageAttachment`, `backgroundOpacity`,
`header`, `headerView`, and `cssVariables`. `cssVariables` is where the bulk of
customization lives — the same `--sjs-*` / `--sd-*` custom properties SurveyJS
uses on the web.

### Changing the theme at runtime

Changing the `theme` prop re-applies live. The change is detected by a
**canonical snapshot compare** of the theme's supported fields, not by object
reference — so you can safely mutate a theme object in place, or pass a
new-but-equal object, without triggering a needless re-resolve. A same-valued
theme is a no-op.

```tsx
const [dark, setDark] = useState(false);
<Survey json={surveyJson} theme={dark ? DefaultDark : DefaultLight} />;
```

---

## 2. What the theme pipeline does

You never write CSS, a `tailwind.config`, a Babel plugin, or a Metro resolver.
The theme is resolved to plain `StyleSheet` objects at runtime, in two pure
stages:

```
ITheme  ──►  theme-core (resolveTheme)  ──►  theme-rn (buildRecipes)  ──►  StyleSheet
            pure ITheme → design tokens     tokens → RN style fragments
            (no React Native imports)       (StyleSheet.create'd)
```

1. **`theme-core`** (`resolveTheme`) is a **pure data** transform: `ITheme` in,
   a `ResolvedTheme` of design tokens out (colors, base unit, corner radius,
   shadows, article-font metrics, typography). It dereferences `var(...)`
   chains, evaluates `calc(...)`-shaped defaults, and parses every value under
   its grammar. It contains **zero React Native imports and zero functions** in
   its output — it's serializable and golden-testable.
2. **`theme-rn`** (`buildRecipes`) turns those tokens into per-component
   **recipes**: `StyleSheet.create`'d atomic style fragments selected at render
   time by model-derived state. This stage is where RN-specific concerns live
   (platform shadow mapping, RTL, narrow layout).

Consequences worth knowing as a consumer:

- **No build-config changes.** No NativeWind / Unistyles / Tamagui, no
  `babel`/`metro` plugins. Installing the library changes nothing about how you
  bundle.
- **Memoized.** The provider caches the resolved theme + recipes and only
  rebuilds when the theme snapshot (or the OS/platform) actually changes, so
  re-renders are cheap.
- **Diagnostics, not crashes.** An unparseable CSS variable falls back to the
  registry default and surfaces a `theme-diagnostic` through the diagnostics
  channel (see `setDiagnosticHandler` in [`docs/API.md`](./API.md)) — it never
  throws.

Most consumers never touch the tokens directly. If you do want them (e.g. to
style a surrounding screen to match), `resolveTheme` and the resolved-token
types are exported — see [§4](#4-advanced-exports).

---

## 3. Per-component style overrides — the `styles` prop

For tweaks beyond what theme tokens express, pass `styles`
(`SurveyComponentStyles`) — a map of **named slots** per component, each typed
as a React Native `StyleProp`. These layer **on top of** the resolved theme,
with this precedence:

```
recipe fragment  <  theme layer  <  your override      (later wins)
```

Your override always wins last. (The middle "theme layer" is a reserved slot
for a future theme-JSON-driven per-component style; today the recipe is the
base and your `styles` override is what refines it.)

```tsx
import type { SurveyComponentStyles } from '@iotashan-llc/react-native-survey-library';

// Hoist it — see the memoization note below.
const surveyStyles: SurveyComponentStyles = {
  questionTitle: {
    title: { fontWeight: '700', color: '#1A1A2E' },
    requiredMark: { color: '#E53935' },
  },
  input: {
    control: { borderRadius: 12, borderColor: '#6C5CE7' },
  },
  navigation: {
    root: { paddingHorizontal: 24 },
  },
};

<Survey json={surveyJson} theme={brand} styles={surveyStyles} />;
```

> **Memoization:** the provider keys its context value on the `styles` object's
> **identity** (`StyleProp` values are commonly registered style objects/arrays
> where deep comparison is neither cheap nor meaningful). **Hoist the object** —
> declare it at module scope or `useMemo` it — rather than inlining a fresh
> literal every render, or every consumer re-renders on every parent render.

### Slot reference

Type the whole object as `SurveyComponentStyles`; it contains every group
below. Each leaf is a `StyleProp<ViewStyle>` / `StyleProp<TextStyle>` /
`StyleProp<ImageStyle>` (marked V / T / I).

| `styles` key | Slots (type) |
|---|---|
| `item` | `container` V · `decorator` V · `label` T · `description` T |
| `input` | `control` T · `characterCounter` T |
| `button` | `button` T |
| `questionTitle` | `title` T · `number` T · `numberGutter` V · `requiredMark` T |
| `unsupportedQuestion` | `panel` V · `message` T · `errorAccentBar` V |
| `questionChrome` | `description` T · `errorPanel` V · `errorItem` T · `commentArea` V · `commentLabel` T · `commentInput` T |
| `actionButton` | `container` V · `icon` V · `title` T |
| `header` | `root` V · `titleBlock` V · `title` T · `description` T · `logo` V · `logoImage` I |
| `navigation` | `root` V |
| `progress` | `track` V · `bar` V · `text` T |
| `surveyState` | `completed` V · `completedBefore` V · `loading` V · `empty` V |
| `rating` | `root` V · `row` V · `minMaxText` T · `pillItem` T · `smileyItem` V |
| `buttonGroup` | `container` V · `item` V · `caption` T |
| `ranking` | `item` V · `handle` V · `rankNumber` V · `rankNumberText` T · `label` T |
| `slider` | `container` V · `track` V · `activeBar` V · `thumb` V · `tooltip` V · `label` V |
| `signature` | `container` V · `canvas` V · `placeholder` V · `clearButton` V · `image` I |
| `file` | `root` V · `actions` V · `chooseButton` V · `chooseButtonText` T · `list` V · `item` V · `thumbnail` I · `decorator` V · `fileName` T · `removeButton` V · `navigator` V · `placeholder` V |
| `imagemap` | `container` V · `imageBox` V · `image` I · `fallback` V |
| `listItem` | `row` V · `text` T · `searchInput` T |
| `timerPanel` | `root` V · `majorText` T · `minorText` T · `text` T |
| `progressToc` | `container` V · `toggle` V · `toggleGlyph` T |
| `progressButtons` | `root` V · `step` V · `circle` V · `title` T · `footerText` T |
| `notifier` | `root` V · `message` T |

All slots are optional; set only the ones you need.

### Importing individual slot-group types

You usually only need the umbrella `SurveyComponentStyles`. If you want to type
a single group, the following per-group interfaces are also exported from the
package root:

`ItemStyleOverrides`, `InputStyleOverrides`, `ButtonStyleOverrides`,
`QuestionTitleStyleOverrides`, `UnsupportedQuestionStyleOverrides`,
`QuestionChromeStyleOverrides`, `ActionButtonStyleOverrides`,
`HeaderStyleOverrides`, `NavigationStyleOverrides`, `ProgressStyleOverrides`,
`SurveyStateStyleOverrides`, `RatingStyleOverrides`, `ButtonGroupStyleOverrides`,
`ListItemStyleOverrides`.

The remaining groups (`ranking`, `slider`, `signature`, `file`, `imagemap`,
`timerPanel`, `progressToc`, `progressButtons`, `notifier`) have their own
interfaces internally but are **not** re-exported from the package root — reach
them through the umbrella `SurveyComponentStyles` type (e.g.
`SurveyComponentStyles['slider']`).

---

## 4. Advanced exports

The provider `<Survey>` mounts internally, its context, the pure resolver, and
the style-composition helper are all exported for hosts that render survey
**pieces standalone** (a custom themed control, a screen chrome that reads
resolved tokens, a bespoke fallback component). Most apps never need these.

### `SurveyThemeProvider` / `SurveyThemeContext`

Wrap your own subtree in `SurveyThemeProvider` to make the resolved theme and
recipes available to descendants via `SurveyThemeContext`:

```tsx
import {
  SurveyThemeProvider,
  SurveyThemeContext,
} from '@iotashan-llc/react-native-survey-library';
import { DefaultDark } from 'survey-core/themes';

<SurveyThemeProvider theme={DefaultDark}>
  <MyThemedControl />
</SurveyThemeProvider>;
```

`SurveyThemeProvider` props:

| Prop | Type | Notes |
|---|---|---|
| `theme` | `ITheme` | Optional; omit for defaults. |
| `styles` | `SurveyComponentStyles` | Per-component slot overrides (identity-memoized — hoist it). |
| `narrow` | `boolean` | Narrow-layout switch (`<Survey>` drives this from its own width measurement at a 600 dp breakpoint). |
| `rtl` | `boolean` | Defaults to `I18nManager.isRTL`; explicit override mainly for tests. |

`SurveyThemeContext`'s value (`SurveyThemeContextValue`):

| Field | Type | What it is |
|---|---|---|
| `resolved` | `ResolvedTheme` | The pure resolved token bundle (`tokens`, `meta`, `background`, `header`, …). |
| `recipes` | `Recipes` | Per-component `StyleSheet` fragment recipes. |
| `mode` | `ThemeMode` | `{ narrow: boolean; rtl: boolean }`. |
| `normalizedBackground` | `NormalizedBackground` | Ready-to-render survey background (image/opacity/fit). |
| `styles` | `SurveyComponentStyles` | The consumer overrides (defaults to a frozen empty object). |

### `resolveTheme`

The pure `ITheme → ResolvedTheme` resolver, if you want design tokens without a
React tree at all (e.g. to color a surrounding screen to match the survey):

```tsx
import { resolveTheme } from '@iotashan-llc/react-native-survey-library';
import { SolidLight } from 'survey-core/themes';

const { tokens, meta } = resolveTheme(SolidLight);
// tokens.colors, tokens.baseUnit, tokens.cornerRadius, tokens.shadows,
// tokens.articleFont, tokens.typography ; meta.colorPalette / isPanelless
```

The resolved-theme types are exported for typing this: `ResolvedTheme`,
`ThemeTokens`, `ThemeMeta`, `ThemeBackground`, `ThemeHeader`, `ColorToken`,
`ArticleFontToken(s)`, `ShadowTokens`, and more (see `src/index.tsx`).

### `composeStyles`

The same helper the built-in components use to merge a recipe fragment with the
consumer override, honoring the `recipe < theme < override` precedence. It
filters out nullish/`false` entries so you can pass conditional layers directly:

```tsx
import { composeStyles, SurveyThemeContext } from '@iotashan-llc/react-native-survey-library';
import type { StyleOverrideLayers } from '@iotashan-llc/react-native-survey-library';
import { useContext } from 'react';
import { View } from 'react-native';

function MyThemedControl() {
  const { recipes, styles: overrides } = useContext(SurveyThemeContext);
  return (
    <View
      style={composeStyles(recipes.item.fragments.container, {
        // both layers optional:
        override: overrides.item?.container,
      })}
    />
  );
}
```

`composeStyles(recipeFragments, layers?)` returns a `StyleProp[]` (an array RN
composes left-to-right). `layers` is `StyleOverrideLayers` — `{ theme?,
override? }`, each a `StyleProp`.

---

## 5. What is not themeable (vs. web)

React Native has no CSS engine, so a handful of web styling paths have no
equivalent here. These are documented in full in
[`docs/DIFFERENCES.md`](./DIFFERENCES.md); the theming-relevant ones:

- **No class-based styling / `cssClasses` customization.** There is no CSS
  cascade for a `class` to hook into. Customizing element appearance by
  overriding survey-core `cssClasses` strings has no effect at the RN layer;
  use Theme JSON (`cssVariables`) or the `styles` prop instead. (Specific
  cases: the matrix check glyph and consumer `itemSvgIconId`/
  `itemPreviewSvgIconId` overrides are not honored — DIFFERENCES §Matrix.)
- **Inline `style` attributes in HTML content are stripped.** HTML carried in
  titles/descriptions/`html` questions renders through a security-first
  sanitizer that drops the `style` attribute unconditionally. Move visual
  styling for HTML-bearing text into Theme JSON.
  (DIFFERENCES §"No inline CSS".)
- **CSS custom properties inside icon `style` attributes don't resolve.** A few
  core icons reference `var(--…)` in an inline `style`; RN has no variable
  cascade, so those declarations are inert. (DIFFERENCES §Icons.)
- **`onAfterRender*` DOM-node styling hooks are gone.** Web hands live DOM nodes
  to `afterRenderSurvey/afterRenderQuestion`; those never fire here (no DOM).
  `onAfterRenderPage` fires with `htmlElement: null`. Hosts that styled via
  those events should use Theme JSON + the `styles` prop.
  (DIFFERENCES §"onAfterRenderPage fires with htmlElement: null".)
- **Enter/leave and keyframe animations are not carried** (row enter/leave
  fades, rank-number focus outline keyframes). (DIFFERENCES §"Row enter/leave
  animations".)

Everything survey-core expresses through Theme JSON — colors, spacing, corner
radius, shadows, typography, background image/opacity, panelless layout, and
the advanced header/cover settings — **is** honored.
