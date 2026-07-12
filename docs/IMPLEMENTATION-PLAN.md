# Implementation Plan — @iotashan-llc/react-native-survey-library

React Native rendering engine for SurveyJS Form Library 2.x. Consumers pass their existing SurveyModel JSON + Theme JSON (unmodified) to `<Survey>` and get a native survey. Runtime only — no Creator/Dashboard/Analytics. Targets Expo SDK 57 (RN 0.86, React 19.2, New Architecture), iOS + Android only.

## Locked architecture decisions

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | `survey-core` = unmodified **peerDependency**, range pinned to the **tested version band** (starts `2.5.x`); a parameterized core-compatibility CI suite must pass before the band expands to a new upstream minor. | Empirically verified: loads + full headless lifecycle works in RN-shaped JS env with one shim. No fork. Styles/templates are coupled to verified versions. |
| A2 | Env shim (no-op `window.addEventListener/removeEventListener` ONLY — no ResizeObserver/observer stubs; a no-op observer makes core feature-detection succeed while callbacks never fire) shipped THREE ways: (1) auto-applied by our main entry before any survey-core evaluation, (2) a **zero-core-import shim subpath** (`…/shim`) for consumers who import `survey-core` first (documented import-order contract), (3) exported `applySurveyCoreShims()`. All survey-core imports inside the lib go through `src/core/facade.ts`; ESLint enforces internally (incl. require/dynamic-import/subpath forms). Package is ESM-only (no Node-CJS entry); packaged-entry tests cover BOTH import orders (renderer-first and model-first) for real ESM via package specifiers + Metro/Babel-transformed source semantics. Design: `docs/design/0.3-core-facade.md` (incl. runtime compatibility ledger). | RN aliases `window===global`, tripping survey-core's SSR guards; `dragdrop/dom-adapter.ts` runs `window.addEventListener` at module evaluation. Consumer building `model` before importing us would crash without (2). |
| A3 | **Class-based reactive binding ported minimally** from survey-react-ui's `SurveyElementBase` (model property/array-change callbacks → `setState`, re-entrancy guard, deterministic unsubscribe). No hooks rewrite. StrictMode/React-19-concurrency tests gate it; `useSyncExternalStore` rewrite only if tearing proven. | Mechanism has zero DOM dependency; keeps ~50 component ports mechanical + diffable vs upstream. |
| A4 | **Own string-keyed factories** (`RNQuestionFactory`, `RNElementFactory`) mirroring upstream registration shape; components self-register; **non-throwing unsupported-type fallback** with structured diagnostics. Must also cover SurveyJS runtime templates: `custom` + `composite` (ComponentCollection) get dedicated adapters; a **runtime-template coverage manifest** (serializer template names → renderer) is CI-checked alongside the export gate. | Same seam upstream uses; `QuestionCustomModel.getTemplate()` returns `custom`/`composite`, not the registered type name. |
| A5 | All RN inputs **controlled**, but text-like inputs go through a **draft/commit adapter**: local draft state ← `onChangeText`, committed to `question.value` per SurveyJS `textUpdateMode` semantics (default `onBlur`; `onTyping` immediate); external model changes sync into the draft. Input subtypes (all 13 `inputType`s incl. date/time/color/range) map to native renderers or documented fallbacks; masks reuse core mask logic without its DOM adapter. | Binding `onChangeText` straight to the model would change expression/validation/event timing vs web. |
| A6 | **Theme = two-stage**: `theme-core` (pure ITheme → normalized tokens: rgba colors pass through, px parsed, `--sjs-base-unit` spacing fn, box-shadow strings parsed to objects, article typography; bounded fallbacks for unknown/invalid values) + `theme-rn` (tokens → StyleSheet factories; `Platform.select` shadows; inset shadows approximated or dropped behind capability flag). Golden tests against **all 40 theme objects from `survey-core`'s `themes/index.ts`** (predefined-themes.json only has 38). | Theme JSON in, native styles out, zero consumer config. |
| A7 | **Hybrid styling bridge**: per-component **style recipes** keyed by model semantics + native interaction state (pressed/focused/RTL owned natively — web expresses these via SCSS pseudo-selectors that never surface as classes); **class-token mapping** used only where core-generated class strings carry model-derived state not otherwise exposed (checked/disabled/error/preview). Per-component metrics absent from theme JSON are hand-authored from v2.5.33 SCSS (source documented per token). RTL/direction primitive is an M1 foundation, not a Phase-6 retrofit. | Full BEM registry would add a second styling language without eliminating per-component logic. |
| A8 | **Plain StyleSheet + tokens.** No NativeWind (pre-release + consumer tailwind config), no Unistyles (consumer babel opt-in), no Tamagui (compiler weight). | Consumers need ZERO build-config changes. |
| A9 | **Overlay host primitive** = RN Modal-based, injectable (keyboard-aware, Android back-button, a11y) + **confirmation-dialog adapter** installing `settings.showDialog`/`confirmActionAsync` support (paneldynamic/matrixdynamic/file deletion flows call it; undefined → throw). No gorhom/bottom-sheet hard dep; reversible via injection seam. | Dropdown/tagbox/rating-dropdown/overflow + all delete-confirmation flows depend on it. |
| A10 | **Batteries-included dependency policy** (user decision): capability libs are **required peerDependencies** — `react-native-svg`, `react-native-gesture-handler`, `react-native-reanimated`, `@react-native-community/slider`, `react-native-signature-canvas`, `expo-image-picker`, `expo-document-picker`, HTML renderer (**lib selected in M0** — needed by M1 rich text, not just the html question), `expo-video`. One documented `npx expo install` line; every question type works after it. Internally lazy-require where possible. | Single-install drop-in. HTML renderer choice can't wait for Phase 5: titles/descriptions/completed-page are HTML-bearing. |
| A11 | **Security defaults restrictive AND enforced pre-side-effect**: for the `json` prop, URLs (`choicesByUrl`, images, video) are validated against the scheme/origin policy BEFORE `new SurveyModel(json)` (core fires choice requests at model construction/attach); the `model` prop is documented as **trusted/prevalidated by the host**. Central URI-policy module shared by HTML links, WebView, images, file handling. HTML sanitized. Never auto-open `navigateToUrl`/redirects — events surface, host decides. | `ChoicesRestful` opens the request before `onBeforeRequestChoices`; render-time enforcement is too late. |
| A12 | **API surface**: named `<Survey>` accepting `json` XOR `model`, `theme` (ITheme), style overrides, event props derived from actual `EventBase` members; `SurveyRef` = `{model, focus/scroll helpers}`; re-export survey-core conveniences + RN factories. **Classified-drift API gate** via surveyjs-doc-generator (`compatible | native-replacement | intentionally-unsupported`; CI fails on unclassified drift) plus the runtime-template manifest (A4). | Drop-in ≈ semantics parity, not blind DOM-export parity. |
| A13 | **TDD mandatory** — red-green-refactor per task; jest-expo + @testing-library/react-native; model-JSON fixtures reused from survey-library's test suites; every bugfix lands with a regression test. | User rule. |
| A14 | Release gate every phase: packed tarball installed into a **stock Expo SDK 57 New-Arch app → full native prebuild + iOS/Android compile + launch smoke** (not just Metro bundle) + example-app e2e as an additional gate. | Metro bundling exercises neither CocoaPods/Gradle/autolinking nor New-Arch compilation. |
| A15 | **Native lifecycle bridge** (M1 foundation): question layout/ref registry inside `<Survey>`; intercepts core focus/scroll requests (invalid Next/Complete calls `Question.focus()` → `SurveyModel.scrollElementToTop()`, which destructures `settings.environment` — undefined in RN → throw). Covers invalid completion, page change, `focusQuestion()`, unmount cleanup. Also: shared **RNIcon + ActionButton primitives** consuming core icon sets + `settings.customIcons` (nav, overlays, matrix/panel actions all use icon names); **LocalizableString renderer** (sanitized rich text; subscribes `onStringChanged`, handles `renderedHtml`) used by titles/descriptions/choices/errors/completed-page. | Web renderer provides these via DOM lifecycle paths the plan otherwise omits. |

