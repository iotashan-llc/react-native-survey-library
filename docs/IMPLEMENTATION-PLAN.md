# Implementation Plan — @iotashan-llc/react-native-survey-library

React Native rendering engine for SurveyJS Form Library 2.x. Consumers pass their existing SurveyModel JSON + Theme JSON (unmodified) to `<Survey>` and get a native survey. Runtime only — no Creator/Dashboard/Analytics. Targets Expo SDK 57 (RN 0.86, React 19.2, New Architecture), iOS + Android only.

## Locked architecture decisions

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | `survey-core` = unmodified **peerDependency** (tested 2.5.x band, CI expands band per upstream minor) | Empirically verified: loads + full headless lifecycle works in RN-shaped JS env with one shim. No fork. |
| A2 | Env shim auto-applied via internal **survey-core facade** (`src/core/facade.ts`): no-op `window.addEventListener/removeEventListener`, `ResizeObserver` stub, applied before any survey-core evaluation. ESLint rule forbids importing `survey-core` outside the facade. Also exported as `applySurveyCoreShims()`. | RN aliases `window===global`, tripping survey-core's SSR guards; `dragdrop/dom-adapter.ts` crashes at require-time otherwise. |
| A3 | **Class-based reactive binding ported minimally** from survey-react-ui's `SurveyElementBase` (model property/array-change callbacks → `setState`, re-entrancy guard, deterministic unsubscribe). No hooks rewrite. StrictMode/React-19-concurrency tests gate it; `useSyncExternalStore` rewrite only if tearing proven. | Mechanism has zero DOM dependency; keeps ~50 component ports mechanical + diffable vs upstream. |
| A4 | **Own string-keyed factories** (`RNQuestionFactory`, `RNElementFactory`) mirroring upstream registration shape; components self-register; **non-throwing unsupported-type fallback** component with structured diagnostics. | Same seam upstream uses; custom-question registration story for consumers. |
| A5 | All RN inputs **controlled**, driven by the Question model (web's uncontrolled-input trick doesn't translate). | RN TextInput is controlled-only. |
| A6 | **Theme = two-stage**: `theme-core` (pure ITheme → normalized tokens: rgba colors pass through, px parsed, `--sjs-base-unit` spacing fn, box-shadow strings parsed to objects, article typography; bounded fallbacks for unknown/invalid values) + `theme-rn` (tokens → StyleSheet factories; `Platform.select` shadows — iOS shadow props / Android elevation; inset shadows approximated or dropped behind capability flag). Golden tests against **all 40 theme objects from `survey-core/src/themes/index.ts`** (not predefined-themes.json — it has 38). | Theme JSON in, native styles out, zero consumer config. |
| A7 | **Class-token→style bridge**: survey-core's CssClassBuilder keeps computing conditional BEM class strings (checked/disabled/error states); we tokenize them and merge registered style fragments in precedence layers (base → variant → state → consumer overrides). Unknown classes ignored with dev-mode diagnostics. Per-component metrics not present in theme JSON are hand-authored from v2.5.33 SCSS (source file/line documented per token). | Reuses ALL of core's conditional-state logic; zero duplicated logic. |
| A8 | **Plain StyleSheet + tokens.** No NativeWind (pre-release + consumer tailwind config), no Unistyles (consumer babel opt-in), no Tamagui (compiler weight). | Consumers need ZERO build-config changes. |
| A9 | **Overlay host primitive** = RN Modal-based, injectable (keyboard-aware, Android back-button, a11y). No gorhom/bottom-sheet hard dep; decision reversible via injection seam. | Dropdown/tagbox/rating-dropdown/buttongroup-overflow all depend on it; build once, first. |
| A10 | **Batteries-included dependency policy** (user decision): all capability libs are **required peerDependencies** — `react-native-svg`, `react-native-gesture-handler`, `react-native-reanimated`, `@react-native-community/slider`, `react-native-signature-canvas`, `expo-image-picker`, `expo-document-picker`, HTML renderer (lib choice re-verified at Phase 5), `expo-video`. One documented `npx expo install` line; every question type works after it. Internally lazy-require capability modules where possible so core render paths never touch them. | Single-install drop-in beats lean installs for this library's users. |
| A11 | **Security defaults restrictive**: sanitize HTML, allowlist URL schemes, never auto-open `navigateToUrl`/completion redirects — surface via events/callbacks, host app decides. Files/URLs/HTML/WebView = trust-boundary inputs. | Native app owns navigation + permissions. |
| A12 | **API surface**: named `<Survey>` accepting `json` XOR `model`, `theme` (ITheme), style overrides, event props derived from actual `EventBase` members; `SurveyRef` forwardRef = `{model, focus/scroll helpers}` (never host nodes); re-export survey-core conveniences (`Model`, `SurveyModel`, `settings`, localization, types) + RN factories. **Classified-drift API gate** via surveyjs-doc-generator: every survey-react-ui export classified `compatible | native-replacement | intentionally-unsupported`; CI fails on unclassified drift. | Drop-in ≈ semantics parity, not blind DOM-export parity. |
| A13 | **TDD mandatory** — red-green-refactor per task; jest-expo + @testing-library/react-native; model-JSON fixtures reused from survey-library's own test suites; failing test precedes implementation, always. | User rule. |
| A14 | Release gate every phase: **packed-tarball install into a stock Expo SDK 57 New-Arch app** (iOS + Android) + example-app e2e smoke. | Catches packaging/autolinking drift no unit test sees. |

