# Tree view

Sources: WAI-ARIA 1.2 (role `treegrid`; `aria-level`, `aria-posinset`, `aria-setsize`,
`aria-expanded` on rows), the APG treegrid pattern, WCAG 2.2 (2.5.8 target size, 1.4.11 non-text
contrast, 4.1.2), and the public documentation of data grids that show hierarchies (what a user
sees: an indented first column with a chevron per parent). Never their code. Phase 4 plan D1–D3,
D6; owner decisions Q1, Q5.

## What the user does
Looks at rows that belong to other rows — services and their patients, folders and their files,
an organisation chart. Clicks the chevron in front of a parent to open or close it; presses the
keys of `tree-keys.md`; sorts by a column; scrolls a tree of a million rows.

## What they observe
- The first visible column is indented one step per level; a parent shows a chevron before its
  label, pointing toward the reading direction when closed (to the right in French, to the left in
  Arabic) and down when open. A leaf shows no chevron but keeps the same indent, so labels of one
  level line up.
- Opening a parent shows its children right under it, in the current sort order; closing it hides
  every row beneath it, at any depth. Rows below move up or down; nothing else changes on screen.
- A sort orders each parent's children among themselves; parents stay above their own children.
  A child never leaves its parent because of a sort.
- What was open stays open after a sort, a filter cleared, a live update of the rows.
- At the start: all closed, all open, or open down to a level, as the application chose.
- Rows built only to stand for a missing level (a path whose middle segment has no row) look like
  parents: a label, a chevron, no other values. They cannot be selected or edited.

## What DzGrid does
- **The tree is a view of the rows** (D1): tree rows are ordinary data rows with ordinary keys.
  What is open is a set of row keys (`kernel.expansion`), kept apart from the query: opening a row
  never resets the page, the selection or a server request. Commands `rows.expand { rows, expanded }`
  and `rows.expandAll { expanded, depth? }`; one event `rowExpanded { source, rows, expanded }` per
  user or API action (keys only, never row data; one event for a bulk change), listing the rows
  whose state changed, nothing when none did. Keys of rows that are removed leave the set (a row
  removed and added again in one transaction keeps its state). `tree.initial: 'none' | 'all' |
  number` applies at the first non-empty load only, and only if the host set no expansion before.
- **A row with no children** (lead decision, review of steps 2–3): opening or closing it is a
  no-op, without event; `rows.expandAll` passes over it. Its key does not enter the set, so a
  child added later shows it closed. Under a filter, a row whose children are all hidden counts as
  one with no children. A row declared by `lazyChildren({ has })` whose children are not loaded
  is openable (step 7, `tree-lazy.md`): it says -1 children (not known) until its load answers.
- **Three ways to give the hierarchy** (D3, owner Q1, in this order of work): a parent id column
  (`parentId`), nested arrays (`children`), or a path of labels per row (`path(row)`). A parent id
  that names no row puts the row at the root and reports `tree-orphan`; a cycle puts the rows it
  makes unreachable at the root and reports `tree-cycle` (never a hang: the walk is iterative).
  With nested arrays, row ids must be unique across the whole tree (`duplicate-row-id`). With
  paths, a missing level becomes a filler row whose key is made from the path (`groupKey`).
  Exactly one of `parentId`, `children`, `path` (step 5): none or several give `tree-shape` (error;
  with none every row is a root, with several the first of that order is used).
- **Nested rows** (step 5): made flat before the grid holds them, each row then its children (the
  reading order of the data); a row refused for its id (invalid: not an object, or a `getRowId` that
  throws; or a second copy, in the data or of a row the grid holds) is passed on for the grid to tell
  (`invalid-row-id`, `duplicate-row-id`) and not walked: its children are not added and it places no
  row. Each row's parent is kept by id. Transactions: an added row brings its children under it, and
  is a root unless an earlier update listed it among its children; removing a row forgets its own
  parent (review of step 5, lead decision): added back in the same transaction it keeps that parent,
  added back later it is a root (unless an update has listed it since). An update or a patch keeps
  the parent; an update's children list is added to its children, never taken from (a former child
  not listed stays where it is), so `{ update: [parentWithChild], add: [child] }` adds a child under
  an existing row; an update the grid refuses places nothing. Removing a row leaves its children at
  the root (`tree-orphan`), as with parent ids, until it comes back. A problem's `rows[i]` counts the
  rows made flat. A new `setRows` starts the parents again.
