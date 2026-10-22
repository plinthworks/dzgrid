# Master and detail rows

Sources: the public documentation of grids with master/detail (what a user sees: a chevron on a
row opens a panel under it, often a second grid), WAI-ARIA 1.2 (`gridcell` with `aria-colspan`,
`aria-expanded`), the APG grid pattern (a cell holding widgets: Enter to go in, Escape to come
out), WCAG 2.2 (2.1.2 no keyboard trap, 2.4.3, 4.1.2). Phase 4 plan D7, D8; owner decisions Q4, Q5;
spike S12.

## What the user does
Opens a row's detail (its chevron, or a key), scrolls a list where some rows are open, moves with
the keyboard into and out of the detail, works in a grid shown inside the detail, closes it.

## What they observe
- Under an open row, a panel the width of the grid shows that row's detail (for example the
  patient's visits as a small grid). Other rows move down to make room; nothing overlaps.
- The panel has its own height (240 px by default); it may have its own scrollbar inside.
- Scrolling stays smooth with many rows open, down to the last row of a million.
- With the keyboard: Down from the open row reaches the panel as one stop; Enter goes inside (to
  its first control, or the inner grid's focused cell); Escape comes back to the panel stop; Down
  again goes to the next row. Left, Right, Home, End on the panel do nothing (it is one cell).
- Inside an inner grid, the arrows, the sort and the filters act on the inner grid only; the outer
  grid does not move.
- A panel whose content changes height (text that wraps, a list that loads) grows or shrinks
  without making the rows above it jump.
- Reopening a panel shows its inner grid as it was left (sort, filters, scroll), for the last
  twenty or so opened.

## What DzGrid does
- **A detail is a row** (D8): one `DetailNode` (`kind: 'detail'`, key `x:` + the master's key)
  right after each open master, in the displayed rows; opening is the same expansion set as the
  tree (`rows.expand`, `rowExpanded`). Paging works with details (a detail lives on its master's
  page); a tree and a detail on the same grid is refused in Phase 4 (`unsupported-combination`,
  owner Q5).
- **Expand all** (step 8 review, lead decision): masters are level 0 and the depth counts as a
  tree's (depth 1 = the roots, here the masters). `rows.expandAll { expanded: true }` with
  `depth` ≥ 1 or none opens every master shown; with `depth: 0`, nothing. `{ expanded: false,
  depth: 0 }` (or no depth) closes every detail; with `depth` ≥ 1, none.
- **The footer** (pagination): its range ("1–10 of 30") and "Select all N" count the page's data
  rows; a detail is not a row of the page. `aria-rowcount` counts every row shown, details too.
- **Focus on a detail whose master goes** (step 8 review, lead decision): when the master is
  removed or filtered out, the focus goes to the row now at the master's place (not one past it,
  where the detail was), as a tree's row goes to the row now at its own place. Hidden by closing
  its master, the detail gives the focus to the master.
- **Opening** (step 10): a decorative chevron in the masters' first column (or `detail({ column })`),
  24 px; a click opens or closes, nothing else (no selection, no row click). Keys on that column, as a
  tree's: forward (Right; Left in Arabic) on a closed master opens, back on an open one closes,
  otherwise the column move. The user's opening or closing is said: « Patient 0 développé » /
  « Patient 0 réduit » (the host's, never).
- **One cell**: the detail row has one `gridcell` with `aria-colspan` = the number of columns,
  `data-kind="detail"` on the row. `aria-expanded` is on the master's **chevron cell**, not on the row:
  ARIA lets a `gridcell` carry it, a `grid`'s row may not (axe `aria-conditional-attr`; only a
  treegrid's rows may). The cell's accessible name is « Détails de Patient 0 » (`detail.label`): its
  content box is a `group` with that name, and the cell takes its name from its content (an
  `aria-label` on the cell itself would not hold an inner grid's visible text, WCAG 2.5.3; step 9's
  base named the cell after the master's row header, step 10 replaces it). The cell is as wide as the
  view (never wider than the columns) and stays at the view's start under a horizontal scroll.
- **Content**: a part slot `'detail'` (`parts.md`; Angular through `dzgPart`/`componentPart`),
  given the master row, its key, the context, the direction, the messages, `announce`, and the
  height. Mounted at first opening, destroyed when closed or when the row leaves the window (its
  state kept by the host or by the nested-grid part's memory, below).
- **Heights** (owner Q4): `detail.height` — a number (default 240), a function of the master row,
  or `'auto'` (measured with a ResizeObserver after a first estimate). A nested grid needs a fixed
  or function height (an inner virtual grid has no natural height). A height that is not a finite
  number ≥ 0, or a function that throws, gives 240 for that detail, silently: no problem is told
  (the `@dzgrid/core/detail` budget has no room for one; step 8 review).
- **Variable rows** (D7, S12): the grid places rows through one row layout per paint; with
  details, a sparse layout (every row the base height except the open details, found by binary
  search, with sums of their extra heights). It goes through the same scaled scroll mapper as a
  million uniform rows: S12 measured the ends exact (0 px), every row placed within 0.46 px,
  row 999 999 reachable, with 2 000 details of 240 px over 1 000 000 rows in Chrome, Firefox and
  WebKit. A height change above the viewport keeps the top row where it is (anchor: the row at the
  top and the distance into it, re-applied after the change), also when other heights below make
  the total the same (step 9 review); at the end of the list, the view stays at the end. A
  measured height survives a change of the row height (density, text zoom): the base hands the
  old layout to the feature, which carries the heights set on it (step 9 review).
- **Keys** (D8): the detail row is a whole-row stop (`MoveShape.whole`): Up/Down reach it; the
  goal column is remembered across it; Left/Right/Home/End stay, and bring the detail back into view
  when it was scrolled away, as any other move does (lead decision, step 9 review). Enter or F2 calls the part's
  `focus()`; Escape inside returns to the stop (the content container is a `cell-widget` owner, so
  the outer router ignores keys from inside, Escape included once the inner part has handled it).
  Tab from the stop leaves the grid, as from any cell (one tab stop). PageUp and PageDown move by a
  page's distance (a 240 px detail is not one row of a page), and always at least one row: from a
  detail taller than a page, PageDown goes to the row after it; the wheel moves pixels, as always.
- **Scrolled into view** (lead decision, step 9 review): a row taller than the view (a tall detail)
  is shown from its top, its name and the panel's start visible (under a tree's pinned rows, as
  any row), from above as from below; a shorter row is brought just into view, as before.
- **Nested grids and keys** (step 9 review): the outer grid takes no key whose target belongs to
  another grid (the nearest `.dzg` root is not its own) nor a key already handled
  (`defaultPrevented`): a key in an inner grid never moves the outer one or leaves the panel.
- **Not data**: a detail row is never selected, copied, pasted, edited or exported; it sends no
  `rowClicked` or `cellClicked`; Ctrl+A and ranges skip it.
- **Nested grids** (step 10, `nestedGrid`): a ready part creates an inner grid per shown panel, with
  an LRU of `{ query, scrollTop }` per master (default 20, `keep`) saved when the panel goes (closed or
  scrolled away) and given back when it comes again. Enter or F2 on the panel focuses the inner grid
  (its focus, else its first cell); Escape the inner grid leaves (on a cell) goes back to the panel's
  cell, one level only: from a grid two levels down, Escape reaches the middle grid's panel, a second
  Escape the outer one. Nesting is tested at 2 levels, a soft cap of 3: the grid made at depth 4 tells
  `unsupported-combination` (`detail.depth`) and works (owner Q5).
- **The wheel over an inner grid**: the inner grid first; at its top or bottom, a new wheel gesture
  goes on to the outer grid, never to the page. The browser's own chaining (an inner scroller at its
  edge hands a new gesture to the one around it) does this; a grid's viewport normally stops it
  (`overscroll-behavior: contain`, so a grid never scrolls the page), and a nested grid's is set back
  to chain. Over a million masters the outer grid moves the wheel itself; a panel stops the wheel
  while what is inside can still scroll that way (or took it), so the order is the same.
- **`'auto'` heights** (step 10): measured with one `ResizeObserver` (every panel changed in a frame
  sent to the layout at once, one paint); 240 px until measured; a measure is kept after a close (a
  reopened panel starts at it) and across a new row height; the rows above stay where they are.
- **Not with**: spans (D9), a tree on the same grid (Q5): `unsupported-combination`.

## Where DzGrid differs on purpose
- The panel is a single focus stop with Enter to go in (APG "cell with widgets"), never a set of
  tab stops inside the outer grid: Tab always leaves the grid, and a user never gets trapped in a
  nested grid.
- Height changes never move what the user is reading above the panel.

## Tests (to be written with the code)
Step 8: `@dzgrid/core/detail` (shaper; `sparseRowLayout` against a brute-force oracle, S12's
prototype as the reference). Step 9: the layout seam (the uniform paint unchanged: existing tests
green without edits, bench lines within budget), `whole` moves, offsets in focus and scrolling.
Step 10: `packages/dom/test/detail*.test.ts` (lazy mount and destroy, `'auto'` height measured once
per resize, top row kept, Down/Enter/Escape, inner keys ignored by the outer router, LRU restore and
cap, not selectable or exported, depth 2 ok and 4 a problem, no row data in events, SSR); browser:
axe, wheel chaining, 1M masters, 200 details opened. Spike: `spikes/s12-variable-heights/`.
Manual: `docs/a11y-protocol.md` §17.
