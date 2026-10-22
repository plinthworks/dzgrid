# Filtering a number column

## What the user does
Picks equals, not equal, less than, less or equal, greater than, greater or equal, between, blank, not blank, and types a number.

## What they observe
- Typing `5` keeps the rows holding 5. *Between* includes both ends.

## What DzGrid does
- Bounds given in the wrong order are swapped, not treated as an empty range.
- A cell that cannot be read as a number counts as blank, with a warning (D4); comparisons never match a blank, *not equal* does.
- The filter model holds machine numbers, never locale text: `1,5` typed in French is turned into 1.5 by the input, not by the filter.
- A half-typed filter (between with one bound) is inactive, not an empty result.
- **The floating box** (step 12) edits *equals*: what is typed is read in the grid's locale and numerals (`readNumber`: `1,5` in French, `١٫٥` or `1.5` in Arabic, `12%` as 0.12, a leading minus); text that cannot be read is not applied, marked `aria-invalid` and said once, when the edit would apply rather than per keystroke. A filter coming back is written in the locale without grouping. The `>5` syntax is Phase 6.
- **The popup** (step 13): an operator (`equals` first; `filter.ops` narrows the nine) and a value read as the floating box reads it; *between* shows a second field (`filter.valueTo`) and needs both bounds (one alone filters nothing). An unreadable field is marked and said once; at Apply or Enter the focus goes to it and nothing is sent.

## Tests
`conformance/cases/filter-number/*`; the floating box: `packages/dom/test/filters-floating.test.ts`.
