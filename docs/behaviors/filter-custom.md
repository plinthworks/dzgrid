# Custom filter kinds

## What the user does
Filters a column with a filter the host wrote for its own data: a range picker on a score, a "within N km" on a location, a code list from a terminology server. The user sees it as any other column filter: a popup, a floating box, a summary.

## What they observe
- The rows kept are the rows the kind's rule keeps, like a built-in filter: hidden columns filter too, blanks are what the kind says of a missing value.
- Half-typed (a range with one end): nothing filters, nothing is said.
- A filter that cannot work where it is asked to run is ignored and said, never a crash, never rows silently dropped.

## What DzGrid does
A kind is a plain object the host registers once, `filterKinds: [kind, …]` on the grid (fixed: a live change is refused with `unsupported-live-change`):

- `name`: what a filter names in `{type: 'custom', kind, state}`. Not empty, no dot, not a built-in name (`text`, `number`, `day`, `instant`, `boolean`, `set`, `custom`, `combined`). A bad name or a second kind of the same name is refused (`invalid-filter` at `filterKinds[i]`, detail `name` or `duplicate`); the first of a name wins. The UI parts of a kind are found by name: `filter.<name>`, `floating.<name>`.
- `types`: the column types it accepts; any when absent.
- `read(state)`: checks the JSON state (from the host, a saved view, a URL) and returns it, tidied, or `'invalid'`. States are JSON: a host that passes something else (a cycle, a `BigInt`, a function) has its filter command refused (`invalid-filter`, detail `not json`), the filter in force kept.
- `active(state)`: false for a half-typed state: no filter, no problem.
- `test(state, ctx)` (optional): the browser's rule. It returns a predicate called per row with the column's value as the grid reads it (coerced by the column's codec, `null` for a blank or unreadable cell, through the edit overlay) and the host's row (the base row, not the overlay).
- `wire(state, ctx, zone)` (optional): what the server receives; the state itself when absent (see `server-filter.md`).

Where it runs follows `operations.filter`:
- **In the browser** (`'client'`, also a fetched set filtered in the browser): `read`, `active`, then `test`. A kind with no `test` cannot run there: the filter is dropped with the error `filter-needs-server` at `filter.<col>` (or `.conditions[i]` inside a combined filter), detail the kind's name. Never for a half-typed state, never for an unknown kind (that is `invalid-filter`).
- **On the server** (`'server'`): `read`, `active`, then `wire`; `test` is not needed and never called. No `filter-needs-server` there.

Problems, the same codes and paths in the browser and on the wire: unknown kind (`unknown kind`), wrong column type (`column type`), state refused (`invalid state`), a kind function that throws (`threw`): `invalid-filter` with that detail, the filter dropped. A `test` predicate that throws on a row: that row is not kept, and `invalid-filter` `threw` is said once for the filter, not once per row. A detail is never row data.

Told: a filter change whose problems differ from those before is told once (the kernel's `problems` event) as well as kept in the model's `problems`; the same refused filter set again is not told again.

The values a kind tests are kept per column (`ColumnCache.values`): built when a custom filter first needs them, reused across sorts and filter edits, patched by an update of some rows, dropped with the cache.

**A kind's floating part** (step 12): `floating.<name>` in `settings.parts`, else the summary. Its context gives the kind's state (null: none) and `set(next)`, which stores `{type: 'custom', kind, state: next}`. A part must send null when the state is not active (`kind.active(state)` false): a stored inactive state still counts as a filter for the kernel (with `selection.keepOnFilter: false` it clears the selection). The built-in boxes never store an empty filter. A kind without `test` while the browser filters gets no floating cell.

Not now: a kind given by a feature (`GridFeature.kinds`), and a warning at creation for a server-only kind under a browser filter (the filter UI hides such a kind, steps 12-13).

## Tests
- `packages/core/test/custom-filter.test.ts` (registry, read/active/test, throws told once, values cache memo and patch, the kernel's JSON guard, one problems event per command).
- `packages/core/test/wire-property.test.ts` (custom ranges: the browser equals an oracle reading the wire value; same problems).
- `conformance/cases/filter-custom/*`, `conformance/cases/problems/filter-needs-server.json`, `conformance/cases/source-model/{custom-client-needs-server,custom-server-sends-wire}.json`.
- `packages/dom/test/filter-kinds.test.ts` (both models get the kinds, live change refused, registry problems told at creation).

## Plain data only (step 8 test analysis, 2026-10-18)
- A filter given to `filter.set` or `filter.column` must be plain data. A cycle, a BigInt, a function, a getter that throws, or a field set to `undefined` inside a custom state: the command is refused (`invalid-filter`, detail `not json`) and the filter in force stays — for built-in filters too.
- A custom state is copied once when it is taken: the request key and the kind read the same state, even if the host's object changes or a getter answers differently later.
- `query.set` takes the host's `makeQuery` result as it is: the host built its key.
