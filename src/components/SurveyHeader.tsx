/**
 * `SurveyHeader` — RN port of survey-react-ui's `SurveyHeader`
 * (components/survey-header/survey-header.tsx), task 1.6: the BASIC
 * header — title, description, logo — PLUS the advanced header / cover
 * (task 5.6, RN port of survey-react-ui's `Header`/`HeaderCell` in
 * components/header.tsx + the survey-core `Cover`/`CoverCell` model):
 * when `survey.headerView === 'advanced'` and the applied theme's cover
 * is non-empty, `renderCover` renders a background layer (color + optional
 * policy-validated `ImageBackground`) behind a 3x3 flex grid placing
 * logo/title/description in the cell matching their positionX/Y. The basic
 * path is unchanged. See `renderCover` for the documented RN deltas.
 *
 * Render gates are the MODEL's, never re-derived (invariant 6):
 * `renderedHasHeader` / `renderedHasTitle` / `renderedHasDescription` /
 * `renderedHasLogo` / `isLogoBefore` / `isLogoAfter`.
 *
 * Reactivity: extends the ported `SurveyElementBase` with the survey
 * model as its state element — survey-level property changes (title
 * appearing, `logo`/`logoFit`/`logoPosition`/`showTitle` changes) flow
 * through the 0.4 mechanism, and title/description TEXT changes flow
 * through the locstring viewer's own `onStringChanged` subscription.
 * Upstream's manual `locLogo.onChanged = function () {...}` assignment
 * (which CLOBBERS any other observer) is deliberately not ported — the
 * base-class subscription covers the logo, clobber-free.
 *
 * Documented RN deltas vs upstream:
 * - `afterRenderHeader`/`onAfterRenderHeader` is not fired: its payload
 *   is a DOM `HTMLElement`; native element handles are the 1.2 lifecycle
 *   bridge's registry concern, not a per-component ref cast.
 * - `TitleElement` (title-actions bar) is not ported in the basic header;
 *   the title renders through the locstring viewer directly.
 * - `titleMaxWidth` (a CSS width string) is not applied; the text block
 *   is a flex column that wraps naturally.
 *
 * Side-effect-free module: the descriptor table owns the `survey-header`
 * registration.
 */
import * as React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import type { ImageProps } from 'react-native';
import type { Base, Cover, CoverCell, SurveyModel } from '../core/facade';
import { RNElementFactory } from '../factories/ElementFactory';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { composeStyles } from '../theme-rn/recipes/types';
import type { HeaderRecipe } from '../theme-rn/recipes/header';
import { validateUri } from '../security/uri-policy';
import type { UriPolicyConfig } from '../security/uri-policy';
import { UriPolicyContext } from '../security/UriPolicyContext';
import { reportDiagnostic } from '../diagnostics';

type BgResizeMode = NonNullable<ImageProps['resizeMode']>;

/** `Cover.backgroundImageFit` → RN `ImageBackground` `resizeMode`. Web's
 * `calcBackgroundSize`: cover→`cover`, fill→`100% 100%` (stretch),
 * contain→`contain`, tile→`auto` (repeat). */
const BG_RESIZE_MODE_BY_FIT: Record<string, BgResizeMode> = {
  cover: 'cover',
  fill: 'stretch',
  contain: 'contain',
  tile: 'repeat',
};

/** `CoverCell.contentStyle.textAlign` (`start`/`center`/`end`) → RN. */
const TEXT_ALIGN_BY_CSS: Record<string, 'left' | 'center' | 'right'> = {
  start: 'left',
  center: 'center',
  end: 'right',
};

const coverStyles = StyleSheet.create({
  /** The image layer + its content fill the cover bounds. */
  bgFill: { flex: 1 },
});

/** `"300px"` → `300`; `"auto"`/undefined/non-px → `undefined`. */
function parsePx(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? parseFloat(match[1] as string) : undefined;
}

export interface SurveyHeaderProps {
  survey: SurveyModel;
  /** Threaded to the logo's URI validation (task 1.1 wires the
   * Survey-level config). */
  logoUriConfig?: UriPolicyConfig;
}

export class SurveyHeader extends SurveyElementBase<SurveyHeaderProps> {
  private get survey(): SurveyModel {
    return this.props.survey;
  }

  protected getStateElement(): Base | null {
    return this.survey ?? null;
  }

