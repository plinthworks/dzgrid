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
- The DOM half (`@dzgrid/dom/pivot`, the « Colonnes » band, the menu items, the label column, the folded data columns):
  items 17–30 below.

## Right to left
Bands and created columns follow the reading direction like any header; the order of crossings is logical (the first
at the start).

## Tests
`conformance/cases/pivot/*`, `packages/core/test/pivot.test.ts` (seeded walk against a hand-written oracle of nested
maps, one build per load, planted values), `conformance/cases/grid-state/pivot-*`; the DOM half (17–30):
`packages/dom/test/pivot.test.ts`, `pivot-zone.test.ts`, `pivot-out.test.ts` (search, find, exports, state).

## On screen (`@dzgrid/dom/pivot`, DOM batch; plan D4, D9–D16, D18–D20; written before its code)
`pivot(options)` is handed to `grouping({ by, pivot: p })` (one feature in `features`, `ctrl.use(p)` / `p.api(grid)` for the
application). Its texts come in `locales/<lang>-pivot`.
17. **The label column** (`~p:rows`, made by the pivot): pinned at the start, its header the grouping columns' names joined
    (« Région / Mois »), the grouping's chevrons, indent and labels; never moved, hidden, filtered or grouped. The last
    rows (deepest groups) have no chevron and no `aria-expanded`. A click on its header orders the groups by value: the
    first click as they are (the groups' own order), the second reversed, « (Vide) » last both ways.
18. **The data columns are folded away** by a fold of the pivot's own (never `hidden`: the user's hidden / shown, the
    columns panel and the saved state never see pivot mode; a collapsible header group's fold and the pivot's are
    joined). The value columns stay shown, at the end, under a « Total » band: they are the row totals (8), with their
    own width, pin and sort. Pivot off: the columns as the application gave them, nothing folded. The columns panel
    lists the application's columns only, never the created ones, and gives a folded data column no description
    (`columns-chooser.md` 9; owner 2026-11-07).
19. **The « Colonnes » band**: `groupZone({ use: { grouping: p }, texts: 'pivot' })`, after « Regrouper par »: the same
    chips, keys, reorder and × as `group-drop-zone.md`, labelled « Colonnes du tableau croisé ». **Each band ends with a
    « + » button** (its texts given: `zone.add`, `pivot.add`) opening a menu of the columns it accepts — known,
    groupable, in neither band, never a column the pivot made — by their names in the grid's order: Enter (or a click)
    adds one at the end, said as a drop is (« Mis en colonnes : Mois »); Escape closes it, the focus back on « + ». It is
    the path without dragging (WCAG 2.5.7) while the data columns' headers are folded away.
20. **The ⋮ menu** (`columnMenu({ use: { pivot: p } })`): on a created column and on a row total, « Total » radios —
    Somme, Moyenne, Min, Max, Nombre, those that fit the value column's type (sum and mean: numbers; min and max:
    numbers, days, instants, texts; count: any) — change the value column's function for all its columns, said
    (« Montant : Moyenne »); no « Regrouper par », no filter. On a data column whose header is shown: « Mettre en
    colonnes » / « Ne plus mettre en colonnes ».
21. **Header bands** are header groups (`spans()` loaded): `columnheader` with `aria-colspan`, a cell named by its header
    chain. Grouping now tells `spans` refused only when a column merges cells (`merge`, `rowSpan`, `colSpan`) or rows are
    full width; header bands alone are drawn beside grouping, pivot or not. Without `spans()` the created headers show
    their last line only (the application loads `spans()`; not told).
