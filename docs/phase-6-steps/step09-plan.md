# Phase 6, step 9 (file `step09`; the phase plan numbers it 10): auto row height, `@dzgrid/dom/auto-height`

Architect blueprint, 2026-10-27. Plan only: no code, test, budget or config change. Wins over this file: `decisions.md` (Q-R1 A, Q-B), then `docs/behaviors/auto-height.md`, `virtual-scroll.md`, `master-detail.md`. Clean room: our own words, spike S3 (`spikes/s3-autoheight`) is our code. Sizes are estimates from reading; **build step 0: `build` + `check:size` on a quiet machine, numbers written here.**

## 0. Facts found
- `ColumnDef` has no `wrap`. `g.layoutFor?(d, h, was)` is one slot (`context.ts:107`); the detail feature sets it (`detail/index.ts:86`) and `delete`s it on destroy (`:276`). `rowLayout(g)` (`viewport.ts:30`) rebuilds only when rows, `h` or the `layoutFor` identity differ from `g.laid`; `g.laid = undefined` forces a rebuild (no base change needed to invalidate).
- The painter already anchors a re-laid layout (`viewport.ts:174-193`): same rows, `total` or the top row's offset changed gives `anchorNext='rows'`, then `scrollTo(offsetOf(shown.key) + min(shown.delta, heightOf))`, top and end special-cased, mapper rebuilt first (scaled scrolling). So the S3 anchor exists; what is missing is the order of events (see 2).
- `sparseRowLayout` (core/detail): extras = rows of their own height, `at` strictly increasing, O(D) sums per batch, O(log D) lookups, memory O(D). `setHeights` changes existing extras only; a new extra needs a **new layout**.
- Cells are absolutely positioned, fixed `inline-size`, row `block-size` set by `f.rowHeight(i)` (`rows.ts:351`): a mounted cell's own height is not its content height. Auto-size (`columns/size.ts`) solved the same problem: clone the cell, write all probes, one layout read, remove all.
- Tree: `insetFor` sums `layout.heightOf` of the ancestors under a half-view cap (`tree/index.ts:144`), so variable heights already flow in. Pinned bands: `bandHeights(top, bottom, view, h)` assumes rows `h` tall (`pinned-rows/band.ts:78`).
- `FrameScheduler`: a job scheduled during a flush waits for the next rAF (a whole frame late).

## 1. Heights: measure, cache, layout
- **Column**: `ColumnDef.wrap?: true` (core type, carried by the column model, +0-30 B core; core 29 001 / 29 150). The feature marks `wrap` cells (`dzg-wrap`: `white-space: normal; overflow-wrap: anywhere; block-size: auto` in `theme/columns.css` or a 3-rule inline style, decide at build by bytes). A fixed numeric `rowHeight` wins: feature inert, text clipped, no warning (choice 1). `rowHeight` read as `typeof settings.rowHeight === 'number'`.
- **Measure** (`auto-height/measure.ts`): per mounted data row with at least one wrap cell, not already valid in the cache, not holding an open editor (`data-dzg-owner=cell-widget` inside, see 5): clone each wrap cell, `inline-size` = its column width, `block-size:auto`, `position:absolute; visibility:hidden`, appended in the row's segment (same font, direction, padding). Write all probes, **one** read (`getBoundingClientRect().height`, ceil), remove all. Row height = `max(h, tallest probe)`; `h` = `g.rowHeight()` (density floor, >= 24). Other cells keep one line. Full-width rows measured as one cell; a tall merged (span) cell is not measured (spans refuse details already). Never a read between writes of a paint.
- **Cache**: `Map<RowKey, {h, w}>`, `w` = a width epoch (bumped by column widths / visible set / order / dir / lang / density / text size via `g.remPx`). A row is valid when `w` matches; **a changed row's data or a width epoch drop the entry** (forgotten, never guessed from an old width). Entries of rows no longer in `g.rows` are deleted at each rebuild (as detail does). Rows scrolled away keep their entry until an epoch bump (re-measure on return would jump).
- **Layout**: `layoutFor` returns `sparseRowLayout(d, h, extras)` where extras = cached rows with `height > h` (rows measured at `h` need no extra: memory O(tall rows)), indices found with `d.indexOf(key)`, sorted. A new tall row means a new layout: the feature sets `g.laid = undefined` and asks a repaint. Cost O(cache) per rebuild; fine to 10 000, the reason for the warning above it.
- **Warning**: displayed count > 10 000 with a wrap column: one `problems` event, code `auto-height-large`, path `columns.<id>.wrap` (via `emit(kernel, ...)` as detail does), once per grid; works anyway.
- **Triggers** (all just bump the epoch or drop keys, then `g.schedule()`): rows update (`rowsChanged` path through `displayed` identity; per-key drop on `update`/edit saved), column widths (`columnResized`, flex, auto-size), columns shown/hidden/moved (visible set), lang/dir (grid options), density / `rowHeight` / text size (`g.remPx`, `g.rowHeight()` change: `h` differs, cache kept by key but extras refiltered, epoch bumped), fonts (`document.fonts` `loadingdone`, one listener, optional: 25 B, drop if over budget).

