# Phase 6, step 9 of the plan (file `step08b`; `step08-plan.md` is the groups step): pinned rows, top and bottom, editable (Q-P = C)

Architect blueprint, 2026-10-27. Plan only: no code, test, budget or config change was made. Wins over this file: `decisions.md` (Q-P = C, Q-B, O2, O8, C6), then `docs/behaviors/pinned-rows.md`, `editing.md`, `range-selection.md`, `fill.md`, `a11y-protocol.md` 21. Clean room: our own words; no grid library read. Sizes below are estimates from reading the code, not measures: **step 0 of the build is `build` + `check:size` on a quiet machine, numbers written here.**

## 0. Facts found in the code (why the design is what it is)
- `core/ids.ts` already has `pinnedKey(side, index)` (`p:t:0`, `p:b:2`), exported but used nowhere, and `isDataKey` says « not a pinned row's ». It is **position based**; the sheet (1, 16) wants **id based** (same id kept across `set()` keeps the open field). Unpublished (0.3.0 is local), so it can change: `pinnedKey(side, id)` = `p:t:` + length-prefixed canonical id.
- Everything keyed on a row goes `rows.row(key)` (model) or `rows.displayed.indexOf(key)`: `kernel.editable` (`kernel.ts:755`), `focus.set` (`:677` refuses `row-not-displayed`), `reconcileFocus` (moves a focus whose row is not displayed to the body row at its old place), the edit controller (`rowOf`, `rows.subscribe`), the editors (`editors/index.ts` 224, 238, 264, 430), `edit/marks.ts` 216, the router, `range`, `fill`. A pinned key is in none of them: **core needs one registry the kernel consults**, and the rest follows from that.
- The overlay id is `idOfDataKey(key) ?? ''` in 4 places (`controller.ts:137`, `edit/marks.ts:267`, `range/copy.ts:25`, `motion-gsap/run/saves.ts:51`): for a pinned key every pinned row would be the id `''` and edits would collide. Fix: `?? key` at those 4 sites (0 B, even less).
- `edits.reader` makes the model go **order-stale** when the changed columns touch the sort or filter (`client.ts:787`, `touches(changed)`). A pinned edit would wrongly stale the body: the controller must pass no column for pinned cells.
- A pinned band **cannot be a child of `el.header`**: the header is a `rowgroup`; a nested `rowgroup` fails ARIA required-children (axe), and the header's click/keydown/filter/menu handlers would see pinned cells. A pinned band cannot be a **native scroller either** (`overflow-y:auto` makes it an `overflow-x` scroller too and the pinned start/end columns' sticky would no longer follow the viewport's sideways scroll). So: two sibling `rowgroup` elements, `position: sticky`, no overflow scroller, windowed inside when over the cap (§2.5).
- The tree's pinned parents already use `rowRenderer.spawn(layer)` (a second `RowRenderer` drawn from the main frame) and `g.inset`/`insetFor`. We reuse the spawn mechanism, but those copies are aria-hidden and never focused; pinned rows are real rows, so lookups (`keyOf`, `cell`, `partAt`, `forEach`, `touch`) must reach them (base, §4).
- The viewport geometry (`block = clientHeight - header.offsetHeight`) is the only thing that says how much room the body has. The Geometry port is a plain object: a feature can wrap `read()` and take the bands' heights off `block` (0 B in the base). Then every body consumer (window, `reveal`, scroll end, page keys) is already clear of the bands (WCAG 2.4.11, sheet 10) with no new code.
- `ensureVisible(row, column)` returns before scrolling sideways when the row is not displayed: for a pinned row, Left/Right would not follow a far column. Swapping two lines in `keys/focus.ts` fixes it (0 B).
- `moveFocus` is a pure function of a `MoveShape`. A band is a small `DisplayedRows`; passing it as `shape.rows` gives Left/Right/Home/End/PageUp/PageDown inside the band for free. `GridContext.step` already goes through `g.spans?.move ?? moveFocus`.
- `dom/range` is at 4 928 / 4 950 and `dom/fill` at 2 975 / 3 000: they work in `rows.displayed` coordinates (12 and 8 sites) and the pointer in `cellAt` (`range/geom.ts`), measured from `header.getBoundingClientRect().bottom`.

