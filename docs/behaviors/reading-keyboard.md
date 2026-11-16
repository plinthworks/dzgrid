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

## A column the keyboard skips (1.13.0, owner 2026-11-16, « A »)
- `keyboard: false` on a column (`ColumnDef`; default true): the arrows, Home and End jump over it, in the header rows
  as in the body — ArrowRight from the column before it lands on the column after it, Home on the first column the
  keyboard takes; Tab enters the grid on the first such column. It is still a column: drawn, sized, sorted, filtered,
  read by a screen reader (its header names its cells), and it can hold content — a chevron, a button — which a click
  reaches. A click on it focuses it; the arrows from there go on (Up and Down stay in it, Left and Right leave it).
  A group header above it stays a stop. Every column skipped: the keys stay where they are.
- For a column whose cells are empty on purpose (the space under a master's chevron in a detail's grid, a spacer).

## Tests
`packages/dom/test/rustines-1-13.test.ts` (« A column the keyboard skips »);
`conformance/cases/keyboard-intent/*`, `conformance/cases/focus-fallback/*`, `packages/core/test/keys.test.ts`, `packages/dom/test/keyboard.test.ts`, `review-p2*.test.ts`; `npm run test:browser` (focus through updates, Shift+Tab back, a million rows); `packages/dom/test/a11y-l4a.test.ts` and `node scripts/browser-a11y.mjs --check focus,reflow` (the window following the focus at 320 px).
