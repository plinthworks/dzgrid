# allergen-detector: DzGrid integration, before / after (2026-10-27)

App: `/Users/nadou/Dev/allergie-detector/admin-web` (Angular 21, Tailwind 3), screen « Produits (dzgrid) ».
Branch `dzgrid-integration`, made from `dzgrid-screen` (72a99a0), commit 40f9081. Local commit only: nothing pushed.
DzGrid: the four tarballs from `packed/` (still versioned 0.3.0, with the feedback pass in them).

## Lines

| | Before (72a99a0) | After |
|---|---|---|
| `products-list-dz.component.ts` | 770 | 674 |
| `shared/grid-dz/date-range-filter.ts` | 143 | deleted |
| `shared/grid-dz/pill-set-filter.ts` | 177 | deleted |
| `shared/grid-dz/pill-options.service.ts` | 26 | deleted |
| **TypeScript total** | **1 116** | **674 (-442, -40 %)** |
| DzGrid block at the end of `styles.scss` | 128 | 56 |
| of which workaround CSS | 71 (pager arrows 26, checkbox 10, popup width + footer wrap 16, set-filter search icon 7, date popup width 6, plus comments and blank lines) | 0 |

What is left in the CSS block is the app's own look: the grid's height inside its card, Inter 14 px and padding,
the action colours, and the pill colours (the cells and the set filter's rows use them).

## What went away, and what replaced it

| Workaround | Replaced by |
|---|---|
| Pager-arrow CSS (`[data-go]::before` with escaped glyphs) | The pager's built-in glyphs (DOM characters, feedback A) |
| Custom `dayRange` filter kind + `DateRangeFilterComponent` (an inline tz-date-range, Clear / Apply) | Built-in `{ kind: 'instant', ops: ['betweenDays'] }` + `filters({ dateCalendar: { months: 1, presets: [] } })`: FROM / TO, one month, no shortcuts. With one operator there is no « Condition » (feedback B, K) |
| Custom `pillSet` kind + `PillSetFilterComponent` (its own list, search, select-all, counts) | Built-in `set` filter + one `filterOption` template part (box, pill, count): 5 lines of template, 6 of CSS (feedback C) |
| `PillOptionsRegistry` (options and counts computed by the screen after each load) | `ui.data.colours` per column. Labels and counts come from the grid's value list (feedback D) |
| `'filter.clear': 'Effacer'` override | The fr locale's new text (feedback J) |
| The « sans slots() » comment | Removed: DzGrid now reports the missing feature (feedback E) |
| Checkbox CSS (unticked box invisible) | The theme's outline (feedback G) |
| Popup max width and footer `flex-wrap` | The period form fits in 20 rem; the footer stays on one line (J) |
| Header search outside the filter engine (`colQuery`, `visibleRows`, stopPropagation that blocked sorting) | `ui: { header: 'header.filterBox' }` on barcode and name, with `filter: { kind: 'text', ops: ['contains'] }`. Now part of the grid's state and of clear-all; a click on the name sorts (feedback I) |
| Pill CSS duplicated inside the component | The global copy in `styles.scss` (it already handled `html.dark`) |

`npm`: tzslot was already at `^2.4.0` (installed 2.4.0), so no tzslot change. Lockfile: new integrity hashes, and the
`@dzgrid/dom` / `@dzgrid/angular` peer ranges updated by hand (see the bugs below).

## Build

`ng build` (production) passes. A read-only code review (an agent) found no high-confidence bug. The `products-list-dz` lazy chunk is 143.7 kB raw / 44.2 kB transfer. I did not
measure a baseline for this chunk. The initial-bundle budget warning (3.25 MB against 2.5 MB) is the app's and was
already there. Warning NG8113: `DzgSearch` is imported but never used (an app item, below). The app has no tests for
these files.

Tarballs: core 422 → 445 KB, dom 658 → 784 KB, theme 30 → 35 KB, angular 44 KB (unchanged).

## Browser: owner check

Blocked for the agent: headless Chrome on `:4200` lands on `/login`, and credentials were out of bounds. No
screenshots were taken. The owner checks it by hand, with the checklist given to the coordinator. The same checklist
is below.

1. Sign in. In the sidebar, open « Produits (dzgrid) ». The grid shows 1 604 products, and the total stays the same
   after a reload.
2. Footer: the four arrows « ‹ › » are visible, light and dark. Next / last change the page.
3. « Mis à jour », filter button: one popup with Du / Au fields and ONE month of calendar. There is no second panel
   on top, no « Condition » select and no shortcuts, and nothing goes past the window edge. Pick two days, then
   Appliquer: the rows narrow. Effacer brings them back.
4. « Source » (also Type, Statut, Validé, Ingrédients), filter button: a list with a box, a coloured pill (same colour
   as the cell) and a count on each row. Untick one: the rows go after a short pause. « Marque » shows plain text rows.
5. Header « Nom du produit » and « Code-barres »: type in the box next to the name. The rows narrow as you type, and
   the column shows as filtered. Click the column NAME: it sorts. Space typed in the box is a space and does not sort.
6. Popup footer: « Effacer » and « Appliquer » sit on one line.
7. Switch the theme (dark, then light): the grid, the popups, the pills and the unticked selection boxes stay readable.

## Still hurts (new DzGrid gaps)

1. **The `filterOption` part hides the grid's own box.** To keep the ticked look, the app draws its own box (6 lines
   of CSS plus a span). A `keepBox` choice, or a part slot covering only the label, would avoid that.
