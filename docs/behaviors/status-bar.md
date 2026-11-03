# The status bar (the block's figures, row counts)

Written before the code (CLEANROOM). Plan: `docs/phase-9-steps/status-dock-plan.md` §1; owner answers Q-SB1…Q-SB4
(`phase-9-steps/decisions.md` « Status bar and dock — owner answers », 2026-11-03), which win over the plan. What other
products show (a strip of sums under a spreadsheet) is named from their public pages, nothing read.

## What the user does
Selects a block of cells (a drag, Shift+arrows, Ctrl+A) and glances at the bottom of the grid; a screen reader user
opens the cell menu (Shift+F10) and picks « Lire les totaux ».

## What they observe
1. **A strip at the bottom of the grid**, under the rows, outside `role="grid"`: the same strip as the pager when the
   grid is paged (one strip, owner Q-SB2), else its own. It keeps its height when empty (no jump when a block appears).
2. **The block's figures** at the reading end, by default (owner Q-SB1) while a block is selected (two cells or more):
   « Nombre : 12 · Somme : 1 234,50 · Moyenne : 102,88 · Min : 3 · Max : 410 ». No block: no figures.
   - **Nombre** (count): the block's cells that are not empty, any type.
   - **Somme, Moyenne, Min, Max**: over the finite numbers of the block's `type: 'number'` columns, shown **from two
     numbers** (owner: « from 2 numeric cells »); fewer: only « Nombre ». A text column holding « 12 » is text: counted,
     never summed (no guessing). The value is the typed one as the user sees it (an edit not saved yet included), never
     the text shown.
   - Only the block's **data rows** × its **visible columns** count: a detail panel, a group filler, a loading row and a
     hidden column inside the box count for nothing.
   - A block over rows still loading (a server's): the figures of the loaded rows, followed by « (partiel) ».
3. **Formats** (owner Q-SB4): all numbers met in one column, or in columns with the same `numberFormat`: that format
   (« 1 234,50 € », « 12 % »). Different formats (€ and %): the language's plain number, at most 2 decimals. The mean
   allows 2 more decimals than its format (a mean of whole numbers is rarely whole; a column without format: 2).
   Nombre and the row counts: whole numbers. Every figure in the grid's digits (Arabic-Indic in `ar`), never reversed:
   each figure is its own isolated piece (`<bdi>`), beside its label.
4. **Sums without drift**: 0.1 ten times is « 1 » (a compensated sum).
5. **Row counts, when the app asks** (`items`): « Lignes : 1 234 » (all rows), « Filtrées : 230 » (only when different
   from all), « Sélectionnées : 12 » (only when one or more; « toutes » when every matching row is selected and their
   number unknown). They sit at the reading start, before the figures.
6. **Big blocks**: past `maxCells` (200 000 by default) the figures show « … » while the block moves, and are counted
   once the pointer is released or 150 ms after the last key.
7. **Follows the data**: an edit, a filter, a sort, a transaction, hidden columns, a language change: the figures are
   counted again at the next paint. Never more than once a frame, however fast the block moves.
8. **Screen readers: nothing is said on its own** (owner Q-SB3). The strip is plain text, a group named « Barre d'état,
   <grid> », reachable by its name; no live region. On demand, one polite sentence in the grid's live region:
   « Nombre : 12, Somme : 1 234,50, … »:
   - the cell menu's item **« Lire les totaux »** (Shift+F10, the Menu key, a right-click) on a cell inside the block,
     when the app gives the menu the status bar (`contextMenu({ use: { status } })`); absent outside a block;
   - `statusBar.api(grid).announce()`. Without a block and without counts: « Aucun total ».
9. **Right to left**: the strip mirrors (counts at the right, figures toward the left, the pager last at the left); the
   figures read in the language's digits, each one isolated.

## What DzGrid does
- **API**: `statusBar({ items?, maxCells? })` from `@dzgrid/dom/statusbar` (a grid without it pays nothing). `items`:
  names in order among `status.rows`, `status.filtered`, `status.selected`, `status.count`, `status.sum`,
  `status.avg`, `status.min`, `status.max`, or an app's own `status` part (dotless name). Default
  `['status.count', 'status.sum', 'status.avg', 'status.min', 'status.max']`. `maxCells`: a whole number ≥ 1, else
  200 000 and an `invalid-setting` warning at `statusBar.maxCells`.
- **Parts**: each item is a part of slot `status` (parts.md): a host part of the same name replaces a built-in one. Its
  context: `stats` (the core's `RangeStats` plus `avg`, null without a block), `busy` (« … »), `counts`, `selection`
  (`count`, null when unknown), `figure(name)` (the text the strip writes for `count`, `sum`, `avg`, `min`, `max`, or
  null when it shows none), `format(n, column?)` (the grid's number writing, a column's format when named), and
  what every part gets. An unknown name: skipped, `unknown-part` at `statusBar.items[i]`. Block items without
  `range()`: empty, one `missing-feature` warning at `features.statusBar`, detail `range`.
- **One strip** (`@dzgrid/dom/internal`'s bottom strip, `div.dzg-footer`, the last child of the grid's root): made by
  the first of `pagination()` and `statusBar()` set up, dropped with the last; it sets `--dzg-footer-size` so the
  overlay stops above it. Order: the pager's parts, then the status bar's group, then the pager (`footer.pager` when
  it is the last name of `pagination({ footer })`).
- **Texts**: `locales/<lang>-status` (`EN_STATUS`, `FR_STATUS`, `AR_STATUS`), `STATUS_KEYS`; a missing key throws at
  setup (as `pagination()`). The item's label sits around its figure in one text (`{v}`): « Somme : {v} ».
- **API** `statusBar.api(grid)`: `announce()`, `stats()` (the figures now, counted on demand, null without a block).
- **A format Intl refuses** (a currency without its code): the plain number, one `invalid-setting` warning at
  `statusBar.numberFormat`, never a throw. A sum past the largest number: « ∞ », never « NaN ».
- **Core** `rangeStats(box, displayed, columns, { ctx, reader })` in `@dzgrid/core/range`: pure, Neumaier's sum, NaN and
  ±Infinity never numbers; no Intl.
- Angular: nothing new; `statusBar()` goes in `[features]`; an app item by `dzgPart` with `slot="status"`.
- Colours: `.dzg-footer`'s, from the theme; the layout injected by the feature (logical sides only).

## Tests
Conformance `range-stats/` (by hand); `core/test/range-stats-property.test.ts` (an exact oracle in cents);
`dom/test/statusbar*.test.ts` (figures, formats, digits and `<bdi>`, items and parts, one strip with the pager, frames,
`maxCells`, nothing said, the menu item and `announce()`, RTL, keyboard); planted fault: a plain sum turns
`decimals-tenths` red. Browsers: Chrome, Firefox, WebKit, LTR fr, RTL ar, 320 px; axe; a11y protocol §24.
