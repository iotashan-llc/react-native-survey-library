/**
 * SurveyThemeProvider + SurveyThemeContext (design: docs/design/0.7-theme-rn.md,
 * "Provider"). Consumed via the 0.4 amendment's inherited
 * `static contextType` on `SurveyElementBase` (single-context constraint)
 * as well as plain `React.useContext`/`static contextType` in any other
 * class/function component.
 *
 * Memoization — exact policy: on every render, build a canonicalized
 * (sorted-key, deep) snapshot of the SUPPORTED `ITheme` fields; a same-
 * reference theme object MUTATED between renders is still detected
 * (snapshot-based, not reference-based) because the snapshot is rebuilt
 * from the CURRENT field values every render. `resolved`/`recipes`
 * identity changes iff the snapshot differs from the cached one.
 *
 * Supported-field list: `themeName/colorPalette/isPanelless/
 * backgroundImage(+Fit+Attachment)/header/headerView/cssVariables` (design
 * prose's "backgroundImage*" wildcard) PLUS `backgroundOpacity`
 * (deliberate, documented correction -- `resolveTheme`'s
 * own `resolveBackground` reads `theme.backgroundOpacity`; excluding it
 * from the memoization key would let a background-opacity-only change go
 * undetected and serve a stale `resolved`/`recipes` pair, which is a real
 * staleness bug, not a cosmetic gap. `ITheme` has no other fields.
 */
import * as React from 'react';
import { I18nManager, Platform } from 'react-native';
import { resolveTheme } from '../theme-core/resolve';
import type { ResolvedTheme } from '../theme-core/resolve';
import type { ITheme } from '../core/facade';
import { buildRecipes } from './recipes';
import type { Recipes } from './recipes';
import type { BuildContext, RecipeBuildDiagnostic } from './recipes/types';
import { resolvePlatformFromRN } from './recipes/types';
import { reportDiagnostic } from '../diagnostics';
import { normalizeBackground } from './background';
import type { NormalizedBackground, BackgroundDiagnostic } from './background';
import { EMPTY_COMPONENT_STYLES } from './overrides';
import type { SurveyComponentStyles } from './overrides';

export interface ThemeMode {
  narrow: boolean;
  rtl: boolean;
}

export interface SurveyThemeContextValue {
  resolved: ResolvedTheme;
  recipes: Recipes;
  mode: ThemeMode;
  /**
   * Ready-to-consume background (design ownership table: 0.7 owns the
   * `backgroundImageAttachment: 'fixed'` -> 'scroll' mapping + diagnostic;
   * the M1 Survey-root background component, per the same table, just
   * renders this -- no re-derivation needed).
   */
  normalizedBackground: NormalizedBackground;
  /**
   * A12 consumer per-component slot overrides (codex impl-review major 8)
   * — components compose these LAST (`composeStyles`: recipe < theme <
   * consumer override). Defaults to a frozen empty object.
   */
  styles: SurveyComponentStyles;
}

function currentPlatformBuildContext(): BuildContext {
  return { platform: resolvePlatformFromRN(Platform.OS, Platform.Version) };
}

/**
 * The platform is a recipe BUILD input (types.ts: "every recipe build
 * input ... participates in the cache key") — encoded into the theme-data
 * cache key so an OS/apiLevel change can never serve stale recipes (codex
 * impl-review major 4).
 */
function currentPlatformSignature(): string {
  const platform = resolvePlatformFromRN(Platform.OS, Platform.Version);
  return `${platform.os}|${platform.apiLevel ?? ''}`;
}

function buildThemeData(theme: ITheme | undefined): {
  resolved: ResolvedTheme;
  recipes: Recipes;
  normalizedBackground: NormalizedBackground;
  backgroundDiagnostics: BackgroundDiagnostic[];
  recipeDiagnostics: RecipeBuildDiagnostic[];
} {
  const resolved = resolveTheme(theme);
  const recipeDiagnostics: RecipeBuildDiagnostic[] = [];
  const buildCtx = currentPlatformBuildContext();
  const recipes = buildRecipes(resolved, {
    ...buildCtx,
    diagnostics: recipeDiagnostics,
  });
  const { normalized, diagnostics } = normalizeBackground(resolved.background);
  return {
    resolved,
    recipes,
    normalizedBackground: normalized,
    backgroundDiagnostics: diagnostics,
    recipeDiagnostics,
  };
}

