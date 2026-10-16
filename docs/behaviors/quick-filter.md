# The quick search box

## What the user does
Types words into one search box above the grid.

## What they observe
- Every word must appear somewhere in the row, in any visible column, in any order.
- The list narrows as the user types. Hidden columns are not searched.

## What DzGrid does
- Folding: case, accents, Arabic short vowels, tatweel, alef forms, `ى` read as `ي`, Arabic presentation forms decomposed (`ﻻ` is `لا`); Arabic-Indic and Latin digits are the same digits.
- `ة` is not folded into `ه`: they are different letters, and the collator agrees (S5).
- Number and date columns are searched only when the word holds a digit, against their displayed text and their export text.

## Tests
`conformance/cases/quick-filter/*`.
