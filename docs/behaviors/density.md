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
- Every row and header row takes the new height at once; the row at the top of the view stays there; the
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
