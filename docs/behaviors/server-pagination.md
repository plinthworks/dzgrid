# Paging on the server

## What the user does
Moves to the next, previous, first or last page; picks another page size; changes a filter, the search or the sort while on page 5.

## What they observe
- One page of rows at a time, with the range and, when the server knows it, the total: "51–100 of 1 234".
- When the total is unknown: "51–100 of many"; "next" works while there are more rows, "last" is disabled.
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
- `packages/core/test/source-rows.test.ts`, `conformance/cases/source-model/*` (planned, step 5): unknown total, the inferred `hasNext`, the clamp, page 4 at 25 to size 100 lands on page 1, loading keeps the rows, cursor to page 2 and back to 1.
- Page stage in `ClientModel`, `aria-rowcount` per page (planned, step 4).
- `footer.pager` (planned, step 17): next fetches in the click's frame, "last" disabled without a total, latn digits in Arabic, focus kept on "next".
- The audit screen in both configurations (planned, step 18).

## Decisions (step 1, 2026-10-17)
- **Unknown total, empty page past the end** (an exact multiple of the page size with an inferred `hasNext`, or a host `page.go` too far): the model goes back to the page before, with `hasNext` false — kept as it is when that is the page shown, fetched once otherwise. An empty page 0 is the empty overlay.
- **Above `maxRows`** the rows are kept; only the warning `fetched-set-large` is given. Cutting them would make the counts lie.
- **The kernel holds the page:** commands `page.go {index}` and `page.size {size}`, and the event `pageChanged {source, page: PageState}`, emitted when the index, the size, the total or `hasNext` changes. It replaces the plan's `paginationChanged`. `RowModel` gains `page: PageState | null` and `setPage` (B1.4). Step 4.
- **Test names:** `packages/core/test/source-rows.test.ts` and `conformance/cases/source-model/*` (step 5); the page stage of `ClientModel` in `packages/core/test/client-page.test.ts` (step 4).
