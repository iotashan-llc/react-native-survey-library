# Milestone M3 — Matrix family (matrix / matrixdropdown / matrixdynamic)

Status: **DRAFT design (research-synthesized, three-input)** — consolidated from
three read-only research passes against survey-core 2.5.33 + survey-react-ui +
this repo (core-models, web-renderer, repo-reuse). All model facts below are
research-level and MUST be re-confirmed by headless probe through the facade
during TDD (the 2.5/2.8a precedent). This doc is the orchestrator's `CORE`
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
and violates invariant 8: colspan semantics, `<td>` afterRender
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

`width`/`minWidth` stay as core's raw CSS strings (`"120px"`, `"20%"`,
`columnMinWidth`, `rowTitleWidth`) — `MatrixGrid` resolves them once against its
measured width (§3). This is the CORE sub-design that lets one primitive serve
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

- **Extraction.** Pull the private `QuestionChrome.renderErrors` body (and the
  `currentNotificationType` tone policy + `renderedErrors.map` loop) into a
  reusable unit — either a standalone `QuestionErrors` component or a static
  helper — that takes a `Question` and renders over `question.renderedErrors` /
  `question.currentNotificationType`. `QuestionChrome` then consumes the same
  unit (no behavior change to the chrome path; its existing test stays green).
  This is the ONLY new coupling required to make cell errors visible.
- **Where the cell dispatcher renders them.** The chrome-less cell dispatcher
  renders `<QuestionErrors question={cell.question}/>` **inline, directly under
  the cell body**, for every dispatched (`isChoice === false`) cell. This is the
  v0.3 posture (§4): the separate top/bottom error row (`cellErrorLocation`)
  collapses to inline.
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
  cell/row points at is the SAME instance already dispatched in the data cell,
  so rendering `QuestionErrors` once, inline, under that data cell is exact
  parity with no duplication.
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
`res.question = cell.question`, `res.item = choices[i]`, `res.choiceIndex = i`).
Dispatching the whole question per choice cell would render the entire
checkbox/radiogroup N times and break selection. So cell rendering branches on
`cell.isChoice`:

- **Non-choice cells (`isChoice === false`):** whole-question dispatch via
  `renderCellQuestion` (§2) + inline `QuestionErrors` (§2a). This is the default.
- **Choice cells (`isChoice === true`):** a distinct render path that emits **ONE
  radio/checkbox item per cell** — NOT the whole question — reusing the existing
  `Checkbox` / `Radiogroup` / `ChoiceItemRow` item recipes. It is driven by:
  - `cell.item` (the `ItemValue` this cell represents),
  - `cell.isCheckbox` / `cell.isRadio` (which control to draw),
  - `cell.choiceIndex` / `cell.isFirstChoice` (position; `isFirstChoice` is where
    core attaches the shared error cell, which we skip per §2a),
  - `cell.question.isChecked(item)` for the controlled selection state and the
    cell question's toggle for writes,
  mirroring web `renderCellCheckboxButton` / `renderCellRadiogroupButton`.
  Arrangement across the exploded columns follows `columnColCount`
  (column-level `colCount`, inheriting the matrix `columnColCount`; 0–4).
