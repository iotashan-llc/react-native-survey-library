/**
 * `imagemap` question (task 5.4) — RN port of survey-core's
 * `QuestionImageMapModel` + web `SurveyQuestionImageMap`
 * (reactquestion_imagemap.tsx). A base image with tappable hotspot AREAS
 * (rect/circle/poly shapes) drawn as a `react-native-svg` overlay; the
 * value is the selected area value(s).
 *
 * COORDINATE SCALING (invariant 6 — no re-derivation): web sets the
 * `<svg viewBox>` to the base image's NATURAL pixel size
 * (`onBgImageLoaded`) and lets SVG scale the area shapes — whose `coords`
 * live in that source-pixel space — down to the displayed box. This port
 * does the same: the base `<Image onLoad>` reports its natural size, the
 * container's `onLayout` reports the available width, and the `<Svg>` is
 * sized to the aspect-preserved rendered box with `viewBox="0 0 natW
 * natH"` — react-native-svg does the coordinate scaling, exactly like web.
 * Each area's SVG geometry comes STRAIGHT from `area.getSVGCoords()`
 * (rect -> x/y/width/height, circle -> cx/cy/r, poly -> points).
 *
 * SELECTION (controlled through the model — invariant 3): a shape's
 * `onPress` calls `question.mapItemToggle(area)`. Single-select
 * (`multiSelect:false`) sets the scalar value and re-tapping the selected
 * area CLEARS it (core's own toggle — the built-in allowClear); the
 * default multi-select (`multiSelect:true`) toggles array membership
 * (bounded by `maxSelectedAreas`). Selected state and the fill/stroke
 * highlight come from `question.isItemSelected` + the area's/question's
 * `--sd-imagemap-*` color props over the recipe defaults. Hover has no
 * touch analog and is not rendered.
 *
 * URI POLICY (invariant 8): the base image validates through the central
 * URI policy (context `'image'`, fail-closed) — the sink consumes the
 * CANONICAL string; a blocked link drops the image + emits an
 * `image-uri-blocked` diagnostic (source `'imagemap'`).
 *
 * FALLBACK (invariant 9): `react-native-svg` is a batteries-included core
 * peerDependency, but if it is ever absent `loadImageMapSvg()` resolves
 * null and the question degrades to the plain base image (no hotspot
 * overlay) + an `imagemap-lib-unavailable` diagnostic — never a throw.
 */
import * as React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ImageLoadEvent, LayoutChangeEvent } from 'react-native';
import type { Base, Question } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import type { SurveyElementBaseState } from '../reactivity/SurveyElementBase';
import { validateUri } from '../security/uri-policy';
import type { UriPolicyConfig } from '../security/uri-policy';
import { UriPolicyContext } from '../security/UriPolicyContext';
import { reportDiagnostic } from '../diagnostics';
import type { ImageMapRecipe } from '../theme-rn/recipes/imagemap';
import type { ImageMapStyleOverrides } from '../theme-rn/overrides';

// ————————————————————————————————————————————————————————————————
// Model slice (never re-derived — invariant 6)
// ————————————————————————————————————————————————————————————————

interface ImageMapAreaModel {
  uniqueId: number;
  value: unknown;
  text: string;
  visible: boolean;
  enabled: boolean;
  getShape(): string;
  getSVGCoords(): string[];
  idleFillColor?: string;
  idleStrokeColor?: string;
  idleStrokeWidth?: number;
  selectedFillColor?: string;
  selectedStrokeColor?: string;
  selectedStrokeWidth?: number;
}

interface ImageMapModel extends Question {
  name: string;
  imageLink: string;
  areas: ImageMapAreaModel[];
  isMultiSelect: boolean;
  isInputReadOnly: boolean;
  idleFillColor?: string;
  idleStrokeColor?: string;
  idleStrokeWidth?: number;
  selectedFillColor?: string;
  selectedStrokeColor?: string;
  selectedStrokeWidth?: number;
  isItemSelected(item: ImageMapAreaModel): boolean;
  mapItemToggle(item: ImageMapAreaModel): void;
}

// ————————————————————————————————————————————————————————————————
// Capability loader (lazy-required; absent -> non-throwing fallback)
// ————————————————————————————————————————————————————————————————

type SvgComponent = React.ComponentType<Record<string, unknown>>;

interface SvgPrimitives {
  Svg: SvgComponent;
  Rect: SvgComponent;
  Circle: SvgComponent;
  Polygon: SvgComponent;
}

let cachedSvgPrimitives: SvgPrimitives | null | undefined;

/**
 * Lazy-require the `react-native-svg` shape primitives (invariant 7).
 * Returns null when the peer (or any required primitive) is unavailable —
 * the caller then renders the non-throwing fallback. Memoized so the
 * resolve cost is paid once per module registry. Import lives here (the
 * ESLint react-native-svg fence grants this file the same per-file
 * exception RNIcon has — the icon adapter and the imagemap hotspots are
 * the two sanctioned react-native-svg sinks).
 */
