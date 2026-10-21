# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Tree core (Phase 4, steps 2–3)**: row nodes as a union (`DataNode | GroupNode | DetailNode`), a
  row shape seam in the client model (`ClientOptions.shape`), expansion held by the model and
  commanded by the kernel (`kernel.expansion`, `rows.expand`, `rows.expandAll { expanded, depth? }`,
  event `rowExpanded` with keys only), `ModelChange.kind` `'expand'`.
- **`@dzgrid/core/tree`**: `treeShape({ parentId, filter, initial })` (parent ids; orphans and
  cycles become roots with `tree-orphan` / `tree-cycle`, named by row id; a filter keeps the
  ancestors of matches and opens them without touching the user's set), `treeConflicts`.
- **Tree shapes (Phase 4, step 5)**: `treeShape` / `tree()` take exactly one of `parentId`,
  `children: (row) => T[] | undefined` (nested rows made flat, ids unique over every level, parents
  kept by id through transactions) or `path: (row) => string[]` (a missing level becomes a filler
  row: `GroupNode` keyed `groupKey(path)`, its label in the tree column, never selected, counted or
  given to a cell part; it stands where its first nearest row underneath stands). None or several:
  new problem code `tree-shape`. `RowShape.load?` / `tx?` (the client model makes nested rows flat).
- **CSV of a tree**: `csv.tree: 'none' | 'level' | 'indent'` (default `'level'`, a first column
  `levelHeader`, default `Level`), `treeColumn`; fillers written as their label only; detail rows
  never written; `selected` never writes a filler.
- **DOM**: a row that is not a data row carries `data-kind` (`group`), no `aria-selected`, no box;
  a click on it only moves the focus. Theme: `.dzg-box[hidden]` not drawn. Playground « Arbre »:
  a shape switch (parent / nested / path).
- **Tree motion (Phase 4, step 6)**: `motion({ effects: { expand } })` (default on). Opening a tree
  row: the rows below glide down, the children shown fade in (at most 20); closing: the rows below
  glide up, nothing on the hidden rows. Skipped beyond 60 moving rows, for a row moving more than a
  screen, after a scroll between the change and the paint, under reduced motion and with
  `motion: false`. `onRow` is told `'moved'` / `'entered'` for a toggle too. Theme: the toggle's
  chevron turns (CSS, 120 ms) in a hovered or focused row, only where motion is welcome.
- **The million-row tree**: a seeded parent-id tree of ten levels (`perf/profiles/tree.ts`), bench
  lines in Node (build, expand all, filter) and Chrome (`npm run bench:browser -- --only tree`:
  first render, a wheel scroll over the open million, toggles, Ctrl+End); the playground's « Arbre »
  takes `?rows=1000000`; the « Animations » demo has an « Arbre » section.

- **Lazy children (Phase 4, step 7)**: `tree({ parentId, lazy: lazyChildren({ has, load }) })` from
  the new entry `@dzgrid/dom/tree-lazy` (core: `@dzgrid/core/tree-lazy`, `lazyShape`). A row `has`
  declares shows a closed toggle; opening it shows a loading row (`LoadingNode`, `kind: 'loading'`,
  `aria-busy`, `aria-setsize="-1"`), then its children, or an error row with a Retry button (Enter on
  the row retries). Closing aborts the load (`AbortSignal`); loaded children are kept until
  `setRows` or a refresh; expand-all and `*` never load. Words from the base bundle; theme:
  `.dzg-retry`, the loading row's words muted.
- **Server children**: `sourceRows({ fetch, children })`, `ChildRequest` / `ChildResponse`; one gate
  channel per parent, the query epoch in each request; a new epoch closes every row. A server's rows
  can now be a tree: its pages count the roots, a parent's children come whole.
  `SourceModel.diagnostics.childFetches` (lazy trees only).

### Changed

- **Breaking**: `canSelect` and `SelectionRule` receive a `DataNode`; click events carry a
  `RowNode` (check `kind === 'data'` before reading `data`).
- `DisplayedRows` gains optional members: `parentOf`, `levelAt`, `dataCount` (the rows select-all
  takes), `matchedAt` (false for a filtered tree's muted ancestor).
- Select-all and the header box skip fillers, details and a filtered tree's muted ancestors.
- `rows.expand` refuses only data keys that do not exist (`unknown-row`); another key the rows do
  not know (a filler) is a no-op, so a hidden filler can be opened by the application.
- `TreeOptions.parentId` is optional (one of the three shapes).
- `RowNode` gains `LoadingNode` (narrow by `kind`); `RowShape` gains `attach?` and `refresh?`;
  `ModelEnv` gains `shape?`; `TreeRows` gains `kidsOf`, and `childrenAt` says -1 for a lazy parent
  not loaded. `tree()` with a server's rows is no longer refused.

## [0.1.0] - unreleased

Prepared at the Phase 3 close (2026-10-21), **not published**: the four packages `@dzgrid/core`,
`@dzgrid/dom`, `@dzgrid/angular` and `@dzgrid/theme` at 0.1.0, their `@dzgrid/*` peers on `^0.1.0`.
Published later on the owner's word only, after the GSAP licence is confirmed, the `@dzgrid` scope
reserved on npm and `@tzslot/core` / `@tzslot/dom` 2.2.0 published (GitHub Actions over OIDC with
provenance, `--tag next` first; never by an agent). The date is written on publication.

### Added (Phases 0 to 3, by area)

- **Groundwork (Phase 0)**: clean-room rules (`CLEANROOM.md`), the architecture and the owner's
  decisions K.1–K.14, conformance cases written by hand (`conformance/`), ten spikes in three
  browser engines (a million rows, right to left with pinned columns, auto height, screen readers,
  `Intl`, Angular cells, clipboard, XLSX, composition, focus), then S11 (before Phase 2) and S12
  (spans, Phase 3).
- **`@dzgrid/core` (Phase 1)**: typed row identities (`RowKey`, `DisplayIndex`), calendar days kept
  apart from instants (`day`, `instant`, `zoneDayBounds` on `Intl`, no `Date`), value codecs and
  parsing (`fr-FR`, `ar-DZ` digits), columns, the client row model (`clientRows`: sort, filters —
  text, number, day, instant, set, custom `FilterKind` — quick search by language, transactions,
  selection, paging in the browser, value lists), layout (prefix sums, scroll mapper), problems as
  values, messages with plural rules; no DOM, no dependency.
- **Server data (`@dzgrid/core/server`, Phase 3)**: the request gate (`createGate`: only the last
  request of the current query is applied), `sourceRows` (pages by offset or cursor, unknown totals,
  the fetched set, retry, values from the server), `toWire` (the filter as the server receives it,
  instant ranges half-open in UTC), selection across pages.
- **CSV (`@dzgrid/core/csv`)**: `toCsv`, `csvChunks`, `csvRows`, `csvColumns`, BOM, separator by
  language, formula guard, `csv: 'text'` columns.
- **Cell spans (`@dzgrid/core/spans`, `@dzgrid/dom/spans`)**: merged identical values, spans decided
  by the data, grouped headers, full-width rows, under sort, filter, paging and virtual scrolling.
- **Selection rules (`@dzgrid/core/rules`, `@dzgrid/dom/rules`)**: `canSelect`, refusals said and
  shown, the application's `context` everywhere.
- **`@dzgrid/dom` (Phase 2, then Phase 3)**: virtual rows and columns (a million rows), pinned
  columns, right to left, keyboard after the WAI-ARIA grid pattern, row selection, tooltips,
  overlays, live announcements, popups in the top layer, rows that follow text zoom; the features
  seam, parts and slots (`@dzgrid/dom/slots`, `@dzgrid/dom/parts`: `badge()`, `cellBoolean`),
  `ui.cellClass`, `settings.motion`.
- **Filters UI (`@dzgrid/dom/filters`)**: the floating row, the filter popup (text, number, yes/no),
  date filters on tzslot (an optional peer, loaded on first use) with six relative shortcuts, the
  value-list filter (a lazy chunk).
- **Search, paging, export, motion**: `@dzgrid/dom/search` (binds the host's input),
  `@dzgrid/dom/pagination` (footer, pager, unknown totals), `@dzgrid/dom/export` (`csvExport`,
  `canExport` required, a lazy run chunk, the server's own export), `@dzgrid/dom/motion-gsap`
  (`motion()`, GSAP an optional peer).
- **Messages**: `en`, `fr`, `ar` bundles per feature (`locales/{en,fr,ar}[-filters|-pagination|-export|-parts|-rules]`).
- **`@dzgrid/theme`**: CSS custom properties on tzslot's palette, light and dark, more contrast,
  forced colours, every pair checked (`npm run check:contrast`), Sass and Tailwind entries.
- **`@dzgrid/angular`**: `<dz-grid>` (signals, zoneless first, zone.js supported, nothing on a
  server), `DzgController`, `provideDzGrid`, parts as components or templates with `emit`,
  `dzgSearch`, `dzgExport`, `fromObservable`; Angular 19 to 22.
- **Tooling**: `npm run check:size` (every entry against `size-budget.json`, the K.8 audit-screen
  profile), `npm run bench` and `bench:browser` (Node and headless-Chrome budgets),
  `npm run test:perm` (1 000 permutations), `npm run test:audit`, the Angular example
  (`npm run example:*`), `scripts/rebudget.mjs` (budgets set from a measure, step 25).

### Changed (Phase 3 close, step 25)

- Every budget set again from the measure (owner decision 2026-10-21): sizes the measure + 10 %
  rounded up to 50 B under ARCHITECTURE §5.2's ceilings (the K.8 profile guard 83 500, the real
  example still held to 85 000); Node times max(m × 1.1, m + 0.5 ms) for lines of 5 ms and more;
  headless-Chrome times the measure + 35 %. Final numbers in ROADMAP.md (Phase 3).
- New bench lines: `gate begin/accepts x 100 000`, `setValues 100 000 x 1 column` (Node); `"next"`
  click to fetch, the CSV of A in the browser, `<dz-grid>` first render of A and 1 000
  create/destroy cycles (Chrome). `npm run bench:browser` runs again (its page lacked
  `@dzgrid/dom/internal` since step 17).

### Phase 0 to 2 in brief

Phase 0 laid the ground: clean-room rules, the architecture, the core's seed (row identities,
calendar days apart from instants, the bounds of a day in a zone), conformance cases written by
hand, and ten spikes in three browser engines. Phases 1 and 2 built the data core and the read-only
DOM layer with its theme (ROADMAP.md). The sections below detail Phase 3 step by step.

### Added (Phase 3, step 26: motion with GSAP, `ui.cellClass`, the host hook)

- **`@dzgrid/dom/motion-gsap`**: `motion({ preset, effects, gsap, onCell, onRow })`, a feature. Rows
  glide after a sort or a filter (y only, from the offsets the grid wrote: no layout read), entering
  rows fade in, a value a transaction changed flashes (a tint and a mark at the cell's start edge),
  a page change slides in the reading direction, the filter popup's content and the overlay fade in.
  Transform and opacity only; exactly `transform,opacity,--dzg-flash` cleared at the end; a pooled
  row or cell shown for another row has its effects finished first. Reduced motion followed live: no
  movement, a still mark 0.6 s. An eager shell (`load()`, `loaded`) and a lazy chunk with GSAP,
  loaded at idle after the first rows. `onCell`/`onRow` hand the element to the application's own
  GSAP code after the grid's guards (`false`: handled). One `motion()` serves several grids.
- **`gsap ^3.13.0`**, an optional peer of `@dzgrid/dom` (GSAP's own Standard License, not MIT;
  DzGrid stays MIT and ships none of it); a root devDependency.
- **`settings.motion`** (live): `false` stops every effect and sets `data-motion="off"` on the root.
- **`FeatureHandle.beforeRows()`**: once per paint, before the layer and the rows move.
- **`columns[].ui.cellClass(ctx)`**: classes for a body cell from its data (`value`, `text`, `row`,
  `key`, `column`, `context`), part cells too; diffed tokens, `dzg-` ones ignored; a throw is
  reported and its classes removed. Type `CellClassContext` in `@dzgrid/core`.
- **Theme**: `.dzg-cell.dzg-flash` (tint `--dzg-flash-color` × `--dzg-flash`, a 3 px start mark,
  `Highlight` in forced colours), five contrast pairs; CSS transitions only under
  `prefers-reduced-motion: no-preference` and `:not([data-motion=off])`.
- Playground « Animations » (`playground/motion.html`), the Angular example loads motion after the
  grid is made, outside the zone; browser checks `npm run test:browser -- --only motion`.
- Sizes: `@dzgrid/dom` 19 450, theme 2 350, `@dzgrid/dom/motion-gsap` 800 and its run chunk 3 700
  (over the shell); `gsap kit: core` and `profile: audit screen + motion` recorded.

### Added (Phase 3, step 23: the Angular example)

- **`examples/angular-audit`**: the audit screen as an Angular 21 application installed from the
  packed tarballs (not a workspace member): `<dz-grid>` over `sourceRows(fromObservable(…))`, filters,
  `dzgSearch`, pagination, `dzgExport`, an Angular cell that `emit`s; French, or Arabic right to left
  (`?lang=ar`). Three builds: zoneless (default), `zone` (zone.js), `baseline` (no DzGrid, for K.8).
  Server rendering through `renderApplication`: the host only, no rows, no kernel.
- **`scripts/example.mjs`** and `npm run example:build`, `example:csv`, `example:ssr`,
  `example:bytes`, `example:browser`, `example:smoke -- 19|22`.
- **The Arabic CSV sample** for the owner's Excel check (`examples/angular-audit/out/audit-ar.csv`,
  not tracked), written by the real export.
- Tests: `perf/test/example-csv.test.ts`, `example-ssr.test.ts`, `example-bytes.test.ts` (the last two
  skipped without the example's builds).

### Changed (step 23)

- The K.8 profile (`perf/profiles/audit.ts`) names the `@dzgrid/angular` values the example imports,
  measured from the wrapper's shipped fesm2022 with Angular and rxjs left out (`size-budget.json`:
  `external`, `alias`, `shipped`); 75 623 B gz (was 70 532), budget 85 000 unchanged.

### Added (Phase 3, step 22: `@dzgrid/angular`)

- **`<dz-grid>`** (standalone, OnPush, signal inputs, `exportAs: 'dzGrid'`): `createGrid`'s settings as
  inputs (live ones sent to `update()` when their identity changes; `operations`, `pagination`,
  `filterKinds`, `clock`, `injectStyles`, `nonce`, `getRowId`, `features` fixed), the row type
  inferred from `[rows]`; models `[(quick)]`, `[(filter)]`, `[(selected)]` (no echo); outputs
  `gridEvent`, `cellClicked`, `rowClicked`, `cellAction`, `partAction`, `fetchFailed`, `problems`,
  `gridReady`. Its host takes no box (`display: contents`). Zoneless first; with zone.js the grid runs
  outside Angular's zone and its outputs inside it. On a server it renders nothing.
- **Parts in Angular:** `componentPart(slot, Component)` and `<ng-template dzgPart="name" slot="…">`
  for every slot (cell, header with its filter, overlay, tooltip, floating, filter, footer); the
  component's one input is `cell` (`DzgPartComponent<S>`, `DzgCell`), the template's context is typed
  by its slot. Pooled as the spike S6 measured: created once per host, rebound in place.
- **`emit(name, detail)`** in every Angular part's context: grid events `cellAction { column, key, name,
  detail }` (the row the cell shows at the call) and `partAction { slot, column, name, detail }` (two
  type-only variants of `GridEvent`; nothing in the core or the DOM layer sends them).
- **`DzgController`** (injectable inside the grid): `ready()`, `kernel()`, `dispatch`, `focusCell`,
  `ensureVisible`, `refresh`, `announce`, `openFilter`, `closeFilter`.
- **`provideDzGrid({ messages, parts, defaults })`**, tokens `DZG_MESSAGES`, `DZG_PARTS`,
  `DZG_DEFAULTS`, `DZG_ENV`; directives `input[dzgSearch]` and `button[dzgExport]`; `fromObservable`
  (a `DataSource` from observables, an abort unsubscribes).
- A problem code `part-shadowed` (warning): a part name a later layer of an Angular grid's registry
  takes from an earlier one.

### Changed (step 22)

- `@dzgrid/angular` peers on Angular `^19 || ^20 || ^21 || ^22` (tested on 21) and declares its
  exports; the placeholder `DzgProbe` is gone.

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