- **Path rows** (step 5): a level no row has is a filler (label: the last segment; level: its depth);
  a row whose path is a filler's takes its place. Two rows with one path are siblings, the first the
  parent of longer paths; an empty or unreadable path makes a root. Segments compare as text.
  **A filler stands among its siblings where the first of its nearest rows underneath stands** in the
  order shown (the sort's, else the rows' own): a folder sits where its first content would. Not by
  its label: the label is text and the tree column may be a number or a date. Under a filter a filler
  never matches: it is kept (muted) above a shown row, and never counted. A filler can be opened by
  the application even while hidden; its key stays in the open set. **A row taking a filler's place
  keeps the filler's open state, and a filler taking a row's place the row's** (review of step 5,
  lead decision): when a change leaves a key's row or filler gone and the other kind now stands at its
  path, the key in the open set becomes that one's (a closed one stays closed); a row that only moves
  keeps its own state.
- **Sorting** (D2): one sort over the rows, then children grouped under their parent in that
  order (stable): each level is sorted, and a sort costs what it costs on a flat list.
- **Opening and closing** splice the rows below the parent in or out of the displayed list; they
  never sort or filter again. A collapse that hides the focused row moves the focus to the nearest
  shown ancestor (`tree-keys.md`). The row at the top of the view stays there; when a closing (by
  the application or the user) hides it, its nearest shown ancestor goes to the top of the view
  (lead decision, review of step 4), not the raw scroll offset.
- **The tree column**: the first visible column, or `tree.column`. Its cells get an inline-start
  padding of `level × indent` (logical property: it mirrors in Arabic by itself) and a decorative
  toggle (`<span class="dzg-toggle" aria-hidden="true">`), with a hit area of at least 24 × 24 px
  (WCAG 2.5.8), never a tab stop. A pointer press on the toggle opens or closes the row and does
  not select it or move a range. A tree column that is not the first visible column is allowed,
  with a `tree-column-not-first` warning (screen readers expect the hierarchy first).
- **Accessibility** (WAI-ARIA 1.2 treegrid): the grid's role is `treegrid`; each row carries
  `aria-level` (1 for the roots), `aria-posinset` and `aria-setsize` among its visible siblings
  (after a filter, the siblings shown; `-1` while a lazy parent's size is unknown), and parents carry
  `aria-expanded`. Leaves carry no `aria-expanded`. A lazy parent's loading row says
  `aria-posinset="1"` and `aria-setsize="-1"`, with `aria-busy` while it loads (`tree-lazy.md`). `aria-rowcount` and `aria-rowindex` count the
  rows shown, as on a flat grid. Opening and closing are also said in the live region:
  "Service 50 expanded, 100 rows", "Service 50 collapsed" (bundles `locales/{en,fr,ar}-tree`),
  because screen readers do not all say a change of `aria-expanded` on a row.
- **Not with**: cell spans (`unsupported-combination`, D9), browser pages
  (`unsupported-combination`, D2), a master/detail on the same grid (owner Q5). Each gives a
  problem and the grid shows the tree without the other feature. **A server's rows** can be a tree
  (step 7, `tree-lazy.md`): its pages count the roots, a parent's children come whole.
- **Theme**: the toggle's chevron and its focus ring meet 3:1 against the row (WCAG 1.4.11),
  forced colours draw it in `ButtonText`, motion follows `motion.md`.

## Where DzGrid differs on purpose
- The chevron is not a button: the keyboard path is the row's own keys (APG treegrid), so the
  grid stays one tab stop.
- The open state is never a filter or a page change: no request, no "selection cleared".
- Filler rows of path trees are never selectable, editable, pasteable or exported as data rows
  (CSV writes their label only, `csv-export.md`).

## Tests (to be written with the code)
Step 2: `packages/core/test/expansion*.test.ts` (commands, event, pruning, focus fallback, non-data
skip). Step 3: `@dzgrid/core/tree` parent mode, conformance `conformance/cases/tree/*`, a property
test over 1 000 seeded trees against a recursive oracle, timing targets (build 100k ≤ 40 ms, expand
10 000 children ≤ 30 ms). Step 4: `packages/dom/test/tree*.test.ts` (role, attributes, toggle,
pointer capture, announcements), browser axe in French and Arabic. Step 5: nested and path shapes,
filler rules. Step 6: the million-row tree (`perf/profiles/tree.ts`, `playground/tree.html`).
Manual: `docs/a11y-protocol.md` §16.