## 2. No jump (spike S3, exit criterion)
Order inside one frame (the spike's `read` mode, 0 px at 10 000 in three engines):
1. paint (write): rows mount with the estimate (`h`) or the cached height; `afterRows` of the feature lists the mounted rows lacking a valid entry.
2. **frame tail, after all writes of the pass**: probes, one layout read, cache filled, `g.laid = undefined`, `g.again = true`.
3. the painter sees `g.again`, re-runs its **body step** (layout, anchor, window, rows) in the same frame, up to 3 passes (the spike used 6 and needed 2), then the browser paints once. The anchor is the existing one: top row by key + distance into it, end anchor when at the bottom, top stays top; scaled scrolling (`mapper`) is rebuilt before `scrollTo`, so past the browser height limit the anchor works on logical offsets.
- Why not the next rAF: a frame of estimated positions would be painted (flash and shift). Why not a layout read in `afterRows` mid-pass: that is the forbidden read-during-writes. The tail runs after the last write and before the next pass, once per pass: **reads per paint <= passes, never inside a write sequence** (test below).
- ResizeObserver is not used (sheet 4 reads once per frame; an RO callback is a frame late). Late changes (a font loading, an image in a part) enter by the triggers above.
- Keys: PageDown/PageUp use `viewBlock` over `layout.indexAt`, already variable-safe; a row taller than the view: `reveal`/`focus.ts:100` scrolls to its top (test: PageDown never stuck). `ensureVisible` of the focused row after a measure: existing `g.reveal` path of `rowHeight` change (viewport `keep` branch) is reused by the relaid anchor (2.4.11).

## 3. The base seam (small)
1. **Chain `layoutFor`** (0 B if by convention): each feature reads `const prev = g.layoutFor` at setup, sets its own function that calls `prev(d, h, was)` for the inner layout, and on destroy sets `g.layoutFor = prev` (not `delete`). Needs (a) destroy order last-in-first-out: **check `grid.ts`; if not, reverse it (~10 B)**; (b) detail's `destroy` changed from `delete` to restore (edit in `detail/index.ts`, ~0 net); (c) auto-height wraps *outside* detail: its function gets the inner layout, reads `inner.extras` (new optional field of `SparseLayout`: `{at, heights}`, ~40 B in `core/detail`, check that line's cap), merges them with its tall data rows (two sorted arrays, a data row and a detail row are never the same index: details are their own rows), builds one `sparseRowLayout`. `was` passed down unchanged (detail reads `was.heightOf(i)` for its panels: works on the merged layout, keys not indices).
2. **Repaint pass** (`g.again`, base, ~60-90 B): `createPainter`'s body step loops while the feature asked, max 3. Optional field on `GridContext`.
3. **Missing-feature warning** (behaviour 1): in `grid.ts` where `rowHeightProblems` is told at creation, ~50-60 B base: `columns.some(wrap) && !features.some(auto-height)` gives `missing-feature` once. If the K.8 line cannot take it, the lever is to drop this warning (docs only), see questions.
- Base total estimate **+110-170** (dom base 21 954 / 22 400 leaves 446: fine). **K.8 profile 83 921 / 84 000: only 79 B left**, so +110-170 base bytes overshoot by 30-90 B. Levers in order: drop the warning (3), compress the pass loop, ask Q9-3.
- Alternative if the owner refuses any base byte (Q-B option C): auto height without details (feature alone, `layoutFor` free), details win when both are listed, told once. Cheaper, but breaks Q-R1 A.

