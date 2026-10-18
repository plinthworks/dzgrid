# Cells spanning rows and columns

Written before the code (CLEANROOM). Plan: `docs/phase-3-steps/step9b-spans-blueprint.md`; owner decisions: `step9b-decisions.md`; browser measures: `spikes/s12-spans/README.md`.

## What the user does
Reads a table where a value shared by consecutive rows (a ward, a date, a patient) is written once on a tall cell; where a total spreads over several columns; where headers are grouped ("Patient" above Name, First name, Age); where some rows are one wide line (a group title, a note). Scrolls through long merged runs, sorts, filters, moves with the keyboard, clicks, selects, exports.

## What they observe
- **Identical values merged:** consecutive rows with the same value in a merging column show one tall cell. The label is centred in the cell, as in a spreadsheet; when the merge is so long that its centre is out of view, the label travels with the scroll and stays at the top or bottom edge of the cell's visible part, so the user always knows what the run is. A short merge (a dozen rows) looks exactly like a spreadsheet's.
- **Spans decided by the data:** a cell may cover several rows or columns because the application says so (a total row over three columns, a slot over two hours).
- **Grouped headers:** a group header sits above its columns, on as many levels as the application nests. If the user pins or moves one of its columns, the group shows on each side, with its label repeated.
- **Full-width rows:** one cell across the whole width, whose text stays readable while scrolling sideways; the selection box stays.
- Merges follow the order on screen: after a sort or a filter, the cells merge again for the rows now side by side. A merge never crosses a page, a pinned edge, or a group of rows.
- The keyboard treats a spanned cell as one cell: one stop, arrows step over it, and moving back returns to the row and column the user came from (as in a spreadsheet).
- A click on a tall cell selects the row under the pointer; Space selects the row where the cell starts. Each row keeps its own selection colour, visible through the tall cell.
- In a CSV export, a merged value is written on every row it covers (the file stays real data); an option writes it once, report style.

## What DzGrid does
- Spans are computed in the core from the displayed rows and the visible columns, never from the scroll: the same rows and columns give the same spans, whatever the window. A grid without span rules pays nothing (the span code lives in its own entries, `@dzgrid/core/spans` and `@dzgrid/dom/spans`).
- Merging compares the stable text of the values (what the set filter matches), so `e` and `é` stay apart; blank cells never merge; `merge.within` cuts a run where other columns change (a city merges only inside its region). Sorting by a merged column is the application's choice: the grid never sorts by itself.
- No overlap: a span asked over another is dropped to one cell and said (`span-overlap`); a span cut by a pinned edge or by the end of the rows is said once (`span-clipped`); a bad span (not a whole number, a rule that throws, `merge` together with `rowSpan`/`colSpan` on one column) is `invalid-span`; a bad group (empty, duplicate id) is `invalid-column-group`; span rules without the spans feature are `missing-feature`.
- Under virtual scrolling, a tall cell lives in the row where it starts, kept mounted while any of its rows is on screen; it is drawn only over the visible part plus a margin (browsers cap an element's height near 33 million pixels, 17.5 million in Firefox; a run may be a million rows). Covered places have no cell of their own; in pinned segments a hidden filler keeps each covered row's colour.
- Screen readers get `aria-rowspan` / `aria-colspan` on the cell where a span starts, with that cell's row and column indexes; covered places are absent; fillers are hidden from them. Grouped headers are column headers with `aria-colspan`; group rows count in `aria-rowcount`. A full-width cell carries its whole text itself (Chrome ignores `aria-colspan` on such a row). What screen readers actually say is checked by ear (owner's protocol); if one loses the value on covered rows, a hidden repeat is added.
- Right to left: everything is logical (start and end), the travelling label included.

## Tests
`conformance/cases/spans/*`, `header-bands/*`, `keyboard-move/*`, `problems/{invalid-span,span-overlap,span-clipped,invalid-column-group}.json`; `packages/core/test/spans*.test.ts` (with property tests: no overlap, one owner per place, keyboard round trips); `packages/dom/test/spans*.test.ts`; `scripts/browser.mjs` (the S12 checks on the real grid). All planned for step 9b.
