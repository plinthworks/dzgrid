# Phase 5, step 2 — core seams: blueprint (architect, 2026-10-22)

Sources: `phase-5-plan.md` step 2, D2, D3, D11, D12, D14; `decisions.md` Q6, Q7, Q12, Q13, Q18, O7 (they win);
sheets `editing.md` 1–3, `edit-reapply.md` 1–2, 6–7, 9–10, `edit-validation.md` 1, `edit-save.md` 17–18;
ARCH §3.6, §3.10, K.14. Clean room: our code only. Tests first, each failing before its code.

## Findings (code at the step-1 head)
- `ClientModel.setReader(r)` bumps both stages' `in.reader` (nothing reruns) and `reapply()` drops both
  stages and notifies `'order'` with source hard-wired `'user'` (`model/client.ts:743-753`). Neither is on
  `RowModel`; the kernel has no command; `SourceModel` (`server/rows.ts:147`) never forwards to its `inner`.
- Leaks in K.14 today: after `setReader`, any later `run()` whose inputs changed (a sort, a filter, the
  search, columns data, locale, the day) uses the new reader for that stage only. A sort change alone
  resorts with the overlay but keeps the old filter mask; a narrowing search reuses `filtered.order`
  (`canNarrow`), so a row the edit made match is never found. A column **resize** does not rerun
  (`cols: dataVersion`) — good, it must stay so.
- A transaction's patched path keeps the order (only its changed rows are retested); its full path
  (`moved || keysMoved`, a load, a reload) reruns everything with the overlay: edited rows move then.
- `ColumnCache` entries are keyed by `reader.version`: every edit makes the next sort/filter access
  rebuild that column's keys/ranks/haystack (O(n), lazy). Acceptable now; bench at step 5.
- Sort has **no host function** (keys/ranks from codecs, `sort/compile.ts`): « context to sort » (Q12)
  has nothing to reach except a `value` getter (O-3).
- `FilterKind.test(s, ctx)` (`filter/compile.ts:128`), `wire(s, ctx, zone)` (`server/wire.ts:195`).
- Tree structure functions read the raw row (`tree/shape.ts:12-16`); which column feeds them is unknown
  to the core; the tree column (path default, O7) is a DOM notion (`dom/src/tree/index.ts:62`).
- Margins: core 760 B (seam guard 28 240), `core/server` 75 B (5 925 / 6 000), dom 652 B (grant 21 800),
  `dom/tree` 36 B, `core/tree` 129 B, core/internal: measure.

## API (base `@dzgrid/core`; types cost 0 B)
```ts
// columns/defs.ts
export type EditableRule<T> = boolean | ((row: Readonly<T>, context: unknown) => boolean);
interface ColumnDef<T, V> {
  readonly editable?: EditableRule<T>;
  /** A refusal code (`validation.<code>` in the DOM's messages) or null; run by `/edit` (step 3). */
  readonly validate?: (value: V | null, row: Readonly<T>, context: unknown) => string | null | undefined;
}
// resolveColumns: editable not boolean/function, validate not function → warning
//   invalid-column at columns[i].editable / .validate, the column kept, not editable.

// row/node.ts (or edit seam file columns/editable.ts, in the base)
/** Data rows only; the column says yes; not a locked (tree structure) column. A rule that throws or
 *  returns anything but `true`: no. */
export function editableAt<T>(node: RowNode<T> | undefined, col: ResolvedColumn<T> | undefined,
  context: unknown, locked?: ReadonlySet<string>): boolean;

// model/client.ts — RowModel
setReader?(reader: ValueReader<T>, changed?: readonly string[]): void;   // changed absent = all columns
reapply?(source?: ChangeSource): void;                                   // default 'api'
/** An edit changed a value an active sort, applied filter or search reads, since the last full run. */
readonly orderStale?: boolean;
setApp?(context: unknown, source?: ChangeSource): void;
// ColumnEnv gains `app: unknown`.

// filter/kind.ts (Q12)
test?(s: S, ctx: LocaleCtx, context: unknown): (value: V | null, row: Readonly<unknown>) => boolean;
wire?(s: S, ctx: LocaleCtx, zone: string, context: unknown): Json;   // core/server, see sizes

// kernel.ts
| { type: 'edits.reader'; reader: ValueReader<any>; columns?: readonly string[] }  // refused 'invalid-reader' (no value fn / version not finite), 'reader-off' (model has none)
| { type: 'rows.reapply' }                                                         // refused 'reapply-off'
| { type: 'context.app'; value: unknown }
// events
| { type: 'orderStale'; source: ChangeSource; stale: boolean }   // on each flip only
// GridKernel
readonly reader: ValueReader<T>;   // NO_OVERLAY until edits.reader (step 4's paint reads it)
readonly app: unknown;
readonly orderStale: boolean;      // rows.orderStale ?? false
editable(key: RowKey, column: string): boolean;   // editableAt(rows.row(key), columns.get(column), app, locked)
// @dzgrid/core/internal
export const lockColumns: (k, ids: readonly string[]) => void;   // the tree feature's (structure, O7)
```

