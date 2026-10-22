# The quick search box

## What the user does
Types words into one search box above the grid (the page's own field, bound with `quickSearch()` from
`@dzgrid/dom/search`: its pause, keys, echo and announcement are in `quick-search-box.md`, step 16).

## What they observe
- Every word must appear somewhere in the row, in any visible column, in any order.
- The list narrows as the user types. Hidden columns are not searched.

## What DzGrid does
- Folding: case, accents, Arabic short vowels, tatweel, alef forms, `ى` read as `ي`, Arabic presentation forms decomposed (`ﻻ` is `لا`); Arabic-Indic and Latin digits are the same digits.
- `ة` is not folded into `ه`: they are different letters, and the collator agrees (S5).
- The text searched is the box's without spaces at its ends (the box trims; a host's `quick.set` is taken as given).
- Matches are not highlighted in the cells yet (Phase 6).
- Number and date columns are searched only when the word holds a digit, against their displayed text and their export text. Boolean columns are not searched.

## Tests
`conformance/cases/quick-filter/*`; the box: `packages/dom/test/search.test.ts`, `search-walk.test.ts`.