## 4. Tests to write FIRST (they must fail before the code)
Pure layout logic (core-free, in `dom/src/auto-height/layout.ts`, mutated):
- `auto-height-layout.test.ts`: `extrasOf(d, cache, h, innerExtras)`: only heights > h become extras; sorted strictly increasing; indices follow a sort/filter (key to index); merge with detail extras keeps both, none lost, none doubled; a key gone from the rows is dropped; empty cache gives the uniform layout (`uniform` stays true is not required, `total = count*h`); heights `NaN`/negative never enter. Conformance `conformance/cases/layout-rows/auto-*` (hand-written: mixed heights, offsets, `indexAt` at every boundary, end).
- Mutants (copy of the repo, pure logic only): `>` to `>=` in the extras filter; merge drops the inner extras; unsorted merge; epoch not bumped on width; cache keeps removed keys; `max(h, ...)` to `tallest` (floor lost); `rowHeight` number not winning; warning threshold `>` to `>=` (10 000 exactly: no warning, 10 001: one warning, once not twice).
- Anchor logic: the existing `shown/relaid` code is already mutation-tested; add a test that growing rows above the top row keep `scrollTop - offsetOf(top)` equal, growing the top row itself keeps its top, at-end stays at end.
jsdom (stubbed geometry, a fake `measure` returning heights per text):
- `auto-height.test.ts`: `rowHeight: 40` plus `wrap` = no measure at all (spy 0 reads), no warning; `wrap` without the feature = one `missing-feature`; probes written then **one** read then removed (geometry spy: reads per pass = 1, none between two writes); at most 3 passes; floor 24 px; no upper cap; epochs: resize, hide column, `lang`, `dir`, density, `rowHeight` removal, `update` of one row each re-measure only what changed; unmounted rows not measured; a row in the cache is not measured again on return.
- `auto-height-detail.test.ts`: detail + wrap in both feature orders and both destroy orders: detail panel keeps its own measured height, the master is measured, `layoutFor` restored to the previous one, a rebuilt layout after `rowExpanded` keeps both; destroy of either leaves the other working.
- `auto-height-tree.test.ts`: sticky parents copy a wrapped parent's height, capped at half the view; `insetFor` with variable heights.
- `auto-height-edit.test.ts`: a row with an open editor is not measured; commit that makes the text longer re-measures and the row grows, the anchor stays; a cancelled edit re-measures nothing; undo re-measures.
- `auto-height-keys.test.ts`: PageDown over variable rows; a row taller than the view (focus to its top, PageDown past it).
- Plus `size.test`: `COLUMNS`-style check that `ColumnState` / `GridState` ignore `wrap` (not user state).

## 5. Behaviour decisions closing the sheet's gaps
- **Pinned bands**: sheet says measured. `bandHeights` assumes uniform `h` and the bands are capped at half the view; making them per-row costs `pinned-rows` bytes (2 000 grant is nearly spent). Recommendation: **bands keep the normal row height this step** (wrapped text clipped, full text in the cell tooltip), documented; Q9-1.
- **RTL / Arabic**: probes inherit `dir`, font, letter-spacing from the row's segment; `overflow-wrap:anywhere` (not `break-word`, so min-content is small in flex/measure); Arabic has no word breaks inside letters, joining must not break: only whitespace and `anywhere` opportunities. Whole pixels rounded up.
- **Editing**: an editor in a cell keeps the row's current height (not measured while open, its input is not the text). Save / cancel / undo / external update drop the key and re-measure in the tail pass, anchored.
- **Scaled scrolling** (> ~125 000 rows): extras only for measured rows, `total` = estimate + extras; the mapper is rebuilt on every layout change (existing path), so the end stays exact; test at 1 M rows that the end row is reachable and a measured top row does not move.
- **Sticky tree parents**: copies take the layout height; the half-view cap stays (existing).
- Header labels never wrap (choice 3); no max height (choice 2).