## Behaviour of the seams
1. **Client `setReader(r, changed)`**: same version → nothing. Else as today (stages count as current, no
   notify) and `stale ||= touches(changed)`, `touches` = intersection with sort columns ∪ keys of the
   **applied** filter model (`appliedOf`, a half-typed filter is none) ∪ (search words ≠ ∅ ? visible ids : ∅).
2. **`run()`**: if `stale` and an input or the sort key actually changed → drop both stages first (full
   rebuild with the reader, no `canNarrow` reuse), then `stale = false`. A resize (no input change) keeps
   stale. `reapply(source)` → full run, `stale = false`, notify `'order'` with `source`.
3. Transaction patched path keeps stale; full path reapplies (O-1 A).
4. **App context**: `setApp(v)` → `app = v`, `appV++`; `Inputs.app = customFilterIn(filterKey) ? appV : 0`
   (`'"type":"custom"'` in the canonical filter: a false positive only reruns); `membershipOf` includes it
   the same way (an everything-except selection drops with `scope-changed` only when a custom filter is
   on). `customTest` calls `kind.test(s, env.ctx, env.app)`.
5. **Source model** (`server/rows.ts`): `setReader`/`setApp`/`reapply` forward to `inner` (fetched set:
   browser-run parts, no request); for server-run parts `serverStale ||= touches(server sort/filter/quick)`;
   `orderStale = inner.orderStale || serverStale`; `reapply` with `serverStale` → `invalidate()` (one
   request, same key; O-2), cleared by any new epoch or refresh. `setApp` → `wired` memo keyed on it; an
   unchanged wire sends nothing.
6. **Kernel**: `syncStale(source)` after `edits.reader`, `rows.reapply`, and in the model subscription:
   emits `orderStale` on a flip only. `editable` refuses fillers (`g:`), details, loading keys (row() gives
   no DataNode) and locked columns; a throwing rule → false + one warning `invalid-column`
   `columns.<id>.editable` detail `threw` per column per kernel. `lockColumns` / `columns.set` → warning
   `edit-structure` at `columns.<id>.editable` for each locked column with `editable` set, once per
   (locked set, defs) change.