## 1. API (app side)
```ts
import { pinnedRows } from '@dzgrid/dom/pinned-rows';
import { FR_PINNED } from '@dzgrid/dom/locales/fr-pinned';
const pins = pinnedRows<Row>({ top: [...], bottom: [totalsRow] });          // live
features: [edit({ save }), editors(), pins]                                  // order free
pins.api(grid)!.set({ bottom: [recomputedTotals] });   // replaces the given sides only; an omitted side is kept; [] clears a side
pins.api(grid)!.get();                                  // { top, bottom } as the app gave them
pins.api(grid)!.rows(side);                             // DisplayedRows of a band (print, auto-size, tests)
```
- Ids come from the grid's `getRowId`. `assignKeys` per side (first kept, later dropped, problem `duplicate-row-id` path `pinnedRows.top[i]`; an unusable id: `invalid-row-id`). **Align the sheet: severity `error` as for body rows** (it says warning). More than 5 on one side: warning `too-many-pinned-rows`, still drawn.
- `set` with the same id keeps the row's overlay, open field and focus; a changed row object ends a saved/refused overlay exactly as `rows.subscribe` does for the body (controller `n !== e.d`). A key that disappears: `edit.rowRemoved` as in the body (sheet 16); a focused pinned row that disappears: focus goes to the nearest row of the same band, else the first body row, else the header.
- One way to update (`set`); no `patch`/`remove` (the app owns the data; a totals row is recomputed and `set`). Angular input `pinnedRows` is step 12 (`api.set` under it).
- Events: `pinnedChanged` (type-only GridEvent, source `api`), emitted with the internal `emit`; the edit controller and the paint listen.
- `editable(row, context, info)`: **third argument `{ pinned?: 'top' | 'bottom' }`** (absent on body rows), instead of the sheet's « `context.pinned` » (see Q4). `rowClass` gets `pinned` in its context object (it is our own object, so no clash).
- Save: `SaveChange` gains `pinned?: 'top' | 'bottom'`; `key` is the grid's `RowKey` as for body rows (`p:t:…`), `row` is the app's row object (Q5). `saveFailed` names a cell by `{ key, column }` or by the app's own id as today.
- `captureState` / `GridState`: nothing (Q-S1). Test only.

## 2. Design

### 2.1 Core (base seams, all inside `@dzgrid/core`'s grant)
Room: 29 150 - 28 965 = **185 B**. Estimate **+120 to +170**, hard stop 185, then owner (Q2).
| Change | Where | Est. |
|---|---|---|
| `pinnedKey(side, id)`, `isCellKey(key)` = `d:` or `p:` (internal export, for range/fill/menu) | `ids.ts` | 20 |
| `PinnedStore<T> { get(key): (DataNode<T> & { pinned: 'top' \| 'bottom' }) \| undefined }`; `kernel.rowOf(key)` = `rows.row(key) ?? pinned?.get(key)`; internal `setPinned(kernel, store?)` (symbol, like `setFocusOwner`) | `kernel.ts` | 60 |
| `focus.set` accepts a key the store holds | `kernel.ts:677` | 12 |
| `reconcileFocus(…, held?)`: a pinned focus is kept (column fixed to the first visible one as for any cell), `owner()` not applied | `focus.ts` + `onModel` | 30 |
| `editable(key, col)` reads `rowOf(key)`, hands `info` to the rule; `EditableRule` type gets the 3rd parameter | `kernel.ts`, `editable.ts`, `defs.ts` | 20 |
Fallback if over 185: move the focus-keep (the 30 B) to the feature (re-set the focus on `focusChanged` source `data`); worse, so ask first.

