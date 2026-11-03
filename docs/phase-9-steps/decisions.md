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

