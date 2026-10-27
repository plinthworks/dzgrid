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


## The owner's second look (2026-10-27, light theme)
23. Date period popup: « why dd/mm/yyyy? » DU and AU could sit on their input's row; widen the popup a little; no placeholder (or in capitals). The English `dd/mm/yyyy` in a French app was an i18n bug of its own (tzslot's `patternFor` lower-cased). « Période » over « DU » is redundant. The popup's end still touched the window's edge.
24. Pagination: « the buttons are a bit weird, they are not squares » (24 × 32 px measured); « Page 1 sur 1 » cramped.
25. « No spinner showing that a request went through »: the app's own overlay (a Tailwind `animate-spin` next to the grid) did not show.
26. Set filter: « 639 valeurs » crammed between the search box and « Tout sélectionner » (0 px apart under Tailwind's reset of `p` margins).
27. The header select-all box drawn as a tall rounded pill (the rows' boxes too): 10 × 16 px measured.
28. With « Mis à jour » filtered, 0 rows (« Aucune ligne ne correspond aux filtres »): does the inline period match rows?

## Status after the second look (2026-10-27)
- 23 done (DzGrid): FROM / TO a two-column grid (labels, then fields; tzslot's field `display: contents`, its unlayered column undone by two classes), no placeholder (no hint at all: none to localise), the form's « Période » label hidden by the period's own sheet (the group keeps the name « Période »), the form at least 18rem; every popup placed 8 px inside the window's end edge (was 0). Tests: `owner-look-2.test.ts`, `owner-look.test.ts` (two expectations superseded).
- 24 done (DzGrid, theme): pager buttons 2rem × 2rem, no padding, the glyph centred; the footer's gaps .5rem (around the page words too). Chrome: 32 × 32, 8 px apart.
- 25 done in the app: DzGrid already has the state (`overlay: 'loading'`: « Chargement… » over the rows, `aria-busy` on the grid, announced). The app binds `[overlay]="loading() ? 'loading' : null"`, drops its own veil, and draws a spinner from its DzGrid block (`.dzg-viewport[aria-busy=true] ~ .dzg-overlay::before`, slower under reduced motion). Gap, small: DzGrid draws no spinner of its own (words only).
- 26 done (DzGrid, set chunk): the set form a grid with .5rem gaps; the count line without a margin of its own. Chrome: 8 px each side.
- 27 done (DzGrid, theme): `.dzg-box { flex: none }`: an app's 15 px cell padding in the 40 px column shrank the flex item to 10 px wide. Chrome: 16 × 16 in the header and the rows.
- 28 not a DzGrid bug: tests with the app's instants (microseconds, `Z` and `+02:00` offsets), a range picked in the calendar and typed, `apply: 'button'`, Paris and Los Angeles, the end day kept whole, and paged at 20 a page from page 4: the right rows each time; Chrome on `owner-look.html` the same (120 rows for 5–6 October). Most likely the period picked held no update: the production table has only 30 distinct `updated_at` values (noted in the app's repository). The owner checks with a period around a date seen in the column.
