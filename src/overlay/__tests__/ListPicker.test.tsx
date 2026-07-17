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
import { ListPicker } from '../ListPicker';

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
