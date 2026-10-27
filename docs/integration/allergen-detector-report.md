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

## After the owner's look (2026-10-27)

The owner looked at the screen in the dark theme and found it badly finished (`docs/phase-6-steps/app-feedback.md`
17–22). Fixed in DzGrid (`407c027`, pushed) and in the app (`dzgrid-integration` `d48cfb6`, local commit only).

**DzGrid** (tests written first: `packages/dom/test/owner-look.test.ts`, 11 tests, 9 failing before):
- One box per value row: a `filterOption` part paints the label area only; the grid keeps its box and its count. The
  part's host is `inert` (review finding 4 closed: no control in it takes the focus).
- `filters({ apply: 'button' })`: nothing applies before « Appliquer » or Enter (set ticks, date picks, text); closing
  drops the draft. `'live'` stays the default.
- `filters({ dateZone: false })`: no « Fuseau horaire » line. FROM / TO show `dd/mm/yyyy`.
- Every popup stays inside the window: placed again when its size changes (`ResizeObserver`), and clamped vertically.
  This was the date popup cut on the right: placed while its kit loaded, never placed again.
- The popup: « Appliquer » the primary button (accent), « Effacer » the secondary one, boxes in the accent, more room,
  the value list as high as its rows (≤ 18rem), « Rechercher… » as placeholder with no label.