- The normalized `GridCell.kind === 'choice'` (§1) carries this branch into
  `MatrixGrid`; the header for an exploded column is the individual choice text
  (core sets it), and the shared column-width array (§3a.2) still governs each
  choice cell's dp width.

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

   a. **Read raw width + minWidth per column** exactly as core's renderedTable
      does, so RN and web agree on inputs:
      - `rawWidth  = column.width` (or `rowTitleWidth` for the row-header column;
        the header column has no `minWidth`).
      - `rawMin    = matrix.getColumnWidth(column)` =
        `column.minWidth || matrix.columnMinWidth ||
        settings.matrix.columnWidthsByType[column.cellType]?.minWidth || ""`.
        This means there is a **per-cellType default minWidth table**:
        `settings.matrix.columnWidthsByType` ships `{ file:{minWidth:"240px"},
        comment:{minWidth:"200px"} }` in 2.5.33; everything else defaults to no
        floor. The RN allocator reads the same `settings.matrix.columnWidthsByType`
        map through the facade (do NOT hardcode; it is consumer-overridable) plus
        the `matrix.columnMinWidth` global.
   b. **Evaluate each raw value** through `evaluateWidthExpression(raw,
      percentBase)` → `{kind:'dp'|'%'-resolved|'auto'|'unset'|'invalid'}`. A
      column is **fixed** if `width` resolves to dp; **floored** if it has a dp
      `minWidth` but no fixed width; **auto** if neither (`unset`/`auto`).
      `percentBase = measuredWidth` (from §3a.2) for `%`/fit math.
   c. **Two regimes.**
      - **(a) Fit:** if `Σ(fixed widths) + Σ(min floors for non-fixed columns) ≤
        measuredWidth`, distribute the **remainder** (`measuredWidth − Σfixed −
        Σfloors`) across the `auto` columns (and columns whose floor is below a
        fair share), each column ending at `max(floor, share)`. Fixed columns keep
        their dp; floored-but-not-fixed columns grow from their floor upward with
        the auto columns. Result: the grid exactly fills `measuredWidth`, the
        horizontal ScrollView is inert (content fits), alignment is identical.
      - **(b) Overflow:** if `Σ(fixed) + Σ(floors) > measuredWidth`, **no
        shrinking** — each column takes its intrinsic width (fixed dp, or its min
        floor, or a default intrinsic for floorless-auto columns), the total
        exceeds `measuredWidth`, and the surplus **overflows into the horizontal
        ScrollView** (the user scrolls). This is the wide-table case; columns
        never collapse below their floor.
   d. **`percentBase` semantics stated explicitly.** In regime (a) `%` widths
      resolve against `measuredWidth` (the measured viewport — the DOM parity
      point). In regime (b) the content is wider than the viewport by
      construction; `%` widths still resolve against `measuredWidth` (a `%` column
      is a fraction of the viewport, then the fixed/floored columns push total
      width past it) — documented so authors know `%` is viewport-relative, not
      content-relative, in the overflow case.
   e. **One dp array, applied identically** to the header strip, every body row,
      and the footer row — this is what guarantees column alignment with no
      browser table auto-layout. Recompute only when `measuredWidth` changes or
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
detail row (`cell.hasPanel`, full-width) renders `<SurveyPanel element={cell.panel}/>`
spanning the full grid width — REUSING the existing SurveyPanel/SurveyRow
composition verbatim (the paneldynamic precedent). Toggle via the row's
`showHideDetailPanelClick` (a detail button in the actions cell); subscribe
`row.onDetailPanelShowingChanged` for the expand/collapse re-render.
`underRowSingle` (one open at a time) is enforced by core. In card mode the
detail panel stacks inside the card.

### 3d. Totals footer row

`renderedTable.footerRow` / `hasFooter` (→ 3.3). Footer cells are `expression`
questions (`MatrixDropdownTotalCell`, `sum/count/min/max/avgInArray`). Render
them read-only through the expression renderer (1.15), aligned via the shared
column widths; `totalText`/`getFooterText()` supplies any caption.

**Footer is horizontal-only (web parity).** Core gates the footer with
`renderedTable.showFooter = hasFooter && isColumnLayoutHorizontal`, so the totals
footer is **absent in mobile/card mode and in the transposed (§3b.5) layout** —
`footerRow` is not rendered there. The grid MUST NOT assume `footerRow` exists:
read `renderedTable.showFooter` (not just `hasFooter`) before emitting the footer
row, and in card mode the totals simply do not appear (matches web). This is a
DIFFERENCES-level parity note only if a consumer expects totals on phones.

### 3e. Row add / remove (matrixdynamic, 3.4)

- Add buttons top/bottom driven by `renderedTable.showAddRowOnTop` /
  `showAddRowOnBottom` (core honors `addRowButtonLocation`) → themed `Pressable`
  / `ActionButton` calling **`addRowUI()`** (guards inside core). Caption
  `locAddRowText`; gated by `canAddRow` (ABSENT at `maxRowCount`) /
  `allowAddRows`.
- Per-row remove via the actions cell (`isActionsCell`) → **`removeRowUI(row)`**,
  which routes delete confirmation through core → `settings.showDialog` → the
  2.2 dialog adapter → OverlayHost (IDENTICAL to paneldynamic; renderer never
  builds the dialog). Gated by `canRemoveRows` / `canRemoveRow(row)` (honors
  `lockedRowCount` + the `matrixAllowRemoveRow` callback). NEVER raw `removeRow`.
- Empty state (`hideColumnsIfEmpty` / `getShowColumnsIfEmpty` false + no rows) →
  placeholder (`noRowsText`) + an add button (the only way to add the first row).
