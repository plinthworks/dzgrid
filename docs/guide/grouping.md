# Grouping

`grouping({ by })` from `@dzgrid/dom/grouping` gathers rows under group rows, one level per column in `by`, with
totals (texts `-group`, CSS `grouping.css`). The group rows are drawn in a group column; → and ← open and close them,
Enter toggles.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import type { ColumnOrGroup } from '@dzgrid/core';
import { grouping } from '@dzgrid/dom/grouping';
import { groupZone } from '@dzgrid/dom/group-zone';
import { columns } from '@dzgrid/dom/columns';
import { columnMenu } from '@dzgrid/dom/column-menu';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_GROUP } from '@dzgrid/dom/locales/en-group';
import { EN_COLUMNS } from '@dzgrid/dom/locales/en-columns';
import { EN_COLUMN_MENU } from '@dzgrid/dom/locales/en-column-menu';
import '@dzgrid/theme/dzgrid.css';
import '@dzgrid/theme/grouping.css';
import '@dzgrid/theme/columns.css';
import '@dzgrid/theme/menu.css';

type Sale = { id: string; island: string; stall: string; fruit: string; crates: number; price: number };

const cols: ColumnOrGroup<Sale>[] = [
  { id: 'island', header: 'Island' },
  { id: 'stall', header: 'Stall' },
  { id: 'fruit', header: 'Fruit', aggFunc: 'count' },
  { id: 'crates', header: 'Crates', type: 'number', aggFunc: 'sum' },
  { id: 'price', header: 'Price (avg.)', type: 'number', aggFunc: 'avg', numberFormat: { maximumFractionDigits: 2 } },
];
const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_GROUP.text, ...EN_COLUMNS.text, ...EN_COLUMN_MENU.text } };

const groups = grouping({ by: ['island', 'stall'], expanded: 1, footers: 'grand', grandTotal: 'bottom' });
const moves = columns();
const grid = createGrid<Sale>(document.getElementById('market')!, {
  rows: [
    { id: 's1', island: 'Maru', stall: 'North pier', fruit: 'Starfruit', crates: 4, price: 3.2 },
    { id: 's2', island: 'Maru', stall: 'Old well', fruit: 'Guava', crates: 7, price: 2.1 },
    { id: 's3', island: 'Teva', stall: 'Reef gate', fruit: 'Mango', crates: 2, price: 4.5 },
  ],
  columns: cols,
  getRowId: (s) => s.id,
  messages,
  features: [moves, groups, groupZone({ use: { grouping: groups, columns: moves } }), columnMenu({ use: { grouping: groups, columns: moves } })],
});

const api = groups.api(grid);
api?.setBy(['fruit']);
api?.expandAll();
console.log(api?.totals());
```

- `by`: the columns to group by, outermost first. Change it with `api.setBy(ids)`, or let the user do it: the drop
  band `groupZone()` from `@dzgrid/dom/group-zone` (drag a header into it), or « Group by this column » in the column
  menu. A column with `groupable: false` cannot be grouped by.
- Totals: a column's `aggFunc` — `sum`, `avg`, `min`, `max`, `count`, `first`, `last`, or your own function — or
  `aggFuncs: { column: fn }` in the options. A group row shows its totals in those columns.
- `expanded`: `'none'`, `'all'` or a depth. `footers`: `'group'` adds a total row under each group, `'grand'` a grand
  total, `'both'`. `grandTotal`: `'top'` or `'bottom'`.
- `api.expandAll(depth?)`, `api.collapseAll()`; the `rows.expandAll` command does the same.
- Sorting a grouped column sorts the groups; other sorts sort the rows inside each group.
- In Angular, `[(groupBy)]` holds the grouped columns and `ctrl.grouping()` gives the api.

## Groups on a server

When the rows live on a server, `serverSideRows({ by })` from `@dzgrid/core/server-side` asks the server for one level
at a time: see [Server data](server-data.md).
