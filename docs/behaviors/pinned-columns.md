# Pinned columns

## What the user does
Pins columns to the start or the end of the grid, then scrolls sideways.

## What they observe
- Pinned columns stay put; the other columns slide under them.
- In Arabic (right to left) the start is on the right: a column pinned to the start sits on the right edge.
- The header and the body stay aligned to the pixel while scrolling.
- Keyboard focus moves across pinned and unpinned columns in screen order, without skipping any.

## What DzGrid does
- Three segments per row, start, centre and end; start and end are `position: sticky` with logical insets, so right to left needs no mirrored code (S2).
- Rows use `contain: content`, never `contain: strict`: size containment drops sticky segments in Firefox (S11).
- More than six columns pinned on a side gives the warning `too-many-pinned`; the grid still renders them.
- Screen readers get one `aria-colindex` order across the three segments, equal to the DOM order (S4).

## Tests
`conformance/cases/columns-layout/*`, `conformance/cases/problems/too-many-pinned.json`, `packages/dom/test/grid.test.ts` (segments); `npm run test:browser -- --all` (pinned edges and header alignment within 1 px, LTR and RTL, three engines).
