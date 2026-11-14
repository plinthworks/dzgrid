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
- **When the grid changes under it (step 11 review):** a shown tooltip, the grid's text or a part, hides at the next paint when its anchor has left the page (a header cell of a column hidden, a row unmounted), when its pooled cell now shows another row or new data (a sort, a filter, an update of the rows: its text would be stale), and when the parts registry changes (`update({ parts })`: a tooltip part removed or replaced is destroyed then; the next show mounts the new one). A paint that changes none of these keeps it. A show still waiting for its delay checks only that its anchor is on the page.
- **A part instead (`@dzgrid/dom/slots`, step 11):** a part registered as `tooltip` (or `tooltip.<type>`, or named by the column's `ui.tooltip`) draws the tooltip's content: rich text, a small table. The host's text still decides (D11, decision O5): no text, no tooltip, part or not. The part's context: `text` (the host's text), `value` (the cell's value as the column's codec reads it), `row`, `column`; for a header, `value` and `row` are null. It is mounted when the tooltip shows and destroyed when it hides, so a hidden tooltip keeps no row; moving to another anchor destroys it and mounts it again. The grid keeps the one `.dzg-tooltip` element (`role="tooltip"`, `aria-describedby`, the top layer, the delay, Escape, the pointer moving onto it) and places it after the part has drawn, so its size is the part's.

## Tests
`packages/dom/test/tooltip.test.ts`; `slots-gaps.test.ts` (hidden with its column, rebound by a sort, an update of the rows, a registry change; kept by a paint that changes nothing; for the text and the part), `slots-lifecycle-property.test.ts` (random sequences: no part left live for a hidden tooltip), `slots-tooltip.test.ts` (the part: rich content, a header's null row and value, destroyed at hide, `aria-describedby`, Escape, placed after it is drawn, right to left). Not yet in a browser: the top layer (`popover`) is Phase 3, so a tooltip inside a transformed ancestor may be clipped today.

## 1.12.0 (owner 2026-11-14: the simple tooltip stays; the rich bubbles moved to DzTooltip)
The grid keeps the tooltip above, its look as variables and its arrow (`presentation-settings.md` 31–32), and gains:

10. **A column's tooltip in one line.** `tooltip: true` shows the cell's text as displayed; `tooltip: false` shows
    none, whatever the grid says; options `{ text, when: 'truncated', delayMs, content, … }` — `text` left out means
    the cell's displayed text, `when: 'truncated'` shows it only while the cell's text is cut (an ellipsis), `content`
    is the cell's own answer laid over the options (a function returning words, a spec, or null for none), `delayMs`
    the column's own hover delay. A function stays what it was (`(value, row, context) => words | null`), and may
    return a spec. The grid's `tooltips.cells`: `false` silences every column's tooltip, `'truncated'` gives every
    column that says nothing its cut text. `headerTooltip` takes words or a spec (its `text`).
11. **A look the grid's bubble ignores.** A spec's or the options' `tone`, `placement`, `animation`, `shape`, `style`,
    `maxWidth` and `html` are carried to a feature that draws the tooltips (12); without one the grid shows the words
    (HTML: its `text`, or nothing) and tells once `missing-feature` (`columns[i].tooltip` or `.headerTooltip`,
    detail `tooltips`, a warning).
12. **A show waiting for its delay is dropped** by a press, Escape, or the focus leaving the grid; a touch alone never
    shows one (a tap is no hover).
13. **The seam (`FeatureHandle.tooltips`).** A feature may take the tooltips over: the grid still decides when (the
    delay, a keyboard focus, Escape, a press, a scroll, the paint that hides a stale one) and what (the words, a failed
    save's reason, a part, `aria-describedby`); the feature says what else the pointer is followed on (`targets`), may
    answer a target first (`tipFor`: a header button's name), may refuse a show at the end of its delay (`ok`), may clean
    a column's HTML (`html`), and shows and hides the grid's tooltip element (`show`, `hide` with a `done` once its
    closing is over). The first feature giving one wins. `@dztooltip/dzgrid` is that feature:
    `features: [dzTooltips({ … })]` (tones, placements, shapes, animations, the header buttons' names, cleaned HTML).
    Tooltips anywhere in the page and popovers are DzTooltip's (`@dztooltip/core`, `@dztooltip/angular`), never DzGrid's.

Tests: `tooltip-column-1-12.test.ts` (10–11, the seam taken by a feature: 13), `tooltip-pending.test.ts` (12).
