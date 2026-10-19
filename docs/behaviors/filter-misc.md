# Boolean, value-list and combined filters

## What the user does
Boolean column: all, yes, no. Value list: ticks the values to keep, blank included. Two conditions on one column, joined by AND or OR.

## What they observe
- The value list shows each distinct value once, blanks as their own choice.

## What DzGrid does
- A value list matches on the stable raw text of a value (its export form), never on its translated label, so a filter survives a language change.
- Two per-column caches, kept apart (step 8):
  - `ColumnCache.values`: each row's value as the codec reads it (null for blank), what a custom kind tests (`filter-custom.md`);
  - the distinct index the value list shows (step 9, `value-list.md`): `distinct(col, env, { spec?, search?, max?, others?, selected? })` giving `{ values, blanks, truncated }`, keyed on the export text (what the set filter matches), labelled with the codec's `format`, in the column's sort order; counts over the rows the other filters and the browser's search keep (never the column's own filter), values with no row left out except a ticked one (count 0, `selected: true`), blanks counted apart, capped at 2 000. Built in two levels (the values and their order per column; the counts per set of other filters), dropped with the rows. A server's list comes from `DataSource.values` through the gate channel `values:<col>`.
- **Boolean popup** (step 13): a radio group named like the popup (`filter.popupLabel {column}`), All / Yes / No (`filter.all`, `filter.yes`, `filter.no`) for no filter, `{type: 'boolean', value: true}` and `value: false`; a choice applies at once in the browser, at Apply on a server. A boolean filter on blanks (`value: null`) is not offered: the popup shows "Filter active" and Clear.
- **Combined** (AND/OR, two conditions): kept by the model and the server form; the popup offers no second condition until Phase 5 (owner decision O4) and shows "Filter active" and Clear for one.

## Tests
`packages/dom/test/filters-popup.test.ts` (the boolean popup, a combined filter's summary); `conformance/cases/filter-combined/*` (boolean, value-list and combined cases); the lists themselves: `value-list.md`.
