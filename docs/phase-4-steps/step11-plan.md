# Step 11 plan: tree and master/detail in `@dzgrid/angular` (lead, 2026-10-22)

Plan: `docs/phase-4-plan.md` step 11 (« Angular (`[(expanded)]` echo-guarded, dzgPart/componentPart 'detail',
tree/detail features; example) »); decisions `decisions.md` (Q5 nesting 2 levels, soft cap 3; Q11b pinned copies
are text only). The wrapper's design: `docs/phase-3-steps/step22-angular-blueprint.md` and `step22-decisions.md`
(selector `dz-grid`, signal inputs, models with echo guards, `componentPart` / `dzgPart`, input `cell`, `emit`).
The detail part's context: `step10-plan.md` (row, key, master, height, depth, `leave()`; `nestedGrid`). Sheets:
`docs/behaviors/angular-parts.md` (completed first), `master-detail.md`, `tree-view.md`, `tree-sticky.md`.

## Findings (measured / read before the plan)
- `@dzgrid/angular` measures **5 439** B gz (budget 6 000): 561 B of room.
- `[features]` is fixed and passed through: `tree()`, `tree({ lazy: lazyChildren(…) })`, `detail()` already reach
  `createGrid`. `WiredSlot = keyof SlotContext` already holds `'detail'`, so `componentPart('detail', C)` and
  `<ng-template dzgPart slot="detail">` type-check today; the `emit` of a non-cell slot already sends
  `partAction { slot, column: null }` (the detail context has no column). What is missing is proof, the
  expansion model, and a nested `<dz-grid>`'s Escape.
- `detail({ part })` takes a `SlotPart<'detail'>` **or a name** looked up in `settings.parts` at each paint
  (step 10 point 2, made for this step): the wrapper's registry (provider, `[parts]`, templates) is that record.
  A `componentPart` object handed straight to `detail({ part })` cannot be bound: the feature is built by the
  application before any `<dz-grid>` exists, and the base mounts a new row's parts before the row is attached
  (no DOM path back to the grid). It stays the reported « componentPart: needs <dz-grid> »; the sheet says to
  use a name.
- The kernel's expansion: `kernel.expansion` (live; a toggle changes it in place, so the model gets a copy),
  commands `rows.expand { rows, expanded }` and `rows.expandAll { expanded, depth? }`, refused for an unknown data
  row (`unknown-row`) and without a shape (`expansion-off`); event `rowExpanded { source, rows, expanded }`
  after each effective command. A data change prunes the keys of removed rows and applies `initial` at the first
  non-empty load **without** a `rowExpanded` (a `modelUpdated` of kind `rows`). Under a tree filter the toggles
  go to the filter's own layer, not to `kernel.expansion` (tree-filter.md).
- Pinned parents are drawn by a second renderer with no part (Q11b); nothing to mount there.

## Decisions and reasons
1. **`[(expanded)]`: `model<ReadonlySet<RowKey>>()`**, the keys open (`dataKey(id)`, as `kernel.expansion`).
   Unset: the grid owns it. Set: written as the host, compared as a set first (equal: nothing written — the
   echo guard): the keys open and not in the model closed (`rows.expand … false`; an empty model
   closes them all), then the model's keys not open opened (`rows.expand … true`), keys of data rows the
   grid does not hold skipped (the command would refuse them all). Comes back into the model (a copy):
   a `rowExpanded` whose source is not `host` (user, api, data); a data change (`modelUpdated` of kind `rows`):
   the model is first written again — rows that arrived after it open (the usual « rows from an HTTP call »
   page) — then, if the grid still holds something else (rows removed, `initial` applied with no model), the
   model follows the grid. At creation the model is written; with no model, a non-empty `initial` comes back.
   The host's own write never comes back (its `rowExpanded` has source `host`; skipped keys stay in the model
   until a data change). Under a tree filter the model is the set outside the filter's layer (toggles made under
   a filter belong to it, tree-filter.md): documented.
2. **Output `(rowExpanded)`** like the other named outputs (in the zone when there is one).
3. **The detail slot from Angular**: `[parts]="{ visits: componentPart('detail', Visits) }"` or
   `provideDzGrid({ parts })` or `<ng-template dzgPart="visits" slot="detail" let-c>`, named by
   `detail({ part: 'visits' })`. The context is the step 10 one (`row`, `key`, `master`, `height`, `depth`,
   `leave()`, the `PartBase`) plus `emit` → `partAction { slot: 'detail', column: null, name, detail }`
   (the master is `cell().master`; a host wanting it in the event passes it in `detail`). Mount at the first
   paint showing the panel, `update` in place (new master data, height, language: same instance, new `cell()`),
   destroyed with the panel (collapse, out of the window, grid end): the base's and step 10's rules, no code.
