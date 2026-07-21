/**
 * `matrix` (simple, single/multi-select) question — task M3 3.2 (design:
 * docs/design/M3-matrix-family-plan.md §1, §3.2, §3b, §4, §6). A
 * `QuestionMatrixModel` renders as radio/checkbox item TILES laid out over
 * the merged 3.1a `MatrixGrid` primitive (via `MatrixGridRoot`, which owns
 * measurement + column-width allocation). Simple matrix has **no
 * `renderedTable` and no nested cell questions** — it walks
 * `visibleColumns × visibleRows` directly and each cell drives
 * `row.cellClick(column)` / `row.isChecked(column)` (§1: "cells are
 * radio/checkbox item tiles ... NO nested questions").
 *
 * The OWNER split (design §3 "MatrixGrid ownership"): `MatrixQuestion`
 * builds the RAW, core-decoupled `GridContract` from the model and hands
 * it to `MatrixGridRoot`; the root measures the outer pre-scroll View,
 * resolves the dp column widths once (§3a.3), and hands a resolved
 * contract to the presentational `MatrixGrid`.
 *
 * Reactivity (invariant 2, class-based — the paneldynamic 2.8a discipline):
 * `MatrixQuestion` subscribes the question (value/css/loc) AND registers
 * `visibleRowsChangedCallback` (single-assignment field, one stable bound
 * handler → `setState`; attach in `componentDidMount`, retarget-safe in
 * `componentDidUpdate`, guarded-clear in `componentWillUnmount`). Each cell
 * is its own reactive `SurveyElementBase` whose `getStateElements()` is
 * `[row, row.item]` — the `MatrixRowModel` carries value/`hasError`
 * notifications, and the row's `ItemValue` carries the `enableIf` flips
 * (core's `ItemValue.runEnabledConditionsForItems` →
 * `item.setIsEnabled` notifies the ITEM, which is what the web
 * `SurveyQuestionMatrixRow` subscribes: `getStateElement → row.item`,
 * reactquestion_matrix.tsx). A cell tap re-renders exactly that row's
 * cells (value → checked) and a validation pass (`row.hasError`)
 * re-renders the row header's error marker — the merged `MatrixGrid`
 * primitive renders cells individually, so the reactive unit is the
 * per-cell/per-row-header component subscribed to the row+item, not a
 * single row wrapper.
 *
 * Tile state (invariant 6): `checked`/`readOnly`/`error` are read from the
 * MatrixRowModel's OWN computed getters — `row.isChecked(column)` /
 * `row.isReadOnly` / `row.hasError` (the task's "selected state from
 * row.value/isChecked"; these ARE core's model-state, not a re-derivation
 * of its logic). The tile decorator reuses the shared `item` recipe
 * (radio dot / checkbox check via `selectItemStyles`/`RNIcon`), exactly
 * like `ChoiceItemRow`. (The select-tuned `getItemVariant` bridge is NOT
 * used here: its ITEM exemplar targets `QuestionSelectBase`'s cssClasses +
 * `formatCss`'d `{type}` tokens, which do not match the matrix
 * `getItemClass` string — a matrix bridge exemplar is deferred.)
 *
 * Errors: whole-question `RequiredInAllRowsError`/`EachRowUniqueError`
 * surface through the normal `QuestionChrome` error slot (matrix dispatches
 * as an ordinary chrome-wrapped question). Per-row `eachRowRequired`/
 * `eachRowUnique` state additionally tints the row's tiles (item error
 * decorator) and marks the row header inline.
 */
import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type {
  Base,
  ItemValue,
  LocalizableString,
  QuestionMatrixModel,
  MatrixRowModel,
} from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { MatrixGridRoot } from '../components/matrix/MatrixGridRoot';
import type {
  GridColumn,
  GridContract,
  GridRow,
} from '../components/matrix/grid-contract';
import type { MatrixWidthConfig } from '../layout/matrix-column-widths';
import {
  selectItemStyles,
  selectIconFill,
  composeStyles,
} from '../theme-rn/recipes';
import { RNIcon } from '../components/RNIcon';

/**
 * Default checkbox check icon (survey-core defaultCss `itemSvgIconId`).
 * The tile uses this constant directly rather than reading
 * `question.itemSvgIcon` in render: that getter dereferences
 * `question.cssClasses`, which is built LAZILY on first access and fires a
 * `cssRoot` property change — building it inside a cell's render would
 * notify the question subscriber (`MatrixQuestion`) mid-render (a
 * setState-in-render). Consumer `itemSvgIconId` customization of the check
 * glyph is therefore not honored in v0.3 (render-purity trade-off).
 */
