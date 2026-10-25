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
2. Wiring (step 9, S9-Q1–Q2): the app puts `edit({ save, savingBorder })` and `editors({ enterMoves, tab, list:
   listEditor })` in `[features]`, as the tree and the detail; their options are fixed at creation (a live switch:
   a new `<dz-grid>`). No `[editing]` input. An app without editing downloads nothing of it: `@dzgrid/angular`
   imports none of `/edit`, `/editors`, `/editors-list`. One input, **`[save]`** (`(req, signal) => Promise<void> |
   void`), live: once set, each change goes to the grid's edits (`setSave`; a save in flight keeps its handler);
   never set, `edit({ save })` stays; set to `undefined` after a value, the local save. `[save]` without the `edit`
   feature: one warning `missing-feature` at `save` (detail `edit`), once per grid.
3. Outputs: `(cellEdited)`, `(saveFailed)` (the host's error unchanged), `(orderStale)`, and
   `(undoChanged)` `{ canUndo, canRedo }` (an app's own Undo / Redo buttons need it to enable
   themselves); `(gridEvent)` still gets every event. As every output: inside the zone when there is one,
   never after destroy, held until the first render then told in order. **Not** outputs:
   `editingStarted` / `editingStopped` — no app need yet; through `(gridEvent)`.
4. No Angular forms, no `ControlValueAccessor`, no two-way « pending edits » state (Q17 A, not B).
5. Custom editors (S9-Q3): `<ng-template dzgPart="stock" slot="editor" let-c>` (the existing directive)
   registers the part `stock`, named by a column's `edit: { editor: 'stock' }`; `dzgPart="editor.number"`
   replaces a type's built-in. `c` is the slot context of `editors.md` 18 with `emit` (`c.value`, `c.text`,
   `c.start`, `c.char`, `c.keep(input)`, `c.cancel()`, `c.refuse(code)`, `c.own(el)`, `c.dir`) plus
   **`c.reads(() => CellInput | undefined)`**: what Enter, Tab and a click elsewhere keep (Q5). Without
   `reads`, only `c.keep()` keeps: a blur keeps nothing. A component: `componentPart('editor', C)`, with an
   optional `read()` (the same role) and `focus()`. A `read()` (or a `reads` function) that throws is the part's
   fault: the error reported, nothing kept, the editor closed with the cell's value unchanged (Enter, Tab or a
   blur alike). The root host `.dzg-editor[data-dzg-owner="editor"]` is
   the grid's. Its handlers run outside the zone: signals.
6. The grid's edits through the controller: `controller.edit()` gives the `EditApi` (`undo()`, `redo()`,
   `reapply()`, `canUndo`, `canRedo`, `commit`), null before the grid, without `edit`, after destroy and on a
   server; `undo()` / `redo()` act as the keys (S8-O2). One `edit()` object in two grids: each its own api.
7. Zones: the grid, the editors and the app's `save` run outside the zone (a save is called from a key
   or a blur handled there); a save's running border is CSS (0 change detection turns); the events of one
   gesture and of the answer reach the outputs inside the zone, one turn each; zoneless works the same
   (signals). Under zone.js an event told outside the zone (a key, a save's answer) reaches its outputs one
   microtask later, with the others of its task; while any wait, later ones (told inside the zone too, or by a
   handler during that turn) wait behind them, so the outputs keep the grid's order. With nothing waiting, an event
   told inside the zone (the app's own `commit()`) reaches them at once.
8. Server-side rendering: no grid, no editor, no timer (and so no cells: `aria-readonly` is written in the
   browser, from the first paint). `edit()`, `editors()`, `listEditor` and `componentPart('editor', …)` can be
   called on a server.

## Texts
None of its own (the `-edit` bundles of `@dzgrid/dom`).

## Right to left
Nothing of its own; the template gets `ctx.dir`.

## Choices made (step 9, owner S9-Q1–Q3, 2026-10-25)
- No `[editing]`: `savingBorder`, `enterMoves`, `tab` are feature options, fixed at creation.
- `(undoChanged)` is an output; `editingStarted` / `editingStopped` are not (through `(gridEvent)`).
- Template editors through `dzgPart … slot="editor"` and `c.reads`, not a `dzgEditor` directive.

## Tests
Step 9 (`docs/phase-5-steps/step09-plan.md`): `packages/angular/test/edit-*.test.ts` (inputs, outputs,
controller, template and component editors, NG0100, nested grids), `ssr.test.ts`, `packaging.test.ts`,
`test-zone/edit-zone.test.ts`; the fixture page `?page=edit`; the example's « stock » screen (`?screen=stock`).
