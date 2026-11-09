# Server data and infinite scroll

When the rows live on a server, give the grid a `source` instead of `rows`. Three sources, from `@dzgrid/core`:

| Source | Entry | What the user gets |
|---|---|---|
| `sourceRows(data)` | `@dzgrid/core/server` | pages (with the pager footer), or every row the server's filter keeps |
| `infiniteRows(data)` | `@dzgrid/core/infinite` | one long list, loaded in blocks while scrolling; blocks far away are let go |
| `serverSideRows(data, { by })` | `@dzgrid/core/server-side` | groups computed by the server, each group's rows loaded in blocks |

Each takes the same `DataSource`: a `fetch(request)` that returns (or resolves to) `{ rows, total?, hasNext?,
nextCursor? }`, and optionally `values(request)` for the set filter's value list.

## Pages

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { sourceRows, type DataRequest, type DataResponse } from '@dzgrid/core/server';
import { filters } from '@dzgrid/dom/filters-base';
import { pagination } from '@dzgrid/dom/pagination';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';
import { EN_PAGINATION } from '@dzgrid/dom/locales/en-pagination';

type Asteroid = { id: string; name: string; found: string; diameter: number };

async function page(req: DataRequest): Promise<DataResponse<Asteroid>> {
  const answer = await fetch('/api/asteroids', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filter: req.filter, quick: req.quick, sort: req.sort, page: req.page, zone: req.zone }),
    signal: req.signal as AbortSignal,
  });
  return answer.json();   // { rows, total }
}

const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_FILTERS.text, ...EN_PAGINATION.text } };

createGrid<Asteroid>(document.getElementById('asteroids')!, {
  source: sourceRows<Asteroid>({ fetch: page }, { params: { catalogue: 'made-up' } }),
  columns: [
    { id: 'name', header: 'Asteroid' },
    { id: 'found', header: 'Found', type: 'day' },
    { id: 'diameter', header: 'Diameter (km)', type: 'number' },
  ],
  getRowId: (a) => a.id,
  messages,
  operations: 'server',
  pagination: { pageSize: 100, pageSizes: [50, 100, 200] },
  features: [filters(), pagination()],
  onEvent: (e) => {
    if (e.type === 'fetchFailed') console.warn('the server did not answer', e.error);
  },
});
```

- The request: `filter` (in a wire form: days and instants already resolved in the grid's zone), `quick`, `sort`,
  `page` (`offset` and `size`, or a cursor with `paging: 'cursor'`), your `params`, the `zone`, a `key` naming the
  query, and a `signal`.
- The answer: `rows`, and `total` when known; without a total, `hasNext` says whether there is more.
- Only the answer to the latest request is shown, whatever order answers arrive in; older requests are aborted
  through `signal`. A failure shows an error with a retry button and a `fetchFailed` event.
- `operations` places each stage: `'server'` (the default with a source) sends filter, search, sort and page to the
  server; `{ filter: 'client', sort: 'client', page: 'off' }` asks for every row once and finishes in the browser. Server
  pages imply filter, search and sort on the server too.
- `refresh` (Angular `ctrl.refresh({})`, plain TypeScript `rows.refresh` command) asks again and keeps the rows shown
  meanwhile; the `busy` setting shows a thin bar while you reload.

## Infinite scroll

```ts
import { createGrid } from '@dzgrid/dom';
import { infiniteRows } from '@dzgrid/core/infinite';
import type { DataRequest } from '@dzgrid/core/server';
import { EN } from '@dzgrid/dom/locales/en';

type Star = { id: number; name: string; magnitude: number };

const stars = infiniteRows<Star>({
  fetch: async (req: DataRequest) => {
    const at = req.page?.offset ?? 0;
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: at + i, name: `Star ${at + i}`, magnitude: (at + i) % 7 }));
    return { rows, total: 1_000_000 };
  },
}, { blockSize: 100, maxBlocks: 20 });

createGrid<Star>(document.getElementById('sky')!, {
  source: stars,
  columns: [{ id: 'name', header: 'Star' }, { id: 'magnitude', header: 'Magnitude', type: 'number' }],
  getRowId: (s) => s.id,
  messages: EN,
});
```

Blocks arrive while the user scrolls (`ahead` blocks in advance, `concurrency` at a time); at most `maxBlocks` are
kept. Rows not loaded yet show as loading rows; a failed block shows « retry » in its place. With an unknown total,
Ctrl+End goes to the last row known, and further each time it is pressed.

## Groups on the server

`serverSideRows(data, { by, aggFuncs })` sends one request per level: the request's `group` says which level and which
open path; the server answers that level's groups with their counts and totals, or a group's rows in blocks. The grid
computes no total itself. The [`server-side-groups.md`](../behaviors/server-side-groups.md) sheet gives the request
and answer shapes; [pivot on a server](pivot.md#pivot-on-a-server) builds on it.

## Rows that change

With `rows`, give a new array, or apply a transaction (rows are matched by id; the focus, selection and open rows stay):

```ts
import { createGrid } from '@dzgrid/dom';
import type { ClientModel } from '@dzgrid/core';
import { EN } from '@dzgrid/dom/locales/en';

type Buoy = { id: string; sea: string; wave: number };

const grid = createGrid<Buoy, ClientModel<Buoy>>(document.getElementById('buoys')!, {
  rows: [{ id: 'y1', sea: 'Glass sea', wave: 1.2 }],
  columns: [{ id: 'sea', header: 'Sea' }, { id: 'wave', header: 'Wave (m)', type: 'number' }],
  getRowId: (b) => b.id,
  messages: EN,
});

grid.kernel.rows.applyTransaction({ add: [{ id: 'y2', sea: 'Salt bay', wave: 0.4 }], patch: [{ id: 'y1', set: { wave: 2.8 } }] });
```

In Angular: `ctrl.applyTransaction(tx)` and `ctrl.applyTransactionAsync(tx)` (many small updates gathered into one).
