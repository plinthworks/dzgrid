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
- Free-text cells isolate their content (`unicode-bidi: plaintext`); number cells are isolated left to right (S2, §3.9).

## Tests
`packages/dom/test/dir.test.ts`, guard "no physical sides", browser suite `rtl` (three engines).
