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
1. The stack holds the last **100 gestures** per grid (one commit, one clear; Part B: one paste, fill or
   bulk edit = one gesture, all its cells). The 101st drops the oldest.
2. **Ctrl/Cmd+Z** on the grid (focus on a cell, a header or the grid, never in a field) undoes the last
   gesture: each of its cells gets back the value it had before, as **one new gesture** with origin
   `undo`, saved like any edit (one request, the running border, the flash, the refusal) — Q11.
3. **Ctrl+Y** and **Ctrl/Cmd+Shift+Z** redo the last undone gesture (origin `redo`). A new gesture
   empties the redo list.
4. Inside a field, these keys are the field's own (editing.md 19).
5. A cell whose value changed since the gesture (by the source, another edit, a server answer) is
   **skipped**; the other cells of the gesture are undone; said with `edit.undoSkipped`. A gesture all of
   whose cells are skipped leaves the stack anyway.
6. Undo while the gesture's save is still in flight: the undo is queued after it on each cell (save
   rule 4).
7. A refused gesture (`edit-save.md` 15) leaves no entry. A refused undo keeps the error mark like any
   refusal; the stack entry has already moved to the redo list.
8. The focus moves to the first cell of the undone gesture, scrolled fully clear of pinned columns,
   sticky header rows and sticky parents (WCAG 2.4.11, `editing.md` 26); no field opens.
9. The stack is cleared when `getRowId` or the row model changes (one edit controller per kernel: a new
   model or `getRowId` is a new kernel, and the DOM destroys the old controller, its undo with it); on a
   full reload, entries whose rows are gone are skipped when reached. A cell is also skipped when it is
   no longer editable, or when the value to give back is now refused by the column's checks.
10. Nothing to undo / redo: nothing changes, said with `edit.nothingToUndo` / `edit.nothingToRedo`.
11. Nested grids: one stack per grid; Ctrl+Z in an inner grid undoes the inner grid only.
12. API: `edit.undo()`, `edit.redo()`, `edit.canUndo`, `edit.canRedo` (and an event `undoChanged`
    when either changes).
13. Undo never moves rows (K.14); it can make `orderStale` true like an edit.

## Keyboard
| Where | Key | Result |
|---|---|---|
| grid (not in a field) | Ctrl+Z, Cmd+Z | undo |
| grid | Ctrl+Y, Ctrl+Shift+Z, Cmd+Shift+Z | redo |
| field | the same | the field's own |

## Announcements and texts (polite)
| Key | en | fr | ar |
|---|---|---|---|
| `edit.undone` (one cell) | Undone: {column} | Annulé : {column} | تم التراجع: {column} |
| `edit.undoneMany` (plural) | Undone: {n} cells | Annulé : {n} cellules | one: تم التراجع عن خلية واحدة ({n}) · two: تم التراجع عن خليتين ({n}) · few: تم التراجع عن {n} خلايا · many: تم التراجع عن {n} خلية · other: تم التراجع عن {n} خلية |
| `edit.redone` | Redone: {column} | Rétabli : {column} | تمت الإعادة: {column} |
| `edit.redoneMany` (plural) | Redone: {n} cells | Rétabli : {n} cellules | one: تمت إعادة خلية واحدة ({n}) · two: تمت إعادة خليتين ({n}) · few: تمت إعادة {n} خلايا · many: تمت إعادة {n} خلية · other: تمت إعادة {n} خلية |
| `edit.undoSkipped` | Cannot undo {n}: the value changed since | {n} non annulée(s) : la valeur a changé depuis | تعذّر التراجع عن {n}: تغيّرت القيمة منذ ذلك الحين |
| `edit.nothingToUndo` | Nothing to undo | Rien à annuler | لا شيء للتراجع عنه |
| `edit.nothingToRedo` | Nothing to redo | Rien à rétablir | لا شيء لإعادته |

The save sentence (`edit.saving`) follows as for any gesture.

## Right to left
Nothing changes. Keys are matched on `key` first (lower-cased `z`, `y`), so a French AZERTY keyboard's Z
(physical `KeyW`) is Z; only when `key` is not a Latin letter (an Arabic layout gives `ظ`) is `code` used
(`KeyZ`, `KeyY`), so Ctrl+ظ on the Z key's place undoes.

## Choices to confirm
- The focus moves to the undone cell.
- « Nothing to undo » is said.
- Redo also by Ctrl+Shift+Z on Windows (both conventions).

## Tests (to be written with the code)
Step 3: conformance `undo/*` (100 cap, skip when changed, redo cleared, queue order). Step 8: keys on the
grid vs in a field, nested grids, focus after undo (clear of sticky parts), `key` before `code` (AZERTY Z
undoes, AZERTY W does not; Arabic layout by `code`), sentences. Manual:
§19.
