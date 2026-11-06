# Phase 9 — decisions

## Cell context menu (owner, 2026-11-02)

Started on its own, before Phases 7 and 8 (no dependency on them). Plan: `context-menu-plan.md`.
- Q-CM1 A: no menu on a touch long-press (iOS never sends it); an app may add its own ⋮ button that opens it.
- Q-CM2 A: nothing to offer → the browser's own menu on right-click.
- Q-CM3 A: « Pin row » copies the row to the top (or bottom) band and keeps it in the body; the app is told (`onPin`).
- Q-CM4: sizes accepted as estimated in the plan (new `context-menu`, `internal` with the shared menu list, `popup`,
  `tree`, `fill` raises, locales and `menu.css` lines; `column-menu` shrinks). The audit screen (K.8) must not move;
  if it would, the shared code becomes its own entry `@dzgrid/dom/menu`.

## Cell context menu — measures (2026-11-02, built, not committed)

Gzipped, minified, `npm run check:size` (accepted lines applied):
| Line | Before | Measured | Line now |
|---|---|---|---|
| `@dzgrid/dom/internal` (the shared list moved in; the popup host outside it) | 1 201 / 1 250 | 3 609 | 3 700 (granted) |
| `@dzgrid/dom/popup` (an `inline-end` popup flips; the submenu's press rule lives in the list, 0 B here) | 1 626 / 1 650 | 1 633 | 1 700 (granted) |
| `@dzgrid/dom/tree` (`api`: state, toggle) | 4 069 / 4 080 | 4 194 | 4 200 (granted 4 150, +2 % rule) |
| `@dzgrid/dom/fill` (`along`, `can`) | 3 143 / 3 150 | 3 174 | 3 200 (granted) |
| `@dzgrid/dom/column-menu` (its half only) | 4 297 / 4 300 | 2 963 | 4 300 kept (pinned by a step 12 test) |
| `@dzgrid/dom/range` (Mac Ctrl press) | 5 037 / 5 200 | 5 050 | 5 200 |
| `@dzgrid/dom/context-menu` (new) | — | **2 325** | 2 100 (granted) — **over by 225 (+10.7 %): owner** |
| `locales/{en,fr,ar}-context-menu` (new) | — | 309 / 366 / 444 | 350 / 400 / 500 |
| `@dzgrid/theme/menu.css` (new: the whole list's rules + the submenu mark) | — | **716** | 500 (granted) — **over by 216: owner** |
| `columns.css` | 1 111 | 1 111 (byte for byte the same) | 1 200 |
| DOM base, filters, Angular | 22 432, 10 207, 7 436 | 22 428, 10 207, 7 436 | unchanged |
| K.8 audit profile | 85 287 | 85 280 | 90 000 — did not move (no `@dzgrid/dom/menu` entry needed) |
| profile: both menus (recorded) | — | 8 791 | — |

The plan's 1 900 for the cell menu did not count its default items (≈ 650 B gz: the system clipboard, cut's guard,
pin and unpin); `menu.css` carries the list's rules whole (≈ 600 B), not only the new ones.
`check:api`: no export removed; « changed » (text) for `tree` (returns `TreeFeature`, a subtype) and for the column
menu's `MenuItem` / `MenuEntry` (a type parameter with today's type as default, `submenu?` added): `--accept` is the
owner's.
- Owner (2026-11-02): `context-menu` line **2 400** (measured 2 325; the default items ≈ 650 B), `@dzgrid/theme/menu.css`
  **750** (measured 716). `check:api`: accept `tree()` returning `TreeFeature` and the generic `MenuItem` / `MenuEntry`
  (nothing removed; existing code compiles).

## Filters, every kind (owner, 2026-11-02)

Plan: `filters-plan.md`. All in one pass for 1.3.0. Owner: A to every question.
- Q-F1 A: the advanced filter (opt-in, its own entry) and the column filters both apply (AND); an app wanting « one or
  the other » turns the column filter buttons off.
- Q-F2 A: « + condition » and « match case » only when the app enables them; up to 5 conditions.
- Q-F3 A: value list and condition stacked in one popup (stored as a `combined` AND, no new `multi` type).
- Q-F4 A: no typed rule with suggestions in this pass (later).
- Q-F5 A: a one-line bar above the grid summing up the rule, with « Modifier » / « Effacer »; the app can hide it.
- Q-F6: sizes accepted as in the plan's table (core 29 450, core/advanced-filter 1 250, core/server 6 450,
  core/state 1 600, filters / filters-base 11 400, set chunk 4 850, dom/advanced-filter 5 500, dom 22 500,
  dom/edit 4 200, Angular 7 600, filter locales 900 / 1 050 / 1 200, advanced locales 350 / 400 / 500,
  advanced-filter.css 650, K.8 kept at 90 000).

## Filters F0–F2 — measures (2026-11-02, built, not committed, **stopped: over a line**)