  protected canRender(): boolean {
    if (!this.survey) return false;
    // Basic gate: title or logo present. The advanced cover can also be
    // non-empty via a description alone (renderedHasHeader excludes
    // description) — allow that path through the cover's own emptiness gate.
    return this.survey.renderedHasHeader || !!this.getAdvancedCover();
  }

  /**
   * The survey-level advanced-header `Cover` model, or `undefined` when the
   * basic header applies. The cover exists only after a theme carrying a
   * `header` block (or `headerView: 'advanced'`) is applied via
   * `survey.applyTheme`, which inserts it as the `advanced-header` layout
   * element (survey-core `insertAdvancedHeader`). A cover with no
   * logo/title/description (`isEmpty`) falls back to the basic path — web
   * parity (`Header.renderElement` returns null on `isEmpty`).
   */
  private getAdvancedCover(): Cover | undefined {
    const survey = this.survey;
    if (!survey || survey.headerView !== 'advanced') return undefined;
    const layoutElement = survey.findLayoutElement('advanced-header') as
      { data?: unknown } | undefined;
    const cover = layoutElement?.data as Cover | undefined;
    if (!cover || cover.isEmpty) return undefined;
    return cover;
  }

  private renderTitleBlock(): React.JSX.Element | null {
    if (!this.survey.renderedHasTitle) return null;
    const fragments = this.themeContext.recipes.header.fragments;
    const slots = this.themeContext.styles.header;
    return (
      <View
        testID="survey-header-text"
        style={composeStyles(fragments.textBlock, {
          override: slots?.titleBlock,
        })}
      >
        {this.renderLocString(
          this.survey.locTitle,
          composeStyles(fragments.title, { override: slots?.title }),
          undefined,
          'title'
        )}
        {this.survey.renderedHasDescription
          ? this.renderLocString(
              this.survey.locDescription,
              composeStyles(fragments.description, {
                override: slots?.description,
              }),
              undefined,
              'description'
            )
          : null}
      </View>
    );
  }

  /** Set during render on a wrapper-dispatch factory miss, reported from
   * the commit lifecycles below (0.7's "no diagnostics during render"
   * rule), deduped per componentName for this instance's lifetime. */
  private pendingWrapperMiss:
    { componentName: string; reason: string } | undefined;
  private lastReportedWrapperMiss: string | undefined;

  /** Set during render when the advanced cover's background image URI is
   * blocked by the central policy; reported from commit (same rule as the
   * logo's `image-uri-blocked`), deduped per URI for this instance. */
  private pendingBgBlocked: { uri: string; reason: string } | undefined;
  private lastReportedBgUri: string | undefined;

  componentDidMount(): void {
    super.componentDidMount();
    this.flushWrapperMissDiagnostic();
    this.flushBgBlockedDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.flushWrapperMissDiagnostic();
    this.flushBgBlockedDiagnostic();
  }

  private flushWrapperMissDiagnostic(): void {
    const miss = this.pendingWrapperMiss;
    if (!miss || this.lastReportedWrapperMiss === miss.componentName) return;
    this.lastReportedWrapperMiss = miss.componentName;
    reportDiagnostic({
      code: 'element-wrapper-missing',
      componentName: miss.componentName,
      reason: miss.reason,
    });
  }

  private flushBgBlockedDiagnostic(): void {
    const blocked = this.pendingBgBlocked;
    if (!blocked || this.lastReportedBgUri === blocked.uri) return;
    this.lastReportedBgUri = blocked.uri;
    reportDiagnostic({
      code: 'image-uri-blocked',
      source: 'survey-header-background',
      uri: blocked.uri,
      reason: blocked.reason,
    });
  }

