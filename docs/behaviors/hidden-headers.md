# A grid without column headers on screen

Written before the code (CLEANROOM). Source: Tabulator's public feature list (« no column headers »), as a checklist only;
WAI-ARIA 1.2 (grid, `columnheader`), WCAG 2.2 (1.3.1, 2.4.7, 2.4.11, 4.1.2). Owner, 2026-11-09 (1.9.0 lot A, item 5).
A grid setting in the base: `headers: 'hidden'`.

## What the user does
Reads a small grid whose meaning is clear without titles (a list of names, a key–value table) where the page shows no
header row.

## Decision: hidden, not removed
The header row stays in the page, **visually hidden** (the same technique as the grid's other screen-reader-only texts:
out of the flow, clipped to nothing), with every cell's role and name. So a screen reader still says each cell's column
(`columnheader` cells pair with the cells by position, S4), axe finds a valid grid (a grid whose columns have headers),
and nothing else in the grid changes. Removing the row (or giving names by `aria-label` on cells) would break that pairing
and the keys that start from the header.

## Behaviours (numbered, each one a test)
1. `headers: 'hidden'` (live: `grid.update`; `'shown'` or absent: the default): no header row on screen — not the column
   headers, not the group rows above them, not the floating filter row — and the rows start at the top of the grid.
   The root says `data-headers="hidden"`.
2. The header rows stay in the accessibility tree: same roles, names, `aria-rowindex`, `aria-rowcount`.
3. The body's view is the grid's whole height (the header takes no room): every row that fits is drawn.
4. **While the keyboard is in the header, it shows**: ArrowUp from the first row (or a focus given by the application)
   puts the focus on a header cell, and the header rows are shown at their usual place for as long as the focus is in
   them (WCAG 2.4.7: a focused element is never invisible); ArrowDown back into the rows hides them again. So the keys
   that live in the header — Enter to sort, the column menu's keys, the filter popup's — still work by keyboard.
5. The mouse has no header to click: sorting, the menu button, resizing and moving by the header are not on screen. What
   remains: the keyboard (4), the cell menu (`contextMenu()`), the API (`kernel.dispatch` sort and filter commands), the
   columns chooser and the filters panel in the dock, a saved state.
6. Print and exports keep their header row; the application leaves it out with `header: false` (CSV, Excel; print:
   `print(grid, { header: false })`). JSON has no header row.
7. Pinned top rows sit at the top of the grid (no header above them).

## Where DzGrid differs on purpose
- The headers are hidden from the eyes only; never taken out of the grid's structure.

## Tests
`packages/dom/test/hidden-headers.test.ts` (attribute, live update, the view's height, roles kept, print option);
browser `scripts/browser-lot-a.mjs` (Chrome fr and ar: no header on screen, shown while focused, axe clean).