### Rejected as premature (do not reopen without measured failure)
Monorepo / adapter-package family; hooks rewrite; SCSS→RN compiler; NativeWind/Unistyles/Tamagui; mandatory bottom-sheet; generalized virtual-grid abstraction before profiling.

### Won't support in v1 (documented in DIFFERENCES.md with workarounds)
Creator/Dashboard/Analytics; string-editor + creator drag chrome; DOM refs / `afterRenderQuestionElement` HTMLElement contracts; arbitrary CSS class overrides / custom SCSS; web popup coordinate models; automatic URL redirects (event-driven instead); file drag-drop (pickers instead); DOM/jQuery custom widgets (RN factory registration instead); hover/mouse/print semantics; `backgroundImageAttachment: fixed`; exact inset/multi-shadow fidelity; YouTube iframes (WebView/expo-video path documented).

---

## Phases → milestones → tasks

Sizing: S (≤half day), M (~1 day), L (2-3 days). `CORE` = core-architecture task: orchestrator plans it personally + llm-pairs the design before handoff.

### Phase 0 — Foundation (Milestone M0)

| ID | Task | Size | Notes |
|----|------|------|-------|
| 0.1 | Scaffold: `create-react-native-library` (JS-only) + example Expo SDK 57 app; expo-doctor clean; TS strict; ESLint; jest-expo + @testing-library/react-native wiring | M | Follow react-native-app-creation rule; align lib devDeps with example |
| 0.2 | CI: GitHub Actions — lint, typecheck, unit tests; packed-tarball install smoke job (stock Expo 57 app, iOS+Android bundle) | M | Gate from day 1 |
| 0.3 | `CORE` survey-core facade + env shims + require-time load test under RN-shaped globals (jest env with `window===global`, no `document`); ESLint no-direct-import rule | M | A2 |
| 0.4 | `CORE` Reactive base classes port (`SurveyElementBase`, `ReactSurveyElement`, RN question-element base) + StrictMode/React-19 subscription tests (mount/unmount/resubscribe/tearing/swap-model) | L | A3, A5 |
| 0.5 | `CORE` Factories + unsupported-question fallback + registration/self-registration tests | S | A4 |
| 0.6 | `CORE` theme-core: ITheme→tokens resolver + golden tests vs 40 themes (themes/index.ts) | L | A6 |
| 0.7 | `CORE` theme-rn: StyleSheet factories, Platform shadow mapping, SurveyThemeProvider + class-token→style bridge (tokenizer, precedence merge, dev diagnostics) | L | A6, A7 |
| 0.8 | doc-generator parity harness: generate classes.json for survey-react-ui + ours; classification manifest; CI drift gate | M | A12 |

### Phase 1 — v0.1 Survey shell + simple inputs (Milestone M1)

| ID | Task | Size |
|----|------|------|
| 1.1 | `CORE` `<Survey>` root: json XOR model, applyTheme, owned-model dispose, SurveyRef, event props | M |
| 1.2 | Page/Panel/Row/Element composition + responsive row layout (onLayout) | M |
| 1.3 | Question chrome: title/description/required mark/errors/comment area | M |
| 1.4 | Navigation buttons + progress bar + completion/loading/empty states | M |
| 1.5 | text question: inputType→keyboardType/secureTextEntry map, maxLength, placeholder | M |
| 1.6 | comment question (multiline, autosize behavior) | S |
| 1.7 | radiogroup + checkbox (Pressable rows; selectAll/none/other/comment items; columns) | L |
| 1.8 | boolean (switch + checkbox/radio render modes) | S |
| 1.9 | rating — button row modes: numbers/stars/smileys (react-native-svg icons) | M |
| 1.10 | expression question | S |
| 1.11 | Accessibility pass: accessibilityRole/state/label derived from model across M1 components | M |
| 1.12 | Example app kitchen-sink survey + theme switcher; agent-device e2e smoke | M |
| 1.13 | Release v0.1: tarball gate, README quick start, DIFFERENCES.md seed | M |

