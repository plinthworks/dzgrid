# Selection and ranges

Two different things: **rows** are selected (a set of rows, for an action on them), **cells** are taken in a
**block** (a rectangle, for copy, paste and fill).

## Selecting rows

The `selection` setting turns it on; no feature is needed.

```ts
import { createGrid } from '@dzgrid/dom';
import { idOfDataKey, type SelectionState } from '@dzgrid/core';
import { EN } from '@dzgrid/dom/locales/en';

type Seed = { id: string; plant: string; packets: number };

const grid = createGrid<Seed>(document.getElementById('seeds')!, {
  rows: [{ id: 's1', plant: 'Moon squash', packets: 12 }, { id: 's2', plant: 'Glass bean', packets: 0 }],
  columns: [{ id: 'plant', header: 'Plant' }, { id: 'packets', header: 'Packets', type: 'number' }],
  getRowId: (s) => s.id,
  messages: EN,
  selection: { mode: 'multi', checkbox: true, keepOnFilter: true },
  onEvent: (e) => {
    if (e.type === 'selectionChanged') console.log(describe(e.selection), e.count);
  },
});

function describe(s: SelectionState): string {
  const ids = [...s.keys].map(idOfDataKey);
  return s.mode === 'include' ? `only ${ids.join(', ')}` : `every row but ${ids.join(', ')}`;
}

grid.kernel.dispatch({ type: 'selection.all' }, 'api');
```

- `mode`: `none`, `single` or `multi`. `checkbox: true` adds a tick column with a header box; `click: false` leaves
  clicks to focus only (select with Space or the box).
- Click selects one row, Ctrl/Cmd+click toggles, Shift+click selects a run in screen order; Space toggles the focused
  row, Ctrl+A selects all. The selection survives sorting and filtering.
- The selection holds **row keys**, not your ids. `idOfDataKey(key)` gives the id back; in Angular,
  `selectedIds(controller)` gives the ids of the whole selection with the query.
- `mode: 'exclude'` means « every row the query matches, but these keys »: after « select all » on paged or server
  rows, the grid cannot list them, your server can by replaying the query.
- `canSelect(row, selection, context)` returns `false`, or a reason code, to refuse a row; it needs the `rules()`
  feature from `@dzgrid/dom/rules` (texts `-rules`), which says why to the user.

## Blocks of cells and the clipboard

`range()` from `@dzgrid/dom/range` adds blocks: Shift+arrows, a drag, Ctrl+A. Ctrl+C copies the block as tab-separated
text that spreadsheets read (numbers in the locale's form, formula starts guarded), Ctrl+X cuts, Ctrl+V pastes into
editable cells, Delete empties them. Pasting and cutting need [editing](editing.md). Texts `-range`, CSS `range.css`.

`fill(blocks)` from `@dzgrid/dom/fill` adds the fill handle at the block's corner: drag it to copy the block on, or to
continue a series (1, 2, 3…; days by days); Ctrl+D and Ctrl+R fill down and right from the keyboard. Texts `-fill`, CSS
`fill.css`. A fill or a paste is one save request and one undo.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors-base';
import { range } from '@dzgrid/dom/range';
import { fill } from '@dzgrid/dom/fill';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_EDIT } from '@dzgrid/dom/locales/en-edit';
import { EN_EDITORS } from '@dzgrid/dom/locales/en-editors';
import { EN_RANGE } from '@dzgrid/dom/locales/en-range';
import { EN_FILL } from '@dzgrid/dom/locales/en-fill';
import '@dzgrid/theme/edit.css';
import '@dzgrid/theme/range.css';
import '@dzgrid/theme/fill.css';

type Shelf = { id: string; aisle: string; jars: number };

const blocks = range();
const handle = fill(blocks);
const messages: GridMessages = {
  ...EN,
  text: { ...EN.text, ...EN_EDIT.text, ...EN_EDITORS.text, ...EN_RANGE.text, ...EN_FILL.text },
};

const grid = createGrid<Shelf>(document.getElementById('pantry')!, {
  rows: [{ id: 'a1', aisle: 'Jam', jars: 14 }, { id: 'a2', aisle: 'Honey', jars: 9 }],
  columns: [
    { id: 'aisle', header: 'Aisle' },
    { id: 'jars', header: 'Jars', type: 'number', editable: true },
  ],
  getRowId: (s) => s.id,
  messages,
  features: [edit<Shelf>(), editors(), blocks, handle],
  onEvent: (e) => {
    if (e.type === 'rangeCopied') console.log(`${e.cells} cells copied`);
  },
});

const copied = blocks.api(grid)?.copy({ headers: true });   // the block as text, as Ctrl+C would
console.log(copied);
```

The right-click menu (`contextMenu({ use: { range: blocks, fill: handle } })` from `@dzgrid/dom/context-menu`) offers
the same actions to the mouse.
