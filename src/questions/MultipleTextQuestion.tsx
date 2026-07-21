/**
 * `multipletext` question (task 2.6) — RN port of survey-react-ui's
 * `SurveyQuestionMultipleText` (reactquestion_multipletext.tsx).
 *
 * Core owns the grid (invariant 6): `question.getRows()` yields rows
 * (`isVisible`, `cells`); an item cell's `cell.item.editor` IS a real
 * `QuestionTextModel` (question_multipletext.ts:131) — rendered through
 * the existing `TextQuestion`, so inputTypes, masks, the 1.9
 * draft/commit adapter, and validation all apply unchanged. Error cells
 * (`isErrorsCell`) render the row's editor errors; their row visibility
 * is core-driven (`itemErrorLocation`).
 *
 * Web's `<table>` becomes column-per-cell flex rows (same spirit as the
 * checkbox column grid — no table primitive in RN). Item titles render
 * through the locstring viewer (`item.locTitle`).
 */
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Base, LocalizableString, Question } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { TextQuestion } from './TextQuestion';

interface MultipleTextItemLike {
  name: string;
  locTitle: LocalizableString;
  editor: Question;
}

interface MultipleTextCellLike {
  item?: MultipleTextItemLike;
  isErrorsCell: boolean;
}

interface MultipleTextRowLike {
  isVisible: boolean;
  cells: MultipleTextCellLike[];
}

interface MultipleTextModelLike {
  name: string;
  getRows(): MultipleTextRowLike[];
}

export class MultipleTextQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get multipleText(): MultipleTextModelLike {
    return this.questionBase as unknown as MultipleTextModelLike;
  }

  private renderErrors(editor: Question): React.JSX.Element[] {
    // Core-filtered renderedErrors (not raw errors — upstream's
    // SurveyElementErrors path), each through the locstring renderer so
    // rich/Markdown error text renders instead of showing HTML.
    return (
      editor as unknown as { renderedErrors: Question['errors'] }
    ).renderedErrors.map((error, index) => (
      <Text
        key={`err-${index}`}
        accessibilityRole="alert"
        testID={`sv-multipletext-error-${editor.name}-${index}`}
      >
        {SurveyElementBase.renderLocString(
          (error as { locText: LocalizableString }).locText,
          undefined,
          `err-text-${index}`,
          'error'
        )}
      </Text>
    ));
  }

  private renderCell(
    cell: MultipleTextCellLike,
    index: number
  ): React.JSX.Element | null {
    if (!cell.item)
      return <View key={`cell-${index}`} style={localStyles.cell} />;
    const { item } = cell;
    if (cell.isErrorsCell) {
      return (
        <View key={`cell-${index}`} style={localStyles.cell}>
          {this.renderErrors(item.editor)}
        </View>
      );
    }
    return (
      <View key={`cell-${index}`} style={localStyles.cell}>
        {SurveyElementBase.renderLocString(
          item.locTitle,
          undefined,
          `title-${item.name}`,
          'title'
        )}
        <TextQuestion question={item.editor} creator={this.creator} />
      </View>
    );
  }

  protected renderElement(): React.JSX.Element {
    const rows = this.multipleText.getRows();
    return (
      <View testID={`sv-multipletext-${this.multipleText.name}`}>
        {rows.map((row, rowIndex) =>
          row.isVisible ? (
            <View
              key={`row-${rowIndex}`}
              testID={
                row.cells.some((cell) => cell.isErrorsCell)
                  ? 'sv-multipletext-error-row'
                  : 'sv-multipletext-row'
              }
              style={localStyles.row}
            >
              {row.cells.map((cell, cellIndex) =>
                this.renderCell(cell, cellIndex)
              )}
            </View>
          ) : null
        )}
      </View>
    );
  }
}

// Layout-only scaffolding (structure, not theme); colors/typography come
// from the item editors' own recipes.
const localStyles = StyleSheet.create({
  cell: { flex: 1 },
  row: { flexDirection: 'row', gap: 16 },
});
