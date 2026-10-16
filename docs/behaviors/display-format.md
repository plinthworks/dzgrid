# How values are shown

## What the user does
Reads numbers and dates in the grid.

## What they observe
- Values are written the way the user's language writes them, the same on every machine.

## What DzGrid does
- The Gregorian calendar always, even for `ar-SA`, which Safari would otherwise open in Umm al-Qura (S5).
- Latin digits by default; `numerals: 'locale'` opts into the language's digits.
- Years before 1583 are written in ISO form.
- Arabic output may contain invisible direction marks; copy and export use the raw value, not the display.

## Tests
`conformance/cases/format/*`.
