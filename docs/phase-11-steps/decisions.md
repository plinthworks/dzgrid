# Phase 11 (hardening and ecosystem): decisions

The owner's answers (2026-11-08, « ★ partout »): `questions.md`. They win over `docs/phase-11-plan.md`. Below: what the
lead took alone while applying them, and the measures, lot by lot.

## L1 — leftovers and small debts (2026-11-08)

Scope: the plan's R-list items that cost no K.8 byte. Each fix: the sheet amended, a test written by hand that failed
first, then the fix. R3, R4, R9, R10 wait for L2 (K.8).

- **R1 — `planPaste` on a list loaded in blocks** (`core/range`). Taken alone: *bounded*, not refused — both loops walk
  `boxAt` (the rows held, as `boxRows` / the figures already do); a loading row counts for nothing, as in any plan, so
  the plan is the one it was, minus the walk. A refusal would need a new field on `PastePlan` (public type) for a case
  the DOM never reaches (it refuses with `rows-not-loaded` before planning). Test `walks-bounded.test.ts` (Ctrl+A bulk
  edit, a paste running past the rows held): 15 000 300 calls before, under 10⁴ after. Sheet `range-selection.md`.
  Mutants by hand: each loop put back alone fails the test.
- **R2 — `*` in the group column** (`dom/grouping`). One walk of `positions(d)` (the rows held on a server, every row
  in the browser): a row of a lower level before the focused one starts the run again, one after it ends it. Test
  `grouping-server.test.ts` (an open group of 10⁶ rows, 10 held): 2 000 057 reads before, under 10³ after; a two-level
  test in `grouping.test.ts` (own parent only, no cousin, no deeper group). Mutants by hand (no break, no reset,
  `>=` level): all three killed. Sheet `row-grouping.md` 10.
