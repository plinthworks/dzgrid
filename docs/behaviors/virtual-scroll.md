# Scrolling a long list

## What the user does
Scrolls through thousands or millions of rows.

## What they observe
- Only the visible rows exist on the page; the scrollbar reflects the full length; the last row is always reachable; rows do not jump when their heights are measured.

## What DzGrid does
- Above about 125 000 rows the scroll range is mapped, not the height (S1), so the end stays exact; there is no row cap.
- The anchor is the first visible row already measured, or the end when at the bottom (S3).
- Rows are recycled in DOM order and rebound, never rebuilt, even on a jump (S9); each cell writes only when its value, column or language changed.
- The focused row stays in the page while scrolled away (the retained row, S10); above ~125 000 rows at its true distance, bounded, and the body clips so it never grows the scroll range (S11).
- Above ~125 000 rows the wheel and the scroll keys are handled by the grid, and touch moves the list by the distance of the finger (S11).

## Row height (density, `rowHeight`)

### What the user does
Reads rows of one height chosen by the application: a density (`compact` 28, `comfortable` 32,
`spacious` 40 px), or a number of pixels (`rowHeight`, e.g. 52 for a two-line cell: a photo, a name
and a job title). The application may change either while the grid is shown.

### What they observe
- Every data row and every header row is that tall; the scrollbar, PageUp / PageDown, the wheel and
  the end of the list follow it, also past the browser's height limit (a million rows, scaled scrolling).
- `rowHeight` wins over the density; removing it goes back to the density.
- The height is given for a 16 px default text size and grows with the reader's text size — the
  browser's default size (its font-size setting, `font-size: medium`), never the page's own root size (an
  application's `html { font-size: 62.5% }` does not shrink the rows) — as a density's does (WCAG 1.4.4);
  whole pixels, never under 24 px (WCAG 2.5.8).
- A tree's pinned parents are copies of their rows: as tall as they are, never more than half the view.
- An opened detail panel keeps its own height (given or measured); only the data rows change.
- A change while the grid is shown keeps the row at the top of the view where it was (the same fraction
  into it) and keeps the focused row in view if it was in view (WCAG 2.4.11), under the pinned parents.
- A value sent again (the same one, `NaN` included) is not told again.
- A value that is not a number from 24 to 1 000 (24: WCAG 2.5.8's target size) is ignored: the grid
  uses the density's height and tells a warning (`problems` event, code `invalid-setting`, path
  `settings.rowHeight`).

### What DzGrid does instead
- The header is one row high, as with densities; a separate header height is not offered.

### Tests (row height)
`packages/dom/test/row-height.test.ts`; `npm run test:browser -- --only demos` (the HR demo, 52 px rows).

## Tests
`conformance/cases/layout-rows/*`, `packages/core/test/layout.test.ts`, `packages/dom/test/{grid,scroll}.test.ts`; `npm run test:browser` and `npm run bench:browser` (no frame without rows, 60 fps, a million rows).
