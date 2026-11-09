# Editing

Two features: `edit()` from `@dzgrid/dom/edit` holds the edits (save, undo, refusals; texts `-edit`, CSS `edit.css`),
`editors()` draws the fields (texts `-editors`). Take `editors` from `@dzgrid/dom/editors` (a date calendar from
`@tzslot/*`, loaded on first use) or from `@dzgrid/dom/editors-base` (no calendar).

F2, Enter, a double click or typing a character opens the field; Enter keeps the value and moves down (`enterMoves`),
Tab moves to the next editable cell, Escape gives the old value back.

```ts
import { createGrid } from '@dzgrid/dom';
import type { ColumnOrGroup } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors-base';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_EDIT } from '@dzgrid/dom/locales/en-edit';
import { EN_EDITORS } from '@dzgrid/dom/locales/en-editors';
import '@dzgrid/theme/dzgrid.css';
import '@dzgrid/theme/edit.css';

type Gnome = { id: string; name: string; hat: string; height: number; painted: string; locked: boolean };

const columns: ColumnOrGroup<Gnome>[] = [
  { id: 'name', header: 'Name', editable: (g) => !g.locked, edit: { required: true, maxLength: 40 } },
  { id: 'hat', header: 'Hat', type: 'enum', editable: true,
    edit: { options: [{ value: 'red', label: 'Red' }, { value: 'green', label: 'Green' }] } },
  { id: 'height', header: 'Height (cm)', type: 'number', editable: true, edit: { min: 5, max: 120 },
    validate: (v) => (typeof v === 'number' && v % 1 !== 0 ? 'whole' : null) },
  { id: 'painted', header: 'Painted on', type: 'day', editable: true },
];

async function save(req: SaveRequest<Gnome>, signal: AbortSignal): Promise<void> {
  const body = req.changes.map((c) => ({ id: c.row.id, column: c.column, value: c.value }));
  const answer = await fetch('/api/gnomes', { method: 'PATCH', body: JSON.stringify(body), signal });
  if (!answer.ok) throw Object.assign(new Error('refused'), { reason: await answer.text() });
}

// Not typed `GridMessages`: an app's own `validation.<code>` keys are extra keys.
const messages = {
  ...EN,
  text: { ...EN.text, ...EN_EDIT.text, ...EN_EDITORS.text, 'validation.whole': 'a whole number' },
};

const grid = createGrid<Gnome>(document.getElementById('gnomes')!, {
  rows: [{ id: 'g1', name: 'Barnaby', hat: 'red', height: 31, painted: '2025-04-02', locked: false }],
  columns,
  getRowId: (g) => g.id,
  messages,
  features: [edit<Gnome>({ save: (req, signal) => save(req, signal as AbortSignal) }), editors({ enterMoves: 'down' })],
  onEvent: (e) => {
    if (e.type === 'cellEdited') console.log(e.column, e.previous, '→', e.value, e.origin);
    if (e.type === 'saveFailed') console.warn('not saved', e.column, e.reason);
  },
});
```

## Checks

- `editable`: `true`, or a function `(row, context, info)`; a cell that cannot be edited answers « read-only ».
- `edit`: `required`, `min`, `max`, `pattern`, `maxLength`, `options` (a list, or a function of the row), and
  `editor` (the name of your own editor part).
- `validate(value, row, context)` returns a code, or `null` when the value is fine. Give the code's sentence in
  `messages` as `validation.<code>`; without it, a generic « invalid » is said.
- A refused value stays in the open field, blinks, and is said to screen readers with the column's name and the reason.

## Saving

`save(request, signal)` receives one request per gesture (`request.changes`: `key`, `column`, `value`, `previous`,
`row`; `request.origin` says whether it was an edit, a paste, a fill, an undo…). Resolve: saved. Reject or throw:
refused — the cells go back, and an error with a string `reason` shows that reason. Without `save`, edits are kept in
the grid only (you hear `cellEdited` and may apply it to your rows). While a save runs, the cell shows a moving
border and says « saving » to screen readers. Saves of one cell go in order: a newer gesture waits for the older one.
The grid never writes into your rows: a kept value is shown over the row until your rows (a new array, a transaction,
a server answer) carry it. Hand `signal` on to `fetch`.

## Undo and redo

Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes (Cmd on a Mac), over the last 100 gestures, each going through `save` again. From code:

```ts
import { createGrid } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors-base';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_EDIT } from '@dzgrid/dom/locales/en-edit';
import { EN_EDITORS } from '@dzgrid/dom/locales/en-editors';

type Note = { id: string; text: string };

const editing = edit<Note>();
const grid = createGrid<Note>(document.getElementById('notes')!, {
  rows: [{ id: 'n1', text: 'Feed the dragon' }],
  columns: [{ id: 'text', header: 'Note', editable: true }],
  getRowId: (n) => n.id,
  messages: { ...EN, text: { ...EN.text, ...EN_EDIT.text, ...EN_EDITORS.text } },
  features: [editing, editors()],
  onEvent: (e) => {
    if (e.type === 'undoChanged') console.log('can undo:', e.canUndo, 'can redo:', e.canRedo);
  },
});

document.getElementById('undo')!.addEventListener('click', () => editing.api(grid)?.undo());
```

In Angular: `[save]="save"` on `<dz-grid>`, `(cellEdited)`, `(saveFailed)`, `(undoChanged)`, and
`ctrl.edit()?.undo()`.

## Your own editor

An `editor` part draws the field; its context's `keep(input)` keeps a value (through the same checks and save),
`cancel()` closes without one, `refuse(code)` refuses with a reason. Register it under
a name and point the column's `edit.editor` at it (or name it `editor.<type>` to replace an editor for a whole type).
A ready list editor with search is `listEditor()` from `@dzgrid/dom/editors-list`.
