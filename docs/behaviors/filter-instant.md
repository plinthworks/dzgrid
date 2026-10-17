# Filtering a date-and-time column

## What the user does
Picks *on this day*, *between days*, *before* or *after* a moment, *between* two moments.

## What they observe
- *On this day* shows everything that happened that day, in the time zone the grid displays.
- *Between days* covers the whole of both days.

## What DzGrid does
- Day bounds come from `zoneDayBounds`: a day may last 23, 23.5, 24, 24.5 or 25 hours, or not exist at all (Samoa, 2011-12-30).
- The range is half-open, `[from, to)`: 23:59:59.999 is in, midnight of the next day is out.
- The model carries machine values only; a moment needs its offset. The server receives the resolved bounds in UTC, computed once, so it needs no zone and cannot pick the wrong day: the filter as given plus `resolved: {from, to}` (half-open, `null` for an open end, always `YYYY-MM-DDTHH:mm:ss.sssZ` with three digits of milliseconds) and the `zone` they were computed in (`docs/behaviors/server-filter.md`).

## Tests
`conformance/cases/filter-instant/*`.
