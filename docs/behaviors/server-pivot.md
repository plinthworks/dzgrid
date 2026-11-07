# Pivot over a server's rows (server pivot)

Written before the code (CLEANROOM). Sources: what a user sees when a grid pivots rows that live on a server — the same
cross table as in the browser (`pivot.md`), its groups, created columns and totals filled by the server, each group's
content loaded when it opens (`server-side-groups.md`) — from public documentation only, never any grid's code;
WAI-ARIA 1.2 (`treegrid`, `columnheader` with `aria-colspan`), WCAG 2.2 (1.3.1, 2.1.1, 4.1.3). Plan
`docs/phase-10-steps/server-pivot-plan.md`; owner answers 2026-11-07 (A to Q-SP1…Q-SP8), recorded with the lead's
decisions in `docs/phase-10-steps/decisions.md` « Server pivot — owner A ».

## What the user does
Has a long history kept on a server, grouped by a column or two on the server, and wants one more axis across — each year
and month as a column, a total at each crossing — exactly as with the rows in the browser: the bar « Lignes │ Colonnes │
Valeurs », the switch, the ↑ / ↓ order, the ⋮ « Total » radios, a click on a header to sort; opens a group, scrolls,
exports, in French and in Arabic.

## What they observe (numbered, each one a test)
1. **The same table** as `pivot.md` 2–3, 8, 17–18: a label column at the start, the groups as rows (their last level the
   last rows: no chevron, no `aria-expanded`, never opened), a band per value of the first pivot column, then the next,
   a column per value under the last, the row totals under « Total », the column totals in the grand total row. The
   bar, the switch, « + », ↑ / ↓, the ⋮ « Total » radios: unchanged.
2. **Lazy groups** (`server-side-groups.md`): the first level in blocks; a group opened shows one « Chargement… » row,
   then its children with their cells; the data rows are never asked in pivot mode. « Tout déplier » opens the groups
   held only.
3. **The cells and totals are the server's** (Q-TOT A): never computed in the browser, a wrong cell shown as sent; a
   crossing with nothing in a group is an empty cell, never « 0 ».
4. **The created columns come once per query** (Q-SP3 A): with the first block of the first level; they do not move while
   the user scrolls or opens groups. A pivot change (the pivot columns, the values, a function, the order, the mode, a
   sort) asks again (one new epoch, the open groups kept) and the columns change only when the new list differs.
