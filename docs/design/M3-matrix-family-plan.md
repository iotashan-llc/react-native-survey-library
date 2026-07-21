# Milestone M3 — Matrix family (matrix / matrixdropdown / matrixdynamic)

Status: **FINAL design — revision 3 (source-verified)**. Consolidated from three
read-only research passes against survey-core 2.5.33 + survey-react-ui + this
repo (core-models, web-renderer, repo-reuse), corrected in revision 2 against a
source-verified design-approval review, and finalized in **revision 3** against a
last source-verified review that fixed: the renderedTable no-undefined-commit
lifecycle contract, immutable-`cell.question.uniqueId` leaf keys (rendered
`row.id`/`cell.id` are NOT universally stable), the explicit checkbox
`clickItemHandler(item, !isItemSelected(item))` toggle value, the floor-safe
largest-remainder width residual, the full no-question cell-kind precedence +
action-id mapping, the placeholder add-button `showAddRow` gate, single MatrixGrid
ownership, the width-resolver `WidthValue` wording, and the no-DOM
architecture-principle relabel. All model facts below are re-confirmed against the checked-in
survey-core 2.5.33 source and MUST still be re-confirmed by headless probe
through the facade during TDD (the 2.5/2.8a precedent). This doc is the orchestrator's `CORE`
design for the M3 family per CLAUDE.md orchestration rule 4; the 3.1 grid
primitive and its highest-risk sub-designs (below) require orchestrator +
`llm-pair` sign-off before implementation handoff.

Covers plan-of-record rows **3.1–3.5** (docs/IMPLEMENTATION-PLAN.md, Phase 3):
3.1 `CORE` grid primitive (L), 3.2 matrix (M), 3.3 matrixdropdown (L),
3.4 matrixdynamic (L), 3.5 singleinputsummary + release (S). Manifest already
carries `matrix`/`matrixdropdown`/`matrixdynamic` as `planned` M3 (tasks
3.2/3.3/3.4) and `matrixdropdownbase` as `internal-base`.

Depends ONLY on merged work: the SurveyRow/SurveyPanel/SurveyRowElement
composition (1.4), width-resolver (1.3), the native lifecycle bridge (1.2),
RNIcon + ActionButton (1.5), the 2.1 overlay host + `OverlayControlBase`
consumers (dropdown 2.3 / tagbox 2.4 / rating 2.5 / buttongroup 2.9), the 2.2
dialog adapter, and the factory/dispatch-key machinery (0.5). Matrix is a LATE
task by design: its cells compose nearly every prior question renderer.

---

## 0. The one architectural decision that shapes everything

survey-core precomputes the ENTIRE table topology for matrixdropdown +
matrixdynamic into **`question.renderedTable`** (`QuestionMatrixDropdownRenderedTable`,
`question_matrixdropdownrendered.ts`). The web renderer is a *dumb walker* over
`renderedTable.headerRow` / `renderedRows` / `footerRow`, emitting
`<thead>/<tbody>/<tfoot>/<td colSpan>`. But that abstraction is **DOM/table-shaped**
and violates the repo's **no-DOM / no-`afterRender` architecture principle**
(A-decisions / won't-support list — a design principle, NOT numbered invariant 8,
which is Security: HTML sanitized / URL allowlist): colspan semantics, `<td>` afterRender
(`afterRenderQuestionElement(el: HTMLElement)`), `MatrixRow.setRootElement(domNode)`
for focus + drag hit-testing, `RenderedRow.focusCell` via `querySelectorAll`, DOM
height animations, and a pure-DOM `DragDropMatrixRows` engine
(`closest`/`cloneNode`/`getBoundingClientRect`/`dataset`).

**Decision (family-wide):** RN CONSUMES `renderedTable` for its *derived,
non-DOM* flags and cell/row **kinds** (the model already flattened
transpose/colspan/ordering/which-cell-is-what), but BYPASSES its DOM/table
markup — laying the cells out with `View` rows + flex cells + a horizontal
`ScrollView`. Simple `matrix` has NO renderedTable; it walks
`visibleColumns` × `visibleRows` directly. A shared **`MatrixGrid` primitive
(3.1)** bridges both shapes behind ONE normalized contract, exactly as
`OverlayControlBase` unified dropdown/tagbox/rating/buttongroup behind one base.

---

## 1. Family shape & the shared rendering core

Three registered question types, two React roots + one shared base + one shared
layout primitive:

```
MatrixGrid (3.1, presentational primitive — NO survey-core coupling)
  ▲ consumes a normalized { columns, rows, renderCell, renderRowHeader, mobile } contract
  │
  ├── MatrixQuestion (3.2, "matrix")           extends QuestionElementBase
  │        builds the contract from visibleColumns/visibleRows; cells are
  │        radio/checkbox item tiles (row.cellClick / row.isChecked) — NO nested questions
  │
  └── MatrixTableBase (3.3, shared)            extends QuestionElementBase
           builds the contract from renderedTable; cells dispatch cell.question
           through the EXISTING factory (chrome-less); detail panels + totals
        ├── MatrixDropdownQuestion (3.3, "matrixdropdown")  = base, static rows, no add/remove
        └── MatrixDynamicQuestion  (3.4, "matrixdynamic")   = base + add/remove UI + empty state
```

`MatrixTableBase` is the direct analogue of `OverlayControlBase`: one base owns
the shared machinery (renderedTable subscription + reset, cell dispatch, column
widths, detail-panel rows, totals footer, mobile-card flip); per-consumer
protected hooks (`renderAboveTable()` / `renderBelowTable()` / `getEmptyState()`)
carry the differences (dynamic adds add-row buttons + placeholder; dropdown adds
nothing). Do NOT fork a second base — dropdown and dynamic swap the same base,
single chain.

### Why a normalized contract (not one grid per type)

`matrix` exposes `visibleRows: MatrixRowModel[]` / `visibleColumns: ItemValue[]`;
the dropdown pair expose `renderedTable.renderedRows[i].cells[j]` (rich
`QuestionMatrixDropdownRenderedCell` kind flags). `MatrixGrid` must not know
either shape. Each question type produces:

```ts
interface GridColumn { key: string; width?: string; minWidth?: string; header: ReactNode; isRowHeader?: boolean; }
interface GridCell   { key: string; span?: number; kind: 'question'|'panel'|'choice'|'title'|'actions'|'empty'; render(): ReactNode; }
interface GridRow    { key: string; kind: 'data'|'detail'|'footer'|'error'; cells: GridCell[]; getStateElement(): Base; }
interface GridContract { columns: GridColumn[]; rows: GridRow[]; showHeader: boolean; hasFooter: boolean; mobile: boolean; stickyFirstColumn: boolean; }
```

