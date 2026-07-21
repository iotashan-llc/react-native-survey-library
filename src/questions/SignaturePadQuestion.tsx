/**
 * `signaturepad` question (task 5.1) — RN port of survey-core's
 * `QuestionSignaturePadModel` + web `SurveyQuestionSignaturePad`
 * (signaturepad.tsx).
 *
 * VALUE PARITY (invariant 6 — no re-derivation): web renders a `<canvas>`
 * driven by the `signature_pad` library and, on the DEFAULT `storeDataAsText`
 * path, commits the drawing on each stroke end as
 * `signaturePad.toDataURL(getFormat())` — a `data:image/<png|jpeg|svg+xml>;
 * base64,…` string written straight to `question.value`. The RN renderer
 * wraps the batteries-included **`react-native-signature-canvas`** (a WebView
 * signature pad; LAZY-REQUIRED inside the isolated `SignatureCanvasControl`
 * hooks child — invariant 7), whose `onOK(dataURL)` returns the SAME data-URL
 * format keyed to `imageType` (derived from the model's `dataFormat`). The
 * recommended auto-save flow (`onEnd` -> `ref.readSignature()` -> `onOK`)
 * mirrors web's stroke-end commit, so committed values match web exactly.
 *
 * READ-ONLY / display: web calls `signaturePad.off()` for a read-only pad and
 * repaints the stored value onto the canvas. RN has no shared canvas, so a
 * read-only question renders the stored signature as a non-interactive RN
 * `<Image source={{ uri: value }}>` (PNG/JPEG data URLs; SVG data URLs are a
 * documented limitation — RN's `<Image>` cannot rasterize them). An EDITABLE
 * question with an existing value rehydrates it INTO the canvas via the
 * library's `dataURL` prop.
 *
 * CLEAR: `allowClear` (via core's `canShowClearButton`, which self-gates on
 * readOnly + a present value) surfaces a clear control that calls the pad's
 * `clearSignature()` and the model's `clearValue()`.
 *
 * FALLBACK (invariant 9): when the peer is absent — jest without it, or a
 * consumer who has not installed it — `loadSignatureCanvasLib()` resolves
 * null and the question degrades to a non-throwing fallback (a structured
 * `signaturepad-lib-unavailable` diagnostic + a read-only image of any stored
 * value), never a crash.
 *
 * DRAWING is a DEVICE GATE: the actual pen input runs inside a WebView and is
 * verified on the example app, not in jest — the suites drive the library's
 * `onOK`/clear through its root manual mock.
 */
import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Base, LocalizableString, Question } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { reportDiagnostic } from '../diagnostics';
import { composeStyles } from '../theme-rn/recipes/types';
import type { SignatureRecipe } from '../theme-rn/recipes/signature';
import type { SignatureStyleOverrides } from '../theme-rn/overrides';

const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 200;

/** `dataFormat` -> the library's `imageType` (mirrors core `getFormat()`:
 * jpeg -> "image/jpeg", svg -> "image/svg+xml", else png). */
const IMAGE_TYPE_BY_FORMAT: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
};

/** Hide the library's built-in footer (Clear/Confirm) — commit is auto-save
 * on stroke-end and the clear control is the model-driven `allowClear`. */
const SIGNATURE_WEB_STYLE =
  '.m-signature-pad--footer { display: none; margin: 0; }' +
  '.m-signature-pad { box-shadow: none; border: none; }' +
  '.m-signature-pad--body { border: none; }' +
  'body,html { width: 100%; height: 100%; margin: 0; }';

/** The slice of `QuestionSignaturePadModel` the renderer consumes (never
 * re-derived — invariant 6). */
interface SignatureModel extends Question {
  name: string;
  dataFormat: string;
  penColor: string;
  backgroundColor: string;
  signatureWidth: number;
  signatureHeight: number;
  penMinWidth: number;
  penMaxWidth: number;
  allowClear: boolean;
  canShowClearButton: boolean;
  clearButtonCaption: string;
  showPlaceholder: boolean;
  needShowPlaceholder(): boolean;
  locRenderedPlaceholder: LocalizableString;
  isInputReadOnly: boolean;
  value: string | undefined;
  clearValue(): void;
}

// ————————————————————————————————————————————————————————————————
// Capability loader (lazy-required; absent -> non-throwing fallback)
// ————————————————————————————————————————————————————————————————

type SignatureComponent = React.ComponentType<Record<string, unknown>>;

let cachedSignatureLib: SignatureComponent | null | undefined;

/**
 * Lazy-require `react-native-signature-canvas` (invariant 7). Returns null
 * when the peer is unavailable (jest without it, or a consumer who has not
 * installed the batteries-included peer) — the caller then renders the
 * non-throwing fallback. Memoized so the resolve cost is paid once.
 */
