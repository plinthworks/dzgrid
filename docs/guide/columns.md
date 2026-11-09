# Columns

A column is a plain object (`ColumnDef<T>` from `@dzgrid/core`). Only the keys below exist; an unknown key is
reported as a problem, never guessed. Angular's `DzgColumnDef<T>` is the same object, and also takes component
classes in `ui`.

## Value and type

```ts
import type { ColumnOrGroup } from '@dzgrid/core';
import { textCodec } from '@dzgrid/core';

type Parcel = {
  id: number;
  code: string;
  sender: { name: string; town: string };
  status: string;
  weight: number;
  sentOn: string;
  arrivedAt: number | null;
  insured: boolean;
};

const shout = { ...textCodec, format: (v: string) => v.toUpperCase() };

export const columns: ColumnOrGroup<Parcel>[] = [
  { id: 'code', header: 'Code', width: 110, pinned: 'start', codec: shout },
  { id: 'sender', header: 'Sender', field: 'sender.name', flex: 2, minWidth: 160 },
  { id: 'status', header: 'Status', type: 'enum', enumOptions: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Delivered' }] },
  { id: 'weight', header: 'Weight', type: 'number', align: 'end', numberFormat: { maximumFractionDigits: 2 } },
  { id: 'sentOn', header: 'Sent on', type: 'day' },
  { id: 'arrivedAt', header: 'Arrived', type: 'instant', instantFormat: { date: true, time: true } },
  { id: 'insured', header: 'Insured', type: 'boolean' },
  { id: 'heavy', header: 'Heavy', type: 'boolean', value: (p) => p.weight > 20, sortable: false, filter: false },
];
```

- `id` is required, unique and stable. The value is read from `field` (a dotted path, own properties only; by default
  the `id`), or computed by `value(row)`.
- `type`: `text` (default), `number`, `day`, `instant`, `boolean`, `enum`, `custom`.
- A `day` is a `'YYYY-MM-DD'` string. An `instant` is epoch milliseconds or ISO text **with** an offset (`Z`,
  `+02:00`). Text with no offset is ambiguous: the cell is blank and an `ambiguous-instant` problem is reported,
  unless the column says which zone to read it in with `assumeZone: 'Europe/Paris'`. A JavaScript `Date` is not
  read: pass `date.getTime()`.
- What a cell shows comes from the type and `numberFormat`, `instantFormat`, `enumOptions`, or a whole `codec` (read,
  format, sort). Instants are shown in the grid's `timeZone`.

## Size and place

`width`, `minWidth`, `maxWidth` (px), `flex` (a share of the room left), `resizable`, `movable`, `pinned: 'start' |
'end'`, `hidden`, `align: 'start' | 'center' | 'end'`, `wrap` (several lines; rows grow with the `autoHeight()`
feature from `@dzgrid/dom/auto-height`). Sides are logical: `start` is the left in English and the right in Arabic.

**Filling the width**: there is no separate « fit to width » switch. Give the columns that should stretch a `flex`
(and a `minWidth`, so they never get too narrow): they share the room the fixed columns leave, and follow the grid's
width when the window is resized. With every column flexible, the columns always fill the grid exactly.

## Columns made from the data

`autoColumns(rows, options)` from `@dzgrid/core/auto-columns` makes the column list from the first rows: one column per
field, typed by its values — numbers, yes / no, `YYYY-MM-DD` days, ISO date-times **with** an offset as instants (one
without an offset stays text: its zone is never guessed), else text. It returns `{ columns, problems }`.