### Phase 2 — v0.2 Popups + containers (Milestone M2)

| ID | Task | Size |
|----|------|------|
| 2.1 | `CORE` Overlay host primitive: Modal-based, keyboard-aware, back-button, a11y; injectable; list picker w/ search | L |
| 2.2 | dropdown (filter/search, choicesByUrl, lazy load) | L |
| 2.3 | tagbox (chips + multi-select picker) | M |
| 2.4 | rating-dropdown mode + buttongroup overflow dropdown | S |
| 2.5 | multipletext | M |
| 2.6 | imagepicker (image grid select, multi) | M |
| 2.7 | paneldynamic (list + tab/progress modes, add/remove) | L |
| 2.8 | buttongroup | S |
| 2.9 | image (static display; scaling modes) | S |
| 2.10 | Release v0.2 (gates + docs update) | S |

### Phase 3 — v0.3 Matrix family (Milestone M3)

| ID | Task | Size |
|----|------|------|
| 3.1 | `CORE` Grid primitive: flex rows + horizontal ScrollView, sticky-ish header column, narrow-screen stacked fallback, focusable cells | L |
| 3.2 | matrix (single-choice grid) | M |
| 3.3 | matrixdropdown (nested cell questions via factories) | L |
| 3.4 | matrixdynamic (add/remove rows, detail panels, validation summaries) | L |
| 3.5 | singleinputsummary + release v0.3 | S |

### Phase 4 — v0.4 Gesture types (Milestone M4)

| ID | Task | Size |
|----|------|------|
| 4.1 | `CORE` Drag-reorder primitive (gesture-handler + reanimated: cancellation, autoscroll, disabled states, a11y move actions, model commit semantics) | L |
| 4.2 | ranking: select-to-rank mode first, then drag mode on 4.1 | M |
| 4.3 | matrixdynamic row reorder on 4.1 | S |
| 4.4 | slider: single-thumb via @react-native-community/slider; dual-thumb custom on gesture primitive | L |
| 4.5 | Release v0.4 | S |

### Phase 5 — v0.5–v0.9 Capability types (Milestone M5)

| ID | Task | Size |
|----|------|------|
| 5.1 | signaturepad (react-native-signature-canvas; data-URL → question.value parity) | M |
| 5.2 | file: expo-image-picker + expo-document-picker; camera; SurveyJS upload/clear events; size/type validation | L |
| 5.3 | html question: re-verify HTML-renderer lib maintenance (react-native-render-html vs alternatives vs WebView) then implement w/ sanitization | M |
| 5.4 | imagemap (react-native-svg hotspot overlays) | M |
| 5.5 | image video mode (expo-video); YouTube via WebView documented pattern | S |
| 5.6 | Advanced header/cover (IHeader → ImageBackground + 3×3 position grid) | M |
| 5.7 | timer panel; TOC/progress-buttons variants; notifier toast | M |
| 5.8 | Release v0.5+ increments | S |

### Phase 6 — v1.0 Hardening (Milestone M6)

| ID | Task | Size |
|----|------|------|
| 6.1 | Localization + RTL verification (survey-locales pass-through, RN I18nManager) | M |
| 6.2 | Perf: large-survey + matrix fixtures, profiling; virtualization only if measured need | L |
| 6.3 | Full a11y audit (screen readers iOS/Android) | M |
| 6.4 | Docs complete: DIFFERENCES.md (per-feature workarounds), theming guide, custom-question guide, generated API reference, support matrix | L |
| 6.5 | v1.0 release gates: stock-app tarball e2e both platforms, 40-theme goldens + representative screenshots, zero unclassified API drift, survey-core band policy documented | M |

## Cross-cutting execution rules (baked into CLAUDE.md)

1. Orchestrator (main session) coordinates; agent team executes; `CORE` tasks designed by orchestrator + llm-paired before handoff.
2. llm-pair at plan/work-item-review/blocker boundaries (skill owns mechanics).
3. TDD non-negotiable: failing test first, on every task.
4. Token conservation: compact ~200k; sonnet-class agents for mechanical ports, stronger models only for CORE work; terse outputs.
5. Fixtures: reuse survey-library's test JSONs; goldens for themes; every bugfix lands with a regression test.