- `header.filterBox` takes the title's place: a magnifier, the column's name as placeholder, no filter button.
- Budgets raised by the owner (decisions « Owner's-look budgets »): filters 10 048 / 10 100, set 4 208 / 4 250, date
  adapters 2 752 / 2 800, K.8 84 297 / 84 300. Theme 2 689 / 2 750, popup 1 626 / 1 650.
- Packaging (item 15, `b8feba0`): `npm run pack:local` gives `0.3.1-local.<stamp>` with the `@dzgrid/*` ranges pinned;
  `pack:release` keeps 0.3.0. The app's lockfile updated by `npm install` alone (19 lines), no hand edit.

**The app** (`d48cfb6`): the four `0.3.1-local.20261027162608` tarballs; `apply: 'button'`, `dateZone: false`; the pill
part draws the pill alone (the `po-box` / `po-n` CSS gone); the admin's colours on DzGrid's tokens in the DzGrid block of
`styles.scss`, scoped to `dz-grid`, light and `html.dark` (accent `#0C7075` light, white on it 5.85:1; `#5ec4ca` dark);
no hard-coded colour left in the component; `dzgrid.unlayered.css` under Tailwind 3's preflight. `ng build` passes
(warnings already there: NG8113 `DzgSearch`, NG8107 in product-preview, the initial bundle budget).

**Gates** (once, `caffeinate -i`, 2 workers): vitest 473 files / 7 136 tests, typecheck, build, check:size 0 over,
check:contrast 1 092 / 0; Chrome `--only filters` 32 / 32, `--only dates` 56 / 56.

**Screens** (playground `owner-look.html`, the app's setup and brand, 900 × 760): `screens/owner-look-{grid,set,search,date,header}-{dark,light}.png`.
Measured there: one box per row, rows 36 px, the focus ring in the accent, a tick applies only at « Appliquer », the
date popup 650–900 of 900 (inside), no zone line, placeholders `dd/mm/yyyy`, no filter button on « Nom du produit ».
The running playground on 4700 predates tzslot 2.4.0 (« Missing ./lazy »): its date kits fail until it is restarted; the
screens came from a temporary server on 4711, stopped afterwards.

**Owner check on :4200** (after the app session restarts the server): one box per row in « Source »; tick, wait: nothing
changes until « Appliquer »; close without it: nothing applied; « Mis à jour » on the right edge: the whole month and
« Appliquer » visible, no zone line, `jj/mm/aaaa`-style hints; « Nom du produit »: the search box in the title's place,
a click beside it sorts; the brand's teal in both themes.

## The owner's second look (2026-10-27, light theme)

`docs/phase-6-steps/app-feedback.md` 23–28. Fixed in DzGrid (`73a423f`, pushed; packs `0.3.1-local.20261027165943`) and in the app
(`dzgrid-integration` `7c4deb3`, local commit only).

**DzGrid** (tests written first, 14 failing before: `packages/dom/test/owner-look-2.test.ts`,
`packages/theme/test/owner-look-2.test.ts`, two superseded expectations in `owner-look.test.ts`):
- The period form: DU / AU each on its field's row (a two-column grid), no placeholder (the English `dd/mm/yyyy` in a
  French grid is gone, and no hint is left to localise), no « Période » heading (the group keeps the name), 18rem at
  least. Every popup now ends 8 px inside the window (it ended on the edge).
- The pager's buttons square, 2rem × 2rem; the footer's items .5rem apart.
- The set filter: search, count line and « Tout sélectionner » .5rem apart (the app's reset of `p` margins had left
  0 px).
- The selection box (header and rows) a 16 × 16 square: `flex: none`; the app's 15 px cell padding in the 40 px column
  had shrunk it to 10 × 16.
- The 0-rows case was not a DzGrid bug: the period matches the app's instants (microseconds, `Z` and offsets), picked or
  typed, `apply: 'button'`, two zones, paged from page 4. The production table has only 30 distinct `updated_at` values:
  a period between them shows nothing, rightly.

**The app**: `[overlay]="loading() ? 'loading' : null"` on `<dz-grid>` (the grid's own state: « Chargement… » over the
rows, `aria-busy`, announced); the screen's own veil (under the grid, never seen) removed; a spinner in the accent drawn by
the DzGrid block of `styles.scss` on `.dzg-viewport[aria-busy=true] ~ .dzg-overlay::before`, slower under reduced motion.
The new `0.3.1-local` packs installed; `ng build` passes.

**Screens** (playground `owner-look.html?preflight=1`, the app's reset, boxes and padding, 900 × 760, a temporary vite
on 4711, stopped afterwards): `screens/polish2-{grid,pager,set,date,filtered,loading}-{light,dark}.png`.

**Owner check on :4200** (after the app's server restarts): the header and row boxes square; the pager's four buttons
square, « Page 1 sur N » with room; « Marque » filter: « N valeurs » with space above and below; « Mis à jour »: DU and AU
on their fields' rows, empty fields, no « Période », the popup clear of the window's edge, a period around a date seen
in the column narrows the rows; a reload (or any save) shows the spinner and « Chargement… » on the grid.

## The owner's third look (2026-10-27, light and dark)

`docs/phase-6-steps/app-feedback.md` 30–37; decisions « Feedback after a client filter », « Comfort stylesheet ». Fixed in
DzGrid (`373c73d`, pushed; packs `0.3.1-local.20261027192354`) and in the app (`dzgrid-integration` `6911879`, local commit
only; `ng build` passes).

**DzGrid** (tests written first, 17 failing before: `packages/dom/test/owner-look-3.test.ts` 5 — the input's width, the
focus on the first open, two busy-flash cases, the flex fill with the selection boxes —, `packages/theme/test/owner-look-3.test.ts`
12, then the budget expectations; the filtered count passed at once: DzGrid already had it):
- The period form: the half-width input was tzslot's own CSS (`.tz-dateinput__input{width:8.5rem}`); the input now fills
  its field and the theme rings the field, never the input (tzslot request T12). Chrome: input 260 of a 262 px box, light,
  dark and right to left; the input's outline `none`, the box's `solid`.
- The focus goes to DU when the period popup opens, the first time too (it waited for nothing on a hidden select).
- `filters({ busyFlash: 300 })`: `aria-busy` on the grid's root for 300 ms after each filter change; the count
  (`count.filtered`) and the accent funnel already existed; the header search box's magnifier turns to the accent.
- `@dzgrid/theme/dzgrid.comfort.css` (optional, 551 B gz, line 650): the default spinner (over « Chargement… » and
  during a flash; still under reduced motion: Chrome `animation-name: none`, `dzg-spin` otherwise) and thin scroll bars
  (`--dzg-scrollbar: auto` for the system's).
- A bug: flexible columns ignored the selection boxes' 40 px — a grid with `checkbox: true` and a `flex` column always
  scrolled 40 px sideways (the owner's « Nom du produit » under « Code-barres »). Chrome at 1 920 px: scroll width =
  client width (1 886). A line now marks the pinned columns' edge.

**The app**: actions 118 → 148 px (the trash 23 px from the cell's end, was at its edge), centred (`.acts` a flex box as
tall as the cell: 0.5 px from the row's middle, was 2.5 px above); « Nom » `flex: 2` (min 220), « Marque » `flex: 1`
(min 140); « {filtered} produits sur {total} »; `busyFlash: 300`; `dzgrid.comfort.unlayered.css` imported, its own spinner
CSS removed.

**Not ours (for the app session)**: product names in mojibake (« NÂ°9 - BÅ"uf »): UTF-8 read as Latin-1 somewhere in the
data's path; not changed here.

**Sizes**: theme 2 763 / 2 850, comfort 551 / 650, K.8 84 448 / 84 450, date adapters 2 809 / 2 850, filters 10 089 /
10 100, DOM base 22 331 / 22 400. **Gates** (once, `caffeinate -i`, 2 workers): vitest 478 files / 7 183 tests,
typecheck, check:size 0 over, build, check:contrast 1 092 / 0; Chrome `--only filters` 32 / 32, `dates` 56 / 56,
`pagination` 45 / 45.

**Screens** (playground `owner-look.html?preflight=1&wide=1`, the app's columns, 1 920 × 900, a temporary vite on 4711,
stopped afterwards): `screens/polish3-{grid,date,flash,filtered}-{light,dark}.png`, `polish3-date-rtl.png`,
`polish3-scrolled-light.png`, `polish3-loading-light.png` (reduced motion).

**Owner check on :4200** (after a restart): « Mis à jour »: DU focused, one ring, the field full width; type « pizza » in
« Nom »: a brief spinner, « 11 produits sur 1 604 », the magnifier in teal; no horizontal scroll bar at full width; the
four actions with room and centred; thin scroll bars, plainer on hover.

## The owner's fourth look (2026-10-27, light theme) and the layout tools

`docs/phase-6-steps/app-feedback.md` 38–40. Fixed in DzGrid (`98a85a7`, pushed; packs `0.3.1-local.20261027222502`) and in the app
(`dzgrid-integration` `505c2df`, local commit only; `ng build` passes).

**DzGrid** (tests written first: `packages/theme/test/owner-look-4.test.ts` 4 failing before, Chrome `--only pagination`
`footerSelectionChecks` 6 failing before; `owner-look-2.test.ts` one expectation superseded):
- The footer's « Sélectionner les N lignes » / « Effacer la sélection » are `button.dzg-pbtn`, the pager's class, so the
  second look's square (`.dzg-pbtn{padding:0;inline-size:2rem}`) squeezed them. The square is `[data-go]`'s now (the
  nav buttons'); the footer buttons keep one line; their width is their words'. Chrome: the pager 32 × 32, the two
  actions 209 × 32 and 149 × 32 (ar 178 and 99), nothing overlapping, at 1 000 and 400 px (the strip on two lines), fr
  light, fr dark, ar RTL dark.
- The horizontal scroll (39) was not reproduced and no DzGrid cause was found: the app's columns and boxes at 1 920 px
  with real scroll bars (thin 11 px, the system's 15 px), rows arriving after « Chargement… », 20 → 100 a page, the page
  and all rows ticked, device pixel ratios 1 to 2.5, fractional widths: scroll width = client width each time. A jsdom
  guard (`packages/dom/test/owner-look-4.test.ts`, 11 / 15 / 17 px gutters) passed at once. Most likely :4200 still
  served the packs from before the third look's 40 px fix. With the fourth look's widths the columns need 1 546 px +
  40 + the bar; below that a scroll is right.

**The app** (no DzGrid change): `gridState({ persist })` (key `allergie-admin:products-dz:layout:<view>`), `columns()`,
`columnsChooser()`, `columnMenu({ use: { columns, chooser } })`, the fr texts of `FR_COLUMNS` / `FR_COLUMN_MENU`; one grid
per view and per reset; « Colonnes » and « Réinitialiser la disposition » in the filter bar; actions `movable: false,
hideable: false, menu: false, chooser: false`, pinned at the end (the box column is the grid's own, never moved); the
short columns 28 px wider for the ⋮, « Code-barres » 176; the chooser's footer buttons drawn by the DzGrid block of
`styles.scss`; `columns.unlayered.css` and `columns-panel.unlayered.css` imported.

**Sizes**: theme 2 764 / 2 850, comfort 551 / 650, K.8 84 449 / 84 450 (two merges in the theme paid for the fix).
**Gates** (once, `caffeinate -i`, 2 workers): vitest 480 files / 7 190 tests, typecheck, check:size 0 over, build,
check:contrast 1 092 / 0; Chrome `--only pagination` 69 / 69, `filters` 32 / 32.

**Screens** (playground `owner-look.html?preflight=1&wide=1` with `late=1`, `cols=1`, `lang=ar`, `theme=dark`, a temporary
vite on 4711, stopped afterwards): `screens/polish4-footer-{light,dark,rtl,narrow-light}.png`, `polish4-wide-light.png`,
`polish4-columns-{menu,chooser}-{light,dark,rtl-dark,rtl-light}.png`, `polish4-columns-kept-light.png`.

**Owner check on :4200** (after a restart):
- Tick a page: « Sélectionner les 1 604 lignes » and « Effacer la sélection » as normal buttons on one line; the four
  arrows square; narrow the window: the footer on two lines, nothing on top of anything.
- 100 a page at full width: no horizontal bar.
- Drag « Marque » after « Type »; focus a header and ⌘+Maj+→ (Ctrl+Maj+→ elsewhere): the column moves, the header search
  boxes still filter.
- Drag a header's edge; double-click it or « Ajuster cette colonne » in ⋮.
- Right-click a header or Maj+F10: the ⋮ menu (sort, pin, size, move, hide, « Choisir les colonnes… », reset); none on
  the actions column; the box column never moves.
- « Colonnes »: the chooser; untick « Type »; reorder.
- Reload: the same layout, page size, sort and filters; switch to « Produits scannés »: its own layout.
- « Réinitialiser la disposition »: the definitions' layout back.
- Same in dark mode.

