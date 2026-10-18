# Boolean, value-list and combined filters

## What the user does
Boolean column: all, yes, no. Value list: ticks the values to keep, blank included. Two conditions on one column, joined by AND or OR.

## What they observe
- The value list shows each distinct value once, blanks as their own choice.

## What DzGrid does
- A value list matches on the stable raw text of a value (its export form), never on its translated label, so a filter survives a language change.
- Two per-column caches, kept apart (step 8):
  - `ColumnCache.values`: each row's value as the codec reads it (null for blank), what a custom kind tests (`filter-custom.md`);
  - the distinct index the value list shows (step 9): keyed on the export text (what the set filter matches), labelled with the codec's `format`, with blanks counted apart and counts that ignore the column's own filter; a cap decided then. Seam: `distinct(col, env, {collator, search?, max?})` giving `{values, blanks, truncated}`, `RowModel.setValues?`, and for a server `DataSource.values` through a `values:<col>` request.

## Tests
`conformance/cases/filter-combined/*` (boolean, value-list and combined cases).
