# The fill handle, Ctrl+D / Ctrl+R and bulk edit

Written before the code (CLEANROOM). Sources: the public documentation of spreadsheets about the fill
handle (drag the small square at a selection's corner: a value is copied, a series goes on; holding Ctrl
swaps the two) and fill down / fill right, WCAG 2.2 (2.5.7 dragging movements, 2.5.8 target size, 2.1.1
keyboard). Plans: `partB-plan.md` (B12), `step10-plan.md` (F1–F7); owner decisions QB5 (bulk by
Ctrl+Enter), Q9 (refused cells counted). Our own earlier code, re-read: ngx-sheetgrid's pure
`fill-handle.ts` (its `Date` arithmetic replaced by the core's day arithmetic). Blocks:
`range-selection.md`; clipboard: `clipboard.md`.

## What the user does
Selects a cell or a block and drags the small square at its bottom corner down, up or sideways; or presses
Ctrl+D (fill down) or Ctrl+R (fill to the end); or types a value in one cell of a block and presses
Ctrl+Enter to write it in every cell of the block.

## What they observe
- While dragging, the cells to fill are outlined as a block; at the drop they are written: a value is
  copied, a number or date series goes on (`1, 2` → `3, 4, 5`), a pattern repeats (`a, b` → `a, b, a`).
- Ctrl held at the drop swaps copying and the series: one number dragged with Ctrl counts up by one.
- One gesture: one save request, one Ctrl+Z gives every cell back; refused cells blink and are counted.

## Behaviours (numbered, each one a test)

**The handle**
1. A square drawn small (8 px) with a hit area of that square and 2 px — 10 × 10 px — at the block's bottom
   **inline-end** corner (owner 2026-10-26, 21; was 24 × 24 px): bottom-right in left to right, **bottom-left in right to left**. One cell has it
   too (the focus cell); hidden while a field is open and on a read-only grid.
2. `aria-hidden`: the keyboard way is Ctrl+D / Ctrl+R (WCAG 2.5.7: dragging is never the only way). The mouse
   only: a pen is like a finger (S12-Q12, 23); touch later.
3. The drag follows one axis: the one the pointer is farther out of the source block on (rows or columns;
   a tie goes to rows). Down or up extends the block's columns; toward the end or the start extends its
   rows. Back inside the source: nothing to fill (`fillTarget` null).

**What is written** (F2–F6) — per line: a column when filling down or up, a row when filling toward the
end or the start; the source cells in that line, read as shown (through the edit overlay), data rows only.

| Source in the line | Default | With Ctrl at the drop |
|---|---|---|
| one number `5` | copies: `5, 5, 5` | a series by 1: `6, 7, 8` |
| numbers with one step `1, 2` | the series: `3, 4, 5` | copies the pattern: `1, 2, 1` |
| `2, 4` filled **up** | backwards: `0, -2` (nearest first) | — |
| `0.1, 0.2` | `0.3, 0.4` exactly (rounded to the source's decimals) | — |
| numbers with unequal steps `1, 2, 4` | repeats: `1, 2, 4, 1` | repeats too (no trend is guessed) |
| one day `2028-02-28` | a series by one day: `2028-02-29, 2028-03-01` | copies |
| days with one step `2026-01-31, 2026-02-28` (28 days) | `2026-03-28, 2026-04-25` | copies the pattern |
| text `a, b`, a list, yes/no, an instant | repeats: `a, b, a, b` | repeats |
| anything mixed, or with a blank | repeats (a blank is written empty) | repeats |

4. Backwards (up, toward the start): the series goes on before the first source cell (`first − k × step`),
   the pattern repeats backwards from the last one (`a, b, c` filled up gives `c, b, a, c` reading upward).
5. Numbers are rounded to the most decimals any source cell has (as written for export): never
   `0.30000000000000004`. A series that leaves the numbers or the days the grid can hold writes a value
   the column refuses, counted.
6. A detail, filler or loading row in the target is stepped over without taking a step; the source cells
   are never written again. Each cell goes through the editing checks (`min`, `max`, the column's reader,
   read-only): refused cells are skipped and counted, the rest written (Q9).
7. One gesture (origin `fill`): one request, one undo. A fill on a sorted or filtered column marks the
   order stale (`edit-reapply.md`, K.14), the rows stay where they are.

**Ctrl+D / Ctrl+R** (F7; Mac Cmd)
8. Ctrl+D copies the block's first row down into its other rows; on one cell, the cell above into it.
   Ctrl+R copies the block's first column toward the logical end; on one cell, the cell before (to the
   start side: on the right in right to left) into it. Always a copy, never a series. Taken from the browser
   (bookmark, reload) only when the grid acts; if an engine refuses to give them, the sheet says so and the
   API stays.

**Bulk edit** (owner QB5)
9. In a field of a cell inside a block, Ctrl+Enter keeps the typed value in **every editable cell of the
   block** (origin `bulk`, one request, one undo); read-only and refused cells counted. Without a block,
   Ctrl+Enter keeps it in the one cell, as Enter. `api.apply(input)` does the same from the application.
   Bulk is the paste plan of one value (`clipboard.md` 15): no rule of its own. An emptied field clears
   every editable cell of the block (the plan writes an empty text; review of step 10).
10. `exclude` row selections (« everything except ») are not blocks and are never written by bulk.

## Where DzGrid differs on purpose
- No trend (least squares) for unequal steps, no text series (`INV-0042` → `INV-0043` is not guessed):
  on health data a value is copied or follows a stated step, nothing else.
- Days only by the calendar's arithmetic (no clock, no zone); instants are never stepped.

## Tests
Step 10 (core): `conformance/cases/fill-plan/*` (F1–F6: each line of the table, backwards, Ctrl swap, end /
start in reading order, a detail in the target, `fillTarget` axis and ties, inside → null),
`packages/core/test/range-fill.test.ts` (series property against an oracle, rounding, `1e-7`). Step 12 (DOM):
`range-fill`, `range-fill-keys`, `range-bulk`, the walk `range-walk`; browser: the handle ltr / rtl, forced
colours, drag with auto-scroll, Ctrl+D / Ctrl+R in three engines.

## As built at step 12 (2026-10-25, written before the code; plan `step12-plan.md` D1–D9; owner S12-Q1–Q8)

**The entry.** `@dzgrid/dom/fill`: `fill(blocks)` takes the `range()` feature it extends (S11-Q5, QB8); listed
before or after it in `features`. It owns the handle, its drag, the click-then-click fill (the no-drag control), the
keyboard fill mode, Ctrl/Cmd+D, Ctrl/Cmd+R, bulk edit's seam and its API. Without `fill()`: no handle; Ctrl+D / R are
the browser's; Ctrl+Enter in a field keeps the value in its one cell, as Enter without the move. Texts
`locales/{en,fr,ar}-fill`, styles `@dzgrid/theme/fill.css`. `fill(blocks)` without `range()` on the grid: a
`missing-feature` problem, nothing drawn.

11. **The handle** (owner S12-Q8, « comme Excel »): one per grid, on the block's corner cell — its last data row ×
    its end column — and, with no block, on the **focused data cell alone** too: bottom-right in left to right,
    bottom-left in right to left. Drawn 8 px, hit area 10 × 10 px inside the cell (21); the pointer over it is a
    **crosshair** (the small « + »). Not drawn: no `edit()`; a field open; the corner cell read-only (one cell) or
    every column of the block read-only; a detail, filler or loading row; a cell not mounted or covered by a span;
    the tree's pinned copies; a nested grid's panel (it has its own); while a block is being dragged; a screen with
    no fine pointer (`any-pointer: fine` absent — touch only, S12-Q3). Never in the cell's text: a copy, the
    tooltip's overflow and the accessible name ignore it.
12. **The border** (S12-Q8): the focused cell shows the focus ring whether it was reached by keys or by a click
    (range.css: `:focus`, not only `:focus-visible`); a block keeps its 2 px edge all round, in its own colour —
    a hue 60° apart from the focus ring, the saving border and the refused border, 3:1 on the cell and its
    neighbours, `Highlight` / `HighlightText` in forced colours. Nothing moves (reduced motion has nothing to reduce).
13. **The drag** (the mouse; a finger or a pen scrolls, its press is not prevented — S12-Q12, 23): a press on the handle keeps the block;
    the cells to fill are outlined dashed (`dzg-cell--fill` and its logical edges) as the pointer moves
    (`fillTarget`, the same function for every path); near the body's edges the view scrolls as for a block drag.
    The release writes (`planFill`; Ctrl or Cmd held **at the release** swaps copy and series — a Mac's Ctrl+press
    is a context click, so Ctrl is pressed after the press); the block becomes source ∪ target (its change event
    says `api`), the focus does not move. Released inside the source: nothing, silent. Escape during the drag:
    cancelled, « Recopie annulée »; a lost capture, `pointercancel`, a blur, a sort, a filter, a page or rows
    changing: cancelled quietly. The click after a drag is swallowed once; a double-click on the handle opens no
    editor.
14. **The no-drag control** (WCAG 2.5.7, owner « Step 12 »): a **click on the handle** without dragging arms the
    fill: « Recopie : cliquez la cellule jusqu'où recopier ; Échap pour annuler »; the **next click on a cell**
    fills up to it, exactly as a drop there (Ctrl / Cmd held at that click swaps). A click inside the source, on
    the handle again; a press outside this grid's own cells (the page, the box column, a detail panel, a nested grid —
    said « Recopie annulée »); the focus leaving the grid; Escape (said); a sort or a filter: disarmed, nothing written. The
    click on the target cell neither moves the focus nor drops the block before the fill.