4. **A grid in a panel: `<dz-grid [dzgNested]="cell()">`** (planned as a directive `DzgNestedGrid`; an input of
   `<dz-grid>` itself after the measure, see « Done »). The panel's context, read when the inner grid is made:
   - Escape the inner grid did not take, on a target whose nearest grid is this one, not while composing, not
     when it only hid the inner tooltip (read in the capture phase): `preventDefault` and `cell().leave()` —
     back to the panel's cell, one level only (as `nestedGrid`, step 10 point 10);
   - past depth 3, `detailConflicts({ depth })` told on the inner grid's `problems` (owner Q5);
   - Enter / F2 on the panel: the part's focus fallback already finds the inner grid's tab stop (its focused
     cell, else its first cell in view; `keys/focus.ts` roving stop), so no `focus()` is needed.
   Keys: the outer router already ignores keys from another `.dzg`; the inner `<dz-grid>` provides its own
   `DzgController`; the inner grid is made in `runOutsideAngular` by its own `<dz-grid>` (and the part mounts
   outside the zone anyway); the listeners sit on its host element, outside the zone. What `nestedGrid`
   remembers per master (sort, filter, open rows, scroll) is not copied: an Angular host keeps what it wants
   with the inner grid's models. A deviation, written in the sheet.
5. **Sticky copies**: text only (Q11b); a test proves no Angular part is created in `.dzg-sticky`.
6. **SSR**: nothing new; the server test gains a tree, a detail feature and a `dzgNested` template.
7. **Example** `examples/angular-audit`: unchanged (lead). Rebuilt and `example:bytes` measured only if the
   wrapper grows meaningfully (≥ 300 B gz).

## Bytes
`@dzgrid/angular` 6 000 held (measure 5 439; estimate +350–450: the model ~200, the directive ~200).
`detailConflicts` imported from `@dzgrid/core/detail` (external in the line). K.8 guard 83 500 untouched (the
audit profile does not use the new code); the real example ≤ 85 000.

## Tests first (seen failing)
- `packages/angular/test/expanded.test.ts`: host write opens/closes with source `host`; equal model → no
  command (echo guard); a user toggle comes back (copy, not the live set) and `(rowExpanded)` fires; the host's
  own write does not come back; empty model collapses all; unknown keys skipped then opened when `[rows]`
  brings them; a removed row leaves the model; `initial: 'all'` with no model comes back; detail masters too.
- `packages/angular/test/detail-parts.test.ts`: `componentPart('detail')` by name and a `slot="detail"`
  template: full context, mounts = destroys on scroll, collapse and grid end; `update` in place (same instance,
  new `cell()`); `emit` → `partAction { slot: 'detail', column: null }` on `(partAction)`; tree and
  `lazyChildren` from Angular; no Angular part in the sticky copies.
- `packages/angular/test/detail-nested.test.ts`: a detail component with an inner `<dz-grid [dzgNested]>`:
  its own controller, keys isolated (Down moves the inner focus only), Escape → the panel's cell once,
  an Escape that hid the inner tooltip or during a composition stays inside, inner grids destroyed with their
  panels, `focus()`, depth 4 tells `detail.depth`, a template form.
- `packages/angular/test/ssr.test.ts`: tree, detail and `dzgNested` on a server: no grid, no error.
- `packages/angular/test-zone/tree-zone.test.ts`: scrolling a tree adds 0 zone turns per frame; a user toggle
  adds one (its outputs); the inner grid of a detail is made outside the zone.
- Browser fixture `packages/angular/browser`: `?page=tree` and `?page=detail` (Chrome, fr and ar RTL, axe 0,
  Escape out of the inner grid, mounts = destroys after closing).

