# Columns made from the data (automatic columns)

Written before the code (CLEANROOM). Source: Tabulator's public feature list (« auto columns »), used as a checklist only;
the shape below is ours. Owner answers 2026-11-09 (« ★ partout », 1.9.0 lot A, item 1). Entry: `@dzgrid/core/auto-columns`
(`autoColumns()`), pure — no DOM, no clock, no `Date`.

## What the developer does
Has rows (or a first server answer) and no column list; calls `autoColumns(rows, options)` and gives the result to the grid.
Changes what was guessed for some fields, joins two fields into one column, hides some, adds an « actions » column, puts a
few first, translates the headers.

## What the user observes
A grid whose columns are the data's fields, in the data's order, each typed as its values are: numbers aligned at the end
and summed by a total, days and instants shown in the user's format and zone, yes / no columns — as if written by hand.

## Behaviours (numbered, each one a test)

**Fields and order**
1. The fields are the own enumerable keys of the first rows inspected (`sample`, 50 by default; at least 1), each once,
   in the order first met. A row that is not a plain object is skipped. A field whose every inspected value is an object
   or an array (not a scalar) makes no column (the developer can `add` one).
2. Each column's `id` is the field's name; the grid reads the field of that exact name (a name with a dot included: the
   core reads the row's own property of that name first, `column-values.md`).
3. `order: ['b', 'a']`: those columns first, in that order (a merged or added column may be named); the others after,
   in data order, then the added ones. A name in `order` that is no column: a warning `unknown-column` at
   `autoColumns.order[i]`, skipped.

**Types** (only non-blank values are looked at: `null`, `undefined` and `''` are skipped)
4. Every value a finite number → `number`. Every value a boolean → `boolean`.
5. Every value text written `YYYY-MM-DD` (month 01–12, day 01–31) → `day`.
6. Every value text written as an ISO date-time **with** an offset (`Z`, `+02:00`, `-0530` not taken: `±HH:MM` only)
   → `instant`. A date-time **without** an offset is never guessed as an instant (it would be `ambiguous-instant`): it
   stays `text`.
7. Anything else, a mix, or no value at all → `text` (the type is left out: text is the grid's default).
8. The guess never reads a row's value into a problem (rows may be health records).

**The developer's say** (all optional)
9. `header(field)`: the header of each made column (translation); absent, the field's name.
10. `override: { field: { … } }`: any part of a column definition, laid over what was guessed (the override wins, key by
    key; `id` cannot be changed). A field that is no column: a warning `unknown-column` at `autoColumns.override.<field>`.
11. `hide: ['f']`: the column is made with `hidden: true` (the columns chooser can still show it). Unknown: a warning at
    `autoColumns.hide[i]`.
12. `merge: { id: { from: ['a', 'b'], … } }`: a new column `id` whose `value(row)` reads those fields (the non-blank ones,
    each as text, joined by « – »), type text; any other part given (`header`, `ui`, `width`, a `value` of its own…) is
    kept and wins. It takes the place of its first source field in the order. The source fields are hidden (`hidden:
    true`, still in the list), unless the developer lists them in `override` with `hidden: false`. A source field absent
    from the data: a warning at `autoColumns.merge.<id>.from[i]`; an `id` that is already a field: a warning
    `duplicate-column-id`, the merge skipped.
13. `add: [ … ]`: column definitions absent from the data (groups are the application's to build around the result), placed after the data's columns (or where `order`
    says).
14. Bad options (not an object, a list that is not a list): a warning `invalid-setting` at `autoColumns.<key>`, that
    option ignored. Bad rows (not an array): no column, one warning `invalid-setting` at `autoColumns.rows`. Never a throw.

**The result**
15. `autoColumns()` returns `{ columns, problems }`: plain column definitions the grid takes as written by hand (the grid
    checks them again), and the problems (code, path, a field's name at most — never a value).
16. Pure and stable: the same rows and options give equal columns; the rows are never changed.

**Server data** (the owner's case: the columns come from the first answer, then stay)
17. The helper stays pure: it does not know about sources. The guide shows the pattern — the source's `fetch` hands its
    first answer's rows to `autoColumns`, the grid's columns are set once (TypeScript: `grid.update({ columns })`; Angular:
    a signal set once), later answers do not change them (a filter that empties the page would otherwise drop the
    columns).

## Where DzGrid differs on purpose
- No guessing of an instant from a date-time without an offset, nor from a number (epoch milliseconds look like any
  number): a wrong zone silently shifts every value.
- No headers made from the field's name (« firstName » → « First name »): that is a language's business — `header()`.

## Tests
`packages/core/test/auto-columns.test.ts` (each rule above, by hand).