5. **Order**: as the server sends the crossings (the grid never sorts a server's list). The contract asked of the server:
   as `pivot.md` 5 — by value, « (Vide) » last at each level, `desc` reversing a pivot column's values.
6. **Too many columns** (Q-SP4 A): the grid tells the server its limit; above it the server sends only the number; no
   created column is made, the groups keep their row totals, the strip's note says how many (« 1 240 colonnes : trop
   pour l'écran ; retirez une colonne »). A server that sends a longer list anyway is refused the same way.
7. **A value of the wrong type** (Q-SP5 A) — a number for a day column, a text for a number one — is refused and told by
   its place, never with the value: no phantom column. The same rule for the groups of `server-side-groups.md`.
8. **Sort** (Q-SP6 A): a click on a created column asks the server to order the groups by that crossing's total; on a row
   total, by that total; on the label column, by the grouping columns. Empty ones last both ways (the server's contract).
9. **Find (Ctrl+F)** searches the cells shown of the groups held (labels and totals), said « lignes chargées » as on a
   server list; the **quick search** is the server's (it searches the data rows).
10. **Exports** (Q-SP7 A): « tout » and « sélection » go to the application's export function, which receives the pivot
    request and the crossings known (its file can have the screen's columns); « affiché » writes the groups held, with
    their cells (CSV chain headers, Excel bands); print the groups held, 5 000 rows at most.
11. **Saved state**: as `pivot.md` 14 — the mode, the pivot columns, the order, the functions by name; restored with the
    row grouping in one request. Never a created column, its band, a sort on it or the translated sort.
12. **Refused**: a pivot beside `sourceRows`, `infiniteRows`, or `serverSideRows` without `serverPivot()` stays refused
    (`unsupported-combination`, path `source`, detail `pivot`), the grid as grouping alone shows it.

## What DzGrid does
- **The binding** (Q-SP2 A): `source: serverSideRows(data, { pivot: serverPivot() })`, `serverPivot` from the new entry
  `@dzgrid/core/server-pivot`; `features: [spans(), grouping({ by, pivot: p })]` with `p = pivot({ columns, values })`
  of `@dzgrid/dom/pivot` as in the browser. A server grid without it pays nothing new but a few hooks.
- **The request**: the group part of `server-side-groups.md` plus `pivot`, at every level and block, also with no row
  column (`by: []`: the table is then the grand total row alone):
  `group: { by, path, aggs, pivot: { columns, desc?, subtotals?, limit, sort? } }` — `columns` the pivot columns in use,
  `desc` the reversed ones (`pivot.md` 33, or a descending sort on one), `subtotals: true` when asked, `limit` the most
  crossings the grid takes (`floor(maxColumns / values)`, band entries counted), `aggs` **the values** (the row totals
  are each group's totals). Example, rows by `region` then `city`, pivoted by `year` then `month`, `amount: sum`,
  `visits: count`, the children of « Nord »: `group: { by: ['region', 'city'], path: ['Nord'], aggs: [{ column: 'amount',
  fn: 'sum' }, { column: 'visits', fn: 'count' }], pivot: { columns: ['year', 'month'], limit: 100 } }`.
- **The answer** at a level of groups: `{ groups: [{ value, count?, aggs?, cells? }], total?, hasNext?, totals?, pivot? }`.
  The first level's first block carries `pivot: { crossings?, count?, totals? }` — `crossings` the pivot paths as typed
  values (a day `YYYY-MM-DD`, an instant epoch ms, null for the empty value) in the server's order, e.g.
  `[[2025, 1], [2025, 2], [2026, 1]]`, with sub-totals the band paths too (`[2025]`); `count` the number of crossings
  (alone when above `limit`); `totals` the grand total row's cells. Each group's **`cells`** is sparse, by crossing
  index: `{ "0": { "amount": 120, "visits": 3 }, "2": { … } }`; an absent index or value is an empty cell.
- **Once per query**: a later first-level block may send the list again; a different one is told (`invalid-page-response`,
  path `response.pivot.crossings`) and the first kept until the next epoch (a refresh is not a new epoch: a server whose
  list moved needs `invalidate({ purge: true })`). A `cells` index outside the list is told by place
  (`response.groups[j].cells`, without the index: a key the server wrote might hold anything) and ignored. A first block without `pivot` while pivot columns were asked: told
  (`response.pivot`), no created column.
- **Ids**: `~p` + per pivot column its id and the **value's own type tag** (`server-side-groups.md`) + the value, then the
  value column — so in a `custom` column `1` and `'1'` are two columns. The created tree (bands, leaves, sub-totals, the
  `key` that moves only when the list does, widths, folds) is made by `@dzgrid/core/pivot`'s own code from the server's
  crossings: one code for the browser and the server.
- **Types** (Q-SP5 A): a group value or a crossing value fits its column when it is null, or the column is `custom`, or
  it is a number for a `number` or `instant` column, a boolean for a `boolean` one, a text for the others and a valid
  `YYYY-MM-DD` for a `day`. Otherwise told `invalid-page-response` at `response.groups[j].value` or
  `response.pivot.crossings[i]`, the group or the crossing (and its cells) left out.
- **Totals** (Q-TOT A): a function of the application's among the values is refused (`agg-type`, detail `server`); a
  value column the grid does not know: `unknown-column`, path `pivot.values`. The grand total row shows the root's
  `totals` (the row totals) with `pivot.totals` (the column totals). Default `footers: 'grand'`.
- **The limit**: above it (`count` alone, or a list longer than the grid takes) `pivot-too-many`, path `pivot.columns`,
  the number of created columns (crossings × values) as detail.
- **Sort translated** (Q-SP6 A): a sort item on a created column becomes `pivot.sort: { crossing, column, dir }` (the
  crossing's typed path, its value column) and leaves `sort`; on `~p:rows` it becomes the grouping columns in that
  direction; on a row total it stays as is, read by the server as « groups by that total ». No `~p…` id is ever sent.
- **The model** (`@dzgrid/core/server-side`): reads the totals asked from the pivot's values, never from the shown
  columns, so the created columns set after an answer ask nothing (no refetch loop); a pivot change reaches it as one
  new epoch (the pivot shape's changes are linked to the model by the plug).
- **Exports**: `ExportRequest.server` is what the model sends — its `group` holds `pivot` with the `crossings` the screen
  shows (none above the limit), its `sort` the translated one (no created id). `ExportRequest.columns` and `query` stay
  the grid's own (the screen's column ids, created ones included): the application's code, not the server's wire.
- **Chart**: `series()` reads the groups held at the level asked and the created columns of one value.

## Health data
A crossing's values (a ward, a name if someone pivots on names) live in memory, in the page (the headers) and on the wire
to the application's own server only — never in a `Problem` (places only: `response.pivot.crossings[3]`), the saved
state, the page address or an event's detail. The translated sort is never saved.

## Tests
`packages/core/test/server-pivot-seams.test.ts` (the hooks: the part at every level, no refetch on created columns, each
gesture one epoch, one request at a restore, last rows never asked, without the plug nothing changes),
`conformance/cases/server-pivot/*` (hand-written expectations), `packages/core/test/server-pivot.test.ts` (seeded walk
against `perf/fake-pivot-server.ts`'s cube, planted values), `packages/dom/test/pivot-server.test.ts`; Chrome on the
local page `playground/pivot-serveur.html` (fr / ar, axe 0, first frame after the root answer).
