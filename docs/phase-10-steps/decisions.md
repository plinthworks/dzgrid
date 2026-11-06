# Phase 10 (pivot): decisions

The owner's answers (2026-11-06, « ★ partout, tailles OK »): `questions.md`. They win over `docs/phase-10-plan.md`. Below:
what the lead took alone while applying them, and the measures. This batch is the core only (sheets, the grouping's
cache, `@dzgrid/core/pivot`, the exit-criterion line, `series()`, state); the DOM comes in the next batch.

## Decisions taken alone (core batch)
- **Names.** Entry `@dzgrid/core/pivot`: `pivotShape(o)`, `checkPivot(raw, columns)`, `pivotState(shape, columns)`;
  types `PivotOptions`, `PivotShape`, `PivotColumns`, `PivotSeries`. Options: the grouping's (`by`, `aggFuncs`,
  `expanded`, `footers`, `grandTotal`) plus `on` (default **true**: making a pivot shape is asking for one; the DOM's
  `pivot()` may start it off), `columns`, `values`, `subtotals`, `maxColumns` (200), `width` (120), `labels: { blank,
  total }` (the empty crossing's header, default `''`; a sub-total's, `{name}`, default `Σ {name}` — the core writes no
  sentence: the DOM passes the translated ones). The shape's own names avoid `RowShape.values(changed)`: `pivotBy` /
  `setPivotBy`, `valueFns()` / `setValueFns`, `setOn`, and `set({ on, columns, values })` for several at once (one
  build: a restored state). `generated()`, `made(id)`, `series(o)`, `passes` (crossing passes, for tests).
- **D2 A, built as a seam of the grouping, not an option.** `core/grouping` gains an internal `grouped(o, seam)`
  (`groupShape(o)` is `grouped(o)`: its public signature unchanged): `flat()` (the deepest groups are last rows: no data
  row, no children, never open, not among the parents `expandAll` opens), `fns(env)` (the totals' functions), `cells(s,
  env)` (the crossings, under the totals), `kids(s, t)` (the siblings' order by a total), `v` (moved when the cells must be
  made again). `group`, `ofRows`, `keeps`, `identity` moved to module level so the pivot reuses them.
- **The crossings are a grouping of the grouped rows by the pivot columns** (`group(env, s.leaves, pivotColumns, desc)`):
  the same identity (`1` vs `'1'`, « (Vide) »), order (collation over distinct values, enums by list, empty last, a
  descending sort on a pivot column reverses it) and keys as groups — so the sheet's 4–5 are the groups' rules by
  construction. They are kept across a live update that moves no row's crossing (`keeps`, as groups, Q-T A).
- **One bucketed pass** (aggregation.md 17): per row, its crossing's slot (and its bands' sub-total slots), then its deepest
  group, every group above it and the grand total, every value: O(rows × levels × values), whatever the number of
  crossings. Sums compensated (Neumaier, as `totalsOf`), means over the numbers present, min / max by the sort keys (a
  text's rank), first / last in the group's order, an application's function called once per non-empty cell with
  `{ column, level }`. An empty cell is no entry (never « 0 »).
- **Cells reach the screen through the totals.** `totalsOf(…, base)` makes each group's record with `Object.create(the
  group's cells)`: `aggs[createdId]` reads a crossing, `aggs[valueId]` the row total — what `dom/grouping`, print, CSV and
  Excel already read by column id (plan fact 3). Consequence, noted for the DOM batch: `Object.keys(aggs)` /
  `JSON.stringify(aggs)` list the row totals only; every reader in the code goes by id.
- **Row totals are the grouping's own totals** (D7 A): in pivot mode the values are named in the totals' functions, so
  they total even when the data columns are folded. The « Total » band is the DOM's composition (next batch).
- **Created ids** (D3): `~p` (a column), `~b` (a band), `~t` (a sub-total band or column) + the group key's segments of
  each pivot column and value + the value column's id, length-prefixed (`~p1:y5:t20251:v`). `made(id)` is a prefix test,
  not « the columns made now »: a sort or a size kept on a column that vanished after a filter still holds a row value, and
  must stay out of the state too. A host id starting with `~p`, `~b` or `~t` would also be left out while the pivot is
  loaded (no host does so; sheet « What DzGrid does »).
- **Created columns' definitions**: `value` a shared function returning null (the base's sort on one is all-empty, the
  order unchanged, so the groups are kept), `filter: false`, `groupable: false`, `width`; `type` `number` for a count,
  else the value column's format fields (`type`, `codec`, `enumOptions`, `numberFormat`, `instantFormat`, `assumeZone`,
  `align`). With one value the value's header row is dropped (sheet 3). `generated()` returns the same object while the
  ids, headers and types do not change (`key`), so the DOM sets columns again only on a real change.
