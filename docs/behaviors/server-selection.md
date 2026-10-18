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
- The exclude selection is tied to the **membership** of the query at that moment, as the model says it (`rows.membershipOf(query)`): the filters in the form the server receives (`toWire`: a half-typed filter changes nothing), the search, the part done in the browser, the `params` and the display zone. Never the sort or the page: they change no row's membership.
- A host's own exclude selection (`selection.set`) is tied the same way, to the membership in force.
- When the filters or the search change what is asked, the exclude selection is cleared, with source `data` and reason `scope-changed`, before the model and before `filterChanged` (one `selectionChanged`). A new zone (`context.set`), new `params` (`setSource`) or a column change that changes the request clear it too, told after `modelUpdated`. Include selections stay (unless `keepOnFilter` is off, below).
- `selectionChanged` carries `count`, `query`, `scope` and `reason`: in exclude mode, `count` is `counts.filtered − excluded` (at least 0), or null when the server does not know it; `query` and `scope` (`{params, zone}`) are what "all" stands for, so a host's bulk action can send them with the excluded keys. `kernel.selectionScope` gives `{query, params, zone}` now — its query carries the sort in force, which a later sort does not re-tell.
- **The header box** describes what its click acts on: on server pages, the whole query. Everything-except with no row unticked: ticked; every row unticked (count 0): unticked; otherwise partly ticked (an unknown total too). An include selection: unticked when empty, ticked when it holds as many keys as the query matches, partly ticked otherwise (rows ticked on another page make it partly ticked). A click on a ticked box clears everything, the keys of other pages too; otherwise it selects all (`selection.all`). Ctrl+A selects all the same way. `aria-checked` is `true`, `mixed` or `false`.
- `selection.allFiltered` on server pages is `selection.all`.
- **Said aloud:** a selection the user makes is read with its count ("6 rows selected"), or "All matching rows selected" when the total is unknown; "all" cleared by a scope change is read ("Selection cleared"); rows a fetched set drops are read with what is left. A sentence equal to the last one is not said again.
- **`keepOnFilter`** (owner decision, 2026-10-18): the setting `selection.keepOnFilter` (live, true by default). False: any change of the filter model or of the search text, from the user, the host or the API, clears the selection, include or exclude, before the model, with reason `scope-changed`, and it is said. A sort or a page change never clears it.
- **Fetched set** (`page` off or client): select all is the include set of the displayed rows, as in the browser; `selection.allFiltered` with pages in the browser is everything-except over the set, tied like above (a browser-side change of filter or search clears it as well). Only a new accepted answer replaces the rows held: keys not in it are dropped, with source `data` and reason `rows-dropped`, and the anchor goes with its row; a failed request, or a purge until its answer, drops nothing; the focus takes the row now at its place. `count` is exact.
- Excluded keys of rows deleted on the server stay: the count may be one too low until the filters change. Not reconciled (no row of another page is ever seen).
- **All in the browser:** see `selection.md`.

## Tests
- `packages/core/test/kernel-p3.test.ts` (keys of other pages kept; exclude tied to the query and cleared; null count; kept through a sort; count over the filtered rows), `packages/core/test/review-p3a.test.ts` (C2–C4: host exclude, unticked row, event order, anchor forgotten).
- `conformance/cases/selection-across-pages/*` (step 7): r3 on page 0 and r120 on page 2 both kept through a filter; select all, untick r7, go to page 5; a filter change clears exclude and keeps include; zone, params, a half-typed filter; the header state; fetched-set drop and `allFiltered`; `keepOnFilter` off.
- `packages/core/test/selection-scope.test.ts` (membership, `allFiltered`, `selectionScope`, `headerState`, `keepOnFilter`, reasons), `source-rows.test.ts` and `source-rows-fetched.test.ts` ("selection across server pages", "fetched-set reconciling"), `packages/dom/test/server-select.test.ts` (the box, Ctrl+A, the announcements, `keepOnFilter` through the settings).
- The footer ("Select all N rows", `footer.selected`, "N selected (some not shown)"): planned, step 17.

## Decisions (step 1, 2026-10-17)
- **"All" is tied to what decides membership:** the filters and the search, `params` and the display zone (it moves the instant bounds). Never the sort. At step 7 `matchKey` became the model's `membershipOf`. `phase-3-plugins.md` B1.6 and plan D2 are corrected.
- **Count:** `counts.filtered − excluded` (on a server, `filtered` is the server's total for the query), null when unknown.
- **`keeps`:** server pages, always; a fetched set or the browser, the row is held. The contract comment in `model/client.ts` is fixed at step 5.
- **No `selection.selectAll: 'query' | 'page'` option.** `selection.all` means what the model says; a host that wants only the page sends `selection.set` with the displayed keys.
- **A host's exclude selection on a browser model is allowed:** every row the filters and search match except these, tied and cleared by the same rule.
