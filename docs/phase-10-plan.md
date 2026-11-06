# Phase 10 plan: pivot (architect, 2026-11-06)

Status: **owner answered 2026-11-06 — « ★ partout, tailles OK »** (§5, French; `docs/phase-10-steps/questions.md`). Core batch done (steps 1–3 and step 6's state), DOM batch next (`decisions.md`). Read at `520ae9e` (1.6.0 published; working tree: `playground/index.html`,
`vite.config.ts` modified, unrelated). When the owner answers, `docs/phase-10-steps/questions.md` (French) and
`decisions.md` (the lead's decisions and measures) win over this plan. Clean room: behaviour from public documentation only
(CLEANROOM.md: what a user sees when a grid or a spreadsheet « pivots » — rows grouped, the values of a column turned into
column headers, totals at each crossing — never any grid's code), WAI-ARIA 1.2 (`treegrid`, `columnheader` with
`aria-colspan`, `toolbar`), APG « treegrid » and « toolbar », WCAG 2.2 (2.1.1, 2.5.7, 2.5.8, 1.3.1, 4.1.3). Sheets in
`docs/behaviors/` before code. **Every byte and millisecond figure below is an estimate to measure**, except the lines
marked « measured ».

ARCHITECTURE §6, Phase 10 (l. 1896–1898): deliverables `core/pivot`, generated secondary columns, a pivot mode in the UI,
possibly `rangeAsSeries` for a host's chart (K.13, l. 25, 708). Exit criteria: the `pivot` conformance cases; 150 ms for
100 000 rows with two pivot keys. §2.6 (l. 822): « Pivot | E | — | Colonnes secondaires générées ». §5.2 (l. 1763): `/pivot`
6 kB. K.6 (l. 676): pivot rank 9, « peu probable pour Sehhaty » — this phase serves the product, not a known screen (Q-SC).

## 1. Facts that shape the design (read in the code at `520ae9e`)

1. **Grouping is a row shape with typed groups and per-group scans.** `groupShape({ by, aggFuncs, expanded, footers,
   grandTotal })` (`core/src/grouping/shape.ts:15-26`, `:103`) builds `Groups` once per order (`group`, `:155-245`): one
   `Map` per level keyed by the value's identity (`identity`, `:57-66`: the sort key for number / day / instant / boolean,
   the export text otherwise), children sorted by the column's key or collation rank (`:189-207`), each group's leaves a
   contiguous range `lo..hi` of `leaves` (`:209-229`). **A pivot's crossing (group × pivot value) is a sub-range test over
   these same leaves: the grouping already gives every row-side structure a pivot needs.**
2. **Totals are a scan of each group's rows, per column** (`totalsOf`, `core/src/grouping/agg.ts:38-117`): the columns are
   the **visible** ones with a total plus those named only in `aggFuncs` (`:53-59`); each is `G + 1` scans of its ranges
   (`:112-113`), Neumaier sums (`:100-104`), `count` = the group's rows (`:81`, owner Q-A2 A), min / max through sort keys,
   a custom function told the values (`:71-79`). Cost per column O(N · levels). **Done naively, one generated column per
   (pivot value × value column) multiplies that by P · V** (fact 14).
3. **What the shape hands the screen.** `GroupNode.aggs` / `FooterNode.aggs` are records **by column id** (`shape.ts:428`,
   `:431`). `@dzgrid/dom/grouping` writes `textOf(col, totals[id])` into **every mounted cell** of a group or totals row
   (`dom/src/grouping/index.ts:313-315`), formatted by the column's codec and its function (`fnOf`, `:117-130`). Print, CSV
   and Excel read the same `g.grouped.cell(n, c)` = `aggs[c.id]` (`:171`; `export/run/index.ts:241`, `print/index.ts:102`).
   **So a generated column whose id is a key of `aggs` is painted, printed and exported by the existing code, with 0 B.**
4. **Leaves are always shown under the deepest group** (`flatten`, `shape.ts:397-401`); `childrenAt` of a deepest group is
   its row count (`kidsOfG`, `:389`). A pivot table shows **no data rows**: the deepest groups must become leaves (no
   chevron, no `aria-expanded`). A shape option, not a new hierarchy.
5. **Rebuild triggers.** `groupsOf` regroups when `env.columns` changes identity or `columns.dataVersion` moves
   (`shape.ts:282`). `setDefs` always bumps `dataVersion` (`columns/model.ts:179-184`, `change(…, true)`), and
   `resolveColumns` makes new `ResolvedColumn` objects every time (`columns/defs.ts:320`). **Generating columns after a build
   (they depend on the data) would regroup a second time** — 59.9 ms measured cold (fact 19) paid twice, the 150 ms budget
   at risk. The grouping must key on the columns it **uses** (by def identity), not on any column change.
