# Paging on the server

## What the user does
Moves to the next, previous, first or last page; picks another page size; changes a filter, the search or the sort while on page 5.

## What they observe
- One page of rows at a time, with the range and, when the server knows it, the total: "51 to 100 of 1 234" (words, not a dash: right to left reads it the same; step 17).
- When the total is unknown: "51 to 100" and "Page 3" (no "of …", owner decision Q2 of step 17); "next" works while there are more rows; "last" is disabled by offset and not drawn by cursor.
- While the next page loads the current rows stay, dimmed, and the grid says it is busy.
- A filter, search or sort change goes back to the first page.
- A new page size keeps the first row of the page in view.
- The page change is announced; focus stays on the pager button that was used.
- Past the last page with no total, the grid steps back to the last page that has rows.

## What DzGrid does
- Pages are 0-based; `pageSize` 50 by default, `pageSizes` `[25, 50, 100]`. Commands `page.go` and `page.size`.
- With server pages, the request carries `page: { index, size, offset, cursor }`; the response gives `rows`, and `total` or `hasNext`.
- No `total`: `hasNext` is required. Neither: the warning `invalid-page-response`, and `hasNext` is read as `rows.length >= size`.
- Rows beyond the page size are kept, with the same warning.
- A change of the server's part of the query (filter, search, sort, `params`, zone) starts a new epoch and returns to page 0. A size change keeps the first row: `index = floor(index·old / new)`.
- A page past the end, when the total is known, clamps to the last page and fetches once more.
- **Offset or cursor** (`paging`): offset by default. In cursor mode the grid keeps the cursor of every page reached in the epoch, so next, previous and back to page 0 work; it cannot jump (`canJump` false), and "last" is hidden.
- **Screen readers:** `aria-rowcount` counts the rows of the current page plus the header rows, never the server total.
- **Page change:** the scroll goes to the top (a refresh keeps it). Focus keeps its column and takes the row at the same index on the new page; an empty page sends it to the header. Selected rows of other pages stay selected (see `server-selection.md`).
- **Paging in the browser** (`page: 'client'`): a cut of the sorted rows, memoised; a page change only cuts again, no request. `counts.total` is the length of the fetched set.
- **`maxRows`** guards the fetched set (`page` off or client): above 100 000 rows by default, the warning `fetched-set-large`. It does not apply to server pages.

