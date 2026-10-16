# Boolean, value-list and combined filters

## What the user does
Boolean column: all, yes, no. Value list: ticks the values to keep, blank included. Two conditions on one column, joined by AND or OR.

## What they observe
- The value list shows each distinct value once, blanks as their own choice.

## What DzGrid does
- A value list matches on the stable raw text of a value (its export form), never on its translated label, so a filter survives a language change.
- The index of distinct values with counts (`setValues`) arrives with the filter interface in Phase 3.

## Tests
`conformance/cases/filter-set/*`, `conformance/cases/filter-combined/*`.