6. **Columns enter through one door.** `update({ columns })` → `columns.set` (`dom/src/update.ts:96`) → `setDefs` → the rows
   told (`core/src/kernel.ts:581-592`). Header bands, the columns panel, print and Excel all read **`g.settings.columns`**
   (the host's tree: `spans/bands.ts:80`, `columns-panel/index.ts:119`, `print/index.ts:133`, `export/xlsx/index.ts:37`), not
   the column model. **Generated columns must live in `g.settings.columns` too** (an effective tree: the host's plus the
   generated), or every one of those four places would miss their groups. A feature replacing `g.settings` exists already
   (density, `column-menu/index.ts:183`). A host `update({ columns })` arrives as a `columnsChanged` with source `host`:
   the feature can re-derive its tree from it with no base seam (two `setDefs`, rare).
7. **Column groups are the header model.** `ColumnGroupDef { id, header, children, collapsible?, open? }`
   (`columns/defs.ts:190-199`); its bands are drawn by **`spans()`** (`dom/src/spans/bands.ts`, `headerBands` lazy in
   `core/spans/bands.ts`), collapsed by `groups()` (`dom/src/groups`). **Grouping tells `spans` as refused** and paints
   without merged cells (`dom/src/grouping/index.ts:93-95`, `:277-279`; `row-grouping.md` 13, 21): a pivot with header
   bands needs `spans()` loaded, so today it would be told a refusal it does not deserve.
8. **Hiding columns.** The model shows a column when it is not `folded` and `user.hidden ?? def.hidden` is false
   (`model.ts:87`): the user's choice wins over the definition. **One** `folded` set, replaced whole by `groups()`
   (`model.ts:185-193`; Phase 7 fact 14). A pivot that hid the data columns through `hidden` would mix with the user's
   choices (and the saved state); through a def copy with `hidden: true`, a user's earlier « show » would beat it; through
   `fold`, it would fight collapsible header groups.
9. **Group keys** are `g:` + length-prefixed segments of column id and type-tagged value (`shape.ts:235-243`) — they hold
   row values, live in memory only (Phase 7 D3, `row-grouping.md` « Health data »). **A generated column's id must hold its
   pivot values too** (to stay stable when another value appears, so widths, pins and the sort follow it): the same rule
   must reach the column ids.
10. **The saved state lists every column and the sort.** `captureState` writes `fullOrder(m)` (every column of the model,
    hidden ones too) and `q.sort` (`core/src/state/state.ts:123-145`); `GridState.groups` keys header-group ids
    (`:39`). **As built, a generated column id (and so a ward, a name) would reach the state, the address and
    `(stateChanged)`.** `StateEnv` adapters (`:82-91`) and `StatePart` (`:54`) are the way to add a part.
11. **The band.** `groupZone({ use: { grouping } })` drives any `{ by(), setBy(by, { user }) }` (`GroupingApiLike`,
    `dom/src/group-zone/index.ts:12-15`): chips, keys, drop from `columns()`, reorder. Its texts are fixed keys
    (`ZONE_KEYS`, `:8`: `zone.label`, `zone.empty`, …). **A second instance over a pivot api is a « Colonnes » band**, given
    its own texts.
12. **The column menu** builds « Regrouper par » from `use.grouping` (`column-menu/index.ts:40`, `:163`). In pivot mode the
    data columns are hidden, so their menu cannot be opened: adding a pivot column then needs a path that does not go
    through a header (the band's own list, or the columns panel).
13. **Exports.** CSV writes one header line from `def.header` (`core/csv/writers.ts:33-34`): no header-group lines; Excel
    writes the group header rows from `groups: g.settings.columns` (`core/xlsx/sheet.ts:70-71`, `:134`); print writes them as
    `th scope="colgroup"` when bands are on (`print.md` 34). **A pivot CSV whose headers say « Montant » twelve times is
    useless**: CSV needs each generated column's full name (its chain of pivot values).
14. **Sizes of a pivot.** P distinct crossings × V values = generated leaf columns; G groups × P × V cells. 1 000 groups ×
    200 crossings × 3 values = 600 000 totals (≈ 10 MB with Neumaier pairs). A limit on generated columns is a safety
    rule, not a nicety (ARCH K.8 memory line: ≤ 25 MB over the model for A).
15. **Selection, blocks, clipboard** take `d:` / `p:` keys only (`isCellKey`, `core/src/ids.ts`; Phase 7 fact 4): group rows
    are never in a block, so **a pivot table cannot be copied by Ctrl+C** — only exported. `rangeStats` (status bar) likewise.
16. **Server.** `serverSideRows` asks a level of groups with `group: { by, path, aggs }` and reads `GroupResponse
    { groups[{ value, count, aggs }], total, hasNext, totals }` (`core/src/server/source.ts:100-113`). Pivot on a server
    needs the pivot columns and the crossings' list in the wire (a new `pivot` part, and the server's distinct values):
    a protocol change, Phase 8's model untouched.
17. **Angular.** `DzgController.grouping()` (`angular/src/controller.ts:115-117`) and the generic `use(feature)` (`:122-124`)
    give any feature's api with no wrapper bytes; `[(groupBy)]` is a `model()` (`grid.ts:175`). Angular is at 7 884 / 7 900
    and ARCH §5.2 caps it at 8 000: **a pivot input pair would eat most of what is left**.
18. **Combinations already settled by grouping** (`groupConflicts`, `shape.ts:500-504`): tree, master/detail, merged
    cells, browser pages, a server source other than `serverSideRows` — refused, told. A tree wins the rows
    (`GridFeature.shapeAfter`, `dom/src/features.ts:27`, `:38`).
19. **Measured times** (`perf/budgets.json`, node, minified): A grouped by 2 columns + 3 totals, cold, 59.9 ms (line 66);
    regroup with warm keys 8.2 (9.5); one-row update, no grouping column touched, 3.2 (5); ~100 000 distinct texts 256.8
    (282.5); grouped view memory 64.1 B/row (71). Phase 7 close (ARCH « Ajustements après la Phase 7 »): Chrome 40.2 ms.
    **The pivot's 150 ms leaves ≈ 90 ms over today's cold grouping for the crossings, the generated columns, the column
    layout and the paint.**
20. **Sizes** (measured now, `npm run build` then `node scripts/size.mjs`, gzip): core base 29 258 / 29 300 (42 B), DOM
    base 23 650 / 23 660 (10 B), **K.8 89 977 / 90 000 (23 B)**, Angular 7 884 / 7 900, `core/grouping` 4 462 / 4 950,
    `dom/grouping` 4 782 / 5 100, `group-zone` 2 576 / 2 834, `column-menu` 3 164 / 4 300, `columns-panel` 4 475 / 4 488,
    `core/state` 1 546 / 1 570, `dom/state` 1 273 / 1 289, `core/csv` 2 072 / 2 080, `core/xlsx` 7 113 / 7 150,
    `dom/print` 1 641 / 1 664, `dom/spans` 4 910 / 5 050, `dom/groups` 1 887 / 2 100, `export run (lazy)` 5 396 / 5 450,
    `core/range` 3 260 / 3 264, locales `-group` 318 / 367 / 507. **Owner's rule (Q-B 2026-11-04): a new entry = measure
    + 10 %; an existing line +2 % at most; K.8 must not grow → not one byte in the core or DOM base.**
21. **Sehhaty.** K.6 ranks pivot 9th, « peu probable »; no screen in `docs/sehhaty-track.md` or the owner's tree screen
    needs it. Nothing in the repo says which crossing a real user wants (by month? by ward?): Q-SC.

## 2. Decisions to take (D1…D20; the owner's answers win)

- **D1 entries.** All optional; a grid without pivot pays nothing, a grouped grid without pivot a few bytes at most.
  `@dzgrid/core/pivot` (pure: `pivotShape(options)` over the grouping, the crossings, the generated column tree, the limit,
  `checkPivot` for the state; no DOM, no `Date`), measured **over `@dzgrid/core/grouping`**; `@dzgrid/dom/pivot` (the
  feature: hands the shape through grouping, keeps the effective column tree, hides the data columns, the « Colonnes »
  band's api, the menu items' api, the state adapter, sentences), measured over `@dzgrid/dom/grouping`. Texts
  `locales/{en,fr,ar}-pivot`; no new stylesheet (the band reuses `grouping.css`; generated headers are ordinary headers) —
  a `pivot.css` only if step 6 shows a need. **0 B in either base** (fact 20): every seam goes into an optional entry.
- **D2 how a pivot is built.** (A ★) **A pivot is a grouping with crossings**: `pivotShape` composes `groupShape` through two
  internal seams in `core/grouping` — `leaves: false` (deepest groups are leaves, fact 4) and an `extra(groups, env)` hook
  whose per-group records merge into `aggs`. One bucketed pass computes every crossing: for each leaf, its crossing number
  `p` (one `Map` per pivot level, as `group` does for rows), then for each value column, for the leaf's group at every
  level, accumulate into cell `(g, p, v)` — O(N · levels · V), independent of P; `count` per cell, `avg` as (sum, n), min /
  max through sort keys, custom functions told each cell's values (collected only for them). (B) **Generated columns as
  ordinary computed columns** (`value: row => match(row) ? row.amount : null`, `aggFunc` copied) and the existing
  `totalsOf`: no new engine, but O(N · levels · P · V) and one key cache per generated column (100 000 × 36 columns ≈ 29 MB),
  and `count` wrong (it counts the group's rows, not the crossing's). (C) A pivot model of its own beside the grouping: a
  second hierarchy, more bytes, nothing gained.
- **D3 generated column ids and keys.** Each generated leaf: `~p` + `groupKey`-style length-prefixed segments (pivot column
  id, type tag, canonical value, as D3 of Phase 7) + the value column id; its column group: the same without the value.
  Stable while the data change (a new month adds columns, widths of the others kept by id, fact 8). **They hold row values,
  so the Phase 7 rule reaches them** (fact 9–10): never in a `Problem` (a generated column never makes one: its value column
  is checked instead), never in the saved state (D17), never in the address. In the page (`data-col`, header text) they are
  what the user sees anyway.
- **D4 the column tree** (pivot columns `cols = [year, month]`, values `[amount: sum, visits: count]`). (A ★) One header
  band per pivot column, then the value headers: « 2025 » over « Janv. » over « Montant · Nombre ». **With one value
  column, its header band is dropped** (the leaf header is « Janv. »; the value's name goes to the band label column's
  header: « Somme de Montant »). The row labels: one generated **label column** (`~p:rows`, header the grouping columns'
  names joined « Service / Médecin », pinned at the start, the chevrons and indent of `dom/grouping`) — since columns are
  generated anyway, Phase 7's « no column added » (G1 A) does not hold here. (B) No header bands: each leaf header the full
  chain « 2025 › Janv. › Montant » (no `spans()` needed; wide headers). Generated columns: width 120 (`pivot({ width })`),
  `type` and codec of their value column (`count` → number), `filter: false`, `groupable: false`, `chooser` as D13, `editable`
  never.
- **D5 order of generated columns.** (A ★) **The groups' rule** (`row-grouping.md` 4, Q-G2 A): by value in the pivot
  column's own order — numbers, days, instants by value, text by collation over distinct values only (fact 19's text line),
  enums by their list, booleans false then true, « (Vide) » last — at each level; a sort descending on a pivot column
  reverses its crossings, as it reverses groups. Values in the order given. Months as `day` or enum come out in calendar
  order with no comparator. (B) First appearance in the sorted rows. (C) A, plus `pivot({ compare: { month: fn } })` for an
  application's order (Phase 11 if asked).
