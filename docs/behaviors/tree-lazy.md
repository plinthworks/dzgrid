# Children loaded on demand (lazy trees)

Sources: WAI-ARIA 1.2 (`aria-busy`, `aria-expanded`, `aria-setsize` = -1 when the size is not
known), the APG treegrid pattern, WCAG 2.2 (4.1.3 status messages, 2.1.1 keyboard, 2.5.8 target
size), and the public documentation of grids that load a parent's children when it opens (what a
user sees: a row that says it is loading, then the children). Never their code. Phase 4 plan D10,
step 7; owner decision Q6 (« Les deux »: the host's own loader, and children asked of a server
through the request gate).

## What the user does
Opens a folder whose content is not in the page yet: a service whose patients are asked of the
server only when wanted. Closes it before the answer, opens it again, opens another one meanwhile,
types a filter, sorts, presses Retry after a failure, by the mouse or the keyboard, in French and in
Arabic.

## What they observe
- A row that has children not loaded yet shows a closed chevron, like any parent.
- Opening it shows one row under it, indented one level: « Chargement… » (« جار التحميل… »). The
  screen reader says « Chargement ». The rows below move down by one row.
- When the children arrive, they take that row's place, in the sort order of the grid. The screen
  reader says « Service 3 développé, 12 lignes ». A focus that was on the loading row goes to the
  first child (the row now at its place).
- When the load fails, the loading row becomes « Les données n’ont pas pu être chargées » with a
  « Réessayer » button; the screen reader says « Échec du chargement ». Enter on that row, or a click
  on the button, asks again (the row says « Chargement… » again).
- Closing the row while it loads stops the load: nothing arrives later. Opening it again asks again.
- Opening a row whose children were loaded before shows them at once: nothing is asked again,
  until the application refreshes the rows or gives new ones.
- A row whose load answered no children becomes a leaf (no chevron); the screen reader says its name
  and « Aucune ligne » (« Service 3, Aucune ligne »).
- A filter applies to the rows that are loaded. A row not loaded is not asked for its children to
  find matches in them.
- « Tout déplier » and `*` open the rows whose children are loaded, never the ones not loaded: they
  never start a burst of requests.

## What DzGrid does
- **Declared children** (A and B): `tree({ parentId, lazy: lazyChildren({ has, load }) })` from
  `@dzgrid/dom/tree-lazy` (core logic in `@dzgrid/core/tree-lazy`). `has(row)` says whether a row has
  children not loaded yet; it is read only for rows shown and for a row being opened. A row it
  declares and that holds no child (whatever the filter) is a parent to open: `childrenAt` says -1
  (unknown), the chevron is drawn, `aria-expanded` is set.