const DEFAULT_CHECK_ICON = 'icon-check-16x16';

/**
 * THE isolated protected-API cast (the repo's single-cast pattern, cf.
 * ButtonGroupQuestion R3): core's `hasCssError()` (question.ts:1491-1498)
 * is protected but PURE — it walks `this.errors` for a visible error and
 * falls back to `hasCssErrorCallback()`; it never touches `cssClasses` or
 * any lazily-built css state, so it is safe to call in render. It is the
 * exact gate core's `getItemClass` uses to tint every tile when neither
 * `eachRowRequired` nor `eachRowUnique` is set.
 */
function questionHasCssError(question: QuestionMatrixModel): boolean {
  return (question as unknown as { hasCssError(): boolean }).hasCssError();
}

/** The subset of MatrixColumn/ItemValue the tile + contract read. */
interface MatrixColumnLike {
  value: unknown;
  text: string;
  locText: LocalizableString;
  uniqueId: number;
}

interface MatrixCellProps {
  question: QuestionMatrixModel;
  row: MatrixRowModel;
  column: MatrixColumnLike;
}

/**
 * One reactive matrix data cell — a radio/checkbox tile (or a rubric text
 * cell when `hasCellText`). Subscribes the MatrixRowModel AND its backing
 * `ItemValue` (`getStateElements → [row, row.item]`): the row carries
 * value/`hasError` changes, the item carries `enableIf` enabled-flips
 * (core notifies the ITEM — `ItemValue.setIsEnabled` → `setPropertyValue`;
 * web subscribes `row.item`, reactquestion_matrix.tsx). The base dedupes.
 */
class MatrixSimpleCell extends SurveyElementBase<MatrixCellProps> {
  protected getStateElements(): Base[] {
    return [
      this.props.row as unknown as Base,
      this.props.row.item as unknown as Base,
    ];
  }

  private handlePress = (): void => {
    this.props.row.cellClick(this.props.column as unknown as ItemValue);
  };

  protected renderElement(): React.JSX.Element {
    const { question, row, column } = this.props;
    const columnItem = column as unknown as ItemValue;
    const { recipes, styles: overrides } = this.themeContext;
    const mode = this.themeContext.mode;
    const frag = recipes.matrix.fragments;

    const checked = row.isChecked(columnItem);
    const disabled = row.isReadOnly;
    // Preview state (core survey-element.ts `isPreviewStyle` — a pure
    // `survey.state === "preview"` read). Web suppresses readOnly styling
    // while previewing (`isReadOnlyStyle = isReadOnly && !isPreview`); the
    // Pressable stays disabled either way (core's cellClick no-ops).
    const preview = question.isPreviewStyle;
    const readOnlyStyle = disabled && !preview;
    // Error tint, exactly core's getItemClass gate (question_matrix.ts):
    // `eachRowRequired || eachRowUnique ? row.hasError : hasCssError()` —
    // per-row tint when a row-level rule is on, otherwise every tile tints
    // on a question-level visible error. `hasCssError()` is a PURE
    // protected read (see questionHasCssError above), so calling it in
    // render is safe.
    const error =
      question.eachRowRequired || question.eachRowUnique
        ? row.hasError
        : questionHasCssError(question);
    const shape = question.isMultiSelect ? 'checkbox' : 'radio';
    const rowName = String(row.name);
    const colValue = String(column.value);
    const testID = `matrix-tile-${rowName}-${colValue}`;
    const ariaLabel = question.getCellAriaLabel(row, columnItem);

    const accessibility = {
      accessibilityRole: shape as 'radio' | 'checkbox',
      accessibilityState: { checked, disabled },
      accessibilityLabel: ariaLabel,
    };

    if (question.hasCellText) {
      // Deliberate web divergence (DIFFERENCES, "Rubric cell lookup"): web
      // passes RAW `row.name`, and a NUMERIC row value is then misread as
      // a row INDEX by MatrixCells.getCellRowColumnValue
      // (question_matrix.ts) — resolving the wrong row's rubric text. The
      // cells JSON is string-keyed, so the stringified name is the correct
      // lookup key for every row value.
      const loc = question.getCellDisplayLocText(rowName, columnItem);
      return (
        <Pressable
          testID={testID}
          disabled={disabled}
          onPress={this.handlePress}
          {...accessibility}
          style={[frag.rubricCell, checked ? frag.rubricCellSelected : null]}
        >
          {this.renderLocString(
            loc,
            checked ? frag.rubricTextSelected : frag.rubricText
          )}
        </Pressable>
      );
    }

    return (
      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={this.handlePress}
        {...accessibility}
        style={frag.tile}
      >
        {({ pressed }) => {
          const selected = selectItemStyles(
            recipes.item,
            {
              checked,
              pressed,
              focused: false,
              readOnly: readOnlyStyle,
              preview,
              error,
              allowHover: false,
            },
            mode,
            shape
          );
          const iconFill = selectIconFill(recipes.item, {
            checked,
            focused: false,
            readOnly: readOnlyStyle,
            preview,
          });
          return (
            <View
              style={composeStyles(selected.decorator, {
                override: overrides.item?.decorator,
              })}
            >
              {checked && (shape === 'checkbox' || preview) ? (
                // Preview swaps the radio dot for the check glyph too:
                // core's `itemSvgIcon` returns `itemPreviewSvgIconId`
                // ("#icon-check-16x16") while previewing.
                <RNIcon
                  testID={`${testID}-check-icon`}
                  iconName={DEFAULT_CHECK_ICON}
                  size={recipes.item.iconSize}
                  fill={iconFill}
                />
              ) : null}
              {checked && shape === 'radio' && !preview ? (
                <View
                  style={{
                    width: recipes.item.iconSize * 0.5,
                    height: recipes.item.iconSize * 0.5,
                    borderRadius: (recipes.item.iconSize * 0.5) / 2,
                    backgroundColor: iconFill,
                  }}
                />
              ) : null}
            </View>
          );
        }}
      </Pressable>
    );
  }
}