`@dzgrid/core/edit` (3 150 now; **measure first**, estimate +60 to +90; stop at 3 150 then ask):
- `rowOf` = `kernel.rowOf(k)?.data`; `idOf` = `idOfDataKey(k) ?? k`; subscribe the row sweep also to `pinnedChanged`; the « row removed » branch (`rows.kind === 'client'`) also for pinned keys (a server grid's pinned row is not a page row).
- `SaveChange.pinned` from the node; `showNew(columns)` gets only the columns of **body** cells (pinned cells bump the reader version with no column): the body never goes stale.
- Undo/redo entries are unchanged (keys).

### 2.2 DOM base seams (`@dzgrid/dom`, 21 855 / 22 400; estimate **+150 to +200**, room 545)
| Seam | Where | Est. |
|---|---|---|
| `RowRenderer.spawn(layer, own = false)`; a spawned renderer with `own` is a **peer**: `keyOf`, `cell`, `partAt`, `forEach` fall back to peers (only after the main map misses; tree copies are not peers, so they never take focus), `touch` already reaches spawned | `render/rows.ts` | 90–110 |
| aria: `headerRows` gains `g.pins?.top`, `aria-rowcount` gains `g.pins?.bottom` (body rows' `aria-rowindex` follow) | `render/viewport.ts` | 35–45 |
| router: `const step = g.move ?? g.spans?.move ?? moveFocus` | `keys/router.ts` | 12–15 |
| `ensureVisible`: scroll sideways before the `i === -1` return | `keys/focus.ts` | 0 |
| types only (0 B): `GridContext.pins`, `.move`, `.rowsOf`, `GridEvent.pinnedChanged`, `DataNode.pinned` | | 0 |
`g.rowsOf(key)`: the `DisplayedRows` holding a key (a band's for a pinned key, else undefined = body). Set by the feature; read by editors (next-cell, Tab), range, fill, router shape.

### 2.3 Bands in the DOM (`@dzgrid/dom/pinned-rows`)
- Two elements made by the feature: top `rowgroup` inserted after `el.header`, bottom `rowgroup` after `el.body`; both `aria-label` = `pinned.top` / `pinned.bottom` (choice 1), `position: sticky`; top at `inset-block-start: calc(var(--dzg-row-height) * (g.bands.length + 1 + g.headerRows.length))` set as a custom property (no DOM read: header rows are `h` tall), bottom at `inset-block-end: 0`. Width = `L.totalWidth + extra` (what the body gets). Rows are `position:absolute` at `i*h - offset`, band `overflow: clip`, `contain: content` (never `strict`, S11).
- One `RowRenderer` per band, `spawn(layer, true)`, fed in `afterRows(f)` with `{...f, displayed: band, rowTop, rowHeight, headerRows, focusRow, spans: null, rowAttrs: noop, rowClass: (c) => host({...c, pinned: side}), check: true}`; the box column keeps its width and is emptied (`v.check.firstChild.hidden = true` after each render, no checkbox, sheet 7). `aria-rowindex`: top = header rows + 1 + i; bottom = header rows + top + body count + 1 + i (the renderer writes `f.headerRows + 1 + i`).
- `g.pins = { top: n, bottom: m }` so the base writes the counts. `kernel` store registered with `setPinned`.
- Geometry: wrap `g.geometry.read` in `setup`: `block = max(0, block - topPx - bottomPx)`. Heights are computed (`rows × h`, capped), not measured, so jsdom tests are exact. `g.viewBlock`, `reveal`, scroll end and page size then exclude the bands.
- Cap (O8): `cap = floor(rawBlock / 2)`; `bandHeights(Ht, Hb, cap)` = both fit → themselves; else top gets `min(Ht, max(cap/2, cap - Hb))`, bottom `min(Hb, cap - top)`, each rounded **down to whole rows, at least one row** (a band never hides; the body may be squeezed in a tiny view: risk R6).
- Over the cap a band is **windowed**: it keeps an `offset` (px); wheel over it moves the offset (no `preventDefault` when it cannot move), a focus into a row outside it moves the offset to show the row (`focusChanged` listener, also for `Home`/`End`/keys). Touch panning inside a capped band: not this step (documented; R3).
- Short content: the bottom band sits at the bottom of the grid, not right under the last row (Q3, recommended): `foot.style.marginBlockStart = max(0, rawBlock - topPx - bottomPx - layout.total)` computed from numbers we have.
- Sideways scroll and pinned start/end columns come for free (same row markup, same viewport scroller). RTL: logical insets only.
- Auto-size (step 7 code) samples `api.rows(side)` (`columns/size.ts` reads `g.pinned?.rows` : +15 to 20 B in `dom/columns`, 119 B free). Auto row height (step 10) will use the same hook. Print (step 11): `api.rows('top'|'bottom')` is the data it needs (top rows once, start of tbody).
- Hover, tooltips: no overflow tooltip on pinned cells this step (tooltips read `rows.row`); documented limit (R7).

### 2.4 Editing reaches pinned rows
1. Row keys: `p:t:<len>:<id>` / `p:b:…`, own family; never in `rows`, never selectable (`isDataKey` false: select.ts, `aria-selected` already skip them; add a test that `selection.toggle` with a pinned key leaves the selection empty).
2. `kernel.editable(key, col)` → `editableAt(kernel.rowOf(key), col, app, locked, threw, node.pinned)`; the rule gets `(data, app, { pinned })`. A pinned node has `kind: 'data'`, so rule 1 of `editing.md` becomes « a data row **or a pinned row** » (C6; edit the sheet text).
3. Editors: replace `g.rows.row(k)` with `kernel.rowOf(k)` (3 sites + `fill`), `next()` uses `g.rowsOf(k) ?? D` (Tab stays inside the band, ends at its last cell as the body ends at its last row), Enter-down uses `g.step` (band shape, stops at the band's edge). The editor opens in the band cell (`rowRenderer.cell` via peers) and stays aligned (the cell is inside the sticky band).
4. Saves: same `save` handler, one gesture one request; `changes[i].pinned`. Marks (`edit/marks.ts` `forEach`, `show` → `touch`) reach the band cells through peers; `marks.ts:216` uses `kernel.rowOf`.
5. Never stale (2.1). No muted look: `stale.ts` iterates `rowRenderer.forEach` for body only: add no pinned there (peer fall-back must **not** reach `stale.paint`: iterate the main map explicitly there; test).
6. Undo/redo: same history; `run()` already dispatches `focus.set` on the first cell (allowed by the seam) and `restoreFocus` (peers find the cell).
7. App replaces a band while a field is open: same key → field stays (the band keeps the mounted row; `f.active`); gone key → controller sweep: `edit.rowRemoved`, field closed by the editors' existing check (`!rowOf(k)`).
8. `ro`/`aria-readonly`: `Frame.ro` is reused unchanged (`!kernel.editable`).

### 2.5 `dom/range` and `dom/fill`: what they need (O8)
Blocks, copy, paste, Delete, Ctrl+D/R, Ctrl+Enter bulk inside one band; never across the edge; Ctrl+A stays body; fill handle in a band allowed.
- Keyboard: the band's `g.move` clamps (returns `null` on Up at its first and Down at its last row), so Shift+arrows cannot leave; `range` line 457 (`indexOf(c.row) === 0`) needs `g.rowsOf` to stop at a band's first row. Plain arrows that leave a band are the feature's (§3), not Shift's.
- All `rows.displayed` uses become `g.rowsOf?.(key) ?? rows.displayed` at the sites that start from a key (`boxOf`, `size`, `clears`, `copy`, `paste` target, `api.set` check, paint per renderer, fill `boxOf`/`pos`/plan/bulk/handle); `isDataKey` → `isCellKey` at `range` 233–239, 269, 452, `fill` 83, 207, `column-menu` 158.
- Pointer: `place()` measures from `header.bottom`; with a top band the body's Y origin is `header.bottom + topPx`: `g.bodyTop?.()` (feature sets it). `cellAt(g, p)` asks `g.cellIn?.(p)` first: the feature answers a band cell when the press started in a band (clamped to that band while dragging) and `undefined` otherwise (a body drag over a band keeps clamping to the body, as today).
- Estimate: **`dom/range` +220 to +280** (4 950 → ~5 200), **`dom/fill` +100 to +150** (3 000 → ~3 150), `column-menu` 0. Both are at the ceiling now: nothing fits without a raise (Q1/Q2). `ar-range`/`ar-fill` texts: none (no new sentence).
- Split proposal: 8b-1 = core + base seams + bands + keys + single-cell editing, undo, saves, never-stale (everything but 2.5); 8b-2 = 2.5. Each has its own gate. Recommended: yes (the first is ~70 % of the value and has no budget question).

## 3. Keyboard table (LTR; RTL mirrors Left/Right only; Mac: Cmd where the sheet says Cmd)
Implemented by the feature's `keys(e, at, owner)` (before the router; range's Shift keys pass because it returns false for plain arrows) plus `g.move` for what stays inside a band. `T` = top band, `B` = bottom band, `H` = last header row (`level = g.headerRows.length`, 0 if none).
| Focus | Key | Result |
|---|---|---|
| H, column c | ArrowDown | first T row, c (no T: unchanged; body empty and no T: first B row) |
| first T row | ArrowUp | H, c |
| T row i | Up / Down | T row i-1 / i+1 |
| last T row | ArrowDown | first body row, c; body empty: first B row; none: stay |
| first body row | ArrowUp | last T row, c (no T: unchanged: last header row / header) |
| last body row | ArrowDown | first B row, c (no B: unchanged) |
| first B row | ArrowUp | last body row; body empty: last T row; else H |
| B row i | Up / Down | i-1 / i+1; last B row Down: stay |
| pinned row | Left / Right / Home / End | inside the row, `moveFocus` over the band shape (Ctrl+Left/Right as the body) |
| T row | PageDown | body row `page - 1` (as from the header: `moveFocus` from `H`); PageUp: stay |
| B row | PageUp | body row `max(0, count - page)`; PageDown: stay |
| pinned row | Ctrl+Home / Ctrl+End (Mac Cmd+Home/End, Fn+Cmd+Left/Right) | first / last **body** row, column kept (O8); body empty: stay |
| body | Ctrl+Home / End, PageDown / PageUp | unchanged (stop at the body's edge) |
| pinned row | Shift+arrows | inside the band only (block, §2.5); at the band edge nothing moves |
| pinned row | Space | nothing; yes/no editable cell toggles (editors) |
| editable pinned cell | F2, Enter, a character, Delete, Backspace | as `editing.md`; Escape / Tab / Enter inside the editor as in the body, bounded by the band |
| pinned row | Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (Cmd on Mac) | the edit feature's, unchanged |
| pinned row | Ctrl+A | nothing for bands (the range's select-all is the body's) |
| any | Tab / Shift+Tab | the grid's one tab stop (roving) as today |
Every row of this table is a pure function `crossBand(shape, from, intent) -> FocusPos | null` in `pinned-rows/band.ts`, tested to the letter and mutated; the DOM only calls it (`focus.set` + `restoreFocus`).

## 4. Bytes: base vs entry
| Entry | Now | Grant | This step | Stop |
|---|---|---|---|---|
| `@dzgrid/core` | 28 965 / 29 000 (guard) | 29 150 | +120–170 | 185 |
| `@dzgrid/core/edit` | measure (budget 3 150) | none | +60–90 | 3 150, then ask |
| `@dzgrid/dom` base | 21 855 | 22 400 | +150–200 (rows 90–110, aria 35–45, router 12–15) | 22 400; leave ≥ 200 for step 10 |
| `@dzgrid/dom/pinned-rows` (new) | 0 | **2 000** (Q-B) | 1 700–2 100: band rows 220, set/dedupe/problems 180, DOM+sizes+cap 360, renderers/frames 320, keys + `crossBand` 380, window/focus-scroll 150, store/edit glue 100 | 2 000, then Q2 (ask up to 2 300) |
| `@dzgrid/dom/range` | 4 928 / 4 950 | none | +220–280 (8b-2) | needs a raise → ~5 200 |
| `@dzgrid/dom/fill` | 2 975 / 3 000 | none | +100–150 (8b-2) | needs a raise → ~3 150 |
| `@dzgrid/dom/editors` | measure (6 720) | | ±0 (renames), +20 for `rowsOf` | 6 720 |
| `@dzgrid/dom/edit` | measure (4 150) | | +0–20 | 4 150 |
| `@dzgrid/dom/columns` | 3 981 / 4 100 | | +15–20 (auto-size samples bands) | 4 100 |
| `locales/{en,fr,ar}-pinned` (new, 2 keys) | 0 | none | 120 / 140 / 170 | ask |
| `theme/pinned-rows.css` (new) | 0 | none (`columns.css` 1 111 / 1 150 is full) | 350–450 | ask |
| K.8 guard 84 000, real example 94 500 | | | base grows ~200: K.8 profile imports nothing new, margin to be measured | |
`size-budget.json` is changed only by the owner's written grant (nothing is edited now).

## 5. Tests to write FIRST (each red before its code; hand-written expectations)
**Core (node)** `core/test/pinned-ids.test.ts`: `pinnedKey` id-based, length-prefixed (`'1'` and `1` the same, `'a:b'` safe), sides distinct, `isCellKey`, `isDataKey` false; `pinned-kernel.test.ts`: `focus.set` on a held pinned key ok / on an absent one `row-not-displayed`; a sort, a filter, a model update keep a pinned focus (and fix its column); `kernel.rowOf`; `editable` true/false by column and by the rule with `{ pinned: 'top' }` (a rule that throws: false, told once); a pinned key never selectable; `pinned-edit.test.ts` (controller): pinned and body rows of the **same id** edit independently (overlay not shared); two pinned rows do not collide; commit refused `read-only` when the rule says so; save request carries `pinned`; **orderStale stays false** after a pinned edit of the sorted column, true after the same edit of a body row; rolled-back refusal; removed pinned row mid-save (`rowRemoved` path); undo/redo of a pinned gesture; a gesture across a replaced band object. Conformance `conformance/cases/pinned-rows/{keys-cross,keys-page,keys-edge,keys-empty-body,ids}.json` (shapes + intents -> positions; the table of §3 verbatim, nothing copied from output).
**DOM (jsdom, fake geometry)** `dom/test/pinned-rows.test.ts`: two `rowgroup`s named by the texts; rows `role=row`, cells `gridcell`; `aria-rowcount`, `aria-rowindex` header -> top -> body -> bottom (paged grid: the page's rows); no `aria-selected`; box column empty; hidden columns; `rowClass` gets `pinned`; duplicates dropped + problem; > 5 warning; `set` replaces one side only; same id keeps focus and open editor; gone key; focused row gone -> nearest; geometry `block` reduced and restored on `set({top: []})`; cap/`bandHeights` (half view, whole rows, one-row minimum); windowing (offset follows focus, wheel); tree (flat, no chevron); paged grid (shown on every page); server model; GridState has no pinned; destroy removes bands and the geometry wrap; texts parity en/fr/ar. `pinned-rows-keys.test.ts`: every row of §3 in LTR and RTL, Mac flag for the Cmd row, goal column kept across bands, Shift+arrows clamped, Ctrl+Home from a band lands in the body, `ensureVisible` scrolls sideways for a pinned focus, focusin by pointer on a band cell sets the kernel focus. `pinned-rows-edit.test.ts`: F2, typing, Enter, Escape, Tab bounded by the band, Delete, yes/no toggle, Ctrl+Z / Ctrl+Y, refusal bubble, saving mark on a band cell, `editable` third argument, read-only `aria-readonly`, no `data-dzg-stale` on bands, body stays unstale, `save` payload, stale-paint iterates the body only. `pinned-rows-range.test.ts` (8b-2): block inside a band (keys and pointer), never across, copy, paste clipped (`outside` count), Delete, Ctrl+D / R, bulk, Ctrl+A body only, pointer `place` origin with a top band. Existing suites must stay green untouched (tree copies still not peers; `rowRenderer` tests).
**Mutants (once, by the combined reviewer, pure logic only, ~20):** `band.ts` (`bandHeights`, `crossBand`, `pageTarget`, key/dedupe wrapper, windowing offset clamp), `pinnedKey` / `isCellKey`, `reconcileFocus` pinned branch, `editableAt` info argument, controller `showNew` columns filter, `kernel.rowOf`. No mutants on DOM code.

## 6. Browser checks (Chrome headless, one browser at a time, no GUI app)
New `scripts/browser-pinned-rows.mjs`, group `pinned-rows`, on `hr.html` (a `?pinned=0` switch; top note row + editable totals row at the bottom): `--only pinned-rows`, plus `--only playground` if the demo changes, `--only columns` once (auto-size). Chrome fr light and ar RTL dark: 1 px alignment of band cells with header cells at scroll start / middle / end, with start and end pinned columns; sticky bottom band short content (at the bottom, Q3) and long content; top band under a floating filter row and a group band; `getBoundingClientRect` of body rows never under a band after Down / Up / PageDown / Ctrl+End (2.4.11); editor opens in a band cell, stays aligned while the body scrolls, Enter / Escape / Tab, save marks, undo; the half-view cap with 12 rows (windowing by wheel and by Down); forced colours (separator border); 200 % zoom; axe 0 (rowgroup naming, no nested rowgroup); no page error. **Firefox and WebKit once** (`--engine firefox|webkit --only pinned-rows`): the keys of §3 in the real DOM, sticky bottom band in RTL, sticky inline columns inside a band while scrolling sideways, an editor opened and closed in a band. `check:contrast` gets the pinned-row text/background and separator pairs. Mac Cmd keys: jsdom with `mac: true` only.

## 7. Order of work
Step 0 measures (core, base, `core/edit`, `-columns`, `columns.css`); sheet edits (below); tests red (core, then DOM); `ids.ts` + kernel seams -> core measure; `core/edit` changes -> measure; DOM base seams -> measure; `pinned-rows/band.ts` (pure) -> `crossBand`; feature (bands, renderers, geometry, cap, window) -> keys -> editing glue (editors/marks/rowOf) -> texts -> CSS -> demo -> `npm run` gate (`build`, `typecheck`, `test:ci`, `check:size`, `check:contrast`) -> Chrome `--only pinned-rows` -> Firefox / WebKit -> **8b-2** (range, fill) the same way -> mutants -> STATUS.md and this file's « Done ».

**Docs to edit with the code (not now):** `pinned-rows.md` (rule 1 severity; 5 « sibling rowgroup, not in the header »; 11 third argument; 13 key and `pinned`; windowing; a note on the id family; texts bundle), `editing.md` rule 1 (C6), `range-selection.md` and `fill.md` (one line each: bands), `a11y-protocol.md` 21 (band names, no nested rowgroup), `ROADMAP`, `CHANGELOG` (`pinnedKey` changes; `SaveChange.pinned`; `editable` third argument), STATUS.

## 8. Risks
- R1 **Core base is tight (185 B)** for five seams; a miss means asking 20–40 B or moving the focus-keep to the feature. Measure after each seam.
- R2 **Geometry wrap**: the feature replaces `read()` on the shared port. Other wrappers (tests, a future auto-height) must compose, not replace. Fallback: a 15–20 B `g.trim` seam in the base.
- R3 **Over-cap band** is windowed by hand: no native scroll, no touch pan. Rare (> half the view); documented. Native scroll was rejected because it breaks sticky pinned columns.
- R4 **Overlay id**: the overlay id of a pinned row is its key string; a body row whose app id is literally `p:t:3:abc` would share an overlay entry. Absurd, not impossible; documented, one test names it.
- R5 The `?? key` change at 4 sites alters nothing for body rows but touches tested code (`motion-gsap` saves, `range/copy`): run those suites.
- R6 **Top offset** is computed from the header row count, not measured: borders or a density change could leave 1 px. The 1 px browser check decides; if it fails, read it once per paint from `headerRenderer` (a base accessor, ~15 B). In a tiny view a band shows at least one row and the body can reach 0 rows.
- R7 No tooltip on pinned cells; hover and `data-context-row` are body only.
- R8 Peers: a fall-back in `cell()/keyOf()` could hand a tree copy or a pinned cell to code that assumed body rows (`spans`, `rules`, `motion`). Only `own` renderers are peers; `forEach` is the risky one (stale, rules, flip, saves walk it): audit each caller, give `stale.paint` the main map only.
- R9 Server / source models: a pinned row is not a page row; `rows.kind === 'client'` branches in `marks.ts` and the controller must treat pinned keys as client rows.
- R10 8b-2 pointer path (`place`, `cellAt`) is the most invasive code in two nearly full files; if the raise is refused it is cut, keyboard blocks stay.
- R11 Print (step 11) and auto height (step 10) depend on `api.rows(side)` and band heights staying numbers; keep both stable.

## 9. Owner questions (simple French; recommended first)
**Q1. Les blocs dans les lignes épinglées (souris et clavier).** Le bloc, le copier-coller, la recopie restent dans un seul bandeau (déjà décidé). Faire marcher la souris aussi coûte du code dans `range` et `fill`, qui sont presque pleins.
- A (recommandé) : clavier et souris, deux sous-étapes ; `range` 4 950 → ~5 200, `fill` 3 000 → ~3 150.
- B : clavier seulement dans les bandeaux (Maj+flèches, Ctrl+D) ; `range` ~+150, `fill` ~+80 ; la souris plus tard.
- C : pas de bloc dans les bandeaux ; on modifie, annule et enregistre une cellule à la fois (rien dans `range` ni `fill`).
**Q2. Les octets.** Base du cœur : jusqu'à 29 150 (reste 185 octets, il en faut ~120–170). Base DOM : +150–200 (22 400 reste vrai). `dom/pinned-rows` : 2 000 voulu, jusqu'à 2 300 si l'édition le demande. Nouveaux fichiers : textes `-pinned` (120/140/170) et `pinned-rows.css` (~450).
- A (recommandé) : on accorde ces lignes ; si ça dépasse, on revient vous voir avant.
- B : on garde 2 000 pour `pinned-rows` et on coupe le défilement interne des bandeaux trop hauts (les lignes en trop sont cachées, inatteignables) : refusé par l'accessibilité, déconseillé.
- C : on abandonne les lignes du bas (Q-B option C du plan) : seulement le haut.
**Q3. Peu de lignes dans la grille : où est la ligne du bas (un total par exemple) ?**
- A (recommandé) : collée en bas de la grille, comme un pied de tableau (+~40 octets).
- B : juste sous la dernière ligne, puis collée en bas quand la liste est longue (0 octet).
**Q4. La règle « modifiable » d'une colonne saura si la ligne est épinglée. Comment ?**
- A (recommandé) : un troisième argument `editable(ligne, contexte, { pinned })` ; le contexte de l'application n'est pas touché.
- B : `contexte.pinned` comme écrit dans la fiche : il faut copier le contexte à chaque appel, et il casse si le contexte n'est pas un objet.
**Q5. Ce que reçoit votre fonction d'enregistrement pour une ligne épinglée.**
- A (recommandé) : même forme que pour le corps (`key` du grid, `row` = votre objet) plus `pinned: 'top' | 'bottom'` ; vous retrouvez la ligne par `row`.
- B : en plus, l'identifiant de votre `getRowId` dans un champ `id` (quelques octets de plus dans `core/edit`).

## Done — 8b-1 (2026-10-27, not committed, no review yet)

Built: core seam, `core/edit`, DOM base seams, `@dzgrid/dom/pinned-rows` (bands, cap and window, keys, single-cell
editing, undo, saves, never stale), texts `-pinned`, `pinned-rows.css`, demo `playground/pinned.html` (`?lang=ar`,
`?theme=dark`, `?many=1`), browser group `pinned-rows`. Not built: §2.5 (blocks, paste, fill in a band) = 8b-2; until
then a block started in a band is inert and never leaves its row (test). Plan changes made while building:
- Ctrl+Home / Ctrl+End from a band go to the body's first / last row **and** first / last column, as in the body;
  Ctrl+Up / Ctrl+Down keep the column (the sheet's table says so now).
- The bands' layout is written on the elements (CSSOM: sticky, clip, contain, z-index) instead of an injected style
  element: −35 B, nothing for a CSP.
- All the key logic is one `g.move` (no `keys()` handler); the editors' Enter is kept inside a band by wrapping `g.step`.
- `SaveChange.pinned` is `undefined` on a body row (present, not absent: −15 B in `core/edit`, at 3 136 / 3 150).

**Tests that failed first (red for the right reason, then green):**
- `scripts/test/rebudget.test.ts` (step 8b-1 lines, 17 red: ceilings 29 000 / 21 980, no entries) and
  `release.test.ts` (exports, build lists): red before the config.
- Core: `pinned-ids` (7 red: `pinnedKey` by position threw `RangeError`), `pinned-kernel` and `pinned-edit` (whole
  files red: the same `pinnedKey`); then green with the seams.
- DOM: `pinned-rows-band` (red: module missing), `pinned-rows` + `pinned-rows-keys` (23 red with the feature but
  without the base seams: no peers, no `g.move`, no aria counts), `pinned-rows-edit` (13 red: no peers, editors on
  `rows.row`); theme `pinned-rows.test.ts` (6 red: no sheet, no pairs).
- Written after the code: the 5 conformance cases (`cases/pinned-rows/`, expectations by hand from §3), the range
  guard test, the browser checks.

**Sizes (check:size):** core 29 001 / 29 150 (+36); `core/edit` 3 135 / 3 150; DOM base 21 954 / 22 400 (+99);
`dom/pinned-rows` 2 080 / 2 150, ceiling 2 300 (Q2: the editing glue — store, band-bound Enter, `pinnedChanged`,
the focus kept — weighs ~180 B; without it ~1 900); texts 116 / 120, 130 / 140, 156 / 170; `pinned-rows.css` 301 / 350;
`dom/edit` 4 147 / 4 150, `dom/editors` 6 672 / 6 720, motion run 3 385 / 3 500 (unchanged lines). K.8 profile
83 911 / 84 000 (+174, 89 B left: step 10 should know). No line raised by compression alone.

**Gate (once, `caffeinate -i`, 2 workers, Node 24):** vitest 455 files / 6 966 tests green; `test:perm` 5 / 10;
`typecheck`; `build`; `check:size` 0 over; `check:contrast` 1 086 pairs, 0 below. Browser `--only pinned-rows`:
Chrome 36 / 36 (fr light, ar dark: alignment 1 px at start / middle / end / sideways, 2.4.11 keys, editor in a band,
save, undo, total recomputed, short body, axe 0, forced colours, 200 % zoom, the cap and its window), Firefox 7 / 7,
WebKit 7 / 7 (keys, RTL foot, sideways pinned column, editor).

**For the reviewer (mutants, pure logic only):** `pinned-rows/band.ts` (`crossBand`, `bandHeights`), `pinnedKey` /
`isCellKey`, `reconcileFocus`'s `held` branch, `editableAt`'s info, `kernel.rowOf` / `exists`, `showNew`'s body filter.
