# Filters as the server receives them

## What the user does
Filters a grid fed by a server: types in a filter box, picks a day or a moment, ticks values in a list, combines two conditions — while the grid's zone is Algiers, Paris or Kathmandu.

## What they observe
- The rows the server returns are the rows the same filter keeps in the browser: same days, same bounds, same blanks.
- Half-typed filters (an empty box, a *between* with one end) ask nothing: no loading state, no new request, the page stays.
- A filter the grid cannot apply (a column that is gone, or that refuses filtering) asks nothing either, and is reported.
- Changing the grid's zone asks again: a day's bounds depend on it.

## What DzGrid does
`toWire(filter, { ctx, columns, kinds?, now? })` in `@dzgrid/core/server` turns the filter model into its wire form: the model, cleaned and made absolute. The request's `filter` is that form; `sourceRows` computes it once per new query, zone or column change, never per page.

Per kind (the field names are the model's):
- **text** `{type, op, value, caseSensitive?}`: the value as typed, not folded (folding is the server's); `caseSensitive` only when true. `blank`/`notBlank` travel as `{type, op}` alone. An empty box is dropped.
- **number** `{type, op, value, valueTo?}`: finite numbers only; `between` sent with `value <= valueTo` (swapped ends put in order), inclusive. `valueTo` travels with `between` only.
- **day** `{type, op, value, valueTo?}`: civil days `YYYY-MM-DD`, no zone, never an instant; `between` ordered and inclusive.
- **relative** (a shortcut, `filter-relative.md`): no new op on the wire. A day column's travels as `{type: 'day', op: 'between', value, valueTo, relative, zone}`, an instant column's as `{type: 'instant', op: 'betweenDays', day, dayTo, resolved, zone, relative}`: the days resolved from `now` in the grid's zone, the shortcut's name in `relative`. `now` (milliseconds) is `WireEnv.now`; `sourceRows` reads it from `ModelEnv.now` when it makes the wire form. Without it the shortcut is dropped (`invalid-filter`, detail `no clock`); an unknown name is `invalid-filter` at `.range`.
- **instant**, `blank`/`notBlank`: `{type, op}`. Range ops: the fields the op reads (`day`, `dayTo` or `at`, `atTo`, as the user gave them) plus `resolved: {from, to}` and `zone`. `resolved` is half-open `[from, to)` in UTC, `null` for an open end, always written `YYYY-MM-DDTHH:mm:ss.sssZ` with three digits of milliseconds even when zero, so comparing the strings compares the times. *After* a moment starts one millisecond later. A day comes from the zone's real day bounds: 23, 23.5, 24, 24.5 or 25 hours, or empty (`from == to`, Samoa's skipped 2011-12-30), sent as is. **The server reads `resolved` only**; the rest is for logs and saved views.
- **boolean** `{type, value}`; `value: null` is dropped.
- **set** `{type, include | exclude, blanks?}` as given; `include: []` is kept (it keeps nothing, blanks aside when asked).
- **combined** `{type, join, conditions}`: the structure kept, depth 3 at most as in the browser; half-typed members dropped; with no member left it is dropped; one bad member drops the whole filter; one member left stays combined.
- **custom** (a filter kind from a module, `filter-custom.md`): `{type: 'custom', kind, value}`, `value` from the kind's `wire(state, ctx, zone)`, or the state itself. It must be JSON (finite numbers, plain objects, depth 20 at most). On the server a kind needs no `test`; in the browser one without it is `filter-needs-server`.

Filters apply whatever the column's visibility: a hidden column's filter travels too.

### Drops and problems
The same as the browser's, same codes and paths:
- a column that does not exist: `unknown-column` at `filter.<col>`;
- a column with `filter: false`, a filter of the wrong type for the column, an unknown op or a value of the wrong type (`NaN`, `Infinity`, a number for text): `invalid-filter` (at `filter.<col>`, or at `.op`, `.value`, `.valueTo`, `.blanks`);
- a day that is not one: `invalid-day`; a moment that is not one: `invalid-instant`; one written without an offset: `ambiguous-instant` (never guessed);
- a bound outside the years 0000–9999, which the wire form cannot write: `invalid-instant` at `filter.<col>.resolved`;
- on a column whose set filter is include only (`filter: { kind: 'set', exclude: false }`, filter-set.md « Include only »), a set filter with `exclude` or `blanks`: `invalid-filter` at `filter.<col>.exclude` (or `.blanks`), detail `exclude: false`;
- a custom kind unknown, refusing its state, not for this column type, whose `wire` throws or returns something that is not JSON: `invalid-filter` with a detail.
A filter with an error is dropped from the request and the error stays in the model's `problems`. A half-typed filter is dropped with no problem.

### The request key
The epoch key and the request key are made from the wire form, the search, the sort, the zone and the params. So a half-typed or refused edit leaves the wire form, hence the key, unchanged: **no new epoch, no page reset, no request** (deliberate). A zone change moves `resolved`, hence the key. A shortcut's days move at midnight in the grid's zone: `model.tick()` makes the wire form again and asks once when it changed (a new epoch), never when it did not. A language change asks nothing (unless a custom kind's wire form reads the language). A column change that alters what can be filtered (removed, `filter: false`, another type) is re-read and asks again only if the wire form changed.

### Value lists
A value list's request (`DataSource.values`, `value-list.md`) carries the same wire form without the list's own column (the counts ignore its filter), the zone and the params; the search only when it runs on the server.

### Out of scope
- Cells with fractions of a millisecond: the grid's instants are whole milliseconds. A bound given as a fractional number of milliseconds is written rounded up, which keeps the same whole-millisecond rows.
- The quick search is not part of the wire form. Note for step 16: the browser searches visible columns only; the server cannot know which are visible.

## Tests
- `packages/core/test/wire.test.ts` (one case per kind and per drop rule, JSON round trip, custom kinds, combined).
- `packages/core/test/wire-property.test.ts`: seeded filters over 13 zones; the browser's result equals an oracle that reads the wire form only; the wire's problems equal the browser's.
- `conformance/cases/wire/*` (suite `wire`; `*relative*` for the shortcuts, with `input.now`).
- `packages/core/test/source-rows-clock.test.ts` (midnight: one request, none at 23:59:59, none without a shortcut).
- In `sourceRows`: `conformance/cases/source-model/{wire-resolved-bounds,wire-zone-refetch,wire-inactive-no-request,wire-unfilterable-dropped}`, `packages/core/test/source-rows-wire.test.ts` (once per epoch, not per page; filter kinds; columns re-read; language and zone).
- Bench: `toWire 7 filters (2 instant, Algiers)` (`perf/budgets.json`, 0.5 ms).

## Known differences with the browser (step 6 test analysis, 2026-10-18)
- A bound outside the years 0000-9999 (`after 9999-12-31T23:59:59.999Z`, `onDay 0000-01-01` east of UTC) cannot be written: the filter is refused on the wire (`invalid-instant` at `.resolved`) and the server gets none, while the browser applies it. Such dates do not occur in real data.
- Text travels as typed. The browser compares a case-sensitive needle in NFC; a server that compares exactly should normalize too (the host's mapping decides, with the server's rules).
- `at` is part of the request key as given: `0` and `'1970-01-01T00:00:00Z'` are the same moment but two requests; so are `UTC` and `Etc/UTC`.
