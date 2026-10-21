# Phase 4, step 5 — nested and path shapes, filler rows, tree selection, CSV of a tree (plan)

Sources: `docs/phase-4-plan.md` D3, D5, D11 and step 5; `decisions.md` (owner Q1: the three shapes; Q2: no
cascade yet); sheets `tree-view.md`, `tree-selection.md`, `tree-filter.md`, `csv-export.md`. Clean room:
behaviour from the sheets and WAI-ARIA 1.2 only.

## Decisions taken here (with reasons)

1. **One option, three shapes.** `treeShape` / `tree()` take exactly one of `parentId`, `children: (row) =>
   T[] | undefined`, `path: (row) => readonly string[]`. Zero or two or more: a problem `tree-shape`
   (error, path `tree`, detail the names given, `none` when none); the grid still shows the rows — with
   none, every row is a root; with several, the first of `parentId`, `children`, `path` is used. A new code
   rather than `unsupported-combination`: it is a host mistake in one option, not two features refusing
   each other (≈ 15 B in the base list).

2. **Nested rows are made flat before the store** (new optional `RowShape.load(rows, id)` and
   `RowShape.tx(tx, id)`, called by the client model; ≈ 60 B in the base). The walk is iterative, each row
   then its children, depth first (the store's order is the reading order of the nested data, so the
   unsorted tree shows siblings in their array order); an object met twice in one walk is not walked
   again (a self-containing object cannot hang the grid). Row ids are unique over every level: the store's
   own `assignKeys` reports a second one (`duplicate-row-id`), the first stays. The parent of each row is
   kept in an index by canonical id (id → parent id), built by the walk: the structure reads its parents
   from that index, so the parent-mode code does the rest (orphans, depth, buckets, filter, flatten).
   Transactions (documented in `tree-view.md`): `add` rows are walked too (their descendants added after
   them, under them); an added row whose id the index knows keeps that parent, else it is a root; `update`
   and `patch` keep the row's parent; an `update` row's children are indexed (not added), so a child is
   added under an existing row by `{ update: [parentWithTheChild], add: [child] }`; `remove` takes the row
   only — its children become orphans (root, `tree-orphan`), as in parent mode; `setRows` builds the index
   again. Why an index by id and not by object: an update replaces the object, the id stays.

3. **Path trees: a trie of segments, fillers after the rows.** Each row's path is walked from the root
   through one `Map` per trie node keyed by the segment (`String(seg)`): O(n·depth) lookups and no joined
   path strings (the segments are interned by the maps). A trie node claimed by a row is that row; one
   claimed by none is a filler. Fillers are numbered after the rows (`snap.count …`, plan D2), key
   `groupKey(path)`, label the last segment, level from the depth. A data row whose path equals a
   filler's takes its place (the trie node is claimed, whatever the order of the rows). Two rows with the
   same path: both shown, siblings; the first in source order is the parent of the deeper paths. An empty
   or unreadable path: a root.

