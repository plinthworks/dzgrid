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

## Tests
`conformance/cases/layout-cols/*`.
