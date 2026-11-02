# A value list and a condition on one column

Phase 9, step F2 (`docs/phase-9-steps/filters-plan.md` §2; owner Q-F3 A, 2026-11-02). Written before the code.

## What the user does
Opens the filter popup of a value-list column that also takes a condition; types a condition at the top (« starts
with b »), ticks values in the list below, applies; clears.

## What they observe
- One popup: the condition at the top, a line, the value list under it, one footer (Clear, Apply).
- A row is shown when it passes both: the condition **and** a ticked value.

## What DzGrid does
- **Asked by the column:** `filter: { kind: 'set', condition: true }`. Without `condition`, today's value list exactly.
  The condition's kind follows the column's type: number, day, instant; any other type takes the text condition.
  With `@dzgrid/dom/filters-base` and no date kits, a day or instant column keeps the list alone.
- **Stacked** (owner Q-F3 A): the condition form (one row; several with `filter.maxConditions`, `filter-combined.md`;
  match case with `filter.matchCase`), a separator (`<hr>`, presentational), then the list (search, select all, the
  values). Tab goes from the condition to the list's search, to select all, to the list (one stop), to the footer.
- **Stored without a new type:** both parts in use → `{type: 'combined', join: 'and', conditions: [<condition>,
  <set>]}`, the condition first. The condition part may itself be a flat combined (several rows, nested once: depth 2,
  within the model's 3). One part in use → that part **plain** (a `set`, or a condition), so a column using the list
  alone sends today's filter. Nothing in use → no filter. No `multi` kind: it would have to be reserved among the
  kinds, refusing an existing custom kind of that name.
- **Each part keeps its own rules:** the list's half rule, include only, starting empty (`filter-set.md`); the
  condition's L1 rule (a row that cannot filter yet is left out) and its unreadable number (marked, said, focused).
- **What it shows:** a combined AND of exactly a condition (plain or a flat combined the rows can show) then a `set`,
  or either part alone; anything else (a set first, OR, two sets, nested deeper) shows « Filter active » and Clear.
- **Counts:** the list's values and counts leave the column's whole filter out, the list and the condition (today's
  rule « never this column's own », the same for the server's `values()`; nothing changes on the server). So ticking
  a value the condition excludes gives no row: the list does not hide it.
- **Clear** empties both parts; **Apply** sends both; in the browser each part applies as it changes (the condition
  after the pause, a tick at once), on a server or with `apply: 'button'` one request at Apply.
- **Floating row:** « Filter active » (the set's summary today).
- **Server wire:** unchanged, a combined.

## The owner's translator (his `to-query.ts`)
A combined AND holding a `set` becomes
```
{ filterType: 'multi', filterModels: [ <condition or null>, { filterType: 'set', values } ] }
```
the condition mapped as a column condition (`filter-combined.md`, a flat combined as `{filterType, operator,
conditions}`). Same rule: his backend reads it first.

## Tests
`packages/dom/test/filters-multi.test.ts`; conformance `filter-combined/multi-set-and-text.json`,
`multi-set-and-number-between.json`.
