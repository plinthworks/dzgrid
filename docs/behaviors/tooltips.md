# Tooltips

## What the user does
Rests the pointer on a header or a cell; or moves focus to it with the keyboard.

## What they observe
- After half a second of hover the tooltip appears; on keyboard focus it appears at once.
- The pointer can move onto the tooltip without it disappearing; Escape closes it.
- It stays inside the window and never covers the cell it describes.

## What DzGrid does
- Only host text is shown (`headerTooltip`, `tooltip(value, row)`), never the cell's content guessed.
- One tooltip element per grid, `role="tooltip"`, outside the grid's rows; the focused cell gets `aria-describedby` while it is shown (WCAG 1.4.13).
- Placed in logical coordinates: in Arabic it opens toward the start, on the right.

## Tests
`packages/dom/test/tooltip.test.ts`. Not yet in a browser: the top layer (`popover`) is Phase 3, so a tooltip inside a transformed ancestor may be clipped today.
