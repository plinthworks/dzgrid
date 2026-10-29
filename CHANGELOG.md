# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-10-29

The Phase 6 close (owner, « Back to Phase 6 »): a minor, additive over 1.0.0 — every 1.0.0 subpath and named export is
still there (655 named exports of the published 1.0.0 checked against this build), the `<dz-grid>` inputs, outputs and
controller methods of 1.0.0 too. `@dzgrid/*` peers on `^1.1.0`.

### Upgrade notes (from 1.0.0)

- **`spans()` beside `tree()` now merges.** An app that passed both and ignored the `unsupported-combination` warning
  now sees merged cells (siblings only); `settings.fullWidth` beside a tree is still refused.
- **Angular selection: `[(selected)]` or `(selectionChanged)`.** `[(selected)]` is the model (a `SelectionState`, keys
  and mode, written back as the user ticks); `(selectionChanged)` is the event (`{ selection, count, source }`), new in
  1.1.0: in 1.0.0 a `(selectionChanged)` binding compiled and never fired (Angular binds an unknown output as a DOM
  event). Use one or the other; both agree.
- **Keys are not ids.** The grid's selection holds row KEYS (`d:13:3017620422003`), not your `getRowId` ids. To send a
  selection to a server, use `selectedIds(controller)` (`{ mode, ids, query }`): the ids, and in `exclude` mode (after
  « Select all ») the query to replay « every row it matches but these ». Group, pinned and detail keys are left out.
- **Print**: import `@dzgrid/theme/print.css` (or `print.unlayered.css` under an unlayered reset such as Tailwind's
  preflight) next to the theme, then `print(grid, { title })` from `@dzgrid/dom/print` (`ctrl.grid()` in Angular).
- **Comfort sheet**: thin scroll bars and the default loading spinner left the base theme for the optional
  `@dzgrid/theme/dzgrid.comfort.css` (and `dzgrid.comfort.unlayered.css`); import it to keep them
  (`--dzg-scrollbar: auto` restores the system bars).

### Fixed (review of the Angular step)

- `[state]` given back equal to an older value after the user moved the grid (« reset to saved ») was ignored: it is
  compared with the grid's state now, so it is restored; the value applied last is skipped only while the grid has not
  moved (the effect run again, the `(stateChanged)` echo). A value then `null` restores nothing.
- `gridState({ persist })` with `[state]` on a server grid asked twice (the storage's restore ended the hold, then
  `[state]` asked again): the storage's restore now keeps the hold of another holder, one request in all.
- The release gates the real Angular example: `release.yml` builds and measures it (`example:build`,
  `example:bytes`) before `test:ci`, where its vitest measure now fails (not skips) on a missing, failed or stale
  build under CI or `DZG_RELEASE_CHECK=1`; `npm run release:check` builds it when stale, measures it, then checks the
  manifests.

### Fixed (review after step 11)

