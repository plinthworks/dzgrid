# Phase 5, step 11a — `@dzgrid/dom/range`, part 1: selecting a block of cells — blueprint (architect, 2026-10-25)

Status: **to validate with the owner** (questions S11-Q1 to S11-Q4 at the end, in French). Sources, which win in
this order: `decisions.md` « Part B (owner) » QB1, QB2, QB7, QB8 and the budget line; `partB-plan.md` B2–B8, B13,
B14, step 11a; the sheet `docs/behaviors/range-selection.md` (1–17, cited `RS n`); a11y §20 items 125–128, 134–136;
`step10-plan.md` « Done » / « Review » (the `@dzgrid/core/range` API as built: `rangeBox`, `boxRows`, `boxSize`).
Clipboard, Delete on a block and the counted sentences are **11b**; the fill handle, Ctrl+D/R, Ctrl+Enter bulk and
Angular are **12**. Clean room: our sheets, WAI-ARIA 1.2 grid, APG grid keys, WCAG 2.2 (1.4.1, 1.4.11, 2.1.1,
2.4.11, 2.5.7, 4.1.3); never another grid's or spreadsheet's code (`node_modules` included).

## Findings (code read at the step-10 working tree)
1. **The feature seam is enough** for keys, paint and focus: `FeatureHandle.keys(e, at, owner)` runs before
   `intentFor` (`keys/router.ts`); `afterRows(frame)` runs at each paint over `g.rowRenderer.mounted`
   (`Map<RowKey, RowView>`, `RowView.cells: Map<column, CellView>`, `slot` set on a detail row); `g.step(intent)` is
   the router's own move (spans, a detail as one stop, pages as a distance over variable heights); a click-like
   focus is `kernel.dispatch({ type: 'focus.set', … }, 'user')` + `g.restoreFocus()` (the tree's back-key does so).
   `emit` (`@dzgrid/core/internal`) sends `rangeChanged` (a type since step 10, 0 B).
2. `intentFor` returns null for **every** Shift combination (`raw`: `if (e.shiftKey) return null`) except
   Escape/F2/Enter rules; so the tree's and the detail's `keys` (they call `intentFor`) never take a Shift+arrow,
   and the editors' `keys` return false on `e.shiftKey`. Range keys are order-independent among features, except
   Escape while an editor waits for its paint (`editors/index.ts` « wait »), which is the editor's — correct.
3. The router handles Escape for a shown tooltip **before** the features: the first Escape hides the tooltip, the
   second drops the block. Kept (pinned by a test).
4. **Two base conflicts** (B14 widened): `render/viewport.ts:212` writes `aria-multiselectable` from row selection
   only (it would erase a feature's write at every paint); `interact/select.ts` makes rows from Shift+click when
   `selection.click: true` — QB1 says Shift+click makes cells with `range()`.
5. A pointer press on a cell focuses it natively (cells are `tabindex=-1`, `focusin` → `focus.set`); nothing in the
   base handles `pointermove` over the body except the spans' hover. A click after a drag reaches `select.ts` (its
   target the common ancestor row): with `selection.click: true` it would select that row.
6. Both pseudo-elements of a cell are taken by `edit.css` (`::after` pending/saved/failed, `::before`
   saving/refused): the block's edge cannot use them. `edit.scss` already flips by `:dir(rtl)` (precedent).
7. The tree's pinned parents are drawn by a renderer spawned from the base one (`rowRenderer.spawn`), private to
   `@dzgrid/dom/tree` (3 795 / 3 800, full). The base keeps `#spawned` private.
8. `boxSize` walks top..bottom (an array of data nodes): Ctrl+A over 1 M rows allocates 1 M references once per
   size sentence — acceptable after the pause (measured in Chrome, risk R4), never in the paint.

## API
```ts
// @dzgrid/dom/range  (entry; external: @dzgrid/core, /internal, /range, @dzgrid/dom, @dzgrid/dom/internal)
export const RANGE_KEYS: readonly RangeMessageKey[];            // 11a: 'range.rows','range.cols','range.size','range.cleared' (+ S11-Q4)
export interface RangeOptions {
  /** A press and drag of the mouse or pen makes a block (RS 8); false: keys, Shift+click and the API only. Default true. */
  readonly drag?: boolean;
}                                                               // 11b adds canCopy, guard, raw, max; 12 the fill's
export interface RangeApi {
  /** The block (two cells at least), else null. Corners by keys, never positions. */
  get(): CellRange | null;
  /** Sets it (source 'api': not announced, the focus untouched — the app calls ensureVisible); false and nothing changed
   *  when a corner is not shown or its column not visible (a `problems` event `invalid-range`, never a throw); null clears. */
  set(r: CellRange | null): boolean;
  clear(): void;                                                // = set(null)
  /** The box for the rows shown now (`rangeBox` of core/range), null without a block. */
  box(): RangeBox | null;
}
export interface RangeFeature extends GridFeature { api(grid: { readonly kernel: GridKernel<any, any> }): RangeApi | null }
export function range(o?: RangeOptions): RangeFeature;          // one object may serve several grids (WeakMap by kernel, as edit())
// locales/{en,fr,ar}-range: EN_RANGE / FR_RANGE / AR_RANGE, RangeMessages, RangeMessageKey (part-texts.ts, type only)
```
Event: `rangeChanged { source, range }` once per change of the block (`user` keys/pointer, at most once per frame
while dragging; `api`; `data` for a drop by QB7/B2). A 1 × 1 result is `null` (RS 5). Setup throws `range: missing …`
when a text is missing (as `edit()`).

**State** (closure): `r: CellRange | null`; `own` (true while the feature moves the focus); `drag` (press cell, last
client point, rAF id); `said` timer. Invariant **follows** = `r.focus` is the kernel's cell focus. Shift+keys extend
`r.focus` when it follows; otherwise (after Ctrl+A, Shift+Space, an API set, or none) a new block starts with
`anchor = the focused cell` (S11-Q2).

## Keys (owner `cell`; `header` for Ctrl+A only; Mac: Cmd for Ctrl; RTL mirrored by `intentFor`)
The hook builds `{ key, code, ctrlKey, metaKey, altKey, shiftKey: false }` and asks `intentFor(…, { dir, owner, mac })`:
the same meaning as the move without Shift, mirrored in RTL for free. Alt (and Ctrl on a Mac) → not ours.

| Key | LTR | RTL (`dir=rtl`) | Effect |
|---|---|---|---|
| Shift+→ / Shift+← | `move col +1 / −1` | Shift+← = `+1` (logical end), Shift+→ = `−1` | corner one cell; focus follows (QB2) |
| Shift+↓ / Shift+↑ | `move row ±1` | same | corner one row; a detail is one stop; **never into the header** (Shift+↑ on row 0: nothing, `true`) |
| Ctrl+Shift+arrows | `edge` | mirrored | corner to the edge |
| Shift+Home / Shift+End | `edge col first/last` | logical | row's first / last visible column |
| Ctrl+Shift+Home / End | `edge both` | logical | first / last cell shown |
| Shift+PageUp / PageDown | `page ∓1` | same | a page (a distance over variable heights, D7) |
| Shift+Space | — | — | the whole row, visible columns; focus stays |
| Ctrl+A (`code KeyA`: AZERTY, Arabic layout) | `selectAll` | same | every cell shown (QB1; rows by their box); focus stays (S11-Q2); on a header too |
| Escape (no tooltip shown) | — | — | drops the block, « Sélection effacée » once; `false` without a block (the grid's Escape) |
| plain arrow, Home, End, Page, click | — | — | not taken: the grid moves, the focus change drops the block (said once) |
| Delete, Ctrl+C/X/V, Ctrl+D/R, Ctrl+Enter | — | — | **not in 11a** (11b, 12): Delete keeps today's one-cell clear |

Not taken: owner `editor`, `filter-input`, `popup`, `cell-widget`, `outside`; a nested grid's key (the router's
`closest('.dzg')` check); `e.isComposing`. Shift+arrow from no focus: the router's `current()` rule (first cell).
Implementation: `own = true; g.step(intent); own = false; r = { anchor, focus: kernel.focus }` when the result is a
body cell; header or check box results are refused **before** stepping (row 0 + up-ish intents) — [À VÉRIFIER in
`moveFocus`: `page −1` and `edge row first` from a cell never reach the header; a test pins it either way].

## Pointer (`drag !== false`; mouse and pen, `isPrimary`, button 0; touch: nothing new, RS 9)
| Gesture | Effect (LTR and RTL alike: the cell under the pointer) |
|---|---|
| press on a data cell, move to another cell | block anchor = pressed cell, corner = cell under the pointer; `data-dzg-ranging` on the root (`user-select: none`), pointer captured, the page's text selection emptied |
| near an edge of the body (band = max(24 px, row height); inside the header, the sticky inset `g.inset`, the pinned segments) | auto-scroll: one rAF loop, speed ∝ depth into the band (≤ 1 row height per frame), logical `g.scroll.scrollTo` (scaled scrolling, 1 M rows), inline by `geometry.writeScrollInline` (logical, RTL by the direction module); stops at either end, on release, `pointercancel`, `lostpointercapture`, Escape, window blur |
| release | focus to the moving corner (S11-Q1 A), size said after the pause, the next `click` swallowed once (capture listener on `el.body`, only after a real drag: finding 5) |
| Shift+click (press) | `preventDefault` (no text selection, no native focus); anchor = `r.anchor` if it follows, else the focused cell; corner = the cell; focus to it (QB2); Shift+drag goes on extending |
| press on `.dzg-check`, a header, a field, a widget (`INTERACTIVE`), a detail cell, a sticky parent, a nested grid | not a block (today's behaviour) |

**Cell under the pointer: geometry, not `elementFromPoint`** (lead; a deviation from B6's wording): one
`getBoundingClientRect` of the viewport per frame (read before any write), then the row = `rowLayout(g).indexAt(
logicalTop + y − headerBottom)` clamped to `[0, count−1]`, the column from `columns.layout` (start pinned widths after
the check width, centre with `scrollInline`, end pinned; x measured from the inline-start edge, physical side only
through `dir.ts`). Why: the sticky parents, the tooltip and the overlay sit over cells; spans give the row under the
pointer (B13: not grown); scaled scrolling stays logical. A point over the sticky inset is « above the top band ».

## Paint (`afterRows`) and a11y
- One `rangeBox(r, f.displayed, visibleIds)` per paint (a `Map` id → index built once per `columns.version`); for each
  mounted row: `i = displayed.indexOf(key)`; data rows in `[top..bottom]` only; cells with a column index in
  `[start..end]` get `dzg-cell--range` and `aria-selected="true"`; edges `--rs`/`--re` on the first/last column,
  `--rt`/`--rb` on the **first / last data row** of the box (a detail at the box's top draws no edge on it).
  A `Set` of decorated cells (as the tree's): only those are undone; a recycled or pooled cell loses its classes at
  once; no block and an empty set = no work. **`g.editor.cell` is left untouched** (retained-row contract 5).
- Spans: a spanning cell is decorated by its origin cell's row and first column (RS 16; pinned by a test as v1).
- Sticky parents (S11-Q3 A): the stack's mounted rows decorated as data rows, classes only, never `aria-selected`
  (the copies are not the rows read).
- `aria-multiselectable="true"` while `range()` is set up (base seam); row selection keeps its own row
  `aria-selected` (finding: rows with `mode !== 'none'` already say true/false; unchanged; risk R6).
- Sentences (polite, `g.live.announce`): size after **400 ms** of no change (keys, release, Ctrl+A, Shift+Space;
  one `scope.timeout` restarted): « {rows}, {cols} sélectionnées » from `boxSize` (data rows); cleared at once
  (Escape, plain move/click, collapse to a drop); a Shift+arrow back to one cell says nothing (the cell is read).
  The API never speaks.
- `range.css` (`@dzgrid/theme`, layered + unlayered, built by `build:theme`): tint `var(--dzg-range-bg,
  var(--dzg-row-selected-bg))`, text kept; edges by **one inset `box-shadow` list driven by four custom properties**
  (`--rs` etc. set the width, `:dir(rtl)` flips the inline sign) — no pseudo-element (finding 6), no layout change,
  the focus ring (outline) and the saving border (`::before`) stay visible on top; forced colours: `Highlight` edge,
  `forced-color-adjust: none` only on the tint with `Highlight`/`HighlightText`; no `transition`/`animation` at all
  (reduced motion: nothing to reduce; a test greps it); `[data-dzg-ranging]{user-select:none}`.

## Drops (QB7, B2, B4; « said once »: after the first drop `r` is null, later events of the same task say nothing)
`sortChanged`, `filterChanged`, `quickChanged`, `pageChanged`, `orderStale → false` (reapply), `modelUpdated` kind
`reset`, `columnsChanged` when the visible ids or their pins changed (a signature; a resize keeps it), any
`modelUpdated` after which `rangeBox` is null (a corner filtered, collapsed, removed), a focus change not `own` and
not equal to `r.focus` (plain arrow, click, the editors' Enter-down, Tab into the header). Kept: a host transaction
or an edit (`delta`/`update`) with both corners shown, a tree expand, a scroll, a resize, focus leaving the grid.
Source: `user` for a key/click drop, `data` otherwise. Sentence `range.cleared` (S11-Q4).

## Interplay
- **Row selection (box)**: Space and the box tick rows; the header box ticks all rows; Ctrl+A is the block (QB1);
  Shift+click on a cell is the block even with `selection.click: true` (base yield); Shift+click on a box = rows.
- **Editing**: an open editor owns its keys (Shift+arrows select text in the field); a press elsewhere saves (Q5)
  then may start a block; F2/Enter on the corner edit it (QB2); the editor's cell keeps its classes; `enterMoves:
  'down'` moves the focus → the block drops (Excel's Enter-inside-the-block is not in this phase).
- **Tree**: Shift+arrows on the tree column are ours (finding 2); plain →/← and `*` stay the tree's, the block kept
  unless a corner is collapsed away (drop, said). **Detail**: a detail row is one stop, never tinted; a block of the
  outer grid never reaches into a panel; each nested grid needs its own `range()` and has its own block.
- **Server grids**: a block within the page; a page change drops it; Ctrl+A = the rows of the page shown.

## Base versus entry (gz bytes, estimates to measure; S11-Q3 changes the base line)
| Where | What | Bytes |
|---|---|---|
| `@dzgrid/core` | nothing (types since step 10) | 0 |
| `@dzgrid/core/range` | unchanged, imported by the entry | 0 (2 897 / 4 000) |
| `@dzgrid/dom` base | `GridContext.multi?: boolean` (type); viewport `mode==='multi'\|\|g.multi` (~10); `select.ts` Shift on a cell yields to `g.multi` after the click events (~15); `RowRenderer.spawned` getter (~15, S11-Q3 A); `RangeMessageKey` in `g.msg` (type) | **+25 to +40** → ~21 575–21 590 / 21 700 (grant 21 980 untouched) |
| `@dzgrid/dom/range` | keys ~450, pointer ~400, auto-scroll ~250, paint ~350, drops/focus ~250, sentences ~150, API/event ~150 | **~1 800–2 000** / 4 500 (stop and ask above 2 200: 11b + 12 need ~2 500, QB8) |
| `locales/{en,fr,ar}-range` | 4 texts (5 with S11-Q4 A), plurals `one/other` (ar `zero/one/two/few/many/other`) | ~150 / 170 / 240 of 350 / 400 / 500 |
| `@dzgrid/theme/range.css` | tint, edges, RTL flip, forced colours, ranging | ~250 / 500 |
| K.8 profile, real example | base seam only | ~+30 |

Wiring (at the implementation): `packages/dom/package.json` `./range`, `./locales/*-range`; `scripts/build.mjs`;
`size-budget.json` + `scripts/rebudget.mjs` ceilings (`@dzgrid/dom/range` 4 500 over `@dzgrid/dom`, texts, `range.css`);
the `@dzgrid/core/range` / `@dzgrid/dom/range` aliases in `vite.config.ts` and `packages/dom/tsconfig.json` (editing
`vite.config.ts` makes the port-4700 vite restart by itself: do it once, never kill it); `contrast-pairs.json`
(tint/text 4.5:1 in light, dark, Midnight, Clinic, contrast; edge/tint and edge/background 3:1; hue ≥ 60° from the
focus ring and `--dzg-saving-color`); layering (the base never imports `/range`; `/range` never `/editors`,
`/filters`, `/tree`), public-api, release tests; the playground `orders-edit.html` with `range()` on, `?range=0` off.

## Tests to write FIRST (red on a stub entry whose feature does nothing; runs saved as scratchpad `a11-red*.txt`)
Each file names `range-selection.md`; ltr and rtl; `mac: true` and false; jsdom with the fake geometry and
`env.raf`/fake clock.
1. `range-keys` — every row of the key table, ltr/rtl (Shift+← in RTL toward the logical end), Cmd on a Mac and
   Ctrl+Alt (AltGr) not ours, Ctrl+A by `code` on AZERTY and an Arabic layout, Shift+↑ on row 0 stays out of the
   header, Shift+PageDown over variable heights equals the router's page, spans, a detail as one stop, Ctrl+A on a
   header, the focus on the corner after each key (QB2), Ctrl+A / Shift+Space keep the focus then Shift+arrow starts
   from it (S11-Q2), owners editor / filter-input / popup / cell-widget ignored, a nested grid's keys ignored,
   features in both orders (tree, editors, edit, range), the tooltip's Escape first.
2. `range-pointer` — drag across cells (block, `data-dzg-ranging`, capture), Shift+click and Shift+drag from the
   anchor, the click after a drag swallowed (no `rowClicked`, no row selected with `click: true`), presses that
   start nothing (box, header, field, widget, detail, sticky parent, nested grid, touch, right button),
   auto-scroll by fake frames in four directions, ltr/rtl, pinned segments, the sticky inset, stopping at the ends
   and on release/cancel/Escape/blur, the focus at release (S11-Q1).
3. `range-paint` — pooled and scrolled cells, recycled cells undone, pinned start/end with edges in the right
   segments, RTL edge classes logical, spans (origin rule), tree levels, fillers/details/loading rows never tinted,
   edges on the first/last data row, sticky parents (classes, no `aria-selected`), the editor cell untouched, 100 000
   rows then scroll, **1 M rows with `maxPhysical` lowered** (Ctrl+Shift+End, then scroll to the middle: the mounted
   cells' classes equal the oracle).
4. `range-clear` — each drop event of « Drops », each « kept » case, said exactly once (several events in one
   task), `rangeChanged` sources, a corner collapsed, a column pinned/hidden/moved vs resized.
5. `range-a11y` — `aria-selected="true"` only on mounted data cells of the block, **absent** elsewhere (never
   `"false"`), none for one cell, `aria-multiselectable` with `range()` and selection `none` / `single` / `multi`
   (base seam), the size sentence after 400 ms once (none while keys follow), ar plurals (2 → dual), cleared at once.
6. `range-api` — get/set/clear/box, `set` refusing a hidden column or a row not shown (false, `problems`, no
   throw), no sentence, focus untouched, one `rangeChanged` per change, several grids with one feature object,
   destroy (no listener, no class, no timer, `api()` null).
7. `range-seams` — base bytes: viewport and `select.ts` yield, the layering guard, `range.css` (no colour literal,
   no physical side outside the `:dir(rtl)` flip, no transition/animation).
8. **Random walk `range-walk`** (seeds `RANGE_SEED`, 200 seeds × 400 steps, ltr/rtl, flat/tree/detail/server page):
   Shift+keys, Ctrl+A, Shift+Space, Escape, plain moves, clicks, Shift+clicks, drags with auto-scroll frames, sorts,
   filters, quick search, collapses, transactions (insert/remove above, inside, at a corner), column hide/pin/resize,
   scrolls, an editor opened and closed. Oracle (written by hand from the sheet: anchor/focus by keys, indices from
   the oracle's own display list): the classes and `aria-selected` of every mounted cell, the focus on the corner
   when it follows, `rangeChanged` sequence, sentence count; never a stale class, never a lost focus.
9. Texts: `range-texts` (every key in en/fr/ar, plurals render, `RANGE_KEYS` = the bundle's keys).

**Mutants** (in a repo copy, rsync without `node_modules`, symlinked; deleted after; each must be killed): RTL not
mirrored (raw arrows); `--rs`/`--re` swapped; `aria-selected="false"` written outside; `aria-selected` on a
filler/detail/loading row or a sticky copy; tint on 1 × 1; recycled cells not undone; the editor cell repainted;
a drop not said / said twice; a transaction with both corners shown drops; `quickChanged` or a pin keeps the
block; a resize drops it; anchor reset at each Shift+arrow; focus not moved (QB2); Shift+↑ reaching the header;
Ctrl+A ticking rows; Shift+click selecting rows with `click: true`; the post-drag click not swallowed; a drag from
the box or a field; a nested grid's key taken; the size said per key or without the pause; auto-scroll not
stopped at release / not clamped / physical instead of logical (1 M rows); two `rangeChanged` per change; the
API announcing; `aria-multiselectable` erased by the base paint.

**Browser** (`npm run test:browser -- --only range`, one headless Chrome at a time, closed; then Firefox, WebKit
for keys): axe 0 with a block in fr light Clinic, ar dark Midnight, forced colours (`emulateMedia`); **a real mouse
drag** (`page.mouse.down/move/up`) across cells, into the bottom band (scrolled, corner past the first screen) and
across the start pinned column in RTL; edges' physical sides measured by `getBoundingClientRect` + computed
`box-shadow` (ltr: start = left; rtl: start = right); Shift+arrows by the real keyboard in fr and ar (`Maj+←` grows
toward the screen's left in ar); 1 M rows (scaled scrolling): Ctrl+Shift+End then drag-scroll back, classes vs the
oracle; variable heights and sticky parents (tree page); reduced motion (no animation computed);
**playground `orders-edit.html`** fr and `?locale=ar-DZ&theme=dark&skin=midnight`: a block on « Qté », an editor
opened in the block and closed, Shift+click, Ctrl+A, Escape; screenshots in `docs/screenshots/`.
Gate at the commit (once): `build`, `typecheck`, `test:ci`, `test:perm`, `check:size`, `check:contrast`,
`test:browser` (full, the screen changed); no orphan process (`ps`).

## Risks
R1 `dom/range` over 2 000 in 11a (pointer + auto-scroll are the large part): measure after keys+paint, before the
pointer; QB8 split if the three steps exceed 4 500. R2 geometry hit-testing wrong under scaled scrolling or the
sticky inset (browser 1 M check; fall back to one `elementFromPoint` per frame, +~60 B). R3 Ctrl+A on Mac
Safari/WebKit (`Cmd+A` may select the page first): `preventDefault` in the hook; browser check. R4 `boxSize` on
1 M rows after the pause (measure; a counting loop in the entry if > 16 ms). R5 inset `box-shadow` composition with a
theme's or a bridge's own cell `box-shadow` (Bootstrap/Tailwind bridges): `themes` browser run with a block. R6 rows
carrying `aria-selected="false"` (row selection) next to cells carrying `"true"`: reader noise, listening §20/136. R7
a drag's native focus on press + capture in Firefox (the press focuses the first cell, fine; the click swallow must
not eat a real click). R8 the post-drag click suppression vs host `cellClicked` listeners (documented: no click
event after a drag). R9 editing `vite.config.ts` restarts the 4700 server (expected; never killed).

## Not in 11a
Delete on a block, copy/cut/paste, `rangeCopied`, `canCopy` (11b); fill handle, Ctrl+D/R, Ctrl+Enter, Angular
`range()` / `(rangeChanged)` (12); touch handles, a column-range key (Ctrl+Space), several blocks, Enter moving inside
the block.

## Questions au propriétaire (★ = recommandé)

**S11-Q1. Pendant un glisser à la souris, où va le focus ?**
- **A ★** il reste sur la cellule de départ pendant le glisser, puis va au coin qui bouge au lâcher (comme les
  touches, QB2) ; la taille est dite une fois.
- B il suit chaque cellule pendant le glisser (le lecteur d'écran lit tout, la grille défile davantage).
- C il reste sur la cellule de départ, même après (comme Excel).

**S11-Q2. Après Ctrl+A ou Maj+Espace, où est le focus ?**
- **A ★** il ne bouge pas (pas de saut à la fin d'un million de lignes) ; Maj+flèche repart ensuite de la cellule
  qui a le focus.
- B il va à la dernière cellule du bloc.

**S11-Q3. Les parents épinglés d'un arbre (en haut quand on défile) montrent-ils la teinte du bloc ?**
- **A ★** oui, la teinte seulement (pas `aria-selected` : ce sont des copies) ; ~15 o dans la base.
- B non (0 o), écrit dans la fiche.

**S11-Q4. Phrase quand un tri, un filtre ou une recherche efface le bloc (QB7) :**
- **A ★** une phrase à part : « Sélection effacée : les lignes ont changé » (un texte de plus, ~40 o par langue).
- B la même « Sélection effacée » que pour Échap.

## Done
(2026-10-25, not committed. Owner S11-Q5: 11a accepted at 2 846 B gz, the fill handle of step 12 in its own entry
(QB8), the clipboard stays here; S11-Q6: the vite aliases added — the 4700 server reloaded itself and answered.)

**Built.** Base seam: `GridContext.multi` (type), viewport `aria-multiselectable` from `mode === 'multi' || g.multi`,
`select.ts` Shift+click on a cell left to the block when `g.multi` (after the click events; the box still ticks rows),
`RowRenderer.spawned`; `RangeMessageKey` in the message types. Entry `packages/dom/src/range.ts`, `range/index.ts`
(keys, drops, paint, API, sentences; the box by `rangeBox` of `@dzgrid/core/range`), `range/pointer.ts` (press, drag,
Shift+click, auto-scroll, the cell under the pointer by geometry). Texts `locales/{en,fr,ar}-range`. Theme
`range.scss` → `range.css` and `range.unlayered.css` (`build:theme`); `--dzg-range-edge` given by Clinic and by
`contrast.scss` (their success is too near their accent / saving colour); `check-contrast.mjs` reads a skin's own
`--dzg-*` colours. Wiring: `packages/dom/package.json`, `scripts/build.mjs`, `size-budget.json`, `scripts/rebudget.mjs`
ceilings, aliases in `vitest.config.ts`, `tsconfig.spec.json`, `packages/dom/tsconfig*.json` and `vite.config.ts`.
Playground: `orders-edit.html` with `range()` on (`?range=0` off), `range.css`, a step line fr / ar. Browser page
`packages/dom/test/browser/range.html`, checks `scripts/browser-range.mjs` (`-- --only range`; in the full run).

**Tests that failed first** (on a stub entry doing nothing; scratchpad `s11-red-budget.txt`, `s11-red-dom.txt`,
`s11-red-seams.txt`):
- `rebudget.test.ts` « Phase 5 step 11a » (ceiling null ≠ 4 500), `release.test.ts` « step 11a subpaths » (no `./range`).
- 79 of 87 red across `range-keys`, `range-pointer`, `range-paint`, `range-clear`, `range-a11y`, `range-api`,
  `range-walk` (4 configurations) and the theme's `range.test.ts` (8 / 8). Green on the stub: five guards asserting an
  absence (AltGr not ours; Escape without a block not taken; field / widget / filter input / popup keep their keys; an
  open editor keeps Shift+arrows; a press and release on one cell is a click), kept; and the 3 `range-texts` tests
  (deviation: the bundles, data, were written with the stub).
- `range-seams`, run with the three base files stashed: 3 / 3 red; `range-layering` 2 / 2 green (guards).
- `contrast.test.ts` « T-1 » (a skin's own colour read): red, then `skinFromCss`.
- After the mutants (each red on its mutant): a path tree's fillers never tinted; the editor's cell keeps its edges
  when the block grows past it; the inline auto-scroll stops at the centre's end.

**Found by the tests while building:** the model is told before the sort / filter / search event, so a filter hiding a
corner said « cleared » (the walk): `modelUpdated` of kind `query` is a reorder. Clinic's success is 44° from its accent
and the contrast palette's dark success near its cyan saving border (`check:contrast`).

**Random walk** (`range-walk.test.ts`; oracle by hand: the corner by the router's rules, kept or dropped, the sentence,
`rangeChanged` count, every mounted cell's classes and aria-selected, the focus on the corner, `rowClicked` count;
flat ltr, rtl, tree, detail): 12 × 150 per configuration in the suite; **200 × 400 run once: 0 difference (174 s)**.

**Mutants** (in a copy, rsync without node_modules, linked; deleted after): **33 run, 31 killed** (3 of them after the
three tests above), 2 equivalent: a press on the box (already refused as a `[tabindex]` widget) and a nested grid's
press (its rows have no key in the outer renderer; the redundant `.dzg` check was removed). Killed: RTL not mirrored,
`--rs`/`--re` swapped, `aria-selected="false"` outside, `aria-selected` on the pinned copies, details / fillers tinted,
a 1 × 1 tint, recycled cells not undone, the editor cell repainted, a drop not said / said twice, a transaction keeping
both corners dropping, the search keeping the block, a pin keeping it, a resize dropping it, the anchor reset by each
Shift+arrow, the focus not moved by the keys (QB2) / at the release (S11-Q1), Shift+↑ into the header, Ctrl+A ticking
rows, the base yield gone (rows on Shift+click), the post-drag click kept, a drag from a field, the size said without
the pause, the auto-scroll not stopped at the release / not clamped / physical instead of logical, two `rangeChanged`
per change, the API speaking, `aria-multiselectable` erased by the paint, the RTL edges not flipped and a transition
(CSS).

**Browser** (one headless browser at a time, closed): `--only range` Chrome **33 / 33** (fr light Clinic, ar dark
Midnight: a real drag, the edges' physical sides, axe 0, Shift+arrows by the keyboard, the size said once, the
bottom-band auto-scroll, the pinned start column right to left; forced colours Highlight / HighlightText and axe 0;
reduced motion; 1 M rows Ctrl+Shift+End then halfway, against the oracle; the tree's pinned copy tinted; the real
playground `orders-edit.html` fr and ar: a drag on « Qté », its size said, F2 and Escape in the block, Shift+click,
Ctrl+A, Escape said); Firefox 7 / 7 and WebKit 7 / 7 (ar). Screenshots `docs/screenshots/step11a-*.png`.

**Sizes** (gz): `@dzgrid/dom/range` **2 789** over the DOM base (budget 4 500; 11b's clipboard must fit the rest);
DOM base 21 566 / 21 700 (+18, the entry not raised); texts 179 / 203 / 305 (350 / 400 / 500); `range.css` 376 / 500;
Clinic 472 / 650; core 28 916, `core/edit` 3 098, `core/range` 2 897 unchanged; K.8 82 843 / 83 500.

**Deviations (lead):**
1. No `invalid-range` problem code (the core is frozen): a refused `set` tells `unknown-row-id` or `unknown-column`.
2. No `modelUpdated` kind `reset`: `setRows` is a transaction for the block (kept while both corners are shown).
3. « Follows » is a flag (Shift+keys, Shift+click, drag set it; Ctrl+A, Shift+Space, the API clear it).
4. A press without Shift drops the block at once, a click on its own cells too.
5. Forced colours: the edges in `HighlightText` (a `Highlight` edge would not show on the tint).
6. The paint runs from a second handle put last in `g.features` (the tree draws its copies in its own `afterRows`).
7. The walk reads what is shown from the core's `displayed` (tested by the core's suites); the block is all the oracle's.
8. Server pages are covered by `range-clear` (Ctrl+A on the page, a new page drops), not by the walk.

**Gate** (once, `caffeinate -i`, every vitest pass at `--maxWorkers=2`): `build` green; `typecheck` green
(core, dom, tests, Angular templates); `vitest run` **384 files, 6 062 tests, all green** (217 s); `test:perm` (PERMS=1000)
5 files, 10 tests green (150 s); `check:size` 84 entries, 0 over; `check:contrast` 852 pairs, 0 below; `test:browser`
(full): 879 / 881 at first — two playground edit checks (fr: « Serveur injoignable », « Supprimer … dans 3 s ») failed,
with `range()` off too: the block's hint added as a step line pushed rows O-0009 / O-0010 below the 900 px window. The
hint moved under the grid (`playground/demos/page.ts`), the browser suite run again: **881 / 881**. Angular untouched (no
fixture run). No orphan test process.

## Review
(2026-10-25, not committed; the reviewer's and the test analyser's reports.) Each fix with a test first, red on the
step's code (run `s11-rev-red.txt`: 8 red — the theme's forced colours, `set()` shape, the editor's aria-selected, the
pen, the swallow, the cancel, the pointer ids, the scale).

- **R1, the click swallow** (`pointer.ts`): armed only by the release of a drag, for the click of that same task
  (cleared by `scope.timeout(…, 0)`); a cancel, a lost capture or a blur never arm it, so a later click (Enter on a link,
  a reader's click, `el.click()`) goes through.
- **R2, a cancelled drag**: `pointercancel`, a capture lost without its release and the window's blur give back the block
  from before the drag (none after a plain press; a Shift+press's own block), quietly — no focus move, no swallow, no
  sentence. Escape stops the drag keeping its block, then drops it (said). **Lead decision: a pen is like a finger** (no
  drag-select: it would scroll and select at once; Windows Ink sends `pen`, so a pen selects by Shift+tap or the keys);
  written in range-selection.md.
- **R3**: `pointerup` / `pointercancel` / `lostpointercapture` count only for this gesture's `pointerId`.
- **R4, `set()` never throws**: the shape is checked first (two corners, each a string row key and column id); otherwise
  `invalid-setting` at `range`, false, nothing changed.
- **R5, a scaled ancestor**: the point is divided by the viewport's scale (client box over its layout box, each axis).
  jsdom test (×2) and a browser check (`transform: scale(0.75)` and `zoom: 1.25`).
- **R6, forced colours**: `forced-color-adjust: auto` put back on the cell's children and its `::before` / `::after` (the
  badges, links and edit marks keep the system's colours).
- **R7**: with no block any more, the editor's cell keeps its classes while it edits but loses `aria-selected`.
- **The analyser's 21 tests** (`scratchpad/t11-gaps.test.ts`, kept) moved into `range-keys` (Escape's source `user`),
  `range-pointer` (the speed cap, the band under the pinned parents, a point over them, the box column, a pinned end
  column, a move inside the pressed cell, the swallowed click prevented, Shift+mousedown prevented, non-primary and other
  pointers — extended to `pointerup` / `pointercancel` of another id, the text selection emptied and the capture at the
  drag's start, Escape mid-drag), `range-a11y` (nothing said while the button is held, data rows only in the size),
  `range-api` (which refusal, `set()` resets « follows »), `range-clear` (a focus moved by the data keeps the block),
  `range-paint` (the pinned copies tinted at the very paint that draws them, with their edges: the range paint already
  runs last). All green on the step's code but the pointer-id one (R3). The step's « cancel keeps the block » test
  changed on purpose (R2).

**Sizes after the review**: `dom/range` 2 949 B gz over the base (4 500; +160: the shape check, the scale, the
restore, the ids), `range.css` 398 / 500, base 21 566.

**Gate after the review** (once, `caffeinate -i`, every vitest pass at `--maxWorkers=2`): `build`, `typecheck` green; `vitest run` **384 files, 6 084 tests green**; `test:perm` 10 / 10; `check:size` 84
entries, 0 over; `check:contrast` 852 pairs, 0 below; `test:browser` (full, Chrome, with `--only range`'s checks and the
playground page fr / ar) **885 / 885**; `--only range` Firefox 7 / 7, WebKit 7 / 7. No orphan process.
