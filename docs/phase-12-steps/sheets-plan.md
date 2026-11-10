# Sheets (multisheet) — plan, measure, questions (1.10.0)

> **Parked (owner, 2026-11-10: too heavy).** Kept as a plan; nothing of it is built in 1.10.0.

Owner's answers 2026-11-10 (« ★ partout », sizes OK as proposed), items 1–8; behaviour sheet `docs/behaviors/sheets.md`.
**Status: plan written, nothing coded** — four structural choices below are not covered by the answers (Q-S1…Q-S4).

## Measure: one grid swapping, or one grid per sheet

`node spikes/sheets-memory/run.mjs` (Chrome, minified sources, 10 sheets × 10 000 rows × 8 columns, each sheet sorted;
result in `spikes/sheets-memory/results/result.json`, 2026-11-10). Heap after a forced GC; switch = the switch's own
work plus the paint in the next frame (median of 30 switches, every sheet already opened).

| | JS heap | DOM nodes | first opening | switch | scroll kept on return |
|---|---|---|---|---|---|
| data + one grid (baseline) | 19.4 MB | 441 | — | — | — |
| one grid, rows / columns / sort swapped | 20.4 MB | 441 | 8.6 ms | 8.5 ms (max 9.6) | no (to restore by hand) |
| one grid per sheet, made at first opening, kept hidden | 23.2 MB | 4 205 | 5.6 ms | **0.9 ms** (max 1.7) | yes |

One grid per sheet costs ≈ 0.3 MB and ≈ 420 hidden nodes per opened sheet of 10 000 rows (the rows are the app's either
way), and switches nine times faster. More decisive than the numbers: a single grid cannot hold a server sheet and a
browser sheet (a model's kind is fixed for a grid's life, `UPDATE_POLICY`), nor keep each sheet's selection, undo stack,
edits in flight, range, find or open rows apart — every feature holds them per grid. **Chosen: one grid per sheet**
(made at the first opening, kept until its sheet is removed). Its consequences are Q-S1…Q-S3.

## API (as proposed, ★ answers)

```ts
import { createSheets, type SheetDef } from '@dzgrid/dom/sheets';           // texts `-sheets`, CSS `sheets.css`
const book = createSheets(host, {
  sheets: [{ id: 'jars', title: 'Jars', columns, rows, getRowId }, { id: 'lids', title: 'Lids', columns, source }],
  activeSheet: 'jars',                         // live
  requests: ['add', 'rename', 'delete', 'move'],  // default none
  features: (sheet) => [gridState(), csvExport({ canExport: true, xlsx: true })],  // Q-S2: made per sheet
  messages, locale, timeZone, …                // every other GridSettings, shared; a sheet's own fields win
  onEvent: (e) => { /* sheetActivated, sheetAdd, sheetRename, sheetDelete, sheetMove, sheetsStateChanged,
                       and every grid event as { type: 'grid', sheet, event } */ },
});
book.update({ sheets, activeSheet });          // live, by id (sheet 6)
book.grid('jars');                             // that sheet's GridInstance (null: never opened) — every api(grid) works on it
book.active;                                   // id | null
book.state(); book.setState(s);                // { v: 1, active, sheets: { [id]: GridState } } (needs gridState() per sheet)
await book.exportXlsx({ fileName });           // one workbook, every sheet (lazy chunk)
book.importFile(file) / book.bind(button);    // every worksheet → onSheets([{ sheet, name, rows, problems }], file)
book.destroy();
```

- **Core** (pure): `@dzgrid/core/xlsx` gains a workbook writer over the existing sheet writer — one shared-strings table
  and one style book for every worksheet, `workbook.xml` listing them; `sheetNamesOf(titles)` (legal, unique, problems
  `xlsx-sheet-name`). `@dzgrid/core/import` gains `bookSheets(zip)` (every worksheet with its name, in workbook order)
  over the existing `sheetPath`. New problem codes: `sheets-id`, `sheets-active`, `state-sheet`, `xlsx-sheet-name`,
  `import-sheet` (types only: no byte in the core base).