- `print()` twice in a row: the older build opened a dialog too; now only the newest prints (a cancelled
  `preparePrint` resolves null) and each cleanup removes its own table. Without `afterprint` (Safari's PDF path) the
  first `focus` or `pointerdown` after the dialog cleans up.
- `print.truncated` and `print.page` are grid keys in the types (`GridMessages.text`, `msg`): a literal bundle with them
  compiles, no cast (types only).
- Filters: destroying the grid during a `busyFlash` left `aria-busy` on its root; removed with the timer.
- Popups are kept inside the window less its scrollbars (`documentElement.clientWidth` / `clientHeight`, not
  `innerWidth`): right to left, a popup no longer slides under the left scrollbar.

### Added

- **Angular (`@dzgrid/angular`, Phase 6 step 12; all additive, every 1.0.0 binding unchanged):** inputs `[state]` (with
  `gridState()`: restored before the first request, one request on a server; a value equal to the grid's state or to the
  last one applied does nothing, so `[state]` + `(stateChanged)` never echoes) and `[pinnedRows]` (with `pinnedRows()`,
  live); outputs `(stateChanged)`, `(densityChanged)` and `(selectionChanged)` (before, `(selectionChanged)` bound
  silently as a DOM event that never fired); `DzgController.use(feature)` (a feature's api, typed, no cast) and
  `.grid()` (the instance, e.g. for `print`); functions `selectedIds(controller)` (`{ mode, ids, query }`: the row ids,
  not the grid's keys, and the query to replay « all but these ») and `uiData<D>(c)` (a column's `ui.data`, typed);
  `missing-feature` for `[state]` / `[pinnedRows]` without their feature. Templates for the new `menuItem` slot.
- **Include-only set filter** (owner, 2026-10-29): `ColumnDef.filter: { kind: 'set', exclude: false }` — the set
  filter's list only ever writes no filter or `{ type: 'set', include: [...] }` (never `exclude`, never `blanks`;
  everything ticked on a complete list is no filter; no blanks row). A set filter with `exclude` or `blanks` arriving
  on such a column is ignored with `invalid-filter` (`filter.<col>.exclude` / `.blanks`, detail `exclude: false`), in
  the browser and in the request to a server (docs/behaviors/filter-set.md « Include only »). Sizes (owner, 2026-10-29):
  the set chunk 4 339 / 4 350 (was 4 250), K.8 84 902 / 84 950 (was 84 900), `core/edit` 3 155 / 3 160 (was 3 150),
  `core/state` 1 506 / 1 510 (was 1 500); the core base 29 064 (its guard 29 070, `@dzgrid/core` 29 150 unchanged).
- **Fill in one direction** (owner, 2026-10-29, the « arbre » screen): `fill(blocks, { along: 'row' | 'column' })`
  — every way (the handle's drag, its no-drag click, the keyboard mode, `api.fill`) fills along that axis only; Ctrl/Cmd+D
  with `row` (Ctrl/Cmd+R with `column`) is not taken; another value fills both ways with one `invalid-setting` warning
  (`fill.along`). The rule is the core's: `fillTarget(src, to, along)` in `@dzgrid/core/range` (fill.md 26).
- **Flash duration** (owner, 2026-10-29): `motion({ effects: { flash: { hold, fade } } })` in ms (0–10 000; default
  `{ hold: 0, fade: 600 }`, today's): the mark held at full, then faded; the saved flash takes the same durations;
  reduced motion: a still mark for hold + fade. A bad field: its default and one `invalid-setting` warning per grid
  (`motion.effects.flash.hold` / `.fade`) (motion.md « Its duration »).
- **Tree rows always open** (owner, 2026-10-29): `tree({ fixedOpen: (row) => boolean })` — those rows are open whatever
  the expansion, never closed by the keys, `*`, collapse-all, `rows.expand(false)` or an expansion the host sets (the
  core refuses, no event), never listed by expand-all; no chevron and no 24 px slot, `aria-expanded="true"` kept; other
  parents unchanged. A throw counts as false; a value that is not a function is ignored with `invalid-setting`
  (`tree.fixedOpen`). Style them with `rowClass` and CSS (tree-view.md « rows always open »). `@dzgrid/theme/edit.css`:
  the editor's field in such a cell starts at the indent.
- Sizes of these three (owner, 2026-10-29): `dom/tree` 3 863 / 3 950 (was 3 850), `theme/edit.css` 2 236 / 2 250 (was
  2 200); within their lines: `dom/fill` 3 143 / 3 150, motion 648 / 700 and its chunk 3 479 / 3 500, `core/tree`
  3 490 / 3 500, `core/range` 2 904 / 3 200; K.8 unchanged (84 901 / 84 950; its granted 85 000 not needed).
- **Merged cells inside a tree** (owner, 2026-10-29, step 15; spans.md « In a tree »): `spans()` beside `tree()` is no
  longer refused. A merged or spanned cell joins **consecutive shown siblings only** (same parent, same level; never a
  parent and its children, never across a filler, a loading row or a gap); opening a parent inside a run splits it,
  closing joins it. The tree column merges **leaves only** (a parent keeps its cell, chevron and keys; a `rowSpan` over
  a parent there is cut, `span-clipped`). A column span starting on or covering the tree column is refused
  (`invalid-span`, detail `tree`) and drawn unmerged. A tree now also gets grouped headers and collapsible header
  groups. The travelling label of a long merge sticks under the pinned parents (`--dzg-inset`, written by the tree).
  Full-width rows stay refused beside a tree (`unsupported-combination`, path `settings.fullWidth`, detail `tree`).
  `@dzgrid/core/spans`: `SpanInput.apart?(row)` (a row that never continues a span from the row above) and
  `SpanInput.treeColumn?`; `treeConflicts()` ignores `spans` (still accepted by its type, deprecated).
- **A gap between two categories** (owner, 2026-10-29, step 15; row-gaps.md): new entries `@dzgrid/dom/row-gaps`
  (`rowGaps({ before, size })`, `roots`) and `@dzgrid/core/row-gaps` (`gapsOf`, `gapLayout`, `roots`; types `GapCtx`,
  `GapRule`). An empty space above the rows the rule names (`true`: `size`, 16 px by default; a number: that many
  pixels), scaled with the text, never above the first row, outside every row (no element, no focus, not counted in
  `aria-rowcount`, never selected, copied or exported; not printed in 1.1.0), kept by sort, filter and folding; it
  cuts merged runs. The row under a gap carries `data-gap` and `--dzg-gap`. Beside master/detail: refused
  (`unsupported-combination`, path `rowGaps`). Problems: `invalid-setting` (`rowGaps.before`, `rowGaps.size`),
  `invalid-gap` (a rule that threw or answered no size, once per kind). The DOM base gains one seam: `rowLayout()`
  wraps its layout with the gaps' (`gapsFor`), always the outermost.
- Sizes of step 15 (owner, 2026-10-29): new lines `@dzgrid/core/row-gaps` 409 / 450, `@dzgrid/dom/row-gaps` 575 / 900;
  `@dzgrid/core/spans` 3 914 / 3 950 (was 3 800, raised to the measure plus a small margin); `dom/tree` 3 839 / 3 950
  (down from 3 863: the refusal code went); `dom/spans` 4 733 / 5 050; the DOM base 22 347 / 22 400; K.8 84 912 /
  84 950; `@dzgrid/core` 29 064 unchanged. A new perf line: « tree open + span map rebuilt, one merge column in the
  tree column (100 000 rows) » 20.5 ms (median 18.4).
- **A documented hook for styling one header group** (owner, 1.1.0): every group header cell carries `.dzg-hgroup`,
  `data-g="<ColumnGroupDef.id>"` and `data-level`, now a stable public contract pinned by a test (left to right and
  right to left): `.dzg-hgroup[data-g="REAL_TIME"] { background: var(--app-…); }` from the app's sheet. An empty
  `header` shows the id: to hide a label keep a real `header` and hide it visually (theming.md, header-groups.md).
- **`DzgController.clearFilters()` and `.resetState()`** (owner, 1.1.0): every filter and the search emptied, the sort
  kept, one request; and, with `gridState()`, the grid as defined at creation (columns, groups, sort, filters, search,
  page, density) in one request, `(stateChanged)` following, no loop with `[state]`. In the DOM: `GridStateApi.reset()`.
- **A content part per column-menu item** (`@dzgrid/dom/column-menu`, owner Q12-2): `MenuItem.part` names a part of the
  new slot `menuItem` (`SlotContext['menuItem']`: `id`, `label`, `kind`, `checked`, `disabled`, `column`); it paints the
  item's content in an `inert`, `aria-hidden` host, the item keeping its role, state, keys and its `label` as its name.
  Unknown name: `unknown-part`.
- Docs: the outputs `<dz-grid>` has and the silent unknown-output trap (angular-parts.md); « Keys and ids » and how to
  replay an « all but these » selection (selection.md).
- Example: `?screen=audit-url`, the audit screen with its layout in the address, its chunk on demand (`example:bytes`
  (5), `example:ssr --screen audit-url`). Playground: `orders.html` (moving, ⋮ menu with an item drawn by a part,
  chooser, density, layout in the storage and the address), `hr.html` (collapsible groups, a wrapped column with
  automatic row height, an editable pinned totals row).

- **Printing** (`@dzgrid/dom/print`, Phase 6 step 11, docs/behaviors/print.md; owner Q-I, O9): `preparePrint(grid,
  { maxRows, title })` writes the rows the grid shows — filtered, sorted, searched; a tree's shown rows, indented; top
  pinned rows first and bottom ones last; a paged grid's shown page with « Page 2 of 5 » in the caption — as a real
  `<table>` beside the grid (`caption`, `th scope="col"`, header groups as `scope="colgroup"` rows with a `<colgroup>`
  each, `dir` and `lang` of the grid), the screen's text of each cell (formatter, parts' text, edits shown), merged
  cells written on every row, a full-width row as one cell; detail panels, loading and filler rows left out. Built in
  slices of about 8 ms, a second call cancels the first, the cleanup is idempotent; the screen grid is not touched.
  Above `maxRows` (5 000): the first ones, a line saying so (`print.truncated`) and one `print-too-many` problem
  (counts only). `print(grid, options)` adds the browser's dialog (the newest call's only) and the cleanup on `afterprint` (or the first
  `focus` / `pointerdown` after it, when none comes); a cancelled `preparePrint` resolves null. Texts in
  `locales/{en,fr,ar}-print`, spread into the grid's messages; `PrintMessageKey`, `PrintMessages`, the `print-too-many`
  problem code (types only).
- **`@dzgrid/theme/print.css`** and `print.unlayered.css` (and `print.scss`): the table's borders, header repeated on each
  page, no row cut, the page's own content hidden while printing — explicit enough to survive an unlayered reset such
  as Tailwind's preflight (use the unlayered twin there).
- The spans feature exposes its current span map (`SpanFeature.map`), read by the print table.
- Playground: `print.html` (1 200 patients × 12 columns, `?lang=ar`, `?rows=5001`, `?preflight=1`) and « Imprimer » on
  `orders.html`; `npm run test:browser -- --only print` reads Chrome's PDF back (`scripts/pdf-text.py`, pdfminer.six).

Sizes (gzip): `@dzgrid/dom/print` 1 580 / 1 600 over the DOM base; `print.css` 334 / 400, `print.unlayered.css`
292 / 400; texts 132 / 140 / 160 (150 / 150 / 200). The DOM base, core, K.8 profile and Angular unchanged.

### Changed

- `gridState()` without `persist` no longer ends a server model's hold it did not make (it never made one): the holder
  (the Angular wrapper's `[state]`) ends it, so the restored state is the first request. No change with `persist`.
- Sizes (owner Q12-1): the Angular wrapper's line 7 000 → 7 300, the K.8 audit profile's 84 450 → 84 800; the real
  Angular example's 92 500 → 95 000 (owner, measured 94 596).
- `npm run example:bytes` fails on a missing, failed or stale example build (a stamp written by a clean
  `example:build`), instead of measuring an old one: the example build had been broken since 1.0.0 unnoticed.
- Sizes at the close (`size-budget.json`, ROADMAP « Phase 6 — close »): every line the measure + 10 %, rounded up to
  50 B, capped by the owner's grants; a line without a grant is its own ceiling (`scripts/rebudget.mjs`). Lowered:
  pagination 3 550 → 3 450, editors-list 1 400 → 1 350, the pasted-HTML chunk 600 → 550, `print.unlayered.css` 400 →
  350; raised within their grants: `dom/spans` 4 950 → 5 050 (Q-B 5 300), `dom/range` 5 050 → 5 200, `dom/fill`
  3 100 → 3 150 (Q1), `dom/columns` 4 100 → 4 200, `columns.css` 1 150 → 1 200 (Q6-6), `dom/pinned-rows` 2 200 →
  2 300 (Q2). The DOM base 22 400, core 29 150, K.8 84 800, Angular 7 300 unchanged.

### Tests and tools

- The light « real app » page (`playground/real-app.html`) and `npm run test:real-app` (Chrome, phase closes only):
  Tailwind 3's preflight unlayered, a brand on the tokens, the unlayered theme, comfort and print sheets; row boxes,
  set-filter pills, the inline period with `apply: 'button'`, header search boxes, the pager and its selection buttons,
  the ⋮ menu, the chooser; light and dark at two sizes: no horizontal overflow, square pager buttons only, one box per
  set-filter row, popups inside the viewport, the focus in each popup on open (« Du » for the period); six screenshots
  compared with `docs/screenshots/real-app/`.
- `npm run pack:local` stamps `1.1.1-local.<time>`: above 1.1.0.

## [1.0.0] - 2026-10-28

The first release on npm: `@dzgrid/core`, `@dzgrid/dom`, `@dzgrid/theme` and `@dzgrid/angular`, all at 1.0.0
(0.1.0, 0.2.0 and 0.3.0 were prepared locally and never published; their entries below are part of this release).
From 1.0.0 on, a breaking change to the public API needs a major version; later phases add features in minors.

- **Phase 1, the core** (`@dzgrid/core`): typed row identities, calendar days kept apart from instants, columns,
  sorting and filtering that follow the language (Arabic folding, Arabic-Indic digits), quick search, selection,
  paging, the keyboard model, problems as values. No DOM, no `Date`, no dependency; conformance cases in JSON.
- **Phase 2, the DOM layer and the theme** (`@dzgrid/dom`, `@dzgrid/theme`): virtual rows and columns, pinned
  columns, right to left, the WAI-ARIA grid pattern, popups in the top layer; the theme in a cascade layer, light and
  dark, more contrast, forced colours, every pair checked for contrast.
- **Phase 3, server, filters, export, Angular**: server rows behind a request gate, filter UI (text, number, set,
  day, instant with tzslot), cells spanning rows and columns, the CSV export, English / French / Arabic
  messages, motion (optional GSAP peer); `@dzgrid/angular` (`<dz-grid>`, signals, zoneless first, parts as
  components or templates, Angular 19 to 22).
- **Phase 4, tree and master/detail**: a WAI-ARIA treegrid with lazy children, master/detail rows with nested grids,
  sticky parents, the filter row.
- **Phase 5, editing**: F2 / Enter / typing opens an editor; the application's `save` decides; refusals said and
  shown; undo and redo; blocks of cells, the clipboard in TSV, the fill handle, Ctrl+D / Ctrl+R, bulk edit; showcase
  themes and Tailwind CSS 3 / 4 and Bootstrap 5.3 bridges.
- **Phase 6 so far, advanced columns**: moving columns, the column menu, the column chooser, keyboard resize and
  autofit, `GridState` (save and restore, local or in the address), collapsible header groups, editable pinned rows,
  automatic row height, the optional comfort stylesheet; the owner's integration feedback (below).

### Release

- Every shipped manifest: built JavaScript and declarations only (`exports`, `types`), `sideEffects` (false; the
  theme's CSS kept), licence, repository with its folder, homepage, bugs, keywords, `engines` (Node ≥ 22),
  `publishConfig: { access: public, provenance: true }`, a short README and the licence. `publint` clean;
  `@arethetypeswrong/cli` clean under its `esm-only` profile (the packages are ESM only).
- `.github/workflows/release.yml`: on a `v*` tag, the gates, then npm trusted publishing (OIDC) with provenance, in
  dependency order (core, dom, theme, angular), skipping versions already on npm; `scripts/release.mjs` (`release:check`,
  `publish:release`, `publish:dry`, `publish:verify`). The owner's steps: `docs/release-1.0.0.md`.
- GSAP's licence re-read before publishing (`docs/phase-5-steps/gsap-license.md`): an optional peer, never bundled.
- `npm run pack:local` stamps `1.0.1-local.<time>`: above 1.0.0, never shadowed by the published version.

### Known limits

- Phase 6 is not closed: printing and the Angular inputs for the Phase 6 features (and their demos) are still to come.
- Still open by hand: input methods and phones (a11y 124a–b), real Excel / Google Sheets / Safari checks,
  screen-reader listening, the Arabic review.
- Phases 7 to 11 (row grouping, infinite server rows, xlsx / menus / status bar / advanced filter / row dragging,
  pivot, hardening) and the documentation website come later.

### Phase 6 and integration feedback in detail

### Fixed (the fourth look)

- **The footer's selection actions** (« Select all N rows », « Clear selection ») share the pager's class and were drawn
  in its 2rem squares since the second look: their words wrapped over each other and over the count. The square is the
  pager's nav buttons' alone (`[data-go]`); the footer's buttons keep one line (`white-space: nowrap`) and size to their
  words. Bytes found in the theme (the set list's focus offset joined the cells' rule, two focus rules merged). (app-feedback 38)

### Added

- The owner's third look (allergen-detector, 2026-10-27; `docs/phase-6-steps/app-feedback.md` 30–37, decisions
  « Feedback after a client filter », « Comfort stylesheet »):
  - **`filters({ busyFlash: ms })`** (opt-in): `aria-busy` on the grid's root for that long after each filter change,
    one timer, nothing blocked; the comfort sheet draws a spinner over the rows meanwhile. For a client grid, whose
    filtering is instant. (filter-ui.md)
  - **`@dzgrid/theme/dzgrid.comfort.css`** (and `dzgrid.comfort.unlayered.css`, `comfort.scss`): an optional sheet with a
    default spinner (over the loading overlay's words and during a busy flash; it turns only under
    `prefers-reduced-motion: no-preference` and not `motion: false`) and near-invisible scroll bars (thin, the thumb in
    `--tz-border`, `--tz-fg-muted` on hover or focus, Safari by `::-webkit-scrollbar`, the system's under forced colours;
    `--dzg-scrollbar: auto` restores the system's). Its own size line (650 B gz).
  - The theme: a line at the pinned columns' edge; the header search box's magnifier in the accent when its column is
    filtered.

### Fixed (the third look)

- **Flexible columns with the selection boxes**: they shared the whole view and the boxes' 40 px came on top, so a grid
  with `checkbox: true` and a `flex` column always scrolled 40 px sideways. (app-feedback 34)
- **The period form's FROM / TO**: the input fills its field (tzslot gives it 8.5rem: half the box, a box inside the
  box), one focus ring, the field's (tzslot request T12). (app-feedback 30)
- **The focus when a date popup opens the first time**: it waits on the form while the date kit loads, then goes to the
  field (it went to the hidden « Condition » of a single-operator column: nowhere). (app-feedback 31)

- The owner's look at the integrated screen (allergen-detector, 2026-10-27; `docs/phase-6-steps/app-feedback.md` 11–22,
  decisions « Owner's-look budgets »):
  - **`filters({ apply: 'button' })`**: the popup's fields are a draft in the browser too (set ticks, date picks, text),
    sent at Apply or Enter, dropped on closing. `'live'` stays the default. (filter-ui.md)
  - **`filters({ dateZone: false })`**: the instant form does not say its zone (an application with one zone).
  - ~~The period form's FROM and TO show the locale's date pattern, lower case (`dd/mm/yyyy`), as placeholder.~~ Removed
    by the second look (below): the pattern was English in a French grid.
  - Playground: `owner-look.html` (`?theme=dark|light`), a products screen set up as the app's, with its brand on the
    documented tokens.

### Changed

- **Breaking (unpublished): a `filterOption` part paints the label area only.** The grid keeps its own box before it and
  its count after it (the app had drawn a second box); the part's host is `inert` (no focus can land in it, review
  finding 4), no longer `aria-hidden`. (filter-set.md)
- **`header.filterBox` takes the title's place**: the box, the column's name as its placeholder, a magnifier (theme); the
  column has no filter button. The summary kinds keep the name beside it. (parts.md)
- **The set filter**: the search box has a placeholder and no label above it (`filter.set.search` is now « Search… » /
  « Rechercher… » / « بحث… »); rows 2.25rem; the list as high as its rows (at most 18rem), no empty area under a short
  list.
- **The filter popup**: Apply is the primary button (the accent), Clear the secondary one; native boxes in the accent
  (`accent-color`); more room (padding and gaps .75rem, fields 2rem high).
- **Every popup stays inside the window**: placed again whenever its size changes (`ResizeObserver`: a date kit
  arriving, a list filled), and, with room neither below nor above, its end at the window's (it was the menu's only).
