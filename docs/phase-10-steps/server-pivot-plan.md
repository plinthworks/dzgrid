# Server pivot plan: a pivot over `serverSideRows` (architect, 2026-11-07)

Status: **owner A to Q-SP1…Q-SP8 (2026-11-07); built** — decisions and measures in `decisions.md` « Server pivot — owner A »
(they win over this plan). Was: plan only, no code, waits for the owner (§5, French). Read at `07417cf` (1.7.0 published; working tree:
`playground/index.html`, `vite.config.ts` modified, unrelated). Phase 10 left it out (Q-P11 A, `docs/phase-10-plan.md`
D19; `docs/phase-10-steps/questions.md`); this plan is the « later ». When the owner answers, his answers win, then a
`decisions.md` section written while building. Clean room: behaviour from public documentation only (CLEANROOM.md: what a
user sees when a grid pivots rows that live on a server — the same cross table, filled by the server — never any grid's
code). Sheets in `docs/behaviors/` before code. **Every byte and millisecond figure below is an estimate**, except the lines
marked « measured » (one `npm run build`, one `npm run check:size`, 2026-11-07, plus the core lines re-read with
`scripts/size.mjs`'s `measureEntries` on nine entries).

## 1. Facts that shape the design (read in the code at `07417cf`)

1. **The wire already carries a grouping.** `DataRequest.group?: GroupPart` (`core/src/server/source.ts:77-95`);
   `GroupPart { by, path, aggs[{ column, fn }] }` (`:104-108`), `path` the typed values of the open groups (`GroupValue =
   string | number | boolean | null`, `:97`: a day `YYYY-MM-DD`, an instant epoch ms); the answer `GroupResponse { groups[{
   value, count?, aggs? }], total?, hasNext?, totals? }` (`:111-116`). A request is one block of one level
   (`server-side.ts:540-570`, `ask`); **the group part is sent only when `by` is not empty** (`:547`, `by.length && …`):
   a pivot with no row column would send none.
2. **A server group's key uses the value's own type** (`tag`, `server-side.ts:142`: `typeof v` first letter + `String(v)`),
   the client's uses the column's type (`grouping/shape.ts:184`: `c.type[0] + toExport(v)`). So `1` and `'1'`, a day and an
   instant of that day, are two groups on both — but the same value has **another key on a server than in the browser**.
   Today a server group's value is not checked against its column's type: its label falls back to `String(v)` when the
   codec throws (`server-side.ts:633-638`).
3. **Totals are the server's, never recomputed** (Q-TOT A): a function of the application's is refused (`agg-type`,
   detail `server`, `server-side.ts:219`); a group's `aggs` are kept as sent (`:641`); the grand totals come from any root
   block's `totals` (`:593-596`), shown in the grand total row (`:424`) and by `totals()` (`:836`).
4. **The model's totals list is read from the shown columns.** `readGrouping` takes `aggs` from `columns.visible()` with
   an `aggFunc`, then the options' `aggFuncs` (`server-side.ts:204-227`); `setColumns` → `rekey` → a new epoch when the
   canonical key moved (`:705-712`, `:892-898`). **In pivot mode the DOM folds the data columns and sets the created ones**
   (`dom/pivot/index.ts:193-216`): a data column with an `aggFunc` that is not a value would leave `aggs`, move the key, and
   ask everything again — and the created columns, set after the answer, would do it at every answer: **a refetch loop**
   unless the pivot hands the model its values explicitly (the client pivot's `fns` seam does exactly that,
   `pivot/shape.ts:140`).
5. **The model takes the grouping's options from the shape, once.** `env.shape` of kind `group` gives `by` and `options`
   (`server-side.ts:175-178`); the shape is never `attach`ed to a server model (no `attach` call in `server-side.ts`), so a
   pivot shape's `set()` / `setPivotBy` / `setValueFns` / `setOn` (`pivot/shape.ts:375-391`, `kick` `:129-133`) **would reach
   nothing** on a server today. `setBy` is the model's own (`server-side.ts:828`), a new epoch; the open groups are kept
   (Q-OPEN A).
6. **The client pivot is a seam of the client grouping.** `pivotShape` = `grouped(o, seam)` (`pivot/shape.ts:353`): `flat`
   (deepest groups are last rows), `fns`, `cells` (crossings + bucketed pass over `Groups`, `:141-325`), `kids` (sort by a
   total, `:326-350`). The **created column tree** (bands, leaves, sub-totals, the `key` that moves only when the list does,
   the limit's `>count` key, `:187-230`) is built inside `cells` from the crossings' `Groups` (`C.key`, `C.label`, `C.kids`).
   Ids: `~p` / `~b` / `~t` + the crossings' key segments + the value's id (`seg`, `:85`); `made(id)` is a prefix test
   (`:393`), so a server's ids are kept out of the state with no new code.
7. **The DOM pivot reads the shape, not the model.** `dom/pivot` derives the effective columns from `shape.generated()`,
   `shape.reads()`, `shape.valueFns()`, `shape.on` (`sig`, `dom/pivot/index.ts:190`; `derive`, `:193-236`), sets them with
   one `columns.set` (`:179-182`), folds the data columns (`foldTo`, `:184-188`), reads `shape.rows(key)` for find
   (`g.rowText`, `:218-222`), gives CSV the chain headers (`g.exportColumns`, `:275`). `pivotBar` drives the `PivotApi`
   only (`dom/pivot-bar/index.ts:87`, `:107-113`): **the bar, the « + », the ↑/↓ and the switch need no change** if the api
   behaves the same.
8. **Today's refusal.** `dom/grouping` tells `unsupported-combination` (path `source`, detail `pivot`) on any source
   (`dom/grouping/index.ts:104`) and sets the pivot up only on browser rows (`:289`, `if (!side)`). Beside
   `serverSideRows` the grouping works (`side`, `:97-99`, `:107`): the zone, menu, `[(groupBy)]`, `rowGroups`.
9. **The screen, print, CSV and Excel read a group's cells by column id** (`aggs[c.id]`, `dom/grouping/index.ts:332`;
   Phase 10 plan fact 3): a server group node whose `aggs` hold the created ids is painted, printed and exported by the
   code that exists. Clipboard and the status bar never take group rows (`isCellKey`), so a cross table is never copied —
   as on the client.
10. **Exports on a server.** `all` / `selected` go to the host's `exportAll` with `ExportRequest.server`
    (`core/csv/rows.ts:20`) whose `group` is the model's `group` getter (`dom/export/run/request.ts:29-31`;
    `server-side.ts:837`): **whatever the model's `group` getter returns reaches the application's export function with
    0 B in the export run**. `displayed` writes the rows held; print the rows held, 5 000 at most (Phase 8 D16).
