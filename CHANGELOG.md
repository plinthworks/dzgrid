# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing published yet. Phase 0 laid the ground: clean-room rules, the
architecture, the core's seed (row identities, calendar days apart from
instants, the bounds of a day in a zone), conformance cases written by hand,
and ten spikes in three browser engines.

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