22. **Sort** (10): a click on a created column or a row total orders the groups by that total; the data rows are never
    shown, so the base sort over them reads nothing (the created columns' cells read nothing).
23. **Sentences** (polite, once): the band's own (19); after a change of the pivot columns or the mode by the user, the
    number of created columns (« 24 colonnes »); above the limit (9), a visible note in the pivot's strip and the same
    sentence once: « 1 240 colonnes : trop pour l'écran ; retirez une colonne » (the count only, never a value).
24. **« Tableau croisé »** (`pivot({ toggle: true })`, Q-P6 A): a `role="switch"` button in the pivot's strip, above the
    rows, `aria-checked` the mode; 24 px. Without `toggle`, the mode is the application's alone (`api.setOn`).
25. **Search and find in pivot mode.** The quick search keeps testing the **data** columns' values, as on the flat grid:
    the folded columns the user had shown (a hidden one is still never searched), a word with a digit in the numbers,
    days and instants by their shown and export texts, any word in texts and lists — a row whose data holds the words is
    kept, so its groups and crossings stay. The created columns are never searched (12). It reads them through the label
    column's search text (one haystack, the digit rule kept by keeping only the digit-bearing pieces of a number's or a
    date's texts; a word without a digit may still meet the letters inside such a piece, « h » in « 12h30 »).
    **Find (Ctrl+F)** in pivot mode searches the cells shown (the labels and the totals as written) and, on a last-row
    group's label cell, the data columns' shown texts of its rows: a hit there is that group's label cell.
26. **Refused** (15): beside a server or block source the pivot is not made (`unsupported-combination`, path `source`,
    detail `pivot`), the grid as grouping alone shows it, `api()` null.
27. **Exports** (D18 A): CSV writes the label column, each created column with its **full chain** as header (« 2025 ›
    Janv. › Montant »), the row totals as « Total › Montant », the grand total row; Excel writes the bands as merged
    header rows (the effective tree), totals typed; print prints the bands (`spans()`), `all` = every group open.
28. **State** (14): restored with one grouping build (rows grouping and pivot together); a user's change of the pivot
    columns, the mode or a function is a gesture (`stateChanged` after the pause).
29. **The application's columns**: an `update({ columns })` keeps the pivot (the effective tree made again from the new
    columns); a created column keeps its width, pin and sort by id while it exists.
30. **Angular**: nothing new — `grouping({ …, pivot: p })` in `features`, `ctrl.use(p)` for the api, `pivot` in `[state]`.

