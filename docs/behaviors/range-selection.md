# Selecting a block of cells

Written before the code (CLEANROOM). Sources: the public documentation of grids and spreadsheets that
select a rectangle of cells (what a user sees: a tinted block with a border, its size, the corner that
moves), WAI-ARIA 1.2 grid (`aria-selected` on `gridcell`, `aria-multiselectable` on `grid`), the APG grid
pattern (Shift+arrows, Shift+Space, Ctrl+A), WCAG 2.2 (1.4.1 use of colour, 1.4.11 non-text contrast,
2.1.1 keyboard, 2.4.11 focus not obscured, 2.5.7 dragging, 4.1.3 status messages). Plans:
`docs/phase-5-steps/partB-plan.md` (B2–B8, B13), `step10-plan.md` (R1–R2); owner decisions QB1, QB2, QB7
(`decisions.md`, « Part B »). Clipboard: `clipboard.md`; fill handle and bulk edit: `fill.md`.

## What the user does
Holds Shift and presses arrows from a cell; Shift-clicks another cell; presses on a cell and drags; presses
Ctrl+A (Cmd+A on a Mac); presses Shift+Space; presses Escape or clicks elsewhere to drop the block.

## What they observe
- A rectangle of cells is tinted, with a line around its outside edge. One corner (the anchor) stays where
  the block started; the other (the focus) moves with the keys or the pointer, and the keyboard focus is on
  it (owner QB2).
- After the keys pause, a screen reader hears the block's size once: « 3 lignes, 2 colonnes
  sélectionnées ».
- Escape, a click without Shift, or an arrow without Shift drops the block; it is said once (« sélection
  effacée »).
- The block covers what is shown: the columns in reading order (start pinned, centre, end pinned), the rows
  on screen between the two corners. A block is never two cells far apart on other rows after a sort.

## Behaviours (numbered, each one a test)

**What a block is**
1. A block is two corners, each a row key and a column id (`CellRange { anchor, focus }`, `CellAddr { row,
   column }`), never positions. It is turned into positions only for the rows shown at one version
   (`rangeBox`): top ≤ bottom, start ≤ end, whichever corner is where.
2. If a corner's row is no longer shown (filtered out, collapsed, another page, removed) or its column is no
   longer visible, the block is **dropped**, said once; it is never read again on other rows (B2).
3. Columns: the visible columns in reading order, logical (start pinned, centre, end pinned). In right to
   left the first column is still the block's first: start and end are logical, never left and right.
4. Rows: the rows shown between the two corners. A corner may rest on a detail row, a filler row of a
   path tree or a loading row (the focus can be there); those rows count for nothing: they are never
   copied, pasted, filled, bulk-edited or cleared (D11). A filtered tree's ancestors shown muted for their
   matches are data rows: they count.
5. One cell is not a block: it is the focus. `aria-selected` and the tint start at two cells.
6. Size: data rows × columns (`boxSize`), the number said and given to the clipboard counts.

**Making it (keyboard)** — the grid's keys on a cell (owner `cell`); inside a field, a widget, a popup,
a filter input or a nested grid's cells they are not the grid's (`editing.md` 19).

| Key (Mac: Cmd for Ctrl) | Effect (right to left: arrows mirrored as for moving) |
|---|---|
| Shift+arrow | the moving corner by one cell |
| Shift+Home / Shift+End | the moving corner to the row's first / last visible column |
| Ctrl+Shift+arrow | the moving corner to the edge in that direction |
| Shift+PageUp / Shift+PageDown | the moving corner by a page of rows |
| Ctrl+Shift+Home / Ctrl+Shift+End | the moving corner to the first / last cell shown |
| Shift+Space | the whole row (every visible column) |
| Ctrl+A | every cell shown (owner QB1: with `range()`, no longer every row; rows by their box) |
| Escape | drops the block (a cell keeps the focus) |
| Delete / Backspace | clears the block's editable cells, one gesture (`clipboard.md`) |
| Ctrl+C / Ctrl+X / Ctrl+V | copy, cut, paste (`clipboard.md`) |
| Ctrl+D / Ctrl+R | fill down / to the logical end (`fill.md`) |
| Ctrl+Shift+Enter | the keyboard fill mode (`fill.md` 15, `fill()` only) |

7. The keys ask the grid's own moves (`intentFor` with the same key without Shift): spans, details as one
   stop, pages and variable heights behave as when moving the focus. Ctrl+Space (a column) is not taken in
   this phase: it switches the input source on a Mac.

**Making it (pointer)**
8. A press on a data cell with the mouse or a pen, then a drag: the block follows the pointer; near the
   scroller's edges the grid scrolls (one animation frame loop, positions from the row layout and the
   column widths). Shift+click extends from the anchor (owner QB1: with `range()`, Shift+click makes a block
   of cells; rows are ticked by their box). Never on a widget, a field, the box column or a header.