interface MatrixRowHeaderProps {
  question: QuestionMatrixModel;
  row: MatrixRowModel;
}

/** Reactive row-header cell — renders the row title and an inline error
 * marker when the row is flagged (`row.hasError`, eachRowRequired/unique).
 * Subscribes `[row, row.item]` like the data cells: the item carries
 * `enableIf` flips and loc/text changes on the backing ItemValue. */
class MatrixRowHeaderCell extends SurveyElementBase<MatrixRowHeaderProps> {
  protected getStateElements(): Base[] {
    return [
      this.props.row as unknown as Base,
      this.props.row.item as unknown as Base,
    ];
  }

  protected renderElement(): React.JSX.Element {
    const { row } = this.props;
    const frag = this.themeContext.recipes.matrix.fragments;
    const hasError = row.hasError;
    const rowName = String(row.name);
    return (
      <View testID={`matrix-rowheader-${rowName}`}>
        {this.renderLocString(
          row.locText,
          hasError ? frag.rowHeaderTextError : frag.rowHeaderText
        )}
        {hasError ? (
          <View
            testID={`matrix-rowheader-error-${rowName}`}
            style={frag.rowHeaderErrorMarker}
          />
        ) : null}
      </View>
    );
  }
}

export type MatrixQuestionProps = QuestionElementBaseProps;

/**
 * The simple-matrix question renderer + `GridContract` owner. Extends
 * `QuestionElementBase` (subscribes the question). The per-row/per-cell
 * reactivity lives in the cell components above.
 */
