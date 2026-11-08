# Reading with the keyboard

## What the user does
Tabs into the grid, moves with the arrows, pages, jumps to the ends, tabs out.

## What they observe
- Tab enters the grid once, on the cell last focused (the first cell the first time); Tab again leaves it.
- Arrows move one cell; in Arabic, ArrowRight moves toward the start, which is on the right.
- PageDown and PageUp move a page; Home and End go to the first and last cell of the row; Ctrl+Home and Ctrl+End to the first and last cell of the grid (Cmd on a Mac).
- The focused cell is always fully visible, below the header and clear of the pinned columns.
- A grid taller than the window (400 % zoom, 320 × 256 CSS px): the window follows the focused cell on the block axis, by what it misses of it; the grid's own scrollers are not touched for it (Phase 11 L4a, WCAG 2.4.11). Pinned columns too wide for the view scroll with the others meanwhile (`pinned-columns.md`).
- Focus survives scrolling away and back, sorting, filtering and a host `update()`; if its row disappears, focus goes to the row now at its place.

## What DzGrid does
- One tab stop (roving `tabindex`). The focused row and cell stay in the page while scrolled away (the retained row), at their true position — above ~125 000 rows at their true distance from the visible rows, bounded, the body clipping it (S10, S11).
- Keys are turned into intents in the core (`intentFor`), which mirrors the inline arrows for right to left; the DOM layer never reads `ArrowLeft` itself.
- Scroll keys are handled by the grid, also when focus is on the scroll area itself: native key scrolling would move too far above ~125 000 rows (S11).
- Programmatic focus never scrolls natively (`preventScroll`); the grid scrolls logically. A native scroll right after a focus move is redone logically. Then, the cell outside the window, the window alone is scrolled (`window.scrollBy`, block axis).

## Tests
`conformance/cases/keyboard-intent/*`, `conformance/cases/focus-fallback/*`, `packages/core/test/keys.test.ts`, `packages/dom/test/keyboard.test.ts`, `review-p2*.test.ts`; `npm run test:browser` (focus through updates, Shift+Tab back, a million rows); `packages/dom/test/a11y-l4a.test.ts` and `node scripts/browser-a11y.mjs --check focus,reflow` (the window following the focus at 320 px).