- Row **actions are plain themed buttons** (remove + detail toggle), NOT an
  `AdaptiveActionContainer` (no RN action-bar exists; PanelDynamic precedent).
  `onGetMatrixRowActions` custom actions + action overflow-to-popup are v1
  unsupported (DIFFERENCES).

### 3f. Row drag reorder — DEFERRED to 4.3

Plan-of-record places matrixdynamic reorder at 4.3 (M4, on the 4.1 drag
primitive). In 3.4 the drag-handle cell (`isDragHandlerCell`) renders inert /
hidden and `isRowsDragAndDrop` is assumed false (v0.3 state). Documented.

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
- **Dropdown / dynamic** (`MatrixTableBase`) — a **two-level component split**,
  because `renderedTable` is an unstable state-element identity. `resetRenderedTable()`
  calls `resetPropertyValue("renderedTable")` (DESTROYS the old instance; the next
  read constructs a BRAND-NEW `QuestionMatrixDropdownRenderedTable`) and then
  `fireCallback(onRenderedTableResetCallback)`. It fires on column change,
  `isRequired` change, mobile flip, transpose, and rows add/remove. Subscribing a
  single component's `getStateElement()` to a `renderedTable` that is about to be
  replaced would leave the base attached to a dead instance. So:
  - **OUTER component** (`MatrixTableBase`): `getStateElement()` returns the
    **stable `question`** (subscribes value/css/loc/`isMobile`), AND registers
    `onRenderedTableResetCallback → this.setState` (single-assignment field, one
    bound handler; the retarget discipline below). Its render reads the CURRENT
    `renderedTable` (materialized out-of-render per the purity rule) and mounts
    the inner component keyed so a reset remounts it cleanly.
  - **INNER table component** (`MatrixTable`): `getStateElement()` returns the
    **current `renderedTable` instance**. On a reset the OUTER re-renders with the
    new instance; the INNER must **detach from the old renderedTable and attach to
    the new one in `componentDidUpdate`** (the identity-change re-subscription,
    the same detach-old/attach-new discipline used for a `question`-prop swap).
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
  built LAZILY (`getPropertyValue("renderedTable", …, createRenderedTable)`);
  reading the getter during render would construct + subscribe inside a React
  render pass, firing core notifications into the D2/D4 guarded window.
  Materialize `renderedTable` OUTSIDE render — a deferred (one-microtask) ensure
  scheduled from `componentDidMount`/`DidUpdate` (StrictMode-safe latch reset on
  every remount, per 2.5 C1); render + `getStateElements` read a NON-creating
  backing accessor (verify `getPropertyValueWithoutDefault("renderedTable")` at
  TDD; else render an inert placeholder for the first tick, like rating). This is
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
  `SurveyElementBase`; callbacks → `setState` (§4). No hooks-state, no MobX.
- **3 (draft/commit):** text/comment cells inherit the TextQuestion/Comment
  draft-commit adapter automatically (they ARE those components); cell values
  never bound to matrix.value directly (§2).
- **4 (StyleSheet + tokens):** a new **`matrix` recipe** (`src/theme-rn/recipes/matrix.ts`)
  slots into the `Recipes` interface + `buildRecipes` map + barrel (the `row.ts`
  prebuild-legal-tuples / select-at-render pattern; narrow/RTL are SELECT-time
  inputs, not cache keys). Fragments authored from v2.5.33 matrix SCSS: grid
  lines, header cell, row-header cell, alternate rows, vertical-align, selected/
  checked/error, card, add/remove/detail buttons. Reuse `row`/`button`/`item`/
  `questionChrome`/`overlay`/`listItem` recipes where possible. A12 consumer
  override slot key `matrix`.
- **5 (hybrid styling):** the recipe owns native interaction state (pressed/RTL/
  alternate-row/vertical-align); class-token mapping only for model-derived state
  from CssClassBuilder strings (`getItemClass`, rendered `cell.className`,
  `row.className` — `hasError`/`answered`/`itemChecked`/`itemDisabled`). Never
  re-derive those booleans in the component.
- **6 (capability libs, lazy):** add/remove/detail icons via `RNIcon` (lazy
  `react-native-svg`); gesture-handler + reanimated only when 4.3 drag lands, NOT
  in 3.x.