- **The loading row**: a node `{ kind: 'loading', key: 'l:' + parent key, level, parent, failed }`
  right under an open declared parent that holds no child and whose load has not answered. It is not
  data: never selected, copied, edited, exported, counted (`dataCount`), and the row carries
  `data-kind="loading"`, `aria-busy="true"` while loading, `aria-level` (its parent's + 1),
  `aria-posinset="1"`, `aria-setsize="-1"`. Its text is the base bundle's `grid.loading`, then
  `grid.error` and the `grid.retry` button (no new text: the tree's bundles stay within their size).
  The same key for loading and failed: a focus on it stays through the failure and the retry.
- **One request per loading row, and only while it is shown**: after each change of the rows, a
  loading row with no request starts one; a request whose loading row is gone (the parent closed,
  an ancestor closed, a filter hiding it, the row removed) is aborted. Every request started is
  either answered or aborted. A second opening while loading starts nothing (the row is already
  there).
- **The answer** is added through the same path as a transaction (`applyTransaction({ add })`,
  source `data`): the rows go where their own parent id (or path) puts them, sorted and filtered
  like the others. An answer that comes after its row closed, after a reset or after a newer
  request is dropped (a token per request; for B also the gate). A failure (a thrown or rejected
  loader, an answer that is not a list) turns the loading row into the error row. A retry starts a
  new request.
- **Cache**: the rows loaded stay in the grid; opening their parent again asks nothing. `setRows`
  (new rows) forgets the cache: an open declared parent left with no child loads again; a load
  running goes on while its loading row still shows (and stops with it, as always); a failure stays
  until Retry or a close. Even when the new rows show nothing new (the very same objects), the open
  declared parents ask again at once, not at the next unrelated change. `rows.refresh` removes the
  rows the loads brought that the grid still holds (a row the host removed since is not removed
  again: no `unknown-row-id`), forgets every load (the running ones aborted), and the open declared
  parents load again. A model destroyed (`destroy()`) aborts every load; an answer after it is
  ignored.
- **Events**: `rowExpanded` is the user's or the API's action, never the load.
- **Announcements** (lead decision, review of step 7): only the user's actions are said. A user's
  opening of one row that shows a loading row says « Chargement », then, for that request, the
  usual « … développé, n lignes » when the children arrive, « Échec du chargement » on a failure, or
  — no child — the row's name and the base's « Aucune ligne » (`grid.noRows`), joined by the base's
  own pair `header.withSort` (« {header}, {priority} », the locale's comma; no new key, the tree
  bundles do not grow). A user's Retry says « Chargement » and then its answer the same way. A
  parent opened by the API, reopened by the API after a user's opening, or loading again after a
  refresh or new rows, says neither « Chargement » nor its answer.
- **Keys**: → opens a declared parent (it has children, unknown in number); ← on the loading or the
  error row goes to its parent; Enter on the error row retries (the button is not a tab stop: the
  grid stays one stop). A click on Retry is taken by the tree (no row click, no selection).
- **Shapes**: parent ids or paths (the loaded rows say where they go). Nested arrays (`children`)
  with `lazy` are refused (`unsupported-combination`, path `tree.lazy`): the tree works, without
  lazy loading.
- **A: the host's loader** `load(row, { signal })` returns the children (a Promise or a list). The
  signal is the window's `AbortController`'s, aborted when the loading row goes. Without `load` (and
  no server children), opening a declared row fails at once (error row) and `missing-feature` is
  told.
- **B: server children** (`sourceRows({ fetch, children })` from `@dzgrid/core/server`, with
  `tree({ parentId, lazy: lazyChildren({ has }) })`): `children(req)` gets a `ChildRequest`: the
  parent's key and id and row, the server's part of the query as the rows request sends it
  (`filter` in its wire form, `quick`, `sort`, `params`, `zone`), the query `epoch`, a canonical
  `key` and the `signal`. It answers a list of rows or `{ rows }`. Each parent has its own gate
  channel `children:<parent key>`: whatever order answers come in, only the last request of the
  current epoch for that parent, still wanted, is applied. **A new epoch** (the server's query, the
  zone, the params or the source changed) closes every row (no `rowExpanded`: the user changed the
  query, not the tree) and forgets the loads; the rows loaded go with the roots' answer. A row opened
  between the new epoch and the roots' answer asks in the new epoch. A refresh asks the roots again
  in the same epoch and, as A's, aborts the child requests running: the open declared parents ask
  again at once, an answer to an older request is dropped; the roots' answer then replaces the rows
  (the children loaded go with it) and an open parent left with no child asks again — even when the
  roots' answer shows nothing new. A child request is counted in `diagnostics.childFetches`.
- **Server pages and a tree** (decision of step 7): the server's pages count the roots; a parent's
  children come whole, never paged. The footer's range counts the roots of the page (« 11 à 20 sur
  30 », whatever the children and loading rows shown), and « Tout sélectionner » is offered once
  every data row of the page is ticked (a loading row is never selectable).
- **Export**: a loading or error row is never written to a CSV file, nor counted in the rows the
  file will hold (the progress total). Pages in the browser stay refused with a tree
  (`unsupported-combination`, D2).

## Where DzGrid differs on purpose
- No placeholder count: the loading row is one row, whatever the number of children to come
  (`aria-setsize` -1 says it is not known).
- Expand-all and `*` never load: a tree of a thousand closed folders would ask a thousand times.
- The server does not mark which of its rows are matches and which are ancestors: rows a server
  sends are shown as matches (no muted row); the browser's part of a filter mutes as in
  `tree-filter.md`.

## Tests (written before the code)
`packages/core/test/tree-lazy.test.ts` (A: the loading row, its place and attributes, one request,
abort on collapse and on hiding, answer, empty answer, failure and retry, cache, setRows, refresh,
filter, events), `packages/core/test/tree-lazy-server.test.ts` (B: the request, the channel per
parent, stale answers, epochs, collapse during a request, pages of roots), the permutation test
`packages/core/test/tree-lazy-permutations.test.ts` (1 000 seeded orderings) and its independent
oracle `tree-lazy-permutations-oracle.test.ts`, the review's `packages/core/test/tree-lazy-gaps.test.ts`
and `packages/dom/test/tree-lazy-gaps.test.ts`, conformance
`conformance/cases/tree/lazy-*`, `packages/dom/test/tree-lazy.test.ts` (the rows drawn, Retry by
click and by Enter, announcements in French and Arabic, the focus through the replacement), browser
`npm run test:browser -- --only tree`.