15. **The keyboard fill mode** (S12-Q2): Ctrl/Cmd+Shift+Enter on a cell enters it, said once
    (« Recopie : flèches pour étendre, Entrée pour écrire, Échap pour annuler »). A virtual cell starts at the
    source's bottom-end corner; the arrows move it as the grid's own moves (mirrored right to left), Home / End,
    PageUp / PageDown too; the target is `fillTarget(source, virtual cell)`, outlined as in a drag, its size said
    after a pause (« Vers le bas : 3 lignes »). Enter writes, Ctrl/Cmd+Enter writes swapped, Escape cancels (said,
    the block stays), Tab cancels quietly and moves as usual; a click, a blur, a sort cancel quietly; every other
    key is swallowed. The focus stays where it was.
16. **Ctrl/Cmd+D, Ctrl/Cmd+R** (S12-Q6): a block of two data rows or more: its first data row copied into its
    other rows; one row or one cell: the data row above (details stepped over) copied into it. Ctrl+R the same
    with the first column toward the logical end, or the previous visible column (on the right in right to left).
    Always a copy. Nothing to copy from (the first row, the first column): the key is left to the browser;
    otherwise taken and prevented. The physical key counts on a non-Latin layout (KeyD, KeyR).
17. **Bulk** (QB5, S12-Q5): Ctrl/Cmd+Enter in a field whose cell is inside the block writes the field's value
    (unchanged: the value shown) in every cell of the block, one save, origin `bulk`; the field closes on its cell
    and the focus does not move (even with `enterMoves: 'down'`); if the field's own cell refuses, the other cells
    are written and the field stays open with its reason. Outside a block: as Enter, without the move.
    Ctrl+Shift+Enter in a field is the field's.