7. **DOM base** (only this, ~25 B): `settings.context` given at creation or changed by identity in
   `update()` → `dispatch({ type: 'context.app', value }, 'host')`. Nothing else in the DOM this step
   (paint through `kernel.reader`, `aria-readonly`: step 4; the repaint signal for an `edits.reader` is
   step 4's call — likely a `readerChanged` event, not added now).
8. `tree({ structure })` in `dom/tree`: `lockColumns(kernel, structure ?? (path ? [treeColumn()] : []))`,
   on setup and column changes — **see O-4** (36 B margin).

## Files
Modify: `core/src/columns/defs.ts` (types, two checks), `core/src/row/node.ts` or new
`core/src/columns/editable.ts` (`editableAt`), `core/src/model/client.ts`, `core/src/model/column-cache.ts`
(`ColumnEnv.app`), `core/src/filter/{kind,compile}.ts`, `core/src/kernel.ts`, `core/src/internal.ts`,
`core/src/index.ts` (exports `editableAt`, `EditableRule`), `core/src/server/{rows,wire}.ts`,
`dom/src/{grid,update}.ts`, (`dom/src/tree/index.ts` + `TreeFeatureOptions.structure` if O-4 says step 2).
Create: `conformance/cases/edit-order/*.json`, `conformance/cases/editable/*.json`,
`conformance/runner/suites/{edit-order,editable}.ts` (a test reader: `Map<id, Map<col, value>>`, version
per edit), `core/test/edit-seams.test.ts`, `core/test/app-context.test.ts`, `core/test/source-rows-edit.test.ts`,
`dom/test/context-app.test.ts`; schema entries for the two suites.

## Tests first (each red before its code)
1. **Conformance `edit-order`** (input `{rows, columns, query, tree?, steps: edit|reapply|sort|filter|quick|resize|tx|app}`,
   expected `{shown, stale[], changes: [kind, source][]}`): sorted edit stays · filtered-out edit stays ·
   search-out edit stays · unrelated column not stale · half-typed filter not stale · reapply moves once
   (one `order`, source kept) · new sort reapplies and clears · new filter reapplies · resize keeps stale ·
   narrowing search finds the row the edit made match · tx on another row (no move) keeps order and stale ·
   tx that moves rows reapplies (O-1) · tree sorted edit stays until reapply · details: edit of a master in
   a sorted page stays.
2. **Conformance `editable`**: data yes; detail, filler, loading no whatever the column; rule with context
   (true / false / `'yes'` → no); rule throws → no + one warning; bad `editable` value → warning, no;
   locked column → no + `edit-structure` once; unknown row or column → no.
3. **Kernel** (`edit-seams`): `edits.reader` refusals; `kernel.reader` identity; `orderStale` events only
   on flips, with the command's / model's source; `rows.reapply` → `reapply-off` on a model without it;
   reapply from the app is `'api'`, not `'user'`.
4. **Q12** (`app-context`): kind `test` gets the context; context change reruns the filter only with a
   custom filter on (`diagnostics.filterRuns`); membership/everything-except dropped only then.
5. **Server** (`source-rows-edit`): fetched set reapplies in the browser with 0 requests; server-sorted
   column edit → stale; reapply → exactly one request, same key; a new query's answer clears; `wire` gets
   the context, a changed wire → one request, an unchanged one → none.
6. **DOM** (`context-app`): one `context.app` per identity change, none for an equal reference.
7. **Types** (`types.test.ts`): rule and `validate` parameter types; a 2-parameter `test` still assignable.
8. **Layering/public API**: guard moved to the measure with this step's bytes named; `public-api` lists
   `editableAt`; base imports no `src/edit/` (ready for step 3).

## Mutants worth running (in a copy)
`run()` drops stages without the « input changed » test (resize reapplies) · keeps `canNarrow` while stale ·
`touches` over `query.filter` keys instead of applied · `touches` always true / always false · `stale` not
cleared by a full run · `reapply` source `'user'` · `kind === 'data'` → `kind !== 'detail'` · `=== true` →
truthy · try/catch removed · locked check removed · app input ungated (always rerun) and gated off (never) ·
membership without app · kernel emits `orderStale` on every change · source `reapply` → `inner.reapply()`
only · wire memo without app.

## Sizes (gz, measure; owner grants Q16)
Base: column checks ~35, `editableAt` + `kernel.editable` + throw/lock warnings ~110, kernel commands,
getters, `syncStale` ~110, client stale/touches/run/app/membership ~130, filter arg ~5 → **+350–420**:
28 240 → ~28 600–28 660 (budget 29 000 held). Seam guard in `layering.test.ts`: 28 240 → the measure,
comment « Phase 5 step 2: +N (editable, reader/reapply/orderStale, app context Q12) ». Plan target was
+250–400: may end at its top; anything over 29 000 is cut, never granted. `core/server` +60–100 vs 75 B
margin (O-4). `core/internal` +~15 (measure). dom +~25 (20 648 / 21 300, grant 21 800 not needed).
`dom/tree` +40–60 only if O-4 puts it here. `core/tree`, `core/detail`, angular, theme: 0. K.8 profile
~+400 (80 286 → ~80 700 / 83 500); real example ~+400 (~87 400 / 90 000).

## Docs
`docs/STATUS.md`; ROADMAP (step 2 entry, bytes); ARCHITECTURE §3.6 (`setReader(r, changed)`, stale rule)
and Phase 5 decision index; `conformance/README.md` (two suites); `docs/behaviors/filter-custom.md`
(`test`/`wire` third argument); `edit-reapply.md` (O-1, O-2: host transaction, server reapply);
`editing.md` 2 if O-4 moves `structure`; `decisions.md` (O-1…O-4 answers); this file's « Results ».

## Risks
K.14 through a host transaction that moves rows (O-1); O(n) cache rebuild per edit on the next sort/filter
access (bench at step 5; a per-cell cache patch later if needed); an app passing a new `context` object on
each change detection reruns custom filters (identity check in the DOM; Angular note at step 9);
`matches()` reads the stale mask: step 7's muted rows need « passes now » through the reader (not this
step); server margin 75 B; existing tests calling `setReader(r)` with one argument stay valid (`changed`
optional = all columns).

