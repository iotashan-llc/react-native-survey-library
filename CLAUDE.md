# @iotashan-llc/react-native-survey-library

React Native rendering engine for the SurveyJS Form Library 2.x. Consumers import `<Survey>`, pass their existing SurveyModel JSON + Theme JSON **unmodified**, and get a native survey. Runtime/rendering only — no Creator, no Dashboard, no Analytics.

- Target: Expo SDK 57 (RN 0.86, React 19.2, New Architecture), iOS + Android only. No web (web users keep official `survey-react-ui`).
- npm: `@iotashan-llc/react-native-survey-library` (scoped). Public GitHub under `iotashan-llc`. MIT.
- Plan of record: `docs/IMPLEMENTATION-PLAN.md` (architecture decisions A1–A14, phases M0–M6, won't-support list). Read it before any task.
- Reference checkouts (read-only): `../survey-library` (SurveyJS v2.5.33 monorepo — `packages/survey-core`, `packages/survey-react-ui`), `../surveyjs-doc-generator`.
- Notion workflow: see `PROJECT-NOTION.md`. Tasks live in the unified Notion Tasks DB; advance Status as you work.

## Architecture invariants (do not violate without updating the plan doc first)

1. `survey-core` is an **unmodified peerDependency** (tested version band). Never fork, never patch-package it. All survey-core imports go through `src/core/facade.ts` (applies env shims first); ESLint enforces this. A zero-core-import `…/shim` subpath exists for consumers who import survey-core before the renderer.
2. Reactive binding is the ported class-based `SurveyElementBase` mechanism (model callbacks → setState). No hooks rewrite, no MobX, no external state lib.
3. All inputs are controlled components driven by the Question model, through the draft/commit adapter honoring `textUpdateMode` (never bind onChangeText straight to question.value).
4. Styling is plain `StyleSheet` + theme tokens. No NativeWind/Unistyles/Tamagui, no babel/metro plugins — consumers get zero build-config changes.
5. Theme pipeline: `theme-core` (pure ITheme→tokens, no RN imports) → `theme-rn` (tokens→styles). Golden-tested against the 40 themes exported by `survey-core`'s `themes/index.ts`.
6. Hybrid styling: per-component style recipes own native interaction state (pressed/focused/RTL); class-token mapping only for model-derived state (checked/disabled/error) from CssClassBuilder strings. Never duplicate core's model-state logic in components.
7. Capability libs (svg, gesture-handler, reanimated, slider, signature-canvas, expo pickers, expo-video, HTML renderer) are **required peerDependencies** — batteries-included. Internally lazy-require where possible.
8. Security: HTML sanitized, URL schemes allowlisted, no auto-navigation (`navigateToUrl` etc. surface via events; host app decides).
9. Unsupported question types render the non-throwing fallback component with structured diagnostics — never crash the survey.

## Development method — non-negotiable

**TDD, red-green-refactor, on every task.** Failing test written and observed failing BEFORE implementation code. Use the `superpowers:test-driven-development` / `tdd` skill flow. Test stack: jest-expo + `@testing-library/react-native`. Reuse survey JSON fixtures from `../survey-library`'s test suites where applicable. Every bugfix lands with a regression test. No task is "done" without its tests green and observed (run them; never claim unverified results).

## Orchestration model (multi-agent execution)

1. **The main session Claude is the orchestrator.** It coordinates, reviews, integrates — it does not grind every edit itself.
2. **Agent team executes tasks.** Match model/effort to task weight: sonnet-class agents for mechanical ports and well-specified tasks; stronger models only where design judgment is needed.
3. **llm-pair (skill) at the standard boundaries**: task planning, work-item completion review, blockers surviving 2+ fix attempts. Executing agents' plans and completed diffs get paired review per the skill's classifier.
4. **`CORE`-tagged tasks (see plan doc): the orchestrator designs these personally + llm-pairs the design, then hands the approved design to the team for TDD implementation.** Core architecture is never delegated blind.
5. **Token conservation is a standing requirement**: compact/summarize around **200k context — do not ride to 1M**. Terse agent prompts and outputs. Don't re-read large files into the main session when an agent can summarize. Batch tool calls.

## House rules

- No AI attribution anywhere (commits, PRs, docs, comments).
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Long-running commands (installs, builds, Metro, e2e) run in zellij panes per the global rule — never blind-backgrounded.
- iOS signing: personal team `3VPB4NZTQS` for example-app device builds.
- Simulator camera/e2e: SimCam + agent-device workflows per global rules.
- Verify before claiming done: run the tests/build, observe output, then report.
