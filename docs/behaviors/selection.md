# Selecting rows

## What the user does
Clicks a row; Ctrl- or Cmd-clicks; Shift-clicks; presses Space on a row; presses Ctrl+A (Cmd+A on a Mac); ticks the header box.

## What they observe
- A click selects one row, Ctrl/Cmd toggles, Shift selects a range in the order on screen.
- Space toggles the focused row; Ctrl+A selects all.
- The header box selects all the rows displayed after the filters, and shows ticked, unticked or partly ticked.
- The selection survives sorting and filtering.

## What DzGrid does
- Selection is by row id, never by position.
- In the client model, *select all* selects the displayed rows (D8): rows hidden by a filter are not selected.
- With pages in the browser, the header box and Ctrl+A act on the page shown only (owner decision Q1 of step 17, closing Q2 of step 7): ticking adds the page's rows to the selection (`selection.all`, then `selection.allDisplayed`, is a union with what is selected when the rows are paged; rows ticked on other pages stay), unticking a fully ticked page removes the page's rows only (`selection.set`, one announcement), the other pages untouched. The footer (`pagination-footer.md`) says "N selected (some not shown)" and offers "Select all N rows" and "Clear selection". `selection.allFiltered` selects every row the filters and the search match, on every page, as *everything except these*, tied to them (another filter, search or zone clears it). Like any everything-except selection, it also selects rows added later that match (accepted, owner decision Q3, 2026-10-18). Without pages it is the displayed rows.
- What it is tied to is what the browser applies: a half-typed filter (an empty box, a `between` with one bound), a refused one or a blank search is no filter, and keeps it, as on a server. A filter that starts to apply clears it.
- Over such an all-pages selection, Ctrl+A ticks the unticked rows again, on every page: the selection stays *everything except*, empty; it never shrinks to the page, which would drop the rows of the other pages without a word. The same holds for `selection.all` from the API whenever the selection is a tied everything-except. On browser pages the box (partly ticked once a row of the page is unticked, unticked once all are) ticks that page's rows again only: they leave the excluded keys, rows unticked on other pages stay unticked, the selection stays *everything except* and tied (`selection.set`, one announcement; owner decision Q4 of step 17). On server pages the box keeps acting on the whole query. With an include selection the box and Ctrl+A add the page (step 17); unticking a fully ticked page over an all-pages selection unticks that page's rows only (they join the excluded keys).
- Its count is exact: the rows that match, less the unticked ones that match now. An unticked row the filters hide, or that a host update moves out of them, takes nothing away; one that moves back in counts again.
- For server models (Phase 3) *select all* is stored as *everything except these*, so it costs nothing at ten million rows; on server pages the header box and Ctrl+A select the whole query, and the box shows the state of the whole query (see `server-selection.md`).
- The selection the user makes is said with its count; a selection cleared because the filters changed is said too. The same sentence is not said twice in a row, unless the live region said something else in between (an error, a sort, the host's `api.announce`): then it is news again. `selection.keepOnFilter: false` clears the selection on any filter or search change (see `server-selection.md`).
- Screen readers read the state on the row (`aria-selected`); the row checkbox is decorative.
- A Shift range whose anchor is no longer displayed is cancelled, never reinterpreted on other rows.
- **Selection rules** (step 21, `selection-rules.md`): with `settings.selection.canSelect` and `rules()`, every addition is vetted (unticking never is); refused rows are skipped, a command adding nothing changes nothing, the refusal is said. Under a rule the header box and Ctrl+A act on the rows shown (server pages too), and "select all matching" (everything-except) is refused.

## Tests
`conformance/cases/selection/*`, `conformance/cases/selection-across-pages/*`, `packages/core/test/selection-scope.test.ts`, `selection-scope-bugs.test.ts`, `selection-scope-gaps.test.ts`, `selection-scope-property.test.ts` (six models, random scripts), `packages/dom/test/server-select.test.ts`, `server-select-bugs.test.ts`, `server-select-gaps.test.ts`; the box on browser pages (step 17): `conformance/cases/selection-across-pages/box-union-browser-pages.json`, `packages/dom/test/pagination.test.ts`. Rules (step 21): `conformance/cases/selection-rules/*`, `packages/core/test/kernel-gate.test.ts`, `packages/dom/test/rules.test.ts`.
