# Phase 7 (row grouping and aggregation): decisions

The owner's answers (2026-11-04, « ★ everywhere in §5, sizes OK »): `questions.md`. They win over
`docs/phase-7-plan.md`. Below: what the lead took alone while applying them (steps 1–4), and the measures.

## Facts re-read at 6db19e8 (1.4.0), against the plan's §1 (written at 55b8391)
- **Sizes moved** (plan fact 19 is stale). Measured 2026-11-04, `node scripts/size.mjs`: core base 29 147 / 29 150
  (3 B), dom base 23 259 / 23 260, K.8 89 150 / 90 000, `core/tree` 3 485 / 3 500, `dom/tree` 4 194 / 4 200,
  `core/csv` 1 893 / 2 000, `core/xlsx` 6 902 / 7 100, `core/state` 1 500 / 1 510, `dom/state` 1 178 / 1 224,
  `dom/print` 1 576 / 1 600, `column-menu` 3 038 / 4 300 (now measured over `popup`). Owner rule (Q-B): a new entry's
  line = measure + 10 %; an existing line +2 % at most; beyond → the owner.
- **Status bar** (Phase 9, 1.4.0): `rangeStats` (`core/src/range/stats.ts`) already counts a block the way totals must
  (typed values through the edit overlay, `type: 'number'` columns only, Neumaier, ±Infinity left alone). Reused: its
  rules (`aggregation.md` 3–6 say the same) and its compensated sum, moved to one shared helper (`value/neumaier.ts`)
  used by both — see « Shared sum » below.
- **Excel export exists** (`@dzgrid/core/xlsx`): Q-EX now covers CSV, Excel and print (step 7). Its tree outline levels
  are the path for group rows.
- **The tree gained** `fixedOpen` (core), `tree({ column: fn, indent })` (dom), `spans({ acrossLevels })`: none
  changes the shape seams; `column: fn` is a per-row tree column — the group column stays one column (Q-G1 A).
- **The cell menu exists** (`@dzgrid/dom/context-menu`, shared list with the column menu): « Regrouper par » may land
  in both through the shared list (step 6).
- `a11y-protocol.md` §22–25 are taken: grouping is **§26** (183–187).
- `GroupNode` is still `{ key, kind, level, label, path }`; `'footer'` still in `RowKind` with no node: unchanged facts.

## Decisions taken alone (steps 1–4)
- **Names follow ARCHITECTURE §3.13**: `ColumnDef.aggFunc?: AggFuncName | AggFn<V>`, `ColumnDef.groupable?: boolean`
  (types only, 0 B); options `aggFuncs` (wins over the column's), `expanded: 'none' | 'all' | number` (the tree's
  `initial`, not ARCH's `expandedDepth`), `footers`, `grandTotal: 'top' | 'bottom'`. Entry `@dzgrid/core/grouping`:
  `groupShape(o)`, `groupConflicts(o)`, types `GroupingOptions`, `GroupShape`, `GroupedRows`.
- **D2, built apart from the tree's code**: the grouped view answers `TreeRows` (so the tree painter draws it at step
  5), but its structure is its own short builder, not a factoring of `tree/build.ts`. Grouping builds from the
  **filtered, sorted order only** (a group holds matches by construction: no visibility pass, no fillers, no cycles),
  and has footers the tree has not; factoring would have moved bytes inside `core/tree` (15 B from its line) for no
  shared behaviour. `core/tree` is untouched.
- **Group identity** (D3, Q-G3 A): per level, numbers, days, instants and booleans by their sort key (injective for
  those types), every other type by its export text (`toExport`, the raw value); blank, missing and unreadable: one
  group. Key: `groupKey([col, seg, col, seg, …])`, `seg` = the type's first letter + the export text, `''` for the blank
  group (no non-blank segment is empty: it has its letter).
- **Group order** (D7, Q-G2 A): numbers / days / instants / booleans by key; text, enum and custom by the collation of
  their sort text, ranked once over the **distinct** values of the level (plan fact 20), ties (collation-equal, distinct
  values) by code units; enum with its own order by that order (its sort key); « (Vide) » last both ways; a level
  reverses when the grid's sort holds that column descending (read from the model's query).
