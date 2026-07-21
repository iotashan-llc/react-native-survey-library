/**
 * `SurveyTOC` — task 5.7b: table-of-contents navigation. RN port of
 * survey-react-ui's `SurveyProgressToc` (progressToc.tsx).
 *
 * survey-core owns the entire TOC. `createTOCListModel(survey)` (via the
 * `TOCModel` this component builds) returns a `ListModel<Action>` with
 * ONE nav Action per page: the selected item tracks `survey.currentPage`
 * (`onCurrentPageChanged` → `listModel.selectedItem`), the item set
 * follows `survey.pages` (`registerFunctionOnPropertyValueChanged`), and
 * each Action navigates through `survey.tryNavigateToPage` — this
 * component NEVER sets `currentPage` itself (invariant: nav goes through
 * the core Action). `TOCModel` also bundles the mobile-drawer
 * `PopupModel` (content component `"sv-list"`, which RN registers to
 * `ListPickerElement`).
 *
 * Rendering reuses the 2.1 overlay list stack (invariant: do not build a
 * new list/popup engine):
 * - Wide (`location: "left" | "right"`): the `ListModel` renders inline
 *   through `ListPickerElement` inside a side column; the active-row
 *   highlight is the shared `listItem` recipe's selected variant
 *   (invariant 6 — not re-implemented here).
 * - Mobile (`location: "mobile"`): a hamburger toggles the `TOCModel`'s
 *   `PopupModel`, which the shell's overlay stack presents as a sheet via
 *   `OverlayHost` (the SAME bridge dropdown/tagbox use).
 *
 * Reactivity (0.4 `SurveyElementBase`): the state element is the survey,
 * so `showTOC`/`tocLocation`/`currentPage`/page changes re-render the
 * wrapper; the inner `ListPicker` subscribes to the `ListModel` and
 * re-highlights on `selectedItem` changes. The `TOCModel` (and its
 * `PopupModel`/`ListModel`) is built lazily on mount and disposed on
 * unmount (no leak). Non-throwing fallback: `showTOC` false → nothing.
 */
import * as React from 'react';
import { findNodeHandle, Pressable, Text, View } from 'react-native';
import type { Base, PopupModel, SurveyModel } from '../core/facade';
import { getLocaleString, TOCModel } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { ListPickerElement } from '../overlay/ListPicker';
import { registerPopup } from '../overlay/popup-bridge';
import type {
  OverlayPayload,
  PopupRegistration,
} from '../overlay/popup-bridge';
import type { OverlayStack } from '../overlay/stack';
import { composeStyles } from '../theme-rn/recipes/types';

type TOCModelInstance = InstanceType<typeof TOCModel>;
type PopupModelInstance = InstanceType<typeof PopupModel>;

export interface SurveyTOCProps {
  survey: SurveyModel;
  /** `left`/`right` render the wide side column; `mobile` renders the
   * hamburger toggle + overlay popup (the shell picks per `isMobile`). */
  location: 'left' | 'right' | 'mobile';
  /** Per-Survey overlay stack — required for the mobile popup to present
   * (absent in bare unit renders: the toggle then toggles the PopupModel
   * with no Modal bridged, matching the overlay stack's own contract). */
  stack?: OverlayStack<OverlayPayload>;
  testID?: string;
}

export class SurveyTOC extends SurveyElementBase<SurveyTOCProps> {
  private tocModel: TOCModelInstance | null = null;

  private registration: PopupRegistration | null = null;
  private registeredPopup: PopupModelInstance | null = null;
  private registeredStack: OverlayStack<OverlayPayload> | null = null;

  private readonly toggleRef =
    React.createRef<React.ComponentRef<typeof Pressable>>();

  private get survey(): SurveyModel {
    return this.props.survey;
  }

  /** Re-render on survey property changes (showTOC / tocLocation /
   * currentPage / page add-remove). The inner `ListPicker` owns its own
   * `ListModel` subscription for the active-row highlight. */
  protected getStateElement(): Base | null {
    return this.survey ?? null;
  }

