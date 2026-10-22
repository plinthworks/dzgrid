# Step 13: Phase 4 close (architect, 2026-10-22; owner decisions Q17)

Decisions: `decisions.md` Q17 (they win). Note: steps 9–12 and their reviews ARE committed (last `ef530ae`); STATUS's header may still say otherwise — rewrite it.

## Order
1. « aucune ligne »: `dom/src/tree/index.ts:89` joins `header.withSort` + `grid.noRows`. Test first, then a key `tree.empty` (« {name}, aucune ligne ») in `locales/{en,fr,ar}-tree` (not the base: 0 B in dom). Sheet `tree-lazy.md`, a11y §16.
2. Flaky tests, never skipped: `motion-expand-gaps.test.ts:169` own timeout 20 000; `tree-sticky-walk` tests 60 000 each (if a file > 30 s under load: fewer seeds in test:ci, the full count behind test:perm); the browser check « motion tree ar » waits on state (poll ≤ 4 s), not a fixed delay; a shared `SLOW_TEST_MS` in `packages/dom/test/support/`; review other files > 10 s.
3. Final review (reviewer + test analysis) of the step-13 diff, fixes tests first. Budgets after.
4. Sizes: `scripts/rebudget.mjs` (test first): per-entry ceilings = the owner's grants (Q17b) — today it would raise dom to 22 750, angular 6 950, dom/tree 4 100, dom/detail 4 200, core/detail 1 100, tree-lazy 1 600; its K.8 ceiling 85 000 → keep the profile guard at 83 500; the real example ceiling 90 000 (`scripts/example.mjs` K8, `perf/test/example-bytes.test.ts`, `perf/profiles/audit.ts` comment); `SIZE_COMMENT` shortened (rule + date + pointer to ROADMAP and decisions.md; move the Phase 4 history to ROADMAP "Final budgets (Phase 4)" before writing). Dry run, read, then `--write`. Pinned budget tests follow (motion-seam, parts-guards, rules, layering seam guard 26 984 + 1 257).
5. Speed: POSTPONED (Q17d). Time budgets unchanged; list the over-budget lines (17 old Node cold lines since `bc01afa`, "toggle near the end" 11.6/11.5) as pending in ROADMAP/STATUS with the Q17c rule for when the owner gives a quiet machine.
6. Version 0.2.0: packages to 0.2.0, peers ^0.2.0 (`scripts/test/release.test.ts` first), new subpaths (tree, tree-lazy, detail, locales -tree/-detail) in the dist package.json via `scripts/build.mjs`; `npm run pack:local`, inspect the 4 tarballs (no tests, playground, screenshots; 0 map problems); the example on the 0.2.0 tarballs.
7. Final gate, one command at a time, one browser at a time: build; test:ci; test:perm; typecheck; test:tz; check:size; check:contrast; test:browser (full); test:audit -- --full; node packages/angular/browser/run.mjs; example:build then example:bytes (≤ 90 000), example:csv, example:ssr, example:browser. No bench (Q17d).
8. Docs: README (status, entries with sizes); CHANGELOG `[0.2.0] - unreleased` (by area, Changed/breaking: RowNode union, ModelChange 'expand', variable heights, canSelect DataNode, filters() needs 3 new keys); ARCHITECTURE index « Décisions de la Phase 4 » + « Ajustements après la Phase 4 » + §5.2 (core 29 kB; tree/detail subpaths) + Phase 6 without tree and master/detail; ROADMAP « Phase 4 close », exit criteria table, « Reporté », final budgets; STATUS rewritten for a lost session (where we are, steps with commits, the owner's list, commands, rules); plan §5 « fermé le ».
9. Commit « release: 0.2.0 prepared », local tag v0.2.0, push main only; never npm publish.

## Exit criteria (§5)
1 sheets: met. 2 tree 100k/1M, row 999 999: met (Node 7.5/0.1/0.9 ms; Chrome 1M median 16.7). 3 filter property 1 000 seeds: met. 4 keys RTL, focus, ARIA, treegrid, axe fr/ar light/dark: met (forced colours checked by ButtonText, axe n/a there). 5 detail not selectable/exported, nested grid, LRU, 2 000 details: met; "not editable/pasteable" carried to Part D (editing does not exist yet). 6 uniform paint unchanged: tests met; bench lines pending (Q17d). 7 floating toggle: met. 8 spans/paging combinations: met. 9 lazy children 1 000 permutations: met. 10 budgets by written decision, gate, docs, listening §16–§18 scheduled (owner, non-blocking). 11 CHANGELOG 0.2.0 prepared, unpublished.

## After the close
Part D (editing) planning. Inputs: ARCH §3.10, K.14; Enter in an editor (`edit.enterMoves`); an edited row that disappears (rows move on `reapply()` only); animated save states (onCell hook, GSAP; an SVG moving border is a candidate); context for filter tests and sort (core API change, budget); edits changing a parent/path; not editable: details, fillers, loading rows (+ criterion 5's carried test); an editor in the tree column vs Left/Right; paste and selection with non-data rows; nested grids edit independently; `/editors` ≤ 8 kB; dom margin ~650 B, core ~760 B; real example margin ~3 kB (Q17a); listening §19; sheets before code.

## Risks
Code changes after sizes are measured (step 1–2 before 4; example:bytes after any core/dom/theme/angular change); `rebudget.mjs` wrong ceilings = silent raises (dry run first); 12–14 B margins (angular, dom/tree); example:build uses the network and the 0.2.0 tarballs; longer test timeouts can hide slowness (record times in ROADMAP); no screen-reader listening done yet — never call it "validated".

## Done: items 1, 2, 4 (2026-10-22, not committed)

**1. « aucune ligne ».** Test first (`packages/dom/test/tree-lazy-gaps.test.ts`: the sentence comes from `tree.empty` alone — a host bundle overriding `tree.empty`, `header.withSort` and `grid.noRows` hears only its `tree.empty`; en « Service 1, no rows », fr « Service 1, aucune ligne », ar from the bundle; 3 failing before). Key `tree.empty` in `locales/{en,fr,ar}-tree` (en « {name}, no rows », fr « {name}, aucune ligne », ar « {name}، لا توجد صفوف », raw characters, bytes checked), `TreeMessageKey` and `TREE_KEYS` (four keys; `tree()` refuses a bundle without it); `tree/index.ts` no longer joins `header.withSort` + `grid.noRows`. Base bundles 0 B. Sheet `tree-lazy.md`, a11y-protocol §16 step 95c (the playground's lazy mode declares « Patient 2 » of each service with no child, `playground/tree.ts`).

**2. Flaky tests (none skipped).** `packages/dom/test/support/slow.ts`: `SLOW_TEST_MS` 20 000 (loops of tens of grids), `WALK_TEST_MS` 60 000 (seeded tree walks). Given to `motion-expand-gaps` « opening: glides » (alone ~4 s), the five `tree-sticky-walk` walks (3.2–4.5 s each; the file ~19 s at 2 workers, under 30 s: no seeds moved to `test:perm`), the six seeded loops of `tree-sticky-gaps` (2–3.7 s) and `spans-groups-property` « keys » (4.3 s), all within 5 s of vitest's default before. Browser « motion tree ar/fr » (`scripts/browser.mjs`): after each key, waits on state — the focused row's `aria-expanded` turned and, on the motion page, a tween running with a row translated — polled each frame, at most 4 s (no fixed two frames); `--only motion` 3 runs: 50 / 50 each.
Files over 10 s (full suite, `--maxWorkers=2`, summed test times): `tzslot-agreement` 34.6 s (every wall minute of a year in 8 zones against tzslot; own 120 s timeouts; by design), `tree-sticky-walk` 18.8 s (fixed above), `tree-sticky-gaps` 18.5 s (fixed above), `filters-dates-gaps` 17.7 s (120 seeds through the real date widgets, one test 12.9 s; own 120 s timeouts), `tree-walk` 16.0 s (48 short tests, each ≤ 0.7 s: no risk), `detail-dom-walk` 15.1 s (12 walks ≤ 2.7 s: no risk), `filters-popup-walk` 14.8 s (own 60 s timeouts), `export-permutations` 14.7 s (200 seeds × 3, own 900 s timeout; 1 000 under `test:perm`). Other single tests near 5 s without a timeout, outside `packages/dom` (no shared constant there): core `clock-walk` 3.2 s, `relative` 2.9 s — watched, not changed.

**4. Sizes (Q17).** `scripts/rebudget.mjs` (tests first in `scripts/test/rebudget.test.ts`, 3 failing before): ceilings = the owner's grants (Q17b) plus `core/csv` 2 000 (Q7 « up to 2 000 »: the rule would have given 2 050), the plan's for the rest (`/server` 6 000, text bundles 2 000); K.8 profile guard 85 000 → 83 500; `SIZE_COMMENT` short (rule, date, pointer to ROADMAP « Final budgets (Phase 4) » and decisions.md Q17), the old `$comment` copied word for word into ROADMAP first. Real example ceiling 87 000 → 90 000 (Q17a): `scripts/example.mjs` `K8`, `perf/test/example-bytes.test.ts`, `perf/profiles/audit.ts`. `check:size` → dry run read (no budget above a grant) → `--write` → `check:size` 0 over. Pinned tests: `motion-seam` (motion run 3 150), `rules` (core/rules 550, pagination 3 550), `parts-guards` (comments), `layering` seam guard rebased to the close's 28 240. Time budgets untouched (Q17d), pending lines in ROADMAP.

| Entry | Old budget | Measure | New budget |
|---|---|---|---|
| `@dzgrid/core` | 29 000 | 28 240 | 29 000 — grant |
| `@dzgrid/core/server` | 6 000 | 5 925 | 6 000 — grant |
| `@dzgrid/core/spans` | 3 800 | 3 458 | 3 850 (raise) |
| `@dzgrid/core/csv` | 1 850 | 1 847 | 2 000 (raise) — grant |
| `@dzgrid/core/rules` | 600 | 492 | 550 (lower) |
| `@dzgrid/core/tree` | 3 500 | 3 371 | 3 500 — grant |
| `@dzgrid/core/tree-lazy` | 1 500 | 1 444 | 1 500 — grant |
| `@dzgrid/core/detail` | 1 000 | 994 | 1 000 — grant |
| `@dzgrid/dom/locales/en` | 600 | 519 | 600 |
| `@dzgrid/dom/locales/fr` | 700 | 636 | 700 |
| `@dzgrid/dom/locales/ar` | 950 | 825 | 950 |
| `@dzgrid/dom/locales/en-filters` | 800 | 745 | 850 (raise) |
| `@dzgrid/dom/locales/fr-filters` | 950 | 876 | 1 000 (raise) |
| `@dzgrid/dom/locales/ar-filters` | 1 050 | 997 | 1 100 (raise) |
| `@dzgrid/dom/locales/en-pagination` | 400 | 328 | 400 |
| `@dzgrid/dom/locales/fr-pagination` | 450 | 375 | 450 |
| `@dzgrid/dom/locales/ar-pagination` | 550 | 489 | 550 |
| `@dzgrid/dom/locales/en-export` | 250 | 216 | 250 |
| `@dzgrid/dom/locales/fr-export` | 300 | 248 | 300 |
| `@dzgrid/dom/locales/ar-export` | 350 | 296 | 350 |
| `@dzgrid/dom/locales/en-parts` | 150 | 98 | 150 |
| `@dzgrid/dom/locales/fr-parts` | 150 | 99 | 150 |
| `@dzgrid/dom/locales/ar-parts` | 150 | 108 | 150 |
| `@dzgrid/dom/locales/en-rules` | 200 | 148 | 200 |
| `@dzgrid/dom/locales/fr-rules` | 200 | 166 | 200 |
| `@dzgrid/dom/locales/ar-rules` | 250 | 192 | 250 |
| `@dzgrid/dom/locales/en-tree` | 200 | 162 | 200 |
| `@dzgrid/dom/locales/fr-tree` | 220 | 197 | 250 (raise) |
| `@dzgrid/dom/locales/ar-tree` | 250 | 266 | 300 (raise) |
| `@dzgrid/dom/locales/en-detail` | 150 | 133 | 150 |
| `@dzgrid/dom/locales/fr-detail` | 200 | 146 | 200 |
| `@dzgrid/dom/locales/ar-detail` | 200 | 159 | 200 |
| `@dzgrid/theme` | 2 500 | 2 268 | 2 500 |
| `@dzgrid/dom` | 21 300 | 20 648 | 21 300 — grant |
| `@dzgrid/dom/popup` | 1 650 | 1 472 | 1 650 |
| `@dzgrid/dom/spans` | 4 950 | 4 455 | 4 950 |
| `@dzgrid/dom/slots` | 1 400 | 1 246 | 1 400 |
| `@dzgrid/dom/search` | 1 450 | 1 298 | 1 450 |
| `@dzgrid/dom/pagination` | 3 500 | 3 211 | 3 550 (raise) |
| `@dzgrid/dom/export` | 1 350 | 1 200 | 1 350 |
| `@dzgrid/dom/export: run (lazy)` | 5 050 | 4 784 | 5 300 (raise) |
| `@dzgrid/dom/parts` | 700 | 595 | 700 |
| `@dzgrid/dom/rules` | 750 | 654 | 750 |
| `@dzgrid/dom/tree` | 3 700 | 3 664 | 3 700 — grant |
| `@dzgrid/dom/tree-lazy` | 1 000 | 938 | 1 000 — grant |
| `@dzgrid/dom/detail` | 3 900 | 3 815 | 3 900 — grant |
| `@dzgrid/dom/motion-gsap` | 700 | 593 | 700 |
| `@dzgrid/dom/motion-gsap: run (lazy)` | 2 900 | 2 854 | 3 150 (raise) |
| `@dzgrid/dom/internal` | 900 | 786 | 900 |
| `@dzgrid/dom/filters` | 10 000 | 9 876 | 10 000 — grant |
| `@dzgrid/dom/filters: set (lazy)` | 4 200 | 3 793 | 4 200 |
| `@dzgrid/dom/filters: date adapters (lazy)` | 2 600 | 2 320 | 2 600 |
| `profile: audit screen (K.8)` | 83 500 | 80 286 | 83 500 — grant |
| `@dzgrid/angular` | 6 250 | 6 238 | 6 250 — grant |

Gate (2026-10-22, one command at a time): `test:ci` 303 files, 4 839 tests; `test:perm` 2 files green; `typecheck`, `check:size` (0 over), `build`, `check:contrast` (176 pairs, 0 below) green. Browser `--only motion` 3 × 50 / 50. No bench (Q17d). Next: item 3 (final review of this diff), then 5–9.
