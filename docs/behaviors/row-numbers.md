# Row numbers

Written before the code (CLEANROOM). Owner decisions (2026-11-03) in `phase-9-steps/decisions.md` « Row numbers and
search highlight — owner decisions », which win over this sheet. What a spreadsheet does with its row headers is named
from using one, nothing read.

## What the user does
Looks at the narrow grey strip at the start of every row to know where they are (« row 1 204 of the filtered rows »),
clicks a number to take the whole row, Shift+clicks another number to take every row between.

## What they observe
1. **Opt-in.** Only with `rowNumbers()` (`@dzgrid/dom/row-numbers`). Without it, nothing changes, not one pixel.
2. **Where.** A narrow strip at the inline start of every row (the left in left to right, the right in Arabic), before
   the selection boxes and the start-pinned columns, pinned with them: it never scrolls sideways. Its corner in the
   column headers row; an empty cell of the strip in the group rows above and the filter row under it.
3. **What it shows.** 1, 2, 3… in **display order**: after the sort, the filters, the quick search, a tree's opening
   and closing. The first row shown is 1. Every row shown counts (a tree's parents, a group or title row, a loading
   row on a server); a **detail panel** does not (it is part of its row, not a row) and shows no number. Numbers are in
   the grid's digits (Arabic-Indic with `numerals: 'locale'` in Arabic), tabular, at the strip's end.
4. **Pages.** On a paged grid (`pagination()`, or a server's pages), the numbers go on from the pages before: page 2 of
   50 starts at 51.
5. **Pinned rows** (`pinnedRows()`): no number (they are totals, not rows of the list); the strip's cell is there,
   empty, so the columns line up. A tree's pinned parents (the sticky copies) show their row's number.
6. **Width.** As wide as the largest number shown needs (two digits at least), at the grid's text size: it widens when
   the rows pass 99, 999… and the flexible columns share the rest.
7. **Never a column.** Not sortable, not filterable, not editable, not movable, not resizable, not in the columns panel
   nor the column menu, never searched (quick search, find), never in an export (CSV, Excel), the print, the clipboard,
   the grid's state or a server's request. Every place that recomputes the columns reads `columns.visible()`; the strip
   is not there.
8. **Click a number** (`range()` on): the whole row becomes the block (its first to its last visible column), the
   grid's focus on the row's first cell. **Shift+click**: every row from the block's anchor row (or the focused row)
   to the clicked one, the focus kept, as a spreadsheet does. Without `range()` but with row selection
   (`selection.mode`): a click selects that row only, Ctrl/⌘+click toggles it (multi), Shift+click selects the rows
   between (multi) — the same as a click on the row box. With neither: a click does nothing.
9. **Click the corner** (`range()` on): every cell shown becomes the block, as Ctrl+A.
10. **Keyboard.** The strip is not a stop of the arrow keys (it is not a column: a cell never sits there). What a click
    does is on the keys already: Shift+Space takes the focused row as the block (`range()`), Ctrl+A every cell, Shift
    with ↑ ↓ extends; Space selects the row (row selection). WCAG 2.1.1 asks the function on the keyboard, not every
    element as a stop.
11. **Screen reader.** The strip's cells are cells of the grid (`aria-colindex` 1, every other column after it); the
    corner is a column header named « Row number » / « N° de ligne » / « رقم الصف », so a number is heard as « Row
    number, 12 ». Its mark is decorative otherwise.
12. **Look.** The header's surface and muted text, a line at its end edge; a row taken whole (all its cells in the
    block, or the row selected) tints its number. Density changes its height as every row. Forced colours: system
    colours.

## What DzGrid does differently on purpose
- Numbers count the rows *shown*, never a data index: they change when the sort or a filter changes (a spreadsheet's
  numbers are fixed because its rows are). Rows are still identified by their `RowKey`, never by this number.
- No drag along the numbers in 1.4.0 (Shift+click covers it).
