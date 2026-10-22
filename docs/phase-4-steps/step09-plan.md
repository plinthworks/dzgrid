# Step 9 plan: the DOM base for variable row heights and the whole-row (detail) kind (lead, 2026-10-22)

Plan: `docs/phase-4-plan.md` §1 fact 3, D7, D8 (the focus part), step 9, risks (« scaled scrolling with
unequal heights », « a11y of a whole-row stop »); owner Q4, Q5; `step08-plan.md` (the sparse layout as
built, `rows.details` / `rows.heights`, `setHeights` for `'auto'`); `sticky-blueprint.md` (`insetFor` reads
`g.layout!`); sheet `docs/behaviors/master-detail.md` (stands); spike S12. Clean room: behaviour only.

## Where each hard-wired place stands (the six of fact 3, read again)

Step 4 already moved most of them onto `g.layout` (the paint makes it with `g.layoutFor?.(d, h)`). What is left:

| Place | Before | Step 9 |
|---|---|---|
| viewport: mapper height, row places, top row | `layout.total`, `offsetOf`, `indexAt` (step 4) | unchanged |
| viewport: the anchor | re-applied only when the rows changed (`shown.displayed !== d`) | also when the **same rows** were laid out again with another total (a height set on the layout: `'auto'`, a resize), as the rows kind (S12: at the end, stay at the end); the distance into the top row clamped to its new height (S12's open note) |
| viewport: a new row height (text zoom) | `logicalTop × h / lastH` | the same for a uniform layout; a variable one keeps the top row and the fraction into it (the previous paint's layout) |
| `ensureVisible` (keys/focus.ts) | the layout only when a feature gives one, `i × h` otherwise; a stale layout between a change and its paint | `rowLayout(g)`: the layout of the rows shown now (below) |
| page keys (keys/router.ts) | `floor(block / h) − 1` rows | the same count for a uniform layout; a variable one moves by the same distance in pixels (`indexAt(offsetOf(r) ± page × h)`), so a 240 px detail is not « one row » of a page |
| wheel (interact/scrolling.ts) | logical px; a line is `h`, a page the view | **unchanged on purpose**: a wheel moves pixels, not rows, so it needs no layout (S12: intercepted, exact); a line stays the base row height |
| motion flip's screen | `g.viewBlock` (step 4) | unchanged |
| sticky `insetFor` | `g.layout!` | safe: `rowLayout(g)` sets `g.layout` before anything asks it (ensureVisible, the paint) |
| `ScrollController`, `FrameScheduler` | logical px; reads before writes | unchanged (the `'auto'` ResizeObserver batch is step 10) |

## Decisions and reasons

1. **`rowLayout(g)`** (`render/viewport.ts`): the layout for the rows shown now. It keeps the last one
   made while the rows, the row height and `g.layoutFor` are the same (so heights a feature sets on it —
   `setHeights` for `'auto'` — live until the next build, as step 8 point 11 needs), else makes a new one
   (a feature's, or uniform) and stores it in `g.layout`. The paint, `ensureVisible` and the page keys
   all read it: one layout for one set of rows, never a stale one. Uniform: a pure function of count and
   `h`, so reusing it changes nothing.
2. **The anchor on a re-layout.** Same rows, same `h`, another total ⇒ the anchor runs as for `'rows'`
   (top stays top, end stays end, else the top row and the distance into it). A uniform grid never gets
   there (its total is count × h). The distance is clamped to the top row's new height (a detail that
   was the top row and shrank).
3. **Page keys.** `MoveShape.rowAt?(r, k)`: the row k pages from row r (r = −1 from the header). Given
   only for a non-uniform layout; without it `moveFocus` does `r + k × page` as before (byte-identical).
4. **The whole row.** `MoveShape.whole?(rowIndex)`: true for a detail row. On it Left/Right/Home/End
   (column moves and column edges) do nothing (the key is still taken). Up/Down/PageUp/PageDown/Ctrl+Home/
   Ctrl+End move as from any row. The focus on a detail is a cell focus `{ row: x:…, column }` whose column
   is the goal column: the kernel already takes it (a visible column, a displayed row), so the goal is
   kept across the detail for free.
5. **The detail row in `#bind`.** A `DetailNode` gets no cells and no selection box: one
   `<div class="dzg-dcell" role="gridcell" aria-colindex="1" aria-colspan="N" tabindex="-1">` (N = visible
   columns + the box column), `aria-label` = the master's row-header text (its accessible name from the
   master; the words « Details of » come with step 10's messages, the base has no key for them),
   `RowView.slot`. The row: `data-kind="detail"`, its height from the layout (written at every render,
   even when nothing else changed: a height set on the layout does not change the epoch), `aria-rowindex`
   as any row, no `aria-selected`. The cell is as wide as the view (`Frame.view`, never wider than the
   columns), `position: sticky` at the inline start: it stays in view under a horizontal scroll, in RTL too.
   The segments of a detail row are not shown (`display: none`, base CSS).
6. **The part slot `'detail'`.** `SlotContext['detail']` (row = the master's, key, master, height), core
   `PartSlot` gains `'detail'` (type only), `unslotted` asks for the `detail` feature. Base hook:
   `RowView.part` (the handle step 10 mounts in `slot`): `partAt(key, …)` answers it on a detail row
   (Enter/F2 → its `focus()`; no part → Enter is the host's, as on a plain cell); the base destroys it when
   the row leaves the window, is rebound to another row, or the grid ends (`slot` removed then). Mounting
   and updating are step 10's.
7. **Keys and pointer on the cell.** `ownerOf`: the detail cell is a `'cell'` (its keys are the grid's),
   a control inside it a `'cell-widget'` (Escape back to the cell). `positionOf`: a target in our own
   detail cell (a nested grid's inner rows are not ours) is the detail position, its column the focus's
   when already on that row, else the first visible one. Not data: the kernel already refuses the `x:` key
   for selection (Space, clicks, ranges), `select.ts` sends no `rowClicked`/`cellClicked` for it, the base
   has no copy; a test pins each.
8. **Theme**: the focus ring on `.dzg-dcell:focus-visible` (with the others).

## Tests first (seen failing)
- `packages/dom/test/detail-base.test.ts`: a test feature (`detailShape` + `sparseRowLayout`): the row
  and its one cell (role, colspan with and without the box column, name, `data-kind`, height, no cells, no
  box, sticky width), rebinding detail ↔ data, `rowLayout` (stale layout after a change, before the paint),
  ensureVisible on rows below a detail, the anchor on `setHeights` above the view (top row kept, at the end
  stays at the end, the top row itself shrinking clamped), the text-zoom keep, wheel exact in scaled mode,
  PageDown/PageUp by distance, Up/Down onto the detail and on, the goal column kept, Left/Right/Home/End
  stay, Ctrl+End, Enter/F2 → the part's focus, Escape from inside back to the cell, no part → Enter is the
  host's, the part destroyed on leaving the window and on clear, Space/click select nothing and send no
  click events, `positionOf` of the cell and of something in it, `unslotted` for a `'detail'` part.
- `move-detail.test.ts` (pure `moveFocus`: `whole`, `rowAt`, uniform equivalence over random worlds).
- Existing viewport/scroll/keys/motion/sticky tests green **without edits**.
- Browser `--only detail` (`packages/dom/test/browser/detail.{html,ts}`, Chrome, fr and ar RTL): 1M rows,
  2 000 open details of 240 px (S12's numbers).

## Done (2026-10-22, not committed)
As designed. Deviations: the wheel left as it was (pixels need no layout); the cell's name is the
master's row-header text (« Details of » with step 10's messages); `rowLayout` also keys on
`g.layoutFor` (a feature that sets or removes it gets a new layout). Found, kept as before (not step 9):
an anchor pending in the same frame (rows opened by the API, then `ensureVisible` before the paint)
wins over that scroll, uniform rows too.
Tests first: `detail-base.test.ts` (25) and `move-detail.test.ts` (6): 23 of 29 failing before the code (the 6 others guards that passed already: the wheel, the end kept, uniform pages, goal and neighbours); 2 added after the mutants (PageDown from the header over variable rows, a pooled detail row not reused), both failing on their mutant. Every existing viewport, scroll, key, motion, sticky and tree test green **without edits** (143 related files, 2 049 tests). Mutants 20: 19 killed, 1 equivalent (`fresh ||` in the label refresh: a pooled row holds no data; the code removed). Browser `--only detail` (Chrome, fr ltr light and ar rtl dark; `packages/dom/test/browser/detail.{html,ts}`): 18 / 18 — 1 002 000 rows, top and end 0 px, rows placed < 0.5 px, axe 0 (a detail in view and focused), Down/Left/Home/Down, Ctrl+End to the detail of row 999 999 then Up, wheel 20 × 100 px = 2 000 exactly (scaled), PageDown by distance, focus kept on a retained detail row through end and top, four height changes above the view keep the top row (0 px), the cell at the view's start under a horizontal scroll. Sizes: dom 19 765 → **20 488** (21 300); dom/tree 3 688, core 28 240, core/detail 994, motion run 2 854 unchanged; theme 2 234 → **2 238**. Gate: `test:ci` 282 files, 4 569 tests (a first run lost `motion-expand-gaps` « opening: glides » to the 5 s default timeout under load: 3.9 s alone, 3.8 s on the base without step 9; green on the second run); `test:perm` 6 / 6; `typecheck`, `check:size`, `build`, `check:contrast` green; `test:browser` full 472 / 473 (one motion tree ar timing miss, `--only motion` again 50 / 50). Chrome bench: no line over; uniform wheel 16.7 / 18.2 ms, 1M scaled 16.7 / 18.1 ms, first render of 1M 217 ms (Phase 3 close 16.7 / 18.2, 16.7 / 16.8).
