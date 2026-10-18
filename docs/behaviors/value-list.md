# Value lists (the set filter's choices)

## What the user does
Opens a column's value-list filter: sees the values the column holds, with how many rows each one has, a search box above them; types a few letters; ticks and unticks.

## What they observe
- Each value once, in the column's sort order, with its label as the cell shows it (an enum's label, a number or a date in the user's language and digits, a moment in the grid's zone).
- How many rows each value has, counting what the **other** filters and the search keep — never the column's own filter, so unticking a value does not make the others vanish.
- Blanks counted apart, as their own choice.
- The search box narrows the list, never the counts and never the filter.
- A list too long to show whole says so; the user refines the search.
- While a server's list loads, the old one stays; a closed popup leaves no request behind.

## The owner's rule (2026-10-18)
« Montrer une option qui ne remonte rien est faux. » The list shows the values present in the rows the other filters (and, in the browser, the search) keep: crossing with the other filters never offers a choice that returns nothing. With no other filter it is everything in the data (the rows held in the browser, or the server's database). **A value with no row is not listed.**

One exception, kept in the core so the UI cannot forget it: a value ticked in the column's own filter (`include`) that has no row under the other filters is still returned, with count 0 and `selected: true`. The user can always untick what they ticked.

## What DzGrid does
- `kernel.values(column, { search?, max? })` gives a handle: `status` (`idle`, `loading`, `error`), `result` (`{ values, blanks, truncated }`, the last accepted one, kept while a new one loads), `available`, `failure`, `problems`, and `search(text)`, `refresh()`, `subscribe(fn)`, `close()`. One handle per column: asking again closes the first. It changes no state: no command, no `modelUpdated`, and a failure never reaches the rows overlay (`fetchFailed` is for rows).
- Each entry is `{ value, label, count, selected? }`. `value` is the export text (what a set filter matches: `filter-misc.md`), `label` the codec's `format` of a row holding it. Two values may share a label (an enum value outside its options, `1` and `1.0` in a text column are two values); both stay.
- **Where:** when the filter runs in the browser (a grid on rows, a fetched set filtered in the browser), from the rows held, synchronously. When the filter runs on the server, from the source's `values(request)` only — never from the rows held, which are one page or one filtered set. A source without `values` gives `available: false` and an empty list; the UI falls back to the column's enum options (step 15).
- **Order:** the column's sort order (text and enum labels by the collator, enums in option order when so sorted, numbers, days, moments by value); values the collator holds equal (`été`, `Ete`) stay apart, next to each other, by their export text's code units. A server's list keeps the host's order.
- **Counts:** rows passing every other column's filter (hidden columns too) and, in the browser, the quick search; the column's own filter is removed whole, a combined one included. A server's counts are the host's: `null` when it sends none.
- **Blanks:** in the browser, the rows passing the other filters whose cell is blank or unreadable (as the set filter reads them), a number, independent of the search and of the cap. A server says it, or `null`.
- **Search:** trimmed; its words, folded like the quick search (case, accents, Arabic marks and digits), must each be found in the label or in the value. In the browser it narrows the entries; a server receives it raw (trimmed) and folds by its own rules.
- **Cap:** `max`, 2 000 by default (`VALUES_MAX`): the first `max` values in order, `truncated: true` when more matched. An invalid `max` reads as the default. A server receives it as `limit`; a longer answer is cut, `truncated`, with a warning.
- **Ticked values with no row** (the exception above) come **first**, in the order of the column's `include` list, before the values found; they obey a non-empty search like the others, and are never cut by the cap. Their label is the codec's reading of the value (the value itself when it cannot read it). Only these entries carry `selected`.
- **Freshness in the browser:** the list follows the rows, the edit overlay, the language, digits and zone, the column definitions, the other filters and the search (and the columns it reads); the handle tells its listeners only when its result changed. Ticking in the column's own filter changes nothing, except a ticked value with no row appearing or leaving.
- **On a server**, each list is a request on the gate's channel `values:<column>` (`request-order.md`): `{ column, search, limit, filter, quick?, params, zone, key, signal }`, where `filter` is the server's filter as sent **without this column**, `quick` the search only when the search runs on the server. A new search supersedes the request before; closing cancels it (`aborted`, never an error); a new epoch drops what was in flight. After any change of the model, an open list whose request would be the same keeps its answer and asks nothing (applying the column's own filter changes the epoch, not the list); one whose request differs asks again, the old list shown meanwhile.
- **A server's answer:** an array of `{ value, label?, count? }`, or `{ values, blanks?, truncated? }`. Missing label: the value. A value with count 0 is dropped (the owner's rule). Anything else is bent with `invalid-values-response`: not a list → error (the handle's status and failure); an entry without a string value, a value seen before (the first wins) → dropped, warning at `response.values[i]` (ten at most, then one summary at `response.values`); a count that is not a whole number ≥ 0 → `null`, warning at `response.values[i].count`; a label that is not text → the value, warning at `response.values[i].label`; more entries than `limit` → cut, warning at `response.values`; bad `blanks` or `truncated` → `null` or false, warning there. A throw or a rejected promise is the handle's error, the host's error unchanged; a refresh asks again.
- **Unknown column or one that cannot be filtered:** a closed handle, `available: false`, empty, with `unknown-column` or `invalid-filter` at `values.<column>`. The kernel tells a handle's new problems once (`problems` event, source `data`).

## Tests
- `packages/core/test/distinct.test.ts` (labels, order, counts, blanks, search, cap, the owner's rule, memo and invalidation).
- `packages/core/test/values-property.test.ts` (seeded rows, languages and filters against an oracle of its own).
- `packages/core/test/source-values.test.ts` (requests, supersede, cancel, epochs, failures, the answer read, destroy).
- `conformance/cases/value-list/*`, `conformance/cases/source-model/values-*`, `conformance/cases/server-gate/values-channel-per-column.json`, `conformance/cases/problems/invalid-values-response.json`.
- The popup's list (virtualised, select all shown, blanks, Apply on a server): step 15.
