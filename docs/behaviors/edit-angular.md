# Editing from Angular

Sources: Angular's public documentation (signals, `model()`, `output()`, `ng-template`, zones and
zoneless); our `angular-parts.md`. Phase 5 plan D16; owner decision Q17 (the app gives its save function
and gets events; its editors by template; no Angular forms).

## What the developer does
Marks columns editable, gives a save function, listens to edits and failures, writes an editor as a
template.

## Behaviours
1. Columns' `editable`, `validate`, `edit.*` (options, editor, maxLength…) pass through `[columns]`
   unchanged.
2. Inputs on `<dz-grid>`: `[save]` (the handler, `(req, signal) => Promise<void> | void`) and
   `[editing]` (the options: `enterMoves`, `tab`, `savingBorder`). Changing them live updates the grid
   (no rebuild).
3. Outputs: `(cellEdited)`, `(saveFailed)` (the host's error unchanged), `(orderStale)`, and
   `(undoChanged)` `{ canUndo, canRedo }` (an app's own Undo / Redo buttons need it to enable
   themselves). **Not** outputs: `editingStarted` / `editingStopped` — no app need yet (the Sehhaty
   sheet comes before Part B, Q19), each output costs bytes in a budget of 6 900 already planned at
   +300–600, and they stay reachable through the grid reference's events (`grid.on(...)`). Added when a
   real screen asks.
4. No Angular forms, no `ControlValueAccessor`, no two-way « pending edits » state (Q17 A, not B).
5. Custom editors: `<ng-template dzgEditor="stock" let-ctx>` registers the part `editor.stock`; the
   template's context is the part context of `editors.md` 18 (`ctx.keep(v)`, `ctx.cancel()`,
   `ctx.refuse(code)`); or `componentPart` for a component. The root gets `data-dzg-owner="editor"` from
   the grid.
6. The grid's API (`grid.edit.undo()`, `redo()`, `canUndo`, `canRedo`, `reapply()`) through the
   component's grid reference, as for the other features.
7. Zones: a save's running border is CSS (0 change detection turns); the save promise resolving runs
   the outputs inside the zone once; zoneless works the same (signals).
8. Server-side rendering: no editor, no timer; the cells' `aria-readonly` is written.

## Texts
None of its own (the `-edit` bundles of `@dzgrid/dom`).

## Right to left
Nothing of its own; the template gets `ctx.dir`.

## Choices to confirm
- `[editing]` carries `savingBorder` (the app's switch for the running border).
- `(undoChanged)` is an output; `editingStarted` / `editingStopped` are not (events of the grid reference).

## Tests (to be written with the code)
Step 9: inputs and outputs, a `dzgEditor` template keeping and cancelling, a component editor, a test
zone counting 0 turns during a save's border, SSR without editor, the example untouched except the base
growth (`example:bytes`).
