# Scrolling a long list

## What the user does
Scrolls through thousands or millions of rows.

## What they observe
- Only the visible rows exist on the page; the scrollbar reflects the full length; the last row is always reachable; rows do not jump when their heights are measured.

## What DzGrid does
- Above about 125 000 rows the scroll range is mapped, not the height (S1), so the end stays exact; there is no row cap.
- The anchor is the first visible row already measured, or the end when at the bottom (S3).
- Rows are recycled in DOM order and rebound, never rebuilt, even on a jump (S9); each cell writes only when its value, column or language changed.
- The focused row stays in the page while scrolled away (the retained row, S10); above ~125 000 rows at its physical image (S11).
- Above ~125 000 rows the wheel and the scroll keys are handled by the grid, and touch moves the list by the distance of the finger (S11).

## Tests
`conformance/cases/layout-rows/*`, `packages/core/test/layout.test.ts`, `packages/dom/test/virtual.test.ts`, browser suites `scroll` and `focus`.
