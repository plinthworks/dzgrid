# Density chosen by the user

Written before the code (CLEANROOM). Sources: the public documentation of data grids and design systems
about row density (compact, normal, comfortable rows), WAI-ARIA 1.2 (`menuitemradio`), WCAG 2.2 (1.4.4,
2.5.8, 2.4.11, 4.1.3). Plan D10; owner decision Q-R2 (A: a function for the application, an optional line in
the ⋮ menu, kept in the state). The densities themselves (`compact` 28, `comfortable` 32, `spacious` 40 px,
grown with the reader's text size, anchor kept) are already built: `virtual-scroll.md` « Row height ».

## What the user does
Picks « Compacte », « Normale » or « Aérée » in a column's ⋮ menu (when the application turned that line on),
or in the application's own toolbar.

## What they observe
- Every row and header row takes the new height at once (the header rows keep `headerHeight` when it is set); the row at the top of the view stays there; the
  focused row stays in view.
- The choice comes back next time when the application saves the grid's state.

## Behaviours (numbered, each one a test)
1. `grid.setDensity('compact' | 'comfortable' | 'spacious')` (the same as setting the `density` option,
   source `user` when called from a user control; `api` otherwise) and `grid.density()` to read it.
2. An event `densityChanged { density, source }`; none when the value does not change.
3. The menu line: `columnMenu({ density: true })` adds a radio group (`column-menu.md` 16) « Densité »,
   the current one checked; choosing one calls `setDensity` (source `user`), closes the menu, the focus back on
   the header, sentence `density.changed`.
4. With `rowHeight` a number, the menu line is absent and `setDensity` changes the stored density only
   (`rowHeight` still wins; visible once `rowHeight` is removed).
5. `GridState.density` is captured always and restored before the query (`grid-state.md` 6); `stateChanged`
   fires on a user change.
6. Height change: as `virtual-scroll.md` (anchor and focus kept, WCAG 2.4.11); auto heights re-measured
   (`auto-height.md` 7).
7. A value that is not one of the three: ignored, warning `invalid-setting` (path `density`), no event.

## Keyboard
In the menu: the radio items' keys (`column-menu.md`). No shortcut of its own.

## Announcements
Polite `density.changed` after a user's choice (menu); the API is silent.

## Texts (`locales/{en,fr,ar}-columns`)
| Key | en | fr | ar |
|---|---|---|---|
| `density.label` | Density | Densité | الكثافة |
| `density.compact` | Compact | Compacte | مضغوطة |
| `density.comfortable` | Normal | Normale | عادية |
| `density.spacious` | Spacious | Aérée | واسعة |
| `density.changed` | Density: {density} | Densité : {density} | الكثافة: {density} |

## Right to left
Nothing specific (heights only).

## WCAG notes
- 2.5.8: « compacte » rows stay ≥ 24 px (28 px at 16 px text); 1.4.4: every density grows with text size.
- 2.4.11: focus kept in view; 4.1.3: the change said.

## Choices to confirm (not settled by the decisions)
1. `density` saved in the state always (not only after a user change).
2. The menu's « Densité » group is the menu's last section, before the application's items.
3. `comfortable` is labelled « Normale » (the default density's name for users).

## Tests (to be written with the code)
`packages/dom/test/density.test.ts` (API, event, no-op, invalid, `rowHeight` wins, anchor and focus),
`column-menu.test.ts` (the line present / absent, sentence), `state.test.ts` (round trip).

## `--dzg-row-height` (feedback pass F, 2026-10-27, owner Q4)
Read-only: written by the grid on its root from `rowHeight` or the density, read by the theme. A host stylesheet
setting it changes nothing (the inline value wins and the rows are placed by the setting): use `rowHeight` (a number,
24 at least) or `density`; Angular `[rowHeight]`. Test: `packages/dom/test/feedback-row-height.test.ts`.

## Header height (`headerHeight`, 1.9.0, owner 2026-11-09)
Written before the code. The owner wants the header taller than the rows (a 70 px header over 40 px rows).

### What the application does
Sets `headerHeight` (a number of px at 16 px text) in the settings, or later with `update()`; Angular
`[headerHeight]`, `<dz-grid header-height="70">`.

### Behaviours (numbered, each one a test: `packages/dom/test/header-height.test.ts`)
1. The column headers' row is `headerHeight` tall; the data rows keep `rowHeight` or the density's height.
2. Absent: every header row is one row high, as before 1.9.0.
3. The column-group rows above the column headers (`columnGroups`, the pivot's) take it too: the header is one
   height throughout (decided alone, 2026-11-09: a group title and the titles under it read as one block; a 70 px
   header with groups is 140 px). A column header with no group above it, stretched up over the empty group cells,
   covers that height. **1.10.0** (owner 2026-11-10, review 1.4): the group rows apart — see « Group rows' height »
   below.
4. The rows a feature adds under the column headers (the filter row) keep the row height: they hold controls, as
   cells do. A feature's row that gives its own height keeps it (1.10.0: `filters({ rowHeight })`, `filter-ui.md`
   « Floating row height »).
5. The same rule as `rowHeight`: from 24 to 1 000 px, grown with the reader's text size, whole px, never under 24
   (WCAG 1.4.4, 2.5.8). Anything else is ignored (the row height is used) and told: warning `invalid-setting`, path
   `settings.headerHeight`; the same value sent again is not told again.
6. Live: `update({ headerHeight })` changes the header at once; the body below it, the pinned top rows, the overlay,
   the busy bar and the « Loading… » message start under the new height, the view's height shrinks or grows by the
   difference (page keys, focus kept in view).
7. Vertical titles (`vertical-headers.md`): the column headers' row is the taller of `headerHeight` and what the
   longest title needs (capped by `maxHeight`).
8. Hidden headers (`headers: 'hidden'`): take no room, whatever `headerHeight` says.
9. A density chosen by the user changes the rows only while `headerHeight` is set; `headerHeight` is a setting, not
   in `GridState`.
10. The grid writes `--dzg-header-height` on its root (read-only, as `--dzg-row-height`): the column headers' row
   height. Print: a table, no heights (unchanged).

### Group rows' height (1.10.0, owner 2026-11-10, review 1.4)
Written before the code. An application wants tall column titles under thin group titles (a 70 px header row under
30 px group rows).

11. `headerHeight` also takes an object: `{ columns, groups }`. `columns` is the column headers' row, `groups` every
    column-group row above it (`columnGroups`, the pivot's). A number keeps its meaning: both.
12. A member left out: `columns` absent → the row height; `groups` absent → the column headers' height (so
    `{ columns: 70 }` is `70`, and `{ groups: 30 }` gives 30 px groups over row-high titles).
13. Each member follows rule 5 on its own: 24–1 000 px at 16 px text, grown with the text size, whole px; a bad one is
    ignored (its default above) and told: `invalid-setting`, path `settings.headerHeight.columns` or
    `settings.headerHeight.groups`; another value (a string, an array) is told at `settings.headerHeight`. The same
    heights sent again (a new object with the same numbers) are not told again.
14. Live as the number (6): the group rows, the column header stretched over empty group cells (it covers the group
    rows' heights, not its own row's), the pinned top rows, the sticky labels of spanned cells, the overlay and the busy
    bar start under the new header. `--dzg-header-height` stays the column headers' row. Print: a table, no heights.
15. Vertical and wrapped titles (`vertical-headers.md`, `header-wrap.md`) grow the column headers' row only, never the
    group rows.
16. Angular `[headerHeight]` takes the object; the element's `header-height` attribute stays a number (the object
    through its `headerHeight` property).

## Paddings follow the density (1.9.0, owner 2026-11-09, review 11.2)
Written before the code; the full sheet is `presentation-settings.md` 15. The layout sets `--dzg-density` from the
root's `data-density` (compact .75, comfortable 1, spacious 1.25); the theme's cell side padding is
`--dzg-cell-padding-inline` × it (cells, header cells, the box cell, a flash's mark, an editor's field, a tree's and a
group column's indent, the header buttons' gap for the grip). Heights unchanged by it. With `rowHeight` set, the density
still chooses the padding. `.dzg { --dzg-density: 1 }` in the application's CSS keeps paddings fixed. Tests:
`packages/theme/test/presentation-theme.test.ts`, the tree and editor sheets' tests.