### Rejected as premature (do not reopen without measured failure)
Monorepo / adapter-package family; hooks rewrite; SCSS→RN compiler; NativeWind/Unistyles/Tamagui; mandatory bottom-sheet; comprehensive BEM class registry (hybrid recipes instead); generalized virtual-grid before profiling; native cookie-storage adapter for `cookieName`.

### Won't support in v1 (documented in DIFFERENCES.md with workarounds)
Creator/Dashboard/Analytics; string-editor + creator drag chrome; `flowpanel`; DOM refs / `afterRenderQuestionElement` HTMLElement contracts; arbitrary CSS class overrides / custom SCSS; web popup coordinate models; automatic URL redirects (event-driven instead); file drag-drop (pickers instead); DOM/jQuery custom widgets (RN factory registration instead); `cookieName` duplicate-completion cookies (host persistence pattern documented); XML `choicesByUrl` responses (JSON/text only — no DOMParser); hover/mouse/print semantics; `backgroundImageAttachment: fixed`; exact inset/multi-shadow fidelity; YouTube iframes (WebView/expo-video path documented).

---

## Phases → milestones → tasks

Sizing: S (≤half day), M (~1 day), L (2-3 days). `CORE` = orchestrator designs personally + llm-pairs the design before handoff.

### Phase 0 — Foundation (Milestone M0)