- **7 (non-throwing fallback):** unsupported cellType → `createUnsupportedQuestion`;
  deferred sub-features (drag, transpose if deferred) degrade with a deferred,
  deduped diagnostic (ImageQuestion/paneldynamic pattern), never crash.
- **8 (no DOM/afterRender):** bypass `renderedTable`'s HTMLElement contracts
  (`afterRenderQuestionElement`, `setRootElement`, `focusCell` querySelector, DOM
  animations, `DragDropMatrixRows`, `matrixAfterCellRender`); mobile detection is
  the survey `onLayout`→`setIsMobile` path, not a `ResizeObserver`. `onMatrixAfterCellRender`
  is not fired (repo-wide no-afterRender posture).
- **9 (fallback):** see 7. Simple-matrix `isExclusive` + rubric cells and the
  detail/totals paths each degrade independently.

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
  `isMobile`, the rendered `cell.hasQuestion`/`hasPanel`/`hasTitle`/`isChoice`/
  `isCheckbox`/`isRadio`/`isFirstChoice`/`choiceIndex`/`item`/
  `isActionsCell`/`isDragHandlerCell`/`isErrorsCell`/`row.isErrorsRow`/
  `colSpans`/`width`/`minWidth`/
  `showResponsiveTitle`/`responsiveLocTitle`, `addRowUI`/`removeRowUI`,
  `canAddRow`/`canRemoveRows`/`canRemoveRow`, `getShowColumnsIfEmpty`,
  the **`keyName` duplication group** — `keyName`, `keyDuplicationError`,
  `isValueInColumnDuplicated`, `getDuplicationError`, `KeyDuplicationError`
  (private on the matrix, so read behaviorally via a cell question's `errors`;
  isolate any cast per the 2.5 R3 adapter pattern),
  `MatrixDropdownRowModelBase` (`cells`/`getQuestionByColumn`/`detailPanel`/
  `isDetailPanelShowing`/`showHideDetailPanelClick`/`onDetailPanelShowingChanged`/
  `isRowEnabled`), `MatrixRowModel` (`isChecked`/`cellClick`/`value`/`hasError`),
  the extracted `QuestionErrors` unit + `question.renderedErrors` /
  `currentNotificationType` (§2a).
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
   default-minWidth table + `getColumnWidth` inputs, the two-regime
   fit-vs-overflow distribution (no shrink on overflow), `percentBase` semantics,
   the one dp array applied to header/body/footer, AND the measurement contract:
   measure ONLY the OUTER pre-scroll root View, never a `width>0`-gated box
   inside the horizontal ScrollView content (the `SurveyRow.tsx` device bug).
3. **Chrome-less cell dispatch + inline errors + `showInMultipleColumns` choice
   cells** (§2, §2a, §2b) — the `QuestionErrors` extraction prerequisite, the
   explicit skip of core's `isErrorsRow`/`isErrorsCell`, the `isChoice` branch
   (one item per cell, `columnColCount` arrangement), and OverlayContext flow for
   cell dropdowns through the registered `…QuestionElement` wrappers.
