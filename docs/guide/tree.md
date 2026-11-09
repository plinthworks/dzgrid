# Tree

`tree()` from `@dzgrid/dom/tree` shows rows as a tree (a WAI-ARIA treegrid): the tree column is indented one step per
level, a parent has a chevron, → opens it, ← closes it or goes to the parent (mirrored in right to left), `*` opens
its siblings. Texts `-tree`. Tree rows are ordinary
data rows with ordinary keys: selection, editing and export work on them as on flat rows.

Give the hierarchy one of three ways:

| Option | Your rows | Example |
|---|---|---|
| `parentId(row)` | flat, each with its parent's id (`null` at the top) | folders in a table |
| `children(row)` | nested, each holding its children | a JSON document |
| `path(row)` | flat, each with its path of names | `['Garden', 'Tools', 'Rake']` |

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';

type Room = { id: string; parent: string | null; name: string; area: number };

const rows: Room[] = [
  { id: 'h', parent: null, name: 'Lighthouse', area: 120 },
  { id: 'h1', parent: 'h', name: 'Lamp room', area: 14 },
  { id: 'h2', parent: 'h', name: 'Keeper’s kitchen', area: 22 },
  { id: 'h21', parent: 'h2', name: 'Pantry', area: 4 },
];
const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_TREE.text } };

const rooms = tree<Room>({ parentId: (r) => r.parent, initial: 1, column: 'name', filter: 'ancestors' });
const grid = createGrid<Room>(document.getElementById('rooms')!, {
  rows,
  columns: [{ id: 'name', header: 'Room', flex: 1 }, { id: 'area', header: 'Area (m²)', type: 'number' }],
  getRowId: (r) => r.id,
  messages,
  features: [rooms],
});

grid.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
```

- `initial`: `'none'` (all closed), `'all'`, or a depth (open down to that level).
- `filter`: `'ancestors'` keeps the parents of a matching row (so it can be reached), `'subtree'` also keeps the
  children of a matching parent.
- A sort orders each parent's children among themselves; parents stay above their children. What is open stays open
  after a sort, a filter or new rows.
- `sticky: n` keeps the open parents of the rows in view pinned under the header, up to `n` levels.
- `column` is the tree column (the first visible column by default); `indent` its step in pixels.
- `rows.expand` and `rows.expandAll` commands open and close from code; `rowExpanded` events tell you. In Angular,
  `[(expanded)]` holds the open keys.

## Children loaded on demand

`lazyChildren({ has, load })` from `@dzgrid/dom/tree-lazy` loads a parent's children when it is first opened: `has(row)`
says whether a row may have children (it gets a chevron), `load(row, { signal })` returns them. While they load, a
loading row stands under the parent; a failure there offers a retry.

```ts
import { createGrid } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { lazyChildren } from '@dzgrid/dom/tree-lazy';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';

type Folder = { id: string; parent: string | null; name: string; folders: number };

createGrid<Folder>(document.getElementById('folders')!, {
  rows: [{ id: 'root', parent: null, name: 'Archive of maps', folders: 3 }],
  columns: [{ id: 'name', header: 'Folder' }],
  getRowId: (f) => f.id,
  messages: { ...EN, text: { ...EN.text, ...EN_TREE.text } },
  features: [tree<Folder>({
    parentId: (f) => f.parent,
    lazy: lazyChildren<Folder>({
      has: (f) => f.folders > 0,
      load: async (f, { signal }) => (await fetch(`/api/folders/${f.id}`, { signal: signal as AbortSignal })).json(),
    }),
  })],
});
```

## Master and detail

`detail({ part, height })` from `@dzgrid/dom/detail` opens a panel under a row instead of child rows (texts `-detail`).
The panel is a `detail` part; `nestedGrid({ settings })` makes that part a whole grid of its own. Nesting stops past
three levels.

```ts
import { createGrid } from '@dzgrid/dom';
import { detail, nestedGrid } from '@dzgrid/dom/detail';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';

type Trip = { id: string; date: string; km: number };
type Bicycle = { id: string; name: string; trips: Trip[] };

const messages = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const trips = nestedGrid<Trip>({
  settings: (c) => ({
    rows: (c.row as Bicycle).trips,
    columns: [{ id: 'date', header: 'Date', type: 'day' }, { id: 'km', header: 'km', type: 'number' }],
    getRowId: (t) => t.id,
    messages,
  }),
});

createGrid<Bicycle>(document.getElementById('bicycles')!, {
  rows: [{ id: 'b1', name: 'Blue heron', trips: [{ id: 't1', date: '2026-06-01', km: 42 }] }],
  columns: [{ id: 'name', header: 'Bicycle' }],
  getRowId: (b) => b.id,
  messages,
  features: [detail<Bicycle>({ part: trips, height: 200 })],
});
```

In Angular the panel is a component given with `componentPart('detail', Component)`, and a `<dz-grid [dzgNested]>` inside
it makes the nested grid.
