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
- **Hidden selected rows**: collapsing keeps them selected; the footer's count and
  `selection.count` include them; the export of `selected` writes them (`csv-export.md`).
- **Rules** (`selection-rules.md`) apply to tree rows as to any row.
- **Later (owner Q2): `selection.tree: 'cascade'`** — selecting a parent selects its descendants,
  and a parent shows ticked, unticked or partly ticked from them (the checkbox's `aria-checked`
  `mixed`). Only for trees fully loaded in the browser (no lazy children): a server tree cannot
  know its hidden descendants. The selection stays a set of keys, so the cascade can be added
  without changing its type.

## Where DzGrid differs on purpose
- No cascade by default: on health data, ticking a service must not tick hundreds of patients
  without the user seeing them.

## Tests (to be written with the code)
Step 2: the non-data skip in select-all, ranges and `allDisplayed` (core). Step 5:
`conformance/cases/tree/selection-*` (independent parent, ranges across levels, hidden selected
kept and counted, fillers never selected), `packages/dom/test/tree-selection.test.ts`
(clicks, Space, Ctrl+A, header box). The cascade: a later step, its own sheet section.