export function loadSignatureCanvasLib(): SignatureComponent | null {
  if (cachedSignatureLib !== undefined) return cachedSignatureLib;
  try {
    const mod = require('react-native-signature-canvas');
    const candidate = (mod && (mod.default as unknown)) ?? mod;
    const usable =
      typeof candidate === 'function' ||
      (typeof candidate === 'object' &&
        candidate !== null &&
        '$$typeof' in (candidate as object));
    cachedSignatureLib = usable ? (candidate as SignatureComponent) : null;
  } catch {
    cachedSignatureLib = null;
  }
  return cachedSignatureLib;
}

// ————————————————————————————————————————————————————————————————
// Isolated hooks child — the WebView signature canvas
// ————————————————————————————————————————————————————————————————

interface SignatureRef {
  readSignature?: () => void;
  clearSignature?: () => void;
}

interface SignatureCanvasProps {
  testID?: string;
  onOK?: (signature: string) => void;
  onEmpty?: () => void;
  onEnd?: () => void;
  autoClear?: boolean;
  imageType?: string;
  penColor?: string;
  backgroundColor?: string;
  minWidth?: number;
  maxWidth?: number;
  dataURL?: string;
  descriptionText?: string;
  webStyle?: string;
  style?: StyleProp<ViewStyle>;
}

interface SignatureCanvasControlProps {
  question: SignatureModel;
  recipe: SignatureRecipe;
  slots?: SignatureStyleOverrides;
  SignatureComp: SignatureComponent;
  width: number;
  height: number;
  /** Materialized by the class (the model's committed data URL). */
  value: string | undefined;
  onCommit(dataURL: string): void;
  onClearValue(): void;
}

