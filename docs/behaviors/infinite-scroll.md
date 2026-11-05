# Infinite scroll (rows loaded in blocks as the list scrolls)

Sources: WAI-ARIA 1.2 (`aria-rowcount` and `aria-rowindex`, -1 for a count not known, `aria-busy`), the APG « grid »
pattern, WCAG 2.2 (2.1.1 keyboard, 2.4.3 focus order, 4.1.3 status messages, 2.2.2 nothing moving by itself), and the
public documentation of grids that load a long server list block by block while it scrolls (what a user sees: rows
that say they are loading, then their data; a scrollbar sized by the server's count or growing as the end is
approached). Never their code. Phase 8 plan D1–D11, D14–D18; owner answers Q-SE, Q-MODE, Q-BLK, Q-END, Q-LR, Q-PURGE,
Q-SEL A (`docs/phase-8-steps/questions.md`).

## What the user does
Opens a journal of ten million events kept on a server, scrolls it with the wheel, drags the scrollbar's thumb to the
middle or the bottom, presses Ctrl+End, Page Down held, sorts a column, types a filter, presses « Rafraîchir », meets a
block the server failed to send and presses « Réessayer », ticks rows and « Tout sélectionner » — by the mouse and the
keyboard, in French and in Arabic.

## What they observe
- **One list, no pages.** The application chose this grid scrolls (pages stay the default of a server grid, Q-MODE
  A): there is no pager, every row of the query is in one scrolling list. A count part of the pager, when the
  application shows one, still says how many rows there are (« 1 234 567 lignes »), or nothing when not known.
- **Rows not arrived yet.** Where rows have not arrived, grey rows say « Chargement… » (« جار التحميل… ») in their first
  cell, the other cells empty. When the block arrives, its rows take their places, without the list moving. The
  screen reader says nothing while the user scrolls (a list that talks at every block is unusable); a row reached by the
  keyboard that is still loading is read « Chargement », busy.
- **The scrollbar.** With the server's total known, the scrollbar is sized for every row at once: the thumb dragged to
  the middle shows row 5 000 000, its rows loading, then arriving. With no total (Q-END A), the list is as long as the
  rows reached plus one block of loading rows: scrolling down makes it longer until the server says it has no more.
- **Ctrl+End and Ctrl+Home.** Ctrl+End goes to the last row: with a known total, row 10 000 000 (a loading row first,
  then its data); with an unknown total, the last row known — pressed again, further, until the end. Ctrl+Home goes
  back to the first row, which is held or asked again.
- **A block that failed.** Its rows say « Les données n'ont pas pu être chargées » and the first of them shown carries a
  « Réessayer » button. A click on it, or Enter on any of those rows, asks again for the rows on screen (as
  « Rafraîchir », below). Rows on either side that arrived stay.
- **Sort, filter, search** (Q-PURGE A): the list goes back to the top and everything is asked again; the « Chargement »
  message covers the body until the first block arrives. Nothing of the old order is shown in the new one.
- **Rafraîchir** (the application's refresh, or Retry): the rows on screen stay and are asked again behind (the thin
  busy line under the header); rows held off screen are asked again when they come back into view.
- **Selection** (Q-SEL A): « Tout sélectionner » means every row the filters and the search find, on the server, without
  loading them; unticking a row keeps it unticked. Shift+click between two rows ticks the rows held between them; when
  some between are not loaded, only the clicked row is ticked.
- **Memory.** Scrolling the whole list never holds more than 20 blocks of 100 rows (Q-BLK A, both changeable); the
  blocks least recently seen are dropped first, and come back (asked again) when the user returns to them.

## What DzGrid does
- **The binding** (D1, D2): `source: infiniteRows(data, { blockSize?, maxBlocks?, ahead?, concurrency?, restMs?,
  params?, abort? })` from `@dzgrid/core/infinite`; `data` is the same `DataSource` as server pages
  (`@dzgrid/core/server`). A block is asked as a page by offset: `DataRequest.page = { index: n, size: blockSize,
  offset: n × blockSize, cursor: null }`, with `blocks: true`, the server's part of the query (`filter` in its wire
  form, `quick`, `sort`), `params`, `zone`, a canonical `key` and the `signal`. The answer is a `DataResponse`: `rows`,
  and `total` (the rows the query matches) or `hasNext`. A host that answers server pages by offset answers blocks.
  `paging: 'cursor'` does not exist here (blocks jump).
