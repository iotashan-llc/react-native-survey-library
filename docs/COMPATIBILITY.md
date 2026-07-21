# Compatibility & version policy

`@iotashan-llc/react-native-survey-library` is a rendering engine for the
SurveyJS Form Library. It is pinned to a **tested band** of `survey-core` and a
specific React Native / Expo target — this page states those bands and the
policy for moving between them.

## Platform target

| | Supported |
|---|---|
| **Expo SDK** | **57** (RN 0.86, React 19.2) |
| **React Native architecture** | **New Architecture only** (Fabric + TurboModules) |
| **Platforms** | **iOS + Android**. No web — web users keep the official `survey-react-ui`. |
| **Package manager (development)** | Yarn 4.11 (the repo is a Yarn workspace) |

The library is authored and tested against the Expo SDK 57 toolchain. Bare
React Native apps on the same RN/React triple work too, but the example app and
CI exercise the Expo path.

## `survey-core` — the load-bearing peer

```
"survey-core": ">=2.5.32 <2.6.0"
```

`survey-core` is an **unmodified peer dependency** (never forked, never
`patch-package`d). The renderer ports a specific `survey-core` **minor line**
(2.5.x) — its model APIs, CSS-class contracts, and localization keys. Because
of that:

- **Patch and minor updates inside the band** (`2.5.32` … the latest `2.5.x`)
  are supported and encouraged — bug fixes flow straight through.
- **A new `survey-core` minor** (`2.6`, `2.7`, …) is **out of band**: it can
  change model surfaces or CSS contracts the renderer maps, so it needs a
  renderer release that re-tests and widens the band. Don't force it with
  `--force`/resolutions; wait for a matching renderer version.

CI runs the suite against **both ends of the band** (currently 2.5.32 and
2.5.33) so a regression in either is caught.

## Capability peer dependencies

These are **required, batteries-included** peers (invariant: capability libs are
peer dependencies, lazy-loaded only when a question needs them). A missing peer
degrades **only** the question that needs it — a non-throwing fallback plus a
diagnostic — never the whole survey. See the
[README install section](../README.md#installation) for what each backs.

| Peer | Band |
|---|---|
| `react-native-svg` | `>=15.0.0 <16.0.0` |
| `react-native-gesture-handler` | `>=2.20.0 <3.0.0` |
| `react-native-reanimated` | `>=3.16.0 <5.0.0` |
| `@react-native-community/slider` | `>=4.5.0 <6.0.0` |
| `react-native-webview` | `>=13.0.0` |
| `react-native-signature-canvas` | `>=5.0.0 <6.0.0` |
| `expo-video` | `>=2.0.0` |
| `expo-image-picker` | `>=15.0.0` |
| `expo-document-picker` | `>=12.0.0` |
| `@native-html/render` | `~1.0.3` |

`react` and `react-native` are declared as `*` — their real floor is the Expo
SDK 57 target above (React 19.2 / RN 0.86). Install native peers with
`npx expo install` so their versions match your SDK rather than pinning them by
hand.

## How this package is versioned

- The renderer follows **semver**. A **minor** bump adds question types or
  features; a **patch** bump is fixes only.
- Widening the `survey-core` band (adopting a new `survey-core` minor) is a
  renderer **minor** at minimum, because it re-tests the model/CSS contracts.
- Dropping or raising an Expo SDK / RN floor is a **breaking** change (major).
- New capability peers (or a raised peer floor) are called out in the release
  notes — check them before upgrading.

## When a native build fails

Two thirds of "compiler/linker" errors in RN are version mismatches in disguise.
Before chasing a CocoaPods/Gradle symptom:

1. Run `npx expo-doctor` in your app and fix any reported peer mismatch first.
2. Confirm your `survey-core` is inside the band above.
3. Confirm the capability peers are inside their bands and installed via
   `expo install`.

See [docs/DIFFERENCES.md](DIFFERENCES.md) for every deliberate behavioral
divergence from `survey-react-ui`, and the [README](../README.md) for the
supported-type matrix.
