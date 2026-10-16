# Resizing a column

## What the user does
Drags the edge of a column header; double-clicks it; uses the keyboard on the resize handle.

## What they observe
- The column follows the pointer; the header and the cells stay aligned.
- It never gets narrower than its minimum or wider than its maximum.
- In Arabic, dragging toward the left widens a column whose end edge is on the left.
- Flexible columns share the remaining width; a column the user resized stops being flexible.

## What DzGrid does
- The handle sits on the column's end edge (logical); the width changes by the logical pointer distance, so the same code serves both directions.
- While dragging, `columnResized` fires with `finished: false`; on release once with `finished: true`.
- Keyboard resize comes in Phase 5 (the handle is not focusable before then; it is `aria-hidden`).
- The handle is at least 24 px wide for touch (`--dzg-target-min`). For the last column pinned to the end, it sits on the column's start edge and the drag is reversed (S2).
- Widths are core state (`ColumnLookup.version`), so a resize never filters or sorts again.

## Tests
`conformance/cases/columns-layout/*`, `packages/dom/test/resize.test.ts`.
