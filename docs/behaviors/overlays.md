# Loading, no rows, error

## What the user does
Opens a grid that is loading, empty, filtered to nothing, or failed.

## What they observe
- A message over the body says which: loading, no rows, no rows match the filters, or the error.
- The header stays visible and usable; the message is read by screen readers once.

## What DzGrid does
- "No rows" and "no matches" come from the counts; "loading" and "error" from the host (`update({ overlay })`).
- The overlay sits outside `role="grid"` (axe `aria-required-children`, S4); while loading the grid has `aria-busy="true"`.
- Texts come from the messages bundle, in the grid's language.

## Tests
`packages/dom/test/overlays.test.ts`, browser suite `axe`.