- **R5 — the dock.** Fixed: a panel cleanup that throws is reported (`reportError`), the next ones run. Checked, not
  a bug: an open « Placer … » menu already closes when the grid goes (the menu list lives in the grid's scope); the
  new test pins it. Kept on purpose, written in `dock.md` « API »: a `dock` part restored before the dock exists tells
  its problems in an event (the dock is a feature, set up after the state's restore can run); a state read before the
  first paint may lack the features' panels (collected at the first paint).
- **R6 — `aria-setsize` −1 in the DOM.** Test in `grouping-server.test.ts` (a full block with `hasNext`, no total:
  leaves `-1`, the group `2`); a mutant (`Math.abs`) fails it. Left: scroll gestures in the DOM permutations
  (`perf/permutation.ts`) — a long run, against « travailler doucement »; for L3 (the 4× pass), which runs them anyway.
- **R7 / R8 — kept on purpose**, a sheet line each: `infinite-scroll.md` « The end » and `server-side-groups.md` (a known
  end or total is not moved by `hasNext` without a total); `row-grouping.md` 4 (« Alger » → « alger » is not a sort move,
  the grouping's own check regroups). No test showed a wrong count the user sees that a later short block or total does
  not fix.
- **R11 — docs.** ARCHITECTURE §5.2: the audit profile's row says the line in force (90 000, measured 89 978) and the
  table says `size-budget.json` holds the lines in force; §8: `docs:api` replaced by `check:api` (never built; a readable
  API reference comes with the site). `test-casts-baseline.json`: 850 → 840 (`core/test/csv/rows.test.ts`, its ten
  casts removed by typing its helper on `DisplayedRows`); the others need a comment each, left for when a file is touched.

### Measures (L1)
- `core/range` 3 260 → **3 265** over the core: its line raised +2 % to **3 329** (the plan's figure for R1; pinned in
  `layering.test.ts` and `rebudget.test.ts`). `dom/grouping` 4 973 → 4 966 (line 5 100). `dom/dock` 4 241 (line 4 600).
- K.8 **89 978 / 90 000, unchanged**; the core and DOM bases unchanged (no byte of L1 is in them).
- `check:api`: nothing removed or narrowed, nothing added.
- Gate: `gate:step` green (8 943 tests; test:tz, typecheck, build, check:size, check:api). Run three times: the first
  found `core/range` 1 B over its old line, the second the line's two pins in the scripts' tests.

## L2 — room under K.8 (golf), then R3, R4, R10, R9 (2026-11-08)

Bounded to one session (owner Q2 A). Measured on minified, gzipped code with the repo's own tools (`check:size`,
`size-split.mjs`; a per-module listing of the initial load from the same esbuild call). No behaviour changed by the golf,
no test weakened, `check:api` nothing removed or narrowed.

### What the audit profile carries (before)
- Initial load 89 978 B gz = js 87 060 in 8 files + the theme's CSS 2 918. Heaviest inputs (minified): the Angular
  wrapper's shipped fesm2022 29 517, `core/kernel` 10 577, `dom/render/rows` 9 740, `core/model/client` 9 724,
  `core/model/column-cache` 8 284, `dom/render/viewport` 7 939, `dom/filters/forms` 7 887, `core/server/rows` 7 395.
- Little repeated text: the code is already dense; gzip takes most repetition anyway (a policy table rewritten as one
  string came out **35 B heavier**, undone). Gains come only from removing distinct code.

### Golf kept
- **One freshness check in the column cache** (with R4 below): five copies of « same column, rows, reader, language »
  became `fresh()`. Core base 29 258 → **29 224**, K.8 **−31 B** (R4 included).

### Golf tried and undone
- **One style injector shared by the features** (`injectSheet`): every variant measured, none kept. In the base
  (`dom/styles.ts`, features importing it): K.8 −86 B, but the DOM base 23 650 → 23 673 (over 23 660) and the
  `structure.test.ts` rule « filters and pagination reach the base only through the context, the types and
  `@dzgrid/dom/internal` » broken. In `@dzgrid/dom/internal`: K.8 −43 B, but the internal line 3 799 → 3 892, over its
  3 800 by more than the +2 % rule. Each feature on it with the base keeping its copy: each feature's line +16–46 B.
  Options for the owner: the internal line +100 (K.8 −43), or the base line +20 and the structure rule eased (K.8 −86).
- `LAYOUT_CSS` written without spaces, `.dzg-sr`/`.dzg-live` and `.dzg-tooltip`/`.dzg-popup` merged: K.8 −74 B, the
  same rules. Undone: `LAYOUT_CSS` is public and its declaration carries the string as its type, so `check:api` reports
  it changed (accepting it is the owner's call: `node scripts/api.mjs --accept … --only "@dzgrid/dom#LAYOUT_CSS"`;
  redoing it takes six test regexes written to the compact form: `infra`, `auto-height`, `overlay-retry`, `pagination`,
  `review-p2c`, `review-p3b`).

### What the measure counts that an app does not ship (for the owner; not changed)
- **815 B gz** of the K.8 initial load are the Angular wrapper's `ɵɵngDeclareClassMetadata` calls (decorator metadata
  for TestBed). The profile measures the partial-compiled fesm2022 as esbuild bundles it, without Angular's linker; a
  real Angular production build links them and drops them (`ngDevMode`). The real example's share is measured apart
  (`npm run example:bytes`).
- **78 B gz**: esbuild's default `charset: 'ascii'` writes the Arabic texts as `\uXXXX`; Angular's own builder writes
  UTF-8.
- Either would be a change of the yardstick, not of the code: the owner's to decide.

### Leftovers landed (each with a test that failed first)
- **R3 — the batch's frame** (`core/server/tx.ts`): each frame lands only its own batch (`q === batch`); a landed or
  stopped batch is a new list. Test `infinite.test.ts` « when the timer wins, its frame … does not flush a batch begun
  since » (failed: the second batch landed on the first's frame). Sheet `row-transactions-async.md`. 0 B in K.8 (not
  in it); infinite / server-side +11 / +13 over the core.
- **R4 — the key cache by definition** (`core/model/column-cache.ts`): keys, ranks, export and value lists, haystacks
  are fresh for the same `def`, not the same resolved object. Test `key-cache-defs.test.ts` (new definitions keeping a
  sorted column: 3 reads, not 6; a new definition: read again). Kept by object on purpose: the value-list index
  (`distinct`) — a new column lookup (a searched column hidden) must recount, `distinct.test.ts` says so; and `patch`
  still drops entries made under another object (rebuilt when asked, never wrong).
- **R10 — `missing-feature` for a `status` part without `statusBar()`** (`dom/part.ts` `NEEDS`): +8 B in K.8, DOM base
  23 650 → 23 657 (line 23 660). Test in `parts-features.test.ts`. Sheet `parts.md`, CHANGELOG « Upgrading ».
- **R9 — Angular `(rowMove)` and `ctl.rowDrag()`** (the kept diff `/tmp/angular-rowmove.diff`, unchanged): +42 B in
  K.8; the `@dzgrid/angular` line 7 900 → **7 950** (+2 % rule, measured 7 925; pinned in `rebudget.mjs` and four
  tests). Test `angular/test/row-drag.test.ts` (failed: `ctl.rowDrag is not a function`). Sheets `angular-parts.md`,
  `row-move.md`. `check:api`: additions only.

### Measures (L2)
| Line | Before | After | Line |
|---|---|---|---|
| K.8 audit profile | 89 978 | **89 997** | 90 000 (room 3) |
| core base | 29 258 | 29 224 | 29 300 |
| DOM base | 23 650 | 23 657 | 23 660 |
| `@dzgrid/angular` | 7 900 (line) | 7 925 | 7 950 (+2 %) |
| `core/state` over the core | 1 607 | 1 612 | 1 615 (+2 %: its code unchanged, the base 34 B smaller moved its share of the gzip) |

- The golf kept frees **31 B** in K.8 (the cache check, with R4), far from Q2 A's 1 000; the leftovers took 50 (R9 42,
  R10 8). Net +19. Room left **3 B**: the next base byte needs a decision. Further room needs either the owner's yardstick decision above (≈ 900 B), the `LAYOUT_CSS` accept
  (74 B), or raising the line (Q2 A: « on relève la ligne s'il manque encore »). Not raised here.

## L2 — measuring rule, owner A (2026-11-08)

Owner: « A — corriger la règle de mesure » so K.8 measures what a real production build ships; no library code changed.

- **Angular metadata.** The K.8 entry (and « audit screen + motion », same yardstick) now says `"angular": "production"`
  (`size-budget.json`). `scripts/size-split.mjs` then builds the profile the way `ng build` does in production, with
  Angular's own mechanism, not a text edit: every `.js`/`.mjs` input goes through `@angular/build`'s
  `JavaScriptTransformer` (the linker for the partial-compiled fesm2022, then its advanced optimizations), and the bundle
  gets the code bundle's defines (`ngDevMode`, `ngJitMode`, `ngServerMode`, `ngHmrMode` false) and `pure: ['forwardRef']`.
  The `ɵɵngDeclareClassMetadata` calls (TestBed only) are dropped; the partial declarations ship linked, as in the app.
- **Charset: not changed.** The note above was wrong: the real example build (`examples/angular-audit/dist`) ships the
  Arabic as `\uXXXX` escapes (no raw UTF-8 in any chunk; `@angular/build` sets no `charset`). The profile already
  matches it.
- **Tests** (`scripts/test/size-angular.test.ts`, failed first): a planted partial-compiled service
  (`fixtures/split/ng/dist/ng.mjs`): its metadata is in the plain measure, absent from the production one, the service
  itself linked and present; the measure equals a reference rebuild written apart (`fixtures/size-reference.mjs`: the
  linker's Babel plugin and the advanced-optimization plugins called one by one, the same defines) within 4 B (equal);
  the real K.8 profile within 8 B (equal, 88 442); an unknown `angular` value is a problem.

| Line | Before | After | Line |
|---|---|---|---|
| K.8 audit profile | 89 997 | **88 442** (−1 555) | 90 000, kept (room 1 558, for future work) |
| audit screen + motion (recorded) | 90 484 | 88 853 | none |

The 1 555 B, measured: linking with the production defines −1 599 (the class metadata, ≈ 815 B above, and the linked
declarations), Angular's advanced optimizations +44 (its classes wrapped for tree-shaking).
The `@dzgrid/angular` line (7 950, the wrapper alone, not split) keeps its old measure: not part of this decision.

## L3 — performance under a 4× slower CPU (2026-11-08)

Machine: the owner's Mac (Apple M4 Max, macOS 26.2), Chrome 157.0.8103.38 headless (`channel: 'chrome'`), minified
pages (`serve({ minify: true })`), one browser at a time, closed in a `finally`. **Not a quiet machine**: load average
2.5–6.8 during the runs (the owner's Xcode git service, a virtual machine, Firefox); a fixed 2·10⁷-step loop read 60 ms
at 1× and 248–261 ms at 4× (the throttle holds across the page's navigation). Owner's rule « travailler doucement »: each
series run **once** (a line is the median of the samples inside one run, 3–30 as the line says), not the plan's « median
of three runs »; one full run before the fixes and one after, at 1× and at 4×.

### Tooling (0 B in the bundles)
- `npm run bench:browser -- --cpu 4`: every page the script opens gets `Emulation.setCPUThrottlingRate` on its own target
  before it loads; 1 and 4 only. Its budgets: `perf/browser-budgets-4x.json` (a missing file: every line « — »).
  `-- --json <file>` saves the lines (name, value, unit, ok) with the Chrome version. Every scroll gesture gains a
  « longest frame » line (the §5.4 « no frame over 100 ms »).
- `-- --only features` (also in a full run): `packages/dom/test/browser/perf-features.html` (dataset A grouped by
  `e1, n2` with a sum, a mean, the latest day; a ~10 000-row group opened by its chevron; the pivot by `e0, e2`, 48
  created columns; typing in the floating row with `debounceMs: 0`, the worst a user can set; a set filter over 20 000
  values opened and its list scrolled; `preparePrint` of 5 000 rows), the infinite page (10⁷ rows, 150 ms latency) and
  the server-side groups page (a fruit of 500 shops open) scrolled 50 px a frame, server C (the audit screen, answers
  held): an answer released to its rows written (« paged settle ») and the heap over 30 page changes (« paged-model
  memory »), and the Angular fixture's `?a=1&t=1` (`<dz-grid>` on A with three `ng-template` cell parts) dragged
  2 000 px a frame.
- Lead's reading of the Phase 3 « not measured » list: « response to painted rows » and « paged settle » are one line
  (server C, answer → rows written: 17.8 ms at 1×, 19.1 at 4×); « csv one chunk » is the CSV export's longest task and
  animation frame, already read (now budgeted at 4×); the 20 000-value list, the typing, the templated drag and the
  paged memory have their lines. A measuring mistake fixed on the way: the first server C line observed the first
  `.dzg-layer` only and waited a frame too many (50 ms at both rates); it now observes the body's scroller.

### Measures (before → after the fixes; ms unless said)
| Line | 1× before | 1× after | 4× before | 4× after | 4× budget |
|---|---|---|---|---|---|
| scrollbar drag 2 000 px, median frame | 17.3 | 16.7 | **70.8** | 40.5 | 51.6 |
| — p95 / longest frame | 22.5 / 26.6 | 17.8 / 36.8 | **79.4 / 104** | 52.1 / 81.2 | 70.5 / 100 |
| `<dz-grid>` 3 templated columns, drag median | 20.5 | 16.7 | **84.1** | **55.1** | 51.6 |
| — p95 / longest frame | 25.7 / 31.5 | 18.0 / 33.4 | **97.3 / 119.9** | 63.5 / 96.1 | 75 / 100 |
| pivot A (2 + 2 columns, 3 values), grid made | 133.4 | 117.0 | **500.7** | 436.1 | 450 |
| floating filter, first key 500 ms after the focus | — | 6.9 | **132.6**¹ | 25.8 | 35 |
| floating filter, first key at once (recorded) | 30.0 | 26.6 | 125.6 | **100.7** | — |
| A grouped by 2 columns + 3 aggregations | 50.0 | 50.0 | 181.9 | 183.3 | 247.5 |
| a ~10 000-row group opened | 17.5 | 17.4 | 20.5 | 19.1 | 28 |
| set filter, 20 000 values: warm open / list median frame | 16.9 / 16.6 | 8.2 / 16.7 | 36.1 / 16.8 | 35.3 / 16.6 | 49 / 23 |
| print 5 000 rows: build / longest animation frame | 84.3 / 52.6 | 83.0 / 52.6 | 323.5 / 59.1 | 323.3 / 59.4 | 342 / 100 |
| infinite, server-side: wheel median frame | 16.6, 16.7 | 16.7, 16.7 | 16.6, 16.7 | 16.6, 16.7 | 22.5, 23 |
| CSV export of A: wall / longest task | 514 / 0 | 523 / 0 | 1 957 / 57 | 2 001 / 56 | 2 100 / 100 |
| first render of A / of 10⁶ rows | 40.8 / 225 | 41.3 / 230 | 169 / 975 | 181 / 1 143² | 245 / 1 543 |
| tree 10⁶: first render / expand all | 248 / 124 | 284 / 161² | 1 070 / 591 | **1 257 / 654**² | 1 156.5 / 649.5 |

¹ From a separate « before » run of the feature lines (the fixes 2 and 3 stashed), load 6.8. ² The « after » runs had a
load of 5.8 and 4.4; the tree's code is untouched, and an A/B of the row containment on the same tree page gave
305 / 358 against 346 / 263 ms (no effect, noise). Each 4× budget: the measure + 35 % to the half-ms, capped by §5.4
(the target × 3, or the 1× budget × 3), every longest frame 100 (`perf/browser-budgets-4x.json`'s comment). The 1×
file gains the new lines by its own rule (measure + 35 %, a « to the next frame » line 23 at least, under §5.3); no
older 1× line changed.

The three worst at 4× against §5.4 (the target × 3, no frame over 100 ms): the templated drag (median ×1.63 of its cap,
a 120 ms frame), the drag of A (×1.37, a 104 ms frame) — one cause — then the first keystroke (a 126–133 ms frame) and
the pivot (×1.11).

### Fix 1 — rows contain their layout, not their paint (theme)
- Found by a trace of the drag at 4×: of a 72 ms frame, `Layerize` 34 ms, paint 13, layout 14, script 7. Removing the
  sticky pinned segments took `Layerize` to 3 ms; so did `contain: layout style` (or none) on the rows: the paint
  containment of the injected `contain: content` gives each row a clip, and Chrome then layerizes every sticky segment
  under its own clip. `will-change` on the layer, `contain: strict` and a body `contain: paint` changed nothing.
- No pixel changed: nine pages (grouping, tree, detail, range, pinned A with a focused cell, edit marks, server groups,
  infinite, demos) screenshotted with and without, identical. The wheel and horizontal scrolls unchanged at 1× and 4×.
  S11's Firefox finding was the `size` part (`size layout style` dropped the sticky segments, `content` / `paint` /
  none kept them): `layout style` holds no `size`. **Firefox and WebKit not re-checked here** (Chrome only, the
  owner's Mac): for the next three-engine pass (L4a's or L5's).
- Where: **the theme** (`dzgrid.scss`: `.dzg-row:where(:not([data-spans])) { contain: layout style }`; a spans row keeps
  the feature's `contain: style`), not `LAYOUT_CSS`: `LAYOUT_CSS` is public and carries its text as its type, so any
  change is an API change for `check:api` (L2 « `LAYOUT_CSS` »). A grid without the theme keeps the slower drag.
  **Owner option**: move the rule into `LAYOUT_CSS` (`contain: layout style` instead of `contain: content`, the theme
  rule dropped, `infra.test.ts` and `row-containment.test.ts` changed), accepted with
  `node scripts/api.mjs --accept … --only "@dzgrid/dom#LAYOUT_CSS"`.
- Guard: `packages/theme/test/row-containment.test.ts` (failed before the theme was built again); the 4× lines « scrollbar
  drag … median / p95 / longest frame » (70.8 / 79.4 / 104 before, over 51.6 / 75 / 100).
- Size: theme 2 918 → 2 932 (line 2 960); K.8 +14.

### Fix 2 — the floating row prepares the text filter (`dom/filters`)
- The first keystroke in a text box folds the column's 100 000 cells (`fold`, the haystack: ≈ 25 ms in Node at 1×,
  ≈ 100 ms at 4×); later keys read it warm (20 ms to the frame). `fold` is already per character through a table (a
  run-based variant measured equal). The quick search has the cure: its idle preparation (`warmSearch`, D13) builds the
  same `search` haystacks the text filter reads. The filters feature now holds it (as a bound search box does) and asks
  for it when a box of the floating row first takes focus. Sheet first: `filter-ui.md` « Preparing the text filter ».
- Cost: it prepares every textual column, not only the focused one (a column-first order needs `Warmup.want(column)`
  in the DOM base, 3 B of room): idle time only, paused while scrolling. Typed within ≈ 0.1 s of the focus at 4×, the
  first key still folds (100.7 ms, recorded): written, not budgeted.
- Test first: `packages/dom/test/filters-warm.test.ts` (a focus then a keystroke folds nothing: failed, 1 fold; no focus:
  one fold; a focus on a header cell asks nothing; destroyed while preparing). Mutant (the `.dzg-hextra` check removed):
  killed. Guard: the 4× line « first keystroke, 500 ms after the focus » (132.6 before, 35 now).
- Size: `dom/filters` 11 949 → 12 000 (line 12 000); K.8 +29 (with fix 1's theme bytes and the pivot's 0 in K.8:
  88 442 → 88 485).

### Fix 3 — a pivot keeps its value columns (`dom/pivot`)
- Profiled warm at 4×: the pivot grid made is pure script (480 ms, no layout to speak of), spread (the value columns'
  keys, the crossing pass, the grouping). Counted in jsdom: **three crossing passes and three totals at creation**
  where Node's line makes one: each time the DOM sets the effective columns, `relabel` made new definitions for the
  value columns under « Total » (`{ ...n, header }`), and the pass and the key cache know a column by its definition
  (R4). Now a column equal to the one set last time, key by key, keeps its object. Two passes remain at creation (the
  crossings must be known before the created columns can be set); a later change of the pivot columns makes one pass
  and reads no value column again.
- Test first: `packages/dom/test/pivot-passes.test.ts` (made: 2 passes, 6 key builds — failed with 3 passes; pivot
  columns changed: one pass, no key build — failed with 2 passes). Guard: the 4× pivot line (500.7 before, cap 450).
- Size: `dom/pivot` 2 569 → 2 623; its line 2 600 → **2 650** (+2 % rule). 0 B in K.8 (not in the audit screen).
  The kept objects stay for the grid's life, one per column id ever set (a created column's too: ≤ 200 a pivot).

### Misses written (no cap raised)
- `<dz-grid>` with three templated columns, drag median **55.1 ms against 51.6** (p95 and longest frame within). Its
  layout is 25 ms a frame against 14 ms on the plain page; the same page with a `serif` body font: 14 ms. The fixture's
  `font: 14px system-ui` (a font with fallbacks for the Arabic columns) costs the text layout, not the templates
  (without templates: 52.8 ms). `text-rendering`, kerning and ellipsis variants: no change. Owner's call (Q6 « targets
  missed by far »: it is not far): accept, or a lighter fixture font.
- The million-row tree's first render and expand-all sit at their caps (1× budget × 3); the quiet run is under, the
  loaded one over. A CPU-bound line slows ≈ ×3.75 at 4×, and its 1× budget already holds 35 %: ×3 of that is the
  measure × 4.05. Owner's call if a quiet run misses.
- The first keystroke typed at once after the focus (above).
- §5.4's ×3 applied to a CPU-bound line asks it to run at 1× under 0.75 × its target (pivot: 117 of 150 now).

### Left
- **R6** (DOM permutations with scroll gestures): the plan keeps it in L1, which sent it here (« L3 runs them anyway »);
  `bench:browser` does not run the permutations. Not done; the audit screen's permutations are paged (a scroll loads
  nothing), and the `aria-setsize` case it guards lives in the infinite and server-side lists, which
  `browser-infinite.mjs` / `browser-server-groups.mjs` already scroll. For L9's review to place.
- Node `bench`: not run (no core line changed; the fixes are in the DOM and the theme).

### Sizes (L3)
| Line | Before | After | Line |
|---|---|---|---|
| K.8 audit profile | 88 442 | **88 485** (+43) | 90 000 |
| `@dzgrid/theme` | 2 918 | 2 932 | 2 960 |
| `@dzgrid/dom/filters` | 11 949 | 12 000 | 12 000 |
| `@dzgrid/dom/pivot` | 2 569 | 2 623 | 2 600 → 2 650 (+2 %) |
| core base, DOM base | 29 224, 23 657 | unchanged | 29 300, 23 660 |

`check:api`: nothing removed, changed or added.
- Gate: `gate:step` run once — test:ci and test:tz green (8 961 tests), typecheck stopped on a test's model type
  (`pivot-passes.test.ts` reading `diagnostics` on a `RowModel`; typed as `ClientModel`, no cast), then typecheck,
  build, check:size (0 over) and check:api (nothing removed or narrowed) run again green; the tests were not run a
  third time for a type-only change.

## L4a — the missing automated accessibility checks (2026-11-08)

Tool (0 B in the bundles): `node scripts/browser-a11y.mjs` (`--only <page>`, `--check axe|status|focus|targets|spacing|
reflow|forced|motion`, `--engine chrome|firefox|webkit`). Pages: the browser suite's own — flat (`index.html`, floating
row, popups, a pinned column, boxes), tree (sticky parents, pinned columns), grouping (band, footers, pinned columns),
**pivot with its bar (new `pivot.html`, columns panel docked)**, dock (columns panel), filters panel (dock), row moves,
list loaded in blocks — Chrome in fr / ar × light / dark; Firefox and WebKit fr light and ar dark, every check but axe
and forced colours. Pinned rows: `browser-pinned-rows.mjs` already walks them (2.4.11) on the playground's page. One
browser at a time, closed in `finally`; each series once (« travailler doucement »). Results: `docs/a11y/acr-results.md`.

Taken alone (the lead), for the ACR to say:
- **Reflow**: the test page's host made fluid (an app's layout, not the grid's); a data table scrolls in two directions
  inside its own box (1.4.10's exception), the page must not.
- **Text spacing**: text newly ending in « … » (cells, a narrow header's name, a dock tab or title) is listed, not
  failed — the full text is the element's accessible name and the user widens the column or the area. Nothing was cut
  in the block direction, nor cut without « … ».
- **Target size**: every control and row-move grip measured; the controls under 24 px (a box in its cell, the pivot
  bar's ×) pass by spacing.
- **Forced colours** is Chrome / Edge only (no other engine emulates `forced-colors: active`); Firefox's and Safari's
  own high-contrast modes are not tested.

### Failures found and fixed (each a test that failed first)
1. **The focus below the window at 400 % zoom** (every page, 320 × 256): the grid focuses without the browser's scroll
   (S10), so a grid taller than the window moved its focus out of sight. `focusShown` (`render/viewport.ts`) focuses, then
   scrolls the **window** only, on the block axis, by what it misses of the cell; the grid's scrollers untouched (the
   rule « no physical side » kept: `top` / `bottom` only). Test `a11y-l4a.test.ts` (below, above, inside). Sheet
   `reading-keyboard.md`.
2. **A dock area covering the rows on a narrow screen** (dock, filters, pivot at 320 px): the focused cell entirely under
   the panel (`dock.md` 14). The focus going into the rows now collapses an open side area to its strip (a user change,
   told). Test `a11y-l4a.test.ts` (narrow, wide). **Owner yes** (2026-11-08; `dock.md` 14).
3. **Forced colours, a selected row without a box column** (row moves, list in blocks): the system paints backgrounds
   in Canvas, the row looked like the others. The selected bar is drawn there at `max(var(--dzg-select-bar), 0.25rem)`
   in `Highlight`, `forced-color-adjust: none`. Test `theme/test/a11y-l4a.test.ts`; seen in the screenshots
   (`packages/dom/test/browser/results/a11y/forced-*.png`).
4. **The columns panel's « no match » status `display: none` while empty** (4.1.3: a live region out of the tree until
   it speaks is often not heard): empty, it is now `position: absolute` (out of the flow, no gap, in the tree). Same test.
5. **WebKit: « ResizeObserver loop completed with undelivered notifications »** on the dock's pages when the window
   narrowed: the dock measured inside the observer's delivery and its room resized what it watched. Measured on the next
   task now. Test `a11y-l4a.test.ts` (nothing moves inside the callback; the room after).
6. **Pinned columns wider than the view** (flat, tree, grouping at 320 px; every engine, fr and ar): a centre cell was
   entirely under them or outside the window. **Owner A** (2026-11-08): while the pins would leave the centre less than
   its widest column, the core's column model releases them into the centre, in screen order; the state still says
   pinned, nothing told or saved; they come back when the view widens. Sheet `pinned-columns.md` first; tests
   `core/test/pinned-release.test.ts` (479 / 480 px, the state, widening) and `a11y-l4a.test.ts` (segments, both
   directions). The script's line green: Chrome fr/ar light/dark, Firefox and WebKit, once each.

### Left
- `bench:browser` not run again (focus reads one box per key now; for L9's review if a key line moves).

### Sizes (L4a)
| Line | Before | After | Line |
|---|---|---|---|
| K.8 audit profile | 88 485 | **88 591** (+106) | 90 000 |
| DOM base | 23 657 | 23 684 | 23 660 → **23 690** (+0.13 %) |
| core base | — | 29 272 | 29 300 |
| `core/spans`, `core/csv` (gzip over the base) | — | 4 062, 2 084 | 4 050 → 4 065, 2 080 → 2 085 (+0.4 %, +0.2 %) |
| `@dzgrid/theme` | 2 932 | 2 946 | 2 960 |

`check:api`: nothing removed or narrowed (`focusShown` is internal).
- Gate: `gate:step` once over the whole batch — test:ci and test:tz green (8 974 tests); check:size stopped on
  `core/spans` (+12 B) and `core/csv` (+4 B), gzip over the base that grew by the pinned release; their lines raised
  (+2 % rule, pinned in `rebudget`), then check:size and check:api green. The tests were not run again for two numbers.

## L5 — print polish (2026-11-08)

Sheet first: `docs/behaviors/print.md` « On paper » 10–14 (the browser's own print, page breaks, width, colours, right
to left). Tool (0 B in the bundles): `npm run test:browser -- --only paper [--engine <e>]` (`paperChecks` in
`scripts/browser-print.mjs`), on the browser suite's new page `packages/dom/test/browser/paper.html` (flat 1 200 / 5 001
rows, wide, grouped — 300 teams, footers and the grand total —, pivot with month bands; fr / ar, light / dark; `menu=1`
the hook). It opens its own browsers, one at a time, each closed in `finally`; `scripts/pdf-text.py` now also gives each
line's colour and each page's width.

Engines, said plainly:
- **Chrome**: `page.pdf()` — it sends `beforeprint` and `afterprint`, so the browser's own print is checked with no
  `print()` called. PDF read back as text.
- **Firefox**: its own « Save to PDF » printer, silent, to a file (launch preferences; one Firefox per file), reached by
  `window.print()` from the page — the same `beforeprint` / `afterprint` path as Ctrl+P. PDF read back as text.
- **WebKit**: Playwright has no print to a file there. `beforeprint` sent by hand (the table must be whole at once), the
  print media emulated, the computed rules checked, a screenshot kept (`results/paper-webkit-*.png`). **Not verified
  in WebKit: pages, the header rows repeated, the breaks** (emulation has no pages).

### Decided taken alone (the lead; the owner may say otherwise)
- **The browser's own print: a `beforeprint` hook, not a note** (the plan's two answers; the sheet picks the smaller).
  `printOnMenu(grid, options?)` in its own new entry `@dzgrid/dom/print-menu`: `beforeprint` builds the table at once (sliced,
  it would be cut at its first slice), removed as `print()`'s (`afterprint`, else the first `focus` / `pointerdown`);
  a table already in the page is left (it prints); it lasts as long as the grid (no stop handle: 14 B held). The note
  would have needed a translated text written by the DOM base, carried by every grid.
- **Width: words are never cut.** `overflow-wrap: anywhere` was tried (a test, red then green on the wide list): it
  fits any table, but lowers every column's narrowest width to one letter, so Chrome narrowed every column together and
  cut « Dossie|r », « C00|02 » on the ordinary 12-column list in portrait (seen in the PDF text). Left out. Limit, kept
  and written in the sheet: a list whose words alone are wider than the page (28 columns of unbroken text in portrait:
  183 lines past the edge in Chrome) needs the application's `@page { size: landscape }` or fewer columns. The pivot's
  headers are single words (« somme(Montant) »): 13 columns do not fit portrait; the test page prints it in landscape.
- **Breaks: a group's first row stays with its group row** (`break-before: avoid` on a data row right after one), a
  totals row with the row before it. First tried: `break-after: avoid` on every group row — in a pivot every row is a
  group row, the whole table became one unbreakable run and Chrome left page 1 empty (seen in the PDF). Nested group
  rows are not tied (an outer group row may end a page above its first inner group).
- **The fallback printed light**: without the hook, the screen grid prints as on screen (choice 1 kept), now in the
  light scheme — in the base theme's own print rule (`.dzg { color-scheme: light }`, +4 B), so it holds without
  `print.css` too.

### Defects found and fixed (each a check that failed first)
1. **A dark page's truncation line printed light grey** (Chrome PDF: colour 0.63): only the table was black on white.
   The container is now (`print.css`), the caption and the note inherit. Check `paper dark-5001`.
2. **Ctrl+P without the hook on a dark theme: the grid's text light grey on white paper** (34 of 34 cells read).
   `.dzg { color-scheme: light }` in print (`dzgrid.css`). Check `paper fallback-dark`; WebKit by the computed colour.
3. **No page break rule for groups**: 8 pages ended on a group row, 6 began with a totals row (Chrome, 300 teams). Now
   0 / 0 (`print.css`; a totals row also carries `dzg-print-footer`, set by `dom/print`). Test `print-menu.test.ts`
   (the classes), check `paper grouped`.
4. **The browser's own print printed the screen only** (no hook). `printOnMenu`; tests `print-menu.test.ts` (built at
   once under a clock that would slice it, `print()`'s table left alone, cleanup on `focus` / `pointerdown`, the grid
   destroyed); checks `paper menu-fr`, `menu-ar` (Chrome, Firefox), WebKit by hand-sent `beforeprint`.

