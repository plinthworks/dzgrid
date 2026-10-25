# Phase 5, step 12 — the fill handle (own entry), Ctrl+D / Ctrl+R, bulk edit, dataset B — blueprint (architect, 2026-10-25)

Status: **to validate with the owner** (questions S12-Q1 to S12-Q7 at the end, in French). Sources, which win in this
order: `decisions.md` (Q9 « refused cells skipped and counted », Q11, S3-O2, S5-O5, S9-Q6, S9-Q7, QB5, QB7, QB8,
S11-Q5 « the fill handle in its own entry », S11-Q6, S11b-Q2, S11b-Q3); `partB-plan.md` B5, B8, B12, B13, B15, step 12,
§4, PB2–PB7, PB10–PB13; the sheets `fill.md` (cited `F n`), `range-selection.md` (`RS n`), `clipboard.md` (`CB n`),
`editing.md` 19, a11y §20; `step10-plan.md`, `step11a-plan.md`, `step11b-plan.md` (Done / Review). Code read:
`core/src/range/{box,fill,paste,copy}.ts`, `core/src/edit/controller.ts` (`commit`, `check`), `dom/src/range/{index,
pointer,clip}.ts`, `dom/src/editors/index.ts` (`end`, `keys`), `dom/src/edit/index.ts` (`EditApi`), `dom/src/features.ts`,
`dom/src/context.ts`, `angular/src/{grid,controller}.ts`, `scripts/size.mjs`, `perf/dataset.ts`, `playground/demos/
orders-edit.ts`. Clean room: spreadsheets' public docs (drag the corner square, Ctrl held swaps copy and series, fill
down / right, Ctrl+Enter fills a selection), WCAG 2.2 (2.1.1, 2.5.7, 2.5.8, 4.1.3), Pointer Events (`pointerType`,
`touch-action`); never another grid's or spreadsheet's code (`node_modules` included).

## Findings (code read at the step-11b working tree)
1. **The pure part is done**: `fillTarget(src, to)` (one axis, ties to rows, inside → null) and `planFill(src, target,
   way, displayed, columns, { ctx, reader, mode: 'auto' | 'copy', swap })` → `PlannedCell[]` with `{ value }` inputs,
   data rows only, rounding, backwards (33 conformance cases, oracle property tests). Bulk = `planPaste([[input]], box)`
   (fill.md 9; an emptied field plans clears, step-10 review). **`core/range` does not change.**
2. **`dom/range` is full** (4 796 / 4 800, S11b-Q3 ceiling) and its pointer helpers (`hit`, `place`, `step`) are closure
   locals of `pointer()`. Nothing in it can grow. `RangeApi` gives `get`, `set` (source `api`: not said, focus
   untouched), `box`; enough for a second feature to read and set the block. `range.api(grid)` needs the feature
   object: the fill feature takes it (`fill(blocks)`).
3. **`size.mjs` `over`** measures `bundle(base + entry) − bundle(base)`: a module shared with `@dzgrid/dom/range` costs
   0 B in a fill entry measured `over: "@dzgrid/dom/range"`.
4. **The edit layer takes a fill as it is**: `commit(cells, { origin: 'fill' | 'bulk' })` = one generation, one
   request, one undo batch; `refused` with `read-only` for structure columns, non-data rows, non-editable cells.
   `EditApi` (dom/edit, 4 146 / 4 150, full) exposes `commit` but **not** `check` (the controller has it).