## Done (2026-10-22, not committed) — stopped on the real example's bytes
- **Code**: `packages/angular/src/grid.ts` only (model `expanded`, output `rowExpanded`, input `dzgNested`). The
  `DzgNestedGrid` directive was written, then folded into `<dz-grid>`: as a directive the line measured
  **6 044** (6 000); as an input **5 965**. No `focus()` (the part's fallback reaches the inner tab stop, tested).
  `rows.expandAll` dropped from the write (an empty set closes through `rows.expand`; same result, fewer bytes).
- **Tests**: `expanded.test.ts` 13, `detail-parts.test.ts` 8, `detail-nested.test.ts` 12, `ssr.test.ts` +2,
  `test-zone/tree-zone.test.ts` 3. Seen failing before the code: expanded 10 / 11, detail-parts 8 / 8,
  detail-nested 9 / 9; the guard tests added after the mutants each killed one. Mutants 18 by hand: 17 killed,
  1 equivalent (the set-equality shortcut in the write, then removed). Review (read-only reviewer): nothing
  serious; its filter-layer scenario does not reproduce (a user toggle makes the model follow the grid
  first), pinned by a test.
- **Browser** `node packages/angular/browser/run.mjs`: 54 / 54 (22 old + 32 new on `?page=tree` and
  `?page=detail`, fr and ar RTL, axe 0; rebind 3,64 µs).
- **Gate**: build, `test:ci` 294 files / 4 705 tests with **1 failure: `perf/test/example-bytes.test.ts`, the
  real example over 85 000**; `test:perm` 6 / 6; typecheck; `check:size` 0 over (angular 5 965 / 6 000, K.8
  profile 79 413 / 83 500).
- **The real example (K.8 ≤ 85 000): over.** `example:build` had installed npm's cached copy of the previous
  tarballs since step 23 (same version 0.1.0, integrity pinned in the example's gitignored lock): every Phase 4
  number was never in it. Fixed in `scripts/example.mjs` (`forgetLocalPacks`, `scripts/example-lib.mjs`, test
  in `perf/test/example-lib-review.test.ts`, failing first). True measure: **85 555** with the step-10 wrapper
  (Phase 4's core, dom and theme: +2 973 over the recorded 82 582), **86 044** with step 11 (+489; wrapper
  ≈ 3 762 gz). Owner decision needed (the ceiling, or what leaves the example's initial load).

## Review and test analysis (2026-10-22, not committed; review of `d9439c4`)
- **NG0100 at creation** (review): the grid is made during the host's change detection, so `[(expanded)]` on a
  plain field with a tree that opens rows at load (`initial`), or `(rowExpanded)` writing a field for the set
  given at creation, changed what the host's template had already read. Fixed: the events heard while the grid
  is made are queued and told after the first render (`afterNextRender`, registered in the constructor; never
  on a server), the `initial` write-back too; `gridReady` still emitted at creation.
  Test `expanded-ready.test.ts` (2, dev mode, both failing first).
- **A host write under a tree filter** (analysis bugs 1–2): it went to the filter's layer, and the next data
  change or user toggle copied the pre-filter set back into the model. Now the model never follows the grid
  while a tree is filtered (`levelAt` on the rows shown, `membershipOf(query)` ≠ that of no filter and no
  search); every `modelUpdated` but `expand` writes the model again, so the filter cleared shows the host's set.
  Tests: the two `it.fails` of `expanded-walk.test.ts` flipped, the filter walk now runs seeds 21–30 with host
  writes under the filter (21, 24, 27, 29, 30 failed first).
- **Pending keys** (analysis bug 3, lead decision, sheet `angular-parts.md`): a key the host names whose row the
  grid does not hold stays pending until its row arrives (any number of batches, lazy children level by level)
  or the host writes a new set; not reported in the model until it applies; a pending key arriving under a row
  the user or the API closed since the write is dropped (`parentOf` up the tree). Tests: the two `it.fails`
  (second batch, lazy deep link `{a, a1, a11}`) flipped; +4 (a new set replaces the pending keys; a row closed,
  removed and added again stays closed; nothing reported before it applies; closing `a` or `a1` before its
  children load, with gated loads — the ancestor check removed, both fail); the no-filter walk's oracle
  rewritten for pending keys (11 of 16 seeds failed on the old code). The Angular two-way rule (a user toggle
  before change detection replaces a host write) written in the sheet.
- **The jsdom window swing** (analysis 5): not a DOM base bug. The swing is the base's fast-scroll overscan
  (`interact/scrolling.ts`: speed = distance / time between scroll events; `overscanRows` up to 40 each side
  while the last scroll is under 150 ms old, a trim paint at 160 ms). jsdom's synthetic scroll events come
  milliseconds apart, so a walk's scroll of up to three views reads as a fling (hundreds of thousands of px/s):
  the next paint draws 51–93 rows, until a scroll event at the same place (speed 0) or 150 ms of wall time —
  hence the alternation on renames. Reproduced deterministically (200 flat rows: a jump of 800 px then a rename
  93 rows, a scroll event in place then a rename 17, 250 ms later 17). In Chrome the same code runs on real
  scroll events, and the trim paint follows each gesture.
- **Typecheck**: the analysis tests called `applyTransaction` on `RowModel` (`expanded-walk`, `detail-nested`):
  typed as `ClientModel`.
- **Budget** (owner decision Q15): `@dzgrid/angular` 6 000 → 6 200; measured **6 176** (5 965 before: the
  deferral ≈ 42 B, the filter and pending keys ≈ 169 B).
