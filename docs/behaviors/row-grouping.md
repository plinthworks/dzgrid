# Grouping rows

Written before the code (CLEANROOM). Sources: what a user sees when a data grid groups its rows by one or more
columns (public documentation and demos of grids and spreadsheets: an indented label per group with a count, a chevron,
the rows beneath) — never their code; WAI-ARIA 1.2 (`treegrid`; `aria-level`, `aria-posinset`, `aria-setsize`,
`aria-expanded` on rows), the APG treegrid pattern, WCAG 2.2 (1.3.1, 2.1.1, 4.1.3). Plan `docs/phase-7-plan.md` D2,
D3, D6–D11, D16, D20; owner answers `docs/phase-7-steps/questions.md` (2026-11-04), which win.

## What the user does
Looks at a long list of records and wants it by category: every row of one ward under its ward, then by month. Picks
« Regrouper par cette colonne » in a column's menu (or drags a header to the zone, `group-drop-zone.md`), opens and
closes groups, sorts, filters, edits a cell.

## What they observe (numbered, each one a test)
1. **Group rows.** Each distinct value of the first grouping column becomes a row of its own, holding that value as a
   label followed by the number of rows it holds: « Cardiologie (42) ». Under it, when open, the groups of the next
   grouping column, and under the last level, the rows themselves. A row is always a leaf under its last group, never a
   group itself.
2. **Where the label sits** (Q-G1 A): in the first visible column, or the one the application names, indented one step
   per level, with the chevron, as in a tree (`tree-view.md`). No column is added. The rows keep their own values in
   that column, indented one step deeper than their group.
3. **Equal means exactly equal** (Q-G3 A): « Alger » and « alger » are two groups; `1` and `1.0` one group (one number);
   a day is compared as its day (`2026-03-05`), an instant as its instant. Empty, missing and unreadable values form one
   group, shown « (Vide) », always last. A number column holding `1` and `'1'` reads both as the number 1: one group.
   A text column holding the number 1 and the text « 1 » reads both as the text « 1 »: one group.
4. **Order of groups** (Q-G2 A): by value, ascending, in the column's own order — numbers by number, days by day,
   instants by instant, booleans false then true, text by the language's collation (« é » beside « e »; two texts the
   collation calls equal but that differ, such as « Alger » and « alger », stay two groups, next to each other, in a
   fixed order), a list column (enum) by its own order. When the user sorts a grouped column descending, its groups
   reverse; « (Vide) » stays last either way. Rows inside a group follow the grid's sort; without a sort, the order the
   application gave.
5. **Opening and closing.** All groups start closed (Q-E1 A); the application may open all of them or down to a level
   (`expanded: 'all' | n`, 1 = the first level). Opening a group shows its children right under it; closing hides
   everything beneath it. What is open stays open after a sort, a filter, a search, a live update: a group is known by
   its column and value, not by its place. Regrouping by other columns never reopens an old group by accident (the
   column is part of what names a group).
6. **Filters and search** test the rows only, before grouping: a group with no matching row disappears; its count and
   its totals are those of the matching rows. Group labels and totals are never searched. A filter or a search never
   opens a group by itself (Q-E2 A).
7. **Counts.** « 42 lignes » and the select-all count data rows, never group rows.
8. **Selection** (Q-SEL A): a group row is never selected, has no checkbox, and Space does nothing on it. Ctrl+A and the
   header box take the data rows shown: the rows of a closed group are not taken.
9. **Edits** (Q-ED A, `edit-reapply.md`): a group row is never edited, never in a block, a fill or a paste. A row whose
   grouping value is edited stays in its group, marked like an edited sort value, until « Réappliquer »; then it moves
   (into a group that is open, or a closed one). The totals change at once (`aggregation.md`).
10. **Keys** (step 5, `tree-keys.md`): the tree's keys in the group column; forward opens, back closes or goes to the
    parent, mirrored in Arabic; `*` opens the siblings; Enter on a group row opens or closes it (Q-K1 A).
11. **Accessibility** (step 5): the grid is a `treegrid` while it is grouped, a `grid` otherwise; group rows say their
    level (1 = the first grouping column), their place among their sibling groups and whether they are open; data rows
    sit at the level below the last group; totals rows (`aggregation.md`) have no `aria-expanded`.
12. **Ungrouped.** With no grouping column the grid is a flat grid again (the grouping stays loaded, empty).
13. **Refused beside grouping** (D20, owner Q-PG A, Q-SRV A; told as `unsupported-combination`, never a throw; the grid
    shows its rows grouped without the other feature, or flat on a server): a tree, master/detail, merged cells, pages
    in the browser, a server source (until Phase 8).
14. **A grouping column the grid does not know** is dropped from the grouping, told (`unknown-column`, path
    `grouping.by`); a column marked `groupable: false` too (`invalid-setting`). Problems name the column, never a value.

## Health data
A group row's key holds its values (a ward, a name if someone groups by name). It lives in memory only: never in a
`Problem`, the saved state, the page address or an event's detail (Q-ST A: the state keeps the grouping **columns**).

## What DzGrid does
- `@dzgrid/core/grouping`: `groupShape({ by, aggFuncs, expanded, footers, grandTotal })` is a row shape like the tree's:
  handed to the browser's row model, it builds the grouped rows from the filtered, sorted rows. `setBy(by)` regroups at
  run time. The rows it shows answer the tree's questions (level, place among siblings, open, children), so the tree's
  painter draws them (step 5).
- A group's key: `groupKey` over the column id and the value's canonical text, level by level (`g:` family, length
  prefixed): a host id can never pass for one.

## Right to left
The label's indent and chevron follow the reading direction (tree); « (42) » is a number in the grid's digits.

## Tests
`conformance/cases/group-agg/structure-*`, `packages/core/test/grouping*.test.ts` (structure, seams, a seeded property
walk against a hand-written oracle); DOM and browser at step 5.