- **The limit** (Q-P5 A) counts sub-totals (they are columns), not row totals; above it the pass stops before any column
  or cell: the crossings are counted, nothing else made; `pivot-too-many` (path `pivot.columns`, the count). Its `key`
  is `>count`, so the DOM's message follows a changing count.
- **Default `footers: 'grand'`** in a pivot (D7: the column totals are the grand total row); the application may say
  otherwise.
- **Values** (Q-P8 A): `values` when given; otherwise, at the first build, the options' `aggFuncs` and the shown columns
  with an `aggFunc`, frozen (a fold must not shrink them). The DOM batch passes them explicitly.
- **Sort by a total** (Q-P9 A, D14): the first sort item on a created column or a value orders the groups by that total
  at every level, empty ones last both ways, ties in the groups' order (a stable sort over the value order); numbers by
  number, anything else by its text. Pivot mode only; Phase 7's grouping keeps sorting groups by value.
- **An edit of a pivot column** moves its row to its new crossing at once (the totals follow an edit, aggregation.md 13);
  an edit of a grouping column still waits for « Réappliquer » (row-grouping.md 9).
- **`series()` lives in the core** (Q-P12 A; the plan had it in `dom/pivot`): pure, testable without a page, and the DOM's
  api hands it through. Categories: the groups at `level` (1 = first, default) in the order shown (a sort by a total
  included), named by their path `›`-joined; series: the created columns of one value (default the first), named by
  their headers' chain; non-numbers and empty cells `null`. Without grouping column: one category `''` from the grand
  total.