Gzipped, minified (`npm run check:size`; the accepted lines applied for these entries only, the others wait for F3+):
| Line | Before | Measured | Line |
|---|---|---|---|
| `@dzgrid/dom/filters` | 10 207 | **11 929** | 11 400 — **over by 529 (+4.6 %): owner** |
| `@dzgrid/dom/filters-base` (same shared code) | 10 207 | **11 886** | 11 400 — **over by 486 (+4.3 %): owner** |
| `@dzgrid/dom/filters: set (lazy)` | 4 499 | 4 499 (the list + condition is composed in the eager part) | 4 850 |
| `locales/{en,fr,ar}-filters` | 744 / 869 / 992 | 856 / 1 007 / 1 194 | 900 / 1 050 / 1 200 |
| `@dzgrid/theme` | 2 767 | 2 809 | 2 850 |
| K.8 audit profile | 85 280 | 87 338 | 90 000 |

Where the +1 722 B go: the rows' body (`several`: rows, join, add / remove, match case, focus, announcements)
1 034; a value list with a condition (eager `set.ts`) ≈ 190; « n conditions » ≈ 70; layout CSS ≈ 65; the texts' check
at setup and the grid's `maxConditions` warning ≈ 100; the rest is the per-instance forms. The plan's 1 100 counted
only part of the rows' body. `check:api`: nothing removed or narrowed (new: `FilterRowsMessageKey`, optional options
and column fields, optional keys in the filter bundles).
- Owner (2026-11-02, F1–F2 measured): `filters` and `filters-base` lines **12 000** (measured 11 929 / 11 886; the
  condition rows ≈ 1 034 B, kept in the eager part — option B, not a lazy chunk).
- Owner (2026-11-02): cost too high for now — **1.3.0 = the cell context menu + filters part 1 (F0–F2)**. The
  advanced filter (F3–F6, ≈ 8 sessions) is postponed until the owner's backend can read a multi-column rule.
- 1.3.0 (2026-11-02): the real Angular example's line 95 500 → 97 400 under the +2 % rule (measured 97 173 gz; the context menu and the condition rows).

## Next in Phase 9 (owner, 2026-11-03)

Order: **status bar** first, then the **filters panel** (added to Phase 9: every column's filter in one side panel,
the same forms as the popups), the **Excel export**, then **row dragging**. Owner wish for the panels: dockable like an
editor's tool windows — anchored at the start or the end side, at the bottom, or floating. To plan with the status
bar (owner questions first).

## Status bar and dock — owner answers (2026-11-03)

Plan: `status-dock-plan.md`. Owner: yes to Q-SB1…Q-SB5, sizes accepted as in the plan.
- Q-SB1: block figures by default (Count, Sum, Average, Min, Max) from 2 numeric cells; row counts if the app asks.
- Q-SB2: one strip with the pager: the figures first, the pager at the end.
- Q-SB3: nothing read out on its own; a « Lire les totaux » item in the cell menu (Shift+F10).
- Q-SB4: mixed formats → the plain number; one shared format is kept.
- Q-SB5: the dock's V1 after the status bar (start / end side, one panel per side, edge resize, collapse, saved in
  GridState); tabs, the bottom area (with the filters panel) and the floating window later.
- Sizes: statusbar 2 300, locales 250 / 300 / 350, internal 3 750, context-menu 2 450; dock V1: dock 3 400,
  core/state 1 700, columns-panel 4 800, dom/state 1 300, dock.css 650, locales 250 / 300 / 350.

## Status bar SB0–SB3 — measures (2026-11-03, built, not committed)

Gzipped, minified (`npm run check:size`), the accepted lines applied:
| Line | Before | Measured | Line |
|---|---|---|---|
| `@dzgrid/dom/statusbar` (new, over dom) | — | 2 105 | 2 300 |
| `locales/{en,fr,ar}-status` (new) | — | 238 / 268 / 322 | 250 / 300 / 350 |
| `@dzgrid/dom/internal` (the shared strip) | 3 643 | **3 799** | 3 750 asked → **3 800 by the 2 % rule** (+49, 1.3 %) |
| `@dzgrid/dom/context-menu` (« Lire les totaux ») | 2 400 (line) | 2 444 | 2 450 |
| `@dzgrid/dom/pagination` (on the strip) | 3 132 | 3 084 | 3 450 kept |
| `@dzgrid/core/range` (`rangeStats`) | 2 896 | 3 183 | 3 200 kept |
| `@dzgrid/dom` (base) | 22 428 | 22 434 | 22 440 kept |
| K.8 audit profile | 87 346 | 87 392 | 90 000 kept |

