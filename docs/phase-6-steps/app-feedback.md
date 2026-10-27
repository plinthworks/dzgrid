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
