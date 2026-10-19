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
- **A part instead (`@dzgrid/dom/slots`, step 11):** a part registered as `tooltip` (or `tooltip.<type>`, or named by the column's `ui.tooltip`) draws the tooltip's content: rich text, a small table. The host's text still decides (D11, decision O5): no text, no tooltip, part or not. The part's context: `text` (the host's text), `value` (the cell's value as the column's codec reads it), `row`, `column`; for a header, `value` and `row` are null. It is mounted when the tooltip shows and destroyed when it hides, so a hidden tooltip keeps no row; moving to another anchor destroys it and mounts it again. The grid keeps the one `.dzg-tooltip` element (`role="tooltip"`, `aria-describedby`, the top layer, the delay, Escape, the pointer moving onto it) and places it after the part has drawn, so its size is the part's.

## Tests
`packages/dom/test/tooltip.test.ts`; `slots-tooltip.test.ts` (the part: rich content, a header's null row and value, destroyed at hide, `aria-describedby`, Escape, placed after it is drawn, right to left). Not yet in a browser: the top layer (`popover`) is Phase 3, so a tooltip inside a transformed ancestor may be clipped today.
