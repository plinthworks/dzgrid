# Scrolling a long list

## What the user does
Scrolls through thousands or millions of rows.

## What they observe
- Only the visible rows exist on the page; the scrollbar reflects the full length; the last row is always reachable; rows do not jump when their heights are measured.

## What DzGrid does
- Above about 125 000 rows the scroll range is mapped, not the height (S1), so the end stays exact; there is no row cap.
- The anchor is the first visible row already measured, or the end when at the bottom (S3).

## Tests
`conformance/cases/layout-rows/*`, `packages/core/test/layout.test.ts`.
