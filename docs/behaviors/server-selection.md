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
- The exclude selection is tied to the **membership** of the query at that moment, as the model says it (`rows.membershipOf(query)`): the filters in the form the server receives (`toWire`: a half-typed filter changes nothing), the search, the part done in the browser (the filters it applies, `compileFilter`'s `applied`: a half-typed or refused one changes nothing there either; a blank search is none), the `params` and the display zone. Never the sort or the page: they change no row's membership.
- A host's own exclude selection (`selection.set`) is tied the same way, to the membership in force.
- When the filters or the search change what is asked, the exclude selection is cleared, with source `data` and reason `scope-changed`, before the model and before `filterChanged` (one `selectionChanged`). A new zone (`context.set`), new `params` (`setSource`) or a column change that changes the request clear it too, told after `modelUpdated`. Include selections stay (unless `keepOnFilter` is off, below).
- `selectionChanged` carries `count`, `query`, `scope` and `reason`: in exclude mode on server pages, `count` is `counts.filtered − excluded` (at least 0), or null when the server does not know it; in the browser and a fetched set, which rows match is known, so it is exact: `counts.filtered` less the excluded keys whose row matches now (`RowModel.matches`); `query` and `scope` (`{params, zone}`) are what "all" stands for, so a host's bulk action can send them with the excluded keys. `kernel.selectionScope` gives `{query, params, zone}` now — its query carries the sort in force, which a later sort does not re-tell.
- **The header box** describes what its click acts on: on server pages, the whole query. Everything-except with no row unticked: ticked; every row unticked (count 0): unticked; otherwise partly ticked (an unknown total too). An include selection: unticked when empty; ticked only when it holds as many keys as the query matches **and** every row shown is ticked; partly ticked otherwise — rows ticked on another page, or kept keys of another query, even as many as this one matches (a key count alone never says "all"). A click on a ticked box clears everything, the keys of other pages too; otherwise it selects all (`selection.all`), so a box partly ticked by kept keys selects the query, it does not clear them. Ctrl+A selects all the same way. `aria-checked` is `true`, `mixed` or `false`.
- `selection.allFiltered` on server pages is `selection.all`. `selection.all` over a tied everything-except (any model) selects the query again: the unticked rows are ticked, nothing is lost.
- **Said aloud:** a selection the user makes is read with its count ("6 rows selected"), or "All matching rows selected" when the total is unknown; "all" cleared by a scope change is read ("Selection cleared"); rows a fetched set drops are read with what is left. A sentence equal to the last one is not said again — unless the live region said something else in between (an error, a sort, `api.announce`, any source): then it is said.
- **`keepOnFilter`** (owner decision, 2026-10-18): the setting `selection.keepOnFilter` (live, true by default). False: any change of the filter model or of the search text, from the user, the host or the API, clears the selection, include or exclude, before the model, with reason `scope-changed`, and it is said. A sort or a page change never clears it.
- **Fetched set** (`page` off or client): select all is the include set of the displayed rows, as in the browser; `selection.allFiltered` with pages in the browser is everything-except over the set, tied like above (a browser-side change of filter or search clears it as well). Only a new accepted answer replaces the rows held: keys not in it are dropped, with source `data` and reason `rows-dropped`, and the anchor goes with its row; a failed request, or a purge until its answer, drops nothing; the focus takes the row now at its place. `count` is exact.
- Excluded keys of rows deleted on the server stay: the count may be one too low until the filters change. Not reconciled (no row of another page is ever seen).
- **After a failed request** on server pages the rows of the query before stay shown (marked stale). "All" selected then is tied to the new query; unticking one of those old rows is allowed and keeps its key among the excluded: the count is null until an answer comes, then may be one too low, as for a deleted row (decided: documented, not refused — the key is harmless to a bulk action that sends the query with its exclusions; refusing would need the kernel to know which answer a row came from).
- **All in the browser:** see `selection.md`.
- **Under a selection rule** (step 21, `selection-rules.md`, owner Q1): the header box and Ctrl+A tick the rows of the page shown (an include set; other pages keep their keys), the box speaks for the page, `selection.allFiltered` and a host's exclude set are refused (`needs-rows`: the rule cannot judge rows not loaded), and a host's include keys of rows on other pages are refused (`unknown-row`).

## After a bulk action (step 16d, recipe)
Send the ids (`selectedIds(controller).ids` in Angular: with a selection rule it is always an include list, every
ticked row on every page), then clear and reload: `dispatch({ type: 'selection.clear' })`, `rows.refresh`. The
grid never unticks by itself after the action.

## Tests
- `packages/core/test/kernel-p3.test.ts` (keys of other pages kept; exclude tied to the query and cleared; null count; kept through a sort; count over the filtered rows), `packages/core/test/review-p3a.test.ts` (C2–C4: host exclude, unticked row, event order, anchor forgotten).
- `conformance/cases/selection-across-pages/*` (step 7): r3 on page 0 and r120 on page 2 both kept through a filter; select all, untick r7, go to page 5; a filter change clears exclude and keeps include; zone, params, a half-typed filter; the header state; fetched-set drop and `allFiltered`; `keepOnFilter` off.
- `packages/core/test/selection-scope.test.ts` (membership, `allFiltered`, `selectionScope`, `headerState`, `keepOnFilter`, reasons), `selection-scope-bugs.test.ts` (the step 7 test analysis: half-typed filters and blank searches in the browser, the exact browser count, the include box over another query's keys, the failed-request edge), `selection-scope-gaps.test.ts`, `selection-scope-property.test.ts` (six models under random scripts against a naive oracle), `packages/dom/test/server-select-bugs.test.ts` (the box and Ctrl+A over an all-pages selection, the announcer after another voice), `server-select-gaps.test.ts`, `source-rows.test.ts` and `source-rows-fetched.test.ts` ("selection across server pages", "fetched-set reconciling"), `packages/dom/test/server-select.test.ts` (the box, Ctrl+A, the announcements, `keepOnFilter` through the settings).
- The footer ("Select all N rows", `footer.selected`, "N selected (some not shown)"), step 17: `packages/dom/test/pagination.test.ts`, `pagination-walk.test.ts` (`pagination-footer.md`).

## Decisions (step 1, 2026-10-17)
- **"All" is tied to what decides membership:** the filters and the search, `params` and the display zone (it moves the instant bounds). Never the sort. At step 7 `matchKey` became the model's `membershipOf`. `phase-3-plugins.md` B1.6 and plan D2 are corrected.
- **Count:** `counts.filtered − excluded` (on a server, `filtered` is the server's total for the query), null when unknown. In the browser (step 7 analysis): exact, the excluded keys that match.
- **`keeps`:** server pages, always; a fetched set or the browser, the row is held. The contract comment in `model/client.ts` is fixed at step 5.
- **No `selection.selectAll: 'query' | 'page'` option.** `selection.all` means what the model says; a host that wants only the page sends `selection.set` with the displayed keys.
- **A host's exclude selection on a browser model is allowed:** every row the filters and search match except these, tied and cleared by the same rule.

## Decisions (step 17, 2026-10-20)
- **The header box on browser pages** (owner Q1, closing Q2 of step 7): it acts on the page shown only. Ticking adds the page's rows (the core's `selection.allDisplayed` is a union while the rows are paged); unticking a fully ticked page sends `selection.set` without the page's rows (an include set less them, or an everything-except with them excluded), so other pages keep their rows; Ctrl+A follows the box. Server pages are unchanged: the box and Ctrl+A select the query.
- **The footer** (`footer.selected`) says the count, "(some not shown)" when selected rows are off the page, and offers "Select all N rows" (`selection.allFiltered`) once every row of the page is ticked and more rows match, and "Clear selection". No second live region: its text is plain, the user's own selection is said by the grid's announcer.