11. **State.** `GridState.pivot { on, columns, desc?, values }` (`pivotState`, `pivot/shape.ts:476-491`) holds column ids
    and function names only; `rowGroups` on a server is restored in one request through `hold` (server-side-groups.md
    « Built »). Nothing new is needed in `core/state` or `dom/state` if the pivot's `set` reaches the model as one epoch.
12. **Test benches.** `perf/fake-server.ts` computes row *i* from *i* (10⁷ rows cost nothing) but answers no group
    (no `group` in it); the server groups' fakes live in `packages/core/test/server-side.test.ts` and the local page
    `playground/groupes-serveur.ts` (`:47-98`, a server simulated in the page, not in git); conformance
    `conformance/cases/server-side/ss-*.json` (7 cases) and `pivot/*`. Perf lines (`perf/budgets.json:77-86`): pivot A
    cold 114, pivot columns changed 72.5, one-row update 14; server-side flatten 2, a 10⁶-row group's first block 30,
    1 000 windows 94.
13. **Sizes (measured 2026-11-07, gzip).** Core base 29 258 / 29 300; DOM base 23 650 / 23 660; **K.8 89 978 / 90 000**;
    Angular 7 883 / 7 900; `core/server` 6 151 / 6 200 (in K.8); `core/infinite` 8 173 / 8 990; **`core/server-side`
    11 056 / 12 160**; **`core/pivot` 3 672 / 3 750** (over `core/grouping`); `core/grouping` 4 779 / 4 950; `core/state`
    1 607 / 1 610; `core/csv` 2 072 / 2 080; **`dom/pivot` 2 562 / 2 600** (over `dom/grouping`); `dom/grouping` 4 966 /
    5 100; `dom/pivot-bar` 4 867 / 5 350; `dom/state` 1 293 / 1 300; export run 5 406 / 5 450; `-pivot` texts 389 / 428 /
    566 (450 / 500 / 650); `pivot.css` 712 / 712. **Owner's rule**: a new entry = its measure + 10 %; an existing line +2 %
    at most; **K.8 untouched** (no byte in `core/server`, the bases or what the audit screen loads).

