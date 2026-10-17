# Filtering a calendar-day column

## What the user does
Picks on, before, after or between, and chooses one or two days.

## What they observe
- The comparison is by calendar day; no time of day is involved. *Between* includes both ends.

## What DzGrid does
- A `Day` is never turned into an instant, and no time zone is involved at any point: a birth date is the same day for everyone.
- A day that does not exist (31 February) is an error in the filter, never rolled into March.
- The server receives the model's own fields, cleaned (`docs/behaviors/server-filter.md`): `{type: 'day', op, value, valueTo?}`, civil days without a zone; `between` in order, both ends included.

## Tests
`conformance/cases/filter-day/*`.
