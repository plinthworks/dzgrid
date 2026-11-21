# Full-row editing — every editable cell of a row at once

Sources: the public documentation of grids with a « full row » edit type (what a user sees: the whole row turns into
fields, one confirmation for the row), form patterns of WAI-ARIA APG and WCAG 2.2 (2.1.2 no keyboard trap, 3.3.1 error
identification, 4.1.3 status messages). Owner 2026-11-21 (« fais-les tous »). Gap analysis §4 « Édition de ligne
entière ». Opt-in: without it a cell opens alone (`editing.md`). Sheet written before the code (CLEANROOM.md).

## What the user does
Opens a row as a small form, fills several of its fields, then confirms the row once (or gives it up once).

## Behaviours

1. **Opt-in**: `editors({ row: rowEditor })`, `rowEditor` of `@dzgrid/dom/editors-row` (its own entry). The grid's
   editing turns row-wide: there is no single-cell field any more.
2. **Opening**: F2, Enter, a printable character, an input method, a double click or a double tap on an editable cell
   opens **every editable cell of its row** at once: each shows its own editor (text, number, date, date and time, long
   text, list, searching list, the application's part, and a yes/no cell a checkbox). The focus goes to the field of
   the cell started from — a printable character replaces its text, as a cell's would. Non-editable cells keep their
   text. A refused value of a failed save reopens as in `edit-save.md` 15.
3. **The row** carries `data-dzg-row-editing`; the theme (`@dzgrid/theme/forms.css`) outlines it
   (`--dzg-row-editing-outline`, default the accent) — a shape, never colour alone; its fields are the editors' own.
4. **Moving inside the row**: **Tab** / **Shift+Tab** go to the next / previous field of the row in the columns' order
   (pinned columns in their place; a column scrolled out of view is brought into view). Past the last field, Tab
   keeps the row (9–10) and opens the next row on its first editable cell (Shift+Tab: the previous row on its last), as
   a cell's Tab does; refused, the focus stays. With `editors({ tab: 'grid' })` Tab past the last field keeps the row
   and leaves the grid. A click in another field of the row moves there; nothing is kept yet.
5. **Keeping the row**: **Enter** (Shift+Enter too) in any field — and Ctrl/Cmd+Enter in a long-text field — keeps the
   whole row; `enterMoves: 'down'` then goes down (up with Shift) as a cell would. A list's Enter keeps the row with its
   active option; Space picks an option without keeping the row. The application's part's `keep()` keeps the row.
6. **Giving up**: **Escape** gives the whole row up (every field back, nothing kept), the focus on the cell last
   focused; a list's or a calendar's popup closes first on its own Escape. The part's `cancel()` gives the row up.
7. **Leaving**: the focus leaving the row's fields and popups (a click elsewhere, the page) keeps the row as a blur
   keeps a cell (`editing.md`); refused, the values typed are dropped and said (« … not kept »), as a cell's.
8. **One gesture**: a row kept is one gesture — one save request with every cell changed (`origin: 'row'`), one undo
   — or, with `editBatch()` (`edit-batch.md`), one gesture of pending changes. Unchanged fields send nothing; a row
   kept unchanged sends nothing.
9. **Checks before keeping**: each field is read and checked by its column's rules (`edit-validation.md`), then the row
   by `validateRow` when given — `editors({ row: rowEditor, validateRow })`, `(values, row, context) => refusal(s) |
   null`, `values` every column's value as it would be kept, a refusal `{ column, code }` worded by the
   `validation.<code>` text. **Any refusal keeps nothing**: every refused field is marked `aria-invalid`, the first one
   takes the focus with the bubble and the assertive sentence (`edit.refused`); the row stays open.
10. **Kept while open**: a server page or query asked while a row is open keeps it first (as a cell's, O9); its row
    removed by the application gives it up and says so (`edit.rowRemoved`); a column scrolled out keeps what was typed
    in it and shows it again when it comes back.
11. **Screen readers**: opening says « Editing row {row}, {n} fields » politely (`edit.rowEditing`); each field is named
    « {column}, {row} » as any editor; giving up says « Row not changed » (`edit.rowCancelled`); keeping says what the
    save says (`edit-save.md`). The grid's key commands stay off while the focus is in a field (the editors' owner).
12. **Right to left**: the fields in the columns' order, logical sides only; Tab follows the reading order.
13. **Events**: `editingStarted` once for the row (the started column), `editingStopped` once (`kept`, `via`).

## Texts (`@dzgrid/dom/locales/<lang>-forms`)
| Key | en | fr | ar |
|---|---|---|---|
| `edit.rowEditing` | Editing row {row}, {n} fields | Modification de la ligne {row}, {n} champs | تعديل الصف {row}، {n} حقول |
| `edit.rowCancelled` | Row not changed | Ligne inchangée | لم يتغيّر الصف |

## Choices (this sheet)
- A plug of `editors()` (its fields are the editors' own) in its own entry, rather than a flag of `edit()`.
- All or nothing: one refused field keeps nothing of the row.
- Tab leaves the row only past its last field, keeping it (as a cell's Tab); Escape always leaves (no keyboard trap).
- A yes/no cell is a checkbox in the row form (Space toggles it), not a toggle in place.

Tests: `packages/dom/test/editors-row.test.ts` (by hand); `scripts/browser-1-15.mjs --only row` (Chrome, Firefox,
WebKit; en / ar; light / dark).
