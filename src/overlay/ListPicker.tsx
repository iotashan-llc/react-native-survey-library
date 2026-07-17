/**
 * 2.1 RNListPicker — the `"sv-list"` overlay content (design D6),
 * consuming a core `ListModel` UNMODIFIED (invariant 6):
 *
 * - Rows: `renderedActions.filter(isItemVisible)` (upstream's own
 *   filtering — listModelTests.ts:439-470); selection ONLY through
 *   `model.onItemClick(item)` (disabled checks, onSelectionChanged, and
 *   multi-select polymorphism live there).
 * - Row state: `isItemDisabled`/`isItemSelected`/`isItemFocused` → recipe
 *   variant + a11y state. Row component dispatch: `item.component ||
 *   model.itemComponent` through `RNElementFactory` when registered.
 * - Search: rendered iff `model.showFilter`; TextInput bound directly to
 *   `model.filterString` (a filter, not a question value); placeholder
 *   from `filterStringPlaceholder`. The clear affordance is a NATIVE
 *   adapter (upstream's `onClickSearchClearButton` dereferences a DOM
 *   event — list.ts:344-347): `filterString = ''`, refocus the input,
 *   `model.refresh()`.
 * - Roles (D6 rounds 3/4): translate `listRole`/`listItemRole` — `menu` →
 *   container "menu" with `menuitem` → "menuitem" / `menuitemradio` →
 *   "radio"+checked; the default `listbox`/`option` pair has no RN
 *   vocabulary and degrades (documented) to container "list" + role-less
 *   rows with `selected` state. Core's aria getters return
 *   `"true"|"false"|undefined` — normalized to boolean|undefined.
 * - Lazy load: `onEndReached` → `loadingIndicatorVisibilityObserver?.(true)`
 *   gated on `!isAllDataLoaded`; DEDUP lives in the owner adapter (2.3) —
 *   generation re-arm happens through model updates re-rendering this
 *   component.
 * - Empty state: `model.emptyMessage` (plain localized string) in a Text.
 * - Nested groups (D2 round 2): a group row (`item.hasSubItems`) presses
 *   into `item.showPopup()` ONLY; its child PopupModel bridge is owned
 *   at LIST-MODEL scope (`ListPickerElement` reconciles registrations
 *   against the action set), so FlatList recycling of the ROW can never
 *   semantic-close an open child popup.
 */
import * as React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ListModel, PopupModel } from '../core/facade';
import type { Base } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { RNElementFactory } from '../factories/ElementFactory';
import { composeStyles } from '../theme-rn/recipes/types';
import { OverlayContext } from './OverlayContext';
import { registerPopup } from './popup-bridge';
import type { OverlayPayload, PopupRegistration } from './popup-bridge';
import type { OverlayStack } from './stack';

type AnyListModel = InstanceType<typeof ListModel>;
type ListAction = AnyListModel['actions'][number];

export interface ListPickerProps {
  model: AnyListModel;
  /** Per-Survey overlay stack — enables nested subitem popup bridges;
   * absent in bare unit renders (groups then degrade to no-op popups). */
  stack?: OverlayStack<OverlayPayload>;
}

/** Core aria getters return "true" | "false" | undefined; RN wants
 * boolean | undefined (design round 4). */
function ariaToBool(value: 'true' | 'false' | undefined): boolean | undefined {
  return value === undefined ? undefined : value === 'true';
}

function containerRole(listRole: string): 'menu' | 'list' {
  return listRole === 'menu' ? 'menu' : 'list';
}

function rowRole(listItemRole: string): 'menuitem' | 'radio' | undefined {
  if (listItemRole === 'menuitem') return 'menuitem';
  if (listItemRole === 'menuitemradio') return 'radio';
  return undefined; // listbox/option degradation (documented)
}

interface ListPickerRowProps {
  model: AnyListModel;
  item: ListAction;
  /** List-model-scope bridge reconcile — rows notify the picker when
   * their Action changes (e.g. a post-mount setSubItems creates a new
   * child popupModel the picker must register). Idempotent + cheap. */
  onItemChanged?: () => void;
}

