# Editing a cell

Sources: the public documentation of grids and spreadsheets that edit in place (what a user sees: a
field appears in the cell, Enter keeps the value and goes down, Escape gives the old one back), WAI-ARIA
1.2 grid (`aria-readonly` on a `gridcell`), the APG grid pattern (« editing » keys: Enter or F2 into a
cell's field, Escape back to the cell), WCAG 2.2 (2.1.1, 2.1.2, 2.4.3, 4.1.2). Phase 5 plan D4, D5, D11,
D12, D13; owner decisions Q3, Q4, Q5, Q13. Saving: `edit-save.md`; refusals: `edit-validation.md`; the
fields: `editors.md`.

## What the user does
Moves to a cell and starts typing, or presses F2 or Enter, or double-clicks; changes the text; keeps it
with Enter, Tab or a click elsewhere, or gives it up with Escape; clears a cell with Delete.

## What they observe
- A field opens inside the cell, the same size, the text in the same place. Typing a letter or a digit
  on a cell replaces its text with that character; F2, Enter or a double click keep the text, caret at
  its end.
- Enter keeps the value and goes to the cell below (or stays, if the application chose so); Shift+Enter
  goes up. Tab keeps it and opens the next editable cell; Escape gives the old value back and stays on
  the cell. A click on another cell keeps the value too.
- A cell that cannot be edited does nothing on F2, typing or a double click; a screen reader says
  « lecture seule ».
- A single click only moves the focus; it never opens a field.

## Behaviours (numbered, each one a test)

**Where editing is possible**
1. A cell is editable when its row is a **data row** and its column says yes (`editable: true` or
   `editable(row, context)` true). Detail rows, filler rows of a path tree, loading rows: never, whatever
   the column says (`editableAt` in the core; Phase 4 criterion 5 carried here).
2. In a tree, the columns that feed the structure (parent id, path) are read-only in this phase (Q13).
   `tree({ structure: ['parentId'] })` names them; in path mode the tree column is one by default (the
   core seam, `lockColumns`, is step 2's; the `tree({ structure })` option in `@dzgrid/dom/tree` is step 8's,
   owner S2-O4). Such a column marked editable gives one warning `edit-structure` (path
   `columns.<id>.editable`; told once when a column becomes locked and editable, again only after it stopped being either) and stays
   read-only.
3. A grid with no editable column keeps `aria-readonly="true"` on the grid, as today. As soon as one
   column is editable, the grid loses it and each cell that is not editable (by its column, its row or
   `editable(row, context)` false) carries `aria-readonly="true"`; editable cells carry nothing.
   Recomputed when the rows, the columns or the context change.

**Starting** (cell focused, editable)
4. **F2** opens the field with the cell's text, caret at the end.
5. **Enter** first offers the key to the cell's part, as today: a cell holds an **interactive part** when
   the part's `focus()` returns true, and Enter then enters the part. Otherwise (no part, no `focus()`,
   or `focus()` false) Enter edits: on a yes/no cell it toggles, on a list cell it opens the list
   (`editors.md` 10, 12), elsewhere it opens the field with the text, caret at the end. **F2** on an
   editable cell always edits (never the part); on a read-only cell it keeps calling the part's
   `focus()` (`parts.md`).
6. A **printable character** (no Ctrl, Cmd or Alt; AltGr characters count) opens the field holding only
   that character, caret after it. Arabic letters and Arabic-Indic digits count. **Space is not one**:
   it selects the row, except on an editable yes/no cell where it toggles (`editors.md` 10). In a
   tree's column the tree's keys win: `*` opens the siblings (`tree-keys.md`) and never starts an edit
   there (F2, Enter and a double click do; other printable characters still start one).
7. An input method composition (`isComposing`, key code 229) starting on a cell opens the field and the
   composed text lands in it; no character is lost (checked in Chrome through CDP at step 5).
8. A **double click** opens the field with the text, caret at the end (at the click point where the
   browser gives it).
9. **Delete** or **Backspace** clears the cell without opening a field: one save of the column's empty
   value (`null`), origin `edit`. A required column refuses it (`edit-validation.md`).
10. On a cell that is not editable, 4–9 do nothing (no sound, no sentence; the reader already said
    « lecture seule »). Enter keeps its read-only meaning (enter a part).
11. A single click never opens a field.

**Ending**
12. **Enter** keeps the value (one save) and, with `edit.enterMoves: 'down'` (default), moves the focus
    to the same column one row down — any row kind, as the Down arrow; on the last row it stays.
    `'stay'` keeps the focus on the cell. Nothing opens on the new cell.
13. **Shift+Enter** keeps the value and moves one row up (`'stay'`: stays).
14. **Tab** keeps the value and, with `edit.tab: 'cell'` (default), opens the next editable cell in
    reading order: the next editable column of the row, then the first editable cell of the next data
    row (details, fillers, loading rows stepped over). **Shift+Tab** the same backwards. At the last
    (first) editable cell of the grid: the field closes, the focus stays on the cell. `edit.tab: 'grid'`:
    Tab keeps the value, closes, and leaves the grid as from any cell (one tab stop).
