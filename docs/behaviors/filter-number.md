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

## Tests
`conformance/cases/filter-number/*`.