### Timing at 4× CPU (Chrome, L3's tooling: `perf-features.html` minified, CDP throttle; the owner's Mac)
5 000 rows × 30 columns of dataset A: `print()`'s sliced build 316–336 ms (median of 3, budget 342), longest animation
frame 58–60 ms (budget 100); the hook's build at once 306–330 ms, one task — the dialog opens that much later.

### Results
`npm run test:browser -- --only paper`, once per engine after the fixes (harness corrections re-ran a group, noted):
- **Chrome** 14 / 14: the hook (fr 45 pages, ar 28) every row once and whole, headers on every page, nothing left after;
  dark 5 001 rows all black, the line included; the fallback dark; wide (16 columns, landscape) inside the page; grouped
  0 pages ending on a group row, 0 beginning with a totals row (before: 8 / 6); pivot (landscape) the four month bands
  on all 10 pages, 150 towns once. The limit (28 columns of unbroken text, portrait): 183 lines past the edge.
- **Firefox** 11 / 13 then settled: the two failures were (a) my harness reading Firefox's PDF before it was written (it
  writes a first %%EOF and pauses; one page read) — re-read alone after a 7.5 s still size: **201 pages, 5 000 rows,
  0 light lines of 68 017**; the wait corrected; (b) **Firefox does not honour `break-before: avoid` between table rows**:
  16 pages began with a totals row (0 ended on a group row) — the engine's limit, « where the engine allows », counted
  and printed there, not checked. Firefox shrinks a too-wide page to fit by itself (`print.shrink_to_fit`): the
  28-column limit case printed whole there.
