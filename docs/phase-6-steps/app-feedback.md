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
29. Loading overlay shows only the word « Chargement… »: the app had to draw its own spinner; give the theme a default spinner (reduced-motion aware).

## The owner's third look (2026-10-27, light and dark)
30. Date period popup: « I don't understand why the input covers half the field » — DU / AU drew a box inside the box.
31. « tzslot puts the focus on the start date when it opens; when I open, the focus is on nothing. »
32. After a filter, « I don't know what is happening » (client-side, instant). Owner: both — a filtered count in the footer and the active icon on the header, and a brief spinner (decisions.md « Feedback after a client filter »).
33. The default spinner (29) in DzGrid, reduced-motion aware; the app drops its own.
34. The last column struggles for space (the trash at the grid's edge); a horizontal scroll at ~1 880 px of grid, « Nom du produit » sliding under the pinned « Code-barres » and looking cut.
35. Near-invisible scroll bars, no library, no JS (decisions.md « Comfort stylesheet »).
36. The action icons sit above the row's vertical centre.
37. Not ours: product names in mojibake (« NÂ°9 - BÅ"uf »), UTF-8 read as Latin-1 in the data: for the app session.

## Status after the third look (2026-10-27)
- 30 done (DzGrid): the half width was tzslot's own CSS (`.tz-dateinput__input{width:8.5rem;flex:0 1 auto}`); the period form undoes it outside the layer (`.dzg-fends .tz-dateinput__input{flex:1;width:0}`) and the theme rings the field's box only (`.dzg-fpop .tz-dateinput__row:has(:focus-visible)`, the input inside excluded). tzslot request T12 (`docs/tzslot-requests.md`).
- 31 done (DzGrid): while the date kit loads the focus waits on the form, then goes to FROM (it went to the hidden « Condition », so nowhere); Escape and the return to the header unchanged. A focus moved away meanwhile is left alone.
- 32 done: the count and the funnel already existed (`count.filtered`, `[data-dzg-filtered]`); the app says « {filtered} produits sur {total} »; the header search box's magnifier now turns to the accent when filtered (theme). `filters({ busyFlash: 300 })` (opt-in): `aria-busy` on the grid's root for that long after each change, one timer, nothing blocked.
- 33 done (DzGrid, comfort sheet): `dzgrid.comfort.css` draws the spinner over « Chargement… » and over the rows during a flash; it turns only under `prefers-reduced-motion: no-preference` and not `data-motion=off`, still otherwise. The app's own spinner CSS is gone.
- 34 done: the horizontal scroll was a DzGrid bug — flexible columns shared the whole view and the selection boxes' 40 px came on top (always 40 px of scroll); fixed in `render/viewport.ts`. The app: actions 118 → 148 px (four 26 px buttons, 2 px apart, 15 px each side), still pinned at the end; « Nom » `flex: 2` (min 220) and « Marque » `flex: 1` (min 140). The theme draws a line at the pinned columns' edge, so a column passing under them reads as passing beneath. Chrome at 1 920 × 900: the grid 1 888 px, scroll width = client width (1 886), the trash 23 px from the cell's end.
- 35 done (DzGrid, comfort sheet): `scrollbar-width: var(--dzg-scrollbar, thin)`, the thumb in `--tz-border` on a clear track, `--tz-fg-muted` under the pointer or the focus; Safari by `::-webkit-scrollbar`; forced colours the system's; `--dzg-scrollbar: auto` the system's back. On when the sheet is imported (the default of the sheet); the base theme unchanged.
- 36 done in the app: `.acts` a flex box as tall as the cell, centred (Chrome: the buttons' middle 0.5 px from the row's, 2.5 px before).
- 37 noted for the app session (not changed).

## The owner's fourth look (2026-10-27, light theme)
38. With rows ticked, the footer's « Sélectionner les 1604 lignes » and « Effacer la sélection » in tiny ~32 px boxes, their words wrapping over each other and over « 1 à 100 sur 1604 ».
39. A horizontal scroll bar still at full width, 100 rows a page, the vertical bar present, the actions at the end.
40. (Coordinator, same push) The app's layout tools from Phase 6: move columns (drag, Ctrl+Shift+arrows), resize and auto-size, the ⋮ menu (right-click, Shift+F10), the chooser from a « Colonnes » button, the layout kept across reloads per view mode, « Réinitialiser la disposition »; the box and actions columns fixed.

## Status after the fourth look (2026-10-27)
- 38 done (DzGrid, theme): the selection's two actions are `button.dzg-pbtn` like the pager's arrows, so the second look's square (`.dzg-pbtn{padding:0;inline-size:2rem}`) took them too. The square is now `[data-go]`'s (the nav buttons'); the footer buttons' shared rule adds `white-space: nowrap`; their size is their words' (the theme's `font: inherit` already undoes the layout's 1.25em for the arrows). K.8 kept at 84 449 / 84 450 by two merges in the theme (the set list's focus offset into the cells' focus rule; the pager's and the overlay's focus rules into one). Tests: `packages/theme/test/owner-look-4.test.ts` (4 failing before), `owner-look-2.test.ts` (one expectation superseded), Chrome `--only pagination` `footerSelectionChecks` (6 failing before): the pager 32 × 32, the two actions on one line, nothing overlapping, 1 000 and 400 px, fr light, ar RTL dark, fr dark.
- 39 not reproduced, not a DzGrid bug found: the app's columns, the boxes, 1 920 px, real scroll bars (`--hide-scrollbars` off; thin 11 px and the system's 15 px), rows arriving after « Chargement… », 20 → 100 a page, the page ticked, all ticked, hover, device pixel ratios 1–2.5 and fractional grid widths: scroll width = client width every time (1 875 / 1 875 thin, 1 871 / 1 871 system). jsdom guard `packages/dom/test/owner-look-4.test.ts` (11, 15, 17 px gutters): passed at once. Most likely the app's dev server still served the packs from before the third look's 40 px fix (`dzgrid-integration` installs 0.3.1-local.20261027192354, which has it); otherwise a grid narrower than the columns' minimum (now 1 546 px + 40 + the bar with the fourth look's widths): a scroll there is right.
- 40 done in the app (no DzGrid change): `gridState({ persist })` under `allergie-admin:products-dz:layout:<view>`, `columns()`, `columnsChooser()`, `columnMenu({ use: { columns, chooser } })`; one grid per view and per reset (`@for` keyed); « Colonnes » (the bundle's `chooser.list`) and « Réinitialiser la disposition » in the filter bar; the actions column `movable: false, hideable: false, menu: false, chooser: false`, pinned at the end; the short columns 28 px wider for the ⋮ (whole titles, measured), « Code-barres » 176 for its search box. The chooser's footer buttons drawn by the app's DzGrid block (the theme leaves them to the browser's look, which Tailwind's preflight removes; the columns-panel line has 9 B left). Playground `owner-look.html?cols=1` (`&lang=ar`, `&theme=dark`): screens `polish4-columns-*`.
- Gap noted (DzGrid, not changed: K.8 has 1 B): a popup placed against the window's start edge sits at 0 px (the 8 px inset of the second look is the end edge's only). Not met in the app: « Colonnes » sits at the end of its bar.