export class MatrixQuestion extends QuestionElementBase<MatrixQuestionProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get matrix(): QuestionMatrixModel {
    return this.questionBase as QuestionMatrixModel;
  }

  /** Single-assignment `visibleRowsChangedCallback` field, one stable bound
   * handler (setState, not forceUpdate) — paneldynamic 2.8a discipline. */
  private boundQuestion: QuestionMatrixModel | null = null;
  private readonly handleRowsChanged = (): void => {
    this.setState((state) => ({ __svRev: (state.__svRev ?? 0) + 1 }));
  };

  private attachCallbacks(q: QuestionMatrixModel): void {
    q.visibleRowsChangedCallback = this.handleRowsChanged;
    this.boundQuestion = q;
  }

  /** Guarded clear: only null a field still pointing at OUR handler. */
  private detachCallbacks(q: QuestionMatrixModel): void {
    if (q.visibleRowsChangedCallback === this.handleRowsChanged) {
      q.visibleRowsChangedCallback = undefined as never;
    }
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.attachCallbacks(this.matrix);
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    const q = this.matrix;
    if (this.boundQuestion && this.boundQuestion !== q) {
      this.detachCallbacks(this.boundQuestion);
      this.attachCallbacks(q);
    }
  }

  componentWillUnmount(): void {
    if (this.boundQuestion) this.detachCallbacks(this.boundQuestion);
    this.boundQuestion = null;
    super.componentWillUnmount();
  }

  /** Build the RAW GridContract from `visibleColumns × visibleRows`. Raw
   * width/minWidth strings mirror simple-matrix web
   * (reactquestion_matrix.tsx): each data column takes `columnMinWidth` as
   * BOTH width and floor, the row-header column takes `rowTitleWidth`. */
  private buildContract(): GridContract {
    const question = this.matrix;
    const hasRows = question.hasRows;
    const columnMinWidth = question.columnMinWidth || undefined;
    const rowTitleWidth = question.rowTitleWidth || undefined;
    const visibleColumns = question.visibleColumns as MatrixColumnLike[];

    const columns: GridColumn[] = [];
    if (hasRows) {
      columns.push({
        key: '__rowheader',
        header: null,
        isRowHeader: true,
        width: rowTitleWidth,
        minWidth: rowTitleWidth,
      });
    }
    for (const column of visibleColumns) {
      // Keyed off the ItemValue's `uniqueId` (web parity —
      // reactquestion_matrix.tsx keys headers by `column.uniqueId`):
      // column values are NOT unique post-String() (`1` vs `"1"`
      // collide), while the visibleColumns ItemValue instances persist.
      columns.push({
        key: `col-${column.uniqueId}`,
        header: this.renderLocString(column.locText),
        width: columnMinWidth,
        minWidth: columnMinWidth,
      });
    }

    const rows: GridRow[] = (question.visibleRows as MatrixRowModel[]).map(
      (row) => {
        const rowName = String(row.name);
        const cells = [];
        if (hasRows) {
          cells.push({
            key: `${rowName}:__rowheader`,
            kind: 'title' as const,
            render: (): React.ReactNode => (
              <MatrixRowHeaderCell question={question} row={row} />
            ),
          });
        }
        for (const column of visibleColumns) {
          cells.push({
            key: `${rowName}:col-${column.uniqueId}`,
            kind: 'choice' as const,
            render: (): React.ReactNode => (
              <MatrixSimpleCell question={question} row={row} column={column} />
            ),
          });
        }
        // Row keys stay the row NAME — a documented stability tradeoff,
        // the opposite call from the columns above: MatrixRowModel
        // instances are destroyed/rebuilt by `clearGeneratedRows()` on any
        // rows change, and a wholesale `question.rows = [...]` assignment
        // mints NEW ItemValues (fresh uniqueIds), so a uniqueId key would
        // remount every surviving row; the name reconciles them in place.
        // Duplicate row values are rejected by core's row schema
        // (`uniqueProperty: "value"`), so name collisions cannot occur.
        return {
          key: rowName,
          kind: 'data' as const,
          cells,
          getStateElement: (): Base => row as unknown as Base,
        };
      }
    );

    return {
      columns,
      rows,
      showHeader: question.showHeader,
      hasFooter: false,
      mobile: question.isMobile,
      stickyFirstColumn: false,
    };
  }

  protected renderElement(): React.JSX.Element {
    const question = this.matrix;
    const config: MatrixWidthConfig = {
      columnMinWidth: question.columnMinWidth || undefined,
    };
    return (
      <View testID="matrix" style={localStyles.container}>
        <MatrixGridRoot contract={this.buildContract()} config={config} />
      </View>
    );
  }
}

/**
 * OverlayContext-free element wrapper (design §6). Simple matrix has no
 * nested cell dropdowns, so — unlike `DropdownQuestionElement` — this
 * wrapper binds NO overlay stack; it exists only to keep the family's
 * `…QuestionElement` registration shape uniform. Kept a thin pass-through.
 */
export function MatrixQuestionElement(
  props: MatrixQuestionProps
): React.JSX.Element {
  return <MatrixQuestion {...props} />;
}

const localStyles = StyleSheet.create({
  container: { alignSelf: 'stretch' } as ViewStyle,
});
