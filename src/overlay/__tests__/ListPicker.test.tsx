/**
 * 2.1 RNListPicker — the `"sv-list"` registration (design D6), tested
 * against REAL core `ListModel`s (invariant 6): visibility filtering via
 * `isItemVisible`, selection via `onItemClick`, `showFilter`-gated
 * search bound to `filterString` (+ placeholder + native clear adapter),
 * role translation (`menu`/`menuitem`/`menuitemradio` vs the documented
 * `listbox`/`option` degradation), aria string→boolean normalization,
 * lazy-load via `loadingIndicatorVisibilityObserver` gated on
 * `isAllDataLoaded`, and the plain-Text empty message.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

/** ActionContainer.visibleActions recomputes via a debounced microtask
 * (same as SurveyNavigation's contract) — flush before asserting. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
import { Action, ListModel } from '../../core/facade';
import '../../factories/register-all';
import { ListPicker, ListPickerElement } from '../ListPicker';
import { OverlayContext } from '../OverlayContext';
import { createOverlayStack } from '../stack';
import type { OverlayPayload } from '../popup-bridge';

type AnyListModel = InstanceType<typeof ListModel>;

function makeList(
  titles: string[],
  overrides: Partial<Record<string, unknown>> = {}
): { model: AnyListModel; selected: string[] } {
  const selected: string[] = [];
  const actions = titles.map(
    (title) => new Action({ id: title, title, visible: true })
  );
  const model = new ListModel({
    items: actions,
    onSelectionChanged: (item: { id: string }) => {
      selected.push(item.id);
    },
    allowSelection: true,
    ...overrides,
  } as never);
  return { model: model as unknown as AnyListModel, selected };
}

describe('ListPicker — items + selection', () => {
  it('renders visible actions and selects through onItemClick', async () => {
    const { model, selected } = makeList(['alpha', 'beta']);
    render(<ListPicker model={model} />);
    await flush();
    expect(screen.getByText('alpha')).toBeTruthy();
    fireEvent.press(screen.getByText('beta'));
    expect(selected).toEqual(['beta']);
  });

  it('filterString narrows via core isItemVisible (typed through the search box)', async () => {
    const { model } = makeList(
      Array.from({ length: 12 }, (_, i) => `item-${i}`)
    );
    model.setSearchEnabled(true);
    render(<ListPicker model={model} />);
    await flush();
    const search = screen.getByTestId('sv-list-filter');
    fireEvent.changeText(search, 'item-1');
    expect(screen.getByText('item-1')).toBeTruthy();
    expect(screen.getByText('item-11')).toBeTruthy();
    expect(screen.queryByText('item-2')).toBeNull();
  });

  it('the search box renders only when core showFilter says so (>10 items with search enabled)', async () => {
    const short = makeList(['a', 'b']).model;
    short.setSearchEnabled(true);
    const view = render(<ListPicker model={short} />);
    await flush();
    expect(screen.queryByTestId('sv-list-filter')).toBeNull();
    view.unmount();

    const long = makeList(Array.from({ length: 12 }, (_, i) => `x${i}`)).model;
    long.setSearchEnabled(true);
    render(<ListPicker model={long} />);
    await flush();
    expect(screen.getByTestId('sv-list-filter')).toBeTruthy();
  });

  it('the native clear adapter empties filterString and calls refresh', async () => {
    const { model } = makeList(Array.from({ length: 12 }, (_, i) => `y${i}`));
    model.setSearchEnabled(true);
    render(<ListPicker model={model} />);
    await flush();
    act(() => {
      model.filterString = 'y1';
    });
    const refreshSpy = jest.spyOn(model, 'refresh');
    const clear = screen.getByTestId('sv-list-filter-clear');
    fireEvent.press(clear);
    expect(model.filterString).toBe('');
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ListPicker — roles + aria normalization (D6 round 3/4)', () => {
  it('default listbox/option degrades to container "list" + role-less rows with boolean selected', async () => {
    const { model } = makeList(['one', 'two']);
    model.selectedItem = model.actions[0]!;
    render(<ListPicker model={model} />);
    await flush();
    const container = screen.getByTestId('sv-list');
    expect(container.props.accessibilityRole).toBe('list');
    const row = screen.getByTestId('sv-list-item-one');
    expect(row.props.accessibilityRole).toBeUndefined();
    expect(row.props.accessibilityState?.selected).toBe(true);
    expect(
      screen.getByTestId('sv-list-item-two').props.accessibilityState?.selected
    ).toBe(false);
  });

  it('menu/menuitemradio translates: container "menu", rows "radio" with boolean checked', async () => {
    const { model } = makeList(['r1', 'r2']);
    model.listRole = 'menu';
    model.listItemRole = 'menuitemradio';
    model.selectedItem = model.actions[1]!;
    render(<ListPicker model={model} />);
    await flush();
    expect(screen.getByTestId('sv-list').props.accessibilityRole).toBe('menu');
    const row = screen.getByTestId('sv-list-item-r2');
    expect(row.props.accessibilityRole).toBe('radio');
    expect(row.props.accessibilityState?.checked).toBe(true);
    expect(
      screen.getByTestId('sv-list-item-r1').props.accessibilityState?.checked
    ).toBe(false);
  });
});

describe('ListPicker — lazy load + empty state', () => {
  it('end-reached fires the loading observer only while data remains', async () => {
    const { model } = makeList(['a', 'b']);
    const observed: boolean[] = [];
    model.isAllDataLoaded = false;
    model.loadingIndicatorVisibilityObserver = (isVisible: boolean) => {
      observed.push(isVisible);
    };
    render(<ListPicker model={model} />);
    await flush();
    fireEvent(screen.getByTestId('sv-list-flatlist'), 'endReached');
    expect(observed).toEqual([true]);
    act(() => {
      model.isAllDataLoaded = true;
    });
    fireEvent(screen.getByTestId('sv-list-flatlist'), 'endReached');
    expect(observed).toEqual([true]);
  });

  it('an empty list renders the core emptyMessage as plain text', async () => {
    const { model } = makeList([]);
    render(<ListPicker model={model} />);
    await flush();
    expect(screen.getByText(model.emptyMessage)).toBeTruthy();
  });
});

describe('ListPicker — review round 1 (groups, bridges, clear gating, label)', () => {
  it('clear affordance requires showSearchClearButton AND a nonempty filter (web parity)', async () => {
    const { model } = makeList(Array.from({ length: 12 }, (_, i) => `z${i}`));
    model.setSearchEnabled(true); // sets showSearchClearButton = true
    render(<ListPicker model={model} />);
    await flush();
    // Empty filter: hidden even though the model flag is on.
    expect(screen.queryByTestId('sv-list-filter-clear')).toBeNull();
    act(() => {
      model.filterString = 'z1';
    });
    expect(screen.getByTestId('sv-list-filter-clear')).toBeTruthy();
    // Flag off: hidden even with a nonempty filter.
    act(() => {
      model.showSearchClearButton = false;
    });
    expect(screen.queryByTestId('sv-list-filter-clear')).toBeNull();
  });

  it('container accessibilityLabel falls back to the owner question title (locOwner)', async () => {
    const { model } = makeList(['a', 'b']);
    (model as unknown as { locOwner: unknown }).locOwner = {
      title: 'Favorite color',
      getLocale: () => '',
      getMarkdownHtml: () => null,
      getRenderer: () => undefined,
      getRendererContext: (loc: unknown) => loc,
      getProcessedText: (text: string) => text,
    };
    render(<ListPicker model={model} />);
    await flush();
    expect(screen.getByTestId('sv-list').props.accessibilityLabel).toBe(
      'Favorite color'
    );
  });

  it('a group row (setSubItems) presses into showPopup ONLY — never onItemClick', async () => {
    const { model, selected } = makeList(['plain']);
    const group = new Action({ id: 'grp', title: 'More', visible: true });
    group.setSubItems({ items: [new Action({ id: 'sub1', title: 'Sub 1' })] });
    act(() => {
      model.setItems([...model.actions, group] as never);
    });
    const showPopupSpy = jest.spyOn(group, 'showPopup');
    render(<ListPicker model={model} />);
    await flush();
    const row = screen.getByTestId('sv-list-item-grp');
    fireEvent.press(row);
    expect(showPopupSpy).toHaveBeenCalledTimes(1);
    expect(selected).toEqual([]); // onSelectionChanged never fired
  });

  it('child subitem popups bridge at LIST-MODEL scope into the overlay stack', async () => {
    const { model } = makeList(['plain']);
    const group = new Action({ id: 'grp', title: 'More', visible: true });
    group.setSubItems({ items: [new Action({ id: 'sub1', title: 'Sub 1' })] });
    act(() => {
      model.setItems([...model.actions, group] as never);
    });
    const stack = createOverlayStack<OverlayPayload>();
    const view = render(
      <OverlayContext.Provider value={stack}>
        <ListPickerElement model={model} />
      </OverlayContext.Provider>
    );
    await flush();
    act(() => {
      group.showPopup();
    });
    expect(stack.entries()).toHaveLength(1);
    expect(stack.activeEntry()!.state).toBe('active');
    // Unmount = list-model scope teardown: semantic close of the child.
    view.unmount();
    expect(stack.entries()).toHaveLength(0);
    expect(group.popupModel.isVisible).toBe(false);
  });

  it('a group row renders the sv-list-item-group content (title + marker)', async () => {
    const { model } = makeList(['plain']);
    const group = new Action({ id: 'grp', title: 'More', visible: true });
    group.setSubItems({ items: [new Action({ id: 'sub1', title: 'Sub 1' })] });
    act(() => {
      model.setItems([...model.actions, group] as never);
    });
    render(<ListPicker model={model} />);
    await flush();
    expect(screen.getByTestId('sv-list-item-group-grp')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
    expect(screen.getByText('›', { includeHiddenElements: true })).toBeTruthy();
  });
});