2. **The count must be drawn through `content: attr(data-n)`** to stay inside the option's accessible name. Every
   app has to copy this rule. The part could be handed the grid's count node, or the grid could keep the count.
3. **`dateCalendar` is grid-wide.** One column cannot have one month and another two.
4. **`header.filterBox` keeps the header's filter button**, which opens a popup with a single « contient » field: a
   second way into the same filter. It is fine, but there is no way to say « header box only ».
5. **Behaviour change in the set filter:** a tick applies after a pause (built-in, in the browser). The app's own
   filter applied only on « Appliquer ». The owner should confirm this is acceptable.
6. Tailwind preflight: the theming doc says to import `dzgrid.unlayered.css` under an unlayered reset. The app still
   imports `dzgrid.css` (line 6 of `styles.scss`, outside this task's scope). The arrows and the box no longer need
   it, but the owner check should confirm nothing else is erased.

## DzGrid bugs and packaging issues found

1. **Same version, different bytes.** The new tarballs are still `0.3.0`. npm keeps the lockfile's old integrity hash
   for the same `file:` path and version, so a plain `npm install` fails or keeps the old content. I had to drop and
   recompute the four `integrity` lines by hand. Fix: bump the version for every repack, even a prerelease
   (`0.3.1-feedback.0`).
2. **Stale peer ranges in the lockfile, for the same reason.** The lockfile still said `@tzslot/* >=2.2.0 <3` for
   `@dzgrid/dom` and `@dzgrid/angular`, while the packages ask `>=2.4.0 <3`. I fixed it by hand. The fix is the same
   version bump.
3. No runtime bug could be checked: the browser step was blocked.

## App-side issues seen, not fixed (the app session owns them)

- `quickSearch()` and `DzgSearch` are wired but never bound (NG8113). `TranslateModule` is imported and unused.
- `onSearch()` calls `loadAll()` twice. `switchViewMode` loads before it resets `searchTerm`. Overlapping loads have
  no cancellation.
- Every CRUD action reloads all 1 604 rows.
- Action buttons have no icon-only `aria-label`. The loading overlay has no `aria-busy` or status.
- The `dz-grid .act:nth-child(...)` hover rules in `styles.scss` are dead: the component styles the actions itself.
- `onSelection(e: unknown)` is untyped. `problems` is stored but never shown.
- `locale="fr-FR"` and the French texts are hard-coded; `ml-1.5` is not mirrored for right-to-left.
- The working tree holds untracked `data/lexicon/` and `nohup.out`. Left alone, not committed.

## Time

About 70 minutes of agent time: the install and lockfile 10 min, reading the DzGrid docs 15 min, the code 20 min,
the build and review 10 min, the report 15 min. The browser step was blocked by the login.