4. **Where a filler sits among its siblings: first appearance**, sorted or not. A filler takes the place
   of its first nearest data row underneath in the current order (the sort's, else the source order), its
   children placed as usual. Not by label: (a) a label is text and the tree column may be a number or a
   date, which its codec cannot compare with a label; (b) the core tree has no comparator or collator and
   the client's ranks do not hold the labels (an interleave would cost a binary search per filler against
   the column's keys, and bytes in a 3 500 B budget); (c) first appearance is O(n), stable, and reads as a
   folder sitting where its first content would. Rejected: label order on the tree column only — the core
   does not know the tree column (a DOM option), and the rule would change with the sorted column.
   Written in `tree-view.md`.

5. **Fillers under a filter** never match: shown only as the ancestor of a shown row (or under a match in
   `subtree` mode), drawn muted like any non-matching ancestor, never in `counts.filtered` (the client
   counts store rows) nor in `dataCount`.

6. **Selection (independent, owner Q2).** The base already skips non-data keys in select-all, ranges and
   the header box. Added: a click on a filler moves the focus only (no `rowClicked`, no selection, Shift:
   no range); the kernel refuses `selection.toggle`/`only` on it (`unknown-row`, already); its row has no
   `aria-selected` and its box cell is kept (column alignment) without its box. `rows.expand` now refuses
   only data keys that do not exist: a filler the user cannot see can be opened by the API (the shape
   ignores keys it does not know). Collapsing keeps hidden selected rows (base behaviour, tested here for
   all three shapes). The property test runs the three shapes against an oracle that knows fillers.

7. **CSV of a tree** (`csv.tree: 'none' | 'level' | 'indent'`, default `'level'`, only when the rows are a
   tree's — `levelAt` present). `level`: a first column, header `levelHeader` (default `Level`), 1 for the
   roots, Latin digits. `indent`: two spaces per level before the tree column's text, added before the
   formula guard and the quotes (no direction marks: Arabic labels stay byte-identical after the spaces).
   Tree column: `treeColumn` (default the first written column, as the tree's default). Fillers: their
   label in the tree column, every other field empty (the level column filled). Details: never written.
   `all` = the tree's `allRows` (collapsed descendants included, tree order), `displayed` = the rows shown,
   `selected` = the selected data rows of `allRows` (fillers never, even under everything-except).

8. **DOM.** The base marks a non-data row `data-kind` (`group` now, `detail` at step 9), gives it no
   `aria-selected`, no box, and mounts no cell part on it (a part expects a row). The tree feature writes a
   filler's label in the tree column (`<span class="dzg-free dzg-label">`, isolated like free text, so an
   Arabic or Latin label keeps its own direction) and says its label in the announcements. Fillers carry
   `aria-level/posinset/setsize/expanded` like other parents. Playground « Arbre »: a shape switch
   (parent / nested / path; path drops the services' own rows so they become fillers).

## Order of work (tests first, each seen failing)
1. Core: `tree-shapes.test.ts` (option count, nested, path, fillers, order, filter, transactions), the
   property test over three shapes, conformance `tree/nested-*`, `tree/path-*`, `tree/selection-*`.
2. Core CSV: `csv/tree.test.ts`, conformance `csv/tree-*`.
3. DOM: `tree-shapes.test.ts` (filler row, label, attributes, clicks/Space/Ctrl+A/box), browser checks
   for the path shape (fr, ar RTL, axe).
4. Sizes, gate, mutants, docs.

## Review and test analysis (2026-10-21, on `3ce75cc`)
Tests first, each seen failing: `packages/core/test/tree-shapes-walk.test.ts` (the kernel random walk
over nested and path rows, 120 seeds × 60 steps × 2 shapes × 2 filter modes, against an independent
model), `tree-shapes-bugs.test.ts` (4, flipped from `it.fails`), 7 added in `tree-shapes.test.ts`, 1 in
`packages/dom/test/tree-shapes.test.ts`.
- **DOM**: `undecorate` removed the toggle before looking for the label by its place after it, so a
  filler cell leaving the tree column (column moved, recycled, destroy) kept its label: the label is
  now found by its class (`:scope > .dzg-label`) and removed first.
- **Nested walk**: a `getRowId` that throws, or a null / non-object child, threw out of
  `createGrid` / `setRows` / `applyTransaction`: now a row with no id, passed on for the store to tell
  (`invalid-row-id`), not walked. A second copy of an id the grid holds (`duplicate-row-id`) brought its
  children and wrote the parent index: `RowShape.tx` now gets the store's snapshot, and the walk treats
  an id held (and not removed by the transaction) like a second copy; a refused update (unknown id)
  indexes nothing; adds refused as a whole (`addAt` invalid) are not walked.
- **Path build**: filler paths were built with `unshift` per filler (O(depth³): 2.3 s for one row with a
  5 000-segment path). Now each node keeps its trie node; keys are made when asked, each from its
  parent's (cached), paths when asked; a group key is resolved by reading its segments down the trie
  (checked against the key made back, so a malformed key names nothing). Same row: 3 ms.
- **Lead decisions**: (a) a removed id forgets its parent at the removal; added back in the same
  transaction it keeps it, later it is a root unless an update listed it since; (b) an update's
  children list is additive; (c) paths: a key whose node is gone passes to the node of the other kind
  now at its path (`RowShape.rekey`, applied by the client to the open set and the filter's layer
  before removed keys leave): a row taking a filler's place keeps its open state, and a filler taking
  a row's place the row's. Before, the reverse held only for a filler key left in the set; a row opened
  by its own key and then removed gave a closed filler. Written in `tree-view.md`.
- **CSV**: a `treeColumn` not among the written columns falls back to the first written (fillers keep
  their label, rows their indent); with `indent`, a blank or unreadable tree cell is written as its
  indent. Written in `csv-export.md`.