5. **Sentence collision** (11b finding 3): « Enregistrement en cours » comes from a microtask inside `commit`; 11b's
   `write` joins the range sentence after it via `g.live.said` and its own microtask. The fill entry needs the same
   (≈ 120 B, duplicated: 11b's `write` is a closure).
6. **Keys**: the router asks features in order before `intentFor`. `editors.keys` takes only `plain` keys on a cell
   (no Ctrl, Alt, Meta, Shift), so Ctrl+D, Ctrl+R, Ctrl+Shift+Enter reach a later feature. In an open field it runs
   `end()` for `plain` keys only: **Ctrl+Enter today falls through and does nothing** — the QB5 hand-off is one branch
   there. `range.keys` takes Escape whenever a block exists (drops it): a keyboard fill mode must be asked **before**
   range (a head handle, as range's own Delete `head`).
7. **The pointer**: range's `pointerdown` is on `el.body` (mouse only; pen and touch scroll, 11a review 2) and drops
   the block on a press without Shift. A handle element inside the body gets the event first (target phase):
   `stopPropagation` there keeps the block.
8. **Texts and styles are full**: `ar-range` 500 / 500, `range.css` 438 / 500 gz (handle + target outline + forced
   colours ≈ 120–180 B more).
9. **Dataset B does not exist** (`perf/dataset.ts`: A only); no `perf/profiles/stock.ts`.
10. Angular: `DzgController.edit()` finds a feature by `id` in `[features]`; outputs are `output<Ev<T, …>>()` lines;
    no range wiring yet (6 743 / 6 793, S9-Q6 rule ≤ 7 000).

## Lead decisions (into the sheets in this step's first change, before code)
- **D1 the entry** (S11-Q5, QB8; size S12-Q1): `@dzgrid/dom/fill`, `fill(blocks: RangeFeature, o?: FillFeatureOptions)`,
  measured `over: "@dzgrid/dom/range"`. Listed after `range()` in `features`. It owns the handle, its drag, the
  keyboard fill mode, Ctrl/Cmd+D, Ctrl/Cmd+R, the bulk seam and its API. Without `fill()`: no handle, Ctrl+D / R are
  the browser's, Ctrl+Enter in a field = Enter (sheet line). Texts `locales/{en,fr,ar}-fill`, styles
  `@dzgrid/theme/fill.css` (S12-Q4). Import graph: fill → core/range, dom/range (types + `RangeApi`), dom/internal;
  never `/editors`, `/edit` at run time (types only); the base never imports it.
- **D2 shared geometry**: move `hit` / `place` / the auto-scroll frame out of `pointer()` into
  `dom/src/range/geom.ts` (`cellAt(g, p)`, `autoScroll(g, p)`), used by both. **Gate**: `dom/range` re-measured, must
  stay ≤ 4 800 (shared code often minifies the same); over → revert, duplicate a reduced copy in the fill entry
  (≈ +250 B there, counted in its line). No behaviour change in 11a (its tests unchanged and green).
- **D3 the handle** (F1–F2): one `<span class="dzg-fill" aria-hidden="true">` per grid, **a child of the corner cell**
  (bottom data row × end column of the block, else the focused data cell), re-appended in the fill's `afterRows`
  (after cells and range classes are written; pooled rows, pinned columns, sticky parents, scaled scroll for free; no
  layout read). Drawn 8 × 8 px at the cell's `inset-inline-end` / `inset-block-end` corner (bottom-left in RTL), hit
  area 24 × 24 px inside the cell (2.5.8). Not drawn: field open (`g.editor`), no `edit()`, corner cell not mounted (a
  span-covered cell, scrolled away), on the tree's pinned copies (`spawned`), on a detail / filler / loading row,
  during a block drag (`[data-dzg-ranging]`), on `(any-pointer: fine)` absent (S12-Q3). Never in a cell's text:
  copy, tooltip overflow and accessible name ignore it (tests).
- **D4 the drag** (F3–F7): handle `pointerdown` (primary button; `mouse` or `pen`, S12-Q3) → `stopPropagation`,
  `preventDefault`, capture; source = the block's box (or the focused cell) at press time, **by keys**; each move →
  `cellAt` → `fillTarget(src, to)`; the target painted (`dzg-cell--fill` + logical edge classes, dashed) through the
  same `afterRows`; auto-scroll as the block drag; release → `planFill(…, { swap: ctrlKey || metaKey at release })` →
  one commit, origin `fill`; then the block = source ∪ target (`RangeApi.set`, event source `api` — a known
  limitation, dom/range full; sheet line); focus not moved. Release inside the source → nothing, silent. Escape,
  `pointercancel`, lost capture, blur, a sort/filter/model change during the drag → cancelled, target cleared, nothing
  written (Escape says « Recopie annulée »). The click after the release is swallowed once; `dblclick` on the handle
  stopped (no editor; Excel's « double-click to fill down » not in this phase).
- **D5 the keyboard fill mode** (WCAG 2.1.1, the series too; S12-Q2): on a cell with a block or a focused data cell,
  **Ctrl/Cmd+Shift+Enter** enters the mode, said « Recopie : flèches pour étendre, Entrée pour écrire, Échap pour
  annuler ». In the mode a virtual pointer cell starts at the source's bottom-end corner; the arrows move it (by the
  grid's own `intentFor` for the key without Shift, so mirrored in RTL); target = `fillTarget(src, virtual)` — **the
  same function as the drag**; its size said after the 400 ms pause (« Vers le bas : 3 lignes »). Enter writes
  (auto), Ctrl/Cmd+Enter writes swapped, Escape cancels (said), Tab / a click / a blur / a sort cancel quietly; any
  other key is swallowed while the mode is on. Focus stays on the source corner (nothing read but the sentences).
  Taken by a **head** handle put before range's `head` (Escape must not drop the block).
- **D6 Ctrl/Cmd+D, Ctrl/Cmd+R** (F8, a11y 132, S12-Q6): owner `cell`, no field open, `edit()` present. Block of ≥ 2
  rows: Ctrl+D copies its first data row into the others (`planFill(firstRow, rest, 'down', { mode: 'copy' })`). Block
  of ≥ 2 columns: Ctrl+R copies its first column toward the end. One cell, or a one-row block (Ctrl+D) / one-column
  block (Ctrl+R): the previous data row / previous visible column copied into it (S12-Q6 A). Nothing to copy from (first
  row, first column, a detail above with no data row above it) → key **not taken** (the browser's). Taken → prevented
  (bookmark / reload dialogs) — whether a real browser still opens its dialog is the owner's headed check (132).
- **D7 bulk** (QB5, F9–F10; S12-Q5): `/editors` `end()` gains `Ctrl/Cmd+Enter` (no Alt, no Shift): if `g.bulk?.(at,
  input)` returns a result, the field closes on its cell (never moves, even with `enterMoves: 'down'`: Excel's
  Ctrl+Enter stays) — refused own cell keeps it open with its reason (Q9); else Ctrl+Enter = Enter **without the move**.
  `g.bulk` is a `GridContext` optional field (type only in the base, 0 B) set by `fill()`'s setup, deleted at
  destroy. It plans `planPaste([[input]], blockBox)` when the field's cell is inside the block (else returns null),
  `input` undefined (field unchanged) → the cell's shown value `{ value }`; one commit, origin `bulk`. `api.apply(input)`
  does the same from the app (block required; null without one).
- **D8 one sentence per gesture** (B8): `fill.filled` « Cellules recopiées : {n} », `fill.bulk` « Cellules modifiées :
  {n} », plus range's `range.refused` / `range.readOnly` parts, joined with « Enregistrement en cours » (11b's
  microtask rule, duplicated). Mode texts: `fill.mode`, `fill.down|up|end|start` (« Vers le bas : {rows} »…, reusing
  `range.rows` / `range.cols`), `fill.cancel`. ≈ 9 texts.
- **D9 trees, details, nested, spans, server** (B13): rows shown only; structure columns refused `read-only` and
  counted; details / fillers / loading rows stepped over (planFill); a nested grid has its own handle, the outer one is
  never drawn in a panel; a span-covered corner cell → no handle; server pages: `cellAt` clamps to the rows held, a page
  change cancels a drag / mode; a fill on a sorted / filtered column marks the order stale (K.14).

## API
```ts
// @dzgrid/dom/fill
export function fill(blocks: RangeFeature, o?: FillFeatureOptions): FillFeature;
export interface FillFeatureOptions {
  /** The handle drawn and dragged (mouse, pen); false: the keys and the API only. Default true. */
  readonly handle?: boolean;
}
export interface FillCounts { readonly filled: number; readonly refused: number; readonly readOnly: number }
export interface FillApi {
  /** As a drop of the handle on `to` (by keys; `swap` = Ctrl held); null: no block / focus, `to` inside, or not shown. */
  fill(to: CellAddr, o?: { readonly swap?: boolean }): FillCounts | null;
  /** As Ctrl+D / Ctrl+R; null when the key would not be taken. */
  down(): FillCounts | null;
  end(): FillCounts | null;
  /** Bulk (QB5): one input in every cell of the block, origin `bulk`; null without a block. */
  apply(input: CellInput): FillCounts | null;
}
export interface FillFeature extends GridFeature { api(grid: { readonly kernel: GridKernel<any, any> }): FillApi | null }
export const FILL_KEYS: readonly FillMessageKey[];
// base (types only): GridContext.bulk?: (at: CellAddr, input: CellInput | undefined) => { readonly own?: string } | null
// texts: EN_FILL / FR_FILL / AR_FILL in @dzgrid/dom/locales/<lang>-fill; styles @dzgrid/theme/fill.css (+ unlayered, scss)
```
Problems (never a throw): `fill(blocks)` without a range feature → `missing-feature`; API cells not shown →
`unknown-row-id` / `unknown-column` (as `RangeApi.set`); missing texts → `TypeError` at setup (as range).

Angular (B15): `DzgController.range(): RangeApi | null`, `DzgController.fill(): FillApi | null` (found by id in
`[features]`, as `edit()`); outputs `(rangeChanged)`, `(rangeCopied)`. No new input; no `[(range)]`. Fill writes come as
the existing `(cellEdited)` / `(saveFailed)`.

## Pointer table (mouse; pen per S12-Q3; touch: nothing on the handle, the finger scrolls)
| Gesture | LTR | RTL |
|---|---|---|
| press the handle | drag starts; block kept; no text selection | same; handle at bottom-**left** |
| move down / up out of the source | target = rows below / above, source's columns | same |
| move right out of the source | target to the **end** (columns after) | target to the **start** |
| move left out of the source | target to the **start** | target to the **end** |
| diagonal | the farther axis (ties: rows), F3 | same, logical |
| back inside the source | no target (outline gone) | same |
| near an edge of the body | auto-scroll, ≤ one row a frame | same, logical inline |
| release (no modifier) | `planFill` auto: series / copy (F table) | same |
| release with Ctrl or Cmd | swapped | same |
| Escape during the drag | cancelled, « Recopie annulée » | same |
| pointercancel, blur, lost capture, sort / filter | cancelled, silent | same |
| click after the release | swallowed once | same |
| double-click the handle | nothing (stopped) | same |
| press a cell (not the handle) | range's own rules (11a) | same |

## Keyboard table (owner `cell`, no field open unless stated; Mac: Cmd for Ctrl)
| Key | LTR | RTL |
|---|---|---|
| Ctrl+D | F8 / D6: first row down; one cell or one row: the row above | same |
| Ctrl+R | first column toward the end (→); one cell / one column: the cell **to its left** copied in | toward the end (←); the cell **to its right** copied in |
| Ctrl+Shift+Enter | enters the fill mode (said) | same |
| mode: ↓ / ↑ | virtual cell down / up | same |
| mode: → / ← | toward the end / the start | ← end, → start (mirrored by `intentFor`) |
| mode: Home / End, PageUp / PageDown | the grid's own moves for the virtual cell (edge, page) | mirrored |
| mode: Enter / Ctrl+Enter | write auto / swapped | same |
| mode: Escape | cancel (said); the block stays | same |
| mode: Tab, any other key, click, blur | cancel quietly (Tab then moves as usual) | same |
| field: Ctrl+Enter | bulk in the block (D7), else keep and stay | same |
| field: Ctrl+D / Ctrl+R / Ctrl+Shift+Enter | the field's (editing.md 19) | same |

## A11y of the handle (§20 items added: 137–141, French, in the sheets change)
- The handle is `aria-hidden`, not focusable; the keyboard paths are Ctrl+D / Ctrl+R (copy) and the fill mode (copy
  **and** series, same results as the drag: property test 2); the API for apps. 2.5.7 asks a single-pointer
  (click, no drag) alternative: the keys do not count. Lead: a click on the handle then a click on a cell (« click
  then click ») is **not** built this step; written in the sheet as a known gap, for the Phase 9 menus (« Recopier
  vers… ») — the owner may ask it now (~150 B in the fill entry).
- Sentences (polite, one per gesture): mode entry (instructions, once), target size after the pause, write
  (« Cellules recopiées : 6 ; refusées : 1. Enregistrement en cours »), cancel, bulk (« Cellules modifiées : 12 ;
  en lecture seule : 3 »). Server refusals keep Part A's sentences (S3-O2). Refused mounted cells blink.
- Contrast pairs in `check:contrast`: handle vs cell background 3:1 (1.4.11), target outline 3:1, hue apart from the
  focus ring and the saving border; forced colours: handle `Highlight` square with `CanvasText` border, outline
  `Highlight` dashed. Reduced motion: nothing moves (no animation on the handle).
- 137 the fill mode in fr / ar (sentences, mirrored arrows); 138 Ctrl+D / Ctrl+R with a reader (no bookmark dialog,
  one sentence); 139 Ctrl+Enter bulk (one sentence, the field closed, focus stays); 140 a drag with a reader running
  (one sentence at the drop); 141 Ctrl+Z after a fill (« Annulé : n cellules », focus to the first).

## Tests to write FIRST (red on a stub entry whose feature does nothing; runs saved as scratchpad `s12-red*.txt`)
1. **`range-fill-property.test.ts` — the fill against core's plan, through the REAL `edit()`** (recording save):
   random grids (flat; tree with a structure column; path tree's fillers; details open; a server page), random visible
   columns of every type and rule (number with decimals, day, instant, enum, yes/no, text, read-only, `min` / `max`),
   random source block (1 × 1 up to 4 × 4), random target cell on each side and beyond the page, random swap. Oracle:
   `planFill(src, fillTarget(src, to).box, way, …)` on the **same** `displayed` and overlay, then per planned cell the
   column's verdict judged by hand (read-only table, rule table) — never the fill's own code path. Assert: at most one
   `SaveRequest`, its changes = planned − refused − unchanged, origin `fill`; the sentence counts; refused mounted cells
   blinked; the block after = source ∪ target; one `undo()` deep-equals every source row to before. `FILL_DOM_RUNS`
   (default 300; 3 000 once at the gate), `FILL_DOM_SEED` replays.
2. **`range-fill-paths.test.ts`**: for random (src, to, swap) the **three paths** — handle drag (pointer events with the
   11a geometry stub), keyboard mode (arrows to the same cell, Enter / Ctrl+Enter), `api.fill(to)` — give the same
   `SaveRequest` (deep-equal) and sentence. RTL: the same logical cell reached by mirrored arrows and by a drag to the
   left.
3. `range-fill.test.ts` (handle, F1–F7 by hand): drawn on the corner cell (ltr bottom-right class, rtl
   `inset-inline-end`), one cell has it, 24 px hit box, hidden while editing / read-only grid / no `edit()` / during
   a block drag / span-covered / detail focus / pinned copies; survives a value repaint, a save flash, row pooling,
   scroll; not in copied TSV, not in the cell's accessible name; `pointerdown` does not drop the block (stopPropagation);
   Ctrl at release swaps, at press only does not; Escape / pointercancel / blur / sort mid-drag cancel; click
   swallowed once; dblclick opens no editor; pen drags (S12-Q3 A), touch does not and is not prevented.
4. `range-fill-keys.test.ts`: Ctrl+D / Ctrl+R / Cmd on Mac (block, one row, one column, one cell, first row → not
   taken, detail above → the data row above it); `preventDefault` only when taken; inside a field the field's; the
   mode: entry sentence, mirrored arrows, Escape keeps the block (head-handle order: range before fill **and** fill
   before range in `features`), Tab cancels and moves, blur cancels, target size after 400 ms once.
5. `range-bulk.test.ts`: Ctrl+Enter in a field inside a block → one request of every editable cell, origin `bulk`,
   read-only counted, one undo; unchanged field → the shown value written; emptied field → clears (required refused,
   counted); own cell refused → field open with its reason (S12-Q5 A); cell outside the block / no block → kept, stays
   (with `enterMoves: 'down'` too); Ctrl+Enter on a cell without a field → nothing; 3 000-row block → one request of
   3 000 changes; `exclude` row selections never written; `api.apply` without a block → null.
6. `range-fill-walk.test.ts` (extends `range-walk`): random ranges, sorts, filters, pastes, fills (three paths), bulk,
   undos, scrolls, page changes: no stale paint (no `dzg-cell--fill` or handle left where it should not be), focus never
   lost, at most one handle in the document per grid, source rows deep-equal after undoing everything.
7. Wiring: `rebudget.test.ts` « step 12 » (fill line, texts, css, `/editors` 6 720), `release.test.ts`
   (`@dzgrid/dom/fill`, locales, `fill.css` exported and packed), `layering.test.ts` (fill never imports `/editors`,
   `/edit` at run time; base never imports fill), `public-api.test.ts`, `range-texts.test.ts` (fill keys in en / fr / ar).
8. Angular (`packages/angular/test`): `controller.range()` / `controller.fill()` null before / without / after;
   `(rangeChanged)`, `(rangeCopied)` fire inside the zone once per event; `ngc` template check.

## Mutants (repo copy, rsync without `node_modules`, linked; deleted after; each must be killed)
`fillTarget` axis tie to columns; `to` read from the visual (not logical) column in RTL; handle placed with
`inset-inline-start`; handle on the top row / start column; handle drawn while editing / on a read-only grid / on
pinned copies; no `stopPropagation` (block dropped on press); swap read at press, or ignored; `metaKey` ignored on
Mac; source re-read at release instead of press; per-cell commit (n requests); origin `edit` / `paste` for a fill or a
bulk; refused not blinked / read-only blinked; sentence not joined (lost to « saving ») or said twice; block after not
set / focus moved; release inside the source writing a copy; Escape mid-drag writing; cancel on sort removed; click
not swallowed / swallowed twice; dblclick opening the editor; Ctrl+D taken with nothing to copy (dialog suppressed for
nothing); Ctrl+D as a series; Ctrl+R toward the start in RTL; one-row Ctrl+D doing nothing; mode arrows not mirrored;
mode Escape reaching range (block dropped); mode not cancelled by blur / Tab; mode target computed apart from
`fillTarget`; bulk writing outside the block; bulk with an unchanged field writing nothing; Ctrl+Enter moving down with
`enterMoves: 'down'`; Ctrl+Shift+Enter in a field doing a bulk; `g.bulk` left after destroy; handle left in the DOM
after destroy; geometry refactor off by the check-box column width; pen refused / touch accepted (per S12-Q3).

## Browser checks (one headless browser at a time, always closed; `npm run test:browser -- --only fill`)
- **A real drag of the handle** (Playwright `mouse.move/down/move/up`, real hit testing): Chrome, `orders-edit` page
  copy in the browser fixture, fr light Clinic and ar dark Midnight: handle bottom-right / bottom-left measured by
  `getBoundingClientRect` against the corner cell; 24 px hit box (`elementFromPoint` at its four inner corners);
  drag down 5 rows on « Qté » `1, 2` → `3…7` written; drag toward the logical end in ar (to the left); Ctrl held at
  the drop swaps; drag past the bottom edge auto-scrolls and fills off-screen rows; Escape mid-drag writes nothing;
  pen by CDP `Input.dispatchMouseEvent { pointerType: 'pen' }`; touch by `Input.dispatchTouchEvent` scrolls, no fill.
- Keys: Ctrl+D / Ctrl+R, the fill mode and Ctrl+Enter in Chrome, Firefox and WebKit (Playwright keys; Mac Cmd in
  WebKit's mac mode). [À VÉRIFIER] headless engines never show the bookmark / reload UI, so they prove only that the
  page gets the keydown and prevents it; the real dialog stays with the owner (§20 132, 138).
- Forced colours (`emulateMedia({ forcedColors: 'active' })`): handle and outline visible, axe 0; axe 0 with a block,
  the handle and the mode on, fr / ar; zero layout reads per drag frame beyond `cellAt`'s own rect reads.
- **The playground** (`--only playground`, on the running 4700 server, never restarted): `orders-edit.html` — drag the
  handle on « Qté », Ctrl+D, Ctrl+Enter bulk on a block of « Statut », one Ctrl+Z each gives it back, sentences heard
  once (live region text); `?locale=ar-DZ&theme=dark&skin=midnight`; `?range=0` (no handle), `?fill=0` (block, no
  handle); `?tree=1` (structure column counted read-only), `?paged=1` (the page's last row is the limit).
- Real Angular example (`example:browser`): the stock screen with `range()` + `fill()`: drag and Ctrl+Enter, fr / ar.

## Bench (QB8; indicative until the quiet-machine run, Q17d)
- **Dataset B** (`perf/dataset.ts` `datasetB(n = 3000, seed = 42)`): 12 columns — `id`, `product` (text), `lot`
  (text, `L-0001…`), `stock` (integer), `min` (integer), `price` (2 decimals), `expiry` (day), `received` (instant),
  `status` (enum, 4), `active` (yes/no), `site` (enum, 6), `note` (text, sometimes Arabic). Pure, seeded (`rng`).
  `perf/profiles/stock.ts`: core + dom + edit + editors + range + fill + fr texts, a size line « recorded » (no budget).
- **Page** `packages/dom/test/browser/perf-range.html` on the **minified** build, Chrome headless 1 280 × 720, a save
  that records and answers in a microtask. Lines (median of 5 runs after 2 warm-ups; `os.loadavg()` printed beside):
  1. bulk B 3 000 × 1 (block = the `stock` column, all rows; Ctrl+Enter dispatched) → next painted frame: target ≤ 30 ms;
     requests = 1, changes = 3 000.
  2. paste 1 000 cells (100 × 10 TSV) from the `paste` event to the painted frame: target ≤ 40 ms.
  3. fill 3 000: `api.fill` of a 2-row number series down 2 998 rows → painted frame: target ≤ 30 ms (lead), one request.
  4. Ctrl+D on 3 000 × 12 (36 000 cells): measured, no target.
  5. undo of line 1: measured, no target. Long tasks over 50 ms counted for each.
- Printed by `npm run bench:browser -- --only range-b`, marked « indicatif (Q17d) »; **no line added to
  `perf/browser-budgets.json`** (S12-Q7 A); results written in this plan's Done and ROADMAP. « One request » is
  asserted in the vitest suite (test 5), not by the bench.

## Sizes (gz; estimates to measure)
| Entry | Now / ceiling | Step 12 | Ask |
|---|---|---|---|
| `@dzgrid/dom/fill` (new, over `dom/range`) | — | handle + paint ~250, drag ~300 (with D2 shared geometry), mode ~250, Ctrl+D/R ~180, bulk seam + apply ~120, sentences ~150, API ~100 → **1 200–1 450** (+250 without D2) | **S12-Q1: 1 600** (line at measure + 10 %) |
| `@dzgrid/dom/range` | 4 796 / 4 800 | D2 refactor only, ±10 | none; over → D2 reverted |
| `locales/{en,fr,ar}-fill` (new) | — | ~9 texts: ~220 / 260 / 330 | **S12-Q4: 250 / 300 / 380** |
| `@dzgrid/theme/fill.css` (new) | — | handle, outline, forced colours ~160–220 | **S12-Q4: 300** |
| `@dzgrid/dom/editors` | 6 601 / 6 650 | Ctrl+Enter branch ~40–70 | QB5 grant **6 720** (granted) |
| `@dzgrid/dom` base | 21 548 / 21 700 | 0 (a type) | none |
| `@dzgrid/dom/edit`, `core/edit`, `core/range`, core | full / frozen | 0 | none (S12-Q5 B would ask `dom/edit` 4 200) |
| `@dzgrid/angular` | 6 743 / 6 793 | `range()`, `fill()`, two outputs ~60–90 | S9-Q6 rule: measure + 50, ≤ 7 000 |
| real example | 91 093 / 92 000 | initial load 0 (audit has no range); the stock chunk grows, measured apart | none |
| K.8 profile | 82 843 / 83 500 | 0 | none |
| `perf/profiles/stock.ts` | — | recorded | none |

## Risks
`dom/range` over 4 800 after D2 (revert, duplicate); a cell renderer that empties the corner cell between paints
(the handle re-appended at each `afterRows`; walk test 6); cells with `overflow: hidden` and short rows (24 px hit area
inside a 24–28 px compact row: measured in Chrome); Ctrl+Shift+Enter taken by a screen reader or an IME in some
engine (listening 137; fallback: the API, written); Ctrl/Cmd+D / R not preventable in a real browser (owner, headed);
Mac Ctrl+press is a context click (the swap is read at release, so Ctrl is pressed after the press: written in the
sheet); bench on a shared machine (Q17d); Safari copy without selection (S11b-Q2, owner's real Safari test).

## Not in step 12
Double-click on the handle (fill down to the neighbour's end), the fill by touch (handles), a « fill series » dialog
(step value), text series (`INV-0042`), trends, fill options menu after the drop, `[(range)]` in Angular, menus.

## Order of work
Sheets change first (fill.md D1–D9, range-selection.md key table, editing.md 19, a11y §20 137–141, CHANGELOG
note) → tests 1–8 red → D2 refactor with `dom/range` measured → fill entry → `/editors` branch → texts, css, wiring
(package exports, `build.mjs`, vitest / tsconfig aliases; **no `vite.config.ts` edit**: the playground imports the
entry by path, as `editors.js`) → Angular → playground and example → dataset B, bench → touched tests while working;
the full gate once at the commit (`build`, `test:ci`, `test:perm`, `typecheck`, `check:size`, `check:contrast`,
`test:browser`, the Angular fixture, `example:build|bytes|browser`); review + test analysis + mutants after.

## Questions au propriétaire (★ = recommandé)

**S12-Q1. Où vit la poignée de recopie ?**
- **A ★** une entrée à elle, `@dzgrid/dom/fill` (`fill(blocs)`), plafond **1 600** octets ; `dom/range` ne grossit pas.
- B un morceau chargé à la demande depuis `dom/range` (premier glisser ou Ctrl+D) : il faut ~60 octets de plus dans
  `dom/range`, donc 4 800 → 4 900.
- C tout dans `dom/range`, plafond 4 800 → 6 400.

**S12-Q2. Recopier une série au clavier (sans souris) :**
- **A ★** un « mode recopie » : Ctrl+Maj+Entrée, les flèches étendent comme la poignée, Entrée écrit, Ctrl+Entrée
  échange copie / série, Échap annule ; tout est dit.
- B seulement Ctrl+D / Ctrl+R (copie) ; la série au clavier, non (l'appli peut passer par l'API).
- C Ctrl+Maj+D / Ctrl+Maj+R pour une série (raccourcis déjà pris par les navigateurs : favoris, rechargement).

**S12-Q3. Stylo et doigt sur la poignée :**
- **A ★** souris et stylo tirent la poignée ; au doigt elle n'est pas montrée (écran tactile seul) et le doigt fait
  défiler.
- B souris seule, comme les blocs.
- C souris, stylo et doigt.

**S12-Q4. Textes et styles de la recopie (l'arabe de `-range` et `range.css` sont pleins) :**
- **A ★** à part : textes `-fill` 250 / 300 / 380 et `fill.css` 300.
- B agrandir les existants : `-range` 400 / 480 / 650, `range.css` 700.

**S12-Q5. Ctrl+Entrée quand la cellule du champ refuse la valeur :**
- **A ★** un seul enregistrement : les cellules acceptées sont écrites, les refusées comptées ; le champ reste
  ouvert avec la raison ; un Ctrl+Z rend tout.
- B rien n'est écrit si la cellule du champ refuse (il faut ouvrir une vérification dans `dom/edit` : 4 150 → 4 200).

**S12-Q6. Ctrl+D sur une seule ligne sélectionnée (plusieurs colonnes) :**
- **A ★** comme Excel : la ligne du dessus est recopiée dans le bloc (et Ctrl+R sur une seule colonne : la colonne
  d'avant).
- B seulement sur une cellule seule ; une ligne seule : rien.

**S12-Q7. Les mesures de vitesse du jeu B :**
- **A ★** affichées et notées « indicatives » ; aucune limite écrite avant la machine calme (Q17d).
- B écrire tout de suite des limites (mesure + 35 %), à revoir sur la machine calme.