- The strip costs 154 B in `internal` (find-or-make, `--dzg-footer-size`, its observer); the plan counted 90. Each
  feature places its own hosts (pager's parts, status group, pager last), so `internal` holds no ordering code.
- The base's « `status` part without `statusBar()` » warning (`missing-feature`) was left out: it put the base 2 B over
  its guarded line. A `status` part registered without the feature is simply not drawn (parts.md).
- Owner Q-SB1 read literally: the count from a block (two cells), the sum, mean, min and max **from two numbers**.
- `check:api`: `SlotContext` gains the required member `status` (an interface the grid hands out, as `menuItem` in
  1.1.0); nothing removed. Accepted with `--only @dzgrid/dom#SlotContext`, **owner to confirm**.
- Found and fixed on the way: `scripts/test/release-review.test.ts` still expected packs of 1.2.x (its own comment says
  1.3.0 / 1.3.1-local): the regex now says 1.3.
- Review (2026-11-03, one reviewer, new code): 3 findings, each with a test first — a sum past the largest double gave
  NaN (now +Infinity, conformance `sum-overflow`); a column format Intl refuses threw in the paint (now the plain
  number, `invalid-setting` at `statusBar.numberFormat` once); « … » could stay after a block came back to the one last
  counted (not reachable today: each block is a new object; `busy` now cleared on a memo hit).

## Order changed (owner, 2026-11-03)

After the status bar: **Excel export first**, then find in grid (Ctrl+F), then row grouping (Phase 7) if the
screens need it; the dock and the filters panel later. The status bar's two points are taken as accepted (no
objection): `internal` 3 800 (+2 % rule), `SlotContext.status` added (check:api, additive).

## Excel export — owner answers (2026-11-03)

Plan: `excel-plan.md`. Owner: A to Q-X1…Q-X5, sizes accepted (core/xlsx 5 000, Excel DOM chunk 1 100, context-menu
2 500; export and its run chunk kept).
- Q-X1 A: dates in the user's Excel format (real Excel dates, sortable and filterable).
- Q-X2 A: merged values repeated on each row (Excel's sort and filter work); a true merge as an option.
- Q-X3 A: a tree as Excel's outline groups (+ / −, up to 7 levels), all open.
- Q-X4 A: an `xlsxStyle` hook filled by the app (no CSS class copying).
- Q-X5 A: past Excel's limits (1 048 576 rows, 16 384 columns) the export is refused with a clear message.
The owner opens two reference files (fr, ar) in a real Excel with a checklist.
- Owner (2026-11-03): `core/xlsx` line **7 100** (measured 6 898; lazy, loaded at the first Excel export only) —
  every feature kept. The context menu's new Excel text must be optional (a host's own `ContextMenuMessages` bundle
  keeps compiling).

## Excel export X0–X5 — measures (2026-11-03, built, not committed)

| Line | Measured | Line |
|---|---|---|
| `@dzgrid/core/xlsx` (new, over core) | 6 902 | 7 100 (owner A) |
| `@dzgrid/dom/export: xlsx (lazy)` (new) | 967 | 1 100 |
| `@dzgrid/dom/export` (eager) | 1 248 | 1 350 kept |
| `@dzgrid/dom/export: run (lazy)` | 5 111 | 5 300 kept |
| `@dzgrid/core/csv` (`readValue`, `wallMs`) | 1 893 | 2 000 kept |
| `@dzgrid/core/range` (shares the CSV writer) | 3 196 | 3 200 kept |
| `@dzgrid/dom/context-menu` | 2 481 | 2 500 |
| `locales/{en,fr,ar}-context-menu` | 333 / 390 / 478 | kept |
| K.8 audit profile | 87 657 | 90 000 kept |

- Lead decisions: widths `trunc(px / 7 × 256) / 256` (ECMA-376 §18.3.1.13: the stored width holds the 5 px padding;
  the plan's `(px − 5) / 7` would draw each column 5 px narrower); `format` absent for CSV (requests and events
  unchanged); `headerOf` not shared with XLSX's label (the range entry sits at its line), the two rules side by side
  in `csv/writers.ts`; a span whose origin column is not written counts its problems under the first column; the
  CSV oracle in `packages/core/test/xlsx/oracle.test.ts` (not `perf/`).
- `check:api`: additions only, accepted (owner A, 2026-11-03).

## Find in grid (Ctrl+F) — owner answers (2026-11-03)

A to all, and the bar is opt-in:
- Ctrl/Cmd+F opens the grid's find bar only when the focus is in the grid; elsewhere the browser's own find.
- Searched: the displayed text of visible columns, case- and accent-insensitive; collapsed tree rows too (the node
  opens to show a hit). Rows are never hidden (unlike the quick search, which filters).
- On a server source: the loaded page only, and the bar says so.
- The bar exists only when the app adds the feature (`find()`); without it, Ctrl+F stays the browser's.
- « Effacer tous les filtres »: not in the find bar (searching is not filtering). Apps already have `clearFilters()`
  for their own button; add an item « Effacer tous les filtres » to the column menu and the cell menu, shown only
  when at least one filter is active.

## Find in grid — measures (2026-11-03, built, not committed)