### Texts (`locales/<lang>-pivot`)
| key | en | fr | ar |
|---|---|---|---|
| `pivot.label` | Pivot columns | Colonnes du tableau croisé | أعمدة الجدول المحوري |
| `pivot.empty` | Add a column here to spread it across | Ajoutez une colonne ici pour la mettre en colonnes | أضف عمودًا هنا لتوزيعه أعمدةً |
| `pivot.remove` | Remove {column} from the columns | Retirer {column} des colonnes | إزالة {column} من الأعمدة |
| `pivot.grouped` | Spread across: {column} | Mis en colonnes : {column} | وُزِّع أعمدةً: {column} |
| `pivot.removed` | {column} removed from the columns | {column} retiré des colonnes | أُزيل {column} من الأعمدة |
| `pivot.placed` | {column}: level {n} of {total} | {column} : niveau {n} sur {total} | {column}: المستوى {n} من {total} |
| `pivot.add` | Add a column | Ajouter une colonne | إضافة عمود |
| `zone.add` (the « Regrouper par » band's « + », in this bundle) | Add a column | Ajouter une colonne | إضافة عمود |
| `pivot.total` | Total | Total | المجموع |
| `pivot.subtotal` | Total {name} | Total {name} | مجموع {name} |
| `pivot.count` | {n} columns | {n} colonnes | {n} أعمدة |
| `pivot.tooMany` | {n} columns: too many for the screen; remove a column | {n} colonnes : trop pour l'écran ; retirez une colonne | {n} عمود: كثيرة على الشاشة؛ أزل عمودًا |
| `pivot.switch` | Pivot table | Tableau croisé | جدول محوري |
| `menu.pivotBy` | Spread across columns | Mettre en colonnes | توزيع أعمدةً |
| `menu.pivotOff` | Stop spreading across columns | Ne plus mettre en colonnes | إيقاف التوزيع أعمدةً |
| `menu.total` | Total | Total | المجموع |
| `fn.sum` / `fn.avg` / `fn.min` / `fn.max` / `fn.count` | Sum / Average / Min / Max / Count | Somme / Moyenne / Min / Max / Nombre | المجموع / المتوسط / الأدنى / الأقصى / العدد |
| `pivot.fnSaid` | {column}: {fn} | {column} : {fn} | {column}: {fn} |

- **Both bands empty (owner, 2026-11-07):** with no grouping column and no pivot column, pivot mode shows the table itself — the application's columns and every row, the grand total row kept at the end. Putting a column back in either band makes the pivot again.

## One bar, the values, the order, the folds (owner feedback 2026-11-07, « ok »; written before its code)
The header area « looks unfinished »: three stacked strips, two bands whose purpose is unclear once filled, created headers
cut. This follow-up (1.7.0) replaces them with one named bar and makes the created headers readable. Decisions taken alone
are in `docs/phase-10-steps/decisions.md` « Follow-up: the bar ».

31. **One bar** (`pivotBar({ use: { grouping, pivot, columns? }, panel? })`, `@dzgrid/dom/pivot-bar`, texts in
    `locales/<lang>-pivot-bar`, look in `@dzgrid/theme/pivot.css`): one strip above the rows with three parts in this
    order — « Lignes » (the grouping columns), « Colonnes » (the pivot columns), « Valeurs » (the values). Each part is a
    `toolbar` named by its visible name (`aria-labelledby`), its own tab stop, the chips, keys, chip drag, header drop,
    « + » and × of `group-drop-zone.md` 9, 14–18; empty, its hint. A thin rule separates the parts (at the inline start of
    the second and third: the right side in Arabic). When the bar is 30 rem wide or less (its own width, a container
    query: 320 px screens), the parts stack, one per line, the rule above each. The pivot's own strip (the switch when
    `toggle` is `'inside'`, the limit's note) joins the bar at its end. It replaces the two `groupZone()` bands beside a
    pivot; `groupZone()` alone (grouping without pivot) is unchanged (« Regrouper par » as before).
32. **« Valeurs »**: a chip per value, in the values' order: « somme(Montant) » — `pivot.valueChip` `{fn}({column})`, the
    function's name (`fn.*`) in the language's lower case and the column's short name (38); an application's own function
    (no name) shows the column's name alone. The chip's button has `aria-haspopup="menu"`: Enter, Space or a click opens
    the grid's menu, the radios « Total » of the functions that fit the column (20), the current one checked; choosing one
    sets it for all its columns, said (`pivot.fnSaid`); the focus back on the chip (Escape too). × or Delete removes the
    value, said (`pivot.valueRemoved`); the last one removed leaves the rows grouped with no created column.
    Ctrl+Shift+arrows move a value one place (the order of the value columns under each crossing), said
    (`pivot.valuePlaced`). « + » (`pivot.addValue`) lists the columns that can be totalled — known, not made by the pivot,
    not a value yet, a number column or one with an `aggFunc` — by name in the grid's order; one chosen is added last with
    its `aggFunc` when it names a function that fits, else `sum` for a number, `count` otherwise; said
    (`pivot.valueAdded`). A header dropped on the part (with `columns()`) is added the same way.
33. **The order of a pivot column's created columns**: each « Colonnes » chip carries, after its name, a button ↑ (the
    order of 5) or ↓ (reversed, « (Vide) » still last), `aria-pressed` true when reversed, named `pivot.order`
    (« Ordre inverse : Mois »); a click, Enter or Space flips it, said (`pivot.reversed` / `pivot.ordered`); it is an item
    of the part's roving order (name, order, ×). The reversed pivot columns are the pivot's (`api.desc()`,
    `setDesc(ids)`, `pivot({ desc })`), **saved with the pivot**: `GridState.pivot.desc` (ids, written only when one is
    reversed; absent means none). A descending sort on the pivot column (5, through the API) reverses it too: either one
    reverses. The created columns keep their ids, widths and folds (13).
