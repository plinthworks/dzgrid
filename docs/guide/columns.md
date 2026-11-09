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