- Budgets (owner): `@dzgrid/dom/filters` 10 100, the set chunk 4 250, the date adapters 2 800, the K.8 profile 84 300.

- The owner's second look (2026-10-27, light theme; `app-feedback.md` 23–28):
  - **The period form**: each end's label on its field's row (DU / AU one column, the fields the next), no placeholder,
    no « Période » heading over them (the group keeps the name), at least 18rem wide.
  - **Every popup ends 8 px inside the window** when it would reach the edge (it ended on it).
  - **The pager's buttons are square**, 2rem × 2rem, the glyph centred; the footer's items .5rem apart (« Page 1 sur 1 »
    with room).
  - **The set filter**: the search box, the count line and « Select all » .5rem apart (a host's reset of `p` margins
    had left the count squeezed between them).
  - Playground `owner-look.html`: the app's selection boxes and 15 px cell padding, `?preflight=1` (Tailwind 3's reset,
    the theme unlayered), `?loading=1` (the grid's loading state with the app's spinner).

### Fixed

- **The selection box became a 10 × 16 pill** in a cell whose padding leaves less than 1rem (an app's 15 px in the
  40 px column): the box no longer shrinks (`flex: none`).
- The date popup on the last column was cut by the window's edge (Sunday, Apply, the next-month arrow hidden): it was
  placed while its kit was still loading and never placed again.

### Added (feedback pass)

- The feedback pass (« retours d'usage », allergen-detector, 2026-10-27; `docs/phase-6-steps/feedback-plan.md`,
  decisions « Feedback pass »):
  - **The period form in the filter popup itself** (owner Q2): FROM and TO typed fields (tzslot's `createDateInput`),
    one month of tzslot's inline calendar (`createDateRange`; `dateCalendar.months` for more) and the shortcuts as
    buttons, composed by DzGrid in the column's popup: no second panel over the popup, nothing outside the window on the
    last column, one Escape closes. Between two moments: each end with its hour. (filter-date-picker.md)
  - **A part for the set filter's option row**: slot `filterOption`, named by `filter: { kind: 'set', optionPart }`; told
    `value`, `label`, `count`, `countText`, `selected`, `blank`, `column`, `toggle()`; the grid keeps the row, its name,
    keys and window. (filter-set.md)
  - **`ColumnDef.ui.data`**, the app's own data for the column's parts, delivered as is; another key of `ui` is a warning
    `unknown-ui-key`. (parts.md)
  - **`data-column` / `data-kind` on the filter popup's content**, for an app's global CSS (owner Q5). (theming.md)
  - A column naming a header or tooltip part without `slots()` (or `header.filterBox` without `filters()`) is a
    `missing-feature` warning at `columns[i].ui.header|tooltip`.
  - Docs: a header search (« filter as you type ») part over the column's filter, `dzgrid.unlayered.css` for an app with
    an unlayered reset, `--dzg-row-height` read-only (use `rowHeight`), Angular notes (`[slot]` a binding, CSS escapes).
  - Playground: « Retours d'usage » (`?filters=1&popup=1&dates=1&sets=1&pills=1&paging=client`): pills, one operator,
    the period form, the pager's arrows.

### Changed

- **tzslot 2.4.0**: the date kits and the editors' calendar import `@tzslot/dom/lazy` / `@tzslot/core/lazy` (T3): no
  Temporal polyfill bundled; a date kit's first use downloads 33 317 B gz instead of 66 962. The optional peers ask
  `>=2.4.0 <3` (was `>=2.2.0 <3`); a chunk exports `ready`, awaited by the loader.
- French `filter.clear`: « Effacer {column} » (was « Effacer le filtre {column} »); the popup's Clear button shows the
  text without the column and keeps it in its name.
- The tree, detail and group chevrons are a character (U+203A) turned by `rotate`, no longer borders: `--dzg-chevron`
  is `90deg` / `-90deg` open, unset closed; `--dzg-gch` `90deg` / `-90deg` / `0deg`.
- The theme draws the selection box's edge with an outline (dashed when refused, `CanvasText` in forced colours).
- The period form opens on one month (two before); a stored shortcut the form does not offer shows its days.
- Budgets (owner Q1, the lazy kits by the strict need): date adapters 2 600 → 2 745, set chunk 4 200 → 4 205, the
  editors' calendar 1 500 → 1 520.

### Fixed

- **The pager's arrows were empty buttons in an app with an unlayered reset** (Tailwind 3's preflight): they were
  layered CSS borders. They are now characters in the DOM (`aria-hidden`, mirrored right to left by the browser); the
  same fault removed from the tree, detail and group chevrons and the value list's box.
- **An unticked selection box was invisible in the light theme** under the same reset: its edge is an outline.
- « Condition » no longer shows for a column offering one operator (`ops: ['betweenDays']`).
- A long column name no longer wraps the filter popup's footer.
- The neighbouring month's days in the period form's calendar are unfaded in a popup (T11, `--tz-cal-outside-opacity`
  on `.dzg-popup`).

### Added (Phase 6)

- `@dzgrid/dom/auto-height` (Phase 6 step 9; docs/behaviors/auto-height.md, owner Q-R1, Q9-1..Q9-4): `autoHeight()` —
  rows as tall as their tallest wrapped cell (`ColumnDef.wrap: true`), never under the row height; measured after each
  paint in one read (hidden copies of the wrapped cells, written, read, removed) and painted again in the same frame
  (three passes at most), the row at the view's top held in place (S3: 0 px at 10 000 rows in Chrome, Firefox and
  WebKit, a million rows with scaled scrolling); measured again when the wrapped columns' widths, the row height, the
  direction, the language or a row's text change, and when late fonts load; not while an editor is open in the row;
  composed with `detail()` panels in either order; one `auto-height-large` warning above 10 000 rows. `wrap` without
  the feature wraps and clips, with a `missing-feature` warning; a fixed `rowHeight` wins (nothing measured); pinned
  rows keep one line (Q9-1). Base seams: `GridContext.again` (a measure after the paint), the cells' `data-wrap`, a
  row's height rewritten on a re-layout of the same data. Demo `playground/auto-height.html` (« Remarques », fr / ar,
  details, `?rows=1000000`).

- Pinned rows, part 2 (Phase 6 step 8b-2; pinned-rows.md 17–18, owner Q1, O8): blocks of cells, copy, cut, paste,
  Delete, Ctrl+D / Ctrl+R, the keyboard fill mode, the fill handle and bulk (Ctrl+Enter) inside one pinned band, by the
  keys and the mouse; never across a band's edge (Shift+keys stop there, a drag stays on its band's rows, a crossing
  Shift+click or API block is refused); a paste past a band's last row counted outside; Ctrl+A stays the body's; the
  column menu's « Fill down / right » on a focused pinned cell. DOM context seams `pinTop`, `pinAt`; `range/geom`'s
  `cellAt(g, p, dy, key?)` and `autoScroll(g, p, key?)`.

### Fixed

- Rows laid out again in the frame right after a scroll (a detail panel measured, a late measure) put the view back
  where the last paint left it; the anchor is now the row the user scrolled to, and a scroll written just before the
  frame is read by the paint (Phase 6 step 9, virtual-scroll.md).
- `detail()` taken away sets `layoutFor` back to none instead of deleting it (so a feature laying out around it keeps
  its own).
- A body drag (block or fill) under a top pinned band landed its rows too low: the body's rows are measured from the
  band's foot (8b-2).
- A pinned cell's overlay id is its key after a NUL (review R1): a body row whose id is the pinned key's text no longer
  shares its edits (`core/edit`, `dom/edit` marks, motion saves, a copy and a fill's source).
- `filters({ dateCalendar: { months } })` over 12: capped at 12, with an `invalid-setting` warning (review R2).
- Enter / Shift+Enter (`enterMoves: 'down'`) on the body's last / first row no longer goes into a pinned band (review
  R3); the arrows still cross.
- `restoreState`: the O1 rule counts the columns a closed group folds, so a state never leaves zero columns shown
  (review R4).

- `@dzgrid/dom/pinned-rows` (Phase 6 step 8b-1; docs/behaviors/pinned-rows.md, owner Q-P = C, Q2–Q5, O8, C6):
  `pinnedRows({ top, bottom })` — rows pinned under the header and at the grid's foot (a reference row, a totals row),
  each band a named `rowgroup` (`pinned.top` / `pinned.bottom`, texts `locales/{en,fr,ar}-pinned`), never sorted,
  filtered, paged or selected, counted in `aria-rowcount` and numbered header → top → body → bottom; the body's view
  shortened by them (WCAG 2.4.11), both together at most half the view (a taller band windowed, moved by the wheel and
  the focus); the bottom band at the foot when the body is short (Q3). Keys across the bands (Down / Up from the header
  through the top band, the body, the bottom band; PageUp / PageDown and Ctrl / Cmd edges into the body; Left / Right
  inside a row, mirrored right to left). Editable through `edit()` and `editors()` like body rows: same keys, saves,
  marks, refusals and undo; Tab and Enter's move stay inside the band; never order-stale. `api(grid)`: `set` (one side
  at a time, an id kept keeps its focus and open field), `get`, `rows(side)`. Problems: `duplicate-row-id` /
  `invalid-row-id` (path `pinnedRows.top[i]`), `too-many-pinned-rows` (warning, above 5 on a side). Its look in the new
  `@dzgrid/theme/pinned-rows.css` (raised background, a 2 px line, `CanvasText` in forced colours; `--dzg-pinned-bg`,
  `--dzg-pinned-line` in `check:contrast`). Blocks, paste and the fill inside a band: step 8b-2.