9. Touch: a tap focuses as today. Blocks by touch (handles) are not in this phase.

**When it is dropped** (owner QB7)
10. Escape on a cell, a click or an arrow without Shift, a sort, a filter or search change, a column hidden,
    moved or pinned, a page change, new rows from the host (`model` change): dropped, said once. A host
    transaction that keeps both corners shown keeps the block.

**Seen and heard**
11. Each mounted cell of the block carries `dzg-cell--range` (the tint) and the edge classes
    `dzg-cell--rs`, `--re`, `--rt`, `--rb` (logical start, end, top, bottom), written at each paint: pooled
    and scrolled cells are always right, pinned columns and spans included. Forced colours: `Highlight` and
    `HighlightText`. The tint keeps 4.5:1 for the text, the edge 3:1, and both differ from the focus ring and
    the saving border (`check:contrast`).
12. `aria-selected="true"` on the block's mounted data cells, **absent elsewhere**. The APG says a grid that
    allows selection *should* put `aria-selected="false"` on the others; we do not, on purpose: several
    readers then say « non sélectionné » on every cell the user moves to, which buries the value. The
    listening protocol (a11y §20, item 136) checks both readers. `aria-multiselectable="true"` on the grid
    while `range()` is on.
13. The size is said after the keys pause (about 400 ms), once per pause, through the grid's polite region.

**Trees, details, nested grids, spans, server pages** (B13)
14. Trees: a block across levels takes the rows shown, whatever their level; closing a parent hides rows,
    and drops the block if a corner leaves.
15. Details: never cells of a block; stepped over. Each nested grid has its own block, keys and clipboard;
    a block of the outer grid never reaches into a panel.
16. Spans: a block is not grown to cover a tall or wide cell (v1); the covered places are real cells, read
    and written like others.
17. Server grids: a block within the page shown; a page change drops it.

## Where DzGrid differs on purpose
- No `aria-selected="false"` on every cell (12).
- A block dropped, said, rather than kept between corners whose rows changed (QB7): on health data a block
  must never cover other patients in silence.
- Rows shown only: a collapsed child, a filtered-out row, another page are never in a block (Excel copies
  only the visible rows of a filtered range too).

## Tests
Step 10 (core): `conformance/cases/range-box/*` (R1–R2: corners in any order, a corner off the display or a
hidden column → null, details, fillers and loading rows counted for nothing, a muted ancestor counted, pinned
columns in reading order), `packages/core/test/paste-plan-property.test.ts` (no non-data row ever named).
Step 11a (DOM): `range-keys`, `range-pointer`, `range-paint`, `range-clear`, `range-a11y`, `range-api`, `range-seams`,
`range-layering`, `range-texts`, the random walk `range-walk` against a hand-written oracle; theme `range.test.ts`;
browser `--only range` (Chrome; Firefox and WebKit right to left).

## As built at step 11a (2026-10-25)
- The tint and edges: `@dzgrid/theme/range.css` — the tint `--dzg-range-bg` (the selected row's by default), the edge
  `--dzg-range-edge` (the palette's success by default, a hue 60° away from the focus ring and the saving border;
  Clinic and the more-contrast palette give their own), drawn by an inset `box-shadow`; forced colours: `Highlight` with
  `HighlightText`, the edges in `HighlightText` (a `Highlight` edge would not show on the tint).
- « The focus follows » is a flag: set by Shift+keys, Shift+click and a drag; cleared by Ctrl+A, Shift+Space and the
  API. A Shift+arrow while it is clear starts a new block from the focused cell (owner S11-Q2).
- A press without Shift drops the block at once, said once (10): a click on one of its own cells too.
- The sort, filter or search sentence (owner S11-Q4) is « Sélection effacée : l'ordre a changé »; every other drop says
  « Sélection effacée ».
- New rows from the host (`setRows`) are a transaction for the block: kept while both corners are shown (the core tells
  both alike).
- A refused `set()` of the API tells `unknown-row-id` (a corner's row not shown) or `unknown-column` (a column not
  visible), path `range`.
- The drag is the mouse's only: a pen, like a finger, scrolls the view (a pen drag would scroll and select at once;
  Windows Ink sends `pointerType: 'pen'`, so a pen user selects by Shift+tap or the keys). A drag cancelled
  (`pointercancel`, the window's blur, a capture lost without a release) gives back the block from before it — none
  after a plain press — with no focus move, no sentence; only a release swallows the click of its own task.
- Under a CSS scale or zoom on an ancestor the pointer is divided by the scale (the viewport's client box over its
  layout box).
- During a drag the view scrolls near the body's edges (a band of a row height, at least 24 px; over the header and the
  tree's pinned parents too), at most a row height a frame; a point over the pinned parents is the row under them.