| ID | Task | Size | Notes |
|----|------|------|-------|
| 0.1 | Scaffold: `create-react-native-library` (JS-only) + example Expo SDK 57 app; expo-doctor clean; TS strict; ESLint; jest-expo + @testing-library/react-native | M | Follow react-native-app-creation rule |
| 0.2 | CI: lint, typecheck, unit tests; **release-gate job**: packed tarball → stock Expo 57 app → prebuild + native iOS/Android compile + launch smoke; **parameterized survey-core version-band matrix** | L | A1, A14 |
| 0.3 | `CORE` survey-core facade + env shims + `…/shim` subpath + import-order contract; require-time load tests under RN-shaped globals — packaged ESM + babel-CJS semantics × both import orders (design: `docs/design/0.3-core-facade.md`) | M | A2 |
| 0.4 | `CORE` Reactive base classes port + StrictMode/React-19 subscription tests (mount/unmount/resubscribe/tearing/model-swap) | L | A3 |
| 0.5 | `CORE` Factories + unsupported-type fallback + runtime-template coverage manifest (incl. `custom`/`composite` awareness) | M | A4 |
| 0.6 | `CORE` theme-core: ITheme→tokens resolver + golden tests vs 40 themes | L | A6 |
| 0.7 | `CORE` theme-rn: StyleSheet factories, Platform shadow mapping, SurveyThemeProvider + hybrid recipe/class-token bridge design | L | A6, A7 |
| 0.8 | doc-generator parity harness: classified-drift API gate + template manifest in CI | M | A12 |
| 0.9 | `CORE` HTML/rich-text strategy: select + vet HTML renderer lib (maintenance, New-Arch, sanitization), central URI-policy module design | M | A10, A11 |

### Phase 1 — v0.1 Survey shell + simple inputs (Milestone M1)

| ID | Task | Size | Notes |
|----|------|------|-------|
| 1.1 | `CORE` `<Survey>` root: json XOR model, pre-model URL validation (json path), applyTheme, owned-model dispose, SurveyRef, event props | L | A11, A12 |
| 1.2 | `CORE` Native lifecycle bridge: ref/layout registry + focus/scroll interception (invalid submit, page change, focusQuestion, unmount) | L | A15 |
| 1.3 | `CORE` Width-expression resolver: core row/element width grammar (`%`, `px`, `calc()`, `min()`, colSpan, startWithNewLine, gridLayoutColumns) → RN layout via onLayout math; documented supported grammar | L | Prereq for 1.4 |
| 1.4 | Page/Panel/Row/Element composition + responsive rows + RTL/direction primitive | M | A7 |
| 1.5 | RNIcon + ActionButton primitives (core icon sets, settings.customIcons) | M | A15 |
| 1.6 | LocalizableString renderer (onStringChanged subscription, sanitized rich text) + basic survey header (title/description/logo) | M | A15 |
| 1.7 | Question chrome: title/description/required/errors/comment area | M | |
| 1.8 | Navigation + progress bar + completion/completed-before/loading/empty states (HTML-bearing via 1.6) | M | |
| 1.9 | `CORE` Text draft/commit adapter (textUpdateMode semantics, external-change sync) | M | A5 |
| 1.10 | text question: all 13 inputTypes → native renderers/fallbacks, masks, min/max/step, maxLength | L | A5 |
| 1.11 | comment question (multiline, autosize, character counter) | S | |
| 1.12 | radiogroup + checkbox (selectAll/none/other/comment items, columns) | L | |
| 1.13 | boolean (switch + checkbox/radio modes) | S | |
| 1.14 | rating — button rows: numbers/stars/smileys | M | |
| 1.15 | expression question | S | |
| 1.16 | Accessibility pass over M1 components (roles/states/labels from model) | M | |
| 1.17 | Example app kitchen-sink + theme switcher; agent-device e2e smoke | M | |
| 1.18 | Release v0.1: gates (A14), README quick start, DIFFERENCES.md seed | M | |