## 6. Browser checks (one browser at a time, closed after)
- `npm run test:browser -- --only auto-height` (Chrome headless; new scenario file beside `detail`): HR-like data with wrapped long titles, fr and ar; scroll down, jump to the middle, jump up, to the end, 120x40 and 40x400 px steps (S3's four scenarios): max screen displacement of any visible row between frames **0 px at 10 000 rows** (tolerance 0.5 px); narrow and widen a column; zoom text; density change; detail open on a wrapped master; tree with wrapped parents; focus kept in view after a measure.
- **1 M rows with the warning**: one `auto-height-large`, scroll to the end reachable, 60 fps bench not worse (`bench:browser` is not to be run before Q17d quiet-machine measure: use the scenario's own frame count), memory of the cache bounded by the visited rows.
- Firefox and WebKit (Playwright engines already used for S2/S3): Arabic wrapping and `overflow-wrap:anywhere`, jump 0 px at 10 000, <= 1.5 px at 100 000 in Firefox (S3 figure), RTL sticky columns beside a growing row. Arabic wrap in jsdom proves nothing; this is the only real check.
- Demo: `hr.html` titles wrapped (`?wrap=1`), `?locale=ar-DZ`.

## 7. Sizes
| Entry | Now | Cap | Estimate | Plan |
|---|---|---|---|---|
| `dom/auto-height` (new) | 0 | **1 400** (Q-B) | measure+probes 450, extras/merge/layout 350, cache+epochs+triggers 300, warning 70, wrap class/CSS 100, tail pass glue 80 = 1 350 | 1 400, hold the line; levers: drop `loadingdone`, drop `missing-feature` |
| dom base | 21 954 | 22 400 | +110-170 | within |
| core | 29 001 | 29 150 | +0-30 (`wrap` on the def) | within |
| `core/detail` | measure | measure | +40 (`extras` field) | check cap, ask only if over |
| K.8 profile | 83 921 | 84 000 | +110-170 base | **over by 30-90: Q9-3** |
| real example | measure | 94 500 | base growth lands here too | check |
Theme: `wrap` rules inside `columns.css` (1 100 line) if they fit, else 3 inline rules in the feature.

## 8. Risks
- R1 (high) **Tail pass inside the painter**: re-entrancy of the body step, scroll events fired by `scrollTo` between passes, focus restore. Mitigation: guard depth 3, no scroll event handling inside (flag), tests with a geometry stub that counts reads and writes in order.
- R2 `layoutFor` chaining: destroy order, `was` shape, two features restoring each other wrongly. Mitigation: tests in all orders; fallback: `g.layoutFor` becomes a base list (+40 B).
- R3 K.8 margin (79 B). R4 cost O(cache) per rebuild at 100 000 wrapped rows (Firefox S3: still <= 1.5 px but the cost per frame is not measured: add a `console.time`-free count test and measure in the browser run). R5 clone-measure misses a part's own sizing (badges): cells with parts are measured by cloning too, a part that sets heights from JS is wrong by design (documented). R6 fonts loading after measure: handled by `loadingdone` (drop if over budget; then documented). R7 `max(h, ...)` hides shrink below the density; intended. R8 bands clipped (Q9-1). R9 `ColumnDef.wrap` on a hidden/virtual column: only visible columns are measured; a column shown later bumps the epoch.

## 9. Order of work
0 measure sizes; 1 tests of the pure extras/merge and conformance cases (red); 2 `extras` + `ColumnDef.wrap`; 3 `layout.ts`; 4 base: `g.again` loop, then chain restore in detail (tests red first); 5 `measure.ts` + feature; 6 jsdom suites above; 7 mutants on the pure logic; 8 review + test analysis; 9 browser `--only auto-height`, 1 M, Firefox/WebKit; 10 behaviour sheet "Done", STATUS and this file's "Done".

## 10. Questions for the owner (français simple)
**Q9-1. Les lignes épinglées (haut et bas) avec du texte long.**
- A (recommandé) : elles gardent la hauteur normale ; le texte long y est coupé (on le lit dans l'infobulle). Rien à ajouter au budget des lignes épinglées.
- B : elles grandissent aussi (comme la fiche le dit), mais il faut réécrire le calcul des bandes : environ +200 o dans `pinned-rows`, qui est presque plein.
- C : comme A pour l'instant, et B plus tard si une application le demande.

**Q9-2. Quand mesurer, pour ne jamais voir de saut.**
- A (recommandé) : on mesure à la fin de l'image en cours, juste après avoir dessiné, puis on redessine tout de suite (deux ou trois passes au plus) ; l'écran ne montre que le résultat final. Une petite exception à la règle « jamais de lecture pendant les écritures » (la lecture vient après toutes les écritures).
- B : on mesure à l'image suivante (règle respectée à la lettre) ; mais on voit une image avec les hauteurs estimées, donc un léger saut : ne tient pas le critère de sortie.
- C : on observe les tailles avec un observateur du navigateur : même défaut que B, plus de code.

**Q9-3. La marge du profil K.8 (79 o restants, le socle grandit de 110 à 170 o).**
- A (recommandé) : monter K.8 de 84 000 à 84 150 (une décision écrite de ta part), on garde l'avertissement « fonction absente ».
- B : on ne monte rien : on retire l'avertissement « `wrap` sans la fonction » (seulement dans la doc) et on resserre le code ; il peut manquer 0 à 40 o, on revient te voir si c'est le cas.
- C : pas de hauteur automatique avec les panneaux de détail (la fonction reste seule) : socle quasi intact, mais ce n'est plus la décision Q-R1 A.

**Q9-4. Les polices qui arrivent après la mesure.**
- A (recommandé) : on remesure une fois quand le navigateur dit que les polices sont chargées (~25 o).
- B : on ne fait rien et on le dit dans la doc (l'application attend ses polices).

## Done (2026-10-27, implementer; not committed, no review yet)

**Built.** `ColumnDef.wrap?: boolean` (core type, 0 B; `AutoHeightProblemCode` a type only). New entry
`@dzgrid/dom/auto-height` (`autoHeight()`, no options): `auto-height/layout.ts` (`extrasOf`, pure: measured rows taller
than `h`, by key, merged with a panel's extras) and `auto-height/index.ts` (the measure in `g.again`, the cache by key
with a text hash, the signature of widths / row height / direction / language, `loadingdone`, the warning, the wrap
look injected once). Base: `GridContext.again` and the job's loop (`grid.ts`: three extra passes, a fourth → next
frame), `missing-feature` for `wrap` without the feature, cells' `data-wrap` and the layout rule
(`.dzg-body` / `.dzg-sticky` only: the pinned bands keep one line, Q9-1), a row's `block-size` rewritten before the
« same row » shortcut (a re-layout of the same data), and the painter's anchor taken from the row at the view's top
**now** (a scroll since the last paint, or one written just before the frame and read off the frame's box). Detail's
destroy sets `layoutFor = undefined`. Demo `playground/auto-height.html` (+ 3 links in `index.html`); browser group
`scripts/browser-auto-height.mjs` (`--only auto-height`).

**Plan changes (as built).**
- §3.1 chain: not a convention plus LIFO destroy, but an accessor: `autoHeight()` defines `g.layoutFor` as a getter
  (its own function, always outermost) and a setter (the inner one: detail's, set before or after it, or `undefined`
  when detail goes). No `grid.ts` destroy-order change, no `SparseLayout.extras` field (`core/detail` 0 B): the panels'
  extras are read from `DetailRows.details` and the inner layout's `heightOf`.
- §1 wrap look: not in `theme/columns.css` but injected by the feature (`style[data-dzgrid-wrap]`, unlayered, over the
  theme's one-line `line-height`; `--dzg-wrap-line`), so the K.8 profile and the theme carry none of it.
- §1 triggers: heights depend on the wrapped columns' widths only; a non-wrapped column moved, shown or hidden measures
  nothing (the jsdom test says so). Data changes are found by a hash of the wrapped cells' text, which also covers an
  edit saved or undone (not the row data alone).
- §5 tree: the copies' count cap stays (plan); a single parent taller than half the view is pinned whole. A pixel cap
  (outermost copies dropped) was built and measured: `@dzgrid/dom/tree` 3 835 / 3 800 (+40): reverted, **question for
  the owner** (Q9-5 below).
- §2: the painter fix above (not foreseen): S3's scenarios « jump, then up » failed in Chrome (a row moved by the whole
  step) because a re-layout in the frame after a scroll anchored on the previous paint's top row.
- `detail-ssr.test.ts`' guard « nothing else imports core/detail » now lists the auto-height entry (its sparse layout).

**Tests that failed first** (each run red before its code): `auto-height-layout.test.ts` 6 / 6 (module missing, then the
stub's empty extras); conformance `layout-rows/auto-mixed-heights`, `auto-with-details` (`auto-empty` passed on the
stub: it is the empty case); `auto-height.test.ts` 16 of 18 (« the feature taken away » and « at the end it stays at the end » held on the stub);
`auto-height-detail.test.ts` 6 of 11 (the « taken away » cases passed on the stub); `auto-height-tree.test.ts` 2 / 2;
`auto-height-edit.test.ts` 2 / 2; `auto-height-keys.test.ts` 1 of 2 (PageDown over measured rows passed: the base
already pages over variable layouts); the K.8 guard at 84 150 in `motion-seam`, `spans-collapse`, `rebudget.test.ts`
(3) and the new `@dzgrid/dom/auto-height` line test. Later: « rows laid out again after the user scrolled » (red on
part 1 without the anchor refresh, on part 2 without the frame's scroll read); the browser's S3 « jump then up »
scenarios (red, 40 / 100 / 120 px = the step) before the painter fix.

**Sizes** (`check:size`, Node 24): `dom/auto-height` 1 195 / 1 400; DOM base 22 193 / 22 400 (+239: painter ~108,
`grid.ts` ~94, layout CSS ~31, cells ~12); core 28 999 / 29 150; `core/detail` 1 010 / 1 050 (untouched); `dom/detail`
4 089 / 4 150; `dom/tree` 3 795 / 3 800 (untouched); theme 2 527 (unchanged); K.8 84 118 / 84 150 (Q9-3, test first).
**STOP: `@dzgrid/dom/pinned-rows` 2 165 / 2 150, pushed over by compression alone** (measured over the DOM base; its
source is untouched; 2 145 before): not raised, to the owner.

**Gate** (once, `caffeinate -i`, 2 workers, Node 24): vitest 462 files / 7 045 tests green (236 s); `test:perm` 5 files / 10 tests (152 s); `typecheck`; `build`; `check:contrast` 1 086 pairs / 0 below; `check:size` 110 ok, **1 over: `@dzgrid/dom/pinned-rows` 2 165 / 2 150 (compression alone, Q9-6)**. Browser `--only playground` 41 / 41 (index links).

**Browser** (one headless browser at a time): `--only auto-height` Chrome 33 / 33 (fr and ar: every wrapped cell fits,
short rows 32 px, the panel under its master; « Remarques » 180 / 520 px and the density: the top row held; 40 × Down
in view; axe 0; S3's four scenarios at 10 000 rows ≤ 0.5 px; a million rows: wheel, jump, wheel up ≤ 0.5 px, Ctrl+End
on « Patient 999999 », one `auto-height-large`; 5 000: none), Firefox 14 / 14 (Arabic: fit, `normal anywhere`, the
scenarios at 10 000 ≤ 0.5 px and at 100 000 ≤ 1.5 px), WebKit 8 / 8 (Arabic: fit, the 10 000-row scenarios ≤ 0.5 px).

**Demo.** `http://127.0.0.1:4700/auto-height.html` — scroll down and up, jump to the middle or the end (the top row
never jumps), drag the « Remarques » edge narrower / wider, change the density; « Patient 0 » open with its panel;
`?lang=ar&theme=dark`; `?rows=1000000` prints the developer warning below the grid once.

**For the reviewer (mutants, pure logic):** `extrasOf` (`>` / `>=`, the `< 1/0` guard, the merge order and the
same-index rule), the cache signature and the `heights.get(key) ?? h` comparison, `n++ < 3`, `LARGE` `>`.

**Q9-5 (pour le propriétaire).** Arbre : un parent épinglé plus haut que la moitié de la vue (texte long) est épinglé
entier. A : on le laisse (documenté) ; B : on retire les copies les plus extérieures dès qu'elles dépassent la moitié de
la vue en pixels (+≈ 40 o dans `@dzgrid/dom/tree`, ligne 3 800 à monter à ≈ 3 850).
**Q9-6 (pour le propriétaire).** `@dzgrid/dom/pinned-rows` passe de 2 145 à 2 165 o pour une ligne de 2 150, par la seule
compression (le socle a grandi, ses sources n'ont pas changé). A : monter la ligne à 2 200 (plafond 2 300 déjà accordé,
Q2) ; B : chercher 15 o dans `pinned-rows`.

**After the owner's Q9-5 B / Q9-6 A (2026-10-27).** Tests first (red: the tree test, the sticky oracle's property test,
`rebudget.test.ts` 3 + a new one): the pixel cap put back (`stickyStack` drops the outermost copies beyond half the
view, `insetFor` the same), `@dzgrid/dom/tree` 3 835 / 3 850, `@dzgrid/dom/pinned-rows` 2 165 / 2 200; tree-sticky.md
updated. `check:size` 0 over; targeted tree / pinned / auto-height / budget tests green; `--only tree` Chrome 72 / 72;
vitest once (2 workers) 462 files / 7 046 tests green.