  /**
   * Upstream parity (survey-header.tsx `renderLogoImage`): the logo slot
   * dispatches through the survey's wrapper extension surface —
   * `getElementWrapperComponentName`/`getElementWrapperComponentData`
   * with reason `'logo-image'` (default key `sv-logo-image`, the
   * descriptor table's element row; hosts may reroute name and transform
   * data via `onElementWrapperComponentName`/`onElementWrapperComponentData`)
   * — never a direct `LogoImage` instantiation. A factory MISS (host
   * rerouted to an unregistered key) renders NOTHING, fail-closed: the
   * default component must not be fed possibly-transformed wrapper data;
   * the miss reports an `element-wrapper-missing` diagnostic from commit
   * phase and the rest of the header survives (invariant 9).
   */
  private renderLogo(isRendered: boolean): React.JSX.Element | null {
    if (!isRendered || !this.survey.renderedHasLogo) return null;
    const componentName = this.survey.getElementWrapperComponentName(
      this.survey,
      'logo-image'
    );
    const componentData = this.survey.getElementWrapperComponentData(
      this.survey,
      'logo-image'
    );
    // Registration miss detection stays synchronous (commit-phase
    // diagnostic below) WITHOUT invoking the creator (review round 2
    // minor: a custom wrapper creator must not execute twice per render);
    // the element itself creates inside the policy consumer so the
    // survey-scoped default reaches the logo sink (round 1 major #2 —
    // explicit prop wins over context).
    if (!RNElementFactory.isElementRegistered(componentName)) {
      this.pendingWrapperMiss = { componentName, reason: 'logo-image' };
      return null;
    }
    return (
      <UriPolicyContext.Consumer key={`logo-${componentName}`}>
        {(contextPolicy) =>
          RNElementFactory.createElement(componentName, {
            data: componentData,
            uriConfig: this.props.logoUriConfig ?? contextPolicy,
          })
        }
      </UriPolicyContext.Consumer>
    );
  }

  protected renderElement(): React.JSX.Element | null {
    this.pendingWrapperMiss = undefined;
    this.pendingBgBlocked = undefined;
    const cover = this.getAdvancedCover();
    return cover ? this.renderCover(cover) : this.renderBasicHeader();
  }

  /** Basic header (task 1.6) — title/description column + logo. Unchanged
   * by 5.6: the advanced cover is a separate branch above. */
  private renderBasicHeader(): React.JSX.Element {
    const fragments = this.themeContext.recipes.header.fragments;
    const slots = this.themeContext.styles.header;
    return (
      <View
        testID="survey-header"
        style={composeStyles(fragments.root, { override: slots?.root })}
      >
        {this.renderLogo(this.survey.isLogoBefore)}
        {this.renderTitleBlock()}
        {this.renderLogo(this.survey.isLogoAfter)}
      </View>
    );
  }

  /**
   * Advanced header / cover (task 5.6): a background layer (color +
   * optional policy-validated image) behind a 3x3 positioning grid.
   * Height, overlap, background color/image, opacity, fit, and the
   * per-cell placement are all consumed from the `Cover`/`CoverCell`
   * model (invariant 6 — never re-derived). Documented RN deltas vs web:
   * - RN renders the 3x3 GRID on every device; web's `.sv-header--mobile`
   *   stacked variant (used when `survey.isMobile`) is not ported — the
   *   grid subsumes it and honors positions on all form factors.
   * - `CoverCell.getContentMaxWidth`'s CSS-grid cell-span (`"300%"`) has no
   *   flexbox analog and is not applied; each cell stays within its 1fr
   *   column. `textAreaWidth` (the per-cell `maxWidth`) IS applied.
   * - Cover-property live mutation is not independently subscribed
   *   (`getStateElement` is the survey): title/description text flow
   *   through the locstring viewer's subscription and logo/`headerView`
   *   through the survey; a theme re-apply rebuilds the cover + re-renders
   *   the tree via the provider.
   */
  private renderCover(cover: Cover): React.JSX.Element {
    // Web parity (`Header.renderElement` sets `model.survey`): a no-op
    // early-return when already bound (insertAdvancedHeader bound it).
    cover.survey = this.survey;
    const recipe = this.themeContext.recipes.header;
    const height = parsePx(cover.renderedHeight);
    const overlap =
      cover.overlapEnabled && cover.hasBackground ? recipe.coverOverlap : null;
    const rootStyle = [
      recipe.cover.root,
      recipe.coverBackgroundColor
        ? { backgroundColor: recipe.coverBackgroundColor }
        : null,
      height != null ? { height } : null,
      overlap,
    ];
    const grid = this.renderGrid(cover, recipe);
    const rawBg = cover.backgroundImage;
    if (!rawBg) {
      return (
        <View testID="survey-header-cover" style={rootStyle}>
          {grid}
        </View>
      );
    }
    return (
      <UriPolicyContext.Consumer>
        {(contextPolicy) => {
          const result = validateUri(
            rawBg,
            'image',
            this.props.logoUriConfig ?? contextPolicy
          );
          if (!result.ok) {
            // Fail-closed: color background only, diagnostic from commit.
            this.pendingBgBlocked = { uri: rawBg, reason: result.reason };
            return (
              <View testID="survey-header-cover" style={rootStyle}>
                {grid}
              </View>
            );
          }
          const resizeMode =
            BG_RESIZE_MODE_BY_FIT[cover.backgroundImageFit] ?? 'cover';
          const opacity = cover.backgroundImageOpacity;
          return (
            <View testID="survey-header-cover" style={rootStyle}>
              <ImageBackground
                testID="survey-header-bg"
                source={{ uri: result.canonical }}
                resizeMode={resizeMode}
                imageStyle={opacity != null ? { opacity } : undefined}
                style={coverStyles.bgFill}
              >
                {grid}
              </ImageBackground>
            </View>
          );
        }}
      </UriPolicyContext.Consumer>
    );
  }

