# DzGrid guide

> **Pour le propriétaire.** Ce dossier est la documentation d'usage, en anglais : comment se servir de chaque entrée
> sans lire le code. Chaque exemple est compilé par un test (`scripts/test/guide.test.ts`), chaque nom importé existe
> dans `api/*.api.txt`, et `llms.txt` / `llms-full.txt` sont faits à partir de ces pages par `node scripts/llms.mjs`
> (un test vérifie qu'ils sont à jour). Les données des exemples sont inventées. Le site de documentation viendra plus tard.

How to use DzGrid, feature by feature. Every sample on these pages is type-checked against the published types by a
test, so what you read compiles. The behaviour sheets in [`docs/behaviors/`](../behaviors) say precisely what each
feature does; these pages say how to switch it on.

## Getting started

- [Plain TypeScript](getting-started-ts.md) — `createGrid` from `@dzgrid/dom`: install, a first grid, texts, events, updates
- [Angular](getting-started-angular.md) — `<dz-grid>` from `@dzgrid/angular`: inputs, outputs, the controller, parts as components
- [Web Component](getting-started-element.md) — `<dz-grid>` from `@dzgrid/element`: properties, attributes, `dzg-*` events

## Features

- [Columns](columns.md) — column definitions: values, types, formats, widths, pinning, groups, moving and resizing, the column menu; columns made from the data, the totals row, vertical titles, no header row, columns that collapse on narrow screens
- [Sort, filter and search](sort-filter-search.md) — sorting, column filters, the floating row, the filters panel, quick search, find
- [Selection and ranges](selection-ranges.md) — row selection, blocks of cells, the clipboard, the fill handle
- [Editing](editing.md) — editable cells, editors, validation, saving, undo and redo
- [Tree](tree.md) — rows nested by a parent id, a path or a children list; lazy children
- [Grouping](grouping.md) — row groups, totals, the drop band
- [Pivot](pivot.md) — a pivot table on top of grouping, its bar, data for a chart
- [Server data and infinite scroll](server-data.md) — `sourceRows`, `infiniteRows`, `serverSideRows`; the request and its answer
- [Row moves](row-moves.md) — dragging rows, moving them with keys or a menu, applying the move
- [Dock and panels](dock-panels.md) — side panels: the columns chooser, the filters panel, your own panels
- [Export and print](export-print.md) — CSV, Excel and JSON files, importing a CSV or Excel file, printing, the browser's own print menu
- [State](state.md) — saving and restoring sort, filters, columns; in storage or in the address
- [Theming and right to left](theming-rtl.md) — the theme's CSS, its variables, dark mode, density, direction
- [Accessibility](accessibility.md) — what the grid does for keyboards and screen readers, and what is left to you