`width`/`minWidth` are core's raw CSS strings (`"120px"`, `"20%"`,
`columnMinWidth`, `rowTitleWidth`) that live on the core cells/columns. **ONE
class-based owner** — the question-renderer (see §3 "MatrixGrid ownership") —
reads them, resolves them once against the measured width (§3), and constructs the
canonical column slots; the presentational `MatrixGrid` receives the
ALREADY-RESOLVED dp array and resolves nothing. (So the `GridColumn.width`/`minWidth`
raw-string fields above are the OWNER's INPUT, read from core; the dp array is
MatrixGrid's INPUT.) This split is the CORE sub-design that lets one primitive serve
all three types and any future grid.

---

## 2. Dispatch — cells reuse the EXISTING question factory

The crux requirement. For matrixdropdown/matrixdynamic, each
`MatrixDropdownCell.question` is a **genuine `Question` instance** (core builds
it: `createQuestionCore` → `column.createCellQuestion(row)` → a real
`QuestionDropdownModel` / `QuestionTextModel` / `QuestionRatingModel` / … of the
column's resolved `cellType` — `dropdown|checkbox|radiogroup|tagbox|text|comment|boolean|expression|rating|slider`,
with `inMatrixMode=true`, `setSurveyImpl(row)`, and `readOnlyCallback` /
`validateValueCallback` wired). So a cell renders through the SAME per-type RN
renderer a top-level question uses:

- **A chrome-less dispatch helper** `renderCellQuestion(cellQuestion, creator)`
  mirrors `SurveyRowElement.renderInnerElement` (dispatch-key.ts
  `resolveQuestionDispatchKey` → `RNQuestionFactory.createQuestion(key, {question, creator})`
  → `createUnsupportedQuestion(...)` on a miss, invariant 9) — but does **NOT**
  wrap in `<QuestionChrome>`. The column header is the cell's title; per-cell
  title/description/comment chrome is suppressed (matches web's
  `SurveyQuestion.renderQuestionBody`). This resolves the repo-reuse open
  question: we do NOT rely on core setting `titleLocation:hidden` and the
  `QuestionChrome.renderElement` `question.hasTitle` gate — we bypass chrome
  entirely. **CRITICAL CONSEQUENCE (data-integrity):** error rendering in this
  repo lives ONLY inside the private `QuestionChrome.renderErrors` (reads
  `question.renderedErrors` + `currentNotificationType`); the per-type question
  bodies render NO errors of their own. So a chrome-less cell dispatch renders
  **zero** cell errors unless we render them ourselves — see §2a. This affects
  per-cell `isRequired`, `eachRowUnique`, and `keyName`/`isUnique` duplication
  (core adds `cell.question` errors via `isValueInColumnDuplicated` →
  `addDuplicationError` → `question.addError(new KeyDuplicationError(...))`),
  all of which would otherwise be INVISIBLE. The earlier framing ("bypassing
  chrome prevents double error rendering") was wrong: there is no per-type "own
  error slot" to double against — the risk is the opposite (dropped errors).
- A **dropdown cell** therefore renders through the registered
  `DropdownQuestionElement` (2.3) over the 2.1 overlay sheet; a **text cell**
  through `TextQuestion` (1.10) with its draft/commit adapter (invariant 3);
  **rating** through the 2.5 rating renderer; **boolean/comment/expression**
  through their renderers — all unchanged, all lazy-required capability libs
  intact.
- **OverlayContext flows for free** BECAUSE we dispatch through the registered
  *`…QuestionElement`* wrapper components (which `useContext(OverlayContext)`),
  not bare classes — the same wiring the 2.5 R4 fix established. `<Survey>`
  provides the `OverlayContext.Provider` at the root; nested cell dropdowns
  register their popups against it with no new overlay work. **Do not strip the
  context** when nesting.
- **Unsupported cellType** (e.g. `slider` before M4) → factory miss →
  `createUnsupportedQuestion` fallback + diagnostic in that one cell; the matrix
  never crashes (invariant 9).

### 2a. Cell errors — the `QuestionErrors` extraction PREREQUISITE (CORE)

Because chrome-less dispatch renders no errors (above), a **reusable error
renderer MUST be extracted before any cell dispatch lands**. This is a hard
prerequisite of 3.3a (phasing row **3.3a-pre**), not an afterthought.

- **Extraction (a REACTIVE, self-gating unit — invariant 2).** Pull the private
  `QuestionChrome.renderErrors` body (the `currentNotificationType` tone policy +
  the `renderedErrors.map` loop) into a reusable **class component**
  `QuestionErrors extends SurveyElementBase` whose `getStateElement()` returns the
  `Question` it is given. It **subscribes independently** to that question — the
  same `["errors","visible"]` / `hasVisibleErrors` notifications core fires
  (verified: `hasVisibleErrors` is a real `@property` on `SurveyElement`, and the
  web error row self-subscribes to it via `registerFunctionOnPropertyValueChanged("hasVisibleErrors", …)`,
  `question_matrixdropdownrendered.ts:236-240`) — so an error appearing or clearing
  on a cell question re-renders the inline errors WITHOUT the table base having to
  know. A static helper would NOT be reactive on its own, so the extracted unit is
  a component, not a pure function. It **returns `null` unless the question has
  visible errors** — preserving `QuestionChrome`'s existing gate
  (`hasVisibleErrors`, `QuestionChrome.tsx:222-224`, feeding
  `showErrorsAbove`/`showErrorsBelow`). `QuestionChrome` then consumes the same
  unit for its own above/below error render (no behavior change to the chrome
  path; its existing test stays green). This is the ONLY new coupling required to
  make cell errors visible.
- **Where the cell dispatcher renders them.** The chrome-less cell dispatcher
  renders `<QuestionErrors question={cell.question}/>` **inline, directly under
  the cell body** in TWO cases, matching exactly where core surfaces the cell
  question's error:
  - for **every non-choice question cell** (`isChoice === false` and
    `isActionsCell === false`) — one inline error block under that cell body; and
  - **exactly once per exploded choice group, at `isFirstChoice`** — because a
    `showInMultipleColumns` explosion shares ONE `cell.question` across its N
    choice cells and core attaches that shared question's error to the
    `isFirstChoice` cell only (`createErrorRow` builds the error cell at
    `cell.isFirstChoice`, else an empty cell —
    `question_matrixdropdownrendered.ts:829-846`; web gates identically:
    `getShowErrors() = isVisible && (!isChoice || isFirstChoice)`,
    `reactquestion_matrixdropdownbase.tsx:372-376`). Rendering the choice group's
    error only for non-choice cells (the earlier posture) would DROP required /
    `eachRowUnique` / `keyName` errors on exploded choice columns entirely.
  This is the v0.3 posture (§4): the separate top/bottom error row
  (`cellErrorLocation`) collapses to inline.
- **Explicitly ignore core's rendered error cells/rows — do NOT walk them.** The
  renderedTable already materializes core's DOM error affordances that we must
  **skip entirely** so errors are neither doubled nor dropped:
  - Desktop: a separate `QuestionMatrixDropdownRenderedErrorRow`
    (`isErrorsRow === true`) is injected above/below the data row
    (`showCellErrorsTop`/`showCellErrorsBottom`).
  - Mobile: `addHorizontalRow` interleaves per-cell error cells
    (`isErrorsCell === true`, `hasQuestion === false`) into the row.
  The RN walker MUST filter out `row.isErrorsRow` rows and `cell.isErrorsCell`
  cells (skip them — they are the web's error surfacing, which we replace with
  the inline `QuestionErrors` render). The `cell.question` object each error
  cell/row points at is the SAME instance already dispatched in the data cell (or,
  for an exploded choice group, in that group's `isFirstChoice` data cell), so
  rendering `QuestionErrors` once — under the data cell for non-choice, under the
  `isFirstChoice` cell for a choice group — is exact parity with no duplication
  and no drop.
- **Duplication / `keyName`.** `keyName` and per-column `isUnique` route errors
  onto the individual `cell.question` via `addDuplicationError` (a
  `KeyDuplicationError` carrying `keyDuplicationError` text). Because the error
  lives on the cell question and we now render `QuestionErrors` over that
  question inline, duplication errors surface for free — verified by the §3.4
  duplication regression test. `keyName` / `keyDuplicationError` /
  `isValueInColumnDuplicated` / `getDuplicationError` / `KeyDuplicationError`
  are added to the api-surface watchlist (§6).

### 2b. Cell kinds — whole-question dispatch vs `showInMultipleColumns` `'choice'` cells

Not every rendered data cell is a whole question. When a column sets
`showInMultipleColumns` on a checkbox/radiogroup cellType (and it
`isSupportMultipleColumns`), core **explodes** that one column into N rendered
cells that **share ONE `cell.question`** (`createMutlipleEditCells` →
`createEditCell(cell, choices[i])` → `res.question = cell.question`,
`res.item = choices[i]`, `res.choiceIndex = i`;
`question_matrixdropdownrendered.ts:1050-1089`). Dispatching the whole question
per choice cell would render the entire checkbox/radiogroup N times and break
selection. But note two aliasing traps in `cell.isChoice` (which is simply
`!!this.item`, `question_matrixdropdownrendered.ts:77-79`): a **row-actions cell
also carries `item`** (an `ItemValue` wrapping its `ActionContainer` —
`getRowActionsCell` sets `cell.item = itemValue; cell.isActionsCell = true`,
`:714-731`), so `isActionsCell` is true AND `isChoice` is true for it; and the
`isCheckbox`/`isRadio` getters are gated on `isItemChoice = isChoice &&
!isOtherChoice` (`:80-90`), so the **Other choice cell** (`isOtherChoice`, set in
`createEditCell` when `choiceItem === cell.question.otherItem`, `:1081-1089`) is
`isChoice === true` yet has **neither `isCheckbox` nor `isRadio`**. Cell
normalization must therefore resolve kinds in this precedence — **ALL no-question
structural cells are classified FIRST** (a data cell is dispatched as a question
only after these are excluded), verified against `hasQuestion = !!question &&
!isErrorsCell` (`question_matrixdropdownrendered.ts:52-54`). The existing
choice/question case numbers (referenced elsewhere as "case 2" / "case 4") are
preserved:

0. **No-question NON-action structural cells (before everything else).** A cell
   with `hasQuestion === false` is never a question dispatch and never an item:
   a. **`isDragHandlerCell`** (`getRowDragCell`, `:688-696`) → `GridCell.kind ===
      'drag'` — inert/hidden in v0.3 (§3f), sized `ACTIONS_COL_DP` (§3a.3e).
   b. **`isEmpty`** (empty / leading filler, `:37`, `:692`) → `GridCell.kind ===
      'empty'` — a contentless spacer sized to its slot.
1. **`isActionsCell`** (STILL a no-question cell — caught before any `isChoice` item
   path) → `GridCell.kind === 'actions'`. `isActionsCell` cells ALSO carry `item`
   (so `isChoice` is true) but `hasQuestion` is false, which is exactly why they
   resolve here, never as a choice item. Core builds them as `cell.item =
   new ItemValue(actionContainer); cell.isActionsCell = true` (`getRowActionsCell`,
   `:714-731`). **Action mapping** (plain themed buttons — do NOT build an
   `AdaptiveActionContainer`; §3e, DIFFERENCES 6): iterate
   `(cell.item.value as ActionContainer).actions` and dispatch by `action.id`
   (verified `setDefaultRowActions`, `:766-829`), slotting each at start vs end per
   `action.location`:
   - **`"remove-row"`** (`location:"end"`; present only when core's
     `hasRemoveRows && canRemoveRow(row)` already pushed it — text and
     `showRemoveButtonAsIcon` variants share the id) → themed remove button;
     `onPress` invokes the action's own `action()`, which routes to
     `matrix.removeRowUI(row)` → 2.2 dialog adapter (§3e).
   - **`"show-detail"`** (desktop, `location:"start"`,
     `component:"sv-matrix-detail-button"`) / **`"show-detail-mobile"`** (mobile,
     `location:"end"`) → themed detail-toggle button; `onPress` invokes
     `row.showHideDetailPanelClick()` (the mobile action wires this as its `action`;
     the desktop one is component-driven, so RN calls `showHideDetailPanelClick()`
     directly). Title from the action's `ComputedUpdater` (show/hide details).
   - **any other `action.id`** (custom actions from
     `survey.getUpdatedMatrixRowActions` / `onGetMatrixRowActions`) → v1 UNSUPPORTED
     (DIFFERENCES 6): render nothing for that action, never crash; overflow-to-popup
     is likewise unsupported.
2. **`isChoice === false`** (⇒ `hasQuestion === true`) → `GridCell.kind === 'question'`:
   whole-question dispatch via `renderCellQuestion` (§2) + inline `QuestionErrors`
   (§2a). Default. **(case 2)**
3. **`isChoice === true && isOtherChoice`** → route to a **controlled Other-comment
   adapter** (the existing `OtherCommentDraftAdapter`, invariant 3), NOT an item
   button — this cell edits the shared question's `otherValue`/comment, not a
   selectable item.
4. **`isChoice === true && (isCheckbox || isRadio)`** → `GridCell.kind === 'choice'`:
   a distinct render path emitting **ONE radio/checkbox item per cell** (not the
   whole question), reusing the `ChoiceItemRow` item recipe. **(case 4)**

The choice-cell (case 4) render path is a **CLASS-BASED reactive wrapper**
(`MatrixChoiceCell extends SurveyElementBase`, `getStateElement()` returns the
**shared choice `cell.question`**) — invariant 2. It observes that one shared
question's value / enabled-item / error notifications, so selecting an item in
one exploded cell re-renders the whole exploded group's checked state correctly.
It is driven by the REAL select-base APIs (verified — there is **no**
`cell.question.isChecked`; the earlier `isChecked(item)` was invented, `isChecked`
is only a local variable inside core's per-item render options):
- `cell.item` — the `ItemValue` this cell represents;
- `cell.isCheckbox` / `cell.isRadio` — which control to draw;
- `cell.choiceIndex` / `cell.isFirstChoice` — position; `isFirstChoice` is where
  core attaches the shared question's error, rendered inline there per §2a;
- **selection state:** `cell.question.isItemSelected(cell.item)`
  (`question_baseselect.ts:2134-2136`);
- **write (EXPLICIT next-checked value — verified):** the two select bases have
  DIFFERENT `clickItemHandler` signatures, so the choice cell must branch by
  `cell.isCheckbox`/`cell.isRadio`:
  - **checkbox cell** → `cell.question.clickItemHandler(cell.item,
    !cell.question.isItemSelected(cell.item))` — the two-arg toggle form
    (`question_checkbox.ts:199-201`: `clickItemHandler(item, checked?)` →
    `selectItem(item, checked)`); the EXPLICIT next-checked boolean is REQUIRED
    (core does not compute the toggle for you). Mirrors `src/components/Checkbox.tsx:54-58`
    exactly (`const checked = !question.isItemSelected(item);
    question.clickItemHandler(item, checked)`).
  - **radiogroup cell** → `cell.question.clickItemHandler(cell.item)` — the
    single-arg select-only form (`question_radiogroup.ts:67-68`:
    `clickItemHandler(item)` → `selectItem(item)`, no toggle-off), mirroring
    `src/components/Radiogroup.tsx:31-33`. NEVER a hand-rolled toggle;
- **enabled / readonly:** `cell.question.getItemEnabled(cell.item)` +
  `cell.question.isInputReadOnly` (`question.ts:1756`);
mirroring web `renderCellCheckboxButton` / `renderCellRadiogroupButton`
(`reactquestion_matrixdropdownbase.tsx:419-440`).

Two `ChoiceItemRow` adjustments (verified: `ChoiceItemRow` **always** renders
`item.text` and exposes **no** cell a11y-label prop — `ChoiceItemRow.tsx:52-65`,
`:190-205`): (a) **hide the duplicated item caption** — web sets
`hideCaption={true}` on the exploded item button (core also flags
`item.hideCaption = true` in the cell's `item` setter, `:70-76`) because the
column header already carries the choice text, so `ChoiceItemRow` (or the choice
cell) must suppress its caption in matrix-cell mode; (b) **pass the synthesized
cell label** — web supplies `ariaLabel={getCellAriaLabel()}`
(`reactquestion_matrixdropdownbase.tsx:431`; core `getCellAriaLabel`,
`martixBase.ts:234`) — the choice cell must accept and apply that
`accessibilityLabel` (a new optional prop on `ChoiceItemRow` or on the wrapper).

**`columnColCount` does NOT arrange already-exploded cells.** `createMutlipleEditCells`
emits exactly one cell per choice with no per-cell column layout
(`:1050-1067`); `colCount` (column-level, defaulting to the matrix
`columnColCount`) is only ever applied to the **un-exploded child question's own
`cellQuestion.colCount`** (`matrixDropdownColumnTypes` checkbox/radiogroup
`onCellQuestionUpdate: cellQuestion.colCount = column.colCount > -1 ?
column.colCount : question.columnColCount`, `question_matrixdropdowncolumn.ts:92-104`).
So: for an **exploded (`showInMultipleColumns`) choice column**, each choice is its
own grid column governed by the shared column-width array (§3a.3) — do NOT apply
`columnColCount` to the exploded layout; for a **whole-question (un-exploded)
checkbox/radiogroup cell** (case 2), `colCount` is already baked into that child
question and the standard `Checkbox`/`Radiogroup` renderer honors it — nothing for
the matrix to do. The normalized `GridCell.kind === 'choice'` (§1) carries case 4
into `MatrixGrid`; the header for an exploded column is the individual choice text
(core sets it).

Resolves open question §11.2 (honor, since core already flattens the explosion
into renderedTable cells).

Simple `matrix` is the exception: it nests NO sub-questions. Cells are
radio/checkbox item *tiles* — reuse the item recipe + a `Pressable` driving
`row.cellClick(column)` / `row.isChecked(column)` (controlled selection through
the model), NOT full question components. `hasCellText` (rubric) mode renders a
tappable display-text cell (`getCellDisplayLocText`) instead of an input tile.

### Value flow (never bind a cell to matrix.value)

Cell question value change → `row.setValueCore` → `data.onRowChanging`
(validation/`cellValueChanging`) → matrix `setNewValue` + `onCellValueChanged`.
The renderer NEVER reads/writes `question.value` for cells; it lets each cell
question own its value and routes through `row.value` get/set. Three value
shapes exist and are core's problem, not ours: matrix `{rowVal: colVal|[colVals]}`,
matrixdropdown `{rowVal: {col:val}}`, matrixdynamic `[{col:val}]`.

---

## 3. RN grid strategy (no `<table>`)

`MatrixGrid` (3.1) is a presentational `SurveyElementBase`-free View tree fed the
normalized contract + a resolved column-width array. Two render paths chosen by
`contract.mobile`:

**MatrixGrid ownership (stated once, canonical — supersedes any wording elsewhere).**
There is exactly ONE class-based owner of measurement, width resolution, and slot
construction: the **question-renderer class** — `MatrixQuestion` for simple matrix,
and the INNER `MatrixTable` (§4) for the dropdown/dynamic pair (the class that
already owns the model / `renderedTable` subscription). That owner:
- hosts the **outer pre-scroll root View** and its `onLayout`, and holds the
  `measuredWidth` **one-frame layout state** (§3a.2 — measure ONLY that outer root,
  never a `width>0`-gated box inside the horizontal ScrollView content); `MatrixGrid`
  renders INSIDE that outer root, so the measure View is the owner's, not the grid's;
- runs the **column-width allocation algorithm** (§3a.3) and constructs the
  **canonical column slots + resolved dp array + summed content width**, including
  the header-absent and transposed / vertical shapes;
- passes a **fully-resolved presentational `GridContract`** (dp widths, summed
  content width, ordered slot array, `renderCell` thunks) DOWN to `MatrixGrid`.
`MatrixGrid` is purely presentational: it renders the horizontal ScrollView + flex
rows/cells from the resolved contract, holds NO layout state, and resolves NOTHING.

### 3a. Wide path — flex grid inside a SINGLE horizontal ScrollView

The 3.1a baseline is deliberately the LOW-risk shape: one horizontal `ScrollView`
whose content is the whole grid — the row-header column lives **inside** the
scroll content as each row's first cell, NOT in a separate fixed pane. There is
NO split-pane and NO height-sync in the baseline; each row is one flex View whose
cells share the resolved dp width array, so natural per-row flex height keeps
every cell in a row the same height for free. Sticky-first-column is a deferred
3.1b enhancement (§3a.5), gated on measured acceptability. This removes the
highest-risk mechanism from the critical path.

1. **No table primitives.** Each row is `<View style={{flexDirection:'row'}}>`;
   each cell is `<View style={{width: dp}}>`. A `span>1` cell (colspan) becomes a
   single View summing the spanned column widths; a full-width row (detail/footer
   empty span) ignores per-column widths.

2. **The measurement contract (CORE — verbatim `SurveyRow` device-bug lesson).**
   Available width is measured on the grid's **OUTER, pre-scroll root View
   ONLY** — the View that wraps (and is the parent of) the horizontal
   `ScrollView`. That outer View inherits a concrete dp width from its
   `SurveyRowElement` / `QuestionChrome` ancestor, so its `onLayout` reports a
   real width on the first committed frame. We MUST NOT read width from any box
   **inside** the horizontal ScrollView's content: ScrollView content sizes to
   its children (intrinsic content width), so a `width>0`-gated box in there
   measures 0, the one-frame defer never fires, and the grid renders blank — this
   is exactly the `SurveyRow.tsx` device bug. State of the world: `measuredWidth`
   comes from the outer root; the ScrollView content is free to overflow it.

3. **Column-width allocation algorithm (CORE — 3.1a deliverable).** Replaces the
   previous hand-wave. The 1.3 width-resolver only evaluates a single value vs one
   `percentBase`; the matrix-specific *distribution across columns* is new code
   (proposed `src/layout/matrix-column-widths.ts`, pure TS, unit-tested):

   a. **Read raw width AND minWidth per column** exactly as core's renderedTable
      does, so RN and web agree on inputs. Core's `setCellWidth`
      (`question_matrixdropdownrendered.ts:1161-1166`) stamps BOTH fields on every
      cell, and web applies BOTH (`if (cell.width) style.width = cell.width; if
      (cell.minWidth) style.minWidth = cell.minWidth` —
      `reactquestion_matrixdropdownbase.tsx:169-172`):
      - **Data column:** `rawWidth = column.width`; `rawMin =
        matrix.getColumnWidth(column)` = `column.minWidth || matrix.columnMinWidth
        || settings.matrix.columnWidthsByType[column.cellType]?.minWidth || ""`.
      - **Row-header column:** BOTH `rawWidth` and `rawMin` = `matrix.getRowTitleWidth()`
        (core sets `cell.minWidth = cell.width = getRowTitleWidth()` — `rowTitleWidth`
        is simultaneously a fixed width AND a floor; it is NOT floorless).
      There is a **per-cellType default minWidth table**:
      `settings.matrix.columnWidthsByType` ships `{ file:{minWidth:"240px"},
      comment:{minWidth:"200px"} }` in 2.5.33; everything else defaults to no
      floor. The RN allocator reads the same `settings.matrix.columnWidthsByType`
      map through the facade (do NOT hardcode; it is consumer-overridable) plus
      the `matrix.columnMinWidth` global.
   b. **Evaluate BOTH raw values** through the repo resolver
      `evaluateWidthExpression(raw, percentBase)` (`src/layout/width-resolver.ts:430`),
      whose ACTUAL return type is `WidthValue = {kind:'dp'|'auto'|'unset'|'invalid'}`
      (`:54-58`) — there is **NO separate `'%'-resolved` kind**: a `%` input is
      resolved INTO dp against `percentBase` inside the parser (`(v/100)*percentBase`,
      `:275-277`) and returns `{kind:'dp'}` (`percentBase = measuredWidth`, §3a.2). So
      the allocator cannot (and need not) distinguish a `%`-origin dp from a px-origin
      dp — both arrive as `{kind:'dp'}` and are treated identically as a FIXED dp
      width. Then reduce each column to ONE effective spec:
      - **`effFixed = max(clamped width, clamped minWidth)`** whenever `width`
        resolves to `{kind:'dp'}` (px-origin OR `%`-origin) — a fixed column's
        minWidth still raises its floor, so `width:50 / minWidth:100 → 100` (NOT 50;
        excluding a fixed column's own minWidth was the revision-1 bug).
      - **`floored`** = `width` is `auto`/`unset`/`invalid` but `minWidth` resolves to
        `{kind:'dp'}` (`effFloor = minWidth`).
      - **`auto`** = neither width nor minWidth resolves to `{kind:'dp'}`.
   c. **Two regimes** (let `S = Σ effFixed(fixed cols) + Σ effFloor(floored cols) +
      Σ intrinsic(auto cols)` where auto intrinsic is the default in (e)):
      - **(a) Fit — `S ≤ measuredWidth`:** run an **iterative water-fill** to make
        the grid exactly fill `measuredWidth` (deterministic, order-independent):
        1. `growable` = floored + auto columns (fixed columns are frozen at
           `effFixed`); each growable starts at its floor (`effFloor`, or the auto
           intrinsic).
        2. `slack = measuredWidth − Σ(all current widths)`. While `slack > 0` and
           `growable` non-empty: add `slack / |growable|` to every growable column
           equally (all growables share the same cap-free growth, so a single pass
           settles — there is no per-column max, unlike a classic capped water-fill,
           so ONE equal split exhausts the slack). This makes the split
           order-independent and deterministic.
        3. **All-fixed underfill policy:** `growable` is EMPTY only when **every
           column is fixed** (`effFixed`, whether px- or `%`-origin). Since floored
           AND auto columns are BOTH growable (step 1), the presence of ANY floored
           or auto column makes water-fill apply — the earlier
           "fixed/floored-with-no-auto" wording was self-contradictory because a
           floored column IS growable. When growable is empty and `S <
           measuredWidth`, the grid is narrower than the viewport: do **not** stretch
           fixed columns; leave them at `effFixed` and let the grid sit logical-start
           (A7) within `measuredWidth` — the trailing space is empty. (Matches web:
           fixed `<td>` widths are honored; the table does not stretch them.)
        4. **Rounding-residual policy (FLOOR-SAFE largest-remainder — never drops a
           column below its floor).** Applying a *signed* residual to the "last
           growable column" (the revision-2 wording) can push it BELOW its effective
           floor, violating no-shrink. Instead distribute deterministically:
           i.   Take each column's real (fractional) target from steps 1–3 (fixed
                frozen at `effFixed`; growables at their water-filled real width).
                Snap every effective floor to an integer first (`effFloor_i =
                floor(effFloor)`, `effFixed_i = floor(effFixed)`) so each floor is an
                integer lower bound.
           ii.  **Floor every column DOWN** to integer dp: `w_i = floor(target_i)`.
                Because `target_i ≥ effFloor` and the floor is integral, `w_i ≥
                effFloor_i` — no column is below its floor after flooring.
           iii. `leftover = measuredWidth − Σ w_i`, a NON-NEGATIVE integer in
                `[0, |growable|)` (flooring only removed fractional dp, and in regime
                (a) `Σ target_i = measuredWidth` exactly).
           iv.  Hand out the `leftover` dp **one at a time (+1 each)** to the
                **growable columns ONLY**, ordered by DESCENDING fractional remainder
                `frac_i = target_i − floor(target_i)`, ties broken by ASCENDING column
                slot index (fully deterministic / order-independent). Fixed columns
                never receive a +1 (they stay at `effFixed_i`). A +1 only ever RAISES
                a growable column already at/above its floor, so **no column falls
                below `effFloor`/`effFixed`**, and `Σ w_i = measuredWidth` exactly —
                header/body/footer stay pixel-aligned.
           v.   **All-fixed underfill:** if `growable` is empty (step 3), there is no
                column to receive the leftover — it stays as trailing empty space
                (grid sits logical-start), never stretched into a fixed column.
           In regime (b) overflow each column is simply floored to integer dp (no
           residual to distribute — the grid overflows and exact viewport-fill is not
           required); the SAME floored dp per column is stamped on header/body/footer
           and `Σ` is the summed content width.
      - **(b) Overflow — `S > measuredWidth`:** **no shrinking.** Each column takes
        its intrinsic width (`effFixed`, `effFloor`, or the auto intrinsic); the
        summed content width `Σ = S > measuredWidth` and the surplus **overflows
        into the horizontal ScrollView** (the user scrolls). Columns never collapse
        below their floor.
   d. **`percentBase` semantics stated explicitly.** In BOTH regimes `%` widths
      resolve against `measuredWidth` (the measured viewport — the DOM parity
      point). In regime (b) the content is wider than the viewport by construction,
      but a `%` column is still a fraction of the viewport, then the fixed/floored
      columns push total width past it — documented so authors know `%` is
      viewport-relative, not content-relative, in the overflow case.
   e. **Auto / action-column intrinsic width.** A floorless-auto data column has no
      core-supplied width, so RN needs a concrete intrinsic: **`AUTO_COL_DP = 120`
      dp** (a named `settings`-adjacent constant, revisitable), the same
      order-of-magnitude as core's per-cellType floors. The **actions column**
      (`isActionsCell`, §3e) and the **drag-handle column** (`isDragHandlerCell`,
      inert in v0.3) get a fixed **`ACTIONS_COL_DP = 48` dp** intrinsic sized to
      the themed button, never auto-grown. These feed `S` in (c) as their intrinsic.
   f. **One dp array + one summed content width, applied identically** to the
      header strip, every body row, and the footer row. Stamp the SAME per-column
      dp on each cell (`<View style={{width: dp}}>`) and set the row/grid content
      to the SAME summed content width (`Σ`) on all three bands so nothing shrinks
      differently — this is what guarantees column alignment with no browser table
      auto-layout, and it is why a colSpan cell (§3a.1) sums the exact spanned dp
      values. Recompute only when `measuredWidth` changes or
      `onRenderedTableResetCallback` fires (columns changed).

4. **`horizontalScroll` core property — decision.** Core exposes
   `@property() horizontalScroll` (invisible; toggles the `rootScroll` css that
   makes the wrapper overflow-scrollable). The RN baseline **always** wraps the
   grid in a horizontal ScrollView and does **not** consult `horizontalScroll`:
   in regime (a) the ScrollView is inert (content fits) so an always-present
   scroll affordance is a strict superset of core (it can only ever *add* the
   ability to scroll, never clip), and in regime (b) scrolling is required
   regardless of the flag. `horizontalScroll` is added to the api-surface
   watchlist (§6) for parity tracking and noted as intentionally-not-gated in
   DIFFERENCES; revisit only if a consumer needs to *disable* scrolling.

### 3a.5. Sticky first (row-header) column — DEFERRED optional 3.1b enhancement

RN has no CSS `position:sticky`. IF the single-ScrollView baseline proves
insufficient (row-header scrolls away on very wide tables and testing shows it
hurts usability), 3.1b adds a split-pane: a FIXED left pane holding the corner
header + each row's header cell, beside the horizontal ScrollView holding the
data columns (header strip + body sharing one horizontal scroll content). This
reintroduces the hard problem the baseline avoids — **bidirectional per-row
height synchronization**: the two panes' matching rows can differ in height
(nested questions, detail panels), so 3.1b must measure BOTH panes' row heights
(`onLayout`) and stamp `minHeight = max(leftHeight, rightHeight)` on **both**
panes' rows (not one-directional). This split-pane + bidirectional height-sync
is the bespoke, highest-risk mechanism and a `CORE` sign-off item (§7); it ships
ONLY if measured acceptable, otherwise the single-ScrollView baseline is the
shipped wide-screen behavior. Resolves open question §11.4.

### 3b. Narrow / mobile path — stacked cards

Engages when `question.isMobile` is true. `isMobile` is ALREADY fed by
`<Survey>` (`handleRootLayout`, `NARROW_BREAKPOINT=600` → deferred
`model.setIsMobile(narrow)`; fans out to `question.isMobile`) — no new
measurement wiring. `displayMode:"list"` forces mobile via
`martixBase.getIsMobile()`; `displayMode:"table"` forces non-mobile;
`"auto"` follows the survey flag. Note `isColumnLayoutHorizontal =
isMobile ? true : !transposeData`: mobile ALWAYS forces horizontal (→ cards,
safe), but on a wide screen `transposeData` genuinely inverts the layout — see
§3b.5.

Each data row → a **card** `View`: a vertical stack of `{columnLabel, cellContent}`
pairs. Labels come from `cell.showResponsiveTitle` / `cell.responsiveLocTitle`
(dropdown pair) or `column.locText` (simple matrix). For simple matrix the card
is the row title + its radio/checkbox choices. The per-row remove button + detail
panel live inside the card. This is the PRIMARY phone path; horizontal scroll is
the tablet/wide affordance. **v0.3 does not run a per-matrix `processResponsiveness`
measure loop** (unlike buttongroup 2.5b) — a wide matrix on a wide screen shows
the scroll grid, not cards. (Open question §8 + DIFFERENCES.)

> **Implementation amendment (3.1b, as-shipped).** The card path is a single
> `contract.mobile` branch INSIDE the presentational `MatrixGrid`
> (`render()` → `renderCards()`), keeping ONE primitive for both layouts —
> the OWNER never forks a card renderer. `MatrixGridRoot` short-circuits its
> measure/allocate defer when `contract.mobile` (cards need no dp geometry
> or horizontal ScrollView), so cards render on the first frame with no
> `onLayout` gate. The `{columnLabel}` is carried as a new optional
> `GridCell.label` node the OWNER attaches to every labelled cell
> (`cell.column.locTitle` for the dropdown pair — equivalently
> `responsiveLocTitle`; `column.locText` for simple matrix), styled with the
> recipe's `cardLabel` fragment; the row-header `title` cell becomes the
> card title (no label) and `actions` cells render at the card foot (no
> label). The card path REUSES the wide grid's per-cell `render()` thunks
> verbatim (chrome-less question dispatch / choice items / `QuestionErrors`
> / detail toggle / remove button) and the same `MatrixGridRowSubscriber`
> per-row subscription — no new reactivity, keys unchanged. **One deviation
> from "detail panel lives inside the card":** an expanded detail row is a
> distinct `renderedRow` (its own reactive `getStateElement`), so it renders
> as a full-width block IMMEDIATELY BELOW its data card
> (`matrix-card-detail-<rowKey>`), not nested inside the card container
> `View` — merging it would need a peek-ahead over the row list and would
> entangle the detail row's independent subscription with the card's.
> Recorded in DIFFERENCES ("Mobile stacked-card layout"). The **optional
> sticky-first-column split-pane + bidirectional height-sync** part of 3.1b
> (§3a.5, §7.5) remains DEFERRED — the single-ScrollView wide baseline is
> unchanged; only the mobile card path shipped here.

### 3b.5. Transposed / vertical layout (`transposeData:true` on a wide screen)

We CANNOT force horizontal on a wide screen — `isColumnLayoutHorizontal =
isMobile ? true : !transposeData`, so with `transposeData:true` (or
`columnLayout:"vertical"`) on a non-mobile screen the getter is **false** and
core builds a genuinely vertical `renderedTable` via `buildVerticalRows`
(columns become rows, rows become columns). The earlier "collapses to horizontal"
claim was wrong.

Decision (resolves open question §11.1): **faithfully render the vertical layout
in 3.3a**, do not fake horizontal. Because the walker consumes
`renderedTable.renderedRows` and core has already produced the correct
transposed cells, the RN grid just walks whatever `renderedRows` it is given —
the same flex-View grid renders a vertical table with no axis-swapping logic of
our own. The only constraints:

- Detect `isColumnLayoutHorizontal === false` while NOT mobile and render the
  vertical `renderedRows` as a **plain non-sticky grid** (the sticky-first-column
   3.1b enhancement does not apply to the transposed shape) + emit a **deferred,
  deduped diagnostic** (ImageQuestion/paneldynamic pattern) noting the layout is
  vertical, so any visual polish gaps are visible without crashing.
- The totals footer is absent in this mode (§3d — `showFooter` is false when
  `isColumnLayoutHorizontal` is false).
- Mobile is unaffected: `isMobile` forces horizontal, then the §3b card path
  takes over.

### 3c. Detail panels

`detailPanelMode` `underRow`/`underRowSingle` (base capability → 3.3). A rendered
detail row (`cell.hasPanel`) renders `<SurveyPanel element={cell.panel}/>` —
REUSING the existing SurveyPanel/SurveyRow composition verbatim (the paneldynamic
precedent). Toggle via the row's `showHideDetailPanelClick` (a detail button in
the actions cell); subscribe `row.onDetailPanelShowingChanged` for the
expand/collapse re-render. `underRowSingle` (one open at a time) is enforced by
core. In card mode the detail panel stacks inside the card.

**Detail-row topology (approved RN divergence — see §3g).** Note core does NOT
make a normal detail row full-width: `createDetailPanelRow`
(`question_matrixdropdownrendered.ts:910-943`) keeps a leading row-header slot
(`buttonCell`, `colSpans:2` when `hasRowText`) and an optional trailing actions
slot, and computes the panel cell's `colSpans = renderedRow.cells.length −
leading − trailing`; only design mode (`panelFullWidth = isDesignMode`, N/A in the
renderer) is truly full-width. RN v0.3 renders the detail panel **edge-to-edge
across the whole grid content width** (SurveyPanel owns its own layout and needs
no column alignment), which is a deliberate simplification of core's
leading/trailing-slot topology — recorded as an approved divergence in §3g /
DIFFERENCES 1, distinct from the footer which IS column-aligned.

### 3d. Totals footer row

`renderedTable.footerRow` / `hasFooter` (→ 3.3). Footer cells are `expression`
questions (`MatrixDropdownTotalCell` — `Serializer.createClass("expression")`
with `expression = totalType + "InArray"`, i.e. `sum/count/min/max/avgInArray` —
`question_matrixdropdownbase.ts:133-190`). Render them read-only through the
expression renderer (1.15), aligned via the shared column widths;
`totalText`/`getFooterText()` supplies any caption. Core's `buildFooter` builds
the footer **per column** (one edit cell per visible total column, `setCellWidth`
each — `question_matrixdropdownrendered.ts:580-614`); RN aligns each total cell to
its column via the shared dp array (§3a.3f) — the footer is NOT a single
full-width band (see §3g).

**Footer is present on mobile — it is suppressed ONLY in the wide transposed
layout (correcting revision 1).** Core gates the footer with
`renderedTable.showFooter = hasFooter && isColumnLayoutHorizontal`
(`question_matrixdropdownrendered.ts:352-356`), and
`isColumnLayoutHorizontal = isMobile ? true : !transposeData`
(`question_matrixdropdownbase.ts:1116-1118`). **Mobile forces horizontal**, so on
a phone `showFooter` is TRUE whenever `hasFooter`, and web DOES emit the footer on
mobile (`renderFooter`: `if (!table.showFooter) return null` else emit
`<tfoot>` — `reactquestion_matrixdropdownbase.tsx:69-78`). The ONLY layout where
`showFooter` is false is **non-mobile + `transposeData:true`** (the wide vertical
layout, §3b.5). Therefore:
- **Card mode (mobile) DOES show totals.** Because `showFooter` is true on mobile,
  the RN card path renders the totals as a **totals summary card** appended after
  the data cards (each `{columnLabel, totalValue}` pair, read through the same
  footer `MatrixDropdownTotalCell` expression questions) whenever
  `renderedTable.showFooter`. This is web parity — dropping totals on phones would
  be a data-visibility regression, not parity.
- **Wide transposed suppresses totals** — `showFooter` is genuinely false there
  (§3b.5); RN emits no footer/totals card in that layout, matching web.
The grid MUST read `renderedTable.showFooter` (not `hasFooter`) before emitting a
footer band OR a totals card. If profiling later makes the phone totals-card
undesirable, dropping it must be recorded as an **APPROVED data-visibility
divergence** in DIFFERENCES — NOT described as "web parity".

### 3e. Row add / remove (matrixdynamic, 3.4)

- Add buttons top/bottom driven by `renderedTable.showAddRowOnTop` /
  `showAddRowOnBottom` (core computes these from `showAddRow = !isDesignMode &&
  canAddRow && showTable`, honoring `getAddRowLocation()` —
  `question_matrixdropdownrendered.ts:399-421`) → themed `Pressable` /
  `ActionButton` calling **`addRowUI()`** (guards inside core). Caption
  `locAddRowText`; gated by `canAddRow` (ABSENT at `maxRowCount`) /
  `allowAddRows`. Drive the RN add buttons off `showAddRowOnTop` /
  `showAddRowOnBottom` directly (do NOT recompute the location).
- Per-row remove via the actions cell (`isActionsCell`) → **`removeRowUI(row)`**,
  which routes delete confirmation through core → `settings.showDialog` → the
  2.2 dialog adapter → OverlayHost (IDENTICAL to paneldynamic; renderer never
  builds the dialog). Gated by `canRemoveRows` / `canRemoveRow(row)` (honors
  `lockedRowCount` + the `matrixAllowRemoveRow` callback). NEVER raw `removeRow`.
- **Empty state — table visibility driven by `!renderedTable.showTable`; the
  placeholder's add button gates SEPARATELY on `renderedTable.showAddRow`.** Core
  computes `showTable = rows.length > 0 || isDesignMode ||
  !matrix.getShowColumnsIfEmpty()`, and `getShowColumnsIfEmpty()` simply returns the
  `hideColumnsIfEmpty` property (default `false`) —
  `question_matrixdropdownrendered.ts:399-421`, `question_matrixdynamic.ts:779-787`.
  So the columns/table are HIDDEN (→ placeholder) precisely when `hideColumnsIfEmpty`
  is **`true`** AND there are no rows (not design mode). The RN placeholder condition
  is **`renderedTable.showTable === false`**: render the `noRowsText` text
  placeholder. But whether ADDING is allowed is a DISTINCT question from whether the
  table is hidden — verified in `updateShowTableAndAddRow` (`:399-422`), which sets
  the standalone **`renderedTable.showAddRow = !isDesignMode && matrix.canAddRow`**
  WITHOUT the `showTable` factor (`:419`), whereas the in-table
  `showAddRowOnTop`/`showAddRowOnBottom` DO include `&& showTable` (`:406-421`) and
  are therefore FALSE while the table is hidden. Therefore:
  - The placeholder renders `noRowsText` **always** (when `showTable === false`), but
    its add button renders **only when `renderedTable.showAddRow` is true** — exactly
    the web placeholder gate (`SurveyQuestionMatrixDynamicPlaceholder`: `const
    showAddButton = matrix.renderedTable.showAddRow`,
    `reactquestion_matrixdynamic.tsx:100,103`). An empty hidden table with adding
    DISALLOWED (`canAddRow` false — e.g. at `maxRowCount` or `allowAddRows:false`)
    shows the text with NO add button.
  - Do NOT gate the placeholder add button on `showAddRowOnTop`/`showAddRowOnBottom`
    (both false in the hidden-table state, which would wrongly suppress the only way
    to add the first row). Those two drive the IN-TABLE top/bottom add buttons (the
    add-buttons bullet above) only when `showTable` is true.
  - When `showTable` is true (the default, `hideColumnsIfEmpty` false), the empty grid
    shows its header + the in-table add button(s) (per
    `showAddRowOnTop`/`showAddRowOnBottom`), no placeholder.
- Row **actions are plain themed buttons** (remove + detail toggle), NOT an
  `AdaptiveActionContainer` (no RN action-bar exists; PanelDynamic precedent).
  `onGetMatrixRowActions` custom actions + action overflow-to-popup are v1
  unsupported (DIFFERENCES).

### 3f. Row drag reorder — DEFERRED to 4.3

Plan-of-record places matrixdynamic reorder at 4.3 (M4, on the 4.1 drag
primitive). In 3.4 the drag-handle cell (`isDragHandlerCell`) renders inert /
hidden and `isRowsDragAndDrop` is assumed false (v0.3 state). Documented.

### 3g. Row topology — which rows are column-aligned vs full-width

Core does NOT treat "footer / detail / empty" uniformly, so the RN walker must
not either (this reconciles the revision-1 inconsistency that alternately called
the footer full-width AND per-column):

- **Footer row — COLUMN-ALIGNED.** `buildFooter`
  (`question_matrixdropdownrendered.ts:580-614`) pushes one edit cell **per visible
  total column** (plus leading/trailing action + row-text slots), each
  width-stamped via `setCellWidth`. RN normalizes the footer cells against the
  **same shared column dp array** (§3a.3f) so totals sit under their columns — the
  footer is NOT a single full-width band.
- **Detail-panel row — FULL-WIDTH (approved RN divergence).** Core keeps a leading
  row-header slot + optional trailing actions slot and spans the panel across the
  remaining `colSpans` (`createDetailPanelRow`, `:910-943`); RN v0.3 instead
  renders the SurveyPanel edge-to-edge across the grid content width (the panel
  owns its own internal layout and gains nothing from column alignment). Recorded
  in DIFFERENCES 1.
- **Empty / placeholder row — FULL-WIDTH.** The `noRowsText` placeholder (§3e)
  ignores per-column widths.

A colSpan (`cell.colSpans > 1`) data cell still sums the exact spanned dp values
from the shared array (§3a.1) so it stays aligned; only detail/empty rows opt out.

---

## 4. Reactivity (class-based SurveyElementBase — invariant 2)

No hooks-state. Retarget-safe subscription discipline transferred verbatim from
paneldynamic 2.8a (single-assignment callback fields, ONE stable bound handler
per callback calling `this.setState` — NOT `forceUpdate`; attach in
`componentDidMount`, detach/re-attach on question-identity change in
`componentDidUpdate`, clear-only-if-still-ours in `componentWillUnmount`; call
`super.*`).

- **Simple matrix** (`MatrixQuestion`): subscribe `visibleRowsChangedCallback`
  (add/visibility/order) + the base subscription to the question (value/css/loc).
  Each row is its own reactive sub-component (`MatrixSimpleRow extends
  SurveyElementBase`, `getStateElement() → row`) so a row-scoped change
  re-renders one row — the web `SurveyQuestionMatrixRow` (`getStateElement =
  row.item`) pattern, and the established per-row pattern (ButtonGroupItemRow,
  PanelDynamicItem, ImagePickerTile).

  > **Implementation amendment (3.2, as-shipped).** The reactive unit is
  > **per-cell** (`MatrixSimpleCell`) plus a **per-row-header** component
  > (`MatrixRowHeaderCell`) — there is NO `MatrixSimpleRow` row wrapper. The
  > merged 3.1a `MatrixGrid` primitive renders cells individually through
  > per-cell `render()` callbacks in the `GridContract`, so no single
  > component owns a whole row's markup to subscribe from; instead each
  > cell/row-header subscribes `getStateElements() → [row, row.item]` (the
  > `MatrixRowModel` for value/`hasError`, the backing `ItemValue` for
  > `enableIf` enabled-flips — the same pair of notification sources the web
  > per-row component covers via `getStateElement → row.item` plus its
  > `cellClick` setState). Behavior is equivalent, granularity finer: a
  > row-scoped change re-renders that row's cells rather than one row
  > wrapper.
- **Dropdown / dynamic** (`MatrixTableBase`) — a **two-level component split**,
  because `renderedTable` is an unstable state-element identity. `resetRenderedTable()`
  calls `resetPropertyValue("renderedTable")` (DESTROYS the old instance; the next
  read constructs a BRAND-NEW `QuestionMatrixDropdownRenderedTable`) and then
  `fireCallback(onRenderedTableResetCallback)`. It fires on column change,
  `isRequired` change, mobile flip, transpose, and rows add/remove. Subscribing a
  single component's `getStateElement()` to a `renderedTable` that is about to be
  replaced would leave the base attached to a dead instance. So:
  - **Pick ONE reset strategy — stable inner identity + explicit retarget, NOT a
    keyed remount (revision 1 specified BOTH, which React cannot do).** A keyed
    remount (`<MatrixTable key={renderedTable.id}/>`) and a `componentDidUpdate`
    detach-old/attach-new retarget are mutually exclusive: a key change unmounts
    the old inner and mounts a fresh one, so `componentDidUpdate` never runs to
    retarget, and every leaf is destroyed (losing focus, scroll, and uncommitted
    drafts). We choose the **stable-identity + retarget** path, matching the
    paneldynamic 2.8a discipline, and do NOT key the inner table on the
    renderedTable identity.
  - **OUTER component** (`MatrixTableBase`): `getStateElement()` returns the
    **stable `question`** (subscribes value/css/loc/`isMobile`), AND registers
    `onRenderedTableResetCallback → this.setState` (single-assignment field, one
    bound handler). On a reset callback it does NOT read the (now-destroyed)
    `renderedTable` during render; it passes a **reset signal** to the INNER (a
    monotonic `resetToken` bumped by the callback) plus a **stable key** (the
    OUTER's own identity, NOT the renderedTable's) so the inner instance PERSISTS
    across a reset. The freshly-created `renderedTable` is materialized OUT of render
    by the deferred ensure (render-purity bullet below) and picked up by the INNER
    in `componentDidUpdate`.
  - **INNER table component** (`MatrixTable`) — holds the **no-undefined-commit
    contract.** It keeps the **CURRENT `renderedTable` in its OWN instance state**
    (`this.state.table`), and `getStateElement()` returns that held instance. It
    **NEVER renders `undefined`.** On a reset (the `resetToken` prop changes, or the
    non-creating backing read momentarily returns `undefined`) it KEEPS RENDERING the
    prior `renderedTable` reference it already holds in `state.table` — it does not
    blank out. Only in `componentDidUpdate`, AFTER the deferred ensure has re-created
    the table (guarded by `isRendredTableCreated` / the non-creating
    `getPropertyValueWithoutDefault("renderedTable")` accessor — `base.ts:1292-1293`,
    render-purity below — which returns the LIVE new instance once creation has run),
    does it **swap atomically**: detach the subscription from the old table, set
    `state.table = <new live instance>`, attach to the new one (clear-only-if-
    still-ours on unmount). Because the swap goes in one committed update from a
    non-undefined old reference to a non-undefined new reference, **no intermediate
    commit ever renders an undefined table**, so cell leaves are never transiently
    unmounted. Leaves whose `cell.question` identity is UNCHANGED across the swap
    MUST NOT unmount — guaranteed by the immutable-`cell.question.uniqueId` keying
    (next bullet): the old and new renderedTable instances materialize their cells
    over the SAME surviving `Question` instances, so the leaves' keys are identical
    and React reconciles them in place (drafts, focus, scroll survive). This is the
    single, non-contradictory identity-retarget path.
  - **No-undefined-commit contract (explicit).** The INNER's render output is a pure
    function of `this.state.table`, which is ALWAYS a live
    `QuestionMatrixDropdownRenderedTable` (never `undefined`, never a half-built
    instance). The reset sequence is: (1) core `resetPropertyValue("renderedTable")`
    destroys the old instance and fires `onRenderedTableResetCallback`
    (`question_matrixdropdownbase.ts:1273-1283`); (2) OUTER `setState` bumps
    `resetToken` — INNER re-renders but STILL from its held (old-but-valid)
    `state.table`; (3) the deferred ensure (out of render) reads the `renderedTable`
    getter once, constructing the new instance; (4) INNER `componentDidUpdate` reads
    the now-live instance via the non-creating accessor and swaps `state.table`
    atomically. **TDD asserts an active `onBlur` draft AND cell focus survive a
    `renderedTable` reset** — no blank frame, no leaf unmount for unchanged
    `cell.question` identities.
  - **Leaf keys come from IMMUTABLE question identity — NOT `renderedRow.id` /
    `cell.id`, which are NOT universally stable/unique (source-verified).** The
    rendered ids regenerate or collide in exactly the cases matrix must survive:
    - `QuestionMatrixDropdownRenderedRow.id = getId(row?.id || uniqueId, …)`
      (`question_matrixdropdownrendered.ts:181-183`): a rendered row WITH a source
      `row` uses the stable `row.id`, but **transposed/vertical rows, the header row,
      and the footer row have NO source `row`** → they fall back to the rendered
      wrapper's `uniqueId`, a fresh `Base.UniqueId++` on every reconstruction
      (`base.ts:239,400`) — NOT stable across a reset.
    - `QuestionMatrixDropdownRenderedCell.id` (`:61-67`): a cell WITH a question keys
      off `question.id`, but a **no-question cell** (header / footer-slot / actions /
      drag / empty filler) uses `idValue = counter++` (a fresh per-instance counter
      assigned in the ctor, `:46-47`) — regenerates on reconstruction; and choice
      cells append `-index<choiceIndex>` / `-<item.id>`, so exploded footer/choice
      cells sharing ONE `cell.question` with `item` undefined can COLLIDE.
    Therefore key each leaf **primarily off immutable question identity** — the
    per-instance `cell.question.uniqueId` (a stable `Base.UniqueId++` captured at
    question construction, `base.ts:400`; it SURVIVES a renderedTable reset whenever
    the underlying `Question` is the same instance, so the leaf's React instance —
    and its draft/commit adapter — persists and the draft is not lost). For cells
    with no question, use a **composite stable key** = `rowKey + ':' + cellKind + ':'
    + columnSlotIndex` — never `cell.id` alone. Keying table per cell kind:

    | Cell kind | Key |
    |---|---|
    | non-choice question cell (`hasQuestion`, `isChoice===false`) | `cell.question.uniqueId` |
    | choice item cell (`isChoice`, `isCheckbox`/`isRadio`) | `cell.question.uniqueId + ':c' + cell.choiceIndex` |
    | Other-choice cell (`isOtherChoice`) | `cell.question.uniqueId + ':other'` |
    | footer total cell (expression question) | `cell.question.uniqueId` |
    | actions cell (`isActionsCell`) | `rowKey + ':actions:' + columnSlotIndex` |
    | drag-handle cell (`isDragHandlerCell`) | `rowKey + ':drag'` |
    | empty filler (`isEmpty`) | `rowKey + ':empty:' + columnSlotIndex` |
    | header cell (no question) | `'header:' + columnSlotIndex` |
    | footer no-question slot (row-text / actions filler) | `'footer:' + columnSlotIndex` |

    Row keying:

    | Row kind | Key |
    |---|---|
    | data row (has source `row`) | `renderedRow.row.id` (source-row id, stable across reset) |
    | detail row | `parentDataRow.row.id + ':detail'` |
    | transposed / vertical row (NO source row) | the **column identity it represents** — the matrix column's `name` (stable), NOT the regenerating `renderedRow.uniqueId` |
    | header row | `'header'` (exactly one) |
    | footer row | `'footer'` (exactly one) |

    Error rows/cells are filtered out entirely (§2a) and never need keys. Keying by
    array index would, on a FRONT insertion/removal, reuse a React instance across a
    DIFFERENT row's cell question — and because a controlled leaf (Text/Comment)
    builds its draft/commit adapter ONCE and does NOT retarget on a question-prop
    change (`Comment.tsx:76-84` — the adapter is constructed with `props.question`
    and never rebound in `componentDidUpdate`), an in-flight draft would be committed
    to the PREVIOUS row's question. Immutable-`cell.question.uniqueId` keys keep each
    leaf bound to its own question.
  - **Force a LEAF remount only when its `cell.question` identity actually changes.**
    Do not remount leaves on every reset; a reset that reuses the same `cell.question`
    instances must NOT discard their uncommitted drafts. Since the controlled-leaf
    adapter follows Question identity (invariant 3, §5) and the leaf is keyed off
    `cell.question.uniqueId`, a leaf is remounted (fresh adapter) only if its
    `cell.question` is a genuinely new instance — detected via the
    `cell.question.uniqueId` key, never row position and never the regenerating
    `cell.id`.
  - Each rendered ROW is its own reactive sub-component (`MatrixTableRow extends
    SurveyElementBase`, `getStateElement() → renderedRow`, plus
    `row.onDetailPanelShowingChanged`). Each CELL question is a real reactive
    question component (dispatched) that owns its value/error/visibility
    reactivity — the table base does NOT re-derive it.
  - **TDD must confirm the non-reset mutation path.** Core mutates
    `renderedTable.renderedRows` **in place** as a `@propertyArray` for the common
    cases (`onAddedRow` / `onRemovedRow` / detail-panel visibility) when a full
    reset is NOT required (`isRequireReset()` false) — web relies on the
    table-state-element array subscription firing WITHOUT `onRenderedTableResetCallback`.
    Verify at TDD that (a) these in-place `renderedRows` mutations notify the
    INNER `renderedTable` subscription and re-render, and (b) they do NOT
    spuriously fire the reset callback (which would remount and lose focus/scroll).
- **Render purity (CORE, transfer the 2.5/2.5fu lesson).** `renderedTable` is
  built LAZILY (`getPropertyValue("renderedTable", undefined, () =>
  this.createRenderedTable())` — `question_matrixdropdownbase.ts:1294-1296`);
  reading the getter during render would construct + subscribe inside a React
  render pass, firing core notifications into the D2/D4 guarded window.
  Materialize `renderedTable` OUTSIDE render — a deferred (one-microtask) ensure
  scheduled from `componentDidMount`/`DidUpdate` (StrictMode-safe latch reset on
  every remount, per 2.5 C1). **The non-creating backing accessor EXISTS and is
  already used by the matrix** — `Base.getPropertyValueWithoutDefault(name)`
  (`base.ts:771-774`), which the matrix itself calls in
  `isRendredTableCreated → !!this.getPropertyValueWithoutDefault("renderedTable")`
  (`question_matrixdropdownbase.ts:1292`). It is `protected`, so render +
  `getStateElements` read it through **one isolated facade-compatible cast**
  (the 2.5 R3 adapter pattern; peer floor `>=2.5.32 <2.6.0`) plus a behavioral
  compat test asserting it returns `undefined` before creation and the live
  instance after — resolving open question §11.3. No inert-placeholder fallback is
  needed (that branch is dropped now that the accessor is confirmed). This remains
  a `CORE` sign-off item.
- Error rows/cells: web self-subscribes via
  `registerFunctionOnPropertiesValueChanged(["errors","visible"], …)` (not the
  standard base path). RN renders **cell errors inline under the cell body**
  (v0.3) via the extracted `QuestionErrors` unit (§2a) over each `cell.question`,
  and the walker **explicitly filters out** core's rendered
  `QuestionMatrixDropdownRenderedErrorRow` (`isErrorsRow`) and per-cell error
  cells (`isErrorsCell`) so errors are neither doubled nor dropped. The
  reactivity that shows/hides an inline error is the cell question's OWN standard
  `["errors","visible"]` subscription (it is a real dispatched question
  component), so `MatrixTableBase` does not need the web self-subscription. The
  separate top/bottom error row (`cellErrorLocation`) collapses to inline
  (DIFFERENCES 5).

---

## 5. Architecture-invariant conformance (cite-by-number)

- **1 (facade):** every survey-core type — `QuestionMatrixModel`,
  `QuestionMatrixDropdownModelBase`, `QuestionMatrixDynamicModel`,
  `QuestionMatrixDropdownRenderedTable`, `MatrixDropdownCell`, etc. — imported
  through `src/core/facade.ts`; ESLint enforced. `renderedTable`'s DOM getters
  are never touched.
- **2 (class reactivity):** all components extend `QuestionElementBase` /
  `SurveyElementBase`; callbacks → `setState` (§4). No hooks-state, no MobX. The
  extracted `QuestionErrors` unit (§2a) and the `showInMultipleColumns` choice-cell
  wrapper (`MatrixChoiceCell`, §2b) are BOTH class-based `SurveyElementBase`
  observers: `QuestionErrors` observes its `cell.question`'s
  `["errors","visible"]`/`hasVisibleErrors`; `MatrixChoiceCell`'s
  `getStateElement()` returns the **shared choice `cell.question`** so it re-renders
  on that one question's value / enabled-item / error changes (never a hooks
  rewrite, never a hand-rolled toggle).
- **3 (draft/commit):** text/comment cells inherit the TextQuestion/Comment
  draft-commit adapter automatically (they ARE those components); cell values
  never bound to matrix.value directly (§2). **The controlled-leaf adapter binds
  to Question IDENTITY, not row position:** because a leaf builds its
  `DraftCommitAdapter`/`OtherCommentDraftAdapter` once and does not rebind on a
  prop swap (`Comment.tsx:76-84`), leaves are keyed off the immutable
  **`cell.question.uniqueId`** (§4 keying table — NOT the regenerating
  `renderedRow.id`/`cell.id`; data-row and detail-row keys use the stable source
  `row.id`) so a reset or a FRONT insert/remove never routes an in-flight draft to a
  different row's question; a leaf remounts (fresh adapter) only when its
  `cell.question` instance genuinely changes.
- **4 (StyleSheet + tokens):** a new **`matrix` recipe** (`src/theme-rn/recipes/matrix.ts`)
  slots into the `Recipes` interface + `buildRecipes` map + barrel (the `row.ts`
  prebuild-legal-tuples / select-at-render pattern; narrow/RTL are SELECT-time
  inputs, not cache keys). Fragments authored from v2.5.33 matrix SCSS: grid
  lines, header cell, row-header cell, alternate rows, vertical-align, selected/
  checked/error, card, add/remove/detail buttons. Reuse `row`/`button`/`item`/
  `questionChrome`/`overlay`/`listItem` recipes where possible. A12 consumer
  override slot key `matrix`.
- **5 (theme pipeline):** the `matrix` recipe consumes tokens produced by
  `theme-core` → `theme-rn` (no RN imports in `theme-core`); it adds no new token
  source and rides the existing golden-tested pipeline.
- **6 (hybrid styling):** the recipe owns native interaction state (pressed/RTL/
  alternate-row/vertical-align); class-token mapping only for model-derived state
  from CssClassBuilder strings (`getItemClass`, rendered `cell.className`,
  `row.className` — `hasError`/`answered`/`itemChecked`/`itemDisabled`). Never
  re-derive those booleans in the component.
- **7 (capability libs, lazy):** add/remove/detail icons via `RNIcon` (lazy
  `react-native-svg`); gesture-handler + reanimated only when 4.3 drag lands, NOT
  in 3.x.
- **8 (Security):** any cell rendering HTML (e.g. an `html`/rubric display cell)
  goes through the repo HTML sanitizer + URL-scheme allowlist; totals are
  `expression` questions evaluated by core (no ad-hoc eval); and no matrix
  affordance auto-navigates (`navigateToUrl` etc. surface via events — host decides).
- **9 (non-throwing fallback):** unsupported cellType → `createUnsupportedQuestion`;
  deferred sub-features (drag, transpose if deferred) degrade with a deferred,
  deduped diagnostic (ImageQuestion/paneldynamic pattern), never crash. Simple-matrix
  `isExclusive` + rubric cells and the detail/totals paths each degrade independently.
- **Architecture principle — no DOM / no `afterRender` (A-decisions / won't-support
  list; NOT a numbered invariant).** Bypass `renderedTable`'s HTMLElement contracts
  (`afterRenderQuestionElement`, `setRootElement`, `focusCell` querySelector, DOM
  animations, `DragDropMatrixRows`, `matrixAfterCellRender`); mobile detection is the
  survey `onLayout`→`setIsMobile` path, not a `ResizeObserver`. `onMatrixAfterCellRender`
  is not fired. This is the design principle §0 refers to — repo invariant 8 is
  Security (above); the no-DOM rule is a separate architecture decision, not
  invariant 8.

---

## 6. Registration / manifest / wiring

- `descriptors.ts` — add three `template`-route `supported` rows (confirm
  `getTemplate()` returns the type name at TDD, as every supported type does):
  `matrix` → `MatrixQuestion`, `matrixdropdown` → `MatrixDropdownQuestion`,
  `matrixdynamic` → `MatrixDynamicQuestion`, `milestone:'M3'`. If the
  chrome-less cell dispatch or detail/totals ever need element-route helpers
  (they should not — cells reuse the existing question rows; detail panels reuse
  `SurveyPanel` directly like PanelDynamic), no element rows are added. NO
  `sv-matrix-*` element rows (web's `survey-matrix-cell`, `sv-matrix-row`,
  `sv-matrixdynamic-actions-cell`, `sv-matrixdynamic-add-btn`,
  `sv-placeholder-matrixdynamic` are collapsed into the RN components — a
  ponytail simplification, one component self-branches on cell/row kind).
- `manifest.ts` — flip `matrix`/`matrixdropdown`/`matrixdynamic` `planned →
  supported` with `runtimeRenderable` (expectedTemplate = type name, route
  `template`). `matrixdropdownbase` stays `internal-base`.
- The 4 sorted-key-list tests + `index.tsx` exports + `src/core/api-surface.ts`
  watchlist rows: `visibleRows`, `visibleColumns`, `hasRows`, `hasCellText`,
  `visibleRowsChangedCallback`, `columnMinWidth`, `columnColCount`,
  `rowTitleWidth`, `horizontalScroll`, `getColumnWidth`,
  `settings.matrix.columnWidthsByType`,
  `renderedTable` (+ its `renderedRows`/`headerRow`/`footerRow`/`showTable`/
  `showHeader`/`showFooter`/`showAddRowOnTop`/`showAddRowOnBottom`/`hasFooter`/
  `showCellErrorsTop`/`showCellErrorsBottom` getters), `resetRenderedTable`,
  `onRenderedTableResetCallback`, `isColumnLayoutHorizontal`, `transposeData`,
  `isMobile`, `getRowTitleWidth`, `getAddRowLocation`,
  the non-creating `renderedTable` read `Base.getPropertyValueWithoutDefault`
  (protected — matrix uses it in `isRendredTableCreated`; isolate ONE cast, §11.3),
  the rendered `cell.hasQuestion`/`hasPanel`/`hasTitle`/`isChoice`/`isItemChoice`/
  `isCheckbox`/`isRadio`/`isOtherChoice`/`isFirstChoice`/`choiceIndex`/`item`/`id`/
  `isActionsCell`/`isDragHandlerCell`/`isErrorsCell`/`row.isErrorsRow`/`row.id`/
  `colSpans`/`width`/`minWidth`/
  `showResponsiveTitle`/`responsiveLocTitle`, `addRowUI`/`removeRowUI`,
  the choice-cell select-base APIs on `cell.question` — `isItemSelected`,
  `clickItemHandler`, `getItemEnabled`, `isInputReadOnly`, `otherItem`,
  `visibleChoices` (NOTE: there is NO `question.isChecked` on the select base —
  do not reference it), the matrix `getCellAriaLabel`,
  `canAddRow`/`canRemoveRows`/`canRemoveRow`, `getShowColumnsIfEmpty`,
  the **`keyName` duplication group** — `keyName`, `keyDuplicationError`,
  `isValueInColumnDuplicated`, `getDuplicationError`, `KeyDuplicationError`
  (private on the matrix, so read behaviorally via a cell question's `errors`;
  isolate any cast per the 2.5 R3 adapter pattern),
  `MatrixDropdownRowModelBase` (`cells`/`getQuestionByColumn`/`detailPanel`/
  `isDetailPanelShowing`/`showHideDetailPanelClick`/`onDetailPanelShowingChanged`/
  `isRowEnabled`), `MatrixRowModel` (`isChecked`/`cellClick`/`value`/`hasError` —
  simple-matrix row API, `question_matrix.ts:75-78`; distinct from the dropdown
  cell question), the extracted reactive `QuestionErrors` unit +
  `question.renderedErrors` / `currentNotificationType` / `hasVisibleErrors` (§2a).
  If any is `protected` (e.g. a non-creating renderedTable read), isolate ONE
  cast in an adapter fn + a behavioral compat test (2.5 R3 pattern; peer floor
  `>=2.5.32 <2.6.0`).
- kitchen-sink additions + parity regen: a simple matrix (single + multi-select
  via `cellType:"checkbox"`, `hasCellText` rubric variant), a matrixdropdown
  (dropdown + text + boolean columns, a totals column, a detail panel), a
  matrixdynamic (min/max row count, `confirmDelete`, empty state).

---

## 7. `CORE` sub-designs requiring orchestrator + `llm-pair` sign-off

3.1 is `CORE` in the plan. Within M3 these sub-designs are the ones designed by
the orchestrator + three-way paired BEFORE handoff (never delegated blind):

1. **The normalized `GridContract`** bridging simple-matrix (visibleRows/
   visibleColumns) and renderedTable (renderedRows/cells) shapes (§1).
2. **Column-width allocation algorithm + measurement contract + shared
   header/body/footer alignment** (§3a.2–3a.3) — the per-cellType `columnWidthsByType`
   default-minWidth table + `getColumnWidth` inputs, **`effFixed = max(width,
   minWidth)`** (a fixed column's own minWidth raises its floor; `rowTitleWidth` is
   BOTH width and floor), the two-regime fit-vs-overflow distribution with an
   **iterative water-fill** (deterministic equal-split), the **rounding-residual**,
   **all-fixed-underfill**, and **auto/action-column intrinsic-width** policies (no
   shrink on overflow), `percentBase` semantics, the one dp array + summed content
   width applied to header/body/footer, AND the measurement contract: measure ONLY
   the OUTER pre-scroll root View, never a `width>0`-gated box inside the horizontal
   ScrollView content (the `SurveyRow.tsx` device bug).
3. **Chrome-less cell dispatch + inline errors + `showInMultipleColumns` choice
   cells** (§2, §2a, §2b) — the REACTIVE `QuestionErrors` extraction prerequisite
   (self-gating on `hasVisibleErrors`, rendered for non-choice cells AND once at
   `isFirstChoice` per exploded group), the explicit skip of core's
   `isErrorsRow`/`isErrorsCell`, the cell-kind precedence (`isActionsCell` →
   non-choice question → `isOtherChoice` Other-comment → `isCheckbox`/`isRadio`
   item), the **class-based `MatrixChoiceCell` wrapper** over the shared choice
   question using the REAL `isItemSelected`/`clickItemHandler`/`getItemEnabled`/
   `isInputReadOnly` APIs (NOT the nonexistent `isChecked`) with hidden caption +
   synthesized `getCellAriaLabel`, `columnColCount` applied ONLY to the un-exploded
   child question (never to exploded cells), and OverlayContext flow for cell
   dropdowns through the registered `…QuestionElement` wrappers.
4. **renderedTable reactivity + render purity + the two-level component split**
   (§4) — deferred-ensure materialization, the **confirmed non-creating backing
   read** `getPropertyValueWithoutDefault` (protected; one isolated cast + compat
   test, §11.3 resolved), StrictMode latch reset; the OUTER-subscribes-`question`
   + `onRenderedTableResetCallback`, INNER-holds-`renderedTable`-as-prop-with-STABLE-key-and-retargets-in-`componentDidUpdate`
   split (ONE strategy — NOT a keyed remount) with the **no-undefined-commit
   contract** (INNER holds the current renderedTable in state, keeps rendering the
   prior reference until `componentDidUpdate` swaps atomically — never a blank
   frame); leaf keys from the immutable **`cell.question.uniqueId`** (never array
   index, never the regenerating `renderedRow.id`/`cell.id`; data/detail rows key
   off the stable source `row.id`, transposed rows off column identity) so
   controlled drafts follow Question identity; and the TDD confirmation that
   in-place `renderedRows` mutations notify without firing the reset callback.
5. **Sticky-first-column split-pane + BIDIRECTIONAL per-row height sync
   (DEFERRED, OPTIONAL 3.1b)** — the bespoke, highest-risk mechanism, no RN
   primitive exists; ships only if the single-ScrollView baseline (§3a) proves
   insufficient AND height-sync tests acceptable (§3a.5).

The per-type rows (3.2/3.3/3.4 cell wiring, add/remove, cards, kitchen-sink) are
well-specified enough for TDD handoff to the team once 1–4 are signed off; item 5
is a follow-on only if the baseline needs it.

---

## 8. Proposed M3 phasing (honors plan-of-record 3.1–3.5; sub-split like 2.8a/b/c)

| ID | Task | Size | CORE |
|----|------|------|------|
| **3.1a** | `MatrixGrid` primitive I: flex-View grid, normalized `GridContract`, the **column-width allocation algorithm** (per-cellType `columnWidthsByType` floors, `effFixed = max(width, minWidth)`, `rowTitleWidth` as both width+floor, two-regime fit/overflow with **iterative water-fill** + rounding-residual + all-fixed-underfill + auto/action intrinsic-width policies, no-shrink) with the shared dp array + summed content width applied to header↔body↔footer, the **measurement contract** (outer pre-scroll root View only), a **single horizontal ScrollView** with the row-header column INSIDE the scroll content (header+body scroll together, natural per-row flex height, no split-pane, no height-sync). | M | ✅ |
| **3.1b** | `MatrixGrid` primitive II: mobile stacked-card path (`isMobile`/`displayMode`); **OPTIONAL** sticky first (row-header) column split-pane + **bidirectional** per-row height sync — gated on measured acceptability of the 3.1a baseline (ships only if needed); RTL fixed-pane side + horizontal-scroll-start flip lives here. | M | ✅ (sticky part) |
| **3.2** | `matrix` (simple): radio/checkbox tiles via `row.cellClick`/`row.isChecked`, single + multi-select (`cellType:"checkbox"` + `isExclusive`), `hasCellText` rubric cells, `eachRowRequired`/`eachRowUnique` per-row errors, `rowOrder` random, `visibleRowsChangedCallback`. Builds the `GridContract` from `visibleColumns/visibleRows`. | M | |
| **3.3a-pre** | **PREREQUISITE (CORE): extract a reusable `QuestionErrors` renderer** from the private `QuestionChrome.renderErrors` (over `question.renderedErrors` / `currentNotificationType`); `QuestionChrome` re-consumes it (no behavior change, existing chrome test stays green). Blocks all chrome-less cell dispatch — without it, cell errors are invisible. | S | ✅ |
| **3.3a** | `MatrixTableBase` + `MatrixDropdownQuestion` (static rows): two-level renderedTable component split (stable-key inner + `componentDidUpdate` retarget, NOT keyed remount; **no-undefined-commit** — inner holds the current table in state, never renders undefined; leaf keys off immutable `cell.question.uniqueId`, rows off stable source `row.id`, NOT the regenerating `renderedRow.id`/`cell.id`) + reset reactivity + render purity (confirmed `getPropertyValueWithoutDefault` backing read), chrome-less cell dispatch, header, **inline cell errors via reactive `QuestionErrors` (non-choice cells AND once at `isFirstChoice`; explicitly skip core's `isErrorsRow`/`isErrorsCell`)**, **`showInMultipleColumns` `'choice'` cells (ONE item per cell via `isItemSelected`/`clickItemHandler`; `isActionsCell`/`isOtherChoice` precedence; `columnColCount` NOT applied to exploded cells)**, **`readOnly` cells (`isRowEnabled` false → display-mode)**, **faithful vertical render when `isColumnLayoutHorizontal===false` on wide screen (`transposeData`) + deduped diagnostic**. | L | partial (base) |
| **3.3b** | Detail panels (`detailPanelMode` underRow/underRowSingle via `SurveyPanel`, full-width RN divergence) + totals (expression cells, column-aligned via shared dp array; **present on mobile as a totals summary card — `showFooter` is TRUE on mobile; absent ONLY in wide transposed**; read `showFooter`). Shared with 3.4. | M | |
| **3.4a** | `MatrixDynamicQuestion`: add-row buttons (top/bottom), per-row remove via `removeRowUI` → 2.2 dialog adapter, empty-state placeholder, `min/maxRowCount` + `keyName` + `lockedRowCount` gating, `defaultRowValue`/`copyDefaultValueFromLastEntry`. Includes the **`keyName`/`isUnique` duplication path** (§3.4 TDD): a duplicate value adds a `KeyDuplicationError` onto the offending `cell.question`, surfaced by the inline `QuestionErrors`. | L | |
| **3.4b** | matrixdynamic detail-on-add (`detailPanelShowOnAdding`), validation summaries (`MinRowCountError`), `confirmDelete` UX polish. | S | |
| **3.5** | singleinputsummary + release v0.3 (gates A14, DIFFERENCES entries, README support-matrix). | S | |

Row drag reorder is **4.3** (M4), not M3. Virtualization is **6.2** (measured
only). This differs from the task-brief's suggested "3.1 matrix / 3.2
matrixdropdown / …" numbering: the plan-of-record already fixes 3.1 as the
`CORE` grid primitive and 3.2–3.4 as the three types, so the "mobile-card /
detail / totals" the brief split out live inside 3.1b (cards) and 3.3b
(detail/totals) rather than a separate `3.x`.

---

## 9. TDD notes (red first, per task)

- **3.1a MatrixGrid (baseline):** column widths resolve identically for
  header/body/footer (alignment assertion on the ONE dp array AND the identical
  summed content width stamped on all three bands); per-cellType
  `columnWidthsByType` floor is read (a `comment` column floors at 200px, `file`
  at 240px) and `getColumnWidth` precedence (`column.minWidth` > `columnMinWidth`
  > per-cellType default) holds; **`effFixed = max(width, minWidth)`** — a column
  with `width:50 / minWidth:100` resolves to 100 (NOT 50); **`rowTitleWidth` is
  both width AND floor** on the row-header column; **regime (a) fit** water-fills
  the remainder EQUALLY across growable (auto+floored) columns above their floor,
  is deterministic/order-independent, and the grid exactly fills `measuredWidth`
  (inert ScrollView); the **floor-safe rounding residual** (floor every column DOWN,
  then hand out the non-negative leftover dp one at a time to growable columns by
  DESCENDING fractional remainder, ties by ascending slot index) makes `Σ` exact
  **without pushing any column below its floor** (no signed residual on a single
  column); the **all-fixed underfill** case (every column fixed, `S <
  measuredWidth`) does NOT stretch fixed columns (grid sits logical-start, trailing
  space empty); **regime (b) overflow** keeps intrinsic/min widths, does NOT shrink,
  and total content width exceeds `measuredWidth` (scrollable); a **floorless-auto**
  column takes `AUTO_COL_DP` and an **actions/drag column** takes `ACTIONS_COL_DP`;
  `%` width uses `measuredWidth` as `percentBase` in BOTH regimes; **measurement
  contract**: width is read from the OUTER pre-scroll root View and a `width>0`-gated
  box inside the ScrollView content would NEVER unblock — assert the grid does not
  render blank (the `SurveyRow` device-bug regression); the one-frame defer (no
  render before measurement); row-header column is the first cell INSIDE the scroll
  content and scrolls with the body; a `colSpan>1` cell sums the exact spanned dp
  values; each row's cells share height via natural flex (no height-sync in
  baseline). Native iOS/Android layout verification + large-grid width-recompute
  benchmark thresholds remain STILL-OPEN device-verification gates.
- **3.1b MatrixGrid (mobile + optional sticky):** mobile flip renders cards (each
  `{label, cell}` pair) and back; IF sticky ships — the row-header pane stays
  pinned while data columns scroll, and **bidirectional** height sync stamps
  `minHeight = max(left,right)` on both panes (a tall cell on either side grows
  the other). Cross-grid cell focus is a documented NON-GOAL (no registry hook;
  see DIFFERENCES/§11.6).
- **3.2 matrix:** header from `visibleColumns`; row-header when `hasRows`;
  radio single-select commits `row.value` (object keyed by row.value); checkbox
  multi-select toggles an array + `isExclusive` clears others; `hasError` per row
  (`eachRowRequired`/`eachRowUnique`); `hasCellText` renders a tappable text cell;
  `rowOrder:"random"` (seeded); `visibleRowsChangedCallback` re-renders on row
  visibility change; a11y label combines row-header + column-header
  (`getCellAriaLabel`); role radio/checkbox.
- **3.3a-pre QuestionErrors extraction:** the extracted unit renders
  `question.renderedErrors` with the `currentNotificationType` tone (error/
  warning/info) identically to today's `QuestionChrome` (chrome test unchanged);
  a standalone render of a question with errors shows them; it **returns `null`
  when `hasVisibleErrors` is false** (the preserved chrome gate); and it is
  **independently reactive** — mounted over a clean question, then an error added
  post-mount makes it appear and clearing the error makes it disappear WITHOUT a
  parent re-render (the `["errors","visible"]`/`hasVisibleErrors` subscription).
- **3.3 matrixdropdown:** each `cell.question` dispatches to the correct RN
  renderer (dropdown cell → overlay sheet; text cell → draft/commit; boolean;
  expression); chrome-less (no per-cell title); **a per-cell `isRequired` error
  renders inline under the cell via `QuestionErrors`** (red-first: without the
  extraction it is INVISIBLE — the data-integrity regression); the walker
  **skips** core's `isErrorsRow` rows and `isErrorsCell` cells so the error is
  shown exactly once (no double, no drop); cell value writes to the right
  `{row}{col}` slot, not a sibling; renderedTable materializes via deferred
  ensure (NOT during render — D2 `constructed-during-render` red-first; StrictMode
  replay); the **two-level split**: `onRenderedTableResetCallback` re-renders on
  column change AND the inner component (STABLE key, NOT remounted) re-attaches its
  subscription to the NEW renderedTable instance in `componentDidUpdate` after a
  reset (old instance detached, via the no-undefined-commit atomic swap — no blank
  frame); an in-place `renderedRows` mutation (add row) re-renders WITHOUT firing
  the reset callback; **leaves are keyed off the immutable `cell.question.uniqueId`**
  (rows off the stable source `row.id`; NOT the regenerating
  `renderedRow.id`/`cell.id`) — an **active `onBlur` draft in an edited cell
  survives a FRONT insertion/removal of another row** (the draft is NOT committed
  to a different row's question — the index-reuse regression) **and survives a
  `renderedTable` reset** (stable-identity retarget, not a remount that discards
  the draft); detail panel expands/collapses (`onDetailPanelShowingChanged`),
  underRowSingle closes others; **totals**: a `sum` total = `sumInArray` read-only;
  totals are **present on mobile** (rendered as a totals summary card — `showFooter`
  is TRUE on mobile) and **absent ONLY in wide transposed** (`showFooter` false);
  **totals commit timing** (§2a/§3d, `DraftCommitAdapter`): an `onBlur` text/comment
  draft does NOT change a dependent total BEFORE the blur-commit and DOES after; an
  `onTyping` draft updates the total immediately; a transformed/masked commit
  propagates the transformed value into the total; **`showInMultipleColumns`**
  explodes a choice column into per-choice `isChoice` cells that render ONE item
  each (not N whole checkboxes), selection driven by
  `cell.question.isItemSelected(cell.item)` and written via `clickItemHandler`
  (there is NO `cell.question.isChecked`), the shared error rendered once at
  `isFirstChoice`, `columnColCount` NOT applied to the exploded cells (only to an
  un-exploded child), the caption hidden + `getCellAriaLabel` synthesized; an
  **actions cell (`isActionsCell`) is resolved BEFORE `isChoice`** and never
  rendered as an item; an **Other choice cell (`isOtherChoice`)** renders the
  controlled Other-comment adapter, not an item button; **`readOnly` cells**
  (`isRowEnabled` false) render in display mode; **transposed** (`transposeData:true`,
  wide screen) renders the vertical `renderedRows` faithfully + a deduped diagnostic
  (not forced horizontal).
- **3.4 matrixdynamic:** add button present when `canAddRow` (driven by
  `renderedTable.showAddRowOnTop`/`showAddRowOnBottom`), ABSENT at `maxRowCount`;
  `addRowUI()` adds a row that renders; remove per row via `removeRowUI(row)` →
  confirm through OverlayHost (confirm removes / cancel retains / no-host fail-safe
  cancel — the model-adapter path is already covered by dialog-adapter tests; test
  only the RN Pressable→dialog wiring); add/remove exercised on **both sides of
  `minRowCount` and `maxRowCount`** (button appears/disappears at each bound);
  `lockedRowCount` + `matrixAllowRemoveRow` honored; **empty-state polarity
  (corrected):** the `noRowsText` placeholder shows precisely when
  `renderedTable.showTable === false` — i.e. `hideColumnsIfEmpty:true` AND no rows —
  NOT when `getShowColumnsIfEmpty()` is false; with the default
  (`hideColumnsIfEmpty:false`) an empty grid shows header + add button, no
  placeholder; first-row add works from the empty state; the **actions column
  appears when the first removable row exists and disappears when none remain**;
  **external FRONT insertion/deletion** (splice a row at index 0 via the model, not
  the UI) re-renders correctly and does not misroute an in-flight draft (leaves key
  off `cell.question.uniqueId`, rows off the stable source `row.id`); a **transposed
  reset** rebuilds cleanly; **detail rows are
  preserved** across add/remove that does not require a full reset; value is the
  array shape `[{col:val}]`; `MinRowCountError` when required; **totals recompute**
  on add/remove (`sum/count/min/max/avgInArray` update as rows are added/removed);
  **`keyName`/`isUnique` duplication regression:** two rows with the same value in
  the `keyName` column → core adds a `KeyDuplicationError` (`keyDuplicationError`
  text) onto the offending `cell.question`, which renders inline via
  `QuestionErrors` under that cell; correcting the duplicate clears it (exercises
  §2a's data-integrity path end to end); drag handle inert (4.3 not yet).
- Cross-cutting: model retarget (swap the `question` prop → callbacks detach old/
  attach new); unmount detaches (no setState-after-unmount); RTL — in the 3.1a
  single-ScrollView baseline the row-header is just the first flex cell, so
  logical start/end (A7) handles RTL for free (no explicit flip needed); the
  fixed-pane side + horizontal-scroll-start flip is a 3.1b concern that only
  arises IF the optional sticky split-pane ships and is a **STILL-OPEN
  device-verification gate** (sticky-mode RTL on a real device), NOT settled here;
  screen-reader announcement of cell a11y labels likewise remains a device-only
  gate; fixtures reused from survey-library's matrix test suites.

---

## 10. DIFFERENCES.md entries the family will add (M3 section)

1. **No `<table>`** — matrix family renders a flex-`View` grid + horizontal
   `ScrollView`, not an HTML table; colSpan → a spanned View summing the exact
   spanned column dp. Columns are dp-resolved once and shared across
   header/body/footer for alignment (no browser auto-layout) — the **footer/totals
   row IS column-aligned** to that shared array (core builds it per-column). Only
   **detail-panel and empty/placeholder rows are full-width** and ignore per-column
   widths (the detail full-width is a deliberate RN simplification of core's
   leading/trailing-slot topology — §3g).
2. **renderedTable's DOM contracts are bypassed** — `afterRenderQuestionElement`
   / `matrixAfterCellRender` / `MatrixRow.setRootElement` / `focusCell`
   querySelector / DOM height animations are no-op'd; `onMatrixAfterCellRender`
   never fires (repo-wide no-afterRender posture).
3. **Wide tables horizontal-scroll; sticky first column is OPTIONAL** — the v0.3
   baseline is a single horizontal `ScrollView` with the row-header column inside
   the scroll content (it scrolls with the body; no CSS `position:sticky`, no
   split-pane, no height-sync). A pinned row-header column (fixed pane +
   bidirectional per-row height sync) is a deferred, optional 3.1b enhancement
   that ships only if the baseline proves insufficient.
4. **Mobile card flip is survey-`isMobile`-driven (600px) / `displayMode`
   list|table; matrix does NOT self-measure** — a wide matrix on a wide screen
   scrolls horizontally rather than auto-stacking (web uses both a ResizeObserver
   AND the survey mobileWidth).
5. **Cell questions render chrome-less** — the column header IS the cell title;
   per-cell title/description/comment chrome is suppressed (matches web's
   `renderQuestionBody`). Cell errors are rendered by a reusable, REACTIVE
   `QuestionErrors` unit extracted from `QuestionChrome` (self-gating on
   `hasVisibleErrors`), inline under the cell body — under each non-choice cell,
   and once at `isFirstChoice` for an exploded choice group (matching where core
   attaches the shared question's error); the walker skips core's rendered
   `isErrorsRow`/`isErrorsCell` so errors show exactly once (neither doubled nor
   dropped). The top/bottom `cellErrorLocation` separate error row collapses to
   inline in v0.3.
6. **Row actions are plain themed buttons**, not an `AdaptiveActionContainer` —
   custom row actions (`onGetMatrixRowActions`) and action overflow-to-popup are
   unsupported in v1.
7. **Row drag reorder deferred to 4.3** — `allowRowReorder`/`isRowsDragAndDrop`
   render an inert drag handle in v0.3.
8. **Row/detail expand-collapse + row enter/leave animations are not carried** —
   DOM-height animations dropped (reanimated layout animations may come later).
9. **No horizontal auto-scroll to an off-screen invalid cell, and cross-grid cell
   focus is a NON-GOAL** — the lifecycle bridge scrolls the vertical `<Survey>`
   ScrollView only; a wide invalid cell is scrolled to vertically, not
   horizontally. Programmatic per-cell focus is NOT wired in v0.3: no question
   renderer currently calls `registry.registerElement` (only `Survey.tsx`
   registers the scroll host; focusable-component registration is a future task),
   so matrix does not claim automatic cell focus. Resolves §11.6.
10. **Grid a11y has no native grid/columnheader/rowheader roles** — per-cell
    `accessibilityLabel` is synthesized from core's `getCellAriaLabel`
    (row-header + column-header); simple-matrix cells map to radio/checkbox;
    error association has no RN analog (surfaces via chrome, as rating/buttongroup).
11. **Delete confirmation routes through the RN dialog adapter**
    (`settings.showDialog`), same as paneldynamic.
12. **Large-matrix virtualization is deferred** (plan 6.2) — v0.3 renders all
    rendered rows as Views; measured before any FlatList/recycling.
13. **Transposed layout renders as a plain non-sticky vertical grid** — with
    `transposeData:true`/`columnLayout:"vertical"` on a wide screen,
    `isColumnLayoutHorizontal` is false and core builds a vertical `renderedTable`;
    RN walks those `renderedRows` faithfully (no axis-swap of our own) as a plain
    grid without the sticky-column enhancement, plus a deduped diagnostic. We do
    NOT force horizontal.
14. **Totals are shown on mobile (as a summary card) and suppressed only in the
    wide transposed layout** — `showFooter = hasFooter && isColumnLayoutHorizontal`
    and `isColumnLayoutHorizontal = isMobile ? true : !transposeData`, so mobile is
    horizontal and `showFooter` is TRUE on phones. RN therefore renders totals on
    mobile as a totals summary card (web parity — web emits `<tfoot>` on mobile);
    totals are absent ONLY when `showFooter` is false, i.e. non-mobile +
    `transposeData:true`. (Revision 1 wrongly claimed no totals on phones.) If the
    phone totals-card is ever dropped, that is an APPROVED data-visibility
    divergence, not parity.
15. **`showInMultipleColumns` renders one choice item per cell** — a checkbox/
    radiogroup column with `showInMultipleColumns` is exploded by core into
    per-choice `isChoice` cells sharing ONE question; RN renders a single
    radio/checkbox item per cell (not the whole control N times) via the shared
    question's `isItemSelected`/`clickItemHandler` (there is no `question.isChecked`),
    with the item caption hidden and a synthesized `getCellAriaLabel`. Each exploded
    choice is its own grid column governed by the shared column-width array;
    `columnColCount` is NOT applied to the exploded cells (core applies `colCount`
    only to an un-exploded child question's own choice layout). An `isActionsCell`
    (which also carries `item`) is resolved before `isChoice`, and an `isOtherChoice`
    cell renders a controlled Other-comment adapter, not an item.
16. **Core's `horizontalScroll` flag is not gated** — the grid is always wrapped
    in a horizontal ScrollView (inert when content fits); RN does not consult
    `horizontalScroll`, which can only ever add scroll capability, never clip.

(§8 open items resolved in this revision — transpose (§13, supported+diagnostic)
and `showInMultipleColumns` (§15, supported) are no longer deferred; rubric cells
land with 3.2.)

---

## 11. Open questions (resolve at TDD / sign-off — not hand-waved)

1. **`transposeData:true` layout** — RESOLVED: **support in 3.3a by faithfully
   rendering core's vertical `renderedTable`** (walker consumes `renderedRows`
   as-is; no axis-swap of our own) as a plain non-sticky grid + a deduped
   diagnostic. We CANNOT force horizontal — `isColumnLayoutHorizontal =
   isMobile ? true : !transposeData` is genuinely false on a wide transposed
   screen (§3b.5, DIFFERENCES 13). Mobile still forces horizontal → cards.
2. **`showInMultipleColumns`** (choice-per-column explosion) — RESOLVED:
   **honor** the rendered `isChoice`/`isCheckbox`/`isRadio` cells in 3.3a via the
   distinct `'choice'` render path (ONE item per cell via the shared question's
   `isItemSelected`/`clickItemHandler`; `isActionsCell`/`isOtherChoice` precedence;
   `columnColCount` NOT applied to the exploded cells — it configures only the
   un-exploded child question) — core already flattens the explosion into
   renderedTable cells sharing one question, so whole-question dispatch would be
   wrong (§2b, DIFFERENCES 15).
3. **Non-creating `renderedTable` read** — RESOLVED (source-confirmed):
   `Base.getPropertyValueWithoutDefault("renderedTable")` EXISTS (`base.ts:771-774`)
   and the matrix already uses it in `isRendredTableCreated`
   (`question_matrixdropdownbase.ts:1292`), so render-pure reads do NOT need the
   inert-placeholder-tick fallback. It is `protected`, so read it through ONE
   isolated facade-compatible cast (the 2.5 R3 adapter pattern) + a behavioral
   compat test asserting `undefined` before creation / the live instance after
   (peer floor `>=2.5.32 <2.6.0`). Gates §7.4; still confirm the cast compiles
   against the pinned peer at TDD.
4. **Sticky first column vs single-ScrollView baseline** — RESOLVED: **ship the
   single horizontal ScrollView (row-header inside scroll content, header+body
   together, no sticky, no height-sync) as the 3.1a wide-screen default.** The
   split-pane + bidirectional height-sync is a deferred, OPTIONAL 3.1b enhancement
   that ships only if the baseline proves insufficient — removing the highest-risk
   mechanism from the critical path (§3a.5, §7.5).
5. **Simple-matrix single-input / `inputPerPage` mode** — RESOLVED (pick one, two
   distinct things): (a) the **`singleinputsummary` question type**
   (`QuestionSingleInputSummary`, `questionSingleInputSummary.ts`) **SHIPS in 3.5**
   per plan-of-record — it is the phase-3 tail task, rendered as its own registered
   type. (b) The matrix-family **single-input-per-page rendering mode** (the
   survey-level `questionsOnPageMode:"inputPerPage"` driving
   `question.singleInputQuestion` / the `singleInputBehavior`, `question.ts:963-966`,
   `question_singleinput_behavior.ts`) is a **documented v0.3 NON-GOAL for the
   matrix types** — the matrix always renders its full grid/cards in v0.3; wiring a
   one-input-at-a-time flow for matrix rows is deferred (add a DIFFERENCES note).
   The two were conflated in revision 1; they are now separated and both decided.
6. **`focusable-cell` / keyboard grid nav** — RESOLVED: **documented v0.3
   NON-GOAL.** No question renderer currently calls `registry.registerElement`
   (only `Survey.tsx` registers the scroll host; focusable-component registration
   is a future task), so there is no automatic cell focus to claim. Cross-grid
   cell focus / keyboard nav is deferred and documented (DIFFERENCES 9),
   consistent with the a11y deviations; vertical scroll-to works, horizontal and
   programmatic cell focus do not. **This v0.3 non-goal deliberately SUPERSEDES the
   earlier phase-plan note** — `docs/IMPLEMENTATION-PLAN.md` task 3.1 lists
   "focusable cells" in the grid-primitive scope; that clause is DEFERRED here
   (the grid primitive itself still ships in 3.1, only its "focusable cells" part
   is a non-goal), pending repo-wide focusable-component registration. Revisit when
   that registration lands repo-wide.
7. **Per-cell element wrapper** (`onGetElementWrapperComponent` / `wrapMatrixCell`)
   — stub as a no-op in v0.3 (document) or wire an RN cell-wrapper contract? Lean:
   no-op + DIFFERENCES.
8. **Does matrix need its own `processResponsiveness` loop** (buttongroup-style)
   so a wide matrix stacks on a wide screen when intrinsic width exceeds
   available, or is the survey-level 600px `isMobile` flip sufficient for v0.3?
   Lean: survey flag only for v0.3 (DIFFERENCES 4); revisit in 6.2 if profiling
   shows wide-grid pain.

---

## 12. STILL-OPEN device / runtime-verification GATES

These six are UNRESOLVED and must NOT be answered by design reasoning alone — each
requires a real probe / device run / measurement during TDD or sign-off. Do not
invent answers; record results against these gates.

- **(a) Peer-range compile + non-creating probe.** Confirm the
  `getPropertyValueWithoutDefault("renderedTable")` structural cast (§4
  render-purity, §11.3) COMPILES and stays **non-creating** — returns `undefined`
  before creation, the live instance after — across the supported survey-core band
  (peer floor `>=2.5.32 <2.6.0`), via a behavioral compat test through the facade,
  run against the pinned peer(s). Gates the no-undefined-commit swap (§4).
- **(b) Nested scroll + initial-layout convergence (iOS + Android).** Nested
  horizontal (grid) inside vertical (`<Survey>`) scrolling; first-frame `onLayout`
  `measuredWidth` convergence (one-frame defer, NO blank frame — the `SurveyRow`
  device-bug regression); header/body/footer column alignment on the shared dp
  array; per-row cell height stretch via natural flex. BOTH platforms.
- **(c) Runtime reactivity tests.** In-place `@propertyArray` `renderedRows`
  notifications (add/remove/detail) fire WITHOUT the reset callback; matrixdynamic
  EXTERNAL (model-driven, not UI) add/remove re-renders and does not misroute
  drafts; detail-panel visibility toggles; totals-expression
  (`sum/count/min/max/avgInArray`) recompute on value + row changes.
- **(d) Large-grid render/update cost measurement.** Measure render + update cost of
  a large grid (all rendered rows as Views, non-virtualized) BEFORE accepting the
  non-virtualized v0.3 baseline; virtualization stays deferred to 6.2, but the
  baseline's acceptability is a MEASURED gate, not an assumption.
- **(e) Screen-reader pass (VoiceOver + TalkBack).** Per-cell `accessibilityLabel`
  from `getCellAriaLabel`, announcements, roles (radio/checkbox for simple-matrix
  cells), and traversal order — verified on device with BOTH screen readers.
- **(f) Sticky-column RTL (ONLY if the optional 3.1b split-pane ships).** Fixed-pane
  side, horizontal-scroll-start offsets, hit-testing, and scroll-sync under RTL — a
  device gate that arises only if the optional sticky-first-column mode (§3a.5) is
  built; otherwise N/A.
