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
import type { BuildContext } from './recipes/types';
import { reportDiagnostic } from '../diagnostics';

export interface ThemeMode {
  narrow: boolean;
  rtl: boolean;
}

export interface SurveyThemeContextValue {
  resolved: ResolvedTheme;
  recipes: Recipes;
  mode: ThemeMode;
}

function currentPlatformBuildContext(): BuildContext {
  if (Platform.OS === 'android') {
    const apiLevel = Number(Platform.Version);
    return {
      platform: {
        os: 'android',
        apiLevel: Number.isFinite(apiLevel) ? apiLevel : 0,
      },
    };
  }
  return { platform: { os: 'ios' } };
}

function buildThemeData(theme: ITheme | undefined): {
  resolved: ResolvedTheme;
  recipes: Recipes;
} {
  const resolved = resolveTheme(theme);
  const recipes = buildRecipes(resolved, currentPlatformBuildContext());
  return { resolved, recipes };
}

function makeDefaultContextValue(): SurveyThemeContextValue {
  const { resolved, recipes } = buildThemeData(undefined);
  return {
    resolved,
    recipes,
    mode: { narrow: false, rtl: I18nManager.isRTL },
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
}

export class SurveyThemeProvider extends React.Component<
  SurveyThemeProviderProps,
  SurveyThemeProviderState
> {
  private cache: ThemeDataCacheEntry | undefined;
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
    const snapshot = canonicalThemeSnapshot(this.props.theme);
    if (this.cache && this.cache.snapshot === snapshot) {
      return this.cache;
    }
    const { resolved, recipes } = buildThemeData(this.props.theme);
    this.cache = { snapshot, resolved, recipes };
    return this.cache;
  }

  private flushDiagnostics(): void {
    const { resolved } = this.getOrBuildThemeData();
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
  }

  render(): React.JSX.Element {
    const { resolved, recipes } = this.getOrBuildThemeData();
    const value: SurveyThemeContextValue = {
      resolved,
      recipes,
      mode: { narrow: this.state.narrow, rtl: this.state.rtl },
    };
    return (
      <SurveyThemeContext.Provider value={value}>
        {this.props.children}
      </SurveyThemeContext.Provider>
    );
  }
}