## Owner decisions
- **O-1** Host update that moves rows while the order is stale: **A** everything is put back in order (edited
  rows move too, mark off; free, as a reload) ★; B only the host's rows move (two readers, ~+300 B).
- **O-2** Server grids, column sorted/filtered by the server: **A** mark shown, the reapply asks the server
  again for the current page (one request) ★; B no mark on server-run parts.
- **O-3** Q12 « sort »: no comparator exists. **A** context to filter kinds (`test`, `wire`), `editable`,
  `validate` now; sort gets it when a comparator is added ★; B also `value(row, context)` getters
  (~+200 B, every cache keyed on the context).
- **O-4** Bytes: `core/server` (+60–100 / 75 B left) → grant 6 100 ★, or drop `wire`'s context; `tree({ structure })`
  wiring in `dom/tree` (+40–60 / 36 B left) → **move to step 8** with its grant ask (plan D12) ★, the core seam
  and its tests in step 2.

## Done (2026-10-22, not committed)

Built as above: `ColumnDef.editable` / `validate` and their checks, `editableAt` (`columns/editable.ts`,
public), problem code `edit-structure`, kernel commands `edits.reader` / `rows.reapply` / `context.app`,
event `orderStale`, getters `reader` / `app` / `orderStale`, `kernel.editable`, `lockColumns`
(`@dzgrid/core/internal`), the stale-order rule in `clientRows` (`touches`, `full()`, `run()`), `setApp`
and the `app` input, `sourceRows` forwarding with `serverStale` and the `wired` memo keyed on the context,
`test` / `wire` given the context, the DOM's `context.app` at creation and on identity change.

**Tests first, each seen failing for the right reason before its code:** conformance `edit-order` (17
cases: unknown command), `editable` (7: no `kernel.editable` / `lockColumns`), `problems/edit-structure`
(and the « one case per problem code » check); `core/test/edit-seams.test.ts` (14), `app-context.test.ts`
(5: no `setApp`, no third argument), `source-rows-edit.test.ts` (5), `dom/test/context-app.test.ts` (2),
`public-api.test.ts` (2 lists), `types.test.ts` (typecheck errors: no `EditableRule`, no `editable`, a
3-parameter `test` refused). Not red first: the layering guard « the base holds no edit module », which
guards step 3. Mutants (blueprint list, 17 run in place, restored after each): all killed; two only after
strengthening — « resize reapplies » (the resize command never reaches `run()`: `resize-keeps-stale` gains a
`column.state` width patch) and « `kind === 'data'` → `kind !== 'detail'` » (`row()` never yields a filler
or loading node: `editableAt` tested on both).

**Deviations from the blueprint:**
- One runner file `conformance/runner/suites/edit-order.ts` holds both suites (`edit-order`, `editable`) and
  the test overlay; `problems` reuses its `runEditable`.
- `edits.reader` refuses only a bad reader (`invalid-reader`); `reader-off` was dropped at the review (no shipped model lacks `setReader`; a custom one reads no edit).
- « Same version → nothing » reads: the reader is always taken; only a version that moved can make the
  order stale. `sourceRows.setReader` does not compare versions for its server part (the edit controller
  moves the version on every edit).
- `test` / `wire` take the context as an **optional** last parameter (`context?: unknown`): code that calls a
  kind with two or three arguments (three existing tests do) still compiles; kinds written either way work.
- `editableAt` has a fifth optional parameter `threw(column)` so the kernel can tell a throwing rule once per
  column; the public behaviour is the blueprint's.
- `edit-structure`: any truthy `editable` on a locked column counts (`true` or a rule); told once when a
  column becomes locked and editable (one `problems` event per column), again only after it stopped (R3).
- `serverStale` is cleared by any accepted answer (a page change too, not only a new epoch or a refresh):
  every answer comes in the server's order; a failed request keeps it (review RISK). `invalidate()` and the reapply share `again()`.
- The value list's counts key carries the context version under a custom filter (not in the blueprint;
  otherwise an open list kept counts from the old context).
- `rows.reapply`'s flip is told through the model subscription (the change's source is the command's).
- `kernel.editable` sits after `subscribe` in the kernel object: same code, it brought `core/detail`'s gzip
  delta back from 1 001 to 998 (see Sizes).

