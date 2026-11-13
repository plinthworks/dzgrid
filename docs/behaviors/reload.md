# Asking the data again: `reload()` (1.12.0)

Written before the code (CLEANROOM). Found by a real application: `DzgController.refresh()` only paints again while
`refresh({})` asks the server again, and nothing in the name said so — the application called `refresh()` after a save
and kept showing the old rows. Owner 2026-11-13 (« A partout »): a method whose name says it, `reload()`, everywhere an
application holds the grid; `refresh()` stays as it is (no break).

## What the user does
Nothing: the application calls `reload()` — after a save, on a server push, behind its own « Refresh » button.

## What they observe
- On server data, the rows on screen stay while the same rows are asked again (the thin busy line with `busy`); the
  answer replaces them. The filters, the sort, the page and the selection are kept.
- On rows given by the application, nothing is fetched: the rows are worked out again from what the grid holds (a lazy
  tree's loaded children are asked again) and painted.

## Behaviours (numbered, each one a test)
1. **The grid's API** (`createGrid(…).api`): `reload()` asks the rows again, as the `rows.refresh` command (source
   `api`) does, then paints. Declared optional on `GridApi` (the API guard: a required member added to an interface
   would break an application implementing it), always set on a grid's API, like `ensureColumnVisible`.
2. **Server data** (`sourceRows`, `infiniteRows`, `serverSideRows`): the current page, or the window's blocks, asked
   again; the rows shown kept meanwhile; the query, the page and the selection unchanged. The same as
   `refresh({})` on the Angular controller. Nothing is let go: to start over at the top, `refresh({ purge: true })`.
3. **Rows given by the application**: there is nothing to fetch, and `reload()` is not an error: the rows are worked
   out again from those held and painted (decision: the same as `refresh({})`, so one rule for both; a lazy tree's
   loaded children are asked again, as on its own refresh — tree-lazy.md). New rows come from the application
   (`rows`, a transaction), never from `reload()`.
4. **Angular**: `DzgController.reload()` is the grid's `api.reload()` — one path with the element's (review 1.12.0);
   `refresh({})` invalidates the rows then paints, the same requests, state and rows
   (`packages/angular/test/reload-one-path.test.ts` compares the three on server pages with a request in flight and on
   given rows; routing it through `api.reload()` too costs 17 B of K.8, left to the owner); before the grid exists, after it is gone, it does
   nothing. `refresh()` paints only, `refresh({})` and `refresh({ purge })` unchanged; their documentation says the
   difference plainly and points to `reload()`.
5. **The element**: `<dz-grid>`'s `reload()` method is its grid's `api.reload()`; nothing before the grid exists.
6. Nothing thrown, nothing told: a `reload()` with no grid is a no-op. No `Problem` comes of it (a failed request is the
   source's own `fetchFailed`, as before).

## Tests
`packages/dom/test/reload.test.ts` (1–3, 6), `packages/angular/test/server-side.test.ts` and `reload-one-path.test.ts` (4),
`packages/element/test/element.test.ts` (5).
