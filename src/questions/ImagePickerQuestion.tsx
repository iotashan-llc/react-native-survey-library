/**
 * `imagepicker` question (task 2.7) — a grid of image CHOICE tiles; tap
 * to select (single-select sets the scalar value; `multiSelect` toggles
 * array membership). Standalone: no overlay. Plan:
 * docs/design/2.7-imagepicker-plan.md.
 *
 * - Each tile is a Pressable with an `Image` loaded through the central
 *   URI policy (invariant 8: `validateUri(rawUri, 'image', policy)`,
 *   fail-closed) — same policy path as ImageQuestion (2.10); a blocked/
 *   failed image falls back to the choice text so a tile is never blank.
 * - `resizeMode` from `question.imageFit`; tile size from
 *   `renderedImageWidth`/`renderedImageHeight`.
 * - Selection state per tile from core's `question.isItemSelected(item)`;
 *   a11y role radio (single) / checkbox (multi) + selected/checked state.
 * - Grid: `getCurrentColCount()` columns, each tile `${100/cols}%` wide
 *   in a flex-wrap row (the simple grid the 1.12 choice columns use;
 *   upstream's column balancing is not reproduced — see DIFFERENCES).
 */
import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageProps } from 'react-native';
import type { Base, Question } from '../core/facade';
import { Helpers } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { validateUri } from '../security/uri-policy';
import { reportDiagnostic } from '../diagnostics';

type ImageResizeMode = NonNullable<ImageProps['resizeMode']>;

interface ChoiceLike {
  value: unknown;
  text: string;
  locImageLink?: { renderedHtml: string };
  imageLink?: string;
}

interface ImagePickerModelLike extends Question {
  multiSelect: boolean;
  showLabel: boolean;
  imageFit: string;
  contentMode: string;
  renderedImageWidth?: number | string;
  renderedImageHeight?: number | string;
  visibleChoices: ChoiceLike[];
  isItemSelected(item: ChoiceLike): boolean;
  getCurrentColCount(): number;
}

const FIT_TO_RESIZE: Record<string, ImageResizeMode> = {
  contain: 'contain',
  cover: 'cover',
  fill: 'stretch',
  none: 'center',
};

function toDimension(v: number | string | undefined): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

export interface ImagePickerQuestionProps extends QuestionElementBaseProps {}

export class ImagePickerQuestion extends QuestionElementBase<ImagePickerQuestionProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get imagepicker(): ImagePickerModelLike {
    return this.questionBase as unknown as ImagePickerModelLike;
  }

  private handlePress(choice: ChoiceLike): void {
    const question = this.imagepicker;
    if (question.isInputReadOnly) return;
    const selected = question.isItemSelected(choice);
    const target = question as unknown as { value?: unknown };
    if (question.multiSelect) {
      const current = Array.isArray(target.value) ? target.value : [];
      target.value = selected
        ? current.filter(
            (v) =>
              !Helpers.isTwoValueEquals(v, choice.value, false, true, false)
          )
        : [...current, choice.value];
    } else {
      // Single-select: toggle-to-clear when allowClear, else set.
      target.value =
        selected && (question as { allowClear?: boolean }).allowClear
          ? undefined
          : choice.value;
    }
  }

  private renderTile(choice: ChoiceLike, cols: number): React.JSX.Element {
    const question = this.imagepicker;
    const selected = question.isItemSelected(choice);
    const rawUri = choice.locImageLink?.renderedHtml || choice.imageLink || '';
    const policy = validateUri(rawUri, 'image', undefined);
    const resizeMode = FIT_TO_RESIZE[question.imageFit] ?? 'contain';
    const width = toDimension(question.renderedImageWidth) ?? 120;
    const height = toDimension(question.renderedImageHeight) ?? 90;
    if (!policy.ok && rawUri) {
      reportDiagnostic({
        code: 'image-uri-blocked',
        source: 'imagepicker',
        uri: rawUri,
        reason: policy.reason,
      });
    }
    return (
      <Pressable
        key={String(choice.value)}
        testID={`imagepicker-item-${String(choice.value)}`}
        accessibilityRole={question.multiSelect ? 'checkbox' : 'radio'}
        accessibilityLabel={choice.text}
        accessibilityState={
          question.multiSelect ? { checked: selected } : { selected }
        }
        onPress={() => this.handlePress(choice)}
        style={[
          localStyles.tile,
          { width: `${100 / cols}%` as `${number}%` },
          selected ? localStyles.tileSelected : null,
        ]}
      >
        {policy.ok ? (
          <Image
            source={{ uri: policy.canonical }}
            resizeMode={resizeMode}
            style={{ width, height }}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text testID={`imagepicker-fallback-${String(choice.value)}`}>
            {choice.text}
          </Text>
        )}
        {question.showLabel ? (
          <Text style={localStyles.label}>{choice.text}</Text>
        ) : null}
      </Pressable>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.imagepicker;
    if (question.contentMode !== 'image') {
      reportDiagnostic({
        code: 'image-content-mode-unsupported',
        questionName: question.name,
        contentMode: question.contentMode,
      });
      return <View testID="imagepicker-content-mode-unsupported" />;
    }
    const cols = Math.max(1, question.getCurrentColCount());
    return (
      <View testID="imagepicker-grid" style={localStyles.grid}>
        {question.visibleChoices.map((choice) => this.renderTile(choice, cols))}
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    alignItems: 'center',
    padding: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 8,
  },
  tileSelected: { borderColor: '#19b394' },
  label: { marginTop: 4, textAlign: 'center' },
});