- **State** (D17 A, Q-P10 A): `GridState.pivot?: PivotState` (`{ on?, columns?, values? }`), `StatePart` `'pivot'`,
  `StateEnv.pivot?: { get, set, made }`. `captureState` leaves the made ids out of `columns` (the others numbered without
  them) and out of `sort`; created bands are never collapsible, so never in `groups`. Restored after `rowGroups` and the
  dock (the three DOM parts now one loop in `core/state`, which is what keeps it within its +2 %). `pivotState(shape,
  columns)` is the adapter (`checkPivot` then one `set`); a restore **merges** the state's functions with the grid's (an
  application's own function has no name, is never saved, and survives a restore). `checkPivot`: not an object →
  `state-field` at `pivot`, nothing applied; `on` not a boolean → `state-field` `pivot.on`; columns as `checkRowGroups`
  (`state-column` with the id, `state-field` otherwise, at `pivot.columns.<i>`); a value column unknown → `state-column` at
  `pivot.values` with the id; a name that is not one of the seven → `state-field` at `pivot.values.<id>`.
- **Problem code** `pivot-too-many` joins `GroupProblemCode` (a type only, 0 B in the base). A pivot column unknown:
  `unknown-column`; groupable false, twice, or also grouping the rows: `invalid-setting` (path `pivot.columns`, the id).
  Bad options: `invalid-setting` at `pivot.<option>` (a type name or a number, never a value).
- **Server** (Q-P11 A): nothing in the core; the DOM refuses the pivot beside any source (next batch).

## The grouping's cache (plan step 2, the double-build risk)
- **Measured first** (test before the change, `packages/core/test/grouping-seams.test.ts`): a host `columns.set` that
  kept the grouping columns grouped a second time (`diagnostics.builds` 2), under a filter too (its matches come back as a
  new list). Now the grouping keys on **the definitions of the columns it groups by**, and an order is compared by content
  when it is another list (no list = every row in source order): one build. A new definition of a grouping column still
  groups again; another order (a sort) too.
- **The totals too**: `totalsOf(…, last)` keeps the last totals when the groups, rows, language, overlay, pivot cells and
  totalled columns' definitions are the same — so a column change does not total again (and does not read the value
  columns' keys again for their new objects). Measured: setting 48 created columns after a pivot load 22 ms → 0.3 ms.
  The keys of those value columns are then read at the first update instead (the base's key cache knows a column by its
  object, and `setDefs` makes new objects: a Phase 11 candidate is to key that cache by definition — base bytes, not in
  this batch).

## Measures (2026-11-06, `node scripts/bench.mjs`, minified, node; the machine warm)
- **Exit criterion** « A with 2 row columns, 2 pivot columns, 3 values ≤ 150 ms »: dataset A grouped by `e1` (6) then
  `n2` (100), ~600 groups; pivoted by `e0` (4) × `e2` (3 + empty) = 16 crossings; values sum, mean, latest day: **48
  created columns**. Cold (the model made with the pivot, then its created columns set as the DOM will; one grouping build
  and one crossing pass, checked in the case): **98.5 / 103.3 / 123.2 ms** (three runs), while the cold grouping line read
  64.4 / 65.2 / 76.1 against its recorded 59.9 (HEAD and this tree measured side by side on the same machine: 64.9 / 66.8
  vs 65.8 / 64.9 — no regression of the grouping). Line 114 (rule).
- Pivot columns changed (`setPivotBy`, created columns set again; no grouping build): 61.5 / 65.7 / 76.6 → line 72.5.
- One-row update, no grouping or pivot column touched, after a first one: 12.0 / 12.4 / 16.4 → line 14 (the plan's
  ≤ 16 ms holds). The first update after a load also reads three value columns' keys again: ~45 ms (see above).
- Where the cold time goes (instrumented once, not kept): the grouping ~60, the crossings' grouping ~28, the pass ~6,
  the cells' records ~3.5 ms.
- Memory line (plan « B/row »): not measured in this batch (the DOM batch measures the page).

## Sizes (gzip, `node scripts/size.mjs`'s method, 2026-11-06)
- `@dzgrid/core/pivot` (new, over `@dzgrid/core/grouping`): **3 409** → line **3 750** (measure + 10 %, rounded up to 50).
  The plan estimated 1 800–2 800: the shape alone is ~2 780 (in it); `series()` ~280 (planned in `dom/pivot`), the state
  adapter and `checkPivot` ~360.
- `@dzgrid/core/grouping`: 4 462 → **4 776**, under its 4 950 (plan +80–150; the seams, the cache by definitions, the
  kept totals: +314).
- `@dzgrid/core/state`: 1 546 → **1 587**, line 1 570 → **1 601** (+2 %, the owner's rule).
- Core base 29 258 / 29 300 unchanged; DOM, Angular, K.8 untouched (no DOM code in this batch).

## Review of the batch (lead, 2026-11-06)
Code review and test analysis of the new code (`grouping/shape.ts`, `grouping/agg.ts`, `pivot/shape.ts`, `state/state.ts`):
- Found and fixed: (1) the crossings' kept structure read the pivot columns' **old** objects, so a live update after a
  column change would have read their keys again for a dead object (now refreshed to the newest objects before the check);
  (2) a bad `setPivotBy` / `setValueFns` was told only at the next unrelated build (now a build follows); (3)
  `valueFns()` could hand out the shared empty record (now a fresh one); (4) the first `keeps` rewrite compared a
  filtered list's length with the wrong side (two Phase 7 tests caught it at once).
- Mutants run by hand, all killed: count +1, the limit `>` → `>=`, Neumaier off, sub-totals skipped, empty cells written,
  the state's column and sort skips removed, the total sort's direction (8 / 8).
- Left for the DOM batch: the quick search reads the **shown** columns — with the data columns folded in pivot mode it
  would search the created columns only; the DOM must hand the search the data columns (plan D15). The label column id
  `~p:rows` is a made id by the prefix rule: never in the state, as wanted.