- **D6 which values make columns.** (A ★) **The crossings present in the rows the filters keep** (what the screen totals,
  `row-grouping.md` 6): filtering « 2025 » leaves only 2025's columns. The column set is compared by keys after each build:
  unchanged, nothing is told (no `setDefs`, no layout); changed, one `columns.set` per change. (B) All rows, filters
  ignored: stable columns, many empty ones after a filter.
- **D7 totals.** (A ★) **Row totals** (« Total » band at the end, one column per value): they **are** the group's own
  totals, already computed by `totalsOf` for the value columns (fact 2; `aggFuncs` names them so hidden columns still total,
  `agg.ts:54-59`): the effective tree shows the value columns themselves under « Total » — 0 extra work, `avg` exact (a
  scan, never an average of averages). **Column totals** = the grouping's grand total row (`footers: 'grand'`, a crossing
  per column, from the same pass with `g = -1`). **Sub-totals per pivot group** (« Total 2025 » after 2025's months)
  off by default, `pivot({ subtotals: true })` (one more bucket per pivot level, P grows by the number of pivot groups).
  (B) Row totals off by default. (C) Row totals at the start.
- **D8 the limit.** (A ★) `maxColumns` default **200 generated leaf columns** (crossings × values, totals excluded): beyond,
  **no generated columns** — the rows stay grouped with their row totals, the band says « 1 240 colonnes : trop pour
  l'écran ; retirez une colonne », a `pivot-too-many` warning (path `pivot.columns`, detail the **count**, never a value).
  (B) The first 200 shown, the rest cut, told (a table that looks whole and is not). (C) No limit.
- **D9 turning pivot on.** (A ★) **Pivot mode is the application's switch** — `pivot({ on: true, columns, values })` or
  `api.setOn(true)`; the user changes **which** columns pivot (the band, the menu) but not the mode, unless the application
  gives the band's « Tableau croisé » switch (`pivot({ toggle: true })`). In pivot mode: data rows never shown (D2 seam),
  data columns hidden (D12), generated columns shown. Off: the grid as grouped before. (B) A switch always in the band. (C)
  On whenever at least one pivot column is set (no mode).
- **D10 the « Colonnes » band.** (A ★) **A second `groupZone`** over the pivot api (fact 11), labelled « Colonnes » (texts
  given by option: `groupZone({ use: { grouping: pivot }, texts: 'pivot' })`), placed after « Regrouper par » in the same
  strip, same keys, chips, reorder, ×. Because headers of data columns are hidden in pivot mode (fact 12), **each band gains
  a « + » button** listing the columns it accepts (a menu, the 2.5.7 no-drag path; also in the « Regrouper par » band).
  Drag a header onto it when headers are shown (not in pivot mode). (B) The columns panel (dock) gains « Lignes /
  Colonnes / Valeurs » sections (the classic tool panel): richer, `columns-panel` has 13 B before its line (+2 % = 90 B: not
  enough), so a new entry. (C) API only in this phase.
- **D11 values.** (A ★) **Values = the totalled columns** (`aggFuncs`, `aggFunc`) — no new concept; `api.setValues({ amount:
  'sum' })`; on a generated column's menu, « Total : Somme / Moyenne / Min / Max / Nombre » changes that value's function for
  all its columns (the 2.5.7 path). (B) A third band « Valeurs » with chips « Somme de Montant × ». (C) A only by API.
- **D12 hiding the data columns.** (A ★) **The fold, composed**: `dom/pivot` gives the fold its own set and `dom/groups`
  unions it with the collapsed groups' when both are loaded (`g.foldExtra`, ≈ 20–40 B in `dom/groups`, within its line);
  never `hidden`, so the user's choices and the saved state never see pivot mode. (B) Def copies with `hidden: true,
  chooser: false` in the effective tree (0 B elsewhere; a user's earlier « show » beats it, fact 8). (C) `hidden` patches
  (pollute the state; refused).
- **D13 generated columns and the user's column tools.** Sort ★ yes (D14); resize, pin, move ★ yes, kept by id while the
  column exists (lost when it vanishes; never saved, D17); hide through the menu ★ yes; listed in the chooser under their
  bands ★ yes (it reads the effective tree); filter ★ no (D15). Column menu on a generated column: sort, pin, size, hide,
  « Total : … » (D11); no « Regrouper par » (`groupable: false`), no filter.
- **D14 sort.** (A ★) **A click on a generated (or row-total) column orders the groups by that total**, at every level,
  « (Vide) » last, ties by group value; a click on the label column orders by group value (Phase 7 G2). The sort of leaves
  does not matter (none shown); the generated `value` returns null so the base sort is cheap. Pivot rows only — Phase 7's
  grouping keeps G2 A. (B) Generated columns not sortable in this phase.
- **D15 filters and search.** Filters and the quick search test the data rows before grouping, as Phase 7 (`row-grouping.md`
  6); the filters panel (dock) still lists the data columns (hidden is not filterless). **No filter on a total** (advanced
  filter still to come; a later « top 10 by total » would sit there). Generated columns `filter: false`; their texts are
  not searched.
- **D16 accessibility and keys.** `treegrid` while grouped (as now); deepest groups without `aria-expanded`; the header
  bands are `columnheader`s with `aria-colspan` (`spans()`); a cell's accessible name is its header chain (the bands
  already give it). Sentences: « Mis en colonnes : Mois », « Mois retiré des colonnes », « 24 colonnes », the limit's
  sentence (`pivot.*`). Keys: the grid's own; the bands' keys from `group-drop-zone.md`. A11y listening §29 (owner,
  non-blocking).
- **D17 state.** (A ★) A new optional part **`pivot: { on: boolean, columns: string[], values?: Record<string, AggFuncName> }`**
  (column ids and function names only), through `StateEnv.pivot` like `rowGroups`, restored after `rowGroups`, checked by
  `checkPivot` (unknown id `state-column`, bad function `state-field`). **`captureState` skips generated columns** in
  `columns`, their bands in `groups`, and a sort on a generated column (fact 10; a test plants a value in a pivot column and
  checks the state, the address and every `Problem`). (B) Nothing of the pivot saved.
- **D18 export and print.** (A ★) What the screen shows: CSV writes the label column, the generated columns with their
  **full chain as header** (« 2025 › Janv. › Montant »: the export run passes the header, a `CsvInput.header?(col)` hook,
  +30–50 B in `core/csv`), the row totals, the grand total; Excel writes the header bands (merged, already, fact 13) and
  typed totals; print prints the bands as `colgroup` rows (`spans()` on). `all` = every group open. (B) CSV headers short.
- **D19 server.** (A ★) **Out of Phase 10**: `pivot()` beside any source gives `unsupported-combination` (path `source`),
  the grid stays as grouping alone would show it. A server pivot (a `pivot` part in `DataRequest.group`, the server's
  crossings list and totals per crossing, fact 16) goes to Phase 11 or to a real need. (B) Beside `serverSideRows` in this
  phase (≈ one more step, the wire, the fake server, a sheet).
- **D20 Angular and charts.** Angular: (A ★) **0 B** — `features: [grouping({ …, pivot })]`, `ctrl.use(pivot)` for the api,
  `pivot` rides in `[state]` / `(stateChanged)`; no `[(pivotColumns)]` input (fact 17: 116 B before the ARCH ceiling). (B) A
  `[(pivot)]` model like `[(groupBy)]` (+60–100 B, the ceiling). Charts (K.13): (A ★) **`api.series()` on the pivot**
  (`{ categories: string[], series: { name, values: (number | null)[] }[] }` from the rows shown and the generated columns:
  what a host chart wants; ≈ 150–250 B in `dom/pivot`); `rangeAsSeries` stays later (a block never covers group rows, fact
  15, and `core/range` has 4 B left). (B) `rangeAsSeries(range)` now (a new entry, data rows only). (C) No chart helper.

Combinations: refused beside pivot, told, never a throw: a tree (the tree wins, as for grouping), master/detail, browser
pages, any source (D19); merged **cells** told and off; **header bands (`spans()`) allowed** — `groupConflicts` tells
`spans` only when a column has `merge` / `rowSpan` / `colSpan` (≈ 20–40 B in `dom/grouping`). Allowed: pinned rows,
`groups()` (collapsible pivot bands, `groupShow`), column menu, chooser, dock panels, state, print, CSV, Excel, motion.

## 3. Steps (each: sheet first, tests that fail first, then code; touched tests while working, `gate:step` once per batch; Chrome only where the screen changes; review + test analysis after steps 3 and 5)

1. **Sheets and questions** (no code): `docs/behaviors/pivot.md` (what the user sees: mode, bands, generated headers, order,
   totals, limit, sort, filters, keys, `aria-*`, refusals, health data), amendments to `aggregation.md` (crossings, the pass),
   `group-drop-zone.md` (the « Colonnes » band, « + »), `column-menu.md` (« Total : … »), `grid-state.md` (`pivot`, what is
   skipped), `csv-export.md` / `xlsx-export.md` / `print.md` (generated headers), `header-groups.md` (pivot bands);
   `docs/a11y-protocol.md` §29; `docs/phase-10-steps/questions.md` in French; this plan aligned.
2. **Grouping seams** (D2, fact 5, D20 `spans`): `leaves: false`; the `extra` hook into `aggs`; the cache keyed on the defs
   the grouping uses (a host column change no longer regroups — also a gain for Phase 7). Tests first:
   `packages/core/test/grouping-seams.test.ts` (deepest groups have no children and no `aria-expanded` state; `diagnostics.builds`
   stays 1 after an unrelated `columns.set`); Phase 7's group-agg cases unchanged. `core/grouping` +80–150 (under its line).
3. **`@dzgrid/core/pivot`** (D2, D3, D5, D6, D7, D8, D14): `pivotShape({ by, columns, values, subtotals?, maxColumns? })`,
   crossings typed like groups, the bucketed pass, generated tree (`columnsOf()` → `ColumnOrGroup[]`, keys compared),
   order by total for a sorted generated column, the limit, `checkPivot`. Conformance `conformance/cases/pivot/*` written
   by hand (two pivot levels; one value vs two; empties « (Vide) »; `1` vs `'1'`; day / instant crossings; `count` of a
   crossing; `avg` exact vs average of averages; sub-totals; the limit; a filter removing a crossing; sort by a total desc
   with « (Vide) » last; a planted value never in a problem), 500 seeded cases against a hand-written oracle (nested maps).
   Perf lines: « pivot A: 2 row columns, 2 pivot columns, 3 values (cold) » — **exit criterion ≤ 150 ms, node, minified**;
   « pivot regroup (setColumns) »; « pivot one-row update »; memory B/row. Size ~1 800–2 800 over `core/grouping`.
4. **`@dzgrid/dom/pivot`** (D4, D9, D12, D13, D16): `pivot({ on, columns, values, width, subtotals, maxColumns, toggle })`
   given to `grouping({ pivot })` (`dom/grouping` asks it for the shape and the label column: +40–80 B); the effective tree in
   `g.settings.columns` and `columns.set` when the keys change, re-derived on a host `columnsChanged`; the fold (with the
   `dom/groups` union); api `on / setOn / columns / setColumns / values / setValues / totals / series`; refusals;
   `locales/{en,fr,ar}-pivot`. Tests: jsdom (no data rows, bands, label column, ids stable when a month is added, the user's
   width kept, a host `update({ columns })` keeps the pivot, the fold beside `groups()`, refusals). **Browser, Chrome only**
   (fr / ar dark): bands aligned with pinned label column, 2 levels + values, RTL order; **exit line: pivot A on to first
   frame ≤ 150 ms in Chrome**. Size ~2 000–3 000.
5. **The bands and the menu** (D10, D11): `groupZone` `texts` option and the « + » list (both bands); `columnMenu({ use:
   { pivot } })`: « Mettre en colonnes » (when headers are shown), « Total : … » on generated columns. Tests: jsdom (sheet
   keys, + list by keyboard, 2.5.7), Chrome fr / ar (24 px targets, chips mirrored). `group-zone` +150–250 (under its line),
   `column-menu` +100–180 (under its line).
6. **State, exports, print, series** (D17, D18, D20): `pivot` part in `core/state` and `dom/state`; generated columns, bands
   and sorts skipped at capture; CSV header hook; Excel and print checked (no code expected); `series()`. Conformance
   `grid-state/pivot-*`, `csv/pivot-*`; one Chrome `page.pdf()` fr / ar.
7. **Demos and close**: playground `pivot.html` (dataset A by ward × month, local, not committed if the owner wants it out —
   memory « Demos not committed »); rebudget (new entries measure + 10 %); full gate; `test:real-app` (unchanged page);
   ROADMAP « Phase 10 — close », ARCHITECTURE « Ajustements après la Phase 10 », CHANGELOG (1.7.0 prepared, minor, additive),
   STATUS.

Order: 2 → 3 → 4 → 5; 6 after 4; 7 last. Nothing visible before step 4. Browsers only at steps 4–6, Chrome only, Firefox /
WebKit only if a step changes keys or RTL maths (the bands reuse `group-zone`'s, already checked in three browsers).

## 4. Sizes (owner's rule: new entry = measure + 10 %; existing line +2 % at most; K.8 never grows)

| Line | Now (measured) | Ask (estimate) | Why |
|---|---|---|---|
| `@dzgrid/core` base | 29 258 / 29 300 | held, **0 B** | every seam in optional entries |
| `@dzgrid/dom` base | 23 650 / 23 660 | held, **0 B** | idem (the effective tree through `columns.set`, fact 6) |
| **K.8 audit profile** | 89 977 / 90 000 | **unchanged** | no base byte; the audit screen loads no grouping |
| `@dzgrid/angular` | 7 884 / 7 900 | held (D20 A) | `use(pivot)`; B would need ≈ 7 990 (ARCH cap 8 000) |
| `@dzgrid/core/pivot` (new) | — | **~1 800–2 800** over `core/grouping` | ARCH §5.2 says 6 000 including the grouping it sits on |
| `@dzgrid/dom/pivot` (new) | — | **~2 000–3 000** over `dom/grouping` | tree, fold, api, series |
| `locales/{en,fr,ar}-pivot` (new) | — | ~250 / 300 / 400 | band, +, limit, sentences, function names |
| `@dzgrid/core/grouping` | 4 462 / 4 950 | held (+80–150, under the line) | `leaves`, `extra`, cache by defs |
| `@dzgrid/dom/grouping` | 4 782 / 5 100 | held (+60–120) | `pivot` hook, `spans` told only for merges |
| `@dzgrid/dom/group-zone` | 2 576 / 2 834 | held (+150–250) | `texts`, « + » list |
| `@dzgrid/dom/column-menu` | 3 164 / 4 300 | held (+100–180) | pivot items |
| `@dzgrid/dom/groups` | 1 887 / 2 100 | held (+20–40) | the fold union |
| `@dzgrid/core/state` | 1 546 / 1 570 | **1 601** (+2 %) | `pivot` part, skips at capture (+40–70: may need the 2 %) |
| `@dzgrid/dom/state` | 1 273 / 1 289 | **1 314** (+2 %) | the adapter (+20–30) |
| `@dzgrid/core/csv` | 2 072 / 2 080 | **2 121** (+2 %) | `header?(col)` (+30–50) |
| `core/xlsx`, `dom/print`, `dom/spans`, export run, `core/range` | as §1 fact 20 | held | no change expected |

Time: pivot A (2 row columns × 2 pivot columns × 3 values) cold ≤ **150 ms** (node, minified; then Chrome to the first
frame); exactly **one** grouping build per pivot load (`diagnostics.builds`); changing pivot columns ≤ 150 ms; one-row
update (no grouping or pivot column touched) ≤ 16 ms; memory of the pivot cells ≤ 200 × groups × 16 B, the limit holding
it. Estimate: the bucketed pass ≈ 15–35 ms on A over the 59.9 ms grouping, the column layout of ≤ 200 columns ≈ 5 ms.

## 5. Owner questions (French; recommended ★)

**Pourquoi et combien**
- **Q-SC — Le pivot sert-il un écran réel ?** (l'architecture le dit « peu probable pour Sehhaty »). A. Oui, dites lequel : on vise ses croisements. ★ B. Non : on fait une version 1 propre et petite (sans serveur), vous essayez ensuite. C. On le repousse après la Phase 11.

**Ce que l'utilisateur voit**
- **Q-P1 — En-têtes des colonnes créées.** ★ A. Sur plusieurs lignes : « 2025 » au-dessus de « Janv. » au-dessus de « Montant » (il faut charger `spans()`). B. Une seule ligne : « 2025 › Janv. › Montant » (plus large, rien à charger).
- **Q-P2 — Ordre des colonnes créées.** ★ A. Comme les groupes : par valeur (mois dans l'ordre du calendrier, textes par ordre alphabétique de la langue, « (Vide) » en dernier). B. Dans l'ordre où les valeurs apparaissent.
- **Q-P3 — Après un filtre, quelles colonnes ?** ★ A. Seulement celles qui ont encore des lignes (filtrer 2025 ne garde que les colonnes de 2025). B. Toutes, même vides.
- **Q-P4 — Totaux.** ★ A. Une colonne « Total » par valeur à la fin de chaque ligne + une ligne de total général ; sous-totaux par année seulement si l'appli les demande. B. Pas de colonne « Total » par défaut. C. Tout, sous-totaux compris, par défaut.
- **Q-P5 — Trop de valeurs différentes** (ex. 1 200 colonnes). ★ A. Au-delà de 200, aucune colonne créée, un message dit pourquoi. B. Les 200 premières, le reste coupé (avec un avertissement). C. Pas de limite.

**Comment on s'en sert**
- **Q-P6 — Qui allume le mode pivot ?** ★ A. L'application ; l'utilisateur choisit seulement les colonnes (un interrupteur « Tableau croisé » si l'appli le veut). B. Un interrupteur toujours visible pour l'utilisateur. C. Pas de mode : dès qu'une colonne est « en colonnes », c'est un pivot.
- **Q-P7 — Où l'utilisateur choisit les colonnes du pivot.** ★ A. Une bande « Colonnes » à côté de « Regrouper par », avec un bouton « + » qui liste les colonnes (marche au clavier, sans glisser). B. Dans le panneau des colonnes (dock), sections « Lignes / Colonnes / Valeurs » (plus d'octets). C. Par l'API seulement pour l'instant.
- **Q-P8 — Les valeurs (ce qu'on totalise).** ★ A. Les colonnes qui ont déjà un total ; le menu ⋮ d'une colonne créée change sa fonction (Somme, Moyenne…). B. Une troisième bande « Valeurs ». C. Par l'API seulement.
- **Q-P9 — Cliquer sur l'en-tête d'une colonne créée.** ★ A. Trie les lignes par ce total (le plus grand en haut au 2ᵉ clic). B. Pas de tri sur ces colonnes pour l'instant.

**Données, état, serveur**
- **Q-P10 — Ce qu'on enregistre.** ★ A. Le mode, les colonnes du pivot et les fonctions (des noms de colonnes) ; jamais les colonnes créées (leurs noms contiennent des valeurs des lignes). B. Rien du pivot.
- **Q-P11 — Pivot avec un serveur.** ★ A. Pas dans cette phase : refusé avec un avertissement, la grille reste regroupée. B. Dans cette phase, avec `serverSideRows` (une étape de plus, et le serveur doit savoir le faire).
- **Q-P12 — Graphiques et Angular.** ★ A. Une fonction `series()` qui donne le tableau croisé prêt pour une bibliothèque de graphiques ; en Angular, rien de nouveau (`ctrl.use(pivot)`). B. `rangeAsSeries` sur un bloc de cellules + une entrée `[(pivot)]` en Angular (≈ 100 o, au ras du plafond de 8 000). C. Ni l'un ni l'autre.

## 6. Exit criteria

Sheets before code; `pivot` conformance cases green (hand-written expectations, seeded oracle); **A with 2 row columns, 2 pivot
columns, 3 values ≤ 150 ms** (minified, node; Chrome to the first frame), one grouping build per load; ids of generated
columns stable when a crossing appears or vanishes; no data row shown in pivot mode; `count` and `avg` exact per crossing;
the limit holds (no column made beyond it, told by count); `aria-level` / `aria-expanded` right (no `aria-expanded` on
deepest groups), header bands with `aria-colspan`, axe 0 fr / ar; bands keyboard-complete (2.1.1) and the « + » list as the
no-drag path (2.5.7), 24 px targets; **no row value in any `Problem`, the saved state, the address** (planted-value tests
over generated ids, bands and sorts); refusals told, never a throw; base grids unchanged (core and DOM base 0 B, K.8 89 977,
`readonly-client` profile unchanged); budgets by written decision; `gate:step` green; `test:real-app` green (page unchanged);
docs; listening §29 scheduled (owner, non-blocking).

## 7. Risks

The double build (fact 5): if the grouping's cache is not narrowed first (step 2), every pivot load pays the cold grouping
twice and misses 150 ms; generated ids leaking row values through `captureState` (columns, groups, sort), `columnsChanged`
listeners or Angular `(stateChanged)` (fact 10) — the planted-value tests are the guard; `g.settings.columns` replaced by a
feature while the host also writes it (fact 6: two `setDefs`, a re-entrancy to test); the fold shared with `groups()`
(fact 8) regressing collapsible headers; many crossings (fact 14) — memory and layout of hundreds of columns, the limit
must be checked before any column is made; `spans()` allowed beside grouping again (D20 combinations) — merged cells must
still be refused; `core/state` (24 B), `dom/state` (16 B), `core/csv` (8 B), `columns-panel` (13 B) close to their lines;
the export run (54 B) if the CSV hook lands there; Angular next to its ARCH ceiling; the « + » list reused in both bands
changing a Phase 7 band checked in three browsers (a Chrome pass, then Firefox / WebKit only for its RTL keys); the value
of the whole phase for Sehhaty (Q-SC).