- **When the structure is rebuilt**: new rows (a snapshot), another filtered/sorted order, `setBy`, another language or
  column set. **Not** after an edit (K.14): an edit of a grouping column only marks the order stale (through
  `reads()`); the regroup waits for the next whole run (« Réappliquer », a sort or filter change). **One rule for any
  regroup while stale** (review 2026-11-04): it goes through a whole run, so the groups and the « stale » mark agree —
  a live update that moves a row's grouping value is checked like a sort key (the model's `reads()` columns join its
  sort columns: `full()`, the edits applied, nothing stale); an add or a removal runs whole already; `setBy` while
  stale calls `reapply`. Known edge: a patch that changes a text grouping value into a collation-equal one (« Alger » →
  « alger ») is not a sort move; the grouping's own check regroups then, edits included, the mark still on.
- **Totals are recomputed** per build when the reader (edit overlay) moved, and an edit asks for a redraw through the
  shape's `values(changed)` when it touched an aggregated column (or any, when unknown). Each total is a scan of its
  group's leaves (contiguous in the all-open order): O(rows × levels) per aggregated column; no merging of children
  (one rule at every level, `aggregation.md` « differs on purpose »), no `(sum, count)` pair kept.
- **first / last** accept any column type (they pick a value, they compare nothing); min / max: number, day, instant,
  text; sum / avg: number. Anything else: `agg-type`. An unknown function name: `invalid-setting`.
- **Totals rows**: footers `f:` + the group's key, grand total `t:` + `top` / `bottom` (`FooterNode`, `kind: 'footer'`,
  `group: null` for the grand total). No grand row when no row passes the filters. A footer counts as one more sibling
  of its group's children (`aria-posinset` / `setsize` stay consistent); the grand total as one more sibling of the top
  groups.
