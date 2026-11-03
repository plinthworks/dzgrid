# Status bar and dockable panels plan (Phase 9)

Sources: ARCHITECTURE §2.8 (« Barre d'état (totaux, sélection, agrégat de plage) », « Panneau latéral : colonnes,
filtres »), §3 root layout (l. 1259: `div.dzg-footer` « pagination · barre d'état », outside `role="grid"`), §5.2
(`/menus+sidebar+statusbar` 9 kB, to come), §6 Phase 9 (l. 1870: `dom/statusbar`); `decisions.md` « Next in Phase 9 »
(owner, 2026-11-03: status bar first, then the filters panel; panels dockable like an editor's tool windows);
`docs/behaviors/{pagination-footer,parts,range-selection,columns-chooser,context-menu,grid-state,direction}.md`;
`packages/core/src/range/box.ts`, `range.ts`, `state/state.ts`, `i18n/format.ts`, `value/digits.ts`, `kernel.ts`
(`rangeChanged`); `packages/dom/src/{grid,styles}.ts`, `pagination/{index,context,styles}.ts`, `range/index.ts`,
`columns-panel/index.ts`, `popup.ts`, `state/index.ts`, `context-menu/index.ts` (`items`); `npm run check:size` run on
2026-11-03. What other products show (a strip of sums under a spreadsheet, an editor's tool windows docked, tabbed,
floating) is named from their public pages and from WAI-ARIA APG (window splitter, tabs, dialog), nothing read
(CLEANROOM.md).
Plan only; nothing coded. Sheet → tests first (red) → code → review → gate.

## 0. What the code already holds

- **The block is in the core already.** `rangeBox(range, displayed, columns)` and `boxRows(box, displayed)` (data rows
  only: details, fillers, loading rows count for nothing) in `@dzgrid/core/range`; the kernel emits
  `rangeChanged {source, range}`. Nothing sums yet.
- **Numbers are written by the core** (`formattersFor(ctx).number(spec)`, Intl built once, digits stated by
  `intlTag`, so Arabic-Indic digits follow the locale); a column's `numberFormat` is its `NumberFormatSpec`.
- **A bottom strip exists**: `pagination()` appends `div.dzg-footer` last in the root, outside `role="grid"`, sets
  `--dzg-footer-size` so the overlay stops above it, and draws named parts of the `footer` slot (`parts.md`).
  Colours of `.dzg-footer` are in `dzgrid.css` already; its layout is injected by the feature.
- **Row counts** are in the model (`rows.counts: {total, filtered}`); the selection count comes with
  `selectionChanged`.
- **The « columns panel » is a modal dialog** (`columnsChooser()`, popup host, `aria-modal`), its body (search, list,
  reorder) built inline in `columns-panel/index.ts`. No side panel exists; the root is a flex column
  (`viewport`, `overlay`, `tooltip`, `live`, then the footer). Several things are appended to the root and placed
  from the viewport's box (edit marks, editor bubble, the column drag layer): **putting a panel beside the viewport
  inside the root would shift them all.**
- **The cell menu takes app items** (`contextMenu({ items(c, defaults) })`).
- **No F6, no landmark** but the pager's `<nav>`.
- **Budgets are tight**: core 29 147 / 29 150, core/range 2 896 / 3 200, core/state 1 500 / 1 510, dom 22 428 / 22 440,
  internal 3 643 / 3 700, pagination 3 132 / 3 450, context-menu 2 400 / 2 400, columns-panel 4 348 / 4 400,
  dom/state 1 212 / 1 224, theme 2 832 / 2 850, Angular 7 440 / 7 450, K.8 87 346 / 90 000.

## 1. The status bar (ships alone)

### 1.1 Behaviour

A strip at the bottom of the grid. On the reading-start side the row counts the app asked for; on the reading-end
side, while a block of two cells or more is selected, its figures:
« Nombre : 12 · Somme : 1 234,50 · Moyenne : 102,88 · Min : 3 · Max : 410 ».

- **Which cells count.** The block's data rows (`boxRows`) × its visible columns. **Nombre** = cells not empty
  (any type). **Somme, Moyenne, Min, Max** = cells of `type: 'number'` columns holding a finite number (the typed
  value, never the text shown; a text column holding « 12 » is not a number, no guessing). No number in the block:
  only « Nombre » shows. A block on a server with rows still loading: the figures of the rows loaded, with « (partiel) ».
- **Format.** Every number cell of the block in one column, or in columns with the same `numberFormat`: that format
  (« 1 234,50 € », « 12 % »). Columns with different formats: the locale's plain decimal, at most 2 fraction digits
  (owner Q-SB4). Moyenne: the format with 2 more fraction digits allowed (a mean of integers is not an integer). Nombre:
  an integer in the locale's digits. All through `formattersFor(ctx)`: Arabic digits in `ar`, never reversed
  (`<bdi>` around each figure, label and figure as isolated pieces).
- **Sum without drift.** Compensated (Neumaier) summation: 0.1 + 0.2 + … shows what a person expects once formatted.
- **When it is computed.** At most once per frame while the block moves (a drag, Shift+arrows), on the grid's
  scheduler; above `maxCells` (default 200 000) the figures show « … » until the pointer is released or the keys stop
  for 150 ms, then one pass. Rows edited, filtered, or a transaction: recomputed (the block's box is re-read).
- **Row counts** (on request): « Lignes : 1 234 » (total), « Filtrées : 230 » (only when ≠ total), « Sélectionnées :
  12 » (only when ≥ 1; « tout » when the selection is « all matching » and its count unknown, as the footer).
- **Screen readers: never on their own.** The strip is plain text (no live region): a selection change says only what
  `range.size` says today. On demand (owner Q-SB3): the cell menu's item « Lire les totaux » (Maj+F10, added by the
  status bar to the menu's defaults when both features are on) and `statusBar.api(grid).announce()`; both say one
  polite sentence through the grid's live region (« Somme 1 234,50, moyenne 102,88, … 12 cellules »). The strip is a
  `role="group"` named `status.label` (« Barre d'état, Patients »), so a reader can reach it by its name.

### 1.2 API (default = today exactly)

```ts
import { statusBar } from '@dzgrid/dom/statusbar';
import { FR_STATUS } from '@dzgrid/dom/locales/fr-status';
createGrid(host, { features: [range(), statusBar()], messages: { ...FR, text: { ...FR.text, ...FR_STATUS.text } }, … });
```
- No `statusBar()`: nothing drawn, nothing paid (today).
- `statusBar({ items?, maxCells? })`. `items`: names in order, from `status.rows`, `status.filtered`,
  `status.selected`, `status.count`, `status.sum`, `status.avg`, `status.min`, `status.max`, or an app's own part
  name (dotless). Default (owner Q-SB1): `['status.count', 'status.sum', 'status.avg', 'status.min', 'status.max']`.
- **App items** = parts of a new slot `status` (`parts.md`): a host's part of the same name replaces a built-in one; a
  host's dotless part may be listed. Context: `stats` (`RangeStats | null`), `counts`, `selection` (as the footer's),
  `format(n, column?)` (the grid's number writing), `msg`. Unknown name: skipped, `unknown-part` at
  `statusBar.items[i]`. Without `range()`, the block items stay empty and are told once (`missing-feature`,
  `features.statusBar`, detail `range`).
- **With `pagination()`** (owner Q-SB2): one strip. Both features draw into one shared bottom strip (`dzg-footer`,
  made by whichever comes first, from `@dzgrid/dom/internal`): pagination's parts first, then the status items at
  the reading end, the pager last. Without pagination, the status bar draws its own `dzg-footer`.
- `StatusBarApi`: `announce()`, `stats()` (the figures now, for an app's own display).
- Angular: nothing new (features are passed as today).
- **The bottom strip stays a fixed footer, not a dock panel** (§2.1): it is always visible, never resized, never
  floated, never tabbed, and costs nothing of the dock.

### 1.3 Core vs DOM

- **Core** (`@dzgrid/core/range`, pure): `rangeStats(box, displayed, columns, read)` → `{ cells, filled, numbers,
  sum, min, max, partial, formats }` (`formats`: the distinct `numberFormat` keys met, so the DOM picks one or the
  plain one); `avg` derived. Neumaier sum; NaN and ±Infinity skipped; no `Date`, no Intl (formatting stays in the
  DOM through the core's formatters). Conformance cases by hand.
- **DOM** (`@dzgrid/dom/statusbar`, new entry over `@dzgrid/dom`): the strip, the items, the frame throttle,
  `maxCells`, the menu item, the API, the texts check at setup (missing key throws, as pagination).
  `@dzgrid/dom/internal`: `bottomStrip(g)` (shared strip + `--dzg-footer-size`), pagination moved onto it.

### 1.4 Files

Core: `range/stats.ts` (new), `range.ts` (export). DOM: `statusbar.ts` (entry), `statusbar/{index,items,styles}.ts`
(new), `internal/strip.ts` (new), `internal.ts`, `pagination/index.ts` (uses the strip), `part.ts` (slot `status`,
type only), `part-texts.ts` (`StatusMessageKey`), `locales/{en,fr,ar}-status.ts` (new), `context-menu/index.ts`
(the « Lire les totaux » default when the status bar's handle is there). Theme: none (`.dzg-footer` colours reused).
Build: `package.json` exports, `size-budget.json`, `api/dom.api.txt`.

### 1.5 Sheets first

New `docs/behaviors/status-bar.md` (cells counted, formats, digits, partial, throttle, items, parts, one strip with the
pager, a11y). Edits: `pagination-footer.md` (the shared strip), `parts.md` (slot `status`), `range-selection.md`
(the figures follow the block), `context-menu.md` (the item), `a11y-protocol.md` new §24.

### 1.6 Tests first

- Conformance `conformance/cases/range-stats/` (by hand): integers; decimals 0.1 × 10 = 1; negatives and min/max;
  empty and null cells (Nombre counts filled only); a text column with « 12 » (not a number); a hidden column inside
  the box (not counted: the box is visible columns); a detail row and a loading row inside (not counted, `partial`
  true for loading); NaN / Infinity skipped; two formats → both keys; one corner gone → `null`.
- `core/test/range-stats-property.test.ts`: seeded blocks; sum equals an oracle in exact decimal (BigInt scaled).
- DOM `statusbar.test.ts`: no block → no figures; a block of one number → all five; text only → Nombre only; format
  of one column kept (€, %), two formats → plain; `ar` → Arabic-Indic digits and `<bdi>`; items order, unknown name
  told, host part replaces `status.sum`, dotless part shown; without `range()` told once; with pagination one strip,
  pager last, `--dzg-footer-size` covers it; a drag of 50 frames computes ≤ 50 times; 300 000 cells → « … » then one
  pass; nothing said on a selection change; menu item and `announce()` say one sentence.
- **Planted fault**: a sum without compensation must turn the decimal conformance case red.
- Browsers: `scripts/browser.mjs --only status` in Chrome, Firefox, WebKit (LTR fr, RTL ar dark, narrow 320 px: the
  strip wraps); axe in `scripts/audit-browser.mjs`; a11y protocol §24 (NVDA + Firefox, VoiceOver + Safari).
  `test:real-app` at the phase close only.

## 2. Dockable panels

### 2.1 The model

- **A dock is a frame around the grid, not inside it.** `dock()` wraps the grid's root at setup:
  `host > div.dzg-frame > [area start, .dzg, area end] / [area bottom]` (CSS grid, logical areas). The grid's root and
  everything placed from its viewport are untouched (§0). The status strip stays inside the grid's root, under the
  rows; a bottom panel sits under the whole grid (status strip included).
- **Panels register into it.** A feature that has a panel (the columns panel now, the filters panel next) calls
  `dockFor(g).add({ id, title, body(host) → handle, place })` when a dock is present; without a dock it keeps its
  dialog (today). A host's own panel: `dock({ panels: [{ id, title, mount }] })`.
- **Areas**: `start`, `end` (beside the grid), `bottom` (under it), `float` (a window). In RTL, `start` is the
  right: the frame uses logical areas only, nothing flips by hand.
- **Tabs**: two panels or more in one area → a `tablist` (APG tabs, manual activation: arrows move, Enter/Space
  opens, Home/End), one panel shown at a time.
- **Resize**: the edge between an area and the grid is a focusable `role="separator"` (APG window splitter):
  `aria-orientation`, `aria-valuenow/min/max` in px; drag; arrows ±16 px, Shift ±64, Home/End min/max; **Enter
  collapses / restores** (collapse = the area shrinks to its tab strip, the grid takes the room).
- **Floating window**: a non-modal `role="dialog"` (no `aria-modal`) named by its title, `position: fixed`; moved
  by its title bar (pointer capture) and by keyboard (its « Déplacer » button: arrows ±16 px, Enter or Escape ends);
  always kept inside the browser's viewport (clamped on move, on window resize, on restore). Escape inside it returns
  the focus to the grid; it stays open. Buttons « Ancrer » (back to its last area) and « Fermer ».
- **Moving a panel between areas**: a menu on the panel's tab or title (« Ancrer au début / à la fin / en bas /
  Flottant »), keyboard first; drag-to-dock with drop targets is **not** in this plan (cost).
- **Saved**: a new GridState part `dock` (optional, absent when there is no dock):
  `{ panels: { [id]: { area, open, size?, at?: { inline, block } } }, active: { start?, end?, bottom? } }`
  (`at` from the viewport's inline-start corner, so RTL restores to the same side). Checked in the core
  (`checkState`: unknown area dropped, sizes clamped, unknown panel kept for later), applied by the dock.
- **Focus and a11y**: each docked area is a `region` named by its active panel's title (« Colonnes, Patients »); the
  floating window a non-modal dialog. **F6 / Shift+F6** cycle grid → panels → status strip, **if the spike shows the
  page receives F6 in Chrome, Firefox and Safari** (browsers use F6 for their own bars). Decision rule: all three
  deliver an F6 the page can prevent → F6; otherwise no hidden key, the regions are in Tab order and named. Closing a
  panel returns the focus to what opened it, else the grid's cell.

### 2.2 The dock is big — a smaller first version (owner Q-SB5)

The full model above is ≈ 9.5 sessions and ≈ 6 kB. **First version (≈ 5 sessions, ≈ 3.4 kB)**: areas `start` and
`end` only, **one panel per area** (no tabs), resize by the edge and by keys, collapse, saved in GridState, RTL, the
columns panel docked. Then, when the filters panel arrives (it needs a second panel, so tabs): **V2** tabs + `bottom`
(≈ 2), **V3** floating window (≈ 2.5). The model, state shape and API are the full ones from V1 (unused areas
refused with a warning), so V2 and V3 add without breaking.

### 2.3 API (default = today exactly)

```ts
import { dock } from '@dzgrid/dom/dock';
createGrid(host, { features: [columnsChooser(), dock({ open: { columns: 'end' } })], … });
```
- No `dock()`: the columns panel is today's dialog; nothing else changes.
- `dock({ open?: { [panelId]: Area }, panels?, sizes?: { min?, max? } })`; `DockApi`: `show(id, area?)`, `hide(id)`,
  `move(id, area)`, `layout()`; event `dockChanged` through the feature's `on` callback (no new `GridEvent` member:
  `check:api`).
- `columnsChooser()` unchanged; with a dock, `openColumnChooser()` shows its panel instead of the dialog.
- GridState: `dock?` optional field and `'dock'` in `StatePart` (widenings). Angular: nothing new.

### 2.4 Core vs DOM

Core: `state/state.ts` (the `dock` part: read, check, canonical text; pure). DOM: `@dzgrid/dom/dock` (new, over
`@dzgrid/dom`): frame, areas, splitter, collapse, registry, menu « Ancrer… », state adapter (`StateEnv.dock`);
`columns-panel/body.ts` split out of `index.ts` (one body for the dialog and the panel); `dom/state` passes the
adapter.

### 2.5 Files

Core: `state/state.ts`. DOM: `dock.ts` (entry), `dock/{index,frame,splitter,tabs,float,menu,state,styles}.ts` (new;
`tabs` V2, `float` V3), `columns-panel/{index,body}.ts`, `state/index.ts`, `locales/{en,fr,ar}-dock.ts` (new). Theme:
`dock.css` (new: borders, the splitter's focus ring, the floating shadow; colours as `--dzg-*` / `--tz-*`).
Build: exports, `size-budget.json`, `api/*.api.txt`.

### 2.6 Sheets first

New `docs/behaviors/dock.md` (areas, registry, tabs, splitter keys, collapse, float move and clamp, RTL, state,
focus, F6 per the spike). Edits: `columns-chooser.md` (docked), `grid-state.md` (`dock`), `direction.md`,
`a11y-protocol.md` §25. Spike `spikes/s-f6/` (does the page get F6 in the three browsers; rule in §2.1).

### 2.7 Tests first

- Core `conformance/cases/grid-state/dock-*.json` (by hand): saved, unknown area dropped, size clamped, absent
  without a dock (a grid without dock: `stateText` equal to a hand-written string, as before).
- DOM `dock.test.ts`: frame wraps the root, the grid's children untouched; a panel registered shows at its area;
  splitter keys change the size and `aria-valuenow`, Enter collapses and restores; RTL: `start` drawn at the right
  (real Chrome, jsdom checks the attributes only); state restored puts each panel back; columns panel docked keeps
  every behaviour of `columns-chooser.md` but the modal ones (no trap, no `aria-modal`). V2 `dock-tabs.test.ts`
  (APG tabs keys). V3 `dock-float.test.ts` (move by keys, clamp after a window resize, Escape returns focus).
- **Planted fault**: a splitter that writes `left` instead of the logical side must turn the RTL browser check red.
- Browsers: Chrome, Firefox, WebKit, LTR and RTL, 320 px wide (areas fold: the panel becomes a full-width layer above
  the grid); axe; protocol §25.

## 3. Owner questions

- **Q-SB1** Que montre la barre d'état par défaut ? *Recommandation* : seulement les chiffres du bloc sélectionné
  (Nombre, Somme, Moyenne, Min, Max), dès 2 cellules ; les comptes de lignes si l'app les demande. Sans bloc,
  l'utilisateur voit une barre vide.
- **Q-SB2** Avec la pagination : une seule barre ou deux ? *Recommandation* : une seule ; les totaux puis le pager au
  bout. L'utilisateur garde une ligne de hauteur de plus pour les données.
- **Q-SB3** Lecteur d'écran : comment entendre les totaux ? *Recommandation* : rien n'est dit tout seul ; une entrée
  « Lire les totaux » dans le menu de cellule (Maj+F10) les lit en une phrase.
- **Q-SB4** Bloc sur des colonnes de formats différents (€ et %) : quel format pour la somme ? *Recommandation* :
  le nombre simple de la langue (2 décimales au plus) ; même format partout → ce format (« 1 234,50 € »).
- **Q-SB5** Le dock complet coûte ≈ 9,5 séances et ≈ 6 kB. *Recommandation* : d'abord une petite version (≈ 5
  séances) : panneau à gauche ou à droite, un par côté, largeur réglable, repliable, gardé dans l'état. Les onglets,
  le bas et la fenêtre flottante viennent avec le panneau de filtres. L'utilisateur voit le panneau des colonnes
  collé au bord de la grille au lieu d'une fenêtre.

## 4. Sub-steps (effort in sessions)

| Step | Content | Sessions |
|---|---|---|
| SB0 | Sheet `status-bar.md`, edits, conformance `range-stats/` by hand, owner answers | 0.5 |
| SB1 | Core `rangeStats` (Neumaier, partial, formats), property test | 0.5 |
| SB2 | DOM `statusbar`: strip shared with pagination, items and slot `status`, formats and digits, throttle, `maxCells`, menu item, API, locales en/fr/ar | 2 |
| SB3 | Browsers ×3, axe, protocol §24, playground, sizes, review, fixes, gate — **can ship alone (1.4.0)** | 1 |
| | **Status bar** | **4** |
| D0 | Sheet `dock.md`, spike F6 (3 browsers), conformance `grid-state/dock-*` | 0.5 |
| D1 | Core state part `dock` | 0.5 |
| D2 | DOM frame, areas start/end, splitter, collapse, registry, state adapter, RTL, locales, `dock.css` | 2 |
| D3 | Columns panel body split; docked columns panel | 1 |
| D4 | Browsers ×3, 320 px, axe, protocol §25, review, gate | 1 |
| | **Dock V1** | **5** |
| D5 | V2: tabs, `bottom` area, « Ancrer… » menu (with the filters panel) | 2 |
| D6 | V3: floating window (mouse, keys, clamp, focus, state) | 2.5 |
| | **Full dock** | **9.5** |

Each step ends with `npm run gate:step`.

## 5. Sizes (gzipped, minified; measured 2026-11-03 → estimated → line asked)

| Entry | Today / budget | Estimate | Ask |
|---|---|---|---|
| `@dzgrid/core/range` (`rangeStats`) | 2 896 / 3 200 | +300 | 3 200 kept |
| `@dzgrid/dom/statusbar` (new, over dom) | — | 2 000 | 2 300 |
| `locales/{en,fr,ar}-status` (new) | — | 200 / 240 / 300 | 250 / 300 / 350 |
| `@dzgrid/dom/internal` (shared strip) | 3 643 / 3 700 | +90 | 3 750 |
| `@dzgrid/dom/pagination` (on the strip) | 3 132 / 3 450 | −20 | 3 450 kept |
| `@dzgrid/dom/context-menu` (« Lire les totaux ») | 2 400 / 2 400 | +60 | 2 450 |
| `@dzgrid/dom`, `@dzgrid/theme`, Angular, K.8 | 22 428 / 2 832 / 7 440 / 87 346 | 0 | kept |
| **Dock V1** | | | |
| `@dzgrid/core/state` (`dock` part) | 1 500 / 1 510 | +150 | 1 700 |
| `@dzgrid/dom/dock` (new, over dom) | — | 3 000 (V2 +1 200, V3 +1 300) | 3 400 (full 6 000) |
| `@dzgrid/dom/columns-panel` (body split, docked) | 4 348 / 4 400 | +350 | 4 800 |
| `@dzgrid/dom/state` (adapter) | 1 212 / 1 224 | +50 | 1 300 |
| `locales/{en,fr,ar}-dock` (new) | — | 200 / 240 / 300 | 250 / 300 / 350 (full +100 each) |
| `@dzgrid/theme/dock.css` (new) | — | 550 (full 900) | 650 (full 1 000) |

The status bar costs a grid nothing unless `statusBar()` is used (≈ 2.3 kB with its texts); the dock likewise
(≈ 3.6 kB V1 with its texts and CSS). Estimates only: each step measures with `npm run check:size` and asks again when
over by more than 2 %.