function makeDefaultContextValue(): SurveyThemeContextValue {
  const { resolved, recipes, normalizedBackground } = buildThemeData(undefined);
  return {
    resolved,
    recipes,
    normalizedBackground,
    mode: { narrow: false, rtl: I18nManager.isRTL },
    styles: EMPTY_COMPONENT_STYLES,
  };
}

export const SurveyThemeContext = React.createContext<SurveyThemeContextValue>(
  makeDefaultContextValue()
);
SurveyThemeContext.displayName = 'SurveyThemeContext';

/** Recursively sorts object keys so an equal-but-different-reference value produces an identical string (deep-compare via string equality). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) =>
      `${JSON.stringify(key)}:${stableStringify(
        (value as Record<string, unknown>)[key]
      )}`
  );
  return `{${entries.join(',')}}`;
}

const SUPPORTED_SNAPSHOT_FIELDS = [
  'themeName',
  'colorPalette',
  'isPanelless',
  'backgroundImage',
  'backgroundImageFit',
  'backgroundImageAttachment',
  'backgroundOpacity',
  'header',
  'headerView',
  'cssVariables',
] as const;

function canonicalThemeSnapshot(theme: ITheme | undefined): string {
  const supported: Record<string, unknown> = {};
  for (const field of SUPPORTED_SNAPSHOT_FIELDS) {
    supported[field] = (theme as unknown as Record<string, unknown>)?.[field];
  }
  return stableStringify(supported);
}

export interface SurveyThemeProviderProps {
  theme?: ITheme;
  /**
   * Owned by the M1 Survey root (`onLayout` -> `width < 600` ->
   * `survey.setIsMobile(narrow)` AND this prop, design: "Responsive
   * ownership"). Named `narrow`, not `compact` (core's own `isCompact` ==
   * panelless -- collision deliberately avoided).
   */
  narrow?: boolean;
  /** Explicit override for testing; defaults to `I18nManager.isRTL`. */
  rtl?: boolean;
  /**
   * A12 consumer per-component slot overrides. Participates in the
   * memoized context value by IDENTITY (see overrides.ts) — hoist the
   * object; don't inline a fresh literal per render.
   */
  styles?: SurveyComponentStyles;
  children?: React.ReactNode;
}

interface SurveyThemeProviderState {
  narrow: boolean;
  rtl: boolean;
}

interface ThemeDataCacheEntry {
  snapshot: string;
  resolved: ResolvedTheme;
  recipes: Recipes;
  normalizedBackground: NormalizedBackground;
  backgroundDiagnostics: BackgroundDiagnostic[];
  recipeDiagnostics: RecipeBuildDiagnostic[];
}

interface ContextValueCacheEntry {
  themeData: ThemeDataCacheEntry;
  narrow: boolean;
  rtl: boolean;
  styles: SurveyComponentStyles;
  value: SurveyThemeContextValue;
}

export class SurveyThemeProvider extends React.Component<
  SurveyThemeProviderProps,
  SurveyThemeProviderState