## Tests
- `packages/core/test/source-rows.test.ts`, `source-rows-gaps.test.ts`, `conformance/cases/source-model/*` (step 5): unknown total, the inferred `hasNext`, the clamp, page 4 at 25 to size 100 lands on page 1, loading keeps the rows.
- `packages/core/test/source-rows-cursor.test.ts`, `source-model/cursor-next-back`, `cursor-size-resets` (step 5 part 3): cursor to page 2 and back to 1, the jump that stops at the last page reached, the new size back to page 0.
- `packages/core/test/source-rows-fetched.test.ts`, `source-model/client-part-no-request`, `blank-quick-not-sent`, `fetched-set-max-rows`, `fetched-set-total-null-when-filtered`, `client-shorthand-fetches-once`, `pagination-ignored-page-off`, `problems/fetched-set-large` (step 5 part 3).
- `packages/core/test/source-rows-property-strong.test.ts`: server pages by offset, by cursor, and the fetched set paged in the browser; 1 000 seeded orders each, with and without a destroy, empty answers included, every step checked against the sheet.
- Page stage in `ClientModel`, `aria-rowcount` per page (planned, step 4).
- `footer.pager` (step 17, `pagination-footer.md`): `packages/dom/test/pagination.test.ts`, `pagination-walk.test.ts`; next fetches in the click's frame, "last" disabled without a total and absent by cursor, digits in Arabic, focus kept on "next" (browser checks too).
- The audit screen in both configurations (step 18): `packages/dom/test/audit-permutations.test.ts` (tier 1, jsdom; `npm run test:perm` for the 1 000 seeds), `scripts/audit-browser.mjs` (tier 2, Chrome, `npm run test:audit`), `packages/dom/test/fake-server.test.ts` (the server's pages, total known or not).

## Decisions (step 1, 2026-10-17)
- **Unknown total, empty page past the end** (an exact multiple of the page size with an inferred `hasNext`, or a host `page.go` too far): the model goes back to the page before, with `hasNext` false — kept as it is when that is the page shown, fetched once otherwise. An empty page 0 is the empty overlay.
- **Above `maxRows`** the rows are kept; only the warning `fetched-set-large` is given. Cutting them would make the counts lie.
- **The kernel holds the page:** commands `page.go {index}` and `page.size {size}`, and the event `pageChanged {source, page: PageState}`, emitted when the index, the size, the total or `hasNext` changes. It replaces the plan's `paginationChanged`. `RowModel` gains `page: PageState | null` and `setPage` (B1.4). Step 4.
- **Test names:** `packages/core/test/source-rows.test.ts` and `conformance/cases/source-model/*` (step 5); the page stage of `ClientModel` in `packages/core/test/client-page.test.ts` (step 4).

## Decisions (step 4, 2026-10-17) — paging in the browser, same feel as the server
- `pagination: { pageSize, pageSizes }` pages the client model; set once (`unsupported-live-change` otherwise). Defaults 50 and 25, 50, 100; a bad value is `invalid-page` and the default is taken.
- A filter, search or sort change goes back to the first page; an equal query, a refresh of the rows or `reapply` keep it. Rows that shrink clamp it to the new last page. A page past the end shows the last page.
- A new size keeps the page holding the old page's first row: `floor(index × old / new)`.
- An empty list is one empty page (`pageCount` 1), never "page 1 of 0".
- Select-all selects the page; the selection survives a page change; a range across pages is refused. `selection.allFiltered` selects every filtered row on every page (everything-except, see `server-selection.md`).
- `aria-rowcount` counts the page's rows (plus the header rows), `aria-rowindex` restarts on each page; the pager announces the range (step 17).
- Scroll to the top on a page change, the pager and the announcement belong to `/pagination` (step 17).
- Tests: `packages/core/test/client-page.test.ts`, `conformance/cases/page-model/*`, `conformance/cases/problems/invalid-page.json`, `packages/dom/test/client-page.test.ts`.

## Decisions (step 5 part 2, 2026-10-17) — the kinds of change, server pages by offset
- One call, one change, of the largest kind it caused (`query` > `page` > `rows` > `context` > `status`). An answer that arrives inside the call that asked (a synchronous source) is part of that call's change, with its source.
- `status` only when the phase changes: a refresh while a request already runs says nothing (the newer request replaces it).
- The kind of an answer compares it with the rows shown: another epoch key (or none shown: first answer, purge, new source) is `query`; the same page at the same size is `rows`; otherwise `page`. A retry of page 1 while page 0 is shown is therefore `page`; a filter changed and changed back, answered for the page shown, is `rows`; an empty page past a total of 0 that lands on the page shown is `rows`.
- `hasNext`: said by the answer, else from the total at the page asked (so the pager is right at the click), else inferred from a full page. An empty page past the end of an unknown total records the end as a row count: no next from there, at any size, until a new epoch.
- An empty page inside a known total (`total` covers it) is trusted and shown, never asked again; the last page asked once more only when the total says it is past the end.
- An answer with neither `total` nor `hasNext` is warned every time, even empty; a `hasNext` that is not a boolean is warned at `response.hasNext` and read as absent.
- `setSource` takes the new binding's data and `params`; its `paging` and `maxRows` are ignored. A binding not made by `sourceRows` is ignored.
- Destroy does not change the status: a destroyed model asks and says nothing more.
- **Step 5 review (2026-10-17):** past an unknown end the grid goes halfway back to the page on screen (known not empty) at each empty answer, not one page at a time: a far page (a restored URL, data that shrank) costs a few requests. The page on screen is kept, not asked again, once nothing is left between. A new query forgets the old one's total and `hasNext`: no "no rows" and no clamp from them while it loads.

## Decisions (step 5 part 3, 2026-10-17) — cursors, the fetched set
- **Cursors** belong to the epoch: page 0 has none, page *i + 1*'s is the one page *i*'s answer gave. A page is asked with its cursor (and its offset, for a server that reads both); the cursor is in the request key.
- **No jump:** `page.go` past the last page reached stops at it; with a known total, the lower of the two. `hasNext` is true only when the next page's cursor is known, so it is false while the next page loads.
- **A next page needs its cursor:** when an answer says there is one (by `hasNext`, by its total, or inferred from a full page) without a string `nextCursor`, the warning `invalid-page-response` at `response.nextCursor`, and `hasNext` is read as false. An empty string is a cursor. A cursor given with `hasNext` false is ignored.
- **An answer says what follows it now:** answering page *i* drops the cursors after *i* (they came from older answers), then keeps the new one. Going back to page 1 and on loses the cursor to page 3 until page 2 answers again.
- **A new size** starts again at page 0 with no cursor, even with an index: no cursor addresses the old first row (offset paging keeps it). A new query, a new source and a purge also go back to page 0 and forget the cursors; a refresh and a failure keep them.
- **Past an unknown end by cursor:** the empty page and the pages after it are out of reach (their cursors go); the step back is the one of offset paging.
- **The fetched set** (`page` off or client) asks once, with no `page`; `total`, `hasNext` and `nextCursor` are not read (and not warned of), nor is the page size. The browser pages it: a page command asks nothing.
- **Another set starts on page 0:** an answer for another epoch key (another server query, zone, params, source, or after a purge) puts the browser's pages back to page 0; a refresh of the same set keeps the page, clamped if the set shrank. While another set loads, the old rows can still be paged.
- **Counts of the fetched set** follow the epoch: `total` (when the server neither filters nor searches) and `filtered` are null before the first answer, after a purge, and while a new epoch loads — even a query changed and changed back, whose rows are on screen —, then the set held. A client filter or search alone keeps `total`: the set is everything.
- **`maxRows`** is checked on every accepted answer of a fetched set: above it, `fetched-set-large` at `response.rows`, the rows kept; at it exactly, nothing. A bad `maxRows` is `invalid-page` at `source.maxRows`, and 100 000 is taken.
- **`pagination` while paging is off:** paging off wins; the warning `invalid-page` at `pagination`, the setting not read (its own faults not told). `page: 'client'` with a source and no `pagination` pages by 50.
- **Steps 3-4 test analysis (2026-10-17):** after a refresh the step-back asks the page on screen again instead of keeping it (a refresh asks for fresh rows: a row deleted on the server must not stay). A failure says which request failed (`status.key`, `status.page`), from the very first one.

## Decisions (step 17, 2026-10-20) — the footer
- The pager, the count and the selection strip are `@dzgrid/dom/pagination` (`pagination-footer.md`). Unknown total: "51 to 100" and "Page 3", no last button by cursor (owner Q2). The count is words, never a dash.
- The base does nothing on a page change: scrolling to the top and `announce.page` are the feature's. Paging on without `pagination()` is `missing-feature` (warning, `settings.pagination`).

## Decisions (step 18, 2026-10-20) — found by the audit permutations
- **A fetched set: a query changed and changed back starts again on page 1.** The browser's pages went back to page 1 only when the answer was for another key than the set shown; a search changed and put back (the user paging the old rows meanwhile) kept the page as a refresh would. Now the first answer of a new epoch, even one back to the key shown, starts on page 1, as server pages do and as "a filter, search or sort change goes back to the first page" says; a refresh or a retry of the same epoch keeps the page. Pages turned while another set loads still page the old rows. Tests: `packages/core/test/source-rows-fetched.test.ts` (« a query changed and changed back starts again on page 0 »), the oracle of `source-rows-property-strong.test.ts`. *To confirm with the owner: it revises the step 5 part 3 reading ("changed and changed back is the same set").*