| Line | Measured | Line |
|---|---|---|
| `@dzgrid/dom/find` (new, over the DOM base) | 2 399 | 2 650 (measure + 10 %) |
| `locales/{en,fr,ar}-find` (new) | 186 / 215 / 267 | 250 / 250 / 300 |
| `@dzgrid/theme/find.css` (new) | 482 | 550 |
| `@dzgrid/dom/column-menu` | 2 963 → 3 039 | 4 300 kept |
| `locales/{en,fr,ar}-column-menu` | 505 / 603 / 709 | 510 / 610 / 710 (2 % rule) |
| `locales/ar-context-menu` | 508 | 510 (2 % rule) |
| `@dzgrid/dom/context-menu` | 2 481 → 2 560 | **2 560: to confirm (+2.4 % on the line)** |
| `locales/fr-context-menu` | 413 | **420: to confirm (+3.3 %, « Effacer tous les filtres »)** |

- Lead decisions: a hit is a cell (the focus and the keys work by cell); the item shows while the query differs from
  the cleared one (a filter or the search on); the Arabic label « مسح كل المرشحات » (the filters' word); the marks'
  colour `color-mix(accent 40 %, danger)`, own colours in Clinic, Bootstrap and more contrast (checked 60° apart).
- `check:api`: additions only (`@dzgrid/dom/find`, `FindMessageKey`, `ClearFiltersKey`, `PartBase.msg` keys).
- Owner (2026-11-03): context-menu 2 560 and fr-context-menu 420 accepted (find + « Effacer tous les filtres »).

## Filters panel — owner answers (2026-11-03)

Added to 1.4.0, before the dock. A A:
- A side panel like the columns panel (side chosen by the app, a button to open and close it); next to the columns
  panel when both are used, or the app shows one; it becomes dockable later without app changes.
- Apply as the popups do: `filters({ apply: 'button' })` → an « Appliquer » button; otherwise at each change.
Content: the filterable columns with a column search; each unfolds to its full filter (the popup's forms, conditions
and value lists included); a dot on active filters; « Effacer tous les filtres » at the top. Keyboard, screen reader,
RTL.

## Filters panel — measures (2026-11-03, built, not committed)

| Line | Measured | Line |
|---|---|---|
| `@dzgrid/dom/filters-panel` (new, over the DOM base) | 2 957 | 3 250 (measure + 10 %) |
| `locales/{en,fr,ar}-filters-panel` (new) | 197 / 224 / 270 | 250 / 250 / 300 |
| `@dzgrid/theme/filters-panel.css` (new) | 593 | 700 |
| `@dzgrid/dom/filters` / `filters-base` (the bridge on the handle) | 11 929 → 11 950 / 11 886 → 11 907 | 12 000 kept |
| K.8 audit profile | 87 657 → 87 678 | 90 000 kept |

- Lead decisions: the panel reaches the popup's forms through `filters()`'s handle (`resolve`, `commit`, `apply`), typed
  by shape on the panel's side: no filter code in its bundle, so no `filters-panel-base`; the panel sits inside the
  grid's root (the root's padding on its side), not in a frame around it, so an app's `#host > .dzg` rule keeps
  working; a strip button by default (`button: false` for an app's own); Apply keeps the form open (a panel is not a
  popup); « Effacer tous les filtres » also empties the quick search, as the menus' item; hidden columns are listed.
- `check:api`: additions only (`@dzgrid/dom/filters-panel`, `FiltersPanelMessageKey`, `PartBase.msg` keys).


## Row numbers, search highlight, Angular column components — owner decisions (2026-11-03)

