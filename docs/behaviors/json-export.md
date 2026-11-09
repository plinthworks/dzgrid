# Exporting to JSON

Written before the code (CLEANROOM). Source: Tabulator's public feature list (« download JSON »), used as a checklist only.
Owner answers 2026-11-09 (1.9.0 lot A, item 3). Same export as CSV and Excel (`csv-export.md`, `xlsx-export.md`): one
feature, `csvExport()` from `@dzgrid/dom/export`, a third format.

## What the user does
Presses the host's « JSON » button; a `.json` file downloads with the rows they see (or the ticked ones, or all of them).

## Behaviours (numbered, each one a test)
1. `run(scope, { format: 'json' })`, `bind(button, { format: 'json' })`: no option to switch it on — the JSON writer is a
   chunk of its own, loaded at the first JSON export (a grid that never exports JSON downloads none of it).
2. Same scopes, same order, same refusal and audit as CSV: `displayed`, `selected`, `all`; `canExport(request)` sees
   `request.format === 'json'`; `exportRequested` / `exportFinished` carry `format: 'json'`; the browser's cell cap.
3. On a server's pages, `all` and `selected` go to the application's `exportAll(request)`, whose `request.format` says
   `'json'` (the server writes the file).
4. The file: one JSON array of objects, one per data row, in screen order, each with the written columns' **ids** as keys
   in column order (the visible ones, or `columns`). UTF-8, no BOM, `application/json`, `.json`.
5. Raw values (`text: 'value'`, the default), read through the edit overlay like every export: a number as a JSON number
   (not finite: `null`), a boolean as `true` / `false`, a day as `"YYYY-MM-DD"`, an instant as ISO UTC text with `Z`
   (exact, no zone guessed), an enum as its **code**, a text as is. A blank cell: `null`. An unreadable one: `null`,
   counted (`invalid`), never its raw value.
6. `text: 'display'`: every value as the cell shows it (a string; blank: `null`).
7. Data rows only: no group row, no totals row (grouping's or `totalsRow()`'s), no tree filler, no detail. A tree's and a
   grouped grid's data rows are written flat, in screen order (no level).
8. No formula guard (JSON is not opened by a spreadsheet as cells); `JSON.stringify` escapes what must be.
9. Built in slices like CSV (no frozen page), cancellable; the outcome `done` / `refused` / `failed` / `cancelled`.

## Tests
`packages/dom/test/export-json.test.ts` (each rule, the file's text by hand).
