# Filtering a calendar-day column

## What the user does
Picks on, before, after or between, and chooses one or two days; or a shortcut (*today*, *last 7 days*, *this month*…).

## What they observe
- The comparison is by calendar day; no time of day is involved. *Between* includes both ends.

## What DzGrid does
- A `Day` is never turned into an instant, and no time zone is involved at any point: a birth date is the same day for everyone.
- A day that does not exist (31 February) is an error in the filter, never rolled into March.
- A shortcut (`{type: 'day', op: 'relative', range}`) is counted from today in the grid's zone, both ends in, and follows the clock (`filter-relative.md`).
- The server receives the model's own fields, cleaned (`docs/behaviors/server-filter.md`): `{type: 'day', op, value, valueTo?}`, civil days without a zone; `between` in order, both ends included. A shortcut travels as `between` with its days resolved, plus `relative` (its name) and `zone`.

## Tests
`conformance/cases/filter-day/*` (`relative-*` for the shortcuts).
