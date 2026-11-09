# A totals row on a flat grid

Written before the code (CLEANROOM). Sources: what a spreadsheet's « total row » does (a sum, a mean, a count under each
column, always in view) and Tabulator's public feature list (« column calculations »), used as a checklist only. Owner
answers 2026-11-09 (1.9.0 lot A, item 2). Same counting rules as the group totals (`aggregation.md` 2–7, 15). Entries:
`@dzgrid/core/totals` (`columnTotals()`, pure) and `@dzgrid/dom/totals-row` (`totalsRow()`, on top of `pinnedRows()`).

## Why not grouping by no column
`grouping({ by: [], footers: 'grand', grandTotal: 'bottom' })` already gives a « Total » row on a flat grid
(`aggregation.md` 10) — but at the end of the rows: it scrolls away, and it costs the grouping (≈ 10 kB). The owner asked
for a row **always in view**: the pinned bottom band (`pinned-rows.md`) is that place. So the smallest path is a small
feature that computes the totals (the same rules, in a pure function) and draws them as one more row of the bottom band.

## What the user does
Reads the total of an amount, the mean of a price, the number of rows, under the columns, while scrolling; filters, edits a
cell, and sees the totals follow; exports or prints and finds the totals line at the end.

## Behaviours (numbered, each one a test)

**Which totals**
1. A column says its total: `total: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last'`, or the application's
   function `(values, { column, level: null }) => unknown`. The rules are the group totals' (`aggregation.md` 2–7, 15):
   sum and mean on number columns; min and max on numbers, days, instants, text; count counts the rows (empty values
   included); empty values skipped by the others; compensated sums; a total that does not fit the column's type is not
   shown and is told once (`agg-type`, path `columns.<id>.total`); an unknown name `invalid-setting`; a function that
   throws shows nothing, `agg-threw` — never with a value.
2. Over the rows that pass the filters and the search (every page of a paged grid; in a tree, every row of every level),
   through the edit overlay: a value typed counts at once, before it is saved.
3. A total's text is the column's format (a count, a number in the user's language); a function's result is read by the
   column (unreadable: empty).
4. The label: the first shown column without a total shows the text `totals.label` (« Total »), in its own direction.
   No such column: no label (the row group's name still says what the row is).

**Where**
5. One row at the very bottom of the pinned bottom band (after the application's own bottom rows), always in view, its
   columns aligned with the body, pinned columns and sideways scroll included (`pinned-rows.md` 2, 5). It needs
   `pinnedRows()` among the features (its texts too); without it: one warning `missing-feature` (path `totalsRow`, detail
   `pinned-rows`), no row.
6. It is no data: never selected, edited, filled or pasted into (`aggregation.md` 12); reachable by the keys like any
   pinned row (ArrowDown from the last body row), read-only (`aria-readonly`), its cells `gridcell`s, the label column's
   cell the row header. Its key is its own (`p:b:t`, never a `pinnedKey`).
7. No column with a total: no row.

**Updates**
8. The totals are computed again only when what they read changed: the rows (a filter, a sort does not change them but is
   cheap), the edits, the columns, the language. Scrolling computes nothing.

**Server data** (decided: no guessed totals)
9. With a source the browser holds a page, not the rows: a total of the page would mislead. The row then shows what the
   application gives — `api.set(values)`, by column id, typically the totals its server sent with the answer — and
   nothing until then. No problem is told (giving them later is normal). `api.set(null)` goes back to computing (client
   rows only). On client rows, values given win over the computed ones until `api.set(null)`.

**Everywhere the rows are written** (owner: « check every place that recomputes »)
10. **CSV and Excel**: the totals line is written last, as the screen shows it — the label in its column, each total typed
    as the column's cells (a count a plain number) — for the scopes `displayed` and `all`; **not** for `selected` (totals
    of all the rows under a few chosen ones would mislead).
11. **JSON**: not written — a JSON file holds records; a total is not one (`json-export.md`).
12. **Print**: the last row of the table, as on screen (`print.md`: pinned bottom rows at the end).
13. **Clipboard**: a block inside the bottom band copies the totals row as empty cells (no data); a paste never changes it.
14. **Server wire**: nothing is sent; the totals are the application's (9).
15. `GridState` does not save it (the application's settings make it).

## Texts (`locales/{en,fr,ar}-totals`)
| Key | en | fr | ar |
|---|---|---|---|
| `totals.label` | Total | Total | المجموع |

## Right to left
The band is the pinned rows' (logical sides); the label is free text in its own direction, numbers left to right inside
(S2), as every cell.

## Where DzGrid differs on purpose
- One rule for every total (the group totals' function and order), never a total of the page on a server.

## Tests
`packages/core/test/totals.test.ts` (rules 1–3 by hand), `packages/dom/test/totals-row.test.ts` (4–15), browser
`scripts/browser-totals.mjs` (Chrome, fr and ar: the row at the bottom, aligned, in view while scrolling).
