# Right to left

## What the user does
Uses the grid in Arabic, or in a page whose direction changes.

## What they observe
- Columns run from right to left; the first column is on the right; the scrollbar starts on the right.
- Numbers, dates and Latin words inside Arabic text read in their own order.
- Arrow keys, resize, pinning and tooltips follow the reading direction.

## What DzGrid does
- Direction is read from the host (`dir`, inherited), or set by the `dir` setting; a change of an ancestor's `dir` is noticed.
- All CSS is logical (`inset-inline-start`, `padding-inline`…); one module, `dir.ts`, converts the browser's inline scroll position (which differs between engines in right to left) to a logical one.
- A value that mixes directions with the grid gets its own bidi paragraph (`unicode-bidi: plaintext`): Arabic in a left-to-right grid, Latin, digits or a final punctuation in a right-to-left one; numbers are isolated left to right in a right-to-left grid (S2, refined in Phase 2: a value that reads correctly as it is gets no extra node).

## Tests
`packages/dom/test/{dir,bidi,review-p2g}.test.ts`, guard "no physical sides"; `npm run test:browser -- --all` (RTL alignment and pinning, direction switched live, three engines).