**Sizes (gz, measure):** core **28 899** (+659; the blueprint said +350–420; 29 000 held, 101 B left for
the rest of Phase 5's base seams); the layering seam guard moved to 28 899 with this step's bytes named.
`/server` **6 057** over the core (budget 6 000 → **6 100**, S2-O4; `scripts/rebudget.mjs` ceiling too).
`core/detail` 998 / 1 000: its own code shrank (2 189 → 2 181 B min) but its « over the core » gzip delta
moved 994 → 1 005 with the core's change, pure compression noise; brought back under by the ordering above.
Fragile: any later base change can tip it again (owner: a few bytes of slack, or accept the noise).
`core/internal` +32, `core/tree` 3 398, dom 20 679 (+31), K.8 profile 81 190 (83 500), angular, theme 0.

**Gate (2026-10-22):** `test:ci` 307 files, 4 894 tests, all pass (a first run found two: `grid.ts` over its
250-line rule, fixed by joining the comment; `rebudget.test.ts` still expecting the 6 000 ceiling, updated
to the grant); `test:perm` 6 / 6; `typecheck`, `check:size` (61 ok), `build` green. No browser run (no
rendering change).

**Risks left:**
`matches()` still reads the stale mask (step 7's muted rows need « passes now »). The O(n) cache rebuild per
edit on the next sort/filter access (bench at step 5).

## Review and test analysis (2026-10-22, not committed)

Each fix test first; the tests that failed on the code above are marked ✗, the rest pin behaviour that
already held (✓).
- **R1** ✗ conformance `edit-order/tx-edited-row-keeps`, `tx-edited-row-keeps-search`: a host update of an
  edited row under a filter or search reapplied (the stale mask against the overlay). While stale, whether
  the row passed is read again over the old rows with the edits (`compileFilter`/`compileQuick` over
  `storeBefore`, as the sort's `before`).
- **R2** ✗ `source-rows-edit` « created with the context »: `ClientOptions.app`, `ModelEnv.app`, the inner model
  and the first wire form take it. The DOM and Angular do not pass it and need not: they create the model
  before any query and dispatch `context.app` before the first filter.
- **R3** ✗ `edit-seams` and conformance `editable/lock-shrinks`: `edit-structure` told once while a column
  stays locked and editable. **R4** ✗ `edit-seams`: `columns.set` forgets which rules threw. **R6**
  ✗ `edit-seams`: `reader-off` dropped (a model without `setReader` still gives the kernel its reader);
  `checkLocks` a `for` loop. The `editable` shape check stays in the base: `kernel.editable` (and step 4's
  `aria-readonly`) read `editable` without the edit entry. The `validate` check could move to step 3's
  entry (−17 B measured): kept for now, the entry does not exist yet. **R5**: `filter-custom.md` reworded.
- **RISK** ✗ « a failed request keeps the mark »: `serverStale` cleared on an accepted answer, not at the
  send; the existing tests that read the mark before the answer now answer first.
- ✗ S6/S7 « reapply by the user »: the reapply's `order` change carries `user`; the flip back is told at
  the answer, source `data` (a consequence of RISK; our reading of S6/S7, owner to confirm).
- ✓ C1 (context under a custom filter while stale), C2 (language), C4 (refresh), C5
  (`blank-search-not-stale`), C6 (value-list counts), C3 (`set-rows-clears-stale`: a load reapplies),
  S1, S2, S3, S4, S5b, S9, C7/C8 (`api` defaults), K4 (`data`), K5 (`host` from `lockColumns`, the
  command's from `columns.set`). G1 not added (no event carries the creation dispatch; `context-app` checks
  `kernel.app` at creation).

**Sizes after the review:** core **28 926** (+27; guard moved to it), `/server` 6 067 (6 100), dom 20 679,
K.8 81 217. **`core/detail` 1 002 / 1 000: over by gzip noise** (its code is unchanged: 2 181 B min, as
before the step); ten placements of the kernel's new members gave 1 001–1 003. Not raised: the owner's
call (a few bytes for `core/detail`, or measure it over a fixed core).

**Gate after the review (2026-10-22):** `test:ci` 307 files, 4 914 tests pass; `test:perm` 6 / 6;
`typecheck` and `build` green; `check:size` 60 ok, 1 OVER (`core/detail` 1 002 / 1 000, above).