class ListPickerRow extends SurveyElementBase<ListPickerRowProps> {
  protected getStateElement(): Base | null {
    return this.props.item as unknown as Base;
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    // An Action-level change (setSubItems -> new popupModel) re-renders
    // only this ROW; surface it so the picker's list-model-scope bridge
    // map stays reconciled.
    this.props.onItemChanged?.();
  }

  protected getStateElements(): Base[] {
    return [
      this.props.item as unknown as Base,
      this.props.model as unknown as Base,
    ];
  }

  protected renderElement(): React.JSX.Element {
    const { model, item } = this.props;
    const { recipes, styles: overrides } = this.themeContext;
    const recipe = recipes.listItem;
    const disabled = model.isItemDisabled(item);
    const selected = model.isItemSelected(item);
    const focused = model.isItemFocused(item);
    const role = rowRole(model.listItemRole);
    const custom =
      (item as { component?: string }).component || model.itemComponent;
    const inner =
      custom && RNElementFactory.isElementRegistered(custom)
        ? RNElementFactory.createElement(custom, { item, model })
        : null;
    const styles = recipe.select({ selected, disabled, focused });
    return (
      <Pressable
        testID={`sv-list-item-${item.id}`}
        accessibilityRole={role}
        accessibilityState={{
          disabled,
          selected: ariaToBool(model.getA11yItemAriaSelected(item)),
          checked: ariaToBool(model.getA11yItemAriaChecked(item)),
        }}
        disabled={disabled}
        onPress={() =>
          (item as { hasSubItems?: boolean }).hasSubItems
            ? (item as unknown as { showPopup(): void }).showPopup()
            : model.onItemClick(item)
        }
        style={composeStyles(styles.row, {
          override: overrides.listItem?.row,
        })}
      >
        {inner ?? (
          <Text
            style={composeStyles(styles.text, {
              override: overrides.listItem?.text,
            })}
          >
            {item.title}
          </Text>
        )}
      </Pressable>
    );
  }
}

export interface ListItemGroupContentProps {
  model: AnyListModel;
  item: ListAction;
}

/** The registered `"sv-list-item-group"` row content (upstream
 * list-item-group.tsx renders content + an inline Popup; RN's child
 * popup mounts through the overlay stack instead, so this is content
 * only): title + submenu marker. */
export function ListItemGroupContent(
  props: ListItemGroupContentProps
): React.JSX.Element {
  return (
    <View
      testID={`sv-list-item-group-${props.item.id}`}
      style={localGroupStyles.row}
    >
      <Text>{props.item.title}</Text>
      <Text accessibilityElementsHidden>{'›'}</Text>
    </View>
  );
}

export interface ListPickerElementProps {
  model: AnyListModel;
}

/** The registered `"sv-list"` element: binds the per-Survey overlay
 * stack (OverlayContext) so nested subitem popups can bridge at
 * list-model scope. */
export function ListPickerElement(
  props: ListPickerElementProps
): React.JSX.Element {
  const stack = React.useContext(OverlayContext);
  return <ListPicker model={props.model} stack={stack ?? undefined} />;
}

export class ListPicker extends SurveyElementBase<ListPickerProps> {
  private readonly searchRef =
    React.createRef<React.ComponentRef<typeof TextInput>>();

  private readonly flatListRef = React.createRef<FlatList<ListAction>>();

  /** One-shot initial-scroll guard: renderedActions populate on a
   * debounced microtask, so the FlatList (and its ref) may not exist
   * until the SECOND render. */
  private didInitialScroll = false;

  /** D8: core's focusFirstInputSelector targets the SELECTED (or first)
   * row under IsTouch (dropdownListModel.ts:35-45). Native translation:
   * bring the selected row into view on mount. */
  private scrollToSelected(): void {
    if (this.didInitialScroll || !this.flatListRef.current) return;
    const model = this.props.model;
    const items = model.renderedActions.filter((item) =>
      model.isItemVisible(item)
    );
    const index = items.findIndex((item) => model.isItemSelected(item));
    this.didInitialScroll = true;
    if (index <= 0) return;
    try {
      this.flatListRef.current?.scrollToIndex({ index, animated: false });
    } catch {
      // Virtualized layout not measured yet — non-fatal; the row is
      // still reachable by scrolling.
    }
  }

