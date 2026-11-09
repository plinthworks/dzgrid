# Getting started in plain TypeScript

`@dzgrid/dom` draws the grid in any page, with no framework. `@dzgrid/core` holds the calculations (no DOM) and
`@dzgrid/theme` the CSS.

## Install

```sh
npm install @dzgrid/core @dzgrid/dom @dzgrid/theme
```

`@dzgrid/dom/filters` and `@dzgrid/dom/editors` load a date calendar from `@tzslot/core` and `@tzslot/dom`; install
them too when you use those two entries, or import the same functions from `@dzgrid/dom/filters-base` and
`@dzgrid/dom/editors-base`, which have no calendar.

## A first grid

The grid fills its host element: give the host a height.

```html
<div id="books" style="block-size: 420px; display: flex; flex-direction: column"></div>
```

The `display: flex; flex-direction: column` matters: it stretches the grid to the host's height, so the grid
scrolls inside it and draws only the rows in view. Without it the grid grows with its rows; it then holds its
view to the window's height and tells a `problems` event with the code `unbounded-viewport` (path `host`) once.
Seeing that code means: give the host this layout (or size the grid's `.dzg` yourself).

```ts
import { createGrid } from '@dzgrid/dom';
import type { ColumnOrGroup } from '@dzgrid/core';
import { EN } from '@dzgrid/dom/locales/en';
import '@dzgrid/theme/dzgrid.css';

type Book = { id: string; title: string; author: string; published: string; price: number };

const rows: Book[] = [
  { id: 'b1', title: 'The Glass Orchard', author: 'Mira Volkov', published: '2019-03-14', price: 18.5 },
  { id: 'b2', title: 'Salt and Lanterns', author: 'Idris Fenwick', published: '2021-11-02', price: 22 },
];

const columns: ColumnOrGroup<Book>[] = [
  { id: 'title', header: 'Title', flex: 2, pinned: 'start' },
  { id: 'author', header: 'Author', flex: 1 },
  { id: 'published', header: 'Published', type: 'day', width: 130 },
  { id: 'price', header: 'Price', type: 'number', numberFormat: { style: 'currency', currency: 'EUR' } },
];

const grid = createGrid<Book>(document.getElementById('books')!, {
  rows,
  columns,
  getRowId: (b) => b.id,
  messages: EN,
  locale: 'en-GB',
  label: 'Books',
});
```

Three settings are required: `columns`, `getRowId` (a stable, unique id per row) and `messages` (the grid ships no
language by default; `EN`, `FR` and `AR` are in `@dzgrid/dom/locales/*`). The grid's layout CSS is injected by the
grid itself; `@dzgrid/theme/dzgrid.css` makes it look finished (borders, colours, focus ring).

## Features and their texts

Each feature is a function from its own entry, given once in `features`. A feature that shows text needs its text
bundle merged into `messages`; a missing bundle throws at creation with the list of missing keys.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { filters } from '@dzgrid/dom/filters-base';
import { pagination } from '@dzgrid/dom/pagination';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';
import { EN_PAGINATION } from '@dzgrid/dom/locales/en-pagination';

type Plant = { id: number; name: string; height: number };

const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_FILTERS.text, ...EN_PAGINATION.text } };

createGrid<Plant>(document.getElementById('plants')!, {
  rows: [{ id: 1, name: 'Blue fern', height: 40 }],
  columns: [{ id: 'name', header: 'Name' }, { id: 'height', header: 'Height (cm)', type: 'number' }],
  getRowId: (p) => p.id,
  messages,
  pagination: { pageSize: 50 },
  features: [filters(), pagination()],
});
```

`features` is read once, when the grid is made. Most other settings are live (see below).

## Events

`onEvent` receives every grid event; switch on `type`. Problems (a bad column, a bad filter, a server answer that
cannot be read) arrive as a `problems` event: log them while you develop.

```ts
import { createGrid } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';

type Tea = { id: string; name: string };

createGrid<Tea>(document.getElementById('teas')!, {
  rows: [{ id: 't1', name: 'Smoked oolong' }],
  columns: [{ id: 'name', header: 'Tea' }],
  getRowId: (t) => t.id,
  messages: EN,
  selection: { mode: 'multi', checkbox: true },
  onEvent: (e) => {
    if (e.type === 'rowClicked' && e.row.kind === 'data') console.log('clicked', e.row.data.name);
    if (e.type === 'selectionChanged') console.log('selected', e.count);
    if (e.type === 'problems') for (const p of e.problems) console.warn('dzgrid', p.code, p.path, p.detail);
  },
});
```

The same events can be heard later with `grid.kernel.subscribe(fn)`, which returns a function that stops listening.

## Updating and driving the grid

`grid.update(patch)` changes settings. Give new arrays and objects, never mutated ones: rows are matched by their
id, so a new array keeps the focus, the selection and the open rows of the rows that are still there.

```ts
import { createGrid } from '@dzgrid/dom';
import { dataKey } from '@dzgrid/core';
import { EN } from '@dzgrid/dom/locales/en';

type Kite = { id: string; name: string; span: number };
let kites: Kite[] = [{ id: 'k1', name: 'Red falcon', span: 120 }];

const grid = createGrid<Kite>(document.getElementById('kites')!, {
  rows: kites,
  columns: [{ id: 'name', header: 'Kite' }, { id: 'span', header: 'Span (cm)', type: 'number' }],
  getRowId: (k) => k.id,
  messages: EN,
});

kites = [...kites, { id: 'k2', name: 'Paper moth', span: 80 }];
grid.update({ rows: kites, density: 'compact' });

grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'span', dir: 'desc' }] }, 'api');
const key = dataKey('k2');
if (key) grid.api.focusCell(key, 'name');

// When the page goes away:
grid.destroy();
```

Commands (`grid.kernel.dispatch`) take a `RowKey` (from `dataKey(id)`), never a position: positions change with
every sort and filter.

## Next

- [Columns](columns.md) for every column key.
- [Theming and right to left](theming-rtl.md) for the look.
- [Angular](getting-started-angular.md) or the [Web Component](getting-started-element.md) for the wrappers.