## 2. Decisions to take (S1…S16; the owner's answers win)

- **S1 entries.** (A ★) **A plug, `serverPivot()`, in a new entry `@dzgrid/core/server-pivot`**, handed to the model:
  `serverSideRows(data, { pivot: serverPivot() })`. It holds what only a server pivot needs (the wire part, reading the
  crossings and cells, the created columns from a list, the sort's translation, `series` over the groups held); the model
  gains small optional hooks (S3). A server grid without pivot pays the hooks only (~150–300 B in `core/server-side`, under
  its line); a client pivot pays nothing. (B) Inside `core/server-side`: no new import for the application, every
  server-grouped grid pays ~1–1.4 kB. (C) Inside `core/pivot`: a client pivot pays the server code; `core/pivot` has 78 B
  left.
- **S2 the request** (one wire, Q-WIRE A extended): `group: { by, path, aggs, pivot }` with **`pivot: { columns, desc?,
  subtotals?, limit }`** — the pivot column ids in order, the reversed ones (pivot.md 33), sub-totals asked, and `limit`
  the most crossings the grid will take (`floor(maxColumns / values)`, sub-total entries counted). `aggs` are **the
  values** (the row totals are the group's totals, pivot.md 8): the server computes the same functions per crossing. The
  part is sent at **every level and every block**, also with no row column (`by: []`, fact 1: the table is then the grand
  total row alone). Example — rows by `region`, pivoted by `year` then `month`, `amount: sum`, `visits: count`, the
  children of « Nord »: `group: { by: ['region', 'city'], path: ['Nord'], aggs: [{ column: 'amount', fn: 'sum' }, {
  column: 'visits', fn: 'count' }], pivot: { columns: ['year', 'month'], limit: 100 } }`. Ids never go on the wire: no
  `~p…` in `sort`, `aggs` or anywhere (S9).
- **S3 the model's hooks** (`core/server-side`, types + ~150–300 B): `ServerSideOptions.pivot?: ServerPivotPlug`; the
  model asks the plug for (a) its wire part (added to the group part and to the epoch key, so a pivot change is a new
  epoch, the open groups kept, Q-OPEN A), (b) the totals' functions (the values, **not** the shown columns: fact 4's loop
  closed), (c) whether the deepest groups are last rows (no chevron, no `aria-expanded`, never asked, `kidsOf` 0 — the
  client `flat` rule), (d) the answer of a level, before its groups are made (the plug turns `cells` into each group's
  `aggs` by created id, reads the root's `pivot` part). The plug **links the pivot shape to the model** (fact 5): the
  shape's `set` / `setOn` / `setPivotBy` / `setValueFns` / `setDesc` become one new epoch (one request per level shown;
  `hold` for a restored state: one request).
- **S4 the answer.** (A ★) **The column list once per query**: the first level's answer carries `pivot: { crossings,
  count?, totals? }` — `crossings` the pivot paths as typed values in the order the server gives (`[[2025, 1], [2025, 2],
  [2026, 1]]`; with sub-totals, the band paths too, shorter: `[2025]`), `count` the number of crossings (required when
  above `limit`, then `crossings` is absent), `totals` the grand total's cells. Each group at every level carries
  **`cells`**: a sparse record by crossing index (`{ "0": { "amount": 120, "visits": 3 }, "2": { … } }`): an absent
  crossing is an empty cell (never « 0 »). Any later first-level block may send the list again; a different one is told
  (`invalid-page-response`, path `response.pivot.crossings`) and the first kept until the next epoch (a list must not
  move under the user while scrolling). A child level's `cells` use the epoch's list; an index out of it is told by place
  and ignored. (B) Each answer its own list, the grid uniting them: columns appear when a group opens (the table widens
  under the user), their order ambiguous. (C) A request of its own on a `pivot` channel (as `values:<col>`): two requests
  before the first paint.
- **S5 order of the created columns.** As sent, as server groups are (Phase 8 D12: the server orders; the sheet states the
  expected order — pivot.md 5: by value, « (Vide) » last, `desc` reverses — as a contract, not a check). The grid never
  re-sorts a server's list (it cannot compare a server's collation).
- **S6 typed keys.** Crossing values typed as group values (`GroupValue`, fact 1). Ids: `~p` + per pivot column its id
  and **the value's own type tag** (`tag`, fact 2) + the value, then the value column (the client's form, the server's
  tag): `1` and `'1'` two columns, a day and an instant two columns. (A ★) **A value that does not fit its column's type**
  (a number for a `day` column, a string for a `number` one) **is refused**: told `invalid-page-response` at
  `response.pivot.crossings[i]` (the place, never the value), the crossing and its cells left out — no phantom column
  « 1735689600000 ». The same check reaches **server groups** (today they accept, fact 2): one rule, told the same way.
  (B) Accepted as sent (as server groups today), labelled by `String(v)`.
- **S7 cells and totals.** All the server's (Q-TOT A): never recomputed, a planted wrong cell shown as sent; a custom
  function among the values refused (`agg-type`, detail `server`, as fact 3); `avg` of a sub-total is the server's (exact
  or not, as sent). Row totals = the group's `aggs`; column totals = `pivot.totals` in the grand total row (with the root
  `totals` under « Total »); sub-totals per pivot band only with `subtotals: true` (the band paths in `crossings`).
  Default `footers: 'grand'` as the client pivot.
- **S8 the 200-columns limit.** (A ★) The request says `limit` (S2); above it the server answers `count` and no list, no
  cells; the grid makes no created column, keeps the groups with their row totals, says the count (`pivot-too-many`, path
  `pivot.columns`, detail the count; the strip's note and `pivot.tooMany`, unchanged). A server that sends a longer list
  anyway: the grid counts, refuses the same way, reads no cell. (B) The server always sends everything; the grid refuses
  (a large answer for nothing).
- **S9 sort.** (A ★) **The server sorts**, the grid translates: a click on a created column sends `group.pivot.sort: {
  crossing, column, dir }` (the crossing's typed path, the value column, the direction) and **removes the created id from
  `sort`**; a click on a row total (a value column) stays `sort: [{ column: 'amount', dir }]`, read by the server, in pivot
  mode, as « groups by that total at every level » (sheet contract, as pivot.md 10); the label column (`~p:rows`) becomes
  a sort on the grouping columns (the server's group order, reversed by `desc`). Empty ones last both ways: contract. A new
  sort is a new epoch (the list and cells asked again, the open groups kept). (B) Created columns not sortable on a server
  (told once). (C) The grid sorts the groups held (wrong past the first block: refused).
- **S10 lazy groups.** As server groups (server-side-groups.md): the first level's blocks, a group's children asked when it
  opens, each with their `cells`; the deepest groups are last rows (S3 c) — the data rows are never asked in pivot mode.
  `expandAll` opens the groups held only (Phase 8 D13). Pivot off: the server-side grouping as today (no `pivot` part).
  **Both bands empty** (owner 2026-11-07): the server's flat rows, as an ungrouped `serverSideRows`.
- **S11 the DOM.** `dom/grouping` sets the pivot up beside a server-side model **that has the plug** (fact 8), and keeps
  the refusal for `sourceRows`, `infiniteRows`, and `serverSideRows` without the plug (told as now; detail `pivot`).
  `dom/pivot` reads the model's grouping columns there (`side.by`), takes the created columns from the shape as today
  (the plug serves them to the shape, S12), and on a server: **find** searches the cells shown (labels, totals) of the
  groups held — no `rows(key)` (none loaded), said « lignes chargées » as Phase 8; the **quick search** is the server's
  (it searches the data rows: right by construction). **The bar, the switch, the « + » lists, ↑/↓, the menu's « Total »
  radios: unchanged** (fact 7). Texts: none new (the limit's and the count's are there).
- **S12 the shape on a server.** `core/pivot` gains one seam (~60–120 B, +2 % allows 75): `serve(out | null)` — the
  created columns handed from outside (the plug's list), `generated()`, `made()`, `valueColumn()` then answer from it; and
  the tree builder (bands, leaves, sub-totals, the `key`) moved to a module both use, so the screen's headers, widths,
  folds and the `key` rule (pivot.md 13: set again only when the list changes) are one code. A new epoch whose list is the
  same: no `columns.set`, no layout.
- **S13 state.** Nothing new: `GridState.pivot` as today; restored with `rowGroups` in **one request** (`hold`); created
  ids, bands and a sort on a created column never saved (`made`, fact 6) — the translated `group.pivot.sort` is never
  in the state either (the state keeps no sort on a `~p` id).
- **S14 exports and print.** (A ★) `all` / `selected` → the application's export function: `ExportRequest.server.group`
  carries the `pivot` part (through the model's `group` getter, fact 10: 0 B in the export run) **plus the crossings
  known** (so its file has the screen's columns); `displayed` = the groups held with their cells (CSV chain headers, Excel
  bands, as the client); print the groups held, 5 000 rows at most. (B) The grid asks every level itself, block by block
  (slow, many requests). (C) `all` refused without the export function (as today without `exportAll`).
- **S15 Angular.** Nothing new (0 B): `[source]` with `serverSideRows(data, { pivot: serverPivot() })`, `features:
  [grouping({ …, pivot: p })]`, `ctrl.use(p)`, `pivot` in `[state]`.
- **S16 a fake server and a demo.** `perf/fake-pivot-server.ts`: 10⁶ rows computed from *i* (as `fake-server.ts`), the
  cube of a query computed once and kept (nested maps written by hand: it is the **oracle**), answers groups, `cells`,
  `pivot.crossings` / `count` / `totals` by level and block, the sort and `desc`; modes `timers` / `hold` (an answer
  released by the test, to time « after the answer »), a planted wrong cell, a value of the wrong type, a list that
  changes between blocks. Demo `playground/pivot-serveur.html` (local, not committed: memory « Demos not committed »).

Combinations: as the client pivot (a tree, master/detail, browser pages refused); beside `sourceRows` / `infiniteRows`
refused (S11); allowed: `spans()` (bands), `groups()` (folds), the bar, the column menu, the chooser, the dock, state,
print, CSV, Excel, motion. Health data: a crossing's values live in memory, the page and the wire to the application's own
server; never in a `Problem` (places only), the state, the address or an event's detail.

## 3. Steps (sheet first; tests that fail first, then code; touched tests while working; `gate:step` once per batch; Chrome only where the screen changes; review + test analysis after steps 2 and 4)

1. **Sheet and questions** (no code): `docs/behaviors/server-pivot.md` (what the user sees: the same table, filled by the
   server; the request and answer of S2–S4 with examples; order S5; types S6; totals S7; the limit S8; sort S9; lazy
   groups S10; find and search S11; state S13; exports S14; refusals; health data); amendments to `pivot.md` 15 / 26 (the
   refusal narrowed), `server-side-groups.md` (the `pivot` part; the value-type rule if S6 A), `grid-state.md` (nothing new:
   say so), `csv-export.md` (`server.group.pivot`); `docs/phase-10-steps/server-pivot-questions.md` in French.
2. **The model's hooks and the shape's seam** (S3, S12; core). Tests first, `packages/core/test/server-pivot-seams.test.ts`:
   with a plug, the group part carries `pivot` at every level and with `by: []`; the created columns set after the answer
   **ask nothing** (fetches unchanged — fact 4's loop); `setPivotBy` / `setValueFns` / `setDesc` / `setOn` are one new
   epoch each, open groups kept; a restored `pivot` + `rowGroups` is one request; deepest groups have `childrenAt` 0 and
   never ask; without the plug, every `server-side/*` case and test unchanged. Sizes: `core/server-side` +150–300 (under
   its line), `core/pivot` +60–120 (the 2 % rule).
3. **`@dzgrid/core/server-pivot`** (S2, S4–S9, S13). Conformance `conformance/cases/server-pivot/*`, expectations by hand:
   the request per level (two pivot keys, `desc`, `limit`); `1` vs `'1'` and a day vs an instant → two created ids; a
   value of the wrong type refused by place (S6 A); empty crossing (`null`) last and labelled « (Vide) »; cells sparse
   (absent = empty, never 0); a planted wrong cell shown as sent; a custom function refused; sub-totals from band paths;
   above `limit` (`count` only) and a longer list than `limit` both refused with the count; a list changed in a later
   block told and ignored; an index out of the list ignored; the sort translated (created column → `pivot.sort`, no `~p`
   on the wire; label column → grouping columns); a planted value never in a `Problem`, the state or the request key's
   `Problem`s. Seeded test: 500 random queries, the server pivot over `fake-pivot-server.ts` equals the cube (by paths).
   Perf (node, minified, `perf/budgets.json`): « server pivot: root answer of 100 groups × 48 created columns read,
   columns made, flattened » (estimate 1–3 ms; ceiling 5); « a group opened: its 100 children with cells in » (≤ 5);
   « a new sort: 0 old answers applied, the first block asked in the same call » (≤ 1, checked inside the case).
4. **The DOM** (S11, S14). Tests first (jsdom): the pivot set up beside `serverSideRows` with the plug, refused without it
   and beside `sourceRows` / `infiniteRows`; label column, folds, bands, `aria-*` (last rows without `aria-expanded`); the
   bar's gestures each one epoch; find on groups held; the limit's note; `ExportRequest.server.group.pivot` and its
   crossings; `displayed` CSV / Excel of the groups held; state restored in one request. **Chrome only** (fr / ar, light /
   dark, on the fake server in the page, 10⁶ rows behind, 150 ms latency): bands aligned with the pinned label column;
   **first frame after the root answer ≤ 1 frame** (the exit line); a group opened while blocks load; axe 0. Firefox /
   WebKit: not needed (no new keys, no new RTL maths: the client pivot's layout is checked in three browsers).
   Sizes: `dom/pivot` +20–60 (the 2 % rule), `dom/grouping` +20–60 (under its line).
5. **Demo and close**: `playground/pivot-serveur.html` (local); rebudget by the owner's rule; full `gate:step`;
   `test:real-app` (page unchanged); ROADMAP, ARCHITECTURE « Ajustements », CHANGELOG (minor, additive), STATUS.

Order: 1 → 2 → 3 → 4 → 5. Nothing visible before step 4. One browser pass, Chrome, at step 4.

## 4. Sizes (owner's rule: a new entry = measure + 10 %; an existing line +2 % at most; K.8 never grows)

| Line | Now (measured 2026-11-07) | Ask (estimate) | Why |
|---|---|---|---|
| `@dzgrid/core` base | 29 258 / 29 300 | **0 B** | `GroupPart.pivot`, the answer's `pivot` / `cells`: types only |
| `@dzgrid/dom` base | 23 650 / 23 660 | **0 B** | nothing on the base's paint path |
| **K.8 audit profile** | 89 978 / 90 000 | **unchanged** | nothing in `core/server` or what the audit screen loads |
| `@dzgrid/angular` | 7 883 / 7 900 | **0 B** (S15) | `[source]`, `ctrl.use(p)` |
| `@dzgrid/core/server` | 6 151 / 6 200 | held, 0 B | the plug lives elsewhere |
| `@dzgrid/core/server-side` | 11 056 / 12 160 | held (+150–300, under its line) | hooks S3 (+ the value-type check if S6 A: +40–80) |
| `@dzgrid/core/pivot` | 3 672 / 3 750 | **3 825** (+2 %) | `serve` seam, the shared tree builder (+60–120) |
| **`@dzgrid/core/server-pivot`** (new) | — | ~900–1 400 over `core/server-side` + `core/pivot`, line = measure + 10 % | wire part, crossings and cells read, ids, the limit, sort, `series` |
| `@dzgrid/dom/pivot` | 2 562 / 2 600 | **2 652** (+2 %) | server branch (`side.by`, find without rows): +20–60 |
| `@dzgrid/dom/grouping` | 4 966 / 5 100 | held (+20–60) | the pivot beside a model with the plug |
| export run (lazy) | 5 406 / 5 450 | held, 0 B | `group` reaches the request as it is (fact 10) |
| `core/state`, `dom/state`, `core/csv`, `pivot-bar`, `-pivot` texts, `pivot.css` | 1 607, 1 293, 2 072, 4 867, 389 / 428 / 566, 712 | held, 0 B | nothing new |

If `core/pivot` or `dom/pivot` cannot stay within +2 %, the extra goes into `core/server-pivot` (a new line), never past a
shared line without the owner (Phase 10 guidance).

Time (exit criteria first; minified; quiet machine): **a server-pivoted grid, 10⁶ rows behind, two row columns, two pivot
keys, three values: first frame after the root answer ≤ 1 frame** (Chrome, median of 20, p95 ≤ 25 ms; node line ≤ 5 ms
for reading, columns and flatten); a group opened: its children with cells shown ≤ 1 frame after its answer; a change of
the pivot columns, values, `desc`, sort or mode: one new epoch, one request per level shown, 0 old answers applied
(1 000 permutations of `perf/permutation.ts` with pivot gestures); created columns set only when the list changes (a new
sort with the same list: no `columns.set`); memory of cells ≤ groups held × created columns × 16 B (the limit and
`maxBlocks` hold it).

## 5. Owner questions (French; recommended ★)

- **Q-SP1 — Quand ?** ★ A. Maintenant, petite version propre (le serveur de l'appli doit savoir répondre), essayée
  ensuite. B. Seulement quand un écran réel en a besoin. C. Après la Phase 11.
- **Q-SP2 — Comment l'appli l'active.** ★ A. `serverSideRows(data, { pivot: serverPivot() })` : une nouvelle entrée,
  une grille serveur sans pivot ne paie presque rien. B. Intégré à `serverSideRows` (≈ 1 ko de plus pour toute grille
  serveur groupée).
- **Q-SP3 — La liste des colonnes créées.** ★ A. Le serveur l'envoie une fois par requête, avec le premier paquet ; elle
  ne bouge pas pendant qu'on défile. B. À chaque réponse (des colonnes apparaissent quand on ouvre un groupe). C. Une
  demande à part (deux allers-retours avant le premier affichage).
- **Q-SP4 — Trop de colonnes (plus de 200).** ★ A. La grille dit sa limite au serveur ; au-delà il ne renvoie que le
  nombre ; aucune colonne créée, un message dit combien. B. Le serveur renvoie tout, la grille refuse ensuite.
- **Q-SP5 — Une valeur du mauvais type** (un jour envoyé comme un instant). ★ A. Refusée et signalée (sans la valeur),
  pas de colonne fantôme ; la même règle pour les groupes serveur. B. Acceptée telle quelle (une colonne de plus).
- **Q-SP6 — Clic sur l'en-tête d'une colonne créée.** ★ A. Le serveur trie (la grille lui dit quelle croisée, quelle
  valeur, quel sens). B. Pas de tri sur ces colonnes avec un serveur. C. La grille trie les groupes chargés (faux
  au-delà du premier paquet).
- **Q-SP7 — Export « tout ».** ★ A. Par la fonction d'export de l'appli, qui reçoit la demande du pivot et la liste des
  colonnes ; « affiché » et l'impression : les groupes chargés. B. La grille demande tout au serveur, paquet par paquet.
  C. Refusé sans la fonction de l'appli.
- **Q-SP8 — Tailles du §4.** ★ A. La règle d'aujourd'hui : nouvelle entrée mesure + 10 % ; `core/pivot` et `dom/pivot`
  +2 % au plus ; bases, Angular et K.8 inchangés. B. Pareil, et si +2 % ne suffit pas, le reste va dans la nouvelle
  entrée sans vous redemander.

## 6. Exit criteria

Sheet before code; `server-pivot/*` conformance green (hand-written expectations) and the seeded test against the
fake server's cube; `server-side/*` and `pivot/*` unchanged and green; **first frame after the root answer ≤ 1 frame**
with 10⁶ rows behind and two pivot keys (Chrome) and its node line; no refetch loop (created columns set → 0 fetch);
every pivot gesture one epoch, 0 stale answer over 1 000 permutations; cells and totals shown as sent (planted wrong
cell); typed ids (`1` vs `'1'`, day vs instant); the limit holds (no column, told by count) whether the server obeys
`limit` or not; no `~p` id on the wire; no row value in any `Problem`, the state, the address (planted-value tests);
refusals told, never a throw; the bar, the switch and Angular unchanged; bases 0 B, **K.8 89 978**; budgets by written
decision; `gate:step` green; `test:real-app` green (page unchanged).

## 7. Risks

The refetch loop (fact 4): the created columns' `columns.set` after each answer moving the model's totals list — the
step-2 test is the guard; the shape's changes not reaching the model (fact 5) — one link, tested per gesture; a server
that orders crossings or groups differently from the sheet (shown as sent, not corrected); a server whose values do not
match the column's type (S6) — and S6 A changing what server groups accept today (a behaviour change for 1.6.0 hosts:
told, not thrown; in the CHANGELOG); the list changing between blocks of one epoch (kept, told); memory of dense cells on
many groups held (200 × `maxBlocks × blockSize` = up to 400 000 cells by default: the limit and the LRU bound it, measured
at step 3); ids differing between a client and a server pivot of the same data (fact 2: widths and folds kept by id are
lost when an application switches source — rare, never saved); `core/pivot` (78 B) and `dom/pivot` (38 B) close to their
lines; the sort contract (« a sort on a value column orders the groups by total » in pivot mode) asked of every
application's server; the application's server must do real work (a cube per query) — the value for Sehhaty is unknown
(Phase 10 Q-SC: « peu probable »), hence Q-SP1.