15. **Escape** gives the field up: the cell shows its value as before, the focus is on the cell, nothing
    is saved, nothing said.
16. **Blur**: the focus going to anything else in the page (a click on another cell, a button, a field
    outside) keeps the value (Q5). The window losing focus (another application) keeps the field open.
17. Closing always focuses the cell first, then removes the field (retained-row contract 6): the focus
    is never on `body`.
18. While a field is open, the row is never re-used for another row nor changed under it (retained-row
    contract 5): scrolling the row out of view keeps the field and its text; a live update of the row
    changes its other cells, never the one being edited.

**Inside the field** (the field is marked `data-dzg-owner="editor"`)
19. Arrows, Home, End, Ctrl/Cmd+A, Ctrl/Cmd+Z, Ctrl/Cmd+V, Ctrl/Cmd+C, Ctrl/Cmd+X, Space and every
    printable key belong to the field: the grid never acts on them (no move, no undo, no paste, no
    selection).
20. Enter and Escape during a composition belong to the input method.
21. **Tree column**: the field fills the content box after the indent and the chevron; Left and Right move
    the caret, never open or close the row (the tree's keys ignore the `editor` owner).
22. **Nested grids**: a field in an inner grid is the inner grid's; the outer grid takes none of its keys.
    Each grid edits for itself.
23. The field's accessible name is the column's header and the row's header (`aria-labelledby` on both
    cells); its value is the text.

**Events**
24. `cellEdited { key, column, value, previous, origin }` after each kept value (one per cell), origin
    `edit` (typed, toggled, picked or cleared by Delete) | `undo` | `redo` (Part B: `paste`, `fill`,
    `bulk`). No event for Escape.
25. `editingStarted { key, column }` and `editingStopped { key, column, kept: boolean }`.

**Focus never hidden**
26. **Never hidden** (WCAG 2.4.11): a field that opens, or a cell reached by Enter, Shift+Enter, Tab or
    Shift+Tab, is scrolled so that it is fully clear of the pinned columns, the sticky header rows (and
    the floating filter row) and a tree's sticky parent rows; a bubble or a tooltip of the grid never
    covers the focused field (it goes below, or above when there is no room below).

## Keyboard

| Where | Key | Result |
|---|---|---|
| editable cell | F2 | open, text kept, caret at end (never the part) |
| editable cell | Enter | enter the part if its `focus()` returns true; else open (yes/no: toggle; list: open the list) |
| editable cell | printable character (not Space) | open with that character only |
| editable cell | Space | select the row (yes/no cell: toggle) |
| tree column cell | `*` | open the siblings (no edit) |
| editable cell | Delete, Backspace | clear (one save) |
| editable cell | double click | open, text kept |
| read-only cell | any of the above | nothing (Enter enters a part as before) |
| field | Enter / Shift+Enter | keep, move down / up (`enterMoves: 'stay'`: stay) |
| field | Tab / Shift+Tab | keep, open next / previous editable cell (`tab: 'grid'`: leave the grid) |
| field | Escape | give up, focus on the cell |
| field | arrows, Home, End, Ctrl+Z/V/C/X/A | the field's own |
| field, composing | Enter, Escape | the input method's |

## Announcements
None of its own: the reader says the field (name, value) and « lecture seule » on read-only cells.
Saves, refusals, undo: their sheets.

## Right to left
- The field takes the cell's direction; free text has `dir="auto"`; numbers and dates are isolated
  left-to-right (`editors.md`).
- Tab follows the reading order (logical), so it goes leftwards in Arabic; Enter down and up are the
  same in both directions.
- In the tree column, Left and Right inside the field move the caret as the text's direction says.

## Texts
None in this sheet (the read-only word is the reader's own).

## Choices to confirm (not settled by the decisions)
- Delete **and** Backspace both clear (Mac keyboards' « delete » is Backspace).
- Tab opens the next cell's field (continuous entry); at the grid's end the focus stays.
- The empty value of a cleared cell is `null` for every type, text included.
- The window losing focus keeps the field open (only a focus change inside the page keeps the value).
- Structure columns named by `tree({ structure })`.

## Tests (to be written with the code)
Step 2: conformance `editable/*` (data rows only; details, fillers, loading refused; `editable(row,
context)`). Step 4: `aria-readonly` per cell, retained-row rules 5–6. Step 5: `edit-keys` (each row of
the table, RTL Tab order, IME 229, nested grid ignored, owner `editor`), bugs 1 and 4 of ngx-sheetgrid
`a6c97f5` replayed, the edit walk. Step 8: tree column Left/Right in ar, `edit-structure`, details
refused (criterion 5). Manual: `docs/a11y-protocol.md` §19.