- **Seams in the base** (D14, step 2): `RowShape.kind` gains `'group'`; `reads?()` joins `touches`; `values?(changed)`
  from `setReader` when the reader moved; `ShapeInput.env` (the model's column environment: columns, language, reader,
  the shared key cache — grouping reads its keys from the cache the sort fills); `parents(snap, depth, shown, env)` (the
  first load opens `expanded` groups before any build); `attach`'s `redraw(kind?, source?)` (a regroup is told as
  `rows`); browser pages refused beside any shape but details (the tree's rule, detail `group`). All additions
  (`check:api`: new optional members, union members, optional parameters).
- **Bad options** (review 2026-11-04): `expanded` other than `'none'`, `'all'` or a number ≥ 1 is told and bent to
  closed; a setting no string can be made of is told by its type (`named`), never a throw.
- **Problems** of grouping carry a column id or a function name, never a value: `unknown-column` / `invalid-setting`
  (path `grouping.by`, `grouping.aggFuncs`), `agg-type` / `agg-threw` (path `columns.<id>.aggFunc`) — new type-only
  codes (`GroupProblemCode`), no base byte.
- **Shared sum: not shared.** Moving `rangeStats`' Neumaier loop into one helper used by both cost `core/range` 29 B
  (3 196 → 3 225, over its 3 200 line): `rangeStats` keeps its inline copy; the grouping has the same rule in
  `grouping/agg.ts`.
- **Hidden columns**: a column's own `aggFunc` is read on the visible columns; a hidden column is totalled only when
  named in the options' `aggFuncs` (its total is not on screen; `totals()` follows the same rule).
- **Ties in the collation** (`Alger` / `alger`, two spellings of `é`): the sort's collator is base-sensitive, so they
  share a rank; the code-unit order places them (`Alger` before `alger`), the same every time.

## Measures (steps 2–4, 2026-11-04; `node scripts/size.mjs`, `node scripts/bench.mjs group`, quiet machine)
| Line | Before | Now | Line set | Rule |
|---|---|---|---|---|
| `@dzgrid/core` base | 29 147 / 29 150 | 29 204 (seams +49, review fix +8) | **29 250** | +0.34 %, inside the 2 % rule |
| K.8 profile | 89 150 / 90 000 | 89 197 | 90 000 (held) | — |
| read-only client profile | 50 517 | 50 571 | recorded | — |
| `@dzgrid/core/tree`, `/detail` | 3 485, 1 137 | 3 480, 1 134 | held | untouched |
| `@dzgrid/core/grouping` (new) | — | 4 285 | **4 750** | measure + 10 %, rounded up to 50 (ARCH §5.2: 5 000) |

Perf (medians of three runs of `npm run bench -- group`, minified, node; lines in `perf/budgets.json`):
| Case | Median | Line |
|---|---|---|
| **A grouped by 2 columns + 3 totals, cold (exit criterion ≤ 150)** | **59.9 ms** | 66 |
| regroup by 2 other columns (`setBy`, warm keys) | 8.2 ms | 9.5 |
| expand a group of ~10 000 rows (core flatten; the Chrome frame is step 5's) | 0.1 ms | 1 |
| one-row live update, no grouping column touched | 3.2 ms | 5 |
| A by a text column of ~100 000 distinct values (recorded) | 256.8 ms | 282.5 |
| memory: grouped view over the flat model | 64.1 B / row | 71 |

The plan's « ≤ 60 B / row » memory estimate is over by 4 B: 40 B of it are the number and rank caches the sort shares
(counted because they are typed arrays), 20 B the places and levels of the shown rows.

## Decisions taken alone (steps 5–6, 2026-11-05; sheets amended first: row-grouping.md 15–22, group-drop-zone.md 13–17)
- **The tree painter is not shared whole**: `dom/tree` sits 6 B under its line and its `setup` names its own texts and
  options; sharing it meant changing it. `dom/grouping` has its own painter and imports only the tree's pure pieces
  (`tree/sticky.ts`, the pinned-rows stack; `tree/styles.ts`, the chevron CSS), both unchanged: `dom/tree` 4 194 / 4 200,
  untouched. Cost: `dom/grouping` 4 434 B (plan estimate 3 400).
- **Beside a tree the tree wins, either order** (follow-up 2026-11-05): `GridFeature.shapeAfter?: string[]` (new
  optional member, base `shapeOf` skips a feature whose listed ids are present; dom base measured below); grouping gives
  `['tree']`, so it gets no shape and steps aside, told. **On a server source** grouping steps aside through the core
  shape's new `off()` (rows flat, no totals rows, `totals()` `{}`, `setBy` ignored; `core/grouping` +49 B) and no painter, no API.
  Listed after details, details win (told); listed before, grouping wins (told). Merged cells told, `g.spans` off at
  each paint (as details do); header bands kept.
- **The label wins its cell**: a total of the group column itself is not drawn there (it stays in `totals()`). A count
  under a non-number column is written as a number of the language; an application's function result is read by the
  column's codec, else shown as its text.
- **Enter on a group row works in any column**; the group column's back key on a first-level group does nothing (as the
  tree's root).
- **Band items**: a chip button (its column's header) and its × button (`zone.remove`) are both toolbar items; Delete
  and Backspace act on either, without modifiers; a removal keeps the focus at the same place, an emptied band gives it
  back to the grid. A sentence only when the grouping really changed. The chip drag captures the pointer only once past
  4 px; no finger drag.
- **The menu items' texts and the zone's live in `locales/<lang>-group`**, checked at setup by `columnMenu` only when
  `use.grouping` is given: `column-menu` texts unchanged.

## Measures (steps 5–6, 2026-11-05)
| Line | Measured | Line set |
|---|---|---|
| `@dzgrid/dom/grouping` (new) | 4 434 | 4 878 (measure + 10 %) |
| `@dzgrid/dom/group-zone` (new) | 2 576 | 2 834 |
| `locales/{en,fr,ar}-group` (new) | 318 / 367 / 507 | 350 / 404 / 558 |
| `@dzgrid/theme/grouping.css` (new) | 533 | 587 |
| `@dzgrid/core/grouping` | 4 334 (+49, `off()`) | 4 750 held |
| `@dzgrid/dom/column-menu` | 3 164 (+126) | 4 300 held |
| `@dzgrid/dom` base (`shapeAfter`, follow-up) | 23 282 (+23) | 23 260 → 23 290 (+0.1 %, 2 % rule) |
| `dom/tree`, K.8 | 4 194, 89 218 | unchanged |

Chrome (headless, minified sources served, `--only grouping`): a group of 10 000 rows opened to the next frame, median
of 6: 17.4–17.8 ms over three runs (exit criterion ≤ 30; the model and events 0.2–0.4 ms — the rest is the frame).
