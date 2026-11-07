# Groups loaded from the server (server-side row model)

Sources: WAI-ARIA 1.2 and the APG « treegrid » pattern (`aria-level`, `aria-posinset`, `aria-setsize` -1 for a size not
known, `aria-expanded`, `aria-busy`), WCAG 2.2 (2.1.1, 4.1.3), and the public documentation of grids that group a server's
rows and load each group's content when it opens (what a user sees: groups with their counts and totals, a loading row
under a group being opened, then its children). Never their code. Phase 8 plan D12–D13; owner answers Q-SE A (built
after infinite scroll, steps 6–7), Q-WIRE A, Q-TOT A, Q-OPEN A (`docs/phase-8-steps/questions.md`). Written at step 1;
built at steps 6–7: this sheet is the contract those steps' tests start from.

## What the user does
Groups a long history kept on a server by a column (the « Regrouper par » band, the column menu, or the application), opens
a group of 50 000 rows and scrolls in it, opens a sub-group, sorts, filters, closes and reopens a group, in French and in
Arabic.

## What they observe
- The top groups appear with their label, their number of rows and their totals, as client grouping shows them
  (`row-grouping.md`, `aggregation.md`): same chevron, same indent, same sentences.
- Opening a group shows one « Chargement… » row under it, then its first block of children (sub-groups, or rows at the
  last level); scrolling inside it loads the next blocks as `infinite-scroll.md` does for a flat list.
- The totals are the server's: a total never changes because more rows were loaded, and a grand total row shows when the
  server sends one.
- After a sort or a filter, the groups that were open stay open; their content is asked again when they are seen
  (Q-OPEN A). Closing a group and opening it again shows its content at once while it is still held.
- « Tout déplier » opens the groups already loaded, never a level not loaded (no burst of requests).

## What DzGrid does
- **The binding**: `source: serverSideRows(data, { blockSize?, maxBlocks?, … })` from `@dzgrid/core/server-side`, with
  `grouping({ by })` from `@dzgrid/dom/grouping` (the zone, the menu item, `[(groupBy)]` and `rowGroups` in the state
  work as on the client; `setBy` asks the server again: a new epoch).
- **The request** (Q-WIRE A): the same `DataSource.fetch` and `DataRequest` as blocks, plus `group: { by, path, aggs }` —
  `by` the grouping column ids; `path` the **typed values** of the open groups from the top (a day as `YYYY-MM-DD`, an
  instant as epoch ms, a number as a number, null for the empty group; never a label, never a key); `aggs`
  `[{ column, fn }]` with Phase 7's names (`sum`, `avg`, `min`, `max`, `count`, `first`, `last`); the block as a page by
  offset. Example: grouped by `region` then `day`, the request for the children of « Nord / 2026-03-04 » carries
  `group: { by: ['region', 'day'], path: ['Nord', '2026-03-04'], aggs: [{ column: 'qty', fn: 'sum' }] }` and asks the
  rows at the leaf level.
- **The answer at a group level**: `{ groups: [{ value, count?, aggs? }], total?, hasNext?, totals? }`; at the leaf
  level `{ rows, total?, hasNext? }`. A group's key is Phase 7's typed key (column id, type tag, canonical value): `1`
  and `'1'`, or a day and an instant of that day, are two groups. A key, a path and a value never reach a `Problem`.
- **Totals (Q-TOT A)**: shown as sent, never recomputed in the browser (a wrong server total shows as sent); a custom
  aggregation function beside a server is refused (`agg-type`, detail `server`); footers show their group's `aggs`; the
  grand total row the root answer's `totals`.
- **One cache**: each open group is a store of blocks (`blocks.ts` of `@dzgrid/core/infinite`), all under one LRU and one
  `maxBlocks`; the rows shown are the open stores flattened, positions by a prefix sum of the stores' counts (unknown:
  growing, `aria-setsize` -1).
- **Kept open (Q-OPEN A)**: across a new epoch the open set is kept (keys are values); the open groups that come back
  reopen and ask their children only when shown.