export function loadImageMapSvg(): SvgPrimitives | null {
  if (cachedSvgPrimitives !== undefined) return cachedSvgPrimitives;
  try {
    const mod = require('react-native-svg') as Record<string, unknown>;
    const Svg = (mod.Svg ?? mod.default) as SvgComponent | undefined;
    const Rect = mod.Rect as SvgComponent | undefined;
    const Circle = mod.Circle as SvgComponent | undefined;
    const Polygon = mod.Polygon as SvgComponent | undefined;
    cachedSvgPrimitives =
      Svg && Rect && Circle && Polygon ? { Svg, Rect, Circle, Polygon } : null;
  } catch {
    cachedSvgPrimitives = null;
  }
  return cachedSvgPrimitives;
}

// ————————————————————————————————————————————————————————————————
// Base image (function child — consumes UriPolicyContext, invariant 8)
// ————————————————————————————————————————————————————————————————

function ImageMapBase(props: {
  question: ImageMapModel;
  rawUri: string;
  uriConfig: UriPolicyConfig | undefined;
  width: number | undefined;
  height: number | undefined;
  style: ImageMapRecipe['fragments']['image'];
  onNaturalSize: (width: number, height: number) => void;
}): React.JSX.Element | null {
  const { question, rawUri, uriConfig, width, height, style, onNaturalSize } =
    props;
  const contextPolicy = React.useContext(UriPolicyContext);
  const effectivePolicy = uriConfig ?? contextPolicy;
  const result = validateUri(rawUri, 'image', effectivePolicy);
  const blockedReason = result.ok ? undefined : result.reason;

  React.useEffect(() => {
    if (blockedReason !== undefined && rawUri) {
      reportDiagnostic({
        code: 'image-uri-blocked',
        source: 'imagemap',
        uri: rawUri,
        reason: blockedReason,
      });
    }
  }, [rawUri, blockedReason, effectivePolicy]);

  if (!rawUri || !result.ok) return null;

  return (
    <Image
      testID={`imagemap-image-${question.name}`}
      source={{ uri: result.canonical }}
      resizeMode="stretch"
      accessibilityIgnoresInvertColors
      onLoad={(e: ImageLoadEvent) => {
        const src = e.nativeEvent?.source;
        if (src) onNaturalSize(src.width, src.height);
      }}
      style={[
        style,
        {
          ...(width !== undefined ? { width } : null),
          ...(height !== undefined ? { height } : null),
        },
      ]}
    />
  );
}

// ————————————————————————————————————————————————————————————————
// The class-reactive question renderer
// ————————————————————————————————————————————————————————————————

interface ImageMapState extends SurveyElementBaseState {
  /** The base image's natural (source) pixel size, from `onLoad`. */
  natural?: { w: number; h: number };
  /** The container's measured width, from `onLayout`. */
  layoutWidth?: number;
}

export interface ImageMapQuestionProps extends QuestionElementBaseProps {
  /** Explicit override; otherwise the survey-scoped context applies. */
  uriConfig?: UriPolicyConfig;
}

export class ImageMapQuestion extends QuestionElementBase<
  ImageMapQuestionProps,
  ImageMapState
