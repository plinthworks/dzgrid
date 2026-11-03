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