- **WebKit** (emulation) 5 / 6: the hook builds at once; thead a header group, rows `break-inside: avoid`, black on
  white, the break rules computed, the fallback light. The pivot's table is a few px wider than its box at A4
  landscape less the page's 16 px margins (Chrome's PDF has no page margin): the word-width limit of sheet 12, not
  fixed. The first WebKit run failed « fits » on the two landscape pages measured at the 1 000 px viewport; measured
  at 1 123 px since.

### Sizes (L5)
`printOnMenu` moved to its own entry `@dzgrid/dom/print-menu` (coordinator, 2026-11-09: keep `dom/print` under its
rule without the owner); `dom/print` exports only `preparePrint`, `print`, `PRINT_KEYS` as before, the at-once build
(`buildNow`) sits in its module unexported by it (tree-shaken out of it).

| Line | Before | After | Line |
|---|---|---|---|
| `dom/print` (over the DOM) | 1 639 | **1 675** (the totals rows' class, the at-once build) | 1 664 → 1 697 (+2 %) |
| `dom/print-menu` (over `dom/print`, new) | — | **75** | 100 (measure + 10 %, rounded up to 50) |
| `@dzgrid/theme` (base) | 2 946 | 2 950 | 2 960 |
| `theme/print.css` / unlayered | 340 / 299 | 369 / 326 | 400 / 350 (unchanged) |
| K.8 | 88 591 | 88 595 (+4, the base theme) | 90 000 |

`check:api`: additions only (the new entry's `printOnMenu`).
- Gate: `gate:step` once — test:ci 8 973 passed, 3 failed: two size tests pinning 1 664 (moved to 1 697) and
  `tree-walk` timed out under load (green alone); test:tz 2 timed out under load (`search-walk`, `tree-sticky-stack`,
  green alone in Auckland). After the move to the new entry: the print tests, typecheck, build, check:size, check:api
  run again, green.

## L7 — the second wrapper: `@dzgrid/element`, a Web Component (2026-11-09)

Owner Q3 A. Sheet first: `docs/behaviors/web-component.md` (14 rules). Package `packages/element` (version 1.7.0 like
the others until L9; peers `@dzgrid/core`, `@dzgrid/dom`), entries `@dzgrid/element` and `@dzgrid/element/define`,
README, `api/dzgrid-element.api.txt`, its size line. Follows DzCalendar's `@dzcalendar/element` (tag defined by
`/define`, `define…(name)`, a server-safe base class, properties set before the definition taken, destroy a microtask
after a disconnect, own problems a microtask later, `ready`, `problems` the last 100).

### Decided taken alone (the lead; the owner may say otherwise)
- **Tag `dz-grid`, the same as Angular's selector** (DzCalendar did the same with `dz-calendar`): only `/define`
  defines it; `defineDzGrid('dz-grid-wc')` for a page holding both; an element finding a grid already drawn as its child
  leaves it and tells `already-a-grid`.
- **Light DOM only, no `shadow` attribute** (unlike DzCalendar): the theme's layered sheets, the popups and the print
  table live in the document and the layout sheet is injected once per document; a shadow root would split them.
- **`display: contents`** when the page left the element inline, as Angular's host: sized the same way
  (`dz-grid > .dzg { block-size }`).
- **Event names: one rule, no list** — `dzg-` + the grid event's type in kebab case, `detail` the event unchanged; the
  element's own problems use `dzg-problems` with the grid's shape; `dzg-ready` after each making. `dzg-`, not `dz-`:
  DzCalendar's events keep theirs.
- **Parts: `definePart` functions only**; `<template>` children not read (they would need a binding language the grid
  does not have; a part builds nodes, never HTML from data).
- **Made when connected with `columns`, `getRowId`, `messages`; nothing told before** (a framework sets properties in
  any order). Fixed keys changed later: the grid's own `unsupported-live-change` (as Angular), never a remake. Removed
  and put back later: a new grid (the user's sort and filter not kept; `gridState()` keeps them).
- **Attributes validated by the element** (enumerations, a locale or zone `Intl` refuses: left out, a warning with the
  raw attribute value); `row-height` read as a number, its range the grid's own warning; `env` a property read once
  (the tests' geometry, as Angular's `DZG_ENV`).
- **Problem code `invalid-setting`** for every element problem (no new core code: the core's list and K.8 untouched).
- **`sideEffects: ["./define.js"]`** in the built manifest (`build.mjs` takes a source's `sideEffects`, `false`
  otherwise), as DzCalendar's: a bundler keeps `import '@dzgrid/element/define'`.
- **Release scripts list a fifth package** (`release.mjs` ORDER after `angular`, `pack-local.mjs`, `pack:release`,
  `release.yml` wording); the packed-tarball test accepts a pack made before the element (four files).
- **The API baseline created alone** (`surfaceOf` + `format` for `element`), not by `--accept` without `--only`, which
  would have rewritten the other three baselines with the unreleased 1.8.0 additions.
- Left: Firefox and WebKit (the plan's three engines; the coordinator asked Chrome only), a React 19 / Vue 3 smoke page,
  typed `addEventListener` overloads and an `HTMLElementTagNameMap` entry; review of the new code at L9.

### Checks
- Tests (jsdom, `packages/element/test`, project `element`): 21 + 1 (node: SSR) — define once, `/define`, Angular's
  grid left alone; made when the three arrive, nothing told before; properties before the definition; rows live with
  the sort kept; settings key by key (one `update` of the changed key); a part function draws; a fixed key told by the
  grid; wrong kinds refused; attributes read, live, removed to the default, winning over settings; row height and
  density; unreadable values warned with the raw value; `dir` followed; events bubbling and composed, `settings.onEvent`
  after; creation problems a microtask later then `dzg-ready`; a refused grid told and `ready` rejected; `update`;
  removed then put back; moved in one task kept. Red first (no source), then green; two expectations of mine corrected
  (a part draws in `mount`; the first `dzg-ready` was still pending when the listener was added).
- Chrome, `npm run test:element` (`scripts/browser-element.mjs`, page `packages/element/test/browser/element.html`: a
  tree and a pivot as two `<dz-grid>`), fr light and ar dark: 16 / 16 — in the page, `display: contents`, `dir`,
  labelled, sized by the page's rule (362 px: 360 + the theme's border), the theme's header colour, compact 28 px and
  `row-height` 36 px, the pivot's four months, the tree opened by a click (20 → 50 rows), `dzg-ready` ×2,
  `dzg-row-expanded`, `dzg-sort-changed` heard, removed and put back drawn again, **axe 0**, no page error.
- Local demo `playground/element.html` (out of git, `.git/info/exclude`): the tree and the pivot, density and busy
  switches, remove / put back, the `dzg-*` events listed; `?lang=ar&theme=dark`.

### Sizes (L7)
| Line | Measure | Line |
|---|---|---|
| `@dzgrid/element` (over `@dzgrid/dom`, new) | **1 587** (1 957 alone, `@dzgrid/*` external) | 1 750 (measure + 10 %, rounded up to 50) |
| core and DOM bases, Angular, K.8 | unchanged (no base or Angular file touched) | — |

`check:api`: the new baseline only (4 exports: `DzGridElement`, `defineDzGrid` in each entry); the other three
unchanged.

Gate: `gate:step` once. test:ci 8 995 passed, 3 timed out (`expanded-walk` seed 27, `range-cut` cut, `tree-sticky-gaps`
sticky 1: each 900–1 050 s of wall time against a 5–20 s limit, the Mac pausing), green alone. The chain stopped
there, so its rest ran by hand: test:tz Auckland 8 998 passed, 4 timed out the same way (950–990 s:
`filters-dates-gaps`, `row-height`, `sort-select`, `tzslot-agreement`), green alone in Auckland and Los Angeles with the
element tests; the full Los Angeles run not repeated (the Mac heats); typecheck, build (five packages), check:size
(K.8 88 595 / 90 000, element 1 587 / 1 750, 0 over), check:api (additions only) green.

## L6 — documentation in the repo, `llms.txt` (2026-11-09)

Scope from the lead's brief (wins over the plan's wording): the guide lives in `docs/guide/` (not `docs/guides/`);
`llms-full.txt` is the guide concatenated (not the old sheet `docs/llm/fiche-dzgrid.md`, left as it is, 1.6.0); the
README rewrite as a map and the docs website stay out (a link to the guide added to the root and DOM READMEs).

### Decided taken alone (the lead; the owner may say otherwise)
- **Names guarded by being documented.** The baseline `api/*.api.txt` held 1.0.0 plus a few accepted names, so most
  features the guide shows (grouping, pivot, dock, row moves, print, infinite, server groups…) were not in it. Accepted
  with `--only`, **additions only** (52 new exports, and `DzGrid` / `DzgController` re-read with their added members: each factory the guide uses, its options, its api and feature types,
  the English text bundles it imports, Angular's `DzGrid`, `DzgController`, `DzgColumnOrGroup`, `selectedIds`);
  `check:api` before and after: nothing removed or narrowed. A documented name can no longer vanish silently.
- **Samples compiled by ngc** with strict templates (Angular's spec config), each block its own module; `html` blocks'
  module scripts compiled as JavaScript (syntax only). Probed by hand: a wrong setting, a wrong template binding, an
  unknown output, an unknown entry, function or `dzg-*` event each fail the test.
- **`llms.txt` order** is the guide index's order; links absolute (GitHub) so the copy in `@dzgrid/dom` works from
  `node_modules`. No clock in the generator.
- Each sentence checked against its behaviour sheet; corrections made while writing (find marks, never filters; a
  newer save waits for the older one; `maxColumns` makes no column past the cap; export `all` keeps the filters).

## L9 — close and release (2026-11-09)

### The unbounded viewport (found by L8's benchmark; fixed first)
- **The bug.** A host with a height but not the documented layout (no flex column, `.dzg` not sized): `.dzg` is as
  tall as its content, so the viewport grows with the body the grid writes; 1.7.0 read that height as « the view »
  and drew every row (20 001 row elements for 20 000 rows), told nothing; 100 000 rows sorted in 37 s, 10⁶ rows took
  Chrome to 16 GB. Sheet first: `virtual-scroll.md` « A host without the layout »; a note in
  `docs/guide/getting-started-ts.md` (`llms-full.txt` remade).
- **Decided taken alone.** Detection in the paint: the view taller than the window (`ViewportBox.room`, the window's
  `innerHeight`, a new optional field: an addition for `check:api`) **and** showing every row with less than one row of
  room left past the body and the pinned rows — a view grown to its rows. A grid sized taller than the window on purpose
  with room left is not touched (a test). Then, for the grid's life: the viewport's `max-block-size` set to the window's
  height (followed at each paint), the paint drawing only that height even in the frame that found it, and
  `unbounded-viewport` told once (`warning`, path `host`, no detail). Holding the view to the window (rather than only
  drawing fewer rows) keeps every row reachable by the grid's own scrollbar. The code is a type-only member of
  `ProblemCode` (0 B in the core); no message key (problems are told to the app, never shown).
- **Test first** `packages/dom/test/unbounded-viewport.test.ts` (a planted geometry that follows the body's written
  height): red on 1.7.0 code (20 000 rows drawn; the million-row case killed the worker), then green, 6 / 6.
- **Chrome once** (`node scripts/browser-unbounded.mjs`, page `packages/dom/test/browser/unbounded.html`: host 600 px,
  no flex, 100 000 rows, window 1 280 × 720): 24 rows drawn, the viewport 720 px and scrolling, told once; a sort to the
  next frame 32 ms (1.7.0: 37 s); the last row reached in 32 ms; heap 19 MB; 6 / 6.
- **Sizes.** DOM base 23 684 → **23 830** (+146 B gz; a literal problem instead of `problem()` saved 9): line 23 690 →
  **23 850** (+0.7 %, the +2 % rule). K.8 88 595 → **88 742** / 90 000.

### Code review (new code since 1.7.0: L7 element, L5 print-menu, L2 / L3 / L4a sources, the L9 fix)
One review agent (read only), then the lead read the L3 / L4a diffs it had not reached (filters' idle hold, pivot's
kept columns, released pins, dock focus, `focusShown`). Each fix: a test that failed first.
- **Fixed — the unbounded check at a first paint** (`render/viewport.ts`): with no scroll mapper yet, the body's height
  was taken as the window's, so a bounded view taller than the window by less than a row was held and told. Test
  « a bounded view taller than the window by less than a row, at its first paint ».
- **Fixed — `<dz-grid>` changed while out of the page** (a framework moving it): put back in the same task, the kept
  grid now takes what changed (`connectedCallback` applies). Rules 4 and 10 amended.
- **Fixed — a refused grid kept the element's elements but dropped its text** (`children` → `childNodes`). Rule 11.
- **Fixed — `row-height=""` read as 0 and `"abc"` as NaN**: an empty or unreadable number is left out and told
  (`attribute:row-height`, the raw value), as any value the element cannot read. Rule 5.
- **Kept on purpose — one print table in the page** (`print.md` 10): two grids both with `printOnMenu` print the first
  one listened; a page with several grids prints the one it means by its button.
- **Checked, not a bug** — a value that throws during the menu's build: the throw lands in the build's async part, so
  the slice is restored at once and the cleanup armed; the table goes on `afterprint`, the next print slices again (a
  guard test kept). The sort-key cache without `numerals`: numbers are parsed in Latin digits whatever `numerals`
  (`separatorsFor`), so no key depends on it. The dock's narrow-screen collapse told as a user change: `dock.md` 14,
  the owner's yes.
- Read and fine: the element's server-safe base class, properties set before the definition, `ready`, event names,
  disconnect and move; `tx.ts`' frame cancel; the Angular controller and grid (no leak found); `print.scss` logical.
- Places that recompute the same thing, for the rules Phase 11 changed: the released pins are a layout of the screen
  only (export, print, clipboard and the server wire read the columns' order, which is the screen's in either case,
  and the state keeps « pinned »); the server groups' value rule (Q-SP5) is the model's, read by screen, export and
  print alike; the unbounded cap is the screen's only.

### Architect check (against ARCHITECTURE Phase 11 and the plan's §6)
Done by the architect agent (read only). Acted on: « Ajustements après la Phase 11 » in ARCHITECTURE (with §3.1, §5.2
and §7.2 amended: the Web Component is done, DOM 23 850); the benchmark's bug sentence (fixed in 1.8.0); the ACR's
product line names `@dzgrid/element` (not evaluated apart). **R6 kept as it is** (one line): the DOM permutations
carry no scroll gesture; the `aria-setsize` −1 case they would guard lives in the block lists, which
`browser-infinite.mjs` and `browser-server-groups.mjs` scroll in Chrome, and the DOM test of L1 pins it.
Written as not met, for the owner (ROADMAP « Phase 11 — close »): the listening L4c; `<dz-grid>` in Firefox and WebKit
and a React / Vue page (the plan's « three engines »); the 4× misses (owner's call); the benchmark on one day, its
scripts outside the repo and unpublished; axe and forced colours in Chrome only; WebKit print by emulation only.

### Release 1.8.0 prepared, and the checks (2026-11-09)
- The five packages at 1.8.0, `@dzgrid` peers following, `version.ts`, the example's manifest, the release tests
  (« the five packages »; the packed regex `1\.8\.0|1\.8\.1-local`); `CHANGELOG` dated with the upgrade notes;
  `docs/release-1.8.0.md` (French; the element's first publish from the Mac, then its trusted publisher).
- `release:check` first stopped: the real Angular build's DzGrid share **99 717 B against its line 99 500** (not
  measured since the Phase 8 close: Phase 10's and 11's base seams, the server pivot, L9). Raised to **100 000** by the
  +2 % rule (+0.5 %), as 1.4.0 did; the owner may say otherwise. Then « Release check: the 5 packages at 1.8.0 ».
- `gate:step`, first run: 23 failures, all size pins of the DOM line (23 690 in six tests) and the packed tarballs
  still 1.7.1-local (made fresh by `release:check`); fixed, then **one full run green**: test:ci, test:tz Auckland and
  Los Angeles 9 025 / 9 025 each (no timeout), typecheck, build (five packages), check:size 0 over (DOM 23 830 /
  23 850, K.8 88 742 / 90 000, element 1 614 / 1 750), check:api additions only (`ViewportBox.room`, the
  `ProblemCode` member).
- `test:real-app`: 58 / 58, every screenshot 0 px different.