> {
  private libUnavailableReported = false;

  private get imagemap(): ImageMapModel {
    return this.questionBase as unknown as ImageMapModel;
  }

  protected getStateElement(): Base {
    return this.questionBase;
  }

  /** Subscribe the question AND every area — web re-renders the SVG on any
   * area property change (coords/enabled/visible/color); mirror that so a
   * condition-driven area change repaints the overlay. */
  protected getStateElements(): Base[] {
    const areas = (this.imagemap.areas ?? []) as unknown as Base[];
    return [this.questionBase, ...areas];
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.flushLibDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushLibDiagnostic();
  }

  /** Commit-phase (never render-phase) diagnostic: the svg peer is absent,
   * so the hotspot overlay cannot be drawn. Deduped per instance. */
  private flushLibDiagnostic(): void {
    if (this.libUnavailableReported) return;
    if (loadImageMapSvg()) return;
    this.libUnavailableReported = true;
    reportDiagnostic({
      code: 'imagemap-lib-unavailable',
      questionName: this.imagemap.name,
    });
  }

  private handleNaturalSize = (w: number, h: number): void => {
    const current = this.state.natural;
    if (current && current.w === w && current.h === h) return;
    this.setState({ natural: { w, h } });
  };

  private handleLayout = (e: LayoutChangeEvent): void => {
    const w = e.nativeEvent.layout.width;
    if (this.state.layoutWidth === w) return;
    this.setState({ layoutWidth: w });
  };

  private handlePress = (area: ImageMapAreaModel): void => {
    const q = this.imagemap;
    if (q.isInputReadOnly) return;
    q.mapItemToggle(area);
    // Web re-renders the SVG imperatively on every value change
    // (`onValueChanged` -> `renderSVG`). We need the RN analog because the
    // multi-select path (`PropertyNameArray.toggle`) MUTATES the value
    // array IN PLACE and reassigns the SAME reference, so survey-core's
    // reference-based change detection fires no property notification for a
    // second+ toggle — the reactive binding alone would leave the overlay
    // stale. This runs on a user tap (never during render), so a direct
    // re-render is safe.
    this.forceUpdate();
  };

  /** Aspect-preserved rendered box: scale the source down to the measured
   * width when it overflows; otherwise render at natural size. */
  private renderedDimensions(): { width?: number; height?: number } {
    const natural = this.state.natural;
    if (!natural) {
      return { width: this.state.layoutWidth, height: undefined };
    }
    const avail = this.state.layoutWidth;
    // Fill the measured container width preserving aspect (web parity:
    // `.sd-imagemap-bg { width:100% }` — upscales small images too, not
    // just downscale). The SVG overlay tracks the same box, so hotspot
    // coordinate mapping stays proportional at any scale.
    const scale = avail !== undefined ? avail / natural.w : 1;
    return { width: natural.w * scale, height: natural.h * scale };
  }

  private renderShape(
    area: ImageMapAreaModel,
    prims: SvgPrimitives,
    recipe: ImageMapRecipe,
    q: ImageMapModel
  ): React.JSX.Element | null {
    const { Rect, Circle, Polygon } = prims;
    const selected = q.isItemSelected(area);
    const coords = area.getSVGCoords();
    const fill = selected
      ? (area.selectedFillColor ?? q.selectedFillColor ?? recipe.selectedFill)
      : (area.idleFillColor ?? q.idleFillColor ?? recipe.idleFill);
    const stroke = selected
      ? (area.selectedStrokeColor ??
        q.selectedStrokeColor ??
        recipe.selectedStroke)
      : (area.idleStrokeColor ?? q.idleStrokeColor ?? recipe.idleStroke);
    const strokeWidth = selected
      ? (area.selectedStrokeWidth ??
        q.selectedStrokeWidth ??
        recipe.selectedStrokeWidth)
      : (area.idleStrokeWidth ?? q.idleStrokeWidth ?? recipe.idleStrokeWidth);

    const key = String(area.uniqueId);
    const common = {
      testID: `imagemap-area-${String(area.value)}`,
      fill,
      stroke,
      strokeWidth,
      onPress: () => this.handlePress(area),
      accessible: true,
      accessibilityRole: q.isMultiSelect ? 'checkbox' : 'radio',
      accessibilityLabel: area.text || String(area.value),
      accessibilityState: { checked: selected, disabled: q.isInputReadOnly },
    };

    switch (area.getShape()) {
      case 'rect': {
        const [x, y, w, h] = coords.map(Number);
        return <Rect key={key} {...common} x={x} y={y} width={w} height={h} />;
      }
      case 'circle': {
        const [cx, cy, r] = coords.map(Number);
        return <Circle key={key} {...common} cx={cx} cy={cy} r={r} />;
      }
      case 'poly':
        return <Polygon key={key} {...common} points={coords.join(',')} />;
      default:
        // Core's shape choices are only circle/rect/poly (no ellipse); an
        // unknown shape draws nothing rather than throwing.
        return null;
    }
  }

  protected renderElement(): React.JSX.Element {
    const q = this.imagemap;
    const { recipes, styles: overrides } = this.themeContext;
    const recipe = recipes.imagemap;
    const slots: ImageMapStyleOverrides | undefined = overrides.imagemap;

    const svgLib = loadImageMapSvg();
    const natural = this.state.natural;
    const { width, height } = this.renderedDimensions();

    const overlay =
      svgLib && natural && width !== undefined && height !== undefined ? (
        <svgLib.Svg
          testID={`imagemap-svg-${q.name}`}
          width={width}
          height={height}
          viewBox={`0 0 ${natural.w} ${natural.h}`}
          style={StyleSheet.absoluteFill}
        >
          {q.areas
            .filter((area) => area.visible && area.enabled)
            .map((area) => this.renderShape(area, svgLib, recipe, q))}
        </svgLib.Svg>
      ) : null;

    return (
      <View
        testID={`imagemap-container-${q.name}`}
        onLayout={this.handleLayout}
        style={[recipe.fragments.container, slots?.container]}
      >
        <View
          style={[
            recipe.fragments.imageBox,
            width !== undefined ? { width } : null,
            height !== undefined ? { height } : null,
            slots?.imageBox,
          ]}
        >
          <ImageMapBase
            question={q}
            rawUri={q.imageLink ?? ''}
            uriConfig={this.props.uriConfig}
            width={width}
            height={height}
            style={recipe.fragments.image}
            onNaturalSize={this.handleNaturalSize}
          />
          {overlay}
        </View>
        {!svgLib ? (
          <View
            testID={`imagemap-fallback-${q.name}`}
            style={[recipe.fragments.fallback, slots?.fallback]}
          >
            <Text style={recipe.fragments.fallbackText}>
              Interactive hotspots unavailable.
            </Text>
          </View>
        ) : null}
      </View>
    );
  }
}