### Phase 2 — v0.2 Popups + containers (Milestone M2)

| ID | Task | Size | Notes |
|----|------|------|-------|
| 2.1 | `CORE` Overlay host primitive (Modal, keyboard-aware, back-button, a11y, injectable) + list picker w/ search | L | A9 |
| 2.2 | `CORE` Confirmation-dialog adapter (`settings.showDialog`/`confirmActionAsync`; confirm/cancel/back/unmount-with-open) | M | A9, prereq 2.8 |
| 2.3 | dropdown (filter/search, choicesByUrl JSON/text, lazy load) | L | |
| 2.4 | tagbox (chips + multi-select picker) | M | |
| 2.5 | rating-dropdown mode + buttongroup overflow | S | |
| 2.6 | multipletext | M | |
| 2.7 | imagepicker (grid select, multi) | M | |
| 2.8a | paneldynamic base: model wiring + list mode + add/remove (uses 2.2) | L | split per review |
| 2.8b | paneldynamic carousel/progress mode | M | |
| 2.8c | paneldynamic tabs + adaptive overflow (popup action container) | M | |
| 2.9 | buttongroup | S | |
| 2.10 | image (static display, scaling modes) | S | |
| 2.11 | custom + composite question adapters (ComponentCollection fixtures) | M | A4 |
| 2.12 | Release v0.2 | S | |

### Phase 3 — v0.3 Matrix family (Milestone M3)

| ID | Task | Size |
|----|------|------|
| 3.1 | `CORE` Grid primitive: flex rows + horizontal ScrollView, header column, narrow-screen stacked fallback, focusable cells | L |
| 3.2 | matrix (single-choice grid) | M |
| 3.3 | matrixdropdown (nested cell questions via factories) | L |
| 3.4 | matrixdynamic (add/remove rows w/ confirmation, detail panels, validation summaries) | L |
| 3.5 | singleinputsummary + release v0.3 | S |

### Phase 4 — v0.4 Gesture types (Milestone M4)

| ID | Task | Size |
|----|------|------|
| 4.1 | `CORE` Drag-reorder primitive (gesture-handler + reanimated: cancellation, autoscroll, disabled, a11y move actions, model commit) | L |
| 4.2 | ranking: select-to-rank mode, then drag mode | M |
| 4.3 | matrixdynamic row reorder | S |
| 4.4 | slider: single-thumb (community slider) + dual-thumb custom | L |
| 4.5 | Release v0.4 | S |

### Phase 5 — v0.5–v0.9 Capability types (Milestone M5)

| ID | Task | Size |
|----|------|------|
| 5.1 | signaturepad (react-native-signature-canvas; data-URL value parity) | M |
| 5.2 | file: expo pickers + camera; upload/clear/confirm events; size/type validation | L |
| 5.3 | html question (renderer from 0.9; sanitization + URI policy) | M |
| 5.4 | imagemap (react-native-svg hotspots) | M |
| 5.5 | image video mode (expo-video); YouTube-via-WebView documented pattern | S |
| 5.6 | Advanced header/cover (IHeader → ImageBackground + 3×3 grid) | M |
| 5.7 | timer panel; TOC/progress-buttons variants; notifier toast | M |
| 5.8 | Release v0.5+ increments | S |

### Phase 6 — v1.0 Hardening (Milestone M6)

| ID | Task | Size |
|----|------|------|
| 6.1 | Localization verification (survey-core i18n entry points) + RTL audit | M |
| 6.2 | Perf: large-survey/matrix fixtures, profiling; virtualization only if measured | L |
| 6.3 | Full a11y audit (VoiceOver/TalkBack) | M |
| 6.4 | Docs complete: DIFFERENCES.md, theming guide, custom-question guide, API reference, support matrix | L |
| 6.5 | v1.0 gates: native-compile tarball e2e both platforms, 40-theme goldens + screenshots, zero unclassified drift, version-band policy doc | M |

## Cross-cutting execution rules (mirrored in CLAUDE.md)

1. Orchestrator coordinates; agent team executes; `CORE` tasks designed by orchestrator + llm-paired before handoff.
2. llm-pair at plan/work-item-review/blocker boundaries.
3. TDD non-negotiable: failing test first, every task.
4. Token conservation: compact ~200k; sonnet-class agents for mechanical work; terse prompts/outputs.
5. Fixtures from survey-library's test suites; goldens for themes; regression test per bugfix.