34. **Created bands fold** (with `groups()` and `spans()`): every band the pivot makes (a crossing over several columns,
    `~b…`) is a collapsible header group, open at first: its header carries the toggle (`aria-expanded`), Enter or Space on
    the band's header folds it (`header-groups.md` 8–11). Folded, it keeps its first column (the first value of its first
    crossing) and folds the others away, joined with the pivot's own fold (18); a sub-total after it (`subtotals`) stays
    beside it. The « Total » band does not fold. A folded created band is kept while it exists (by id: a new month keeps
    the others' folds) and is **never saved** (its id holds row values: the state's `groups` skips the pivot's ids).
    Without `groups()` the bands do not fold.
35. **The switch** (`pivot({ toggle })`, replaces 24's placement): `true` or `'inside'`: in the pivot's strip (in the bar
    with `pivotBar()`); an element: the switch is appended into it (the application's toolbar, beside its own buttons),
    removed at destroy; absent: no switch. Always a `button` with `role="switch"`, `aria-checked` the mode, its visible
    name `pivot.switch` beside a track and knob drawn by the theme (`pivot.css`), 24 px high. With `pivotBar()` and
    `columnsChooser()`, the columns panel (docked or dialog) starts with a second switch « Mode pivot » (`pivot.mode`):
    the same mode. Each flip is a gesture (28).
36. **Sections in the columns panel** (`pivotBar({ panel })`, default true, with `columnsChooser()`, `columns-chooser.md`):
    under its title and above its search, the switch (35) then the three parts of the bar (31–33), the same chips, keys,
    menus and moves, wrapped to the panel's width. In the dialog, Tab goes switch → each part's stop → search → list →
    buttons (still trapped).
37. **Moving a column between parts** (the bar and the panel): Ctrl+Shift+ArrowUp / ArrowDown on a chip's item moves its
    column to the previous / next part (Lignes, Colonnes, Valeurs; no wrap), added last there when that part accepts it
    (Lignes and Colonnes: known, groupable, not made by the pivot; Valeurs: 32's rule), said as an add there
    (`zone.grouped`, `pivot.grouped`, `pivot.valueAdded`), the focus on its chip in the new part; refused, nothing
    changes, said `pivot.refused` (« Ventes ne peut pas aller dans Valeurs »). A chip dragged (mouse, pen) and released
    over another part does the same; released elsewhere, nothing.
38. **Readable created headers**: `pivot({ valueHeaders })` — `'auto'` (default): with several values, the value headers
    under each crossing and under « Total » are `{fn}({column})` (« somme(Montant) »), with one value the crossing's
    label alone (3) and « Total » over the column's short name; `'fn'`: the function form always (also under « Total »
    with one value); `'name'`: the short name only. **The short name** is `ColumnDef.headerShort` when the application
    gives it (« Montant » for « Montant (DA) »: no unit), else `header`; the chips of the three parts use it too. **Width**:
    without `pivot({ width })`, a created column is as wide as its header needs, estimated without measuring: 9 px per
    character plus 64 px (padding, resize grip and menu; measured in Chrome), at least 120, at most 240; a longer one is cut with « … ». **Tooltip**: each
    created column and each row total carries its full name, the chain with the full headers (« Janv. › somme(Montant
    (DA)) »).
39. **Texts** `locales/<lang>-pivot-bar` (en / fr / ar):

| key | en | fr | ar |
|---|---|---|---|
| `pivot.rows` | Rows | Lignes | الصفوف |
| `pivot.columns` | Columns | Colonnes | الأعمدة |
| `pivot.values` | Values | Valeurs | القيم |
| `pivot.valuesEmpty` | Add a value to total | Ajoutez une valeur à totaliser | أضف قيمة لجمعها |
| `pivot.addValue` | Add a value | Ajouter une valeur | إضافة قيمة |
| `pivot.removeValue` | Remove {column} from the values | Retirer {column} des valeurs | إزالة {column} من القيم |
| `pivot.valueAdded` | Value added: {column} | Valeur ajoutée : {column} | أُضيفت قيمة: {column} |
| `pivot.valueRemoved` | {column} removed from the values | {column} retiré des valeurs | أُزيل {column} من القيم |
| `pivot.valuePlaced` | {column}: place {n} of {total} | {column} : place {n} sur {total} | {column}: الموضع {n} من {total} |
| `pivot.order` | Reverse order: {column} | Ordre inverse : {column} | ترتيب معكوس: {column} |
| `pivot.reversed` | {column}: reverse order | {column} : ordre inverse | {column}: ترتيب معكوس |
| `pivot.ordered` | {column}: usual order | {column} : ordre habituel | {column}: الترتيب المعتاد |
| `pivot.refused` | {column} cannot go in {part} | {column} ne peut pas aller dans {part} | لا يمكن وضع {column} في {part} |
| `pivot.mode` | Pivot mode | Mode pivot | الوضع المحوري |

    And in `locales/<lang>-pivot`: `pivot.valueChip` `{fn}({column})` (the same in the three languages; Arabic
    `{fn}({column})` too, the parentheses mirrored by the reading direction).
40. **Health data**: the chips, the parts and the panel show column names and function names only; the created headers
    and tooltips hold the crossings' values (as 17's bands do) and live only in the page; `desc` holds column ids.
