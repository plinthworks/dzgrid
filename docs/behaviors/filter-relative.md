# Relative date filters ("today", "last 7 days")

## What the user does
In a date filter, picks a shortcut instead of two days: *today*, *yesterday*, *last 7 days*, *last 30 days*, *this month*, *last month*. Leaves the screen open overnight.

## What they observe
- The shortcut keeps the rows of those days, counted from the day the clock reads now **in the grid's zone**.
- The filter stays a shortcut: tomorrow, *today* means tomorrow's date. A saved view keeps "last 7 days", never two fixed days.
- At midnight (in the grid's zone) an open screen moves to the new day by itself: the rows are filtered again once, a server is asked once. Nothing happens at 23:59:59, and nothing at midnight when no shortcut is in force.
- Both ends are included, as in a calendar: *last 7 days* is six days back and today; *this month* is the whole month, the days still to come included; *last month* is the whole previous month.

## What DzGrid does
Six names, the ones tzslot uses (`PresetName`), with tzslot's meaning (`presetRange`), checked against it day by day (step 14 part B, `tzslot-agreement.test.ts`):

| `range` | first day | last day |
|---|---|---|
| `today` | today | today |
| `yesterday` | today − 1 | today − 1 |
| `last7Days` | today − 6 | today |
| `last30Days` | today − 29 | today |
| `thisMonth` | the 1st of today's month | its last day |
| `lastMonth` | the 1st of the month before | its last day |

No *this week* (the first day of the week varies) and no shortcut shorter than a day: Phase 5.

### Model
- Day column: `{ type: 'day', op: 'relative', range }`. Instant column: `{ type: 'instant', op: 'relative', range }`. Other fields are not read.
- `RELATIVE_RANGES` (the six names), `relativeDays(range, today)` (the two days, both in; Day arithmetic only) and `dayAt(now, zone)` (`{ day, until }`: the day the clock reads in the zone and the instant it ends) are exported from `@dzgrid/core`.

### Resolution
- "Today" is the day `now` falls on in the grid's zone (`ctx.timeZone`, UTC unless set), for both kinds of column: a `Day` has no zone, so the grid's is the only one there is. Said plainly: with no zone set, *today* begins at midnight UTC.
- Day column: the rows whose day is between the two days, both included (the same test as *between*).
- Instant column: `[start of the first day, start of the day after the last)` in the grid's zone, from `zoneDayBounds`: *today* is 23 or 25 hours on a clock-change day, *last 7 days* across 25 October 2026 in Paris is 169 hours, a day that never existed (Samoa, 2011-12-30) keeps nothing.

### The clock
The core reads no clock (K.2): the time comes in as a number of milliseconds.
- `clientRows({ now: () => number })`, `ModelEnv.now` (what a source model is given), `ColumnEnv.now` (one reading, for one compile), `WireEnv.now` (for `toWire`).
- The DOM grid passes its `clock` setting (`Date.now` by default; tests inject a fake one).
- The client model reads the day only when a filter has a shortcut, and keeps it until the instant it ends (`until`), or until the zone changes or the clock goes back.
- `model.tick()` (client and server models) looks at the clock again: the client filters again only if the day changed and tells it as a query change; a server model makes its wire form again and asks the server only if it changed (a new epoch, one request). `kernel.tick()` forwards it. The filters feature (`@dzgrid/dom/filters`) calls it at midnight in the grid's zone while a shortcut is in force; a host without that feature calls `kernel.tick()` itself.

### Problems
- A name not in the six: `invalid-filter` at `filter.<col>.range`; the filter is ignored.
- No clock given (or one outside the years 0000–9999): `invalid-filter` at `filter.<col>` with the detail `no clock`; the filter is ignored.

### On the wire (`server-filter.md`)
A shortcut travels in the closed set of ops, already resolved, with its name and the zone it was resolved in:
- day: `{ type: 'day', op: 'between', value, valueTo, relative: 'last7Days', zone }`;
- instant: `{ type: 'instant', op: 'betweenDays', day, dayTo, resolved: { from, to }, zone, relative: 'today' }`.
A server that knows only `between` / `betweenDays` (and, for instants, `resolved`) filters correctly; `relative` is for logs and saved views. The request key is made from the wire form, so it changes each midnight and with the zone.

## Tests
- `conformance/cases/filter-day/relative-*`, `conformance/cases/filter-instant/relative-*`, `conformance/cases/wire/*relative*` (cases carry `input.now`, ISO UTC).
- `packages/core/test/relative.test.ts` (the six names against a hand-written oracle over a span of days, month and leap edges, `dayAt`).
- `packages/core/test/client-clock.test.ts`, `packages/core/test/source-rows-clock.test.ts` (midnight with a stepping clock: one re-filter, one request, none at 23:59:59, none without a shortcut, zone change, clock going back).