18. **One sentence per gesture**: « Cellules recopiées : 6 ; refusées : 1. Enregistrement en cours », « Cellules
    modifiées : 12 ; en lecture seule : 3 » (range's parts, the saving sentence joined after them, once). Refused
    cells shown on screen blink; read-only ones do not.
19. **API** `fill(blocks).api(grid)`: `fill(to, { swap })` (as a drop on `to`), `down()`, `end()` (as Ctrl+D /
    Ctrl+R), `apply(input)` (bulk on the block); each answers the counts, or null when nothing would be done.
20. Trees, details, nested grids, spans, server pages (B13): the rows shown only; structure columns refused
    read-only and counted; details stepped over; a nested grid has its own handle; a server grid fills the rows
    it holds, a page change cancels a drag or the mode; a fill on a sorted or filtered column marks the order stale.

Not in this step: a double-click on the handle (fill down to the neighbour column's end), touch handles, a
« series » dialog, text series, trends, an options menu after the drop, `[(range)]` in Angular.

## After the owner's report of 2026-10-26 (`orders-edit.html?focus=range`)

The owner, selecting a block, then pressing « on 107 » (the block's corner), saw the block grow by one row filled with
the block's FIRST row, and earlier a whole Montant column written with 161 000. Reproduced in headless Chrome with real
mouse events (`spikes/fix-repro/`, « before » with the 0.3.0 hit box put back in the page): both were **accidental
fills**. The 24 px hit box covered 24 of the corner cell's 32 px height, so a press meant for the cell grabbed the
handle; one row down is a target of one row, written with the source's row `n mod n` = its first (the cycle of 3 is
right: the DOM gives `planFill` the whole block, pinned by `range-fill-accident.test.ts` and its property through the
real handle). With a block the handle is only on the block's corner and fills from the whole block; on one focused
cell without a block, only there (11, already so).

21. **No accidental fill** (owner, 2026-10-26):
    - the handle's pointer hit area is its drawn square and 2 px (10 × 10 px at the cell's corner), never a zone over
      the cell: a press anywhere else in the cell, however near its corner, starts a **selection** (`range-selection.md`);
    - a fill starts only once the pointer has moved **4 px** from its press on the handle (and left the source); the
      dashed target shows from that move on. A press that slips less is a click: the no-drag way (14) is armed by it;
    - **half a row**: a row joins the target only once the pointer is about half a row inside it (half a row less
      2 px: its middle counts, also where an engine rounds the pointer to whole pixels); the dashed preview follows the same rule. An edge slip (a press 1 px above a cell's edge, a release
      3 px below it) fills nothing;
    - **WCAG 2.5.8 (target size, minimum; owner S12-Q12)**: the 10 px handle stays. The ≥ 24 px pointer equivalent is
      a pair of items in the column ⋮ menu, « Recopier vers le bas (Ctrl+D) » and « Recopier vers la droite
      (Ctrl+R) », acting on the current block — they come at **Phase 6 step 3**. Until then the fill is **not**
      2.5.8-complete: a known gap, and nothing is published before it closes (`phase-6-steps/step02-plan.md`
      « Handover to step 3 »).
22. **Escape**: during a drag of the handle it cancels, nothing written (13); after a fill it drops the block and leaves
    the focus where the fill left it (13: the focus does not move during a fill). After a drag-select, the focus is on
    the block's moving corner, so Escape leaves it there (`range-selection.md`, S12-Q11). An application's block change
    or `clear()` during a gesture (a drag, the keyboard mode, the no-drag way) cancels it: nothing written, the block not
    given back (`rangeChanged` from `api`).
23. **Pen** (S12-Q12, as `range-selection.md`): a pen is like a finger — its press on the handle is neither taken nor
    prevented, no pen drag fills (a pen drag would scroll and fill at once). A pen cannot be told apart from a mouse in
    CSS (both are `any-pointer: fine`), so the handle stays drawn and the pen's press is ignored by the code. A pen tap
    on the handle is a click: it arms the no-drag way (14), which a pen may use.
24. **What a drop writes**: the **last target shown** (the dashed preview), never a target recomputed from the release
    point; a release that comes with no move before it writes the preview of the last move.

25. **The handle and the grid's focus** (owner's report 2026-10-26, lead decision): with **no block**, the one cell's
    handle is drawn only while the focus is in the grid (a focused data cell). The focus leaving the grid (a click on
    the page) hides it with the focus ring; the focus coming back shows it again. With a **block**, the block stays
    when the grid loses the focus by the keys and its handle stays on its corner, so a mouse can still fill; a pointer
    press outside the grid clears the block (S12-Q13, replacing S12-Q11; `range-selection.md`), and so its handle. Done in the
    paint (`focusin` at once, `focusout` one task later), not in CSS: fill.css has no byte to spare. Tests:
    `range-fill.test.ts` (« fill.md 25 »); browser `browser-fill-accident.mjs` (a click outside hides it).

Tests: `range-fill-accident.test.ts` (the 4 px threshold, the half-row rule, an app `clear()` mid-drag, the whole block repeated, a property of 2–5-row blocks through
the real handle against values written by hand), `range-release.test.ts`; theme `fill.test.ts` (10 px); browser
`--only fill` → `scripts/browser-fill-accident.mjs` (a press 16 px and 12 px in from the corner selects, a press on the
square fills; the owner's gesture end to end; Escape; S12-Q11; the simulated send, kept when the block changed during it; Chrome: a pen drag writes nothing).

