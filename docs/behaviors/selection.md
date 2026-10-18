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
- With pages in the browser, the header box and Ctrl+A select the rows of the page (to be revisited with the pager, step 17); `selection.allFiltered` selects every row the filters and the search match, on every page, as *everything except these*, tied to them (another filter, search or zone clears it). Like any everything-except selection, it also selects rows added later that match (accepted, owner decision Q3, 2026-10-18). Without pages it is the displayed rows.
- For server models (Phase 3) *select all* is stored as *everything except these*, so it costs nothing at ten million rows; on server pages the header box and Ctrl+A select the whole query, and the box shows the state of the whole query (see `server-selection.md`).
- The selection the user makes is said with its count; a selection cleared because the filters changed is said too. `selection.keepOnFilter: false` clears the selection on any filter or search change (see `server-selection.md`).
- Screen readers read the state on the row (`aria-selected`); the row checkbox is decorative.
- A Shift range whose anchor is no longer displayed is cancelled, never reinterpreted on other rows.

## Tests
`conformance/cases/selection/*`, `conformance/cases/selection-across-pages/*`, `packages/core/test/selection-scope.test.ts`, `packages/dom/test/server-select.test.ts`.