```ts
import { autoColumns } from '@dzgrid/core/auto-columns';
import type { ColumnDef } from '@dzgrid/core';
import { createGrid } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';

type Booking = { ref: string; room: string; guests: number; paid: boolean; from: string; to: string; note: string };
const rows: Booking[] = [
  { ref: 'B-1', room: 'Lagoon', guests: 2, paid: true, from: '2026-07-01T14:00:00Z', to: '2026-07-04T10:00:00Z', note: '' },
  { ref: 'B-2', room: 'Cliff', guests: 4, paid: false, from: '2026-07-02T14:00:00Z', to: '2026-07-09T10:00:00Z', note: 'Late arrival' },
];
const labels: Record<string, string> = { ref: 'Ref.', room: 'Room', guests: 'Guests', paid: 'Paid', stay: 'Stay' };
const actions: ColumnDef<Booking> = { id: 'actions', header: 'Actions', sortable: false, filter: false };

const { columns, problems } = autoColumns(rows, {
  header: (field) => labels[field] ?? field,           // translation
  override: { guests: { width: 90 } },                 // any part of a definition wins over the guess
  merge: { stay: { from: ['from', 'to'], flex: 1 } },  // one column reading both fields; they are hidden
  hide: ['note'],                                      // made, hidden (the columns chooser can show it)
  add: [actions],                                      // columns absent from the data
  order: ['room', 'stay'],                             // these first, the rest in the data's order
});
if (problems.length) console.warn(problems);           // a name at most, never a value

createGrid<Booking>(document.getElementById('bookings')!, { rows, columns, getRowId: (b) => b.ref, messages: EN });
```

A merged column's value is its fields' non-empty values joined by « – »; give it your own `value`, `codec` or a cell
part (`ui.cell`, which receives the whole row) for anything else. With server data, the columns come from the first
answer and then stay: see [Server data](server-data.md#columns-from-the-first-answer).

## Totals row

`total` on a column — `'sum'`, `'avg'`, `'min'`, `'max'`, `'count'`, `'first'`, `'last'`, or your function of the
column's values — and the `totalsRow()` feature from `@dzgrid/dom/totals-row` give a « Total » row at the bottom of the
grid, always in view, over the rows that pass the filters (every page), edits included. It is a row of the pinned
bottom band, so `pinnedRows()` is needed too (texts `-pinned` and `-totals`, CSS `pinned-rows.css`). The CSV and Excel
files and the printed table end with it; a JSON file does not (it holds records only).

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { pinnedRows } from '@dzgrid/dom/pinned-rows';
import { totalsRow } from '@dzgrid/dom/totals-row';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_PINNED } from '@dzgrid/dom/locales/en-pinned';
import { EN_TOTALS } from '@dzgrid/dom/locales/en-totals';
import '@dzgrid/theme/pinned-rows.css';

type Harvest = { id: string; orchard: string; crates: number; sugar: number };
const totals = totalsRow();
const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_PINNED.text, ...EN_TOTALS.text } };

const grid = createGrid<Harvest>(document.getElementById('harvest')!, {
  rows: [{ id: 'h1', orchard: 'North slope', crates: 41, sugar: 14.2 }, { id: 'h2', orchard: 'Old mill', crates: 17, sugar: 12.8 }],
  columns: [
    { id: 'orchard', header: 'Orchard' },
    { id: 'crates', header: 'Crates', type: 'number', total: 'sum' },
    { id: 'sugar', header: 'Sugar (°Bx)', type: 'number', total: 'avg', numberFormat: { maximumFractionDigits: 1 } },
  ],
  getRowId: (h) => h.id,
  messages,
  features: [pinnedRows<Harvest>(), totals],
});

console.log(totals.api(grid)?.values());   // { crates: 58, sugar: 13.5 }
```

The same rules as the group totals (sums without drift, means over the numbers present, `count` counting every row). A
total that does not fit its column (a sum of text) is told once as a problem. With server pages the grid holds one page,
so it computes nothing: give the totals your server sends with `api.set({ crates: 1234 })`.

## Vertical titles

`headerVertical: true` on a column, with the `verticalHeaders()` feature from `@dzgrid/dom/vertical-headers` (CSS
`vertical-headers.css`), writes its title upwards, so a grid of many narrow columns keeps them narrow. The header row
grows to the longest such title (at most `maxHeight`, 240 px by default). Keys and screen readers are unchanged.

```ts
import { createGrid } from '@dzgrid/dom';
import { verticalHeaders } from '@dzgrid/dom/vertical-headers';
import { EN } from '@dzgrid/dom/locales/en';
import '@dzgrid/theme/vertical-headers.css';

