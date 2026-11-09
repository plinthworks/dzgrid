# Import a CSV or Excel file

Written before the code (CLEANROOM). Sources, as a checklist only: the public feature lists of grids and spreadsheet
widgets offering « import CSV / XLSX », RFC 4180 (CSV), ECMA-376 / ISO 29500 (the `.xlsx` package: a ZIP of XML parts),
APPNOTE (ZIP), the Compression Streams API, HTML drag and drop, WCAG 2.2 (2.1.1 keyboard, 4.1.3 status messages). Owner
answers 2026-11-09 (1.9.0 lot B, item 2, « ★ partout »). Entries: `@dzgrid/dom/import` (`fileImport({ accept, onRows })`,
texts `locales/<lang>-import`), its reading in a lazy chunk over `@dzgrid/core/import` (pure: CSV, ZIP directory, sheet
XML, rows from a table).

## What the user does
Drops a `.csv` or `.xlsx` file on the grid, or presses the application's « Import » button and picks one. The application
receives the rows read and decides what to do with them (add them, replace the grid's rows, show a preview).

## Behaviours (numbered, each one a test)
1. **The grid never changes its rows by itself**: `onRows(rows, problems, file)` is called once per file — `rows` the
   rows read, `problems` what was refused, `file` `{ name, format: 'csv' | 'xlsx' }` — and the application decides.
2. **Two ways in.** Drag and drop onto the grid (on by default, `drop: false` turns it off), and the keyboard path: an
   application button given to `api(grid).bind(button)` opens the browser's file picker (`accept` filtered); `open()` opens
   it from anywhere; `read(file)` reads a file the application got itself.
3. **The drop zone**: while a file is dragged over the grid, the grid shows « Drop the file to import it » over itself
   (`import.drop`, the root marked `data-dzg-drop`), said once politely; leaving or dropping hides it. Other drags (text,
   a row being moved) are not taken. Several files: the first is read, a warning `import-file` detail `many`.
4. **Which format**: a file starting with a ZIP signature is read as Excel, otherwise as CSV; a format not in `accept`
   (default both) or an old binary `.xls`: no rows, `import-file` detail `type`.
5. **CSV**: UTF-8 (a byte order mark dropped); a file that is not valid UTF-8 is read as Windows-1252 (old Excel
   exports). The separator is the one of `,` `;` TAB found most often in the first line outside quotes (`,` on a tie).
   Quoted cells hold separators, quotes doubled, line breaks; a lone quote inside a cell is literal (the clipboard's
   reader, `clipboard.md` 10–11, with a separator).
6. **Excel**: the first sheet of the workbook (its order, not the file names), shared strings, inline strings, numbers,
   booleans, ISO dates and error cells. ZIP entries stored or deflated (`DecompressionStream`); a browser without it, a
   broken or encrypted package, a workbook without a sheet: no rows, `import-file` (detail `deflate`, `zip`, `sheet`).
7. **The first non-empty row is the header**, each of its cells matched to a column by its title or its id, without case,
   accents or surrounding spaces (the quick search's folding). A header matching no column: its cells are ignored,
   `import-header` (path `header[i]`); the same column twice: the second ignored, detail `duplicate`; no header matching
   any column: no rows, `import-file` detail `header`. A column absent from the file is absent from the rows.
8. **Values through each column's codec**, as if typed in the grid's language (`parseInput`): a CSV's text, an Excel
   cell's text; an Excel number or boolean as a value. An Excel date (a serial number) in a `day` column is that day; in an
   `instant` column, that wall time in the grid's time zone (a time skipped or doubled by a clock change refused with
   that code). A blank cell gives `null`.
9. **A refused cell** is left out of its row and told: `import-cell`, warning, path `rows[i].<column id>` (`i` the row's
   place in `rows`), detail the refusal's code (`parse`, `day`, `options`, `invalid`…). **Never the value**: a problem
   carries no cell text, no header text, no file content.
10. **The rows**: one object per non-blank line after the header, each value at the column's `field` (a dotted path made
    nested) or its id, in file order; empty lines skipped.
11. **Said when done**: « {rows} rows read, {problems} problems » (`import.read`), or « This file cannot be read »
    (`import.failed`) when no rows came, politely.
12. **Small**: the base entry only listens; the reading (CSV, ZIP, XML, codecs) is a chunk loaded at the first file.
13. **Right to left**: the drop zone's text at the start side; nothing else differs.

## Where DzGrid differs on purpose
- No « import replaces the data » switch: the application owns its rows (owner).
- One sheet, no formulas computed (the cached value is read), no styles: a file is data, not a workbook to edit.

## Tests
`packages/core/test/import.test.ts` (CSV separators, quotes, BOM; a ZIP with stored entries made by hand; sheet XML with
shared and inline strings, numbers, booleans, errors; header matching; codecs; problems without values; serial dates);
`packages/dom/test/import.test.ts` (button, `open`, `read`, drop zone shown and said, other drags ignored, the first file,
a deflated `.xlsx` through `DecompressionStream`, Windows-1252, texts); browser `scripts/browser-lot-b.mjs` (a real drop in
Chrome).