> {
  private cache: ThemeDataCacheEntry | undefined;
  /**
   * WHOLE-context-value memoization (codex impl-review major 4): a fresh
   * value/mode object per render would invalidate every consumer on every
   * provider render. Keyed on (theme-data cache entry identity, narrow,
   * rtl, styles identity).
   */
  private contextValueCache: ContextValueCacheEntry | undefined;
  /** Deduped `(code,variable,value)` across re-resolutions, provider lifetime (design: "Diagnostics"). */
  private emittedDiagnosticKeys = new Set<string>();

  constructor(props: SurveyThemeProviderProps) {
    super(props);
    this.state = {
      narrow: props.narrow ?? false,
      rtl: props.rtl ?? I18nManager.isRTL,
    };
  }

  static getDerivedStateFromProps(
    props: SurveyThemeProviderProps,
    state: SurveyThemeProviderState
  ): Partial<SurveyThemeProviderState> | null {
    const narrow = props.narrow ?? false;
    const rtl = props.rtl ?? I18nManager.isRTL;
    if (narrow === state.narrow && rtl === state.rtl) return null;
    return { narrow, rtl };
  }

  componentDidMount(): void {
    this.flushDiagnostics();
  }

  componentDidUpdate(): void {
    this.flushDiagnostics();
  }

  private getOrBuildThemeData(): ThemeDataCacheEntry {
    // Platform signature prefix: the platform is a recipe BUILD input and
    // must invalidate the cached recipes if it ever changes (codex
    // impl-review major 4).
    const snapshot = `${currentPlatformSignature()}::${canonicalThemeSnapshot(
      this.props.theme
    )}`;
    if (this.cache && this.cache.snapshot === snapshot) {
      return this.cache;
    }
    const {
      resolved,
      recipes,
      normalizedBackground,
      backgroundDiagnostics,
      recipeDiagnostics,
    } = buildThemeData(this.props.theme);
    this.cache = {
      snapshot,
      resolved,
      recipes,
      normalizedBackground,
      backgroundDiagnostics,
      recipeDiagnostics,
    };
    return this.cache;
  }

  private flushDiagnostics(): void {
    const { resolved, backgroundDiagnostics, recipeDiagnostics } =
      this.getOrBuildThemeData();
    resolved.diagnostics.forEach((diagnostic) => {
      const key = `${diagnostic.code}|${diagnostic.variable}|${diagnostic.value ?? ''}`;
      if (this.emittedDiagnosticKeys.has(key)) return;
      this.emittedDiagnosticKeys.add(key);
      reportDiagnostic({
        code: 'theme-diagnostic',
        diagnosticCode: diagnostic.code,
        variable: diagnostic.variable,
        message: diagnostic.message,
        value: diagnostic.value,
      });
    });
    // Recipe-BUILD diagnostics (shadow-tier fallbacks, registry-aware
    // color-var fallbacks) flush through the same seam with the same
    // provider-lifetime dedup (codex impl-review majors 1+6).
    recipeDiagnostics.forEach((diagnostic) => {
      const key = `${diagnostic.code}|${diagnostic.variable ?? ''}|${diagnostic.value ?? ''}`;
      if (this.emittedDiagnosticKeys.has(key)) return;
      this.emittedDiagnosticKeys.add(key);
      reportDiagnostic({
        code: 'theme-diagnostic',
        diagnosticCode: diagnostic.code,
        variable: diagnostic.variable,
        message: diagnostic.message,
        value: diagnostic.value,
      });
    });
    backgroundDiagnostics.forEach((diagnostic) => {
      const key = `${diagnostic.code}|background|`;
      if (this.emittedDiagnosticKeys.has(key)) return;
      this.emittedDiagnosticKeys.add(key);
      reportDiagnostic({
        code: 'theme-diagnostic',
        diagnosticCode: diagnostic.code,
        variable: 'background',
        message: diagnostic.message,
        value: undefined,
      });
    });
  }

  private getContextValue(): SurveyThemeContextValue {
    const themeData = this.getOrBuildThemeData();
    const { narrow, rtl } = this.state;
    const styles = this.props.styles ?? EMPTY_COMPONENT_STYLES;
    const cached = this.contextValueCache;
    if (
      cached &&
      cached.themeData === themeData &&
      cached.narrow === narrow &&
      cached.rtl === rtl &&
      cached.styles === styles
    ) {
      return cached.value;
    }
    const value: SurveyThemeContextValue = {
      resolved: themeData.resolved,
      recipes: themeData.recipes,
      normalizedBackground: themeData.normalizedBackground,
      mode: { narrow, rtl },
      styles,
    };
    this.contextValueCache = { themeData, narrow, rtl, styles, value };
    return value;
  }

  render(): React.JSX.Element {
    return (
      <SurveyThemeContext.Provider value={this.getContextValue()}>
        {this.props.children}
      </SurveyThemeContext.Provider>
    );
  }
}
