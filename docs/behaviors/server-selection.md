# Selecting rows on a server

## What the user does
Ticks rows on page 1, moves to page 3 and ticks more; ticks the header box ("select all"), then unticks a few rows; changes a filter, the search or the sort.

## What they observe
- Rows ticked on one page are still ticked when the user comes back to it.
- "Select all" means every row the filters and the search match, on every page, not only the page shown.
- Unticked rows stay unticked from page to page.
- The count reads "1 233 selected", or "all matching rows" when the server does not know the total.
- Sorting keeps "all"; another filter or search clears it, and the grid says so.

## What DzGrid does
- Selection is by row id. With server pages a selected key survives page, sort and filter changes: rows on other pages are not gone (`keeps` is always true).
- **Select all** with server pages is stored as *everything except these* (exclude mode), so it costs nothing at ten million rows. The anchor is forgotten.
- The exclude selection is tied to the **filters and the search** at that moment, not to the sort: sorting changes no row's membership.
- A host's own exclude selection (`selection.set`) is tied the same way, to the filters and search in force.
- When the filters or the search change, the exclude selection is cleared, with source `data`, before the model and before `filterChanged`. Include selections stay.
- `selectionChanged` carries `count` and `query`: in exclude mode, `count` is `counts.filtered − excluded`, or null when the server does not know it, and `query` is the query "all" stands for, so a host's bulk action can send both.
- The header box's ticked, unticked or partly ticked state is computed over the page shown.
- **Fetched set** (`page` off or client): select all is the include set of the displayed rows, as in the browser. A new server answer replaces the set: keys not in it are dropped, with source `data`; `count` is exact.
- **All in the browser:** see `selection.md`.

## Tests
- `packages/core/test/kernel-p3.test.ts` (keys of other pages kept; exclude tied to the query and cleared; null count; kept through a sort; count over the filtered rows), `packages/core/test/review-p3a.test.ts` (C2–C4: host exclude, unticked row, event order, anchor forgotten).
- `conformance/cases/selection-across-pages/*` (planned, step 7): r3 on page 0 and r120 on page 2 both kept; select all, untick r7, go to page 5; a filter change clears exclude and keeps include; the header state over the page.
- Fetched-set reconciling (planned, step 7). The announcement of the clearing, `footer.selected` (planned, step 17).

## Decisions (step 1, 2026-10-17)
- **"All" is tied to what decides membership:** the filters and the search, and, once they exist, `params` and the display zone (it moves the instant bounds). Never the sort. The code's `matchKey` stays; it gains `params` and the zone at step 7. `phase-3-plugins.md` B1.6 and plan D2 are corrected.
- **Count:** `counts.filtered − excluded` (on a server, `filtered` is the server's total for the query), null when unknown.
- **`keeps`:** server pages, always; a fetched set or the browser, the row is held. The contract comment in `model/client.ts` is fixed at step 5.
- **No `selection.selectAll: 'query' | 'page'` option.** `selection.all` means what the model says; a host that wants only the page sends `selection.set` with the displayed keys.
- **A host's exclude selection on a browser model is allowed:** every row the filters and search match except these, tied and cleared by the same rule.