type Plot = { id: string; bed: string; mon: boolean; tue: boolean; wed: boolean };
const day = (id: 'mon' | 'tue' | 'wed', header: string) => ({ id, header, type: 'boolean' as const, width: 44, headerVertical: true });

createGrid<Plot>(document.getElementById('watering')!, {
  rows: [{ id: 'p1', bed: 'Herb spiral', mon: true, tue: false, wed: true }],
  columns: [{ id: 'bed', header: 'Bed', flex: 1, minWidth: 140 }, day('mon', 'Monday'), day('tue', 'Tuesday'), day('wed', 'Wednesday')],
  getRowId: (p) => p.id,
  messages: EN,
  features: [verticalHeaders({ maxHeight: 120 })],
});
```

## No header row on screen

The grid setting `headers: 'hidden'` (live; Angular `[headers]`, Web Component `headers="hidden"`) shows no header row.
The headers stay in the page for screen readers, and appear while the keyboard is in them (ArrowUp from the first row),
so sorting and the column menu still work from the keyboard. With the mouse, sort and filter through the cell menu, the
dock's panels or your own controls. Print and the files keep their header row unless you pass `header: false`.

## Columns that collapse on narrow screens

With the `responsive()` feature from `@dzgrid/dom/responsive`, columns that do not fit the view are taken out of the
rows instead of making the grid scroll sideways: a chevron on each row's first cell opens « Title: value » lines under
it (the detail rows' panel, so the `-detail` texts are needed). The last columns go first; `collapsePriority` on a
column (higher goes first, `0` never) or `responsive({ priority: { id: n } })` change the order. The first column and
pinned columns never collapse. A flexible column counts its `minWidth`. It follows every resize; the quick search, the
filters, the files and print still see every column, and nothing is saved in the grid state.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { responsive } from '@dzgrid/dom/responsive';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';

type Hive = { id: string; name: string; apiary: string; frames: number; queen: string; checked: string };
const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };

createGrid<Hive>(document.getElementById('hives')!, {
  rows: [{ id: 'h1', name: 'Clover', apiary: 'Hill', frames: 9, queen: 'Marked blue', checked: '2026-05-02' }],
  columns: [
    { id: 'name', header: 'Hive', width: 160 },
    { id: 'apiary', header: 'Apiary', width: 140, collapsePriority: 2 },
    { id: 'frames', header: 'Frames', type: 'number', width: 100, collapsePriority: 0 },
    { id: 'queen', header: 'Queen', width: 180 },
    { id: 'checked', header: 'Checked', type: 'day', width: 140 },
  ],
  getRowId: (h) => h.id,
  messages,
  features: [responsive()],
});
```

On a row's first cell, Enter or Space opens and closes its lines (arrows too, as for detail rows). It is a detail rows
feature: it cannot be combined with a tree, row grouping, header groups or your own `detail()` (told
`unsupported-combination`).

## Column groups

A group has `children` and an optional `header`; `collapsible` groups fold to the columns marked
`groupShow: 'closed'`. Group header rows need the `spans()` feature.

```ts
import { createGrid } from '@dzgrid/dom';
import type { ColumnOrGroup } from '@dzgrid/core';
import { spans } from '@dzgrid/dom/spans';
import { EN } from '@dzgrid/dom/locales/en';

type Station = { id: string; name: string; tempMin: number; tempMax: number; rain: number };

const columns: ColumnOrGroup<Station>[] = [
  { id: 'name', header: 'Station' },
  { id: 'weather', header: 'Weather', collapsible: true, children: [
    { id: 'tempMin', header: 'Min °C', type: 'number' },
    { id: 'tempMax', header: 'Max °C', type: 'number', groupShow: 'closed' },
    { id: 'rain', header: 'Rain (mm)', type: 'number' },
  ] },
];

createGrid<Station>(document.getElementById('stations')!, {
  rows: [{ id: 's1', name: 'Cape Lumen', tempMin: 4, tempMax: 17, rain: 2.5 }],
  columns,
  getRowId: (s) => s.id,
  messages: EN,
  features: [spans()],
});
```

