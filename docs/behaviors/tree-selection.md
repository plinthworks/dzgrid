# Selecting rows in a tree

Sources: the public documentation of grids with tree data (selecting a parent, select-all),
WAI-ARIA 1.2 (`aria-selected` on rows of a treegrid). Phase 4 plan D5; owner decision Q2
("Non au début").

## What the user does
Clicks a parent row, Ctrl/Cmd-clicks or Shift-clicks rows at different levels, presses Space on a
row, Ctrl+A, ticks the header box; closes a parent whose children are selected.

## What they observe
- Selecting a parent selects that row only; its children keep their own state (no cascade).
- A Shift range takes the rows shown between the anchor and the target, whatever their level.
- Ctrl+A and the header box select the rows shown (after the filters), at every level shown.
- Closing a parent keeps the selection of the rows it hides; reopening shows them still selected.
  The selected count includes them.
- Rows that stand for a missing level (path trees) cannot be selected: a click on them only moves
  the focus; their row has no checkbox.

## What DzGrid does
- **Independent selection** (D5, owner Q2): the selection stays a set of row keys, as on a flat
  grid (`selection.md`). A parent and its children are separate rows.
- **Select all**: the data rows shown; filler rows and detail rows are skipped, also by
  `headerSelection` and `allDisplayed`. Children of closed parents are not shown, so they are not
  taken by Ctrl+A (the rule is "what you see").
- **Ranges** skip filler and detail rows: a Shift range from a leaf of one parent to a leaf of
  another takes the data rows shown between them, parents included.
- **Fillers on screen** (step 5): a click, Shift+click or Ctrl+click on a filler only moves the focus
  (no selection, no range, no `rowClicked`); Space there does nothing; its row has no `aria-selected`
  and its box cell stays empty (the columns line up).
- **Hidden selected rows**: collapsing keeps them selected; the footer's count and
  `selection.count` include them; the export of `selected` writes them (`csv-export.md`).
- **Rules** (`selection-rules.md`) apply to tree rows as to any row.
- **The cascade** is opt-in: `treeSelect()` (1.16.0, « Cascading ticks » below).

## Where DzGrid differs on purpose
- No cascade by default: on health data, ticking a service must not tick hundreds of patients
  without the user seeing them.

## Cascading ticks (1.16.0, owner 2026-11-21 « et le reste »; gap analysis §5)
Written before the code. As `groupSelect()` does for groups (row-grouping.md 25–29), for a tree's rows.

1. **Opt-in**: `treeSelect()` of `@dzgrid/dom/tree-select` (its own entry) beside `tree()`, with checkbox selection
   (`selection: { mode: 'multi', checkbox: true }`). Without `tree()`: one `missing-feature` warning
   (`features.treeSelect`), nothing else. Without it: the independent selection above, unchanged.
2. **A parent's box shows its branch**: ticked when the row and every row under it (every level, open or closed, after
   the filters and the search) are ticked; unticked when none is; partly ticked otherwise (`aria-checked="mixed"`, the
   box's dash). Its box is a `checkbox` named by its tree cell's text. A leaf's box is the row's selection, as before.
   A row a selection rule refuses counts as ticked for the state (as the header box and `groupSelect()`).
3. **A click on a box, or Space on a row** (no modifier): on a parent partly ticked or unticked → the row and every row
   under it ticked; ticked → all unticked; on a leaf → the leaf toggled. Then each row above it is ticked when every row
   under it is, unticked otherwise. One `selectionChanged` (source `user`), said as any selection. Under « all »
   (`exclude`) the exceptions follow. A selection rule still decides row by row. Rows hidden by a filter or the search
   are not touched (what you see).
4. **Other gestures as before**: a row click (`selection.click`), Ctrl/Cmd+click, Shift ranges, Ctrl+A, the header box
   and the API select rows one by one; the boxes then show each branch's state as it is (a selected parent's own box
   stays ticked: the row is selected).
5. **Children not loaded yet** (`tree-lazy.md`, a server's tree): a parent's box acts on itself and on what it holds;
   ticked, its children arrive ticked when it is opened and they load (as « all except » for that branch); unticked
   before they arrive, they arrive unticked. The browser never names rows it never received.
6. **The selection stays a set of row keys**: a ticked parent is a selected row (counted, exported with `selected`);
   nothing else changes in its type or events.

## Tests (to be written with the code)
Step 2: the non-data skip in select-all, ranges and `allDisplayed` (core). Step 5:
`conformance/cases/tree/selection-*` (independent parent, ranges across levels, hidden selected
kept and counted, fillers never selected), `packages/dom/test/tree-selection.test.ts`
(clicks, Space, Ctrl+A, header box). The cascade: a later step, its own sheet section.

## Blocks of cells in a tree (Phase 5 Part B)
A block of cells (`range-selection.md` 14) across levels takes the data rows shown between its corners,
whatever their level; filler and loading rows count for nothing. Copied, the tree column is written
without its indent (`clipboard.md` 5); the structure columns (`tree({ structure })`) are read-only, so a
paste, a fill or a bulk edit skips them and counts them « en lecture seule ».
