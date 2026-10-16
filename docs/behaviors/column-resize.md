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
- Keyboard: on the focused handle, ArrowLeft/ArrowRight (mirrored in RTL) change the width by 8 px, with Shift by 32 px.
- Widths are core state (`ColumnLookup.version`), so a resize never filters or sorts again.

## Tests
`conformance/cases/columns-layout/*`, `packages/dom/test/resize.test.ts`.
