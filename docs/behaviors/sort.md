# Sorting rows

## What the user does
Clicks a column header; clicks again; Shift-clicks another header.

## What they observe
- The first click sorts ascending, the second descending, the third removes the sort.
- Shift-click adds a column to the sort; the order of the clicks is the order of precedence.
- Text sorts the way the language does: `a` before `B`, `é` next to `e`, `2` before `10` when text holds numbers.
- Numbers sort as numbers, dates as dates.
- Empty cells gather at the bottom; rows that compare equal keep their original order.

## What DzGrid does
- Empty cells are last in **both** directions (D3); `nulls: 'first'` puts them first.
- Equal values keep the source order in descending too — the sort is stable, never reversed.
- Arabic: hamza forms, short vowels (harakat) and tatweel compare equal at the base level; Arabic-Indic and Latin digits compare equal (S5).
- Instants sort chronologically, never as their text.
- Text columns sort by rank keys (S5): distinct values ranked once with `Intl.Collator`, then an integer sort.
- Sorting never touches the host's rows.

## Tests
`conformance/cases/sort/*`, `packages/core/test/sort.test.ts`.