- **DOM** `@dzgrid/dom/sheets`: the tab list (roving focus, rename input, drag with an insertion mark, small menu through
  `@dzgrid/dom/popup`), one panel per opened sheet (`hidden` when not active: the measure shows the scroll survives),
  the live diff by id, aborting a first server request when its sheet is left (`grid.destroy()` is not needed: the
  source's own abort on a new query / `rows.hold`; checked in the spike of step 2), workbook export and import in a lazy
  chunk. Texts `locales/{en,fr,ar}-sheets`; `@dzgrid/theme/sheets.css` with `--dzg-sheet-*` variables over `--tz-*`.
- **Angular / element**: Q-S3.
- **Print**: the active sheet (`print(book.grid(book.active))`); documented, no code.

## Decided alone (veto welcome)

1. Automatic activation (APG): arrows switch at once — switches cost ≈ 1 ms; a server sheet passed over by the arrows
   asks and is aborted at once (item 6 makes that cheap).
2. Request gestures: « + » after the tabs; double-click / F2 → inline input; Delete; drag and Alt+Shift+arrows / Home /
   End (the row-move chord, `row-move.md` 17); a tab menu (right-click, Shift+F10, context-menu key). Offered only for the
   kinds in `requests` (default none).
3. CSV, JSON and print: the active sheet; the workbook is Excel only (sheet 15).
4. Import: one sheets-aware callback `onSheets` per file, worksheets matched to sheets by folded name; CSV → active sheet;
   unmatched worksheet told, its rows not read (the app may add a sheet and read the file again).
5. Duplicate Excel names: ` (2)`, ` (3)` (Excel's own suffix style for copies).
6. A sheet's own settings win over the shared ones, field by field (`columns`, `rows` / `source`, `getRowId` are the
   sheet's; `getRowId` may be shared).
7. Selection and scroll kept in memory per sheet, not in the state (as `GridState` today).

## Questions for the owner (French)

**Q-S1 — La forme.** Une grille par feuille (mesuré : bascule 0,9 ms contre 8,5 ms, +0,3 Mo par feuille ouverte de
10 000 lignes ; une grille unique ne peut pas mélanger feuille serveur et feuille navigateur, ni garder à part
l'annulation, les plages, la recherche, la sélection de chaque feuille). Donc les feuilles ne sont pas une « feature »
d'une grille mais un conteneur au-dessus des grilles.
- ★ **A** `createSheets(host, { sheets, activeSheet, … })` dans `@dzgrid/dom/sheets` ; `book.grid(id)` donne la grille
  d'une feuille, et tout `api(grid)` existant marche dessus.
- B une seule grille qui échange lignes et colonnes (une feature `sheets()` dans `features`) : 8,5 ms par bascule,
  pas de feuille serveur à côté d'une feuille navigateur, état de chaque feuille sauvé / rétabli à la main.

**Q-S2 — Les features de chaque feuille.** Une feature ne sert qu'une grille (`csvExport` refuse une deuxième grille ;
d'autres gardent un état unique).
- ★ **A** `features: (sheet) => [...]` : une fabrique appelée à la première ouverture de chaque feuille (une feuille peut
  aussi donner sa propre liste) ; `book.grid(id)` + `exporter.api`… pour agir sur une feuille.
- B une seule liste partagée, et chaque feature rendue « multi-grilles » : touche presque toutes les features (lignes
  existantes au-delà de +2 %).

**Q-S3 — Angular et l'élément.** La marge de K.8 est de 268 o (89 732 / 90 000).
- ★ **A** un composant à part `<dz-sheets [sheets] [(activeSheet)] [requests] [features] [state] (sheetAdd)
  (sheetRename) (sheetDelete) (sheetMove) (sheetEvent)>` qui place un vrai `<dz-grid>` par feuille ouverte (parts,
  modèles, gabarits `dzgPart` par feuille) ; `<dz-grid>` inchangé, K.8 intact ; côté élément, `<dz-sheets>` dans
  `@dzgrid/element/sheets` (propriétés `sheets`, `activeSheet`, événements `dz-sheet-*`).
- B `[sheets]` sur `<dz-grid>` lui-même : ses modèles (`[(filter)]`, `[(selected)]`…) suivent la feuille active,
  `[columns]` et `[getRowId]` deviennent facultatifs ; dépasse la marge de K.8 (ligne à relever).

**Q-S4 — Excel de tout le classeur avec une feuille serveur** (le navigateur ne tient qu'une partie de ses lignes).
- ★ **A** ce que la grille tient (une feuille jamais ouverte : la ligne d'en-tête seule), avec un avertissement
  `xlsx-sheet-partial` ; l'application qui veut tout passe par son serveur.
- B l'export demande à l'application les lignes de chaque feuille serveur (`exportAll` par feuille), puis écrit le
  classeur.
- C une feuille serveur n'est pas écrite (avertissement).

## Sizes (estimates; lines set at measure + 10 %, rounded up to 50, rule Q-B)

| entry | estimate (gz) |
|---|---|
| `@dzgrid/dom/sheets` (tabs, keys, diff, requests, menu glue) | 3 500 – 4 500 |
| its lazy chunk (workbook export and import glue) | 800 – 1 200 |
| `-sheets` texts en / fr / ar | 200 / 250 / 300 |
| `sheets.css` | 450 – 650 |
| `@dzgrid/core/xlsx` (workbook writer, names) | +1 % to +2 % on 7 150; beyond, a new entry `@dzgrid/core/xlsx-book` |
| `@dzgrid/core/import` (every worksheet) | +1 % to +2 % on 2 300 |
| Angular `<dz-sheets>` (A) | own count, tree-shaken when not imported; `<dz-grid>` and K.8 unchanged |
| element `<dz-sheets>` (A) | new entry, measure + 10 % |
| core base, DOM base, theme base, K.8 | unchanged |

## Steps (after the answers; a test that fails first each time)

1. Core: names (`sheetNamesOf`), the workbook writer, every worksheet read; conformance cases by hand.
2. DOM: `createSheets` — panels, lazy making, live diff, removed active sheet, problems; abort of a first request left.
3. DOM: tab list a11y (roving, arrows mirrored, Home / End, ARIA, panel naming), narrow scroll, RTL; texts; `sheets.css`
   (contrast script).
4. DOM: requests (+, rename input, Delete, drag + Alt+Shift keys, menu).
5. State of every sheet; workbook export and import (lazy chunk); re-import of an exported workbook.
6. Angular `<dz-sheets>`, element `<dz-sheets>`; example entries (`example:entries`).
7. Browsers: `scripts/browser-sheets.mjs` — Chrome fr / ar (tabs, keyboard, axe), Firefox and WebKit once, a workbook
   exported and re-imported; one browser at a time, closed in finally.
8. Guide (`docs/guide/sheets.md`), CHANGELOG « Unreleased — 1.10.0 », STATUS; `npm run pack:local` then one
   `npm run gate:step`.
