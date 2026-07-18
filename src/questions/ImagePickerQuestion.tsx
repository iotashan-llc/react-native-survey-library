/**
 * `imagepicker` question (task 2.7) — a grid of image CHOICE tiles; tap
 * to select (single-select sets the scalar value; `multiSelect` toggles
 * array membership). Standalone: no overlay. Plan:
 * docs/design/2.7-imagepicker-plan.md.
 *
 * Structure (PR #31 review r1): each tile is its OWN reactive component
 * (`ImagePickerTile extends SurveyElementBase`, state elements
 * `[item, question]` — like ButtonGroupItemRow) so per-ITEM changes
 * (isEnabled via choicesEnableIf, selection, contentNotLoaded) and the
 * separate `locImageLink`/`locText` LocString channels all re-render the
 * right tile. The image itself is a FUNCTION child (`TilePolicyImage`)
 * so it can `useContext(UriPolicyContext)` — SurveyElementBase's single
 * contextType is the theme.
 *
 * - Image loads through the central URI policy (invariant 8:
 *   `validateUri(rawUri, 'image', uriConfig ?? contextPolicy)`,
 *   fail-closed → `image-uri-blocked` diagnostic + choice-text fallback).
 *   `onLoad`/`onError` route into core (`onContentLoaded` for the
 *   aspect-ratio state; `item.onErrorHandler()`); a `contentNotLoaded`
 *   item (allowed-but-failed) shows the choice text (same fail-closed
 *   posture as ImageQuestion, task 2.10).
 * - Selection is gated on core `getItemEnabled(item)` (choicesEnableIf +
 *   image-availability) AND `isInputReadOnly`; single-select sets
 *   `question.value` (toggle-clear when allowClear); multi toggles the
 *   array with core's item equality (`checkIfValuesEqual`,
 *   doNotConvertNumbers). Selection state from core `isItemSelected`.
 * - a11y: the grid is a `radiogroup` (single-select) with the model
 *   label; each tile carries the choice text + `checked`/`disabled`.
 * - Grid: `getCurrentColCount()` columns (0 = flow layout); a positive
 *   count sets `${100/cols}%`-wide tiles (flex-wrap).
 */
import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageProps, ImageLoadEvent } from 'react-native';
import type { Base } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { validateUri } from '../security/uri-policy';
import type { UriPolicyConfig } from '../security/uri-policy';
import { UriPolicyContext } from '../security/UriPolicyContext';
import { reportDiagnostic } from '../diagnostics';

type ImageResizeMode = NonNullable<ImageProps['resizeMode']>;

interface LocStringLike {
  renderedHtml: string;
  onStringChanged: {
    add(cb: () => void): void;
    remove(cb: () => void): void;
  };
}

interface ChoiceLike {
  id: string | number;
  uniqueId: string | number;
  value: unknown;
  text: string;
  contentNotLoaded?: boolean;
  onErrorHandler?: () => void;
  locImageLink?: LocStringLike;
  locText?: LocStringLike;
  imageLink?: string;
}

interface ImagePickerModelLike {
  name: string;
  isInputReadOnly: boolean;
  multiSelect: boolean;
  showLabel: boolean;
  imageFit: string;
  contentMode: string;
  renderedImageWidth?: number | string;
  renderedImageHeight?: number | string;
  visibleChoices: ChoiceLike[];
  isItemSelected(item: ChoiceLike): boolean;
  getItemEnabled(item: ChoiceLike): boolean;
  getCurrentColCount(): number;
  isTwoValueEquals(a: unknown, b: unknown): boolean;
  onContentLoaded(
    item: ChoiceLike,
    // Core reads event.target.naturalWidth/Height (survey.core.js:66119).
    content: { target: { naturalWidth: number; naturalHeight: number } }
  ): void;
  a11y_input_ariaLabel?: string;
  processedTitle?: string;
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

/**
 * The tile's image, gated by the URI policy — a FUNCTION component so it
 * can consume `UriPolicyContext` (the enclosing tile class already spends
 * its contextType on the theme). Mirrors ImageQuestion's PolicyGatedImage.
 */
function TilePolicyImage(props: {
  question: ImagePickerModelLike;
  item: ChoiceLike;
  uriConfig: UriPolicyConfig | undefined;
}): React.JSX.Element {
  const { question, item, uriConfig } = props;
  const contextPolicy = React.useContext(UriPolicyContext);
  const effectivePolicy = uriConfig ?? contextPolicy;
  const rawUri = item.locImageLink?.renderedHtml || item.imageLink || '';
  const result = validateUri(rawUri, 'image', effectivePolicy);
  const lastErroredUriRef = React.useRef<string | null>(null);
  const blockedReason = result.ok ? undefined : result.reason;
  React.useEffect(() => {
    if (blockedReason !== undefined && rawUri) {
      reportDiagnostic({
        code: 'image-uri-blocked',
        source: 'imagepicker',
        uri: rawUri,
        reason: blockedReason,
      });
    }
  }, [rawUri, blockedReason, effectivePolicy]);

  const fallback = (
    <Text testID={`imagepicker-fallback-${String(item.value)}`}>
      {item.text}
    </Text>
  );
  if (!result.ok) return fallback;
  // Allowed but failed to load (core marks the item contentNotLoaded) —
  // show the choice text while THIS link is still the failed one.
  if (item.contentNotLoaded && lastErroredUriRef.current === rawUri) {
    return fallback;
  }
  const resizeMode = FIT_TO_RESIZE[question.imageFit] ?? 'contain';
  const width = toDimension(question.renderedImageWidth) ?? 120;
  const height = toDimension(question.renderedImageHeight) ?? 90;
  return (
    <Image
      testID={`imagepicker-image-${String(item.value)}`}
      source={{ uri: result.canonical }}
      resizeMode={resizeMode}
      accessibilityIgnoresInvertColors
      onLoad={(e: ImageLoadEvent) => {
        lastErroredUriRef.current = null;
        const src = e.nativeEvent?.source;
        if (src) {
          question.onContentLoaded(item, {
            target: { naturalWidth: src.width, naturalHeight: src.height },
          });
        }
      }}
      onError={() => {
        lastErroredUriRef.current = rawUri;
        item.onErrorHandler?.();
      }}
      style={{ width, height }}
    />
  );
}

interface ImagePickerTileProps {
  question: ImagePickerModelLike;
  item: ChoiceLike;
  cols: number;
  uriConfig: UriPolicyConfig | undefined;
}

/** Per-item reactive tile — state elements [item, question]. Also
 * subscribes the separate locImageLink/locText LocString channels
 * (image-link / label mutations don't fire an item property change). */
class ImagePickerTile extends SurveyElementBase<ImagePickerTileProps> {
  private subscribedLink: LocStringLike | null = null;
  private subscribedText: LocStringLike | null = null;
  private readonly handleLocChanged = (): void => {
    this.forceUpdate();
  };

