# Filtering a date-and-time column

## What the user does
Picks *on this day*, *between days*, *before* or *after* a moment, *between* two moments; or a shortcut (*today*, *last 7 days*, *this month*…).

## What they observe
- *On this day* shows everything that happened that day, in the time zone the grid displays.
- *Between days* covers the whole of both days.

## What DzGrid does
- Day bounds come from `zoneDayBounds`: a day may last 23, 23.5, 24, 24.5 or 25 hours, or not exist at all (Samoa, 2011-12-30).
- A shortcut (`{type: 'instant', op: 'relative', range}`) is the whole days it names, counted from today in the grid's zone: `[start of the first, start of the day after the last)`; *today* lasts 23 or 25 hours on a clock-change day (`filter-relative.md`).
- The range is half-open, `[from, to)`: 23:59:59.999 is in, midnight of the next day is out.
- The model carries machine values only; a moment needs its offset. The server receives the resolved bounds in UTC, computed once, so it needs no zone and cannot pick the wrong day: the filter as given plus `resolved: {from, to}` (half-open, `null` for an open end, always `YYYY-MM-DDTHH:mm:ss.sssZ` with three digits of milliseconds) and the `zone` they were computed in (`docs/behaviors/server-filter.md`). A shortcut travels as `betweenDays` with its days and `resolved`, plus `relative` (its name).

- **In the popup** (step 14, `filter-date-picker.md`): tzslot's date field for *on this day*, its period field for *between days* (with the shortcuts) and *between* two moments (`[from, to)`, no shortcuts), its date-and-time field for *before* / *after*; all in the grid's zone, written above the field. A skipped wall time moves to the first moment that exists (tzslot's note); a repeated one takes the first reading, a button the second.

## Tests
`conformance/cases/filter-instant/*` (`relative-*` for the shortcuts); the popup: `packages/dom/test/filters-dates.test.ts`; the core against tzslot: `packages/dom/test/tzslot-agreement.test.ts`.