Asked through the lead, taken: row numbers (an opt-in strip, display order, a click takes the row, Shift+click the rows
between, never a column); the searched text tinted inside the cells for the quick search and find (CSS Custom
Highlight API, the core's `fold`, nothing where unsupported); a cell part given the texts searched (`search`); in
Angular a component class directly in `ui.cell` / `ui.header` / `ui.tooltip`.

## Row numbers, search highlight, Angular column components — measures and lead decisions (2026-11-03, not committed)

| Line | Measured | Line |
|---|---|---|
| `@dzgrid/dom/row-numbers` (new, over the DOM base) | 1 298 | 1 428 (measure + 10 %) |
| `locales/{en,fr,ar}-row-numbers` (new) | 105 / 109 / 120 | 116 / 120 / 132 |
| `@dzgrid/theme/row-numbers.css` (new) | 321 | 353 |
| `@dzgrid/theme/search.css` (new) | 226 | 249 |
| `@dzgrid/dom/search: highlight (lazy)` (new, shared by search and find) | 955 | 1 051 |
| `@dzgrid/dom` (the lead strip, the part's `search`) | 22 435 → 22 853 | 22 440 → **22 880** (+2 % rule) |
| `@dzgrid/dom/search` (the loader) | 1 298 → 1 475 | 1 450 → **1 479** (+2 % rule) |
| `@dzgrid/theme/find.css` (the letters' marks) | 482 → 559 | 550 → **561** (+2 % rule) |
| `@dzgrid/dom/find` | 2 410 → 2 570 | 2 650 kept |
| `@dzgrid/angular` (column components) | 7 440 → 7 627 | 7 450: **over the 2 % rule (7 599) — not raised, the owner decides** (proposed 7 650) |
| K.8 audit profile | 88 883 | 90 000 kept |

- Lead decisions: the strip is a lane of the base like the selection boxes (`GridContext.lead` px; `.dzg-lead` first in
  every start segment), not a column — so every place that recomputes the columns (screen cells, CSV and Excel export,
  print, the clipboard, the grid's state, the server's request, the columns panel and menus, quick search and find)
  reads `columns.visible()` and never sees it; only the base's geometry knows its width (rows, header rows, body,
  pinned bands, `--dzg-check-w` for full-width cells, group bands, the pointer's `cellAt` and auto-scroll, a column's
  drag, a centre column scrolled clear). A detail panel is neither numbered nor counted; pinned rows keep an empty
  strip cell; group / filler rows count. Not an arrow stop: Shift+Space / Ctrl+A / Space are the keys (WCAG 2.1.1).
  Without `range()`, the row selection's click. The corner with `range()`: every cell.
- Highlight: on by default, opt-out per feature (`highlight: false`); the matching (`spans`) and the cell walking are a
  lazy chunk shared by both features (the static side ≈ 180 B gz); a text whose letter-by-letter folding differs from
  its whole folding is not tinted (never a wrong place). Supported in Chrome 156, Firefox 157 and WebKit 27.2 here.
- `search` on the cell part context is optional in the type (a context built by hand keeps compiling), always given.
- Angular: one name per class and slot for the page (`dzg-ng-<slot>-<n>`), registered under every other layer (an
  application's name never taken); one answer per `[columns]` array (the grid sees no change on a re-render).
- `check:api`: additions only — after `scripts/api.mjs` learnt that a union printed in another order is the same type
  (the 1.4.0 dom types moved `numerals` / `direction` literal order in the Angular declarations; tests added).

## Busy bar — measures and lead decisions (2026-11-03, not committed)

Owner's ask (2026-11-03): a thin bar while rows are reloaded and kept on screen; automatic for a server, driven by the
host too (`busy`, Angular `[busy]`). Sheet: `overlays.md` « Busy bar ».

| Line | Before | After | Line |
|---|---|---|---|
| `@dzgrid/dom` (the bar, its timers, the layout's 2 lines) | 22 853 | 23 050 | 22 880 → **23 070** (+0.8 %, 2 % rule) |
| `@dzgrid/theme` (colour, motion, keyframes) | 2 832 | 2 907 | 2 850 → **2 907** (+2.0 %, at the rule's edge) |
| `@dzgrid/angular` (`[busy]`) | 7 627 | 7 665 | 7 650 → **7 665** (+0.2 %) |
| K.8 audit profile | 88 653 | 88 960 | 90 000 kept |

- Lead decisions: in the base, not a feature (≈ 200 B gz; a feature would cost its own wiring for as much). Delay
  200 ms, hold 400 ms (our scope's timers; no clock read). `aria-busy` at once, no delay. **No sentence** for a busy
  reload, at any length (a poll every few seconds would repeat it; the rows that arrive are told by `freshRows()`).
  The rows' stale muting stays a server's only (a poll does not grey the rows every cycle). The host's `busy` shows
  the bar over « no rows », « no match » and an error too (a poll still runs); never with the loading overlay, which
  hides a bar still held at once. Drawn as a border (forced colours keep it as the text colour), the segment animated
  by `inset-inline` (right to left without a mirror rule); under reduced motion or `motion: false` a still full line.
  `.dzg-busy` made the first time it shows (a grid never busy has no extra node).
- **For the owner — `check:api`:** `@dzgrid/dom#LAYOUT_CSS: changed`. The export is typed as its literal string, so the
  two new layout lines (`.dzg-busy`, its `::before`) count as a change, not an addition; nothing removed. Accept with
  `node scripts/api.mjs --accept "busy bar: two layout lines" --only "@dzgrid/dom#LAYOUT_CSS"`, or decide to type it
  `string` (also reported as a change once). Every other step of `gate:step` is green.

## Busy part — measures and lead decisions (2026-11-04, not committed)

Owner's ask (2026-11-04): a `busy` slot so an application draws its own busy mark (an animated logo); the grid keeps
when it shows. Sheet: `overlays.md` « The busy part ».

| Line | Before | After | Line |
|---|---|---|---|
| `@dzgrid/dom` (the part's host, reduced motion followed) | 23 070 | 23 246 | 23 070 → **23 250** (+0.8 %, 2 % rule) |
| `@dzgrid/dom/slots` (the driver) | 1 266 | 1 380 | 1 400 kept |
| `@dzgrid/theme`, `@dzgrid/angular` | 2 907, 7 665 | unchanged | kept |
| K.8 audit profile | 88 968 | 89 139 | 90 000 kept |

- Lead decisions: in `slots()` like `overlay` (`missing-feature` without it). **Mounted once at the first show, then
  kept**, `active` updated at each show and hide, the host hidden meanwhile: an animation library builds its timeline
  once and pauses / resumes it (cheaper than a mount per poll, and no half-killed tween on a fast hide). Its own host
  `.dzg-busy-part` (no layout CSS: `LAYOUT_CSS` unchanged; position written on the element), block size the part's,
  floating over the first rows (never pushes them). `reducedMotion`: `motion: false`, the media query (listened to once
  a part asked), or « reduce » when the page cannot tell. A part that throws: the line from then on, reported once, not
  tried again until another busy part is registered (a poll would report it each cycle). The host and the media query
  live in the base so the slots line stays under its 1 400.
- **For the owner — `check:api`:** `@dzgrid/dom#SlotContext` gains the required key `busy` (an interface the grid
  hands out, as `status` in Phase 9): accepted in `api/` with « owner to confirm ». Nothing removed; no CSS export changed.

## Row drag — owner answers (2026-11-05)

Plan `row-drag-plan.md`; sheet `docs/behaviors/row-move.md`. The owner answered **A to every question Q-RD1…Q-RD12**:

- **Q-RD1** the application reorders by default: one `rowMove` event and the pure `moveRows`; opt-in `apply: true` for
  flat browser rows (the grid reorders the same objects).
- **Q-RD2** a ⠿ grip at the start of a column the application names (default the first visible one).
- **Q-RD3** the selected rows move together (display order kept); an unselected row's grip moves it alone.
- **Q-RD4** in a tree the middle of a row = inside (reparent, last child); a closed parent opens after 0.8 s.
- **Q-RD5** sorted or grouped → refused with a sentence unless the application allows (`whenSorted: 'allow'`);
  filtered → allowed.
- **Q-RD6** server sources (pages, `infiniteRows`, `serverSideRows`) → event only, among the rows loaded.
- **Q-RD7** other grids and zones through drop targets, as the column drag (the exact place in another grid later).
- **Q-RD8** keys Alt+Shift+↑ / ↓, Alt+Shift+Home / End, Alt+Shift+→ / ← in a tree (Option+Shift on a Mac). The sheet
  notes that Alt+Shift may switch the keyboard layout on Windows: **to check on a real Windows (owner)**.
- **Q-RD9** a finger on the grip only (`touch-action: none` there; a finger elsewhere scrolls).
- **Q-RD10** no grid undo in V1 (Ctrl+Z stays the cell edits').
- **Q-RD11** sizes: new entries at their measure + 10 %, Angular +2 % at most; nothing in the core base, the DOM base,
  the theme, the menus or K.8 (89 976 / 90 000); the real example unchanged.
- **Q-RD12** cell-menu items Monter / Descendre / En haut / En bas (+ Rentrer / Ressortir in a tree) through the
  existing application-items hook (`contextMenu({ items })`).

## Row drag — lead decisions and measures (2026-11-05, not committed)

Built R0–R5 (`row-drag-plan.md`): sheet first, conformance by hand, tests red first, code, review, browsers.

| Line | Measure (gz) | Line | Rule |
|---|---|---|---|
| `@dzgrid/core/row-drag` (new, over the core) | 1 377 | **1 550** | measure + 10 % (plan 900–1 200) |
| `@dzgrid/dom/row-drag` (new, over the DOM base; `range/geom` inside) | 4 848 | **5 350** | measure + 10 % (plan 3 000–3 600: the tree, several rows, menu items, managed mode, drop targets) |
| `locales/{en,fr,ar}-row-drag` (new, 18 texts) | 318 / 367 / 485 | **350 / 450 / 550** | measure + 10 % |
| `@dzgrid/theme/row-drag.css` (new) | 391 | **450** | measure + 10 % |
| `@dzgrid/core` base, `@dzgrid/dom` base, `@dzgrid/theme` | 29 258, 23 650, 2 918 | unchanged | byte for byte |
| `range`, `columns`, `tree`, `grouping`, `context-menu` (+ locales), `edit` | — | unchanged | |
| `@dzgrid/angular` | 7 883 | unchanged | nothing in the wrapper (below) |
| **K.8 audit profile** | **89 977** (was 89 976) | 90 000 | **for the owner** (below) |

- **The shared rules live in the core** (`dropPlace`, `nextPlace`, `unchanged`, `movingRows`, `placeOf`): the pointer,
  the keys, the menu and the API all go through them; the DOM computes no target of its own. `moveRows` is the same
  reorder the managed mode applies.
- **API names**: `api(grid).move(keys, target, { say })` and `api(grid).step(key, by, { say })` (`by`: -1, 1, `start`,
  `end`, `in`, `out`) instead of `up` / `down` / `indent` / `outdent` (one method, the keyboard's own steps); silent
  unless `say`. `feature.menuItems(c)` (on the feature, so an app's `contextMenu({ items })` needs no grid lookup).
  Result codes: `moved`, `edge`, `locked`, `sorted`, `grouped`, `refused`, `tooMany`, `unknown`.
- **No `handle: 'row'` mode** in V1 (Q-RD2 A: the grip only). **No « click the grip, then the gap »** (the menu covers
  2.5.7, plan).
- **`whenSorted: 'allow'`** lets the event go when sorted **or grouped**; the managed mode never reorders those.
- **The texts' keys are `rmove.*`** (`move.*` are the columns'); the menu labels « En haut » / « En bas » (owner
  Q-RD12), « Monter », « Descendre », « Rentrer », « Ressortir ».
- **The sentence waits for the application's rows**: said at once when they changed during the event (a synchronous app,
  the managed mode), else at the next rows change within 5 s (a server first), else never (no stale place). « Ligne
  déplacée » when the moved row is not shown (filtered out, not given back). In a tree « Ligne n sur N, niveau L »
  (no parent named: it would be a value).
- **Opening**: a row moved inside a closed parent opens it (source `api`: the tree says nothing, the move's sentence
  follows); the spring-open too.
- **A finger**: the browser's implicit capture on the grip is handed to the grid's root; only the root's own lost capture
  cancels (found in Chrome's touch emulation, fixed with its jsdom test).
- **Auto-scroll** reuses `range/geom.ts` (`autoScroll`, `place`, `extra` now exported there: 0 B in `range`); the
  sideways scroll it may write is put back at once (row-move.md 9).
- **The line's indent** reads the tree cell's `--dzg-tree-pad` (its own indent function included), else 16 px a level.
- **Angular: nothing new in the wrapper.** `(rowMove)` and `DzgController.rowDrag()` cost +42 B in `@dzgrid/angular`
  (7 925) and therefore +43 B in K.8 (90 019 > 90 000): against Q-RD11 (« nothing in K.8 »). Left out; an app uses
  `(gridEvent)` and `ctl.use(feature)` (tested). The diff is ready if the owner prefers the output (K.8 line to raise).
- **For the owner — K.8 89 977 (+1 B)**: no code of the audit screen changed; the byte is the core chunk's content hash
  in the split build's file names (`GridEvent`'s new member is a type, but `kernel.ts`'s text changed; measured with
  `kernel.ts` alone reverted: 89 976). Any edit to `kernel.ts` moves it by ±1.
- **For the owner — `check:api`**: `@dzgrid/core#GridEvent: changed` (a union member added, printed as « changed »,
  as `groupByChanged` in Phase 7). Accept with `node scripts/api.mjs --accept "Phase 9 row drag: GridEvent rowMove"
  --only "@dzgrid/core#GridEvent"`. Everything else is additions.
- **For the owner — Windows**: Alt+Shift may be the system's keyboard-layout chord; check Alt+Shift+↑ / ↓ on a real
  Windows (with NVDA / JAWS: the S4 protocol). VoiceOver pass on the demo too.

## Row drag — owner, 2026-11-06

- `GridEvent` gains `rowMove`: accepted in api/ (« 1 oui »).
- Angular: no `(rowMove)` output nor `ctl.rowDrag()` for now (« 2 A »): apps use `(gridEvent)`; K.8 line kept at 90 000.

## Dock — owner B (2026-11-06)

Owner: **B — the dock's V1 + V2 for 1.6.0**: areas `start` and `end` (one panel per area, resize by the edge and by
keys, collapse, saved in GridState, RTL, the columns panel docked) **plus V2**: tabs (several panels in one area, e.g.
columns + filters) and the `bottom` area. The floating window (V3) later: the model, the state's shape and the API are
the full ones, a `float` area refused with a warning for now. Work slowly: one gate at the end. Sheet `docs/behaviors/dock.md`.

### Lead decisions
- **Inside the grid's root, not a frame around it** (plan §2.1 written before the filters panel): as the filters panel,
  each area is absolute inside `.dzg`, the root keeping its room by padding (`--dzg-dock-start`, `-end`, `-bottom`),
  so an application's `#host > .dzg` rule keeps working and everything placed from the viewport's box follows (checked
  in three engines). The start area is the root's first child (Tab order: start panel, grid, end, bottom).
- **The layout's check is pure, in a new core entry `@dzgrid/core/dock`** (`checkDock`, types `DockArea`, `DockState`…):
  `@dzgrid/core/state` only reads and hands the part (`StateEnv.dock`, +23 B), as `rowGroups` with the grouping. Shape:
  `{ panels: { [id]: { area, open, at? } }, areas: { start|end|bottom: { active?, size?, collapsed? } } }`; `at` (a
  floating window's corner) and `area: 'float'` are in the model for V3. Sizes per area, not per panel (tabs share it).
- **No shared code between the panels and the dock**: a feature hands `handle.dock = { id, title(), el, area, open,
  collapsed, keep, shown(on) }` (read by shape, types only in `dom/dock/types.ts`) and talks to `g.dock` (set by
  `dock()` on the grid's context) — nothing in the DOM base nor in `@dzgrid/dom/internal`; a panel knows the dock is
  there from `settings.features` (as the filters panel finds `filters`).
- **The columns panel's body is not split into a file of its own** (plan §2.4): the same function builds it for the dialog
  (at each opening) and for the dock (once); docked it has no live region of its own (the grid's), no Tab trap, its
  « Fermer » hides the panel; its title is left to the area's head (hidden by the dock's CSS: 0 B in the panel).
- **The filters panel docked**: its strip becomes its area collapsed (default `button: true`: shown collapsed, as the strip
  was), `open: true` expanded, `button: false` hidden until `api(grid).open()`; × collapses while it has a strip
  (`keep`), else hides; its title carries the count (« Filtres Actifs : 2 »). Its own side is not drawn.
- **Edge**: a 24 px gutter on the rows' side of the area (WCAG 2.5.8 without covering the rows' scrollbar or the
  panel's controls); the line in its middle (`--tz-fg-muted`, 3:1). Arrows move the edge the way they point (logical
  through the core's `intentFor`, so right to left needs no code of its own); Enter collapses and gives the focus to
  « Déplier » (the edge is hidden while collapsed).
- **Collapse is per area**; a collapsed area keeps its head along the edge (2 rem, words written downward).
- **Close vs collapse**: × hides the panel (back with its app's button / menu item, at the same place and size);
  collapse keeps its tab in the strip.
- **No F6** (plan §2.1's rule): a page cannot count on receiving F6 (the browsers' own bars) and automation cannot
  answer it (synthetic keys bypass the browser's chrome); the areas are named regions in Tab order. To try by hand.
- **Sizes**: 288 px beside, 240 under by default; `sizes: { min: 160, max: 800 }`; the rows keep 160 px; a size that
  no longer fits is kept and shown smaller.
- **`float`**: `dock({ open })`, `show`, `move` → `invalid-setting` (`dock.open.<id>`, `dock.area`, `dock.move`); a
  restored state → `state-field` at `dock.panels.<id>.area`, detail `float`; the panel at its first place.
- **A dock change is a gesture for `gridState()`**: `g.saved(source)` (set by the state feature), `stateChanged` after the
  pause; a restore is not told; `reset()` puts the dock back as the options placed it (`g.dock.initial`). A state
  restored before the dock was set up (`gridState` listed first) waits on the context (`dockLater`), as `rowGroups`.
- **Angular**: nothing in the wrapper (K.8 untouched): `dock()` in `[features]`, `ctl.use(dock)` (tested).

### Measures (gzipped, minified, `npm run check:size`)
| Line | Before | Measured | Line |
|---|---|---|---|
| `@dzgrid/core/dock` (new, over the core) | — | 451 | **500** (measure + 10 %) |
| `@dzgrid/dom/dock` (new, over the DOM base) | — | 4 174 | **4 600** (measure + 10 %; plan V1 + V2 ≈ 4 200) |
| `locales/{en,fr,ar}-dock` (new, 11 texts) | — | 209 / 233 / 276 | **250 / 300 / 350** |
| `@dzgrid/theme/dock.css` (new) | — | 546 | **650** |
| `@dzgrid/core/state` (reads the part) | 1 523 / 1 540 | 1 546 | **1 570** (+2 % rule) |
| `@dzgrid/dom/state` (the adapter, the gesture, reset) | 1 241 / 1 264 | 1 273 | **1 289** (+2 % rule) |
| `@dzgrid/dom/columns-panel` (docked) | 4 348 / 4 400 | 4 475 | **4 488** (+2 % rule; Q-SB5 had granted 4 800) |
| `@dzgrid/dom/filters-panel` (docked) | 2 914 / 3 250 | 3 106 | 3 250 kept |
| `@dzgrid/core`, `@dzgrid/dom`, `internal`, theme, Angular | 29 258, 23 650, 3 799, 2 918, 7 883 | unchanged | kept |
| **K.8 audit profile** | 89 977 | 89 977 | 90 000 kept |

- `check:api`: additions only (`@dzgrid/core/dock`, `@dzgrid/dom/dock`, `DockMessageKey`; `GridState.dock?`,
  `StatePart` `'dock'`, `StateEnv.dock?`, the messages' unions).
- Gate (2026-11-06): `test:ci` / `test:tz` 8 742 passed; then a type-only cast fixed in `dock-state.test.ts` and the rest
  of the chain run (`typecheck`, `build`, `check:size` 0 over, `check:api` additions only). Browsers
  (`node scripts/browser-dock.mjs`): Chrome 21 / 21, Firefox 15 / 15, WebKit 15 / 15; planted fault (a physical drag) red.
