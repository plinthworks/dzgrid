# Find in the grid (Ctrl+F)

Written before the code (CLEANROOM). Owner answers: `phase-9-steps/decisions.md` « Find in grid — owner answers
(2026-11-03) », which win over this sheet. What other products do (a spreadsheet's find bar, a browser's find) is named
from their public pages and from using them, nothing read.

## What the user does
Clicks a cell (or tabs into the grid), presses Ctrl+F (⌘F on a Mac), types a few letters, then walks the hits with
Enter, Shift+Enter or the ↑ ↓ buttons, and closes with Escape.

## What they observe
1. **Opt-in.** The bar exists only when the application adds the feature (`find()` from `@dzgrid/dom/find`). Without it,
   Ctrl+F is the browser's own, everywhere.
2. **Only inside the grid.** Ctrl/Cmd+F opens the grid's bar only while the focus is in the grid (a cell, a header, the
   bar itself); anywhere else on the page, the browser's find. Pressed again in the bar: its text is selected. An editor
   open in a cell keeps the key (the browser's).
3. **The bar** sits above the column headers, inside the grid's box, outside `role="grid"`: a search field labelled
   « Rechercher dans la grille », the count, ↑ (previous) and ↓ (next) buttons, × (close). Opening it puts the focus in
   the field; the last text is kept and selected.
4. **What is searched**: the text each cell shows, in the visible columns (hidden ones never), case and accents
   ignored (« ete » finds « Été », Arabic short vowels ignored, as the quick search folds). Spaces count as typed (the
   text is trimmed at its ends only). A cell drawn by a part is searched by its column's text. Details, group fillers
   and pinned rows are not searched.
5. **Rows are never hidden.** Unlike the quick search (which filters), find only marks. The filters and the quick
   search still decide which rows exist; find searches those.
6. **A tree**: rows inside closed nodes are searched too, in the order they would show once open. Going to a hit inside
   a closed node opens its ancestors (as many as needed), nothing else.
7. **Marks**: every hit cell is tinted with the find colour and underlined; the current hit more strongly, with a ring.
   The find colour is its own hue, apart from the selection and the block (the accent), the value flash (the warning)
   and the new rows (the success). Forced colours: `Mark` / `Highlight`.
8. **The count**: « 3 / 12 » in the grid's digits; « Aucun résultat » when the text finds nothing; empty for an empty
   field. A server's grid (`source`): only the rows loaded (the page shown) are searched, and the bar says so
   (« Page chargée seulement »).
9. **Walking**: Enter or ↓ goes to the next hit, Shift+Enter or ↑ to the previous one, wrapping at the ends. The current
   hit is scrolled into view (rows and columns, clear of the pinned ones) and becomes the grid's focused cell, while
   the typing focus stays in the field.
10. **Typing**: the hits follow the text after a short pause (150 ms by default, `debounceMs`). The first hit is the
    first one at or after the grid's focused cell.
11. **Kept up to date**: data changes, edits, a sort, a filter, the quick search, columns shown, hidden or moved, the
    language: the hits are found again at the next paint; the current hit stays the same cell when it still is one.
12. **Closing**: Escape in the bar (or ×) closes it, clears every mark and puts the focus back on the grid's focused
    cell — the last hit visited. Nothing else changes (no row opened is closed again).
13. **Screen readers**: the field is labelled; once typing settles, one polite sentence: « 3 sur 12 » or « Aucun
    résultat ». Walking says « 4 sur 12 » too (polite). The buttons are labelled (« Résultat précédent », « Résultat
    suivant », « Fermer la recherche »); the count is not a live region of its own (one voice: the grid's).
14. **Right to left**: the bar follows the grid's direction (field at the start, buttons after); ↑ ↓ stay vertical.
    Texts in English, French and Arabic (`locales/<lang>-find`).

## Clear all filters (the menus)
15. The column menu and the cell menu show « Effacer tous les filtres » only while a column filter or the quick search
    is active. It does what `clearFilters()` does: every column filter and the quick search emptied, the sort kept, one
    request on a server; the filters' own sentence follows. Its text is optional in an application's own bundle
    (`menu.clearFilters`, `cmenu.clearFilters`): missing, the item is not shown.

## Where DzGrid differs on purpose
- The browser's find cannot see virtual rows (not in the page) nor closed tree nodes; the grid's can.
- A cell is the unit of a hit (not a word inside it): the focus and the keys work by cell.

## A list loaded in blocks (Phase 8, `infinite-scroll.md`, plan D15)
Ctrl+F searches the rows held only (the bar's note says, as for server pages, that only the rows loaded are searched),
never ten million: the search reads `DisplayedRows.held`; loading rows hold no text.
