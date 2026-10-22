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
  `aria-pressed` and `aria-controls` (the grid, given an id `dzg-g<n>` when it has none), and follows
  changes made by the API or another bound button; a button with no words of its own (an icon) is named
  by the bundle (`filter.floatingToggle`, « Ligne de filtres »), kept in the grid's language; a button
  with its own words keeps them (WCAG 2.5.3). `bind` returns the unbind (listener and marks removed).
  `get`, `set` and `bind` work before the grid exists: a `set` made before is the state it starts with.
  Like `openFilter`, the state belongs to the feature object and acts on the last grid it was set up on.
- **Which fields**: as before (`filter.floating`, else `filters({ floating })`); when neither asks on
  any column (the row starts hidden), showing it gives every filterable column its field.
- **Angular**: `[floatingFilters]` on `<dz-grid>` (owner decision Q16, budget 6 250): one-way, host →
  grid, live. Unset, the feature's own state; each new value is `set()` on the `filters` feature among
  `[features]` (duck-typed: the wrapper does not import `@dzgrid/dom/filters`), only when the input
  changes, so a user's toggle made since is never overwritten (no echo). Not said. A host wanting the
  state back reads `filters().floating.get()` (or a bound button's `aria-pressed`).
- **Hide**: the grid's focus on the row (its cell, a box, a popup opened from it) moves to the same
  column's header cell (source `user` for a bound button, `api` for `set`); the row leaves the header
  rows; in that paint a pending edit in a field is applied (as if the pause had ended, its timer
  cancelled) and a DOM focus that was in the row lands on the header. A popup opened from the row
  closes with it; one opened from the column header stays. The filters stay in the query. No event:
  `floating` is not a kernel state (the host knows it from its own calls and the button's
  `aria-pressed`).
- **Said**: the user's toggle (a bound button) only: « Ligne de filtres masquée » / « Ligne de filtres
  affichée » (`announce.floatingHidden` / `announce.floatingShown`); never for `set()`.
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

## Tests
Step 12: `packages/dom/test/floating-toggle.test.ts` (30, written first, all failing before the code) —
`get`/`set`/`bind` before and after the grid, unbind, two buttons, the label and sentences in French and
Arabic, filters still active and marked when hidden, a pending edit applied on hide (timers mid-flight),
focus moved to the header (box, cell, grid focus without DOM focus, popup from the row), its source,
show restores the inputs without an event or a sentence, `aria-rowcount` and every `aria-rowindex`
before and after (with group rows), the view's height read again, column moves and inline scroll while
hidden, RTL, and a walk (40 seeds × 40 steps: toggles, typing, pauses, popups, moves, scrolling).
Browser (`npm run test:browser -- --only filters`, Chrome): French light (icon button) and Arabic right
to left dark (groups, pins, box column): both states axe 0, rowindex and rowcount, the body right under
the header, cells aligned, rows down to the bottom, the last row reachable while hidden, focus moved,
sentences; the tree page: pinned parents right under the header rows and aligned in both states.
Angular: `packages/angular/test/floating-filters.test.ts` (5; 3 failing without the input).
By ear: `docs/a11y-protocol.md` §18.
