# Sort, filter and search

## Sorting

Sorting needs no feature: a click on a header sorts, a second click reverses, Shift+click adds the column to the
sort; from the keyboard, Enter and Shift+Enter on a header do the same. `sortable: false` on a column turns it off; the `multiSort: false` setting keeps one key.
Text sorts follow the grid's `locale` (Arabic letters, accents, digits). Empty cells are last in both directions
(`nulls: 'first'` in a sort item puts them first).

There is no sort key on a column. Sort from code with a command, or set the first sort with the
[state](state.md) feature (`gridState({ initial })`, which sends a single request to a server).

```ts
import { createGrid } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';

type River = { id: string; name: string; length: number };

const grid = createGrid<River>(document.getElementById('rivers')!, {
  rows: [{ id: 'r1', name: 'Silverrun', length: 412 }, { id: 'r2', name: 'Oxbow', length: 96 }],
  columns: [{ id: 'name', header: 'River' }, { id: 'length', header: 'Length (km)', type: 'number' }],
  getRowId: (r) => r.id,
  messages: EN,
});

grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'length', dir: 'desc' }] }, 'api');
grid.kernel.dispatch({ type: 'sort.toggle', column: 'name', multi: true }, 'api');
console.log(grid.kernel.query.sort);
```

## Column filters

`filters()` adds a filter button to each header and a filter popup: text, number, day, instant, yes/no, and a value
list (`kind: 'set'`). Import it from `@dzgrid/dom/filters` (date filters with a calendar, needs `@tzslot/*`) or
`@dzgrid/dom/filters-base` (no calendar). Texts: `-filters`.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '@dzgrid/dom/filters-base';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';

type Recipe = { id: string; name: string; cuisine: string; minutes: number; vegan: boolean };

const columns: ColumnOrGroup<Recipe>[] = [
  { id: 'name', header: 'Recipe', filter: { kind: 'text', debounceMs: 200 } },
  { id: 'cuisine', header: 'Cuisine', filter: { kind: 'set' } },
  { id: 'minutes', header: 'Minutes', type: 'number', filter: { maxConditions: 2 } },
  { id: 'vegan', header: 'Vegan', type: 'boolean' },
];
const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_FILTERS.text } };

const grid = createGrid<Recipe>(document.getElementById('recipes')!, {
  rows: [{ id: 'c1', name: 'Moon soup', cuisine: 'Lunar', minutes: 25, vegan: true }],
  columns,
  getRowId: (r) => r.id,
  messages,
  features: [filters({ floating: true, apply: 'live' })],
});

grid.kernel.dispatch({ type: 'filter.column', column: 'minutes', filter: { type: 'number', op: 'lte', value: 30 } }, 'api');
grid.kernel.dispatch({ type: 'filter.column', column: 'cuisine', filter: { type: 'set', include: ['Lunar'] } }, 'api');
grid.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');   // clears every filter
```

- `floating: true` adds a row of small filter fields under the headers; `apply: 'button'` waits for the Apply
  button instead of filtering as you type. `rowHeight: 44` (1.10.0) gives that row its own height (px at 16 px text,
  24 to 1 000); the row height otherwise.
- `filter: false` on a column removes its filter; `filter.ops` limits the operators offered.
- A filter on a `day` or `instant` column is resolved in the grid's `timeZone`, half-open, to the millisecond —
  also when it is sent to a server.
- The filter shapes (`ColumnFilter`): `text`, `number`, `day`, `instant`, `boolean`, `set`, `combined` (`and` / `or`
  of conditions), `custom` (your own kind, registered with the `filterKinds` setting).

## The filters panel

`filtersPanel()` from `@dzgrid/dom/filters-panel` lists every column's filter in a side panel (texts
`-filters-panel`, CSS `filters-panel.css`). Inside a [dock](dock-panels.md) it becomes one of the dock's panels.

## Quick search

`quickSearch()` from `@dzgrid/dom/search` filters on every visible column at once, from an input you own; matches are
highlighted (CSS `search.css`).

```ts
import { createGrid } from '@dzgrid/dom';
import { quickSearch } from '@dzgrid/dom/search';
import { EN } from '@dzgrid/dom/locales/en';
import '@dzgrid/theme/search.css';

type Cloud = { id: string; name: string; height: number };

const search = quickSearch({ highlight: true });
createGrid<Cloud>(document.getElementById('clouds')!, {
  rows: [{ id: 'n1', name: 'Cirrus feather', height: 9000 }],
  columns: [{ id: 'name', header: 'Cloud' }, { id: 'height', header: 'Height (m)', type: 'number' }],
  getRowId: (c) => c.id,
  messages: EN,
  features: [search],
});
search.bind(document.querySelector<HTMLInputElement>('#cloud-search')!, { debounceMs: 150 });
```

In Angular, `<input [dzgSearch]="search">` (directive `DzgSearch`) binds the same feature; the `[(quick)]` model holds
the text. Searching follows the language: Arabic letters with or without hamza and short vowels, Arabic-Indic digits.

## Find (Ctrl+F)

`find()` from `@dzgrid/dom/find` replaces the browser's Ctrl+F inside the grid: it marks a text in the cells of every row the filters keep
(rows inside closed tree nodes too) and walks the focus from hit to hit with Enter and Shift+Enter, without hiding any
row (texts `-find`, CSS `find.css`).
