# Column widths and pinning

## What the user does
Sets widths, pins columns, hides some; the host then sends a new column list.

## What they observe
- Fixed, minimum, maximum and flexible widths; pinned columns stay at an edge; hidden columns vanish.
- Changes the user made survive a refresh of the column list.

## What DzGrid does
- Edges are `start` and `end`, never left and right: in Arabic the start is on the right.
- Flexible widths are whole pixels, shared out by largest remainder, so the columns always add up exactly.
- User state is kept by column id.

- **Scrolling to a column without naming a row** (step 16d): `ensureColumnVisible(column)` (`GridApi`, always set on a grid's api; Angular's
  `DzgController`) scrolls the column into view sideways only: the block scroll and the focus are unchanged; right
  to left, the same column comes into view from the other side. `ensureVisible(row, column)` as before.

## Tests
`conformance/cases/columns-layout/*` (widths, pinning, hiding); `conformance/cases/layout-cols/*` is the visible-window maths.