  /**
   * The 3x3 grid: the model's 9 `CoverCell`s carry a computed
   * `style.gridRow`/`gridColumn` (1-based; `0` = collapsed/hidden when the
   * cover has no explicit height — empty rows drop and the rest shift up).
   * We bucket cells by their visual row, then lay each row out as a
   * flex-row of the three columns, filling absent columns with empty
   * spacers so the 1fr/1fr/1fr geometry holds.
   */
  private renderGrid(cover: Cover, recipe: HeaderRecipe): React.JSX.Element {
    const rowsMap = new Map<number, Map<number, CoverCell>>();
    for (const cell of cover.cells) {
      const gridRow = Number(cell.style?.gridRow) || 0;
      const gridColumn = Number(cell.style?.gridColumn) || 0;
      if (!gridRow || !gridColumn) continue;
      let row = rowsMap.get(gridRow);
      if (!row) {
        row = new Map();
        rowsMap.set(gridRow, row);
      }
      row.set(gridColumn, cell);
    }
    const rowNumbers = Array.from(rowsMap.keys()).sort((a, b) => a - b);
    const textAreaWidth = parsePx(cover.renderedTextAreaWidth);
    return (
      <View testID="survey-header-content" style={recipe.cover.content}>
        {rowNumbers.map((rowNumber) => (
          <View key={`row-${rowNumber}`} style={recipe.cover.row}>
            {[1, 2, 3].map((column) =>
              this.renderCell(
                rowNumber,
                column,
                rowsMap.get(rowNumber)?.get(column),
                recipe,
                textAreaWidth
              )
            )}
          </View>
        ))}
      </View>
    );
  }

  private renderCell(
    rowNumber: number,
    column: number,
    cell: CoverCell | undefined,
    recipe: HeaderRecipe,
    textAreaWidth: number | undefined
  ): React.JSX.Element {
    if (!cell || cell.isEmpty) {
      // Empty spacer preserves the 1fr column geometry.
      return (
        <View key={`cell-${rowNumber}-${column}`} style={recipe.cover.cell} />
      );
    }
    const content = cell.contentStyle as {
      alignItems?: 'flex-start' | 'center' | 'flex-end';
      justifyContent?: 'flex-start' | 'center' | 'flex-end';
      textAlign?: string;
    };
    const cellStyle = [
      recipe.cover.cell,
      {
        alignItems: content.alignItems,
        justifyContent: content.justifyContent,
      },
    ];
    const textStyle = {
      textAlign: TEXT_ALIGN_BY_CSS[content.textAlign ?? 'start'] ?? 'left',
      ...(textAreaWidth != null ? { maxWidth: textAreaWidth } : null),
    };
    return (
      <View
        key={`cell-${rowNumber}-${column}`}
        testID={`cover-cell-${rowNumber}-${column}`}
        style={cellStyle}
      >
        {cell.showLogo ? this.renderLogo(true) : null}
        {cell.showTitle
          ? this.renderLocString(
              this.survey.locTitle,
              [recipe.cover.title, textStyle],
              'cover-title',
              'title'
            )
          : null}
        {cell.showDescription
          ? this.renderLocString(
              this.survey.locDescription,
              [recipe.cover.description, textStyle],
              'cover-description',
              'description'
            )
          : null}
      </View>
    );
  }
}