function SignatureCanvasControl(
  props: SignatureCanvasControlProps
): React.JSX.Element {
  const {
    question,
    recipe,
    slots,
    SignatureComp,
    width,
    height,
    value,
    onCommit,
    onClearValue,
  } = props;
  const ref = React.useRef<SignatureRef | null>(null);
  const imageType = IMAGE_TYPE_BY_FORMAT[question.dataFormat] ?? 'image/png';
  const penColor = question.penColor || recipe.defaultPenColor;
  const backgroundColor =
    question.backgroundColor || recipe.defaultBackgroundColor;
  const showPlaceholder = question.needShowPlaceholder();
  const canClear = question.canShowClearButton;

  // The library is a `forwardRef` component; cast the broadly-typed loaded
  // value so `ref` + our props typecheck at the JSX site.
  const Canvas = SignatureComp as unknown as React.ForwardRefExoticComponent<
    SignatureCanvasProps & React.RefAttributes<SignatureRef>
  >;

  return (
    <>
      <View style={[recipe.fragments.canvas, { width, height }, slots?.canvas]}>
        <Canvas
          testID={`sv-signature-input-${question.name}`}
          ref={ref}
          onOK={onCommit}
          onEmpty={() => {}}
          // Auto-save on stroke end (mirrors web's endStroke commit).
          onEnd={() => ref.current?.readSignature?.()}
          autoClear={false}
          imageType={imageType}
          penColor={penColor}
          backgroundColor={backgroundColor}
          minWidth={question.penMinWidth}
          maxWidth={question.penMaxWidth}
          dataURL={value || undefined}
          descriptionText=""
          webStyle={SIGNATURE_WEB_STYLE}
          style={localStyles.fill}
        />
        {showPlaceholder ? (
          <View
            testID={`sv-signature-placeholder-${question.name}`}
            pointerEvents="none"
            style={composeStyles(recipe.fragments.placeholder, {
              override: slots?.placeholder,
            })}
          >
            <Text style={recipe.fragments.placeholderText}>
              {question.locRenderedPlaceholder.renderedHtml}
            </Text>
          </View>
        ) : null}
      </View>
      {canClear ? (
        <Pressable
          testID={`sv-signature-clear-${question.name}`}
          accessibilityRole="button"
          accessibilityLabel={question.clearButtonCaption}
          onPress={() => {
            ref.current?.clearSignature?.();
            onClearValue();
          }}
          style={composeStyles(recipe.fragments.clearButton, {
            override: slots?.clearButton,
          })}
        >
          <Text style={recipe.fragments.clearButtonText}>
            {question.clearButtonCaption}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

// ————————————————————————————————————————————————————————————————
// The class-reactive question renderer
// ————————————————————————————————————————————————————————————————

export interface SignaturePadQuestionProps extends QuestionElementBaseProps {}

export class SignaturePadQuestion extends QuestionElementBase<SignaturePadQuestionProps> {
  private libUnavailableReported = false;

  private get sig(): SignatureModel {
    return this.questionBase as unknown as SignatureModel;
  }

  protected getStateElement(): Base {
    return this.questionBase;
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.flushLibDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushLibDiagnostic();
  }

  /** Commit-phase (never render-phase) diagnostic: only when an EDITABLE
   * question would need the canvas but the peer is absent. Deduped per
   * instance. */
  private flushLibDiagnostic(): void {
    if (this.libUnavailableReported) return;
    const q = this.sig;
    if (q.isInputReadOnly) return;
    if (loadSignatureCanvasLib()) return;
    this.libUnavailableReported = true;
    reportDiagnostic({
      code: 'signaturepad-lib-unavailable',
      questionName: q.name,
    });
  }

  /** onOK commit — write the data URL to the model verbatim (web parity:
   * `this.value = signaturePad.toDataURL(...)`). Read-only self-gates. */
  private commit = (dataURL: string): void => {
    const q = this.sig;
    if (q.isInputReadOnly) return;
    if (typeof dataURL !== 'string' || dataURL.length === 0) return;
    q.value = dataURL;
  };

  private clear = (): void => {
    const q = this.sig;
    if (q.isInputReadOnly) return;
    q.clearValue();
  };

  protected renderElement(): React.JSX.Element {
    const q = this.sig;
    const { recipes, styles: overrides } = this.themeContext;
    const recipe = recipes.signature;
    const slots = overrides.signature;
    const value = q.value;
    const width = q.signatureWidth || DEFAULT_WIDTH;
    const height = q.signatureHeight || DEFAULT_HEIGHT;

    // Read-only OR peer-absent -> non-interactive static rendering.
    if (q.isInputReadOnly) {
      return this.renderStatic('readonly', recipe, slots, value, width, height);
    }
    const SignatureComp = loadSignatureCanvasLib();
    if (!SignatureComp) {
      return this.renderStatic('fallback', recipe, slots, value, width, height);
    }

    return (
      <View
        testID={`sv-signature-${q.name}`}
        accessibilityLabel={q.title}
        style={composeStyles(recipe.fragments.container, {
          override: slots?.container,
        })}
      >
        <SignatureCanvasControl
          question={q}
          recipe={recipe}
          slots={slots}
          SignatureComp={SignatureComp}
          width={width}
          height={height}
          value={value}
          onCommit={this.commit}
          onClearValue={this.clear}
        />
      </View>
    );
  }

  private renderStatic(
    mode: 'readonly' | 'fallback',
    recipe: SignatureRecipe,
    slots: SignatureStyleOverrides | undefined,
    value: string | undefined,
    width: number,
    height: number
  ): React.JSX.Element {
    const q = this.sig;
    const hasValue =
      !q.isEmpty() && typeof value === 'string' && value.length > 0;

    let inner: React.JSX.Element;
    if (hasValue) {
      inner = (
        <Image
          testID={`sv-signature-image-${q.name}`}
          source={{ uri: value! }}
          resizeMode="contain"
          accessibilityLabel={q.title}
          style={[recipe.fragments.image, { width, height }, slots?.image]}
        />
      );
    } else if (mode === 'readonly' && q.needShowPlaceholder()) {
      inner = (
        <View
          testID={`sv-signature-placeholder-${q.name}`}
          style={[
            recipe.fragments.placeholder,
            localStyles.staticPlaceholder,
            { width, height },
            slots?.placeholder as StyleProp<ViewStyle>,
          ]}
        >
          <Text style={recipe.fragments.placeholderText}>
            {q.locRenderedPlaceholder.renderedHtml}
          </Text>
        </View>
      );
    } else {
      inner = (
        <Text style={recipe.fragments.fallbackText}>
          {mode === 'fallback'
            ? 'Signature pad unavailable.'
            : q.locRenderedPlaceholder.renderedHtml}
        </Text>
      );
    }

    const container = (
      <View
        testID={`sv-signature-${q.name}`}
        accessibilityLabel={q.title}
        style={composeStyles(recipe.fragments.container, {
          override: slots?.container,
        })}
      >
        {mode === 'fallback' ? (
          <View
            testID={`sv-signature-fallback-${q.name}`}
            style={recipe.fragments.fallback}
          >
            {inner}
          </View>
        ) : (
          inner
        )}
      </View>
    );
    return container;
  }
}

const localStyles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
  // Read-only static placeholder flows normally (the recipe fragment is
  // absolute for the in-canvas overlay).
  staticPlaceholder: { position: 'relative' },
});
