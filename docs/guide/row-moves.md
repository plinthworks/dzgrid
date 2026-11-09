# Row moves

`rowDrag()` from `@dzgrid/dom/row-drag` lets the user move rows: drag the grip at the start of a cell, or press
Alt+Shift+↑ / ↓ (Option+Shift on a Mac), Alt+Shift+Home / End, and in a tree Alt+Shift+→ / ← to indent or outdent; or
use the right-click menu. Texts `-row-drag`, CSS `row-drag.css`. The grip takes mouse, pen and finger; the keys make
dragging never the only way.

The grid tells you where the rows go with a `rowMove` event; **your data decides**. `moveRows` from
`@dzgrid/core/row-drag` applies a move to your array (or tree of parent ids) and returns a new one.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { moveRows } from '@dzgrid/core/row-drag';
import { rowDrag } from '@dzgrid/dom/row-drag';
import { contextMenu } from '@dzgrid/dom/context-menu';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_ROW_DRAG } from '@dzgrid/dom/locales/en-row-drag';
import { EN_CONTEXT_MENU } from '@dzgrid/dom/locales/en-context-menu';
import '@dzgrid/theme/dzgrid.css';
import '@dzgrid/theme/menu.css';
import '@dzgrid/theme/row-drag.css';

type Chore = { id: string; title: string; done: boolean };

let chores: Chore[] = [
  { id: 'c1', title: 'Wind the clock tower', done: false },
  { id: 'c2', title: 'Oil the weather vane', done: true },
  { id: 'c3', title: 'Count the pigeons', done: false },
];
const id = (c: Chore) => c.id;
const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_ROW_DRAG.text, ...EN_CONTEXT_MENU.text } };

const moves = rowDrag<Chore>({ column: 'title', canDrag: (c) => !c.done });
const grid = createGrid<Chore>(document.getElementById('chores')!, {
  rows: chores,
  columns: [{ id: 'title', header: 'Chore', flex: 1 }, { id: 'done', header: 'Done', type: 'boolean' }],
  getRowId: id,
  messages,
  selection: { mode: 'multi' },
  features: [moves, contextMenu<Chore>({ items: (c, defaults) => [...defaults, { separator: true }, ...moves.menuItems(c)] })],
  onEvent: (e) => {
    if (e.type === 'rowMove' && !e.applied) {
      chores = moveRows(chores, e, id);
      grid.update({ rows: chores });
    }
  },
});
```

- `apply: true` lets the grid reorder flat browser rows itself (the event then says `applied: true`); with a store
  (NgRx, signals) leave it off and apply the move where your state lives.
- The grip of a **selected** row drags every selected row shown.
- `canDrag(row)` and `canDrop({ keys, rows, target, parent })` refuse a move; `maxRows` caps how many rows move at once.
- While the rows are sorted or grouped, a move is refused and the grid says why; `whenSorted: 'allow'` sends the event
  anyway and lets you decide.
- With a server source the grid only sends the event (`apply` is ignored): save the new order on the server, then
  refresh.
- In a [tree](tree.md), a row can be dropped inside another (`target.where: 'inside'`); `moveRows(rows, move, id, { parentId,
  setParent })` rewrites the parent ids for you.
- In Angular, the `(rowMove)` output carries the same event, and `ctrl.rowDrag()` the api (`move`, `step`).

## Between grids, or onto your own element

`moves.api(grid)?.dropTargets.add(element, { accept(keys), drop(keys) })` makes any element a place to drop rows: a
bin, a folder list, another grid's box. Moving rows from one grid to another is two updates of your own data: take
them out of one array and add them to the other.
