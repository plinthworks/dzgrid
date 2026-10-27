# Feedback from apps using DzGrid

## allergen-detector, products admin screen (2026-10-27; 1 604 rows, 11 columns, Playwright-measured)

1. Pagination arrows never drawn: `pagination/pager.ts` buttons `data-go="first|prev|next|last"` have no content and the theme gives no glyph (24×32 px, empty, transparent): users see no pagination. BUG.
2. No inline mode for the period widget: inside the filter popup, tzslot's `tz-range-field` (FieldMode 'popup'|'dialog') opens a second panel on top, overflowing. Need an inline FROM/TO + one-month calendar form (a tzslot `'inline'` mode request, or a DzGrid composition).
3. The « Condition » select shows for a single operator (`ops: ['betweenDays']`).
4. Customising only the set filter's option row costs a whole custom filter kind (~170 lines): want a `filter.set` option-row part (value, label, count given).
5. A column's `ui` has a closed shape: data for a custom filter part (e.g. `pillOptions`) never reaches the part, silently. Want a pass-through bag.
6. Header parts need `slots()` in features, silently: want a `part-ignored`-style problem when a column names a header part and the feature is absent.
Angular guide notes: `[slot]="'header'"` must be a binding (a static `slot="header"` never reaches the signal input); `content: '«'` in .scss came out empty from the Angular build — use escapes (`\00AB`).
Earlier (same app): fr `filter.clear` « Effacer le filtre {column} » wraps the footer with long column names.

## Review of the app's DzGrid screen (2026-10-27, read-only) — possible DzGrid issues
7. `--dzg-row-height` set in CSS has no effect (only the `rowHeight` setting works): document or support.
8. Unchecked checkboxes are invisible in the light theme (the app had to add CSS): check contrast of the native checkbox in the theme.
9. Scoped (component) styles do not reach parts rendered in the top-layer popup: document how to style popup parts (global CSS, or a class hook).
10. A header part cannot drive the filter engine (the app's header search bypasses filters, state, chips, clear-all, and swallows sorting): a header part should be able to set the column's filter.

## From the integration (dzgrid-integration 40f9081, 2026-10-27)
11. `filterOption` part replaces the grid's own checkbox: the app redraws it. Keep the box and let the part render only the label area (or an option).
12. The count in a `filterOption` part has to be drawn through CSS `attr(data-n)`: give it in the part context as text.
13. `dateCalendar` is grid-wide: allow it per column (`filter.calendar`).
14. `header.filterBox` leaves a second filter button on the column: hide the button when the header box drives the same filter (or option).
15. Packaging: local repacks keep version 0.3.0, so lockfiles keep stale hashes and peers. Local packs should carry a unique prerelease version (e.g. 0.3.1-local.<n>).
16. Behaviour: the set filter applies a tick after a short pause (the old custom one waited for « Appliquer »): owner to confirm.

## Owner's look at the integrated screen (2026-10-27, dark theme, screenshots)
17. Set filter: TWO checkboxes per row (grid box + app's part box) — bug of the `filterOption` integration.
18. Popup not airy: cramped rows, big empty area, « Rechercher des valeurs » as a label instead of a placeholder, raw native input with the browser's blue focus ring, native blue checkboxes; colours off the app's brand.
19. Footer « Effacer / Appliquer » are bare text, not buttons.
20. Filters apply before Appliquer / closing (set ticks and date picks): the owner wants nothing applied until « Appliquer » (or Enter).
21. Date popup: « Fuseau horaire Europe/Paris » line is noise for a single-zone app; the popup overflows the window edge (cut on the right: Sunday column, « Appliquer », the next-month arrow); empty FROM/TO boxes look unfinished.
22. Header search: the input is squeezed beside the title, unstyled; the owner wants the search field to TAKE THE PLACE of the title (magnifier icon + the column name as placeholder), and no second filter button on that column.
Owner question answered: the screen filters client-side (all 1 604 rows are loaded, filtering is in the browser).

## Status after the owner's look (2026-10-27)
- 11 done: the grid keeps its box; a `filterOption` part paints the label area only (its host `inert`: review finding 4 closed).
- 12 done: the count is the grid's again (drawn after the part, inside the row's name); no `attr(data-n)` in the app.
- 13 not done: `dateCalendar` stays grid-wide (no app need on this screen).
- 14 done: no filter button on a `header.filterBox` column.
- 15 done: local packs are versioned `<version>-local.<n>` (see STATUS).
- 16 answered by the owner (20): `filters({ apply: 'button' })`; `'live'` stays the default.
- 17, 18, 19, 20, 21, 22 done: one box, airy rows (2.25rem), the list as high as its rows (≤ 18rem), « Rechercher… » as placeholder, Apply the primary button, boxes in the accent, `apply: 'button'`, every popup kept inside the window (`ResizeObserver`, vertical clamp), `dateZone: false`, FROM / TO placeholder `dd/mm/yyyy`, the header box in the title's place with a magnifier. Budgets raised by the owner (decisions.md « Owner's-look budgets »).

