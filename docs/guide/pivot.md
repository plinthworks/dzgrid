# Pivot

A pivot table adds an axis across [grouping](grouping.md): the rows are the groups, each value of the pivot columns
becomes a column, and each cell totals the value columns where a group and a column meet. `pivot()` from
`@dzgrid/dom/pivot` is given to `grouping({ pivot })`, which draws it (texts `-pivot`, CSS `pivot.css`). The value
columns' headers need `spans()`.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import type { ColumnOrGroup } from '@dzgrid/core';
import { grouping } from '@dzgrid/dom/grouping';
import { pivot } from '@dzgrid/dom/pivot';
import { pivotBar } from '@dzgrid/dom/pivot-bar';
import { spans } from '@dzgrid/dom/spans';
import { groups } from '@dzgrid/dom/groups';
import { columns } from '@dzgrid/dom/columns';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_GROUP } from '@dzgrid/dom/locales/en-group';
import { EN_PIVOT } from '@dzgrid/dom/locales/en-pivot';
import { EN_PIVOT_BAR } from '@dzgrid/dom/locales/en-pivot-bar';
import { EN_COLUMNS } from '@dzgrid/dom/locales/en-columns';
import '@dzgrid/theme/dzgrid.css';
import '@dzgrid/theme/grouping.css';
import '@dzgrid/theme/pivot.css';
import '@dzgrid/theme/columns.css';

type Ticket = { id: string; cinema: string; month: string; film: string; seats: number; takings: number };

const cols: ColumnOrGroup<Ticket>[] = [
  { id: 'cinema', header: 'Cinema' },
  { id: 'month', header: 'Month' },
  { id: 'film', header: 'Film' },
  { id: 'seats', header: 'Seats', type: 'number' },
  { id: 'takings', header: 'Takings', type: 'number', numberFormat: { style: 'currency', currency: 'EUR' } },
];
const messages: GridMessages = {
  ...EN,
  text: { ...EN.text, ...EN_GROUP.text, ...EN_PIVOT.text, ...EN_PIVOT_BAR.text, ...EN_COLUMNS.text },
};

const cross = pivot({ columns: ['month'], values: { seats: 'sum', takings: 'sum' }, subtotals: true });
const rowsBy = grouping({ by: ['cinema'], pivot: cross });
const moves = columns();
const grid = createGrid<Ticket>(document.getElementById('box-office')!, {
  rows: [
    { id: 't1', cinema: 'The Comet', month: '2026-01', film: 'Paper Tides', seats: 120, takings: 960 },
    { id: 't2', cinema: 'The Comet', month: '2026-02', film: 'Paper Tides', seats: 80, takings: 640 },
    { id: 't3', cinema: 'Orchard Hall', month: '2026-01', film: 'Nine Lanterns', seats: 45, takings: 405 },
  ],
  columns: cols,
  getRowId: (t) => t.id,
  messages,
  features: [spans(), groups(), moves, rowsBy, pivotBar({ use: { grouping: rowsBy, pivot: cross, columns: moves } })],
});

const api = cross.api(grid);
api?.setBy(['month', 'film']);                   // two levels of columns
api?.setValues({ seats: 'avg', takings: 'sum' });
const chart = api?.series({ value: 'takings' });  // { categories, series: [{ id, name, values }] }
console.log(chart?.categories, chart?.series.length);
```

- `columns`: the pivot columns, outermost first; `values`: each value column and how it is totalled (`sum`, `avg`,
  `min`, `max`, `count`, `first`, `last`). `desc` lists the pivot columns whose order is reversed.
- `subtotals: true` adds a total column after each band. `maxColumns` (200 by default) caps how many columns are
  made: past it, none is made, the rows stay grouped with their totals, and the grid says how many there would have
  been (problem `pivot-too-many`). The row side is the grouping: its `by`, totals and opening rules hold.
- `pivotBar()` from `@dzgrid/dom/pivot-bar` draws a bar « Rows │ Columns │ Values » where the user moves columns
  between parts, reverses an order, or changes a value's function (texts `-pivot-bar`).
- Pivot mode is the application's: `toggle: true` (or an element of yours) shows a switch to turn it on and off;
  otherwise `api.setOn(on)`.
- `api.series()` gives the numbers of one value column, ready for a chart library of your own: DzGrid draws no chart.

## Pivot on a server

`serverSideRows(data, { pivot: serverPivot() })`, with `serverPivot` from `@dzgrid/core/server-pivot`, lets the server
compute the crossings; the request's `group` then carries the pivot columns in use and their limit. The features stay
the same (`spans()`, `grouping({ by, pivot })`). See the behaviour sheet [`server-pivot.md`](../behaviors/server-pivot.md).
