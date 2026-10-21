# Showing and hiding the floating filter row

Sources: the public documentation of grids with a filter row under the headers (a setting that
shows or hides it), WAI-ARIA 1.2 (`aria-rowcount`, `aria-rowindex` of header rows), WCAG 2.2
(2.4.3 focus order, 3.2.2 on input, 4.1.3 status messages). Phase 4 plan step 12; owner decision Q8
("Oui aux deux"). Until now the row is fixed when the grid is created (step 12 of Phase 3,
`filter-ui.md`).

## What the user does
Presses the host's "Filters" button to hide the row of filter fields under the headers, then to
show it again; types in a field first, or leaves the focus in it, then hides the row.

## What they observe
- The row disappears and the rows of data move up by its height; pressed again, it comes back.
- A filter typed in the row keeps filtering while the row is hidden; the column's header keeps its
  "filtered" mark, so they can see why rows are missing.
- Text typed but not yet applied (the short pause before a filter applies) is applied when the row
  hides, not lost.
- If the focus was in the row, it goes to that column's header.
- Shown again, each field shows the filter in force, as it was; nothing is applied twice, no
  sentence is said for it.
- The host's button tells whether the row is shown (pressed / not pressed).

## What DzGrid does
- **API**: `filters().floating` — `get()` (shown or not), `set(on)`, and `bind(button)`, which
  makes the host's button a toggle: a click calls `set(!get())`, the button gets
  `aria-pressed` and `aria-controls` (the grid), and follows changes made by the API. Angular:
  `[floatingFilters]` on `<dz-grid>` (two-way with an echo guard).
- **Hide**: a pending edit in a field is flushed first (it applies as if the pause had ended); a
  focus inside the row moves to the same column's header cell; then the row is removed from the
  header rows. The filters stay in the query. Nothing is emitted for the hide but the change of
  `floating`.
- **Show**: the row is built again from the filters in force, without emitting a filter change and
  without saying "Filtered".
- **ARIA**: `aria-rowcount` and every `aria-rowindex` below are recomputed (one header row less or
  more), so screen readers count right; the header mark ("Filtered", `filter-ui.md`) is the
  non-visual and visual cue that filters still apply.
- **Right-to-left**: nothing to mirror beyond what the row already does; tested in Arabic.
- **Size**: within `@dzgrid/dom/filters` (+150–250 B, its budget 10 000 held).

## Where DzGrid differs on purpose
- Hiding the row never clears a filter: clearing is a separate act (the field's clear button, the
  popup, the API), so hiding cannot silently change what is shown.

## Tests (to be written with the code)
Step 12: `packages/dom/test/floating-toggle.test.ts` — `get`/`set`/`bind` (aria-pressed follows the
API), filters still active and marked when hidden, a pending edit flushed on hide, focus moved to
the header, show restores the inputs without an event or a sentence, `aria-rowcount` and
`aria-rowindex` before and after, RTL; browser axe with the row hidden and shown (French, Arabic);
Angular `[floatingFilters]` echo guard.
