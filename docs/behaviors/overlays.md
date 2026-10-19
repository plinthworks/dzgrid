# Loading, no rows, error

## What the user does
Opens a grid that is loading, empty, filtered to nothing, or failed.

## What they observe
- A message over the body says which: loading, no rows, no rows match the filters, or the error.
- The header stays visible and usable; the message is read by screen readers once.
- When loading failed, a "Retry" button sits under the message. Clicking it (or Tab to it, then Enter or Space) asks for the rows again; the focus goes back to the grid and "Loading" is announced.

## What DzGrid does
- "No rows" and "no matches" come from the counts; "loading" and "error" from the host (`update({ overlay })`).
- The overlay sits outside `role="grid"` (axe `aria-required-children`, S4); while loading the grid has `aria-busy="true"`.
- Texts come from the messages bundle, in the grid's language.
- **Which overlay:** the host's `overlay` first (`'loading'`, `'error'`); then a server's error, shown over the rows kept; a server's loading only when there is no row to keep; then no rows (`counts.total` is 0); then no match (nothing displayed).
- **Retry (step 11, built into the base, owner decision O3):** a native `<button type="button">` labelled `grid.retry` ("Retry", "Réessayer", "إعادة المحاولة"), shown with the error overlay only, never with the others. A click dispatches `rows.refresh` (source `user`), puts the focus back on the grid's focused cell (the grid itself when nothing was focused) and announces `announce.loading`. The overlay itself lets pointer events through (rows kept under a loading or error message stay usable); every element directly inside it takes them back, with all it holds: the button, and a part's own controls (a link, a field, a `select`, a `summary`, a `[role=button]`, a `[tabindex]`), `:where(.dzg-overlay > *) { pointer-events: auto }` (step 11 review). The grid's own message is a text node, so it never catches the pointer; a part's text in an element does, over its own box only (the overlay centres its content, it does not stretch it). It is outside `role="grid"`, reached by Tab after the grid, and traps nothing. With a host overlay (`overlay: 'error'`) the button is there too; the overlay stays until the host clears it.
- **A part instead (`@dzgrid/dom/slots`):** a part registered as `overlay` draws the overlay's content in place of the message and the button (`parts.md`). Its context: `phase` (`'loading'`, `'empty'`, `'no-match'`, `'error'`), `failure` (what the server's fetch failed with; null outside an error, and null for a host overlay without a failure), `retry()` (what the button does) and `clearFilters()` (every column filter and the quick search emptied, source `user`, in one `query.set` that keeps the sort: one request to a server, step 12). It is mounted when an overlay first shows, updated when the phase or the failure changes, destroyed when the overlay hides: a hidden overlay holds no failure. The grid keeps the overlay element, its place and `hidden`.

## Tests
`packages/dom/test/grid.test.ts` (overlay states), `review-p2c.test.ts` (hidden and cleared), `tooltip.test.ts` (announced); `overlay-retry.test.ts` (the button, its click, the focus, when it shows), `slots-overlay.test.ts` (the part, its four phases, `failure`, `clearFilters`), `slots-gaps.test.ts` (the layout rules give pointer events to a link, a field, a select, a textarea, a summary, a `[role=button]`, a `[tabindex]` and a nested link inside the overlay, never to the overlay itself); `npm run test:browser` (axe with each overlay, the overlay really hides; the retry button in fr and in ar right to left: axe, reached by Tab, pressed by Enter, outside the grid, no focus trap; an overlay part's link and field on top under the pointer, the link followed by a click, the field focused, the overlay around them still letting the pointer through).
