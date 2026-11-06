# Pivot (cross table)

Written before the code (CLEANROOM). Sources: what a user sees when a grid or a spreadsheet « pivots » — rows grouped,
the values of a column turned into column headers, a total at each crossing, row and column totals (public
documentation and demos of grids and spreadsheets' pivot tables) — never any grid's code; WAI-ARIA 1.2 (`treegrid`,
`columnheader` with `aria-colspan`, `toolbar`), the APG treegrid and toolbar patterns, WCAG 2.2 (1.3.1, 2.1.1, 2.5.7,
2.5.8, 4.1.3). Plan `docs/phase-10-plan.md`; owner answers `docs/phase-10-steps/questions.md` (2026-11-06, ★
everywhere), which win; the lead's decisions `docs/phase-10-steps/decisions.md`.

## What the user does
Has a list of records grouped by a category (`row-grouping.md`) and wants one more axis across: each month as a column,
the amount of each category in each month, the total of each category at the end of its row, each month's total at the
bottom. Chooses which columns go « en colonnes » (a band beside « Regrouper par »), which columns are totalled and how
(the ⋮ menu of a created column), sorts the categories by one month's total, filters the list.

## What they observe (numbered, each one a test)
1. **Pivot mode is the application's** (Q-P6 A). The application turns it on with the pivot columns and the values; the
   user changes **which** columns pivot, not the mode, unless the application shows a « Tableau croisé » switch.
2. **Rows are the groups.** The row side is the grouping (`row-grouping.md` 1–6): the same groups, labels, order,
   « (Vide) » last, opening and closing. **No data row is shown**: the groups of the last grouping column are the last
   rows — they have no chevron and no `aria-expanded`, opening them does nothing. Without any grouping column, the
   table is the grand total row alone.
3. **Columns are crossings** (Q-P1 A). Each distinct value of the first pivot column becomes a header band, each value of
   the next pivot column a band beneath it, and under the last one a column per value column (« Montant »,
   « Nombre »). With **one** value column its header row is dropped: the last band's cells are the columns themselves.
4. **Equal means exactly equal**, as groups (`row-grouping.md` 3): `1` and `1.0` one column; « Alger » and « alger »
   two; a day by its day, an instant by its instant; empty, missing and unreadable values one column « (Vide) ».
5. **Order of the created columns** (Q-P2 A): as groups — numbers, days, instants by value, booleans false then true,
   text by the language's collation over the distinct values, a list column (enum) by its list, « (Vide) » last, at
   each level. A descending sort on a pivot column reverses its columns; « (Vide) » stays last. Value columns in the
   order the application gave.
6. **Which crossings** (Q-P3 A): those found in the rows the filters and the search keep. Filtering « 2025 » leaves only
   2025's columns. A filter that removes the last row of a crossing removes its column.
7. **A cell** is the total of the rows of its group **and** its crossing, by the value column's function
   (`aggregation.md` 2–7, 15): compensated sums, means over the numbers present (never a mean of means), min and max by
   the column's order, first and last in the group's order, the application's function told the cell's values and
   `{ column, level }`. **Nombre counts the crossing's rows**, not the group's. A crossing with no row in a group shows
   nothing — never « 0 ».
8. **Row totals** (Q-P4 A): at the end of each row, a « Total » band with one column per value: the group's own total
   (the grouping's, over all its rows, whatever the crossings). **Column totals**: the grand total row, one cell per
   crossing. **Sub-totals per pivot level** (« Total 2025 » after 2025's columns) only when the application asks
   (`subtotals: true`).
9. **Too many columns** (Q-P5 A): more than `maxColumns` created columns (default 200; crossings × values, sub-totals
   counted, row totals not): **none is made**; the rows stay grouped with their row totals and the grid says how many
   there would have been (`pivot-too-many`, path `pivot.columns`, the **count** as detail, never a value).
10. **Sort** (Q-P9 A): a click on a created column (or a row total) orders the groups by that total, at every level, the
    empty ones last both ways, ties in the groups' own order. A click on the label column orders the groups by value
    (`row-grouping.md` 4). Rows of data are never shown, so their order does not matter.
11. **Values** (Q-P8 A) are the columns that have a total (`aggFunc`, the options' `aggFuncs`), or the application's
    `values` list; the ⋮ menu of a created column changes the function of its value column for all its columns.
12. **Filters and search** test the data rows before grouping (`row-grouping.md` 6); created columns have no filter and
    are never searched; the filters panel still lists the data columns.
13. **Identity of a created column**: its pivot columns and values, never its place — a new month appearing keeps the
    width, the pin and the sort of the others. Created columns are rebuilt only when their list changes.
14. **Saved state** (Q-P10 A): the mode, the pivot columns, the value functions by name; never a created column, its
    band or a sort on it (their names hold row values). See `grid-state.md` « Pivot ».
15. **Refused beside pivot** (Q-P11 A; `unsupported-combination`, never a throw): a server or block source (the grid as
    grouping alone shows it), and whatever grouping refuses (a tree, master/detail, browser pages). A pivot column
    that the grid does not know: dropped, `unknown-column` (path `pivot.columns`, the id); one marked
    `groupable: false`, given twice, or also a grouping column: dropped, `invalid-setting` (path `pivot.columns`, the
    id).
16. **A chart** (Q-P12 A): `series()` hands the table to a chart library — the categories (a level's groups, in the
    order shown) and one series per created column of one value (its name the chain of its headers), numbers or empty.

## Health data
A created column's id and its band's hold the crossing's values (a ward, a name if someone pivots on names), exactly
like a group's key (`row-grouping.md` « Health data »). They live in memory and in the page (the headers the user reads)
only: never in a `Problem`, the saved state, the page address or an event's detail.

## What DzGrid does
- `@dzgrid/core/pivot`: `pivotShape({ by, columns, values, on, subtotals, maxColumns, width, labels, …grouping })` is a
  grouping with crossings: the grouping's row shape, its deepest groups made leaves, and one bucketed pass computing every
  cell of every group (O(rows × levels × values), whatever the number of crossings), merged under the group's totals by
  created column id. `generated()` hands the created column tree (bands and leaves, `ColumnOrGroup[]`) with a key that
  changes only when the list does; `checkPivot` checks a saved state's `pivot`.
- Ids: `~p` (a column), `~b` (a band), `~t` (a sub-total) + the group key's length-prefixed segments of each pivot
  column and value, then the value column (`~p1:y5:t20251:v`). Every id starting with `~p`, `~b` or `~t` is the pivot's
  while it is loaded (`made(id)`): left out of the saved state even after its column vanished.
- A pivot's totals rows default to the grand total (`footers: 'grand'`); `series()` is the core's (the DOM hands it on).
- An edit of a pivot column moves its row to its new crossing at once (as totals follow an edit); an edit of a grouping
  column still waits for « Réappliquer ».
- The DOM half (`@dzgrid/dom/pivot`, the « Colonnes » band, the menu items, the label column, the folded data columns)
  comes in the next batch; its sheet items are 17 onwards.

## Right to left
Bands and created columns follow the reading direction like any header; the order of crossings is logical (the first
at the start).

## Tests
`conformance/cases/pivot/*`, `packages/core/test/pivot.test.ts` (seeded walk against a hand-written oracle of nested
maps, one build per load, planted values), `conformance/cases/grid-state/pivot-*`; the DOM at the next batch.

## On screen (next batch; plan D4, D9–D13, D16)
17. A label column at the start, pinned, its header the grouping columns' names joined; chevrons and indent of the
    grouping. 18. The data columns hidden by a fold of their own (never `hidden`: the user's choices and the state
    never see pivot mode). 19. The « Colonnes » band (`group-drop-zone.md`) and a « + » list in both bands (2.5.7).
20. The ⋮ menu of a created column: sort, pin, size, hide, « Total : Somme / Moyenne / Min / Max / Nombre ».
21. Header bands are `columnheader`s with `aria-colspan` (`spans()` needed); a cell's name is its header chain.
22. Sentences « Mis en colonnes : {name} », « {name} retiré des colonnes », « {n} colonnes », the limit's sentence.
