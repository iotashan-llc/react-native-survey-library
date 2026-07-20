/**
 * `<RNIcon>` — the RN analog of survey-react-ui's `SvgIcon` (design:
 * docs/design/1.5-icon-actionbutton.md, "RNIcon"). Where web renders
 * `<svg><use xlink:href="#icon-x"/></svg>` against a DOM sprite, RNIcon
 * resolves the icon name to raw SVG markup (`icon-resolution.ts`: core's
 * own `getIconNameFromProxy` + consumer-first registry lookup + trust-
 * tier sanitization) and renders it through react-native-svg's `SvgXml`.
 *
 * This is the ONLY file in the library allowed to import
 * `react-native-svg` (ESLint-enforced, mirroring the survey-core facade
 * and `@native-html/render` rules), and the module is `require`d LAZILY —
 * module EVALUATION deferred to first actual render; the peer stays
 * installed and Metro still statically discovers the literal `require`
 * (A10's narrowed lazy-loading claim, same as `SanitizedHtml`).
 *
 * Registry liveness: subscribes `SvgRegistry.onIconsChanged` in the
 * commit phase (0.4 discipline — a plain `React.Component`, NOT
 * `SurveyElementBase`: the registry is an `EventBase` singleton, not a
 * `Base` model, and needs none of the property-callback machinery) and
 * bumps a revision so late `registerIcons()` calls show up. Upstream's
 * `registerIcon()` (singular) does NOT fire the event — hosts should
 * register icons before mounting, exactly as on web where the DOM sprite
 * has the same staleness.
 *
 * An unresolvable name renders null (one-shot `unknown-icon` diagnostic
 * from the resolver) — never a throw (invariant 9 spirit).
 */
import * as React from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { SvgRegistry } from '../core/facade';
import { resolveIconXml } from './icon-resolution';

export interface RNIconProps {
  /** Core icon name — prefixed (`icon-clear-16x16`), legacy (`chevron`), or `settings.customIcons`-remapped; resolution is core's own. */
  iconName: string;
  /**
   * Width AND height (square, like web's `createSvg` sizing). Default 24
   * = `BaseAction.iconSize`'s default. (Web's bare `createSvg` fallback
   * is 16 — documented divergence; every Action-driven call site passes
   * the model's `iconSize` anyway.)
   */
  size?: number | string;
  /** Optional monochrome fill override; per-component theme wiring stays with each port (A7). */
  fill?: ColorValue;
  /**
   * Optional stroke color/width overrides (root presentation attrs —
   * inherit into paths that don't set their own, exactly like web CSS
   * `svg { stroke: …; stroke-width: … }`). Added for the rating star's
   * outline states; `'none'`/`'transparent'` are both valid.
   */
  stroke?: ColorValue;
  strokeWidth?: number | string;
  /** Accessibility label (web `<title>` analog). Absent → decorative, mirroring web `role="presentation"`. */
  title?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface SvgXmlProps {
  xml: string | null;
  width?: number | string;
  height?: number | string;
  fill?: ColorValue;
  stroke?: ColorValue;
  strokeWidth?: number | string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessible?: boolean;
  accessibilityRole?: 'image';
  accessibilityLabel?: string;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
}

// Lazily required so react-native-svg's module-level code (native-component
// registration) only runs once an icon actually renders.
let cachedSvgXml: React.ComponentType<SvgXmlProps> | undefined;
function getSvgXml(): React.ComponentType<SvgXmlProps> {
  if (!cachedSvgXml) {
    cachedSvgXml = (
      require('react-native-svg') as {
        SvgXml: React.ComponentType<SvgXmlProps>;
      }
    ).SvgXml;
  }
  return cachedSvgXml;
}

interface RNIconState {
  /** Bumped on SvgRegistry.onIconsChanged so resolution re-runs. */
  registryRevision: number;
}

export const RNICON_DEFAULT_SIZE = 24;

export class RNIcon extends React.Component<RNIconProps, RNIconState> {
  state: RNIconState = { registryRevision: 0 };

  private handleIconsChanged = (): void => {
    this.setState((state) => ({
      registryRevision: state.registryRevision + 1,
    }));
  };

  componentDidMount(): void {
    SvgRegistry.onIconsChanged.add(this.handleIconsChanged);
  }

  componentWillUnmount(): void {
    SvgRegistry.onIconsChanged.remove(this.handleIconsChanged);
  }

  render(): React.JSX.Element | null {
    const {
      iconName,
      size = RNICON_DEFAULT_SIZE,
      fill,
      stroke,
      strokeWidth,
      title,
      style,
      testID,
    } = this.props;
    if (!iconName) return null;
    const { xml } = resolveIconXml(iconName);
    if (xml === null) return null;

    const SvgXml = getSvgXml();
    const accessibilityProps: Partial<SvgXmlProps> = title
      ? {
          accessible: true,
          accessibilityRole: 'image',
          accessibilityLabel: title,
        }
      : {
          accessible: false,
          importantForAccessibility: 'no-hide-descendants',
        };
    return (
      <SvgXml
        xml={xml}
        width={size}
        height={size}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        style={style}
        testID={testID}
        {...accessibilityProps}
      />
    );
  }
}