- Core: `GridKernel.rowOf(key)` (a body row, else a pinned one); `EditableRule`'s third argument `EditableInfo`
  (`{ pinned }`); `SaveChange.pinned`; `DataNode.pinned`; `RowClassContext.pinned`; the event `pinnedChanged`;
  `assignKeys(ids, path, make?)`; internal `setPinned`, `isCellKey`. DOM base: `RowRenderer.spawn(layer, peer?)`, the
  context's `pins`, `move`, `rowsOf` seams.
- **Breaking (unpublished):** `pinnedKey(side, id)` is keyed by the row's id (`p:t:1:a`), no longer by a position, and
  returns null for an unusable id instead of throwing.

- `filters({ dateCalendar: { months, presets } })` (docs/behaviors/filter-date-picker.md, Calendar options): the
  period field's months side by side (2 by default) and its shortcuts, a list of `RelativeRange` names in the host's
  order (the six by default, `[]` for none); still none between two moments. A value it cannot take is dropped with an
  `invalid-setting` warning, never thrown. Type `DateCalendarOptions` from `@dzgrid/dom/filters`.

- `@dzgrid/dom/groups` and collapsible header groups (Phase 6 step 7; docs/behaviors/header-groups.md, owner Q-GH,
  Q8-1–Q8-5): `ColumnGroupDef.collapsible` / `open`, `ColumnDef.groupShow: 'open' | 'closed'`; `groups()` (with
  `spans()`) draws a 24 px button at the group header's inline end (`aria-expanded`, named), Enter / Space on the group
  header, the focus moved off a column that goes, a polite sentence with the count shown; `groups().api(grid)`
  (`toggle`, `isOpen`, `reset`, `get`, `set`, `collapsible`). The open state is its own, never `hidden`; nested groups;
  a group split by a pin keeps one state. Core: `ColumnModel.folded` / `fold()` (+35 B), `@dzgrid/core/spans`
  `groupTable`, `foldedColumns`, `diffState`. `GridState.groups` saved and restored (`gridState()`), the menu's « Reset
  columns » brings the groups back, the chooser keeps a group-hidden column ticked (`chooser.inClosedGroup`). A fold
  clears the block of cells. Texts `group.*` in `-columns` (600 / 720 / 900).
- **Breaking (unpublished):** a `-columns` bundle must carry `chooser.inClosedGroup` (`columnsChooser()` throws without
  it) and the `group.*` keys when a tree has a collapsible group (`groups()` throws). A restore's `groups: {}` now brings
  every group back to its definition.

