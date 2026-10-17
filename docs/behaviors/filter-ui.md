# The filter user interface

## What the user does
Types into a box under a column header; clicks the filter button in a header, or presses Alt+ArrowDown on it; picks an operator, a day, or ticks values in a list; presses Escape.

## What they observe
- A row of filter boxes under the headers, for the columns that ask for one: text and number columns get a box that filters as you type; the others get a summary button that opens the column's popup.
- The filter popup sits under the header and holds the column's filter: an operator and a value for text and number, all / yes / no for a boolean, an operator and one or two dates for a day or an instant, a searchable checklist for a value list.
- The value list has a search box, "select all (shown)" and "blanks". When the server filters, it waits for an Apply button; everywhere else a change applies at once.
- A filtered column shows a mark in its header, and its name says so.
- Escape closes the popup and puts focus back where it opened from. Inside a filter box, arrows, Home, End, Ctrl+A, Enter and Space edit the text and never move through the grid.
- The new row count is announced.

## What DzGrid does
- Matching rules are not repeated here: see `filter-text.md`, `filter-number.md`, `filter-day.md`, `filter-instant.md`, `filter-misc.md`.
- **Floating row:** off by default, turned on per column (`filter.floating`) or for the grid (`filters({ floating })`). It is a header row (counted in `aria-rowcount`), its cells in the grid's roving order. Enter or F2 goes into the box, Escape back to the cell. Boxes are labelled `filter.inputLabel {column}`.
- **Live apply with a pause:** 300 ms when the filter runs on the server, 150 ms in the browser; `filter.debounceMs` overrides it. A number the locale cannot read (`1,5` is 1.5 in French) gets `aria-invalid` and is not applied.
- **Summary button:** for day, instant, boolean, set and custom kinds without a `floating.<kind>` part; a custom kind's reads `filter.summaryActive {column}`.
- **Popup:** opened by the header filter button (a target of at least 24 px) or by Alt+ArrowDown on the header (`openMenu`, owner `header`). Clicking the button never sorts. Operators follow the column type, narrowed by `filter.ops`; "Clear" empties the column's filter. A second condition with AND/OR may be cut to Phase 5 (the model keeps `combined`).
- **Value list:** a `listbox` with `aria-multiselectable`, virtualised beyond 2 000 values (`aria-setsize`, `aria-posinset`). Ticking fewer than half gives `include`, more gives `exclude`; the search narrows the list, never the filter. Values come from `enumOptions`, the client's data (with counts, ignoring this column's own filter), or the source's `values()`, where a stale answer is dropped.
- **Day and instant:** the native date input by default (a date-picker adapter can replace it). A wall time that a clock change skips is refused with `filter.timeSkipped`, never shifted.
- **Top layer:** the popup is shown with `popover="manual"` when the browser has it, `position: fixed` in the grid otherwise, so a host card with `overflow` or `transform` cannot clip it. It is a modal `dialog`: focus goes in, Tab stays inside, a pointer down outside does not close it. Escape closes it without reaching a host dialog around the grid, and focus goes back to the anchor; if the anchor left the page (header recycled, column hidden), the popup closes and focus returns to the grid's focused cell.
- **Keys:** a filter box carries `data-dzg-owner="filter-input"` and owns every key; popup controls carry `popup`. A grid inside a host popup still owns its own keys.
- **RTL:** the popup's start edge lines up with the anchor's start edge, on the right in Arabic, and it opens above when there is no room below. It carries the grid's `dir`; inputs follow the logical order.
- **Active mark:** a `data-dzg-filtered` mark on the header plus `filter.active` in its accessible name.
- **Announcements:** the client row count after a change (`announce.filtered {rows}`).

## Tests
- Now: `packages/dom/test/popup.test.ts`, `packages/dom/test/review-p3c.test.ts` (popup host), `packages/dom/test/owners.test.ts`, `packages/dom/test/header-rows.test.ts`, `conformance/cases/keyboard-intent/filter-input-*.json`.
- Header filter button and active mark through the `header` part (planned, step 11).
- Floating row: one `filterChanged` after the pause, `1,5` in French, `aria-rowcount` (planned, step 12).
- Popup text, number, boolean; Alt+ArrowDown and Escape; Tab trapped; announced count; `keyboard-intent` cases for `openMenu` (planned, step 13).
- Day and instant with the native picker (planned, step 14). Value list (planned, step 15). Axe on the popup and the floating row in fr, ar and RTL (planned, step 18).

## Decisions (step 1, 2026-10-17)
- **Names:** the floating row is `filter.floating` per column and `filters({ floating })` for the grid; the date picker is `filters({ datePicker })`. The plan's `floatingFilter` and `adapter` are superseded.
- **Apply button** whenever `filter` runs on the server, fetched set included (B5.6). Pending ticks stay pending until Apply; closing the popup discards them.
- **Where focus returns:** to the popup's anchor — the filter button when it opened from it, the header cell after Alt+ArrowDown. If the anchor left the page, the grid's focused cell.
- **Popup name:** `aria-label`, as the popup host does, from the new key `filter.popupLabel {column}`. No `aria-labelledby` on the header text: the header can be recycled and its name carries the sort state.
- **Initial focus:** the filter part's `focus()` when it returns true, else the first focusable control (the popup host's default). The filters feature calls it after mounting the part.
- **Pointer down outside** a filter popup does not close it (it is modal, as the code does); nothing pending is applied.
- **Summary text:** a value list reads `filter.summarySelected {n}` (plural); every other kind `filter.summaryActive {column}` when active and `filter.summaryNone {column}` when not.
- **Header name:** the filtered state joins the name through `header.withFilter {header}`, applied after `header.withSort` when both hold; `aria-label` is set only when one of them holds, as today.
- **Announcement on a server:** after the accepted answer, `announce.filtered {rows}` with `counts.filtered`; when the server does not know the count, `announce.filteredOpen`. Nothing is said while it loads beyond `aria-busy`.
- **Clear all filters:** only the no-match overlay's `clearFilters()` in Phase 3; a host clears with `filter.set {}`.
- **Escape in a floating box** returns focus to its cell and keeps the typed filter; tested at step 12.