  /** Child popup bridges, LIST-MODEL scope (design D2 round 2) — keyed
   * by the child PopupModel, reconciled against the current action set,
   * torn down only with this picker (never by FlatList row recycling). */
  private readonly childBridges = new Map<
    InstanceType<typeof PopupModel>,
    PopupRegistration
  >();

  protected getStateElement(): Base | null {
    return this.props.model as unknown as Base;
  }

  private reconcileChildBridges(): void {
    const stack = this.props.stack;
    if (!stack) return;
    const model = this.props.model;
    const present = new Set<InstanceType<typeof PopupModel>>();
    for (const item of model.actions) {
      const popup = (
        item as { popupModel?: InstanceType<typeof PopupModel> | null }
      ).popupModel;
      if (!popup) continue;
      present.add(popup);
      if (!this.childBridges.has(popup)) {
        this.childBridges.set(popup, registerPopup(popup, stack));
      }
    }
    for (const [popup, registration] of [...this.childBridges]) {
      if (!present.has(popup)) {
        registration.unregister();
        this.childBridges.delete(popup);
      }
    }
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.reconcileChildBridges();
    this.scrollToSelected();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.reconcileChildBridges();
    this.scrollToSelected();
  }

  componentWillUnmount(): void {
    for (const registration of this.childBridges.values()) {
      registration.unregister();
    }
    this.childBridges.clear();
    super.componentWillUnmount();
  }

  private readonly handleItemChanged = (): void => {
    this.reconcileChildBridges();
  };

  private readonly handleClear = (): void => {
    const model = this.props.model;
    model.filterString = '';
    this.searchRef.current?.focus();
    model.refresh();
  };

  private readonly handleEndReached = (): void => {
    const model = this.props.model;
    if (model.isAllDataLoaded) return;
    model.loadingIndicatorVisibilityObserver?.(true);
  };

  protected renderElement(): React.JSX.Element {
    const model = this.props.model;
    const { recipes, styles: overrides } = this.themeContext;
    const recipe = recipes.listItem;
    const items = model.renderedActions.filter((item) =>
      model.isItemVisible(item)
    );
    return (
      <View
        testID="sv-list"
        accessibilityRole={containerRole(model.listRole)}
        accessibilityLabel={
          (model as { listAriaLabel?: string }).listAriaLabel ||
          (model as { locOwner?: { title?: string } }).locOwner?.title ||
          undefined
        }
      >
        {model.showFilter ? (
          <View style={recipe.fragments.searchRow}>
            <TextInput
              ref={this.searchRef}
              testID="sv-list-filter"
              value={model.filterString}
              placeholder={model.filterStringPlaceholder}
              onChangeText={(text) => {
                model.filterString = text;
              }}
              accessibilityLabel={model.filterStringPlaceholder}
              style={composeStyles(recipe.fragments.searchInput, {
                override: overrides.listItem?.searchInput,
              })}
            />
            {model.showSearchClearButton && model.filterString ? (
              <Pressable
                testID="sv-list-filter-clear"
                accessibilityRole="button"
                onPress={this.handleClear}
              >
                <Text style={recipe.fragments.searchClear}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {items.length === 0 ? (
          <Text style={recipe.fragments.empty}>{model.emptyMessage}</Text>
        ) : (
          <FlatList
            ref={this.flatListRef}
            testID="sv-list-flatlist"
            data={items}
            keyExtractor={(item, index) => `${item.id ?? index}`}
            keyboardShouldPersistTaps="handled"
            onEndReached={this.handleEndReached}
            renderItem={({ item }) => (
              <ListPickerRow
                model={model}
                item={item}
                onItemChanged={this.handleItemChanged}
              />
            )}
          />
        )}
      </View>
    );
  }
}

const localGroupStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
});
