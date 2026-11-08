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
