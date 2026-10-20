# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing published yet. Phase 0 laid the ground: clean-room rules, the
architecture, the core's seed (row identities, calendar days apart from
instants, the bounds of a day in a zone), conformance cases written by hand,
and ten spikes in three browser engines.

### Added (Phase 3, step 21: selection rules, the application's context, header parts driving the filter)

- **Selection rules:** `settings.selection.canSelect(row, selection, context)` (live) returns true,
  false, or a reason string; with the new optional entry `@dzgrid/dom/rules` (`rules()`) every addition
  is vetted (click, Space, Shift, Ctrl+A, the header box, the footer, the API); unticking never is.
  A refused row keeps its state; a command adding nothing changes nothing; a new event
  `selectionRefused { source, rows, reason, cause }` follows `selectionChanged`. The refusal is said
  ("Not selectable", the rule's own sentence, "6 rows selected, 2 not selectable"), every time; the
  refused row's box is greyed (`data-dzg-refused` on `.dzg-check`), no `aria-disabled`. Texts in
  `@dzgrid/dom/locales/{en,fr,ar}-rules` (`RULES_KEYS`). The pure vetting: `@dzgrid/core/rules`
  (`vetSelection`). The kernel's gate seam through `@dzgrid/core/internal` (`setSelectionGate`).
- **The application's context:** `settings.context` (live) reaches every part (`context`), the selection
  rule, `canExport` / `exportAll` and the tooltip callback; a new identity updates each part once.
- **Header parts driving the column filter:** with `slots()` and `filters()`, the `header` context gains
  `filter` (`kind`, `state`, `where`, `debounceMs`, `set`, `canOpen`, `openFilter`), the same pending
  edit as the floating box and the popup; the header cell's keys follow the floating row's (one tab
  stop, Enter or F2 in, Escape out, applied on leaving), now shared in `@dzgrid/dom/internal`.
- A ready header part `header.filterBox` (with `filters()` and `slots()`): the column's name and its
  floating box in the header itself.
- A problem code `selection-refused` (a host's `selection.set` refused under a rule).

### Changed (step 21)

- **Fail closed:** `canSelect` without `rules()` is an error problem (`missing-feature`, path
  `settings.selection.canSelect`, detail `rules`) and the selection mode becomes `none`.
- Under a rule the header box and Ctrl+A act on the rows shown, server pages included; "Select all
  N rows" is not offered; an everything-except selection is refused (`needs-rows`).
- Enter on a column header whose part takes the focus goes into the part instead of sorting.

### Added (Phase 3, step 17: pagination)

- A new optional entry `@dzgrid/dom/pagination`: `pagination({ footer })`, a footer under the rows
  with three parts of the new `footer` slot: `footer.pager` (first, previous, "Page 3 of 20",
  next, last, rows per page, in a named `<nav>`; disabled buttons are `aria-disabled`, never
  `disabled`; no last button by cursor), `footer.count` ("51 to 100 of 1 234", "51 to 100" with an
  unknown total) and `footer.selected` ("12 rows selected (some not shown)", "Select all N rows",
  "Clear selection"). The page change is said once the rows are in (`announce.page`), the rows go
  back to the top, the focus stays on the button. Texts in their own bundles
  `@dzgrid/dom/locales/{en,fr,ar}-pagination` (16 keys, `PAGINATION_KEYS`); `pagination()` throws
  naming any missing key. A host's part of the same name replaces each.
- A new entry `@dzgrid/dom/internal`, shared by the feature entries (slots, filters, search,
  pagination): what more than one of them needs (`mounted`, `settled`, `composing`). Not a public
  API; the base never imports it.

### Changed (step 17)

- **The header box and Ctrl+A on browser pages act on the page shown only** (owner decision): ticking
  adds the page's rows to the selection, unticking a fully ticked page removes only its rows; rows of
  other pages stay. `selection.all` and `selection.allDisplayed` add the displayed rows to an include
  selection while the rows are paged (they replaced it before). Server pages are unchanged.
- Paging on (the `pagination` setting, or a source's pages) without `pagination()` is told:
  `missing-feature` (warning, `settings.pagination`, detail `pagination`). `pagination()` on rows
  that are not paged is dormant and told (`invalid-page`, warning, `features.pagination`).
- The overlay stops above the footer (`inset-block-end: var(--dzg-footer-size, 0px)`).

### Added (Phase 3, step 16: the quick search box)

- A new optional entry `@dzgrid/dom/search`: `quickSearch()`, a feature that binds the page's own
  search fields (`search.bind(input, { debounceMs })`, returning the unbind). A pause (150 ms in the
  browser, 300 ms on a server), the text trimmed, Enter applies, Escape empties, ArrowDown moves into
  the grid, input methods respected; the grid's search rewrites every bound field; "N rows" said after
  a pause (the existing `announce.rows`, no new text); the search prepared in idle time on the first
  focus of a bound field (browser only). Only absent attributes are set on the field, and given back
  at unbind (`aria-controls`, `dir="auto"`, `autocomplete`, `enterkeyhint`, `spellcheck`); its name
  stays the host's. No `bindQuickSearch` (the plan's name).

### Changed (step 16)

- The filter boxes (floating row, popup) ignore Enter and Escape inside an input method also when the
  browser reports it only as key code 229 (Safari).

### Changed — breaking (Phase 3, step 15: the value-list filter)

- `filters()` now needs 8 more texts, in the filter bundles `@dzgrid/dom/locales/{en,fr,ar}-filters`:
  `filter.set.search`, `filter.set.all`, `filter.set.allShown`, `filter.set.blanks`,
  `filter.set.option`, `filter.set.count`, `filter.set.truncated`, `filter.set.failed` (loading and
  Retry reuse the base's `grid.loading` and `grid.retry`). A host that spreads the shipped bundles
  has nothing to do; a host with its own filter texts must add them, or `filters()` throws a
  `TypeError` naming each missing key when the grid is made.

### Added (step 15)

- The value-list filter in the popup (`@dzgrid/dom/filters`, part `filter.set`): a search box, a
  status line, select all (shown), blanks, and an always windowed `listbox` of up to 2 000 values
  with their counts, keyboard and type-ahead; live with a pause in the browser, a draft sent at
  Apply on a server; the column's `enumOptions` when a source has no `values`. Only for a column
  that asks for it with `filter: { kind: 'set' }`: enum columns keep their behaviour (no button by
  default). Loaded on first use (a lazy chunk); option `filters({ loadSet })`.
- The `filter` part context gains `values(o?)`, the column's `kernel.values` handle.

### Changed — breaking (Phase 3, step 14: date filters on tzslot)

- `filters()` now needs 13 more texts, in the filter bundles `@dzgrid/dom/locales/{en,fr,ar}-filters`:
  `filter.op.onDay`, `filter.op.notOnDay`, `filter.op.betweenDays`, `filter.op.before`,
  `filter.op.after`, `filter.op.onOrBefore`, `filter.op.onOrAfter`, `filter.date`,
  `filter.dateTime`, `filter.period`, `filter.zone`, `filter.loadingDates`, `filter.loadFailed`
  (Retry reuses the base's `grid.retry`). A host that spreads the shipped bundles has nothing to do;
  a host with its own filter texts must add them, or `filters()` throws a `TypeError` naming each
  missing key when the grid is made.
- New **optional peer dependencies** of `@dzgrid/dom` and `@dzgrid/angular`: `@tzslot/dom` and
  `@tzslot/core` `>=2.2.0 <3` (`peerDependenciesMeta`: optional). An application with date filters
  installs them; without them a date filter's popup says the calendar could not be loaded. They are
  fetched with `import()` the first time a date filter opens, so a grid without one loads nothing.
- With `filters()` day and instant columns get a filter button in their header (and
  `aria-keyshortcuts`), and their floating summary becomes a button opening the popup.

### Added (step 14)

- Date filters in the popup (`@dzgrid/dom/filters`): parts `filter.day` and `filter.instant`, on
  tzslot 2.2.0's date, period and date-and-time fields, in the grid's zone, locale and digits; the
  six relative shortcuts (today, yesterday, last 7 days, last 30 days, this month, last month) in the
  whole-day period forms; loading, failure and Retry; the filters feature calls `kernel.tick()` at
  midnight in the grid's zone while a shortcut is in force. Options `filters({ loadDates, dateMessages })`.
- The `filter` part's context gains `today` (the grid's day by its clock and zone): an open popup
  follows midnight. A date kit's `DateAdapter` gains `grid` (the grid's root element).
- The core (part A): `RelativeRange`, `RELATIVE_RANGES`, `relativeDays`, `dayAt`, the `relative`
  operator for day and instant filters, the clock as numbers (`clientRows({ now })`, `ModelEnv.now`,
  `WireEnv.now`), `model.tick()` and `kernel.tick()`; the DOM setting `clock`.

### Changed — breaking (Phase 3, step 13: the filter popup)

- `filters()` now needs 22 more texts, in the filter bundles `@dzgrid/dom/locales/{en,fr,ar}-filters`:
  `filter.popupLabel`, `header.withFilter`, `filter.op`, `filter.value`, `filter.valueTo`,
  `filter.apply`, `filter.op.<op>` for the 13 operators (`contains`, `notContains`, `equals`,
  `notEqual`, `startsWith`, `endsWith`, `blank`, `notBlank`, `lt`, `lte`, `gt`, `gte`, `between`),
  `filter.all`, `filter.yes`, `filter.no`. A host that spreads the shipped bundles has nothing to
  do; a host with its own filter texts (written for step 12) must add them, or `filters()` throws a
  `TypeError` naming each missing key when the grid is made.
- With `filters()` every column with a `filter.text`, `filter.number` or `filter.boolean` part gets
  a filter button in its header, `aria-keyshortcuts="Alt+ArrowDown"`, and its own name as
  `aria-label`; `filters({ popup: false })` turns the button and the popup off.
- A floating row's summary ("Filter active") is a button opening the popup when the column has one;
  the custom `floating` part context gains `canOpen` and `openFilter()`.

### Added (step 13)

- The filter popup (`@dzgrid/dom/filters`): text and number with their operators (`filter.ops` on a
  column narrows them), between with two fields, boolean all / yes / no; live in the browser, a
  draft sent by Apply on a server; Alt+ArrowDown; the filtered mark (`data-dzg-filtered`, and
  "…, filtered" in the header's name); `openFilter(column)` / `closeFilter()` on the feature; the
  `filter` slot (`filter.<kind>` parts) and `FeatureHandle.decorateHeader`.