`spans()` also merges cells: `merge: true` on a column joins equal neighbours, `rowSpan(ctx)` and `colSpan(ctx)`
decide from the data, and the `fullWidth` setting draws a row across every column.

## Classes, tooltips, custom cells

- `ui.cellClass(c)` returns a class for one cell; `ui.headerClass` a class for the header; the grid setting
  `rowClass(c)` a class for a row.
- `tooltip(value, row, context)` returns the text shown on hover and focus; `headerTooltip` the header's.
- `ui.cell`, `ui.header`, `ui.tooltip` name a part (custom drawing, see below).

```ts
import { createGrid, definePart } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';
import '@dzgrid/theme/dzgrid.css';

type Bee = { id: string; hive: string; honey: number };

const jar = definePart('cell', {
  mount(host, c) {
    const span = host.ownerDocument.createElement('span');
    host.append(span);
    const draw = (n: typeof c) => { span.textContent = n.value == null ? '' : `${n.text} kg`; };
    draw(c);
    return { update: draw, destroy: () => span.remove() };
  },
});

createGrid<Bee>(document.getElementById('hives')!, {
  rows: [{ id: 'h1', hive: 'Clover hill', honey: 12.5 }],
  columns: [
    { id: 'hive', header: 'Hive', tooltip: (v) => (v ? `Hive ${v}` : null) },
    { id: 'honey', header: 'Honey', type: 'number', ui: { cell: 'jar', cellClass: (c) => (Number(c.value) > 10 ? 'is-full' : null) } },
  ],
  getRowId: (b) => b.id,
  messages: EN,
  parts: { jar },
  rowClass: (c) => (c.row.honey === 0 ? 'is-empty' : null),
});
```

The grid never writes HTML strings: a part builds DOM in the host it is given, and the grid keeps the cell's role,
focus and keyboard. Header, tooltip and overlay parts need the `slots()` feature from `@dzgrid/dom/slots`. Ready-made
cells (`badge`, `cellBoolean`) are in `@dzgrid/dom/parts`.

## Moving, resizing, hiding

- `columns()` from `@dzgrid/dom/columns`: drag a header to move it, drag its edge to resize, double click the edge to
  fit the content; the keyboard does the same (texts `-columns`, CSS `columns.css`).
- `columnMenu()` from `@dzgrid/dom/column-menu`: the menu on each header (sort, pin, size, hide, group…; texts
  `-column-menu`, CSS `menu.css`). Give it the other features it can drive in `use`.
- `columnsChooser()` from `@dzgrid/dom/columns-panel`: a panel to show, hide and order columns (see
  [Dock and panels](dock-panels.md)).

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { columns } from '@dzgrid/dom/columns';
import { columnMenu } from '@dzgrid/dom/column-menu';
import { columnsChooser } from '@dzgrid/dom/columns-panel';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_COLUMNS } from '@dzgrid/dom/locales/en-columns';
import { EN_COLUMN_MENU } from '@dzgrid/dom/locales/en-column-menu';
import '@dzgrid/theme/dzgrid.css';
import '@dzgrid/theme/columns.css';
import '@dzgrid/theme/menu.css';
import '@dzgrid/theme/columns-panel.css';

type Shell = { id: string; name: string; beach: string; size: number };

const moves = columns();
const chooser = columnsChooser();
const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_COLUMNS.text, ...EN_COLUMN_MENU.text } };

const grid = createGrid<Shell>(document.getElementById('shells')!, {
  rows: [{ id: 'x1', name: 'Spiral cone', beach: 'Amber bay', size: 4.2 }],
  columns: [{ id: 'name', header: 'Shell' }, { id: 'beach', header: 'Beach' }, { id: 'size', header: 'Size (cm)', type: 'number' }],
  getRowId: (s) => s.id,
  messages,
  features: [moves, chooser, columnMenu({ use: { columns: moves, chooser } })],
});

moves.api(grid)?.autoSizeAll();
grid.kernel.dispatch({ type: 'column.state', patch: [{ id: 'beach', hidden: true }] }, 'api');
```

Every feature that has an api gives it through `feature.api(grid)` (in Angular, `ctrl.use(feature)`); it is `null`
until the grid exists.