- `@dzgrid/dom/columns` part 2 (Phase 6 step 6; docs/behaviors/column-resize.md, owner Q-K3, Q6-1, Q6-2, Q6-6, O10): the
  keyboard resize mode — Alt+R on a focused column header (read by the key's place, then its letter), arrows ±10 px
  (Shift: 1) mirrored right to left, Home fits, Enter keeps, Escape restores the width and the flexibility, Tab / a
  press / the focus leaving / a sort keep it quietly; a dashed outline (`--dzg-resize-mode`, 3:1), the width said once
  after a pause. Auto-size: the real header and mounted cells measured (badges, Arabic shaping, tree indentation) plus
  the first 200 displayed rows' texts, in one read phase; one `column.state` patch. `ColumnsApi.autoSize(ids, { say })`,
  `autoSizeAll({ say })`, `resizeMode(id)`; a double-click on a header's edge fits the column (mouse, pen); the column
  menu's « Ajuster cette colonne / toutes les colonnes » and « Redimensionner au clavier » appear with `columns()`. No
  − / + / ✓ buttons: the single-pointer way is the menu's « Élargir / Rétrécir » (Q6-1).
- `fromSearchParams(params, { include? })` (review 2026-10-27): typed filters and the search are read from an address
  only when the application opts in, as when writing (O6); `toSearchParams` falls back to the sort alone when columns
  and sort are still over 4 KB (`sort-only`); a state's density must be one of the three strings.
- **Breaking (unpublished):** a `-columns` text bundle must carry the eight `size.*` keys; `columns()` throws at setup
  without them (the locales `en/fr/ar-columns` have them).

- `@dzgrid/core/state` and `@dzgrid/dom/state` (Phase 6 steps 5–6; docs/behaviors/grid-state.md, owner Q-S1, Q-S2, O1, O6,
  O7, E5-1–E5-8): the grid's state as a small versioned JSON — columns (order, width a user set, hidden, logical pin),
  header groups (step 8), sort, filters, search, page and size, density; never a row, a key or a cell value.
  `captureState` / `restoreState` / `checkState` / `stateText` (pure): older versions upgraded step by step, newer or
  odd ones refused (`state-version`, nothing applied), unknown columns and groups skipped (`state-column`,
  `state-group`), wrong fields skipped (`state-field`), never every column hidden, `hideable: false` never hidden,
  `movable: false` kept in its place; one server request per restore (the server model's `hold`). `gridState({ debounce?,
  persist? })`: `api(grid).state()` / `setState()`, `stateChanged` once per gesture (never the host's nor a restore's),
  `stateRestored`; `persist: { key, include? }` reads the browser storage before the grid's first request (one request
  at start), `persistLocal(grid, key)` later; blocked, full or bad storage: one `state-storage` warning. The address:
  `toSearchParams(state, { name?, include? })` → `{ params, problems }`, one `grid=1.` + base64url parameter, typed
  filters and the search left out unless `include` names them, over 4 KB only columns and sort (a warning);
  `fromSearchParams(params)` → `{ state, problems }`. Never a cookie, never the history. Demo `playground/state.html`.
- The column menu's density line says `densityChanged { density, source: 'user' }` (density.md 2); events
  `stateChanged`, `stateRestored` in `GridEvent`; `ProblemCode` gains the `state-*` codes (a type only).

- `@dzgrid/dom/columns-panel` (Phase 6 step 4; docs/behaviors/columns-chooser.md, owner Q-C1, Q-C2, Q-H, O1, O5, O12,
  Q4-1–Q4-4): « Choisir les colonnes ». `columnsChooser()` and `api(grid).open(anchor?) / close() / isOpen`, opened by
  the column menu's « Choose columns… » (`use: { chooser }`) or the application's own button: a modal dialog named by its
  title, focus in its search box (visible label), every listed column in the grid's full order (start-pinned, centre,
  end-pinned, hidden ones included) inside its header groups, a native checkbox each (changes apply at once, one patch,
  said; the last shown column and `hideable: false` disabled but reachable), a search folded as the quick search (accents,
  Arabic hamza forms and short vowels; a group's name shows its columns; the count said after a pause), reordering by
  Alt+ArrowUp / ArrowDown (Option on a Mac), ▲ ▼ (WCAG 2.5.7) and a handle the mouse, a pen or a finger drags (the place
  said among all listed columns, hidden ones counted; never across a pinned edge; groups kept whole; locked columns kept),
  « Show all », « Reset » (the menu's patch), live sync with focus kept. Texts: twenty `chooser.*` keys in
  `locales/{en,fr,ar}-columns`; look in the new `@dzgrid/theme/columns-panel.css` (contrast pairs added).
- `@dzgrid/core`: `ColumnDef.chooser?: false` (type only): a column left out of the chooser's list.

- `@dzgrid/dom/column-menu` (Phase 6 step 3; docs/behaviors/column-menu.md, owner Q-M1, Q-M2, Q-K1, Q3-1–Q3-4,
  S12-Q12): the column ⋮ menu. A ⋮ button on each column header of 96 px and more (out of the tab order, shown on hover,
  focus or touch), a right-click (Shift+right-click keeps the browser's), Shift+F10 and the Menu key, Alt+ArrowDown where
  the column has no filter popup, a Mac's Ctrl+click: an APG menu (arrows wrapping, Home / End, folded type-ahead, Enter /
  Space, Escape / Tab back) with sort, pin, widen / narrow (the menu stays open, the width said after a pause), move one
  place (with `columns()`), « Recopier vers le bas / la droite » on the current block (with `range()` and `fill()`: the
  fill's ≥ 24 px pointer way, WCAG 2.5.8), « Filtrer… », hide (never the last column), « Choisir les colonnes… » (step 4),
  reset to the definitions, an optional density line (`onDensity`), and the application's items (`items`, radio and
  check items, `keepOpen`, an icon class, host `classes`). Opened by a pointer it never moves the grid's focus: a block
  survives. Texts `locales/{en,fr,ar}-column-menu`, look in `@dzgrid/theme/columns.css` (contrast pairs added).
- `@dzgrid/core`: a `column.state` patch may give `width: null` to clear the user's width (the definition's again, a
  flexible column flexible again; owner Q3-3). `ColumnDef.hideable?: false` and `ColumnDef.menu?: false` (types only).
- `@dzgrid/dom/fill`: `down({ user: true })` / `end({ user: true })` write as the keys (source `user`); without it the
  API's own source, unchanged.
- `@dzgrid/dom/popup`: `from` (placed by another element or at a point), `align: 'end'` (end edges aligned) and `back`
  (where the focus goes on close).

- `@dzgrid/dom/columns` (Phase 6 step 2, part 1; docs/behaviors/column-move.md): moving columns. A header dragged with the
  mouse (never a finger; a pen clicks) past 4 px: a ghost, an insertion bar on the gap (logical, right to left mirrored),
  auto-scroll near the centre's edges; dropped among pinned columns it pins there, out of them it unpins; one
  `column.state` patch and one `columnsChanged` (source `user`), the new place said; Escape cancels. Ctrl+Shift+arrows,
  Home, End on a header (Cmd+Shift on macOS) move it within its segment, the place said after a 300 ms pause.
  `movable: false` columns keep their place. `api(grid).move()` for the column menu (step 3), `dropTargets` for the
  group zone (Phase 7). Texts `locales/{en,fr,ar}-columns`, styles `@dzgrid/theme/columns.css` (`--dzg-move-bar`,
  checked at 3:1). No drop animation (Q2-2). WCAG 2.5.7's single-pointer way comes with the menu (step 3); nothing is
  published before.

### Fixed

- **Accidental fills** (owner's report on `orders-edit.html?focus=range`, 2026-10-26: a block growing by one row
  written with its first row, a whole column written with one value). `@dzgrid/theme/fill.css`: the handle's hit box is
  its 8 px square and 2 px (10 × 10 px), no longer 24 × 24 px over the corner cell; a press near a cell's corner selects.
  `@dzgrid/dom/fill`: a drag of the handle starts after 4 px of movement. WCAG 2.5.8 through its equivalent controls
  (click-then-click, keyboard fill mode, Ctrl/Cmd+D/R; `fill.md` 21).
- `@dzgrid/dom/range`: the block's corner is taken at the release point too (a release with no move before it).
- `@dzgrid/dom/range`: an application's `clear()` during a drag stops the drag (the release no longer brings a block
  back). `@dzgrid/dom/fill`: a block change or `clear()` from the application cancels a fill under way; a row joins the
  fill's target only once the pointer is half a row inside it (an edge slip fills nothing).

### Changed

- `@dzgrid/dom/popup`: a modal popup's Tab trap skips controls taken out of the tab order (`tabindex="-1"`): Tab from
  its real last control wraps to the first, Shift+Tab from the first to the real last (before, a `tabindex="-1"` button
  or input still counted as the last, and Tab left the popup).

- The header's `aria-keyshortcuts` is written by the base once, joining the features' lists (`FeatureHandle.shortcuts`),
  deduplicated and sorted: the filters no longer write it alone (they wiped any other), `columns()` now declares its
  moves (`Control+Shift+ArrowLeft/Right`, `Meta+…` on macOS). A popup that fits neither below nor above its anchor is
  kept inside the window (its end at the window's end) instead of running off it. With `columns.css` loaded, the edit
  feature's reapply mark is drawn last among the header's buttons (`order: 3`), clear of the resize grip.

- `@dzgrid/dom/range` (owner S12-Q15, revises S11-Q1 for the pointer): after a mouse drag the focus stays on the START
  cell, the anchor, as in Excel (the release moves no focus, so an auto-scrolled drag keeps its view); the fill handle on
  the block's far corner. Shift+arrows after a drag
  move the far corner (the focus goes there with them: the keys keep QB2). A fill still leaves the focus where it is,
  the block source ∪ filled, the handle at its new corner. Shift+click unchanged (the focus to the clicked cell).
- `@dzgrid/dom` + `@dzgrid/theme` (owner S12-Q16): Escape on a cell, with `range()`, also puts the grid in a quiet state
  (`data-dzg-quiet` on the root): no ring, inner line or tint on the focused cell, no tint on its row, no fill handle.
  The focus stays (screen readers keep it); any key, a press in the grid, the focus coming back or a block set by the API
  ends it (WCAG 2.4.7: `range-selection.md` « Escape: the quiet state »). A second Escape changes nothing; an Escape
  another feature takes (a fill cancelled, an editor given up) or one with a modifier does not go quiet.
- `@dzgrid/dom/range`: in a closed shadow root, a press on the grid's own header no longer clears the block (the shadow
  root decides for the presses inside it). `@dzgrid/dom/fill`: one outside press with the click-then-click fill armed and
  a block says one sentence (the block's « cleared »; the fill's cancel silent).

- `@dzgrid/dom/range` (owner S12-Q13, replaces S12-Q11): a pointer press outside the grid clears the block
  (`rangeChanged` source `user`, said once as Escape). A press inside an element marked `data-dzg-keep-range` keeps it
  (an app's « Envoyer / Exporter » button), as does a press on the grid's own popups, a nested grid, or the page's
  scrollbar; shadow roots are followed. `range({ clearOnOutside: false })` keeps the old rule. The demo's « Envoyer la
  sélection (simulé) » is marked. Size: `@dzgrid/dom/range` ceiling 4 800 → 4 950 (S12-Q14, measured 4 873).
- `@dzgrid/dom/fill` (owner S12-Q12): a pen no longer drags the fill handle (as a finger, as for blocks). The fill is
  not WCAG 2.5.8-complete until the column menu's « Recopier vers le bas / la droite » (Phase 6 step 3).

### Added

- `orders-edit.html?focus=range`: « Envoyer la sélection (simulé) » — the block cleared by the application after a
  pretend server call (`range().api(grid).clear()`: `rangeChanged` source `api`, not said); documented in
  `range-selection.md`.

## [0.3.0] - never published (part of 1.0.0)

Prepared at the Phase 5 close (2026-10-26), **not published**: the four packages at 0.3.0, their `@dzgrid/*` peers on
`^0.3.0`. Phase 5, editing — Part A (cell editing, saves, undo) and Part B (blocks of cells, the clipboard, the fill
handle, bulk edit) — plus the showcase themes, the framework bridges and two demos. Published on the owner's word only,
under the same conditions as 0.1.0 and 0.2.0 (never published either). Sizes: ROADMAP « Final budgets (Phase 5) ».

By area (the detail, step by step, below):

- **Core** (`@dzgrid/core`): `ColumnDef.editable` / `validate` / `edit`, `editableAt`, the edit seams of the kernel
  (`edits.reader`, `rows.reapply`, `context.app`), the stale order; new entries **`@dzgrid/core/edit`** (saves, local
  and server refusals, undo / redo) and **`@dzgrid/core/range`** (blocks, TSV, copy values, paste and fill plans).
- **DOM** (`@dzgrid/dom`): new entries **`/edit`**, **`/editors`**, **`/editors-list`**, **`/range`**, **`/fill`**
  and their texts `locales/{en,fr,ar}-{edit,editors,range,fill}`; `settings.rowHeight`, `rowClass`, `headerClass`;
  `aria-multiselectable` with a block; the lazy loader in `@dzgrid/dom/internal`.
- **Theme** (`@dzgrid/theme`): `edit.css`, `range.css`, `fill.css` (each with a `.unlayered.css` copy), the showcase
  themes `midnight.css` and `clinic.css`, the bridges `tailwind.css` (revised), `tailwind3.css`, `bootstrap.css`; the
  cascade layer `dzgrid`; the visible keyboard position (S12-Q8 bis).
- **Angular** (`@dzgrid/angular`): `edit()`, `editors()`, `listEditor`, `range()`, `fill()` through `[features]`, a live
  `[save]`, `(cellEdited)`, `(saveFailed)`, `(orderStale)`, `(undoChanged)`, `(rangeChanged)`, `(rangeCopied)`,
  `controller.edit()`, `.range()`, `.fill()`, template and component editors, `[rowClass]`, `[rowHeight]`.

### Changed — breaking (against 0.2.0)

Checked at the close on `git diff v0.2.0..HEAD` of the packages' sources (public types, injected CSS, theme files),
not from memory:

- **The CSS sits in the cascade layer `dzgrid`** (T1): `dzgrid.css`, `contrast.css`, the bridges and the layout the DOM
  injects are layered (`dzgrid.layout < theme < skin < bridge < contrast`, T9). An application's unlayered rule now
  wins over the grid's whatever its specificity; an app whose reset (Tailwind 3 preflight, Bootstrap Reboot) would
  beat the grid imports the `.unlayered.css` copies.
- **`aria-readonly` is computed**: the viewport keeps `aria-readonly="true"` only while no shown column is editable;
  once one is, the viewport's attribute goes and each data cell that cannot be edited says `aria-readonly="true"`. A
  test or a tool reading only the viewport's attribute must read the cells on an editable grid.
- **`GridEvent` gains nine events** (`orderStale`, `cellEdited`, `saveFailed`, `editStates`, `editingStarted`,
  `editingStopped`, `rangeChanged`, `rangeCopied`, `undoChanged`) and **`GridCommand` three commands**
  (`edits.reader`, `rows.reapply`, `context.app`): a `switch` that claimed to be exhaustive must handle them.
- **`ProblemCode` gains `edit-structure` and `invalid-setting`** (exhaustive switches, translated messages).
- **`ClientModel.reapply()` is told with the source given, `api` by default** (it was always `user`).
- **The base theme's look**: the focused cell's ring is stronger, with a cell tint and an active-row tint (S12-Q8 bis);
  a visual change for every grid using `dzgrid.css`.
- **Row heights follow the browser's default text size** (`font-size: medium`), no longer the page's root font size.
- With `range()` on (opt-in, new in 0.3.0), Shift+click and Ctrl+A select a block of cells, not rows (QB1); rows are
  checked by their box.

Changed during Phase 5 but **not breaking against 0.2.0** (new in 0.3.0, so no 0.2.0 code depends on them):
`editors({ enterMoves })` defaults to `'stay'` (Q3 revised); `SaveOrigin` includes `cut`; Space on a yes/no cell toggles
it, not the row (O8); `FilterKind.test` / `wire` (and `FilterModel` kinds' `wire`) get the app context as an extra,
optional argument (an older kind still type-checks); the tzslot loader moved from the filters' private module into
`@dzgrid/dom/internal`.

### Changed

- `editors({ enterMoves })` (owner, Q3 revised, Phase 5 step 7): the default is now `'stay'` — Enter and
  Shift+Enter keep the value and the focus stays on the cell; `'down'` (down / up, as a spreadsheet) is the option.

### Added

- Phase 5 step 12: **`@dzgrid/dom/fill`**, the fill handle, Ctrl+D / Ctrl+R and bulk edit (docs/behaviors/fill.md 11–20;
  owner S12-Q1–Q9). `fill(range)`: a handle on the block's corner cell, or on the focused editable cell alone (S12-Q8),
  bottom-right (bottom-left right to left), a crosshair over it; dragged by the mouse or a pen (a target outlined, the
  view auto-scrolls, Ctrl / Cmd at the drop swaps copy and series, Escape cancels); a click on it then a click on a cell
  (WCAG 2.5.7); the keyboard fill mode (Ctrl/Cmd+Shift+Enter, the arrows, Enter / Ctrl+Enter / Escape); Ctrl/Cmd+D and
  Ctrl/Cmd+R (a copy; one row or column: the one before it); Ctrl/Cmd+Enter in an editor writes its value in every cell
  of the block. One gesture = one save, one undo, one sentence. API `fill(to)`, `down()`, `end()`, `apply(input)`. Texts
  `locales/{en,fr,ar}-fill`, styles `@dzgrid/theme/fill.css`. Angular: `controller.range()`, `controller.fill()`,
  `(rangeChanged)`, `(rangeCopied)`. Sizes: `dom/fill` 2 729 B gz (3 000, S12-Q9), `fill.css` 415 (460), texts 231 / 278 /
  299, `/editors` 6 669 (6 720, QB5), `dom/range` 4 768 (the pointer geometry shared).
- Phase 5 step 12, S12-Q8: **the keyboard position is obvious** in the base theme — the focused cell, reached by keys or
  by a click, has a 2 px ring with an inner line of the background and a light tint; its row a neutral tint (between
  hover and selection); forced colours: a Highlight ring. `contrast.css`'s dark refusal colour moves to `#ff6b9e` (60° from
  its yellow ring).

- Phase 5 step 11b: **the clipboard in `@dzgrid/dom/range`** (docs/behaviors/clipboard.md; owner S11b-Q1–Q5). Ctrl+C /
  Cmd+C on a block or a cell writes TSV (the export values: the locale's decimal mark, ISO days, wall-time instants,
  labels, the formula guard, `="0123"`) and an escaped `<table dir>`; Ctrl+X copies then clears in one save; Ctrl+V
  writes in one save and one undo (QB6 tiling, data rows only, outside / read-only / refused / too long counted,
  refused cells blinking, too big writes nothing, the block written selected); Delete / Backspace on a block clears it.
  The page's own copy pastes back its exact values. Pasted HTML (only without plain text) is read in an inert
  document, text only, by a chunk loaded on demand. `range({ canCopy, guard, raw, maxPaste })`; API `copy`, `cut`,
  `paste`, `erase`; event `rangeCopied` (counts only). Ten texts in `locales/{en,fr,ar}-range`. Sizes: `dom/range`
  4 787 B gz (budget 4 500 → 4 800, S11b-Q3), its HTML reader 422 (500), texts 319 / 366 / 500.
- Phase 5 step 11a: **`@dzgrid/dom/range`**, selecting a block of cells (docs/behaviors/range-selection.md; owner QB1,
  QB2, QB7, S11-Q1–Q6). `range({ drag })`: Shift+arrows, Shift+Home/End, Ctrl+Shift+arrows and edges, Shift+PageUp/Down
  (the grid's own moves, mirrored right to left; never into the header), Ctrl+A / Cmd+A (every cell shown, by the
  physical key), Shift+Space (the row), Escape; a press and a drag of the mouse or a pen (the focus to the moving corner
  at the release), Shift+click and Shift+drag, the view scrolling near the edges (logical, scaled scrolling included),
  the click after a drag swallowed. The tint and the logical edges `dzg-cell--range`, `--rs`, `--re`, `--rt`, `--rb` on
  the mounted cells at each paint (pinned segments, spans by their origin, details and fillers never, the tree's pinned
  parents tinted without `aria-selected`, the editor's cell left alone); `aria-selected="true"` on the block's data
  cells only; the size said after a 400 ms pause; the block dropped, said once, by a sort, filter or search (« the
  order changed »), a page, a column hidden, moved or pinned, rows that lose a corner, a plain move or press. API
  `get / set / clear / box`, event `rangeChanged`. Texts `locales/{en,fr,ar}-range`; theme
  **`@dzgrid/theme/range.css`** (inset box-shadow edges, `--dzg-range-bg`, `--dzg-range-edge`; forced colours). Base:
  `GridContext.multi` (`aria-multiselectable`; Shift+click on a cell left to the block), `RowRenderer.spawned`.
  The drag is the mouse's (a pen scrolls, like a finger); a cancelled drag gives back the block from before it.
  Sizes: `dom/range` 2 949 B gz over the DOM base (budget 4 500), base 21 566.
- Phase 5 step 10, Part B begins: blocks of cells, the clipboard and the fill handle, the pure half (sheets
  docs/behaviors/range-selection.md, clipboard.md with its table of Excel cases, fill.md; a11y protocol §20; owner
  decisions QB1–QB10). New entry **`@dzgrid/core/range`** (2 897 B gz over the core, grant 4 000; review: real currency codes only, bidi marks, a leading BOM, the `'=x` guard, midnight days, bulk clears): `rangeBox`,
  `boxRows`, `boxSize` (a block by row keys and column ids, dropped when a corner leaves; details, fillers and loading
  rows count for nothing); `encodeTsv` / `decodeTsv` (CRLF after every row, quotes only around TAB, CR, LF and `"`;
  lenient reading that never fails); `copyMatrix` (the CSV export values with a tab, through the edit overlay: the
  locale's decimal mark, ISO days, wall-time instants, labels, the formula guard, `="0123"`; headers on request);
  `planPaste` and `PASTE_MAX` (the spreadsheet's shape rule, data rows only, a detail never uses a line, outside
  counted, over 100 000 cells nothing); `pasteText` (a currency sign removed in a number column; our guard and
  identifier mark read back); `fillTarget` / `planFill` (number and day series with one step, rounded to the source's
  decimals; repeats otherwise; Ctrl swaps; backwards). Base `@dzgrid/core`: types only — `CellAddr`, `CellRange`,
  `SaveOrigin` gains `cut`, events `rangeChanged` and `rangeCopied` (counts, never values); 28 916 B gz, unchanged.

- Phase 5 step 9, editing from Angular (docs/behaviors/edit-angular.md, angular-parts.md « Editing »): `edit()`,
  `editors()` and `listEditor` go in `[features]`; a live `[save]` input (the grid's save from its first value;
  `missing-feature` at `save` without `edit`); outputs `(cellEdited)`, `(saveFailed)`, `(orderStale)`,
  `(undoChanged)`; `DzgController.edit()` (the grid's `EditApi`); editors as templates (`<ng-template dzgPart="x"
  slot="editor" let-c>`, `c.reads(() => input)` for what Enter, Tab and a click elsewhere keep) or components
  (`componentPart('editor', C)`, `DzgEditorComponent` with `read()` and `focus()`); `DzGridDefaults.features`. With
  zone.js, one gesture's events reach the outputs in one zone entry. A read-only app imports no editing code. The
  Angular example gains an editable « stock » screen loaded on demand (`?screen=stock`); its ceiling is 92 000
  (owner S9-Q7). `@dzgrid/angular` 6 743 B gz (budget 6 793). A `read()` that throws: reported, nothing kept, the editor closed.

- Phase 5 step 8, undo and redo in the DOM, trees, details and nested grids (docs/behaviors/edit-undo.md,
  editing.md « Built at step 8 », master-detail.md): Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z (and Cmd+Y) on a cell or a
  header, matched on `key` first (AZERTY) and on `code` when the key is not a Latin letter (an Arabic layout); the
  focus to the first cell given back, revealed clear of pinned columns, sticky header rows and sticky parents; a
  cell not shown is given back where it is; one sentence (eight new required keys of `locales/<lang>-edit`:
  `edit.undone`, `edit.undoneMany`, `edit.redone`, `edit.redoneMany`, `edit.undoSkipped`, `edit.redoSkipped`,
  `edit.nothingToUndo`, `edit.nothingToRedo`). `tree({ structure })`: the columns that feed the tree read-only (a path
  tree's own column by default). The tree column's field starts after the indent and the chevron (`edit.css`,
  `--dzg-tree-pad`); the edited name is the one said. A nested grid whose panel goes while it saves stays alive off
  the page until the answer and comes back as it was (`EditSeam.busy`).

### Changed

- `api.undo()` / `api.redo()` of `@dzgrid/dom/edit` now do what the keys do: the focus moves to the cell given back
  (into the grid), it is revealed, and the sentence is said; the gesture's source is `api`.

- Phase 5 step 7, saves in the DOM end to end (docs/behaviors/edit-save.md « Built at step 7 »): a failed cell
  reopens with the refused value (F2, Enter, a double click); a row removed while edited is said once
  (`edit.rowRemoved`, now in `locales/<lang>-editors`), a hidden one is kept and saved; on server pages a page or a
  query asked while a field is open sends the typed text at once; the failed reason in a tooltip on hover and on
  focus (it replaces the column's own); a network cut says « serveur injoignable » (`edit.reasonNetwork`, a new
  required key of `locales/<lang>-edit`); on a server grid « remis en ordre » is said at the answer, never after a
  failure; `api.reapply()` scrolls the focused cell into view. `motion()`: `onCell` reasons `saving`, `saved`,
  `failed` and the saved flash. Base: `EditSeam.tip`, `TipFor.said`, the column tooltip reads the shown value.
  Theme: the saving border uses `--tz-warning` (not the focus ring's accent) and runs inside the focus ring;
  `contrast.css` gives it its own colour; `check:contrast` pairs may require a hue gap (`hue`).
- `@dzgrid/dom/editors` part 2 (Phase 5 step 6; editors.md 6–19): day and instant fields (opening text in the locale's
  order and the grid's digits, the written-value rule, `role="combobox"`), a tzslot calendar in a modal dialog loaded
  on its button only (Alt+ArrowDown; the hour/minute menus of the clock-change days; loading line, Retry;
  `editors({ calendar, loadCalendar, dateMessages })`); yes/no cells toggled by Space, Enter, a double click or tap;
  the list editor in its own entry **`@dzgrid/dom/editors-list`** (`editors({ list: listEditor })`: an APG combobox,
  folded type-ahead with Arabic, a value not in the list, 500 options at most); the application's editor, a part of
  the new slot **`editor`** (`keep`, `cancel`, `refuse`, `own`; `EditorHandle.read`); four texts (`edit.calendar`,
  `edit.calendarLoading`, `edit.calendarFailed`, `edit.optionNotInList`); `edit.css` rules for them.
- `@dzgrid/dom/internal` exports the lazy loader (`once`, `notice`), moved from the filters (not copied).

- `@dzgrid/dom/editors` (Phase 5 step 5; docs/behaviors/editing.md, editors.md, edit-validation.md):
  `editors({ enterMoves?: 'down' | 'stay', tab?: 'cell' | 'grid' })`, with `edit()`. Text and number fields
  over a cell (`.dzg-field`, named « column, row », `maxLength` 1 000 or `edit.maxLength`, numbers opened as
  typed: the locale's decimal sign and digits, no groups); opened by F2, Enter (after a part that takes the
  focus), a printable character (AltGr; Option on a Mac), an input method (opened empty, the composition lands
  in it), a double click or a double tap; kept by Enter / Shift+Enter (down / up as the arrows), Tab / Shift+Tab
  (the next editable cell in reading order, or `tab: 'grid'` leaves), a blur (one task later); Escape gives
  up; Delete and Backspace clear. A refused value keeps the field open: `aria-invalid`, a bubble below or above
  the cell (`.dzg-bubble`, top layer, never over the field), the cell's refusal, one assertive sentence; a blur
  drops it (O1). Events `editingStarted { key, column, start }`, `editingStopped { key, column, kept, via }`.
  Texts `@dzgrid/dom/locales/{en,fr,ar}-editors` (types `EditorsMessages`, `EditorsMessageKey`;
  `EDITORS_KEYS`). Missing `edit()`: one `missing-feature` warning, nothing taken. Budget 4 350 B gz.
- `@dzgrid/theme/edit.css`: the field (the cell's font and padding, opaque in the row's colour, a 2 px inset
  ring, numbers at the end, a dashed refused outline) and the bubble (a « ! » sign at its inline start); forced
  colours. Ceiling 1 350 → 1 700 (owner S5-O2).
- `ColumnDef.editable` (`true`, or a rule `(row, context)`: only `true` means yes) and
  `ColumnDef.validate(value, row, context)` (run by `@dzgrid/core/edit`); an `editable` of another type
  is a warning `invalid-column` at `columns[i].editable`, the column kept and read-only (a `validate`
  that is not a function is told by `@dzgrid/core/edit`, at `columns.<id>.validate`). Type `EditableRule`.
- `@dzgrid/core/edit` (Phase 5 step 3; docs/behaviors/edit-save.md, edit-validation.md, edit-undo.md):
  `createEdits(kernel, { ctx, save?, abort? })`, the edit controller of one grid: an overlay the rows
  read (`reader`, installed with `edits.reader`; the host's rows are never written), `check`, `commit`
  (one gesture: one generation, one request; refused cells returned, unchanged cells dropped), `state`
  (`pending`, `saving`, `saved`, `failed` with the refused value, reason and code), `dirty`, `undo` /
  `redo` (100 gestures; a cell changed since, no longer editable or gone is skipped and counted),
  `canUndo` / `canRedo`, `setSave`, `destroy`. Saves one at a time per cell, the newest waiting change
  replacing an older one; a refusal goes back to the last saved value, else the source; the app's
  `save` may refuse only some cells of a request by naming them (`error.cells`). Pure `parseInput` and
  `checkValue`. Column rules `ColumnDef.edit: { required, min, max, pattern, options, maxLength?,
  editor? }` (type `EditChecks`); refusal codes `parse`, `day`, `invalid-instant`, `wall-time-skipped`,
  `wall-time-ambiguous`, `options`, `invalid`, `required`, `min`, `max`, `pattern`, `read-only`, or
  `validate`'s own. Kernel events `cellEdited`, `editStates`, `saveFailed`, `undoChanged` (sent by the
  controller only); type `SaveOrigin`. Without an `abort` factory `save` gets a signal that never aborts. Budget 3 100 B gz over the core (owner S3-O4).
- `@dzgrid/dom/edit` (Phase 5 step 4; owner S4-O1): `edit({ save?, savingBorder? })`, editing wired to the
  grid: the controller of `@dzgrid/core/edit` on the grid's rows; the cells read through it; save marks
  written at each paint on the mounted cells (`dzg-cell--pending | saving | still | saved | refused |
  blink-a | blink-b | failed`), with the DOM's clocks (saved 1.5 s; refusal 0.5 s showing the refused value,
  blinking at most once a second; saving border still after 5 s); descriptions (`edit.saving`,
  `edit.failedMark`); rows that no longer pass the filters muted (`data-dzg-stale`, not on server pages,
  S4-O3); a reapply button on sorted or filtered headers (F2 reaches it, Enter on the header still sorts);
  sentences (`edit.saving` once per gesture, `edit.saveRefused` assertive, `edit.stale` once,
  `edit.reapplied`). `feature.api(grid)`: `commit`, `undo`, `redo`, `canUndo`, `canRedo`, `state`,
  `reapply`, `setSave`, `refuse`. Texts `@dzgrid/dom/locales/{en,fr,ar}-edit` (types `EditMessages`,
  `EditMessageKey`, `ValidationCode`).
- `@dzgrid/dom` seams for editing: `FeatureHandle.edit` (`EditSeam.read`, what a cell shows),
  `RowRenderer.touch(keys)`, `GridContext.openEditor` / `closeEditor` / `editor` (retained-row contract 5–6;
  `lost` when the cell leaves), `aria-readonly` per cell as soon as a visible column is editable (the grid
  keeps it otherwise), the tooltip's `aria-describedby` by token; the grid repaints on `orderStale`.
- `@dzgrid/theme/edit.css` (+ `edit.unlayered.css`, source `edit.scss`; owner S4-O2): the marks, the
  running border (CSS, `@property --dzg-turn`, reversed right to left), the refusal blink, the muted row's
  funnel, the reapply button, reduced motion, `data-motion="off"` and forced colours. New reserved colour
  `--dzg-saved-color` (falls back to `--tz-success`); 10 contrast pairs.
- `editableAt(node, column, context, locked?)`: data rows only (never a detail, filler or loading row).
- Kernel: commands `edits.reader` (refused `invalid-reader`), `rows.reapply` (`reapply-off`),
  `context.app`; event `orderStale { stale }` on each flip; `kernel.reader`, `kernel.app`,
  `kernel.orderStale`, `kernel.editable(key, column)` (a rule that throws says no, one warning
  `invalid-column` detail `threw` per column). New problem code `edit-structure` (a tree's structure
  column marked editable; `lockColumns` in `@dzgrid/core/internal`).
- `ClientOptions.app` / `ModelEnv.app`: the context at creation.
- `RowModel.setReader?(reader, changed?)`, `reapply?(source?)`, `orderStale?`, `setApp?(context, source?)`;
  on the client model and `sourceRows` (a server-run sort, filter or search marked stale, asked again once
  on reapply).
- Custom filter kinds: `test(state, ctx, context?)` and `wire(state, ctx, zone, context?)` receive the
  grid's `settings.context`; a new context runs only the custom filters again (a changed wire: one
  request). `settings.context` reaches the kernel at creation and on each change of identity.

- Theme (showcase themes, part 1; `docs/behaviors/theming.md`): two showcase themes,
  `@dzgrid/theme/midnight.css` (dark elegant, with a light twin) and `@dzgrid/theme/clinic.css` (light
  medical, with a dark twin), applied to the page on import or to one area with
  `data-dzg-skin="midnight|clinic"`; every colour given by hand, light and dark, contrast-checked.
  Unlayered copies `@dzgrid/theme/dzgrid.unlayered.css` and `contrast.unlayered.css` for apps whose
  reset is unlayered (Tailwind 3, Bootstrap). New knobs read at their point of use: `--dzg-line` (rule
  width), `--dzg-pill-radius` (badge corners), `--dzg-header-size`, `--dzg-header-tracking` (no
  spacing in Arabic), `--dzg-select-bar` (a selected row's bar at its inline start, `Highlight` in
  forced colours); `--dzg-saving-color` and `--dzg-refused-color` reserved for the save states (contrast
  pairs checked now). `check:contrast` reads `oklch()` and checks both showcase themes by default.
- Theme (showcase themes, part 2; `docs/theme-in-3-lines.md`): bridges `@dzgrid/theme/tailwind3.css`
  (Tailwind CSS 3, through `theme()`) and `@dzgrid/theme/bootstrap.css` (Bootstrap 5.3's `--bs-*`
  variables, following `data-bs-theme` on the root or any element), beside the revised `tailwind.css`
  (Tailwind CSS 4); each maps the ten colours, the font and the corners and passes every contrast pair
  with the framework's default colours, light and dark.
- `settings.rowClass({ row, key, context })`: classes for a data row from its data (live; Angular
  `[rowClass]`, owner T8: `@dzgrid/angular` budget 6 250 → 6 300); `columns[].ui.headerClass`: classes for a column's header cell; `badge({ classes })`: a
  class per tone. Type `RowClassContext`. Same rules as `ui.cellClass` (diffed, `dzg-` ignored).
- `settings.rowHeight` (owner D1, `docs/behaviors/virtual-scroll.md` « Row height »): the row height in px
  at 16 px text, over the density's; from 24 to 1 000, grown with the reader's default text size, header
  rows following; live. Anything else is a warning `invalid-setting` at `settings.rowHeight` (new problem
  code; the same value again is not told again) and the density's height is used; `null` is no value.
  Angular `[rowHeight]` and a `provideDzGrid` default (owner D3: `@dzgrid/angular` budget 6 300 → 6 350).
- Playground: two showcase demos, « Commandes et sous-commandes » (`orders.html`, owner D4: sub-orders as
  child rows of the same grid under one header, on a background the app sets with `--orders-child-bg`) and « Ressources humaines »
  (`hr.html`: an org tree with pinned managers, 52 px two-line rows, department pills, flags, contact
  links), each in French light Clinic and Arabic dark Midnight; checked by `npm run test:browser -- --only demos`.

### Changed
- The five reading codes' texts (`validation.parse`, `day`, `invalid-instant`, `wall-time-skipped`,
  `wall-time-ambiguous`) moved from `locales/*-edit` to `locales/*-editors`; `EDIT_KEYS` no longer asks for them
  (a server's reading code without them reads `validation.invalid`). `EditApi` gains `alert(text)` and
  `reason(column, code)`; `EditSeam.api` hands it to the editors.
- The editor host left the DOM base (`GridContext.openEditor` / `closeEditor` removed; `@dzgrid/dom/editors`
  holds it); the base gains `GridContext.step(intent)`; the tooltip is not shown on a cell being edited.
- The grid's CSS sits in the cascade layer `dzgrid` (owner T1): `dzgrid.css` in `dzgrid.theme`,
  `contrast.css` in `dzgrid.contrast`, `tailwind.css` in `dzgrid.bridge`, each file opening with
  `@layer dzgrid.layout, dzgrid.theme, dzgrid.skin, dzgrid.bridge, dzgrid.contrast;` (a bridge after
  a showcase theme, owner T9: an app using a bridge sees its framework's colours); the layout
  `@dzgrid/dom` injects (and the exported `LAYOUT_CSS`), and each feature's, in `dzgrid.layout`. An
  application's classes now win over the grid's look without `!important`, whatever their specificity.
  The two rules restyling tzslot's date panel stay unlayered (tzslot's sheets are). More contrast also
  applies inside a `[data-dzg-skin]` area. `npm run build:theme` builds the four CSS files from
  `dzgrid.scss` and the new `contrast.scss`.
- Budget ceilings (owner T7): `@dzgrid/theme` up to 3 050, `@dzgrid/dom` up to 21 980; new entries
  `@dzgrid/theme/midnight.css` and `clinic.css` at 650 B gz each, `tailwind.css`, `tailwind3.css` and
  `bootstrap.css` at 500 each.
- `@dzgrid/theme/tailwind.css`: `--dzg-font` is now a valid `font` shorthand (`400 0.875rem/1.45
  var(--font-sans)`; a family list alone was dropped by the browser, the grid inherited the page's font).
  It must be imported in the CSS Tailwind builds (Tailwind emits only the variables it sees used).
- Development: Tailwind CSS 4.3.3 (with `@tailwindcss/cli`), Tailwind CSS 3.4.19 (as `tailwindcss3`) and
  Bootstrap 5.3.8 are root devDependencies, only run by the browser suite; never shipped.
- Row heights follow the browser's default text size (`font-size: medium`, read off the live region), no
  longer the page's root font size; never under 24 px.
- A live change of the row height (density, `rowHeight`) keeps the focused row in view when it was in
  view (WCAG 2.4.11), under a tree's pinned parents; the row at the top of the view still keeps its place.
- `ClientModel.reapply()` is told with the source given, `api` by default (it was always `user`).
- While the order is stale after an edit, any rerun (a sort, a filter, the search typed on, the
  language, the columns) is a whole one with the edits; a host update that moves rows puts everything
  in order, the edited rows too.
- `@dzgrid/core/server` budget 6 000 → 6 100 B gz (owner decision S2-O4).

### Fixed
- An open field took Home, End, PageUp and PageDown only by the browser's default: in Chrome on macOS Home/End
  scrolled the grid instead of moving the caret (End ran to the last row, the edit kept out of sight); the field now
  moves the caret itself and the grid never scrolls under it.

## [0.2.0] - never published (part of 1.0.0)

Prepared at the Phase 4 close (2026-10-22), **not published**: the four packages at 0.2.0, their
`@dzgrid/*` peers on `^0.2.0`. Phase 4 Parts A–C: the tree view, master/detail, sticky parent rows
and the floating filter row shown and hidden live (Part D, editing, comes next — now Phase 5). New entries:
`@dzgrid/core/{tree,tree-lazy,detail}`, `@dzgrid/dom/{tree,tree-lazy,detail}`,
`@dzgrid/dom/locales/{en,fr,ar}-{tree,detail}`. Published on the owner's word only, under the same
conditions as 0.1.0.

### Added — core (`@dzgrid/core`)

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
- **Server children**: `sourceRows({ fetch, children })`, `ChildRequest` / `ChildResponse`; one gate
  channel per parent, the query epoch in each request; a new epoch closes every row. A server's rows
  can now be a tree: its pages count the roots, a parent's children come whole.
  `SourceModel.diagnostics.childFetches` (lazy trees only).
- **`@dzgrid/core/detail` (Phase 4, step 8)**: `detailShape({ height, initial, sizes })`, a row
  shape that puts one detail row (`DetailNode`, key `x:` + the master's key, the master's data)
  right after each open master, over the filtered, sorted and paged rows; opened and closed by
  `rows.expand` / `rowExpanded` like a tree row. `height`: a number (default 240), a function of the
  master's row, or `'auto'` (240 until the DOM measures it, `sizes`). The rows give the details'
  display indices and heights (`details`, `heights`) for `sparseRowLayout(rows, h, { at, heights })`:
  a row layout where every row is `h` tall but those few, found by binary search over running sums
  (O(D) memory, `setHeight` and a batched `setHeights` O(D)). `detailConflicts({ spans, tree,
  depth })`: spans and a tree are refused beside details, a nested grid deeper than 3 is told
  (`unsupported-combination`).

### Added — DOM (`@dzgrid/dom`)

- **`@dzgrid/dom/tree` (Phase 4, step 4)**: `tree({ parentId, column?, indent?, initial?, filter? })`,
  `TREE_KEYS`; role `treegrid`; rows carry `aria-level`, `aria-posinset`, `aria-setsize`,
  `aria-expanded`, `data-context-row` (a filtered tree's muted ancestor); the tree cell (an indent per
  level, a decorative 24 px toggle, the chevron mirrored in RTL); keys per `docs/behaviors/tree-keys.md`
  (forward opens, back closes or goes to the parent, `*` opens the siblings, all mirrored in RTL); the
  user's toggles said (`tree.expanded`, `tree.collapsed`, `tree.expandedSome`); a parent with no child
  left said by its own `tree.empty` (« {name}, aucune ligne »). New problem code
  `tree-column-not-first`. Bundles `locales/{en,fr,ar}-tree`. Base seams for features:
  `GridFeature.shape?()`, `FeatureHandle.keys?(e, at, owner)`, `g.layoutFor` / `g.layout`,
  `g.viewBlock`; a toggle anchors the top row.
- **DOM**: a row that is not a data row carries `data-kind` (`group`), no `aria-selected`, no box;
  a click on it only moves the focus. Theme: `.dzg-box[hidden]` not drawn. Playground « Arbre »:
  a shape switch (parent / nested / path).
- **Tree motion (Phase 4, step 6)**: `motion({ effects: { expand } })` (default on). Opening a tree
  row: the rows below glide down, the children shown fade in (at most 20); closing: the rows below
  glide up, nothing on the hidden rows. Skipped beyond 60 moving rows, for a row moving more than a
  screen, after a scroll between the change and the paint, under reduced motion and with
  `motion: false`. `onRow` is told `'moved'` / `'entered'` for a toggle too. Theme: the toggle's
  chevron turns (CSS, 120 ms) in a hovered or focused row, only where motion is welcome.
- **Lazy children (Phase 4, step 7)**: `tree({ parentId, lazy: lazyChildren({ has, load }) })` from
  the new entry `@dzgrid/dom/tree-lazy` (core: `@dzgrid/core/tree-lazy`, `lazyShape`). A row `has`
  declares shows a closed toggle; opening it shows a loading row (`LoadingNode`, `kind: 'loading'`,
  `aria-busy`, `aria-setsize="-1"`), then its children, or an error row with a Retry button (Enter on
  the row retries). Closing aborts the load (`AbortSignal`); loaded children are kept until
  `setRows` or a refresh; expand-all and `*` never load. Words from the base bundle; theme:
  `.dzg-retry`, the loading row's words muted.
- **Sticky parent rows** (`@dzgrid/dom/tree`, `docs/behaviors/tree-sticky.md`): while children
  scroll, their ancestors stay pinned under the header, outermost first, pushed up when their
  subtree ends. `tree({ sticky })`: how many (the nearest), `0` none, `3` by default, never more
  than half the view. Copies show text only, carry no row semantics (`aria-hidden` layer), are never
  focused; a click goes to the real row (focus, scroll, no selection), the chevron closes it, the box
  does nothing. Base seams: `RowRenderer.spawn(layer)`, `GridContext.inset` / `insetFor` — a row
  brought into view by the focus is placed under its own pinned parents (WCAG 2.4.11). Theme: the
  copies in the rows' weight, a 2 px line under the stack (forced colours too); not printed.
- **Variable row heights and the detail row in the DOM base (Phase 4 step 9)**: one row layout per
  set of rows shown (`g.layoutFor` from a feature, kept while the rows and the row height are the
  same), read by the paint, `ensureVisible` and the page keys; a height change on the same rows
  keeps the top row (the end stays the end); over variable rows PageUp/PageDown move by a distance.
  A `DetailNode` row is drawn as one cell, `.dzg-dcell` (`role="gridcell"`, `aria-colspan` over every
  column and the box, named after the master's row header), `RowView.slot`, as wide as the view and
  kept at its start under a horizontal scroll; `data-kind="detail"`. It is one focus stop
  (`MoveShape.whole`): Up/Down reach it, Left/Right/Home/End stay, the column is kept across it;
  Enter/F2 call its part's `focus()`, Escape from inside comes back. New part slot `'detail'`
  (`SlotContext['detail']`; core `PartSlot` gains `'detail'`; a `'detail'` part without the detail
  feature is told `missing-feature`); the base destroys the part when its row leaves the window.
  Theme: the focus ring on the detail cell (forced colours too). The feature itself is step 10.
- **`@dzgrid/dom/detail` (Phase 4 step 10)**: `detail({ part, height?, initial?, column?, nested? })`
  hands the detail rows to the grid and places them; a chevron in the masters' first column (click;
  forward opens, back closes, mirrored in RTL; `aria-expanded` on that cell), the user's openings said
  (`detail.expanded` / `detail.collapsed`); the part mounted in each panel when it is first shown and
  destroyed when it goes (context: the master row and keys, the height, `depth`, `leave()`); a part by
  name from `settings.parts`; the panel named « Details of {name} » (`detail.label`, through a named
  group); `height: 'auto'` measured by one `ResizeObserver`, a frame's changes in one `setHeights`, kept
  after a close and across a new row height; spans and a tree beside it told
  (`unsupported-combination`). `nestedGrid({ settings, keep?, onGrid? })`: a grid in each panel, its own
  keys, scroll and focus; Enter/F2 in, Escape out one level; each master's sort, filters and scroll
  remembered (LRU, 20); past 3 levels `unsupported-combination` (`detail.depth`); the wheel goes to the
  inner grid first, to the outer grid at its edge (also above the scroll cap). Bundles
  `locales/{en,fr,ar}-detail`. `SlotContext['detail']` gains `depth?` and `leave?()`. Theme: the panel's
  surface (`--dzg-detail-bg`), rules and padding, forced colours. Playground « Maître/détail ».
  Base: a column header's tooltip is no longer shown for a nested grid's header of the same id.
- **The floating filter row shown and hidden live (Phase 4 step 12)**: `filters().floating` with
  `get()`, `set(on)` and `bind(button)` (the host's button as a toggle: `aria-pressed`,
  `aria-controls`, the bundle's name on a button without words of its own; returns the unbind; before
  or after the grid). Hiding keeps the filters (the header's mark shows them), applies text still
  waiting for its pause and moves a focus in the row to the column's header; showing restores each
  field from the filters in force without an event. The user's toggle is said (« Ligne de filtres
  masquée / affichée »). New texts `filter.floatingToggle`, `announce.floatingHidden`,
  `announce.floatingShown` in `locales/{en,fr,ar}-filters`. Playground: a « Ligne de filtres » button
  on the filters demos and the tree demo. Angular: `<dz-grid [floatingFilters]>` (one-way, live; a
  user's toggle is never overwritten until the value changes).

### Added — Angular (`@dzgrid/angular`)

- **Angular, trees and master/detail (Phase 4 step 11)**: `<dz-grid [(expanded)]>` (the rows open,
  `ReadonlySet<RowKey>`, written as the host, the user's and the data's changes back, no echo) and
  `(rowExpanded)`; `tree()`, `lazyChildren()` and `detail()` through `[features]`; detail panels as
  `componentPart('detail', C)` or `<ng-template dzgPart slot="detail">` named by `detail({ part })`, their
  `emit` → `partAction { slot: 'detail' }`; `<dz-grid [dzgNested]="cell()">` for a grid inside a panel
  (Escape back to the panel's cell, one level; `detail.depth` past three levels).

### Added — theme, measures and tooling

- **Theme**: the tree's toggle and chevron (`--dzg-toggle-fg`, turning in 120 ms where motion is
  welcome), the muted ancestor (`--dzg-context-fg`), the sticky parents' line, the detail panel
  (`--dzg-detail-bg`, rules, padding) and its focus ring, `.dzg-retry`, the loading row; forced
  colours for each; 176 contrast pairs checked (156 at 0.1.0).
- **The million-row tree**: a seeded parent-id tree of ten levels (`perf/profiles/tree.ts`), bench
  lines in Node (build, expand all, filter) and Chrome (`npm run bench:browser -- --only tree`:
  first render, a wheel scroll over the open million, toggles, Ctrl+End); the playground's « Arbre »
  takes `?rows=1000000`; the « Animations » demo has an « Arbre » section.
- **Tooling (Phase 4 close, step 13)**: budgets reset by `scripts/rebudget.mjs` to the measure
  + 10 %, never above the owner's grants (decision Q17); the real Angular example's ceiling 90 000 B
  gz; `packages/dom/test/support/slow.ts` (`SLOW_TEST_MS`, `WALK_TEST_MS`) for tests that loop on
  purpose (never a skip); the release tests check every file a tarball's exports name.

### Changed

- **Breaking — `RowNode` is a union** (`DataNode | GroupNode | DetailNode | LoadingNode`): narrow
  by `kind` before reading `data`; click events carry a `RowNode`. `DisplayedRows.nodeAt` may give a
  filler, a detail or a loading row.
- **Breaking — `ModelChange.kind` gains `'expand'`**: a `switch` over model changes that claimed to
  be exhaustive must handle it (a toggle re-flattens only: no sort, filter or request).
- **Breaking — variable row heights**: the DOM base no longer assumes `index × rowHeight`. A feature
  may give the row layout through `g.layoutFor(d, h, was)` (`was`: the previous layout, to keep
  measured heights); the paint, `ensureVisible`, the wheel and the page keys read `g.layout`.
  Uniform rows behave as before.
- **Breaking — `canSelect` and `SelectionRule` receive a `DataNode`** (not a `RowNode`).
- **Breaking — `filters()` needs three more texts** (`filter.floatingToggle`,
  `announce.floatingHidden`, `announce.floatingShown`) and **`tree()` needs `tree.empty`**: a host
  with its own bundle must add them, or the feature throws a TypeError naming the missing keys. The
  floating row is no longer fixed when the grid is made.
- `npm run example:build` installs the tarballs just packed: the example's lock entries for the
  `@dzgrid` packs are dropped first (their pinned integrity made npm reinstall its cached old copy).
- `DisplayedRows` gains optional members: `parentOf`, `levelAt`, `dataCount` (the rows select-all
  takes), `matchedAt` (false for a filtered tree's muted ancestor).
- Select-all and the header box skip fillers, details and a filtered tree's muted ancestors.
- Browser pages with a row shape: the page is cut first, then shaped (details follow their masters
  on their page and are not page rows; a tree still refuses pages). The filter's layer of toggles is
  a tree's only: a detail opened under a filter stays open when the filter changes, and collapse-all
  closes every detail. `allRows` of a shape without its own is the filtered, sorted rows (no
  detail). `csvRows(…, 'displayed').count` leaves details out.
- `rows.expand` refuses only data keys that do not exist (`unknown-row`); another key the rows do
  not know (a filler) is a no-op, so a hidden filler can be opened by the application.
- `TreeOptions.parentId` is optional (one of the three shapes).
- `RowNode` gains `LoadingNode` (narrow by `kind`); `RowShape` gains `attach?` and `refresh?`;
  `ModelEnv` gains `shape?`; `TreeRows` gains `kidsOf`, and `childrenAt` says -1 for a lazy parent
  not loaded. `tree()` with a server's rows is no longer refused.

## [0.1.0] - never published (part of 1.0.0)

Prepared at the Phase 3 close (2026-10-21) and tagged `v0.1.0` locally, **never published** (0.2.0
follows it; no 0.1.0 exists on npm): the four packages `@dzgrid/core`,
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
