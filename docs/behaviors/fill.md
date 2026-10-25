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
1. A square drawn small (8 px) with a 24 × 24 px hit area (WCAG 2.5.8) at the block's bottom
   **inline-end** corner: bottom-right in left to right, **bottom-left in right to left**. One cell has it
   too (the focus cell); hidden while a field is open and on a read-only grid.
2. `aria-hidden`: the keyboard way is Ctrl+D / Ctrl+R (WCAG 2.5.7: dragging is never the only way). Pointer
   only (mouse, pen); touch later.
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
