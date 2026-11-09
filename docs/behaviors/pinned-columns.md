# Pinned columns

## What the user does
Pins columns to the start or the end of the grid, then scrolls sideways.

## What they observe
- Pinned columns stay put; the other columns slide under them.
- In Arabic (right to left) the start is on the right: a column pinned to the start sits on the right edge.
- The header and the body stay aligned to the pixel while scrolling.
- Keyboard focus moves across pinned and unpinned columns in screen order, without skipping any.
- **A view too narrow for its pins** (Phase 11 L4a, owner A, 2026-11-08; WCAG 1.4.10, 2.4.11): while the pinned columns would leave the centre less room than its widest column (a phone, 400 % zoom), they are released — they scroll with the others, in the same screen order (start ones first, end ones last). They come back pinned as soon as the view is wide enough. The columns' state still says pinned: nothing is told, nothing is saved; only the layout changes.

## What DzGrid does
- Three segments per row, start, centre and end; start and end are `position: sticky` with logical insets, so right to left needs no mirrored code (S2).
- Rows use `contain: content`, never `contain: strict`: size containment drops sticky segments in Firefox (S11).
- **With columns that collapse** (`@dzgrid/dom/responsive`, 1.9.0, responsive-columns.md 12): pinned columns never collapse; centre columns collapse first, and the release above applies only when the columns that never collapse still do not fit.
- The release is decided in the core's column model from the room it is given (`setAvailableInline`, the viewport's inline size): `start` and `end` segments empty, the released columns in the centre segment; no side is named (right to left is the same code).
- More than six columns pinned on a side gives the warning `too-many-pinned`; the grid still renders them.
- Screen readers get one `aria-colindex` order across the three segments, equal to the DOM order (S4).

## Tests
`conformance/cases/columns-layout/*`, `conformance/cases/problems/too-many-pinned.json`, `packages/dom/test/grid.test.ts` (segments); `packages/core/test/pinned-release.test.ts` (below and above the room, the state unchanged, right to left), `node scripts/browser-a11y.mjs --check focus,reflow` (320 px); `npm run test:browser -- --all` (pinned edges and header alignment within 1 px, LTR and RTL, three engines).
