# Undo and redo

Sources: the public documentation of grids and spreadsheets with undo (what a user sees: Ctrl+Z gives the
last edited values back, Ctrl+Y does it again), WCAG 2.2 (3.3.4 reversible, 4.1.3). Phase 5 plan D10,
D13; owner decision Q11.

## What the user does
Edits cells, then presses Ctrl+Z (Cmd+Z on a Mac) on the grid to undo, Ctrl+Y or Ctrl+Shift+Z (Cmd+Shift+Z)
to redo.

## What they observe
The last change goes back, cell by cell gesture by gesture, and is saved again; the focus goes to the
cell that changed back.

## Behaviours
1. The stack holds the last **100 gestures** per grid (one commit, one clear; Part B: one paste, cut,
   fill, bulk edit or Delete on a block = one gesture, all its cells; origins `paste`, `cut`, `fill`,
   `bulk`, `edit`). One Ctrl+Z after a paste gives every pasted cell back, one sentence. The 101st drops the oldest.
2. **Ctrl/Cmd+Z** on the grid (focus on a cell, a header or the grid, never in a field) undoes the last
   gesture: each of its cells gets back the value it had before, as **one new gesture** with origin
   `undo`, saved like any edit (one request, the running border, the flash, the refusal) — Q11.
3. **Ctrl+Y** and **Ctrl/Cmd+Shift+Z** redo the last undone gesture (origin `redo`). A new gesture
   empties the redo list.
4. Inside a field, these keys are the field's own (editing.md 19); so are they in a list's popup, a date dialog,
   a filter input and a cell's widget. While an editor waits for its paint (keys typed ahead on a cell not mounted
   yet), Ctrl/Cmd+Z is left to the browser: nothing is undone, the field opens with what was typed (lead, S8-O6).
5. A cell whose value changed since the gesture (by the source, another edit, a server answer) is
   **skipped**; the other cells of the gesture are undone; said with `edit.undoSkipped`. A gesture all of
   whose cells are skipped leaves the stack anyway.
6. Undo while the gesture's save is still in flight: the undo is queued after it on each cell (save
   rule 4).
7. A refused gesture (`edit-save.md` 15) leaves no entry. A refused undo keeps the error mark like any
   refusal; the stack entry has already moved to the redo list.
8. The focus moves to the first cell of the undone gesture, scrolled fully clear of pinned columns,
   sticky header rows and sticky parents (WCAG 2.4.11, `editing.md` 26); no field opens. A cell no longer shown
   (its parent closed, its row filtered out after a reapply, its column hidden): the value is given back and said,
   the focus stays where it is, nothing opens (owner S8-O4). A field open meanwhile (an application's `api.undo()`
   while the user types) keeps the focus and its text.
9. The stack is cleared when `getRowId` or the row model changes (one edit controller per kernel: a new
   model or `getRowId` is a new kernel, and the DOM destroys the old controller, its undo with it); on a
   full reload, entries whose rows are gone are skipped when reached. A cell is also skipped when it is
   no longer editable, or when the value to give back is now refused by the column's checks.
