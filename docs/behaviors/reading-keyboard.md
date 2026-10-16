# Reading with the keyboard

## What the user does
Tabs into the grid, moves with the arrows, pages, jumps to the ends, tabs out.

## What they observe
- Tab enters the grid once, on the cell last focused (the first cell the first time); Tab again leaves it.
- Arrows move one cell; in Arabic, ArrowRight moves toward the start, which is on the right.
- PageDown and PageUp move a page; Home and End go to the first and last cell of the row; Ctrl+Home and Ctrl+End to the first and last cell of the grid (Cmd on a Mac).
- The focused cell is always fully visible, below the header and clear of the pinned columns.
- Focus survives scrolling away and back, sorting, filtering and a host `update()`; if its row disappears, focus goes to the row now at its place.

## What DzGrid does
- One tab stop (roving `tabindex`). The focused row and cell stay in the page while scrolled away (the retained row), at their true position, or at their physical image above ~125 000 rows (S10, S11).
- Keys are turned into intents in the core (`intentFor`), which mirrors the inline arrows for right to left; the DOM layer never reads `ArrowLeft` itself.
- Scroll keys are handled by the grid, also when focus is on the scroll area itself: native key scrolling would move too far above ~125 000 rows (S11).
- Programmatic focus never scrolls natively (`preventScroll`); the grid scrolls logically. A native scroll right after a focus move is redone logically.

## Tests
`conformance/cases/keyboard-intent/*`, `conformance/cases/focus-fallback/*`, `packages/dom/test/keys.test.ts`, browser suite `focus`.
