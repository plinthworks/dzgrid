# State

`gridState()` from `@dzgrid/dom/state` reads and restores the grid's state: the columns (order, width, hidden,
pinned), header groups, sort, filters, quick search, page and page size, density, grouped columns, the dock's layout,
the pivot. A state is a plain, versioned object (`{ v: 1, … }`) you can store anywhere. It never holds row data, but it does
hold what the user typed into filters.

```ts
import { createGrid } from '@dzgrid/dom';
import { gridState, type GridState } from '@dzgrid/dom/state';
import { EN } from '@dzgrid/dom/locales/en';

type Lantern = { id: string; street: string; lit: boolean; height: number };

const state = gridState({
  initial: { v: 1, sort: [{ column: 'street', dir: 'asc' }] },
  persist: { key: 'lanterns-grid' },
  debounce: 300,
});

const grid = createGrid<Lantern>(document.getElementById('lanterns')!, {
  rows: [{ id: 'l1', street: 'Wick lane', lit: true, height: 3.5 }],
  columns: [
    { id: 'street', header: 'Street' },
    { id: 'lit', header: 'Lit', type: 'boolean' },
    { id: 'height', header: 'Height (m)', type: 'number' },
  ],
  getRowId: (l) => l.id,
  messages: EN,
  features: [state],
  onEvent: (e) => {
    if (e.type === 'stateChanged') save(e.state);
  },
});

function save(s: GridState) { console.log(JSON.stringify(s)); }

const api = state.api(grid);
const saved = api?.state();
if (saved) api?.setState(saved);   // returns the problems of a state it could not fully read
api?.reset();                      // back to the columns and options the grid was made with
```

- `initial` is applied before the first paint, and on a server before the first request: one request at start.
- `persist: { key, include? }` keeps the state in `localStorage` under that key and restores it at start; blocked or
  full storage throws nothing (one `state-storage` warning). `persistLocal(grid, key)` does the same for a grid made
  without the option.
- `stateChanged` comes after a pause (`debounce`, 300 ms) following a user's change: a resized column, a sort, a
  filter, a panel moved.
- A restore never throws. Unknown or removed column ids are skipped (warning `state-column`), columns the state does
  not name keep their settings and go after the named ones, a field of the wrong type is skipped; a state written by
  a newer version (`v` higher) is refused whole (`state-version`).
- Not saved: open rows, the selection, the focus, the scroll position, edits in progress.

## In the address

`toSearchParams(state)` and `fromSearchParams(params)` write the state as one compact parameter (`?grid=1.…`) and read
it back. Typed filter values and the search may be names or record numbers, and an address reaches the browser
history, server logs and `Referer` headers: they are left out unless you ask with `include: ['filter', 'quick']`.

```ts
import { toSearchParams, fromSearchParams, type GridState } from '@dzgrid/dom/state';

export function writeAddress(state: GridState): void {
  const { params } = toSearchParams(state, { name: 'grid' });
  history.replaceState(null, '', `?${params.toString()}`);
}

export function readAddress(): GridState | null {
  return fromSearchParams(new URLSearchParams(location.search), { name: 'grid' }).state;
}
```

The helpers never touch `history` themselves: you choose `pushState` or `replaceState`. In Angular, `[state]` restores
a state, `(stateChanged)` hears it, and `ctrl.resetState()` resets.
