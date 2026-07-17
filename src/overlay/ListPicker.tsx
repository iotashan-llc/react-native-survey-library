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
 */
import * as React from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { ListModel } from '../core/facade';
import type { Base } from '../core/facade';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { RNElementFactory } from '../factories/ElementFactory';
import { composeStyles } from '../theme-rn/recipes/types';

type AnyListModel = InstanceType<typeof ListModel>;
type ListAction = AnyListModel['actions'][number];

export interface ListPickerProps {
  model: AnyListModel;
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
}

class ListPickerRow extends SurveyElementBase<ListPickerRowProps> {
  protected getStateElement(): Base | null {
    return this.props.item as unknown as Base;
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
        onPress={() => model.onItemClick(item)}
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

export class ListPicker extends SurveyElementBase<ListPickerProps> {
  private readonly searchRef =
    React.createRef<React.ComponentRef<typeof TextInput>>();

  protected getStateElement(): Base | null {
    return this.props.model as unknown as Base;
  }

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
          (model as { listAriaLabel?: string }).listAriaLabel || undefined
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
            {model.showSearchClearButton || model.filterString ? (
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
            testID="sv-list-flatlist"
            data={items}
            keyExtractor={(item, index) => `${item.id ?? index}`}
            keyboardShouldPersistTaps="handled"
            onEndReached={this.handleEndReached}
            renderItem={({ item }) => (
              <ListPickerRow model={model} item={item} />
            )}
          />
        )}
      </View>
    );
  }
}
