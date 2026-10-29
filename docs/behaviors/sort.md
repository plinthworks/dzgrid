# Sorting rows

## What the user does
Clicks a column header; clicks again; Shift-clicks another header.

## What they observe
- The first click sorts ascending, the second descending, the third removes the sort.
- Shift-click adds a column to the sort; the order of the clicks is the order of precedence.
- Text sorts the way the language does: `a` before `B`, `é` next to `e`, `2` before `10` when text holds numbers.
- Numbers sort as numbers, dates as dates.
- Empty cells gather at the bottom; rows that compare equal keep their original order.

- With the keyboard, Enter on a header sorts it, Shift+Enter adds it to the sort.
- The header shows the direction, and screen readers hear it (`aria-sort` on the first sorted column, an announcement of the new order).

## What DzGrid does
- A column that cannot sort ignores the click and the key.
- Empty cells are last in **both** directions (D3); `nulls: 'first'` puts them first.
- Equal values keep the source order in descending too — the sort is stable, never reversed.
- Arabic: hamza forms, short vowels (harakat) and tatweel compare equal at the base level; Arabic-Indic and Latin digits compare equal (S5).
- Instants sort chronologically, never as their text — in a column typed `day` or `instant`. A date held in a `text` column sorts as text.
- Text columns sort by rank keys (S5): distinct values ranked once with `Intl.Collator`, then an integer sort.
- Sorting never touches the host's rows.
- **One sort only** (`multiSort: false`, step 16a, fixed at creation): Shift+click, Shift+Enter and a header part's
  `toggleSort(true)` act as a plain click / Enter — the column becomes the only sort (ascending → descending → none).
  The rule sits in the kernel's `sort.toggle`, so every gesture reaches it (header click, keys, header parts; the
  column menu already sets one column). The application's own commands are **kept** as given: `sort.set`,
  `query.set`, a restored state or an address holding several sort items still sort by several (the option is about
  the user's gestures); the indicator then shows the numbers. Default `true`: today's behaviour.

## An initial sort (step 16, owner demo)
To start on a sort, give it before the first request, never as a `sort.set` right after `createGrid` (on a server that
is two requests: the unsorted page, then the sorted one). Plain DOM: `gridState({ initial: { v: 1, sort: [{ column:
'date', dir: 'desc' }] } })` from `@dzgrid/dom/state` — the server model is made held and asked once, with the sort
(any part of a state works: filters, search, page, columns). Angular: `[state]` (the same, one request). In the
browser's own rows a `sort.set` after creation costs nothing but a second sort, `initial` avoids it too. A stored
state (`persist`) applies over `initial`; `reset()` goes back to the definitions. Test:
`packages/dom/test/state-initial.test.ts`.

## Tests
`conformance/cases/sort/*`, `conformance/cases/sort-toggle/*`, `packages/core/test/sort.test.ts`, `packages/dom/test/sort-select.test.ts`, `packages/dom/test/step18-findings.test.ts` (the sentence on a server), `packages/core/test/sort-single.test.ts`, `packages/dom/test/sort-single.test.ts` (one sort only).

## Decisions (step 18, 2026-10-20)
- **The new order is said with the count of the rows it orders** (all the filtered ones, not the page shown), and on a server once the answer is in; with an unknown count, the order alone. Found by the audit screen's permutations (`request-order.md`).