- **Operations** (D3): everything on the server. An `operations` setting placing filter, search or sort in the browser
  is refused (`invalid-operations`, error, read as the server's); `page` reads `off` (one list); a `pagination` setting
  is ignored with `invalid-page` (warning, path `pagination`). The model's `page` is null: no pager is drawn.
- **The rows shown** (D4) are a view over the blocks held: `count` is the server's total when known; when not, the rows
  up to the furthest block answered, plus one block while the server says there are more (`hasNext`, or a full block
  with no total). A row not held is a `BlockLoadingNode` `{ kind: 'loading', key: 'l:#' + position, level: 0, parent:
  null, failed }` (a member of `RowNode` of its own: the lazy tree's `LoadingNode` keeps its parent, unchanged). `indexOf` finds the rows held only (a `Map` of at most `maxBlocks × blockSize` keys) and the loading
  keys. `dataCount` is the number of data rows held. The view's version moves when a block is answered, dropped or
  fails, never on a scroll.
- **The end.** A block shorter than `blockSize` (or `hasNext: false`) says where the end is: the count stops there,
  whatever a total said. An empty block past the end does the same. A total that shrinks under the view drops the
  blocks past it. An answer with neither `total` nor `hasNext` is read as pages read it (a full block: more follow) and
  told (`invalid-page-response`, warning, `response.hasNext`): the host should say which.
- **Asking** (D6): after each paint the grid tells the model its window of rows (`rows.want(first, last, keep)`,
  `keep` the focused row). The model asks the focused row's block first, then the blocks the window touches, then one
  block ahead in the direction of the scroll; at most 2 requests run at once, the others wait in that order. When the
  window jumps more than one block since the last time (a thumb drag, Page Down held, Ctrl+End), nothing is asked until
  it has rested **60 ms** (the DOM's timer, given to the model; without one nothing waits), then the blocks of where it
  rests. A waiting block that left the window is never asked; a running one is left to finish (its rows are kept)
  unless two blocks or more wait: then the requests running out of the window are aborted, farthest first, as many as
  wait. One gate channel per block
  (`block:<n>`): an answer from an older epoch, or to a request asked again since, is dropped.
- **The cache** (D5): at most `maxBlocks` blocks hold rows. The blocks of the window, the one ahead and the focused
  row's are kept; above `maxBlocks` the block least recently in the window goes. A window taller than `maxBlocks`
  blocks is still held whole (the only case past the limit; `diagnostics.blocks.max` shows it).
- **Not « loading »** (D8): blocks loading under rows already shown do not make the model's status `loading`: no busy
  line, no stale marking, no overlay, no `aria-busy` on the grid while scrolling. The status is `loading` only for the
  first block of a query (nothing shown: the overlay) and for a refresh (rows kept: the busy line).
- **A new query** (D9): a new filter, search, sort, zone, params or source starts a new epoch: every block dropped,
  every request aborted (`stale-epoch`), the end forgotten, the first block asked in the same call, the view back to the
  top. An answer of the old epoch is never applied.
- **Refresh** (D10 A): `invalidate()` (`rows.refresh`, the overlay's and a failed row's Retry) asks the blocks of the
  window again with their rows kept, and marks every other block stale (dropped first, asked again when shown).
  `invalidate({ purge: true })` drops everything, as a new query.
- **A failed block**: its rows become failed loading rows (the same keys); the status stays `idle` and nothing is
  announced (the user did not ask). A failed block that leaves the window is forgotten: shown again, it is asked again.
  Retry (the button, or Enter on any failed row) is the grid's refresh: the window's blocks asked again, failed ones
  included, `announce.loading` said. The failure of the first block of a query, or of a refresh, is the model's error
  (`status: 'error'`, `fetchFailed`, the error overlay with Retry), as on server pages.
- **Duplicate ids** (the list changed under the view): a row whose id is already held in another block takes its new
  place; the block that held it before is dropped and, if shown, asked again once; a second time in the same epoch it
  fails instead (a server that keeps sending one id twice would otherwise be asked forever). Told once:
  `duplicate-row-id` (warning, path `response.rows[i]`), never with the id.
- **Selection** (D14): `selectAll: 'query'`, a selected key always kept, membership = the wire filter, the search and
  the params, as server pages (`server-selection.md`). Under a selection rule, « all » takes the rows held. Shift+click
  takes the data rows held between the anchor and the click; a gap not loaded refuses the range (the clicked row only).
- **Every place that walks the rows** (D15) walks the rows held (`DisplayedRows.held()`), never ten million:
  select-all and the header box under a rule, Shift+click, find, print, the row numbers, the CSV of `displayed`.
- **Accessibility** (D18): `aria-rowcount` is the total plus the header rows when known, `-1` while unknown;
  `aria-rowindex` the true position (up to 10 000 001 and more). A loading row carries `data-kind="loading"` and
  `aria-busy="true"` (not when failed); its first cell holds the text. The focus may rest on a loading row; when its
  data arrives, the focus stays at that position, on the data row.
- **Combinations** (D17): a tree, details, client grouping or any other row shape beside blocks is refused
  (`unsupported-combination`, warning, path `shape`, detail its kind): the grid shows the flat list.
- **Diagnostics**: `diagnostics.fetches`, `diagnostics.gate`, and `diagnostics.blocks` = `{ held, asked, evicted, max,
  failed }` (`max`: the most blocks ever held at once).

## Where DzGrid differs on purpose
- No guessed total (Q-END A): an unknown total grows as the user scrolls; it never jumps when a guess is corrected.
- One « Réessayer » per failed run of rows shown, not one per row.
- A refresh keeps the screen (Q-PURGE A); only a new query goes back to the top.

## Tests (written before the code)
`packages/core/test/infinite.test.ts` (requests, blocks, end, failure, refresh, purge, LRU, scheduler, rest,
duplicates, selection policies, refusals, diagnostics), `packages/core/test/walks-bounded.test.ts` (a planted 10⁷
`displayed` counting `nodeAt` calls), conformance `server-gate/blocks-*` (with the gate's new `forget`) and `block-cache/*` (the request, the length, the
window, the cache, purge, refresh, failures, duplicates, transactions; one suite for the plan's « block-cache » and
« source-model/blocks-* »), `packages/dom/test/infinite.test.ts` (rows drawn, attributes, keys, focus, Retry, busy
rules, walks), the permutations (`packages/core/test/infinite-permutations.test.ts`, 1 000 seeded orders under `npm run test:perm`, 0
stale block applied), node perf lines in `perf/budgets.json`, and the browser page `node scripts/browser-infinite.mjs [--engine all]` on
`packages/dom/test/browser/infinite.html` (Chrome: Ctrl+End, wheel frames, thumb drag, blocks held; every engine: row
10⁷ reached at 0 px, the unknown end growing; axe fr / ar).