  protected getStateElement(): Base | null {
    return this.props.item as unknown as Base;
  }

  protected getStateElements(): Base[] {
    return [
      this.props.item as unknown as Base,
      this.props.question as unknown as Base,
    ];
  }

  private syncLocSubscriptions(): void {
    const nextLink = this.props.item.locImageLink ?? null;
    if (nextLink !== this.subscribedLink) {
      this.subscribedLink?.onStringChanged.remove(this.handleLocChanged);
      nextLink?.onStringChanged.add(this.handleLocChanged);
      this.subscribedLink = nextLink;
    }
    const nextText = this.props.item.locText ?? null;
    if (nextText !== this.subscribedText) {
      this.subscribedText?.onStringChanged.remove(this.handleLocChanged);
      nextText?.onStringChanged.add(this.handleLocChanged);
      this.subscribedText = nextText;
    }
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.syncLocSubscriptions();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.syncLocSubscriptions();
  }

  componentWillUnmount(): void {
    this.subscribedLink?.onStringChanged.remove(this.handleLocChanged);
    this.subscribedText?.onStringChanged.remove(this.handleLocChanged);
    this.subscribedLink = null;
    this.subscribedText = null;
    super.componentWillUnmount();
  }

  private handlePress(): void {
    const { question, item } = this.props;
    if (!question.getItemEnabled(item) || question.isInputReadOnly) return;
    const selected = question.isItemSelected(item);
    const target = question as unknown as { value?: unknown };
    if (question.multiSelect) {
      const current = Array.isArray(target.value) ? target.value : [];
      target.value = selected
        ? // Use the model's OWN item equality (case-sensitive, no-trim,
          // doNotConvertNumbers) so 'A'/'a' and 1/'1' stay distinct
          // (PR #31 review r2 #2).
          current.filter((v) => !question.isTwoValueEquals(v, item.value))
        : [...current, item.value];
    } else {
      target.value =
        selected && (question as { allowClear?: boolean }).allowClear
          ? undefined
          : item.value;
    }
  }

  protected renderElement(): React.JSX.Element {
    const { question, item, cols, uriConfig } = this.props;
    const selected = question.isItemSelected(item);
    const enabled = question.getItemEnabled(item) && !question.isInputReadOnly;
    return (
      <Pressable
        testID={`imagepicker-item-${String(item.value)}`}
        accessibilityRole={question.multiSelect ? 'checkbox' : 'radio'}
        accessibilityLabel={item.text}
        accessibilityState={{ checked: selected, disabled: !enabled }}
        disabled={!enabled}
        onPress={() => this.handlePress()}
        style={[
          localStyles.tile,
          cols > 0 ? { width: `${100 / cols}%` as `${number}%` } : null,
          selected ? localStyles.tileSelected : null,
        ]}
      >
        <TilePolicyImage
          question={question}
          item={item}
          uriConfig={uriConfig}
        />
        {question.showLabel ? (
          <Text style={localStyles.label}>{item.text}</Text>
        ) : null}
      </Pressable>
    );
  }
}

export interface ImagePickerQuestionProps extends QuestionElementBaseProps {
  uriConfig?: UriPolicyConfig;
}

export class ImagePickerQuestion extends QuestionElementBase<ImagePickerQuestionProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get imagepicker(): ImagePickerModelLike {
    return this.questionBase as unknown as ImagePickerModelLike;
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
    // 0 = flow layout (natural tile widths); a positive count sets the
    // fixed %-width grid (PR #31 review r1 #5).
    const cols = question.getCurrentColCount();
    return (
      <View
        testID="imagepicker-grid"
        style={localStyles.grid}
        accessibilityRole={question.multiSelect ? undefined : 'radiogroup'}
        accessibilityLabel={
          question.a11y_input_ariaLabel ?? question.processedTitle
        }
      >
        {question.visibleChoices.map((item) => (
          <ImagePickerTile
            key={String(item.uniqueId)}
            question={question}
            item={item}
            cols={cols}
            uriConfig={this.props.uriConfig}
          />
        ))}
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