4. **renderedTable reactivity + render purity + the two-level component split**
   (§4) — deferred-ensure materialization, non-creating backing read, StrictMode
   latch reset; the OUTER-subscribes-`question` + `onRenderedTableResetCallback`,
   INNER-subscribes-current-`renderedTable`-and-re-attaches-on-identity-change
   split; and the TDD confirmation that in-place `renderedRows` mutations notify
   without firing the reset callback.
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
| **3.1a** | `MatrixGrid` primitive I: flex-View grid, normalized `GridContract`, the **column-width allocation algorithm** (per-cellType `columnWidthsByType` floors, two-regime fit/overflow, no-shrink) with the shared dp array applied to header↔body↔footer, the **measurement contract** (outer pre-scroll root View only), a **single horizontal ScrollView** with the row-header column INSIDE the scroll content (header+body scroll together, natural per-row flex height, no split-pane, no height-sync). | M | ✅ |
| **3.1b** | `MatrixGrid` primitive II: mobile stacked-card path (`isMobile`/`displayMode`); **OPTIONAL** sticky first (row-header) column split-pane + **bidirectional** per-row height sync — gated on measured acceptability of the 3.1a baseline (ships only if needed); RTL fixed-pane side + horizontal-scroll-start flip lives here. | M | ✅ (sticky part) |
| **3.2** | `matrix` (simple): radio/checkbox tiles via `row.cellClick`/`row.isChecked`, single + multi-select (`cellType:"checkbox"` + `isExclusive`), `hasCellText` rubric cells, `eachRowRequired`/`eachRowUnique` per-row errors, `rowOrder` random, `visibleRowsChangedCallback`. Builds the `GridContract` from `visibleColumns/visibleRows`. | M | |
| **3.3a-pre** | **PREREQUISITE (CORE): extract a reusable `QuestionErrors` renderer** from the private `QuestionChrome.renderErrors` (over `question.renderedErrors` / `currentNotificationType`); `QuestionChrome` re-consumes it (no behavior change, existing chrome test stays green). Blocks all chrome-less cell dispatch — without it, cell errors are invisible. | S | ✅ |
| **3.3a** | `MatrixTableBase` + `MatrixDropdownQuestion` (static rows): two-level renderedTable component split + reset reactivity + render purity, chrome-less cell dispatch, header, **inline cell errors via `QuestionErrors` (explicitly skip core's `isErrorsRow`/`isErrorsCell`)**, **`showInMultipleColumns` `'choice'` cells (one item per cell, `columnColCount` arrangement)**, **`readOnly` cells (`isRowEnabled` false → display-mode)**, **faithful vertical render when `isColumnLayoutHorizontal===false` on wide screen (`transposeData`) + deduped diagnostic**. | L | partial (base) |
| **3.3b** | Detail panels (`detailPanelMode` underRow/underRowSingle via `SurveyPanel`) + totals footer row (expression cells; horizontal-only, absent in mobile/transposed — read `showFooter`). Shared with 3.4. | M | |
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
  header/body/footer (alignment assertion on the ONE dp array); per-cellType
  `columnWidthsByType` floor is read (a `comment` column floors at 200px, `file`
  at 240px) and `getColumnWidth` precedence (`column.minWidth` > `columnMinWidth`
  > per-cellType default) holds; **regime (a) fit** distributes remainder to auto
  columns above their floor and the grid exactly fills `measuredWidth` (inert
  ScrollView); **regime (b) overflow** keeps intrinsic/min widths, does NOT shrink,
  and total content width exceeds `measuredWidth` (scrollable); `%` width uses
  `measuredWidth` as `percentBase`; **measurement contract**: width is read from
  the OUTER pre-scroll root View and a `width>0`-gated box inside the ScrollView
  content would NEVER unblock — assert the grid does not render blank (the
  `SurveyRow` device-bug regression); the one-frame defer (no render before
  measurement); row-header column is the first cell INSIDE the scroll content and
  scrolls with the body; each row's cells share height via natural flex (no
  height-sync in baseline).
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
  a standalone render of a question with errors shows them.
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
  column change AND the inner component re-attaches to the NEW renderedTable
  instance after a reset (old instance detached); an in-place `renderedRows`
  mutation (add row) re-renders WITHOUT firing the reset callback; detail panel
  expands/collapses (`onDetailPanelShowingChanged`), underRowSingle closes others;
  totals footer computes `sumInArray` read-only AND is ABSENT in mobile/transposed
  (`showFooter` false); **`showInMultipleColumns`** explodes a choice column into
  per-choice `isChoice` cells that render ONE item each (not N whole checkboxes),
  arranged by `columnColCount`, selection driven by `cell.question.isChecked`;
  **`readOnly` cells** (`isRowEnabled` false) render in display mode; **transposed**
  (`transposeData:true`, wide screen) renders the vertical `renderedRows`
  faithfully + a deduped diagnostic (not forced horizontal).
- **3.4 matrixdynamic:** add button present when `canAddRow`, ABSENT at
  `maxRowCount`; `addRowUI()` adds a row that renders; remove per row via
  `removeRowUI(row)` → confirm through OverlayHost (confirm removes / cancel
  retains / no-host fail-safe cancel — the model-adapter path is already covered
  by dialog-adapter tests; test only the RN Pressable→dialog wiring); ABSENT at
  `minRowCount`; `lockedRowCount` + `matrixAllowRemoveRow` honored; empty-state
  placeholder + first-row add; value is the array shape `[{col:val}]`;
  `MinRowCountError` when required; **`keyName`/`isUnique` duplication regression:
  two rows with the same value in the `keyName` column → core adds a
  `KeyDuplicationError` (`keyDuplicationError` text) onto the offending
  `cell.question`, which renders inline via `QuestionErrors` under that cell;
  correcting the duplicate clears it** (exercises §2a's data-integrity path end
  to end); drag handle inert (4.3 not yet).
