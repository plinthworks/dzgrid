# Totals of grouped rows (aggregation)

Written before the code (CLEANROOM). Sources: what a user sees when a grid shows a sum, a mean or a count per group and
for the whole list (public documentation of grids and spreadsheets' subtotals) — never their code. ARCHITECTURE §3.13;
plan `docs/phase-7-plan.md` D4, D5, D14, D15; owner answers Q-A1 A, Q-A2 A, Q-A3 A, Q-ED A, Q-T A
(`docs/phase-7-steps/questions.md`). Same counting rules as the status bar (`status-bar.md` 2, 4): typed values, never
the text shown; compensated sums.

## What the user does
Groups rows (`row-grouping.md`) and reads, on each group row, the total of an amount, the mean of a price, the latest
date; reads the grand total at the end; edits a cell and checks the total moved.

## What they observe (numbered, each one a test)
1. **Where.** Under each column that has a total, the group row shows the total of its rows, aligned like the column's
   values, in the column's format. Columns without a total stay empty on group rows.
2. **Which totals.** Chosen per column by the application (`aggFunc` on the column, or `aggFuncs` in the grouping
   options, which wins): **Somme** (sum), **Moyenne** (mean), **Min**, **Max**, **Nombre** (count), **Premier** (first),
   **Dernier** (last), or the application's own function.
3. **Types.** Sum and mean: number columns only. Min and max: numbers, days (the earliest / latest day), instants, text
   (the language's collation). First and last: any column, the first / last value in the group's order (the grid's
   sort). Count: any column. A total that does not fit its column's type is not shown, and told once (`agg-type`, path
   `columns.<id>.aggFunc`).
4. **Empty values** are skipped by every total but the count; a group whose values are all empty shows nothing in that
   column — never « 0 » for a sum, never a mean of nothing.
5. **Nombre counts the group's rows** (Q-A2 A), empty values included: the same number as the label's « (42) ».
6. **Exact sums.** Sums use compensated addition: 0.1 ten times is 1; a long column of prices does not drift at the
   fourth decimal. A sum past the largest number is ±Infinity, shown as such.
7. **The mean** is the sum of the numbers over how many numbers there are (empty cells are not in it), in the column's
   format.
8. **Filtered rows only.** Every total is over the rows that pass the filters and the search — what the user can check
   on screen by opening the groups.
9. **Group footers** (`footers: 'group' | 'both'`): an open group ends with a « Total » row of its own, after its last
   child, with the same totals; the group row keeps its totals too (Q-A3 A). A closed group shows no footer.
10. **The grand total** (`footers: 'grand' | 'both'`, Q-A1 A): one « Total » row with the totals of every row that
    passes the filters, at the end of the rows (it scrolls with them), or at the top (`grandTotal: 'top'`). No row
    matches: no grand total row (the grid says it has no rows). It works without grouping columns too: a flat grid with
    a totals row.
11. **`totals()`** gives the grand totals by column id, whatever the footers option, so an application can feed a pinned
    row itself.
12. **Totals rows are not data**: never selected, edited, copied into a block, filled or pasted into; their key is
    their own (`f:` + the group's key, `t:` for the grand total).
13. **After an edit** (Q-ED A): the totals change at once — the value the user typed counts, even before it is saved.
    The edited row does not move (`row-grouping.md` 9).
14. **Live updates** (Q-T A): a change of the rows regroups and totals again; a change that touches no grouping column
    totals again without regrouping.
15. **The application's function** gets the group's values (empty ones as `null`) in the group's order, and
    `{ column, level }` (level `null` for the grand total); what it returns is shown as the cell's value. One that
    throws shows nothing and is told once (`agg-threw`, path `columns.<id>.aggFunc`) — never with a value.

## Where DzGrid differs on purpose
- No total of totals at another precision: one rule (the compensated sum of the rows), at every level, so a parent's sum
  is never the rounded sum of its children's rounded sums.
- No exact decimal type (ARCHITECTURE: out of v1); the format rounds at display only.

## Tests
`conformance/cases/group-agg/agg-*` (each function × each type, empties, the 0.1 series, `agg-type`, edit then
reapply), `packages/core/test/grouping*.test.ts`; display at step 5.
