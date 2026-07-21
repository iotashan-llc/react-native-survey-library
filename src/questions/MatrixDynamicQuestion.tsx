/**
 * `matrixdynamic` (dynamic rows) question — task M3 3.4 (design:
 * docs/design/M3-matrix-family-plan.md §1, §2b, §3e, §4, phasing row
 * 3.4a). A THIN consumer of the shared `MatrixTableBase` through the §1
 * per-consumer hooks (the `OverlayControlBase` analogy — do NOT fork a
 * second base):
 *
 * - `renderAboveTable`/`renderBelowTable` → add-row buttons driven
 *   DIRECTLY off `renderedTable.showAddRowOnTop`/`showAddRowOnBottom`
 *   (§3e — core computes placement from `getAddRowLocation()`; never
 *   recompute it here), captioned `locAddRowText`, pressing
 *   **`addRowUI()`** (guards live in core).
 * - `getEmptyState` → the `noRowsText` placeholder rendered precisely
 *   when `renderedTable.showTable === false` (hideColumnsIfEmpty + no
 *   rows); its add button gates SEPARATELY on the STANDALONE
 *   `renderedTable.showAddRow` (NOT showAddRowOnTop/Bottom, both false
 *   while the table is hidden — the §3e polarity trap).
 *
 * Row REMOVAL is not here: the shared per-action walk in
 * `MatrixTableBase` renders each `remove-row` action as a
 * `MatrixRemoveRowButton` → `removeRowUI(row)` → core's `confirmDelete`
 * → `settings.showDialog` → the 2.2 dialog adapter (§2b/§3e). Row drag
 * reorder is DEFERRED to 4.3 — the drag-handle cell renders inert (§3f,
 * DIFFERENCES 7).
 *
 * The element wrapper is the family-shape pass-through (like
 * `MatrixDropdownQuestionElement`): cell overlays get their
 * OverlayContext through the per-cell dispatch, not from this wrapper.
 */
import * as React from 'react';
import { Pressable, View } from 'react-native';
import type {
  LocalizableString,
  QuestionMatrixDropdownRenderedTable,
  QuestionMatrixDynamicModel,
} from '../core/facade';
import { MatrixTableBase } from '../components/matrix/MatrixTableBase';
import type { MatrixTableBaseProps } from '../components/matrix/MatrixTableBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';

export type MatrixDynamicQuestionProps = MatrixTableBaseProps;

/** The loc-string getters the renderer binds beyond the typed model
 * surface (present on the prototype in v2.5.33; typings omit them —
 * verified by the api-surface watchlist + this component's tests). */
type MatrixDynamicLocStrings = {
  locAddRowText: LocalizableString;
  locNoRowsText: LocalizableString;
};

export class MatrixDynamicQuestion extends MatrixTableBase<MatrixDynamicQuestionProps> {
  private get matrixDynamic(): QuestionMatrixDynamicModel &
    MatrixDynamicLocStrings {
    return this.questionBase as unknown as QuestionMatrixDynamicModel &
      MatrixDynamicLocStrings;
  }

  private renderAddRowButton(
    placement: 'top' | 'bottom' | 'placeholder'
  ): React.JSX.Element {
    const matrix = this.matrixDynamic;
    const fragments = this.themeContext.recipes.matrix.fragments;
    const disabled = matrix.isInputReadOnly;
    return (
      <Pressable
        testID={`matrixdynamic-add-${placement}`}
        accessibilityRole="button"
        accessibilityLabel={matrix.addRowText}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => matrix.addRowUI()}
        style={fragments.addRowButton}
      >
        {SurveyElementBase.renderLocString(
          matrix.locAddRowText,
          fragments.addRowText
        )}
      </Pressable>
    );
  }

  protected renderAboveTable(
    table: QuestionMatrixDropdownRenderedTable
  ): React.ReactNode {
    return table.showAddRowOnTop ? this.renderAddRowButton('top') : null;
  }

  protected renderBelowTable(
    table: QuestionMatrixDropdownRenderedTable
  ): React.ReactNode {
    return table.showAddRowOnBottom ? this.renderAddRowButton('bottom') : null;
  }

  protected getEmptyState(
    table: QuestionMatrixDropdownRenderedTable
  ): React.ReactNode {
    const matrix = this.matrixDynamic;
    const fragments = this.themeContext.recipes.matrix.fragments;
    return (
      <View testID="matrixdynamic-placeholder" style={fragments.placeholder}>
        {SurveyElementBase.renderLocString(
          matrix.locNoRowsText,
          fragments.placeholderText
        )}
        {table.showAddRow ? this.renderAddRowButton('placeholder') : null}
      </View>
    );
  }
}

export function MatrixDynamicQuestionElement(
  props: MatrixDynamicQuestionProps
): React.JSX.Element {
  return <MatrixDynamicQuestion {...props} />;
}