- Cross-cutting: model retarget (swap the `question` prop → callbacks detach old/
  attach new); unmount detaches (no setState-after-unmount); RTL — in the 3.1a
  single-ScrollView baseline the row-header is just the first flex cell, so
  logical start/end (A7) handles RTL for free (no explicit flip needed); the
  fixed-pane side + horizontal-scroll-start flip is a 3.1b concern that only
  arises IF the optional sticky split-pane ships; fixtures reused from
  survey-library's matrix test suites.

---

## 10. DIFFERENCES.md entries the family will add (M3 section)

1. **No `<table>`** — matrix family renders a flex-`View` grid + horizontal
   `ScrollView`, not an HTML table; colSpan → a spanned View, full-width rows
   (detail/footer/empty) ignore per-column widths. Columns are dp-resolved once
   and shared across header/body/footer for alignment (no browser auto-layout).
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
   `renderQuestionBody`). Cell errors are rendered by a reusable `QuestionErrors`
   unit extracted from `QuestionChrome`, inline under the cell body; the walker
   skips core's rendered `isErrorsRow`/`isErrorsCell` so errors show exactly once.
   The top/bottom `cellErrorLocation` separate error row collapses to inline in
   v0.3.
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
14. **Totals footer is horizontal-only** — `showFooter = hasFooter &&
    isColumnLayoutHorizontal`, so totals are absent in mobile/card mode and in
    the transposed layout (web parity); no totals on phones.
15. **`showInMultipleColumns` renders one choice item per cell** — a checkbox/
    radiogroup column with `showInMultipleColumns` is exploded by core into
    per-choice `isChoice` cells sharing one question; RN renders a single
    radio/checkbox item per cell (not the whole control N times), arranged by
    `columnColCount`.
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
   distinct `'choice'` render path (one item per cell, `columnColCount`
   arrangement) — core already flattens the explosion into renderedTable cells
   sharing one question, so whole-question dispatch would be wrong (§2b,
   DIFFERENCES 15).
3. **Non-creating `renderedTable` read** — does `getPropertyValueWithoutDefault("renderedTable")`
   (or an equivalent backing accessor) exist for render-pure reads, or must we
   deferred-ensure + inert-placeholder-tick like rating? Probe at TDD (gates the
   §7.4 CORE design). STILL OPEN (probe).
4. **Sticky first column vs single-ScrollView baseline** — RESOLVED: **ship the
   single horizontal ScrollView (row-header inside scroll content, header+body
   together, no sticky, no height-sync) as the 3.1a wide-screen default.** The
   split-pane + bidirectional height-sync is a deferred, OPTIONAL 3.1b enhancement
   that ships only if the baseline proves insufficient — removing the highest-risk
   mechanism from the critical path (§3a.5, §7.5).
5. **Simple-matrix single-input / `inputPerPage` mode** (`getMatrixSingleInputQuestions`,
   `MatrixSingleInputBehavior`, `QuestionSingleInputSummary`) — in scope for M3
   (3.5 is `singleinputsummary`) or a documented non-goal for the matrix types?
   Confirm scope of 3.5 relative to the matrix family.
6. **`focusable-cell` / keyboard grid nav** — RESOLVED: **documented v0.3
   NON-GOAL.** No question renderer currently calls `registry.registerElement`
   (only `Survey.tsx` registers the scroll host; focusable-component registration
   is a future task), so there is no automatic cell focus to claim. Cross-grid
   cell focus / keyboard nav is deferred and documented (DIFFERENCES 9),
   consistent with the a11y deviations; vertical scroll-to works, horizontal and
   programmatic cell focus do not. Revisit when focusable-component registration
   lands repo-wide.
7. **Per-cell element wrapper** (`onGetElementWrapperComponent` / `wrapMatrixCell`)
   — stub as a no-op in v0.3 (document) or wire an RN cell-wrapper contract? Lean:
   no-op + DIFFERENCES.
8. **Does matrix need its own `processResponsiveness` loop** (buttongroup-style)
   so a wide matrix stacks on a wide screen when intrinsic width exceeds
   available, or is the survey-level 600px `isMobile` flip sufficient for v0.3?
   Lean: survey flag only for v0.3 (DIFFERENCES 4); revisit in 6.2 if profiling
   shows wide-grid pain.