- **Refusals**: grouping on `sourceRows` or `infiniteRows` stays refused (`unsupported-combination`, path `source`);
  `expandAll` beyond the groups held refused (`unsupported-combination`, detail `server`).
- **Accessibility**: the tree's `aria-level`, `aria-posinset`, `aria-setsize` (-1 while unknown), `aria-expanded`; a
  user's opening says « Nom développé, n lignes » once its first block is in; scrolling says nothing.

## Built (steps 6–7), and what the lead decided
- A group opening shows one loading row (the lazy tree's `LoadingNode`, `l:` + its key), failed with Retry when its first
  block fails (only that group: the model stays idle); a level's places not held are block loading rows (`l:#` + place).
- A group's key: column id, the **value's own type tag** and the value; its label the column's format of the value.
- Grouped, the number of rows is the groups' (`counts.filtered` null): `aria-rowcount` -1; each level's `aria-setsize` its
  size when known, -1 while unknown.
- `expandAll` opens the groups held without asking anything (the window asks what it shows); past the first level it is
  told (`unsupported-combination`, path `expandAll`, detail `server`).
- The DOM grouping's `by` and options reach the model at creation (one grouped first request); `setBy` is a new epoch; a
  state's `rowGroups` restored in its one request whatever the order of the features; an export of « all » or « selected »
  carries `server.group = { by, path: [], aggs }`.
- Transactions and edits: see « Live updates and edits » below (Phase 8 step 8).

## Live updates and edits (Phase 8 step 8, owner Q-TX A applied to groups)
- The same calls as `infiniteRows` (`row-transactions-async.md`): `applyTransaction(tx)` and `applyTransactionAsync(tx,
  done?)` on the model (`grid.kernel.rows`, Angular's controller), `batchMs` (50 ms) and the next frame, `done` per
  transaction in order.
- `update` / `patch`: a leaf row held, at any level, is replaced in place at once (a new object for a patch); a row not
  held is left to the server; a group row is never a row id (ignored). Nothing moves.
- Grouped, a row updated may belong to another group now, and its groups' counts and totals may have changed: the
  browser never recomputes them (Q-TOT A). So an update of a row held in a grouped grid also asks the window again
  behind, its rows kept (the thin busy line if slow), every other block stale — as an `add` or a `remove` does. The open
  groups stay open. Not grouped, an update asks nothing (as `infiniteRows`).
- `add` / `remove`: the window asked again with its rows kept, the other blocks stale, the open groups kept.
- Edits (K.14): an edit changes the row held where it is shown; nothing moves. An edit of a column the server sorts,
  filters, searches, groups or totals by marks the order stale (`orderStale`); « Réappliquer » (`rows.reapply`) asks
  the window again with its rows kept; the first answer asked after the edit ends the mark.
- A row id that names nothing is told (`invalid-row-id`, path `update[i]` / `patch[i]`), never with the row.

## Server pivot and value types (2026-11-07, owner A to Q-SP1…Q-SP8)
- With `serverSideRows(data, { pivot: serverPivot() })` the group part carries `pivot` and the answers `cells` and
  `pivot`: `server-pivot.md`.
- **A group's value must fit its column's type** (Q-SP5 A, also without a pivot): null, any value in a `custom` column, a
  number in a `number` or `instant` column, a boolean in a `boolean` one, a text in the others (a valid `YYYY-MM-DD` in a
  `day` one). Otherwise the group is left out and told `invalid-page-response` at `response.groups[j].value`, never with
  the value. Before 1.8.0 such a group was shown, labelled by `String(value)`: a behaviour change, in the CHANGELOG.

## Tests (written before the code, steps 6–7)
Conformance `server-side/*` (request per level, typed paths and keys, a custom aggregation refused, a planted wrong
total shown as sent, a group reopened after a sort asks only when shown, eviction across levels, a group of unknown size
growing), `packages/core/test/server-side.test.ts`, `packages/dom/test/grouping-server.test.ts`, the browser page on
data set C (fr / ar), axe 0.