10. Nothing to undo / redo: nothing changes, said with `edit.nothingToUndo` / `edit.nothingToRedo`.
11. Nested grids: one stack per grid; Ctrl+Z in an inner grid undoes the inner grid only.
12. API: `edit.undo()`, `edit.redo()`, `edit.canUndo`, `edit.canRedo` (and an event `undoChanged`
    when either changes). `undo()` and `redo()` do what the keys do (owner S8-O2): the focus to the first cell
    given back (into the grid from an application's button), revealed, the sentence; the gesture's source is `api`.
    An application that wants none of the keys takes them in its own capture listener (`preventDefault`).
13. Undo never moves rows (K.14); it can make `orderStale` true like an edit.

## Keyboard
| Where | Key | Result |
|---|---|---|
| grid (not in a field) | Ctrl+Z, Cmd+Z | undo |
| grid | Ctrl+Y, Ctrl+Shift+Z, Cmd+Shift+Z, Cmd+Y | redo |
| grid | Ctrl+Shift+Y, Ctrl+Alt+Z, AltGr+Z, Cmd+Option+Z, Ctrl+Z on a Mac, Cmd+Z elsewhere | not taken |
| field, popup, date dialog, filter input, cell widget | the same | the control's own |
| inner grid's cell | Ctrl/Cmd+Z | the inner grid's only |

On a cell or a header of the grid, Ctrl (Cmd on a Mac, never both, never with Alt or AltGr) with Z undoes, with
Shift+Z or Y redoes; a taken key is prevented even when there is nothing to undo, and each key repeat undoes one
more gesture. A composition (key code 229) is never taken.

## Announcements and texts (polite)
| Key | en | fr | ar |
|---|---|---|---|
| `edit.undone` (one cell) | Undone: {column} | Annulé : {column} | تم التراجع: {column} |
| `edit.undoneMany` (plural) | Undone: {n} cells | Annulé : {n} cellules | one: تم التراجع عن خلية واحدة ({n}) · two: تم التراجع عن خليتين ({n}) · few: تم التراجع عن {n} خلايا · many: تم التراجع عن {n} خلية · other: تم التراجع عن {n} خلية |
| `edit.redone` | Redone: {column} | Rétabli : {column} | تمت الإعادة: {column} |
| `edit.redoneMany` (plural) | Redone: {n} cells | Rétabli : {n} cellules | one: تمت إعادة خلية واحدة ({n}) · two: تمت إعادة خليتين ({n}) · few: تمت إعادة {n} خلايا · many: تمت إعادة {n} خلية · other: تمت إعادة {n} خلية |
| `edit.undoSkipped` (plural) | Cannot undo {n}: the value changed since | one: {n} non annulée : la valeur a changé depuis · other: {n} non annulées : … | one: تعذّر التراجع عن خلية واحدة ({n}): تغيّرت القيمة منذ ذلك الحين · two: … خليتين ({n}) · few: … {n} خلايا · many/other: … {n} خلية |
| `edit.redoSkipped` (plural) | Cannot redo {n}: the value changed since | one: {n} non rétablie : … · other: {n} non rétablies : … | one: تعذّرت إعادة خلية واحدة ({n}): … · two: … خليتين ({n}) · few: … {n} خلايا · many/other: … {n} خلية |
| `edit.nothingToUndo` | Nothing to undo | Rien à annuler | لا شيء للتراجع عنه |
| `edit.nothingToRedo` | Nothing to redo | Rien à rétablir | لا شيء لإعادته |

One announcement per undo: the undone (or redone) sentence, the skipped ones counted after it in the same sentence
(« Undone: Price. Cannot undo 1: the value changed since », a full stop between the two; all skipped: that sentence alone), then, joined in the
same announcement, the undo's own « Saving » when its save starts at once (owner S8-O6: « Annulé : Stock.
Enregistrement en cours »), then « order out of date » if the undo made it so. In Arabic `{column}` is isolated
(U+2068 … U+2069).

## Right to left
Nothing changes. Keys are matched on `key` first (lower-cased `z`, `y`), so a French AZERTY keyboard's Z
(physical `KeyW`) is Z; only when `key` is not a Latin letter (an Arabic layout gives `ظ`) is `code` used
(`KeyZ`, `KeyY`), so Ctrl+ظ on the Z key's place undoes.

## Choices (settled)
- The focus moves to the undone cell (O10); `api.undo()` the same (S8-O2); a cell not shown: the focus stays (S8-O4).
- « Nothing to undo » is said (S8-O1 A).
- Redo also by Ctrl+Shift+Z on Windows, and Cmd+Y on a Mac (both conventions).
- The undo's sentence and « Saving » in one announcement (S8-O6).

## Tests
Step 3: conformance `undo/*` (100 cap, skip when changed, redo cleared, queue order). Step 8 (built):
`edit-undo-keys.test.ts` (every row of the keyboard table on both systems, AZERTY and Arabic by `key`/`code`,
AltGr, repeat, owners, the typed-ahead wait, the focus clear of a pinned column and sticky parents, a hidden
target, the sentences, the API), `edit-undo-walk.test.ts` (300 seeds, 1 000 in `test:perm`: client, tree,
nested), `edit-tree`, `edit-nested`, `edit-detail`; browser `--only edit-undo` (keys sent by CDP with their own
`key`/`code`, rects, the border and the flash, axe, forced colours; Firefox and WebKit). Manual: §19.