  /** Build the core `TOCModel` lazily (never in the constructor — a
   * StrictMode-discarded instance would leak its survey subscriptions
   * with no `componentWillUnmount` to dispose them). Gated on `showTOC`
   * so a hidden TOC costs nothing until it is turned on. */
  private ensureModel(): boolean {
    if (this.tocModel || !this.survey || !this.survey.showTOC) return false;
    this.tocModel = new TOCModel(this.survey);
    return true;
  }

  componentDidMount(): void {
    this.ensureModel();
    super.componentDidMount();
    this.reconcileRegistration();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    const built = this.ensureModel();
    this.reconcileRegistration();
    // In-place `showTOC` false→true toggle: the flip render returns the
    // null frame (tocModel still null), then this post-render build sets
    // the model with no other state change to schedule a re-render — the
    // empty frame would persist until an unrelated survey property fires.
    // Bump once so the built TOC replaces the null frame immediately.
    // (The mount path bumps via componentDidMount, so this only fires on
    // an in-place toggle of an already-mounted instance.)
    if (built) this.forceUpdate();
  }

  componentWillUnmount(): void {
    const reg = this.registration;
    this.registration = null;
    this.registeredPopup = null;
    this.registeredStack = null;
    try {
      // Unsubscribe the reactive base FIRST so the semantic-close
      // visibility change (unregister → hide) can't drive setState during
      // unmount (mirrors OverlayControlBase's teardown order).
      super.componentWillUnmount();
    } finally {
      reg?.unregister();
      this.tocModel?.dispose();
      this.tocModel = null;
    }
  }

  /** Bridge the mobile drawer's PopupModel into the Survey overlay stack;
   * re-register only when the (popup, stack) identity changes so a
   * location/stack swap retargets cleanly. Wide columns never register a
   * sheet. */
  private reconcileRegistration(): void {
    const isMobile = this.props.location === 'mobile';
    const stack = isMobile ? (this.props.stack ?? null) : null;
    const popup = isMobile && this.tocModel ? this.tocModel.popupModel : null;
    if (popup === this.registeredPopup && stack === this.registeredStack) {
      return;
    }
    this.registration?.unregister();
    this.registration = null;
    this.registeredPopup = popup;
    this.registeredStack = stack;
    if (stack && popup) {
      this.registration = registerPopup(popup, stack, {
        openerHandle: () => findNodeHandle(this.toggleRef.current) ?? null,
      });
    }
  }

  protected canRender(): boolean {
    return !!this.survey && this.survey.showTOC;
  }

  protected renderElement(): React.JSX.Element | null {
    const tocModel = this.tocModel;
    // Pre-model frame: the model is built in componentDidMount (mount) or,
    // for an in-place showTOC toggle, in componentDidUpdate which then
    // forceUpdates — one empty frame, never a crash.
    if (!tocModel) return null;
    const { recipes, styles } = this.themeContext;
    const recipe = recipes.progressToc;
    const overrides = styles.progressToc;
    const location = this.props.location;

    if (location === 'mobile') {
      return (
        <Pressable
          ref={this.toggleRef}
          testID={this.props.testID ?? 'survey-toc-toggle'}
          accessibilityRole="button"
          accessibilityLabel={getLocaleString('toc', this.survey.getLocale())}
          onPress={() => tocModel.togglePopup()}
          style={composeStyles(recipe.fragments.toggle, {
            override: overrides?.toggle,
          })}
        >
          <Text
            style={composeStyles(recipe.fragments.toggleGlyph, {
              override: overrides?.toggleGlyph,
            })}
          >
            {'☰'}
          </Text>
        </Pressable>
      );
    }

    return (
      <View
        testID={this.props.testID ?? `survey-toc-${location}`}
        style={composeStyles(
          [
            recipe.fragments.container,
            location === 'right'
              ? recipe.fragments.containerRight
              : recipe.fragments.containerLeft,
          ],
          { override: overrides?.container }
        )}
      >
        {/* TOCModel.listModel is ListModel<Action>; ListPickerElement's
          model is the invariant ListModel<BaseAction> (onSelectionChanged
          param position). Action extends BaseAction, so widening is sound. */}
        <ListPickerElement
          model={
            tocModel.listModel as unknown as React.ComponentProps<
              typeof ListPickerElement
            >['model']
          }
        />
      </View>
    );
  }
}
