# Live updates on a list loaded from a server (transactions, batched)

Sources: the public documentation of grids that take a stream of row changes from the application (what a user sees: a
changed row updates in place, rows added or removed elsewhere do not make the list jump, many changes arriving together
cost one repaint). Never their code. Phase 8 plan D11; owner answer Q-TX A (`docs/phase-8-steps/questions.md`). The core
part is built at step 3 (`@dzgrid/core/infinite`); the edits, the « next frame » flush and the Angular methods at steps
5 and 8.

## What the user does
Watches a long list fed by a server while the application receives changes from it (its own socket or polling): a row
on screen changes, a row is added or removed somewhere, fifty changes arrive in the same instant.

## What they observe
- A row on screen that changed shows its new values at once, at the same place; the focus and the selection stay on it.
- A row that is not loaded is not touched: when the user scrolls to it, the server sends it as it is now.
- When rows are added or removed, the rows on screen stay, and are asked again behind (the thin busy line if the answer
  is slow): the list does not jump; the count follows the server's answer.
- Many changes arriving together are one update of the screen, and at most one request.

## What DzGrid does
- The grid opens no socket: the application listens to its server and calls `applyTransaction(tx)` or
  `applyTransactionAsync(tx, done?)` on the model (`grid.kernel.rows` for an `infiniteRows` source; Angular's controller
  at step 8). `tx` is the client model's `RowTransaction`: `update` (whole rows by id), `patch` (`{ id, set }`), `add`,
  `remove`.
- `update` / `patch`: the rows **held** are replaced in place (a new object for a patch; the application's rows are never
  written to); a row not held is ignored. Nothing is asked. One change of kind `rows`, its `transaction` listing the keys
  updated.
- `add` / `remove`: the browser does not know where a new row falls nor how many rows shift: the blocks of the window are
  asked again with their rows kept, every other block marked stale (asked again when shown) — the refresh of
  `infinite-scroll.md`.
- `applyTransactionAsync`: the transactions arriving within `batchMs` (50 ms by default, owner Q-TX A) are applied
  together: one change, at most one request of the window; `done(result)` is called for each, in order, with its own
  result. Without a timer (the core alone) each one is applied at once.
- A row id that identifies nothing is told (`invalid-row-id`, path `update[i]` / `patch[i]`), never with the row.
- The batch lands at the next frame when it comes before `batchMs` (the DOM gives the model its frame, `ModelEnv.frame`;
  a hidden page has no frames: the 50 ms then): one change of kind `rows`, its `transaction.updated` listing every key
  the batch updated, one paint.
- Edits (step 5, K.14): an edit changes the row held where it is shown; nothing moves. An edit of a column the server
  sorts, filters or searches by marks the order stale (`orderStale`); « Réappliquer » (`rows.reapply`) asks the window
  again with its rows kept (the thin busy line), the other blocks stale; the first answer asked after the edit ends the
  mark. An edit of a row whose block is let go stays in the edit layer (keyed by the row, never by its place) and shows
  again when the block comes back.

## Tests
`packages/core/test/infinite.test.ts` « transactions » and « step 5 », conformance `block-cache/blocks-transaction`,
`packages/dom/test/infinite.test.ts` « step 5 » (one change, one paint at the frame; edits and reapply), the perf line
« infinite async batch: 100 updates on 2 000 rows held, one change » (≤ 4 ms).
