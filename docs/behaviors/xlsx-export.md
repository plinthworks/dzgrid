# Exporting to Excel (.xlsx)

Written before the code (Phase 9, `docs/phase-9-steps/excel-plan.md`; owner answers Q-X1…Q-X5 in `decisions.md`).
Sources: ECMA-376 Part 1 §18 (SpreadsheetML) and Part 2 (packaging), PKWARE APPNOTE (ZIP). No spreadsheet or zip
library is read or used; nothing of another grid's export code (CLEANROOM.md).

## What the user does
Presses the application's « Excel » button, or right-clicks a cell → « Exporter en Excel ».

## What they observe
- A `.xlsx` file downloads. Excel opens it without asking to repair it.
- The header row is bold and stays at the top while scrolling; the pinned columns stay at the start.
- Numbers add up and look as on screen (€, %, decimals), with the reader's own separators.
- Dates are real dates: Excel sorts, filters and computes with them, shown in the reader's own date format.
- An Arabic grid gives a right-to-left sheet; `=1+1` typed in a cell stays text; `00123` keeps its zeros.
- A tree shows Excel's + / − buttons in the margin, everything open.

## What DzGrid does

One export feature, a second format: the same `canExport`, busy state, cancel, events, server path and sentences as
CSV (csv-export.md). `csvExport({ …, xlsx: true | { … } })`; `run(scope, { format: 'xlsx' })`;
`bind(button, { format: 'xlsx' })`; `exporter.xlsx.run()` for the cell menu.

### Cells
| Value | In the file |
|---|---|
| Number | A number cell holding the typed value, never the text shown. NaN, ±Infinity: no cell, counted `invalid`. |
| Day | Excel's serial (1900 system, 1900-03-01 = 61), shown in the reader's short date format (Q-X1 A). Before 1900-03-01: a text cell `YYYY-MM-DD`, and one problem `xlsx-early-day` per column (its count). |
| Instant | The serial of the **wall time in the display zone**, seconds kept, shown in the reader's date-time format; the header ends ` (Africa/Algiers)`. `instants: 'utc'`: UTC, the header ends ` (UTC)`. A repeated hour reads twice, as in CSV. |
| Boolean | A boolean cell (Excel says VRAI / FAUX in French). |
| Text, enum | A shared string; an enum by its label (`enums: 'code'` kept). **Never a formula**: no formula is ever written, so no `'` guard is added. A `csv: 'text'` column is text: leading zeros kept. |
| `text: 'display'` | Every cell a text cell, as the grid formats it. |
| Blank | No cell, counted `blank`. |

- Characters XML cannot hold become `_xHHHH_`; a literal `_xHHHH_` in the text is protected as `_x005F_xHHHH_`; a
  carriage return is `_x000D_`; a lone surrogate becomes U+FFFD. Past 32 767 characters a text is cut, and one problem
  `xlsx-text-cut` per column says how many.
- **Number formats** from the column's `numberFormat`: grouping `#,##0` (or `0` without grouping), then the minimum
  fraction digits as `0` and the rest up to the maximum as `#` (`#,##0.00##`); percent `0%`, `0.0%` (the value stays the
  fraction); currency with its symbol, on its side, as a quoted literal (`#,##0.00\ "€"`, `"$"#,##0.00`), the currency's
  digits. No `numberFormat`: General. Excel draws the reader's own separators.

### Layout
- **Header**: bold, a thin bottom border, no fill (a fill would be a colour in our code; the `xlsxStyle` hook may add
  one). `header: false` writes none.
- **Column groups** (default; `groups: false` writes one header row): one header row per group level above the column
  headers; a group's label in a cell merged across its written columns; a column with no group at a level has its header
  merged upward, as on screen. A group is cut where the written columns break it, and at the frozen columns' edge.
- **Widths**: the grid's current widths, pixels to Excel's character units (Calibri 11, a 7 px digit, 5 px padding),
  at most 255. A hidden column named in `columns`: its definition's width, else Excel's default.
- **Frozen panes** (`freeze: false` turns them off): the header rows, and the start-pinned columns when they are written
  first. End-pinned columns cannot be frozen in Excel (only leading ones can): written in place.
- **Filter buttons** on the last header row over the written range.
- **Merged cells** (Q-X2 A): by default the value is repeated in every slot it covers, so Excel's sort and filter work;
  `spans: 'merge'` writes it once and merges the slots, unless the merge would cross rows or columns not written (then
  repeated).
- **Tree** (Q-X3 A): `tree: 'outline'` (default) gives Excel's row groups, the parent above its children, all open, the
  tree column indented one step per level. Excel stops at 7 levels: deeper rows stay at 7 and one problem
  `xlsx-outline-depth` is told. `tree: 'level'` (CSV's level column first) and `'none'` are kept. A filler writes its
  label in the tree column; detail panels and loading rows are never written.
- **Direction**: a right-to-left sheet when the grid is right-to-left (`rtl` overrides); column A is the first logical
  column.
- **Sheet**: one, named `sheetName`, else the `export.fileName` text (« export », « تصدير »), cleaned: `[]:*?/\` removed,
  no `'` at either end, at most 31 characters, `Sheet1` when empty.
- **Not in the file**: formulas, document properties (no date: the same rows give the same bytes), images, comments,
  validation.

### Colours (Q-X4 A)
CSS classes do not go into the file. `xlsxStyle({ column, value, row, header })` returns `{ fill, color, bold, italic }`
or null, colours as `RRGGBB` chosen by the application; called once per written cell, only when given. Styles are shared
between cells; past 60 000 distinct ones, the rest are plain and one problem `xlsx-style-limit` is told. A colour that
is not `RRGGBB`, or a hook that throws: ignored, one warning `invalid-setting` at `xlsx.xlsxStyle`.

### Limits (Q-X5 A)
Past 1 048 576 rows (header rows included) or 16 384 columns, the export is refused before `canExport`, as the cell cap:
`exportRefused { refusal: 'too-large' }`, « Export non autorisé », nothing downloads; the application offers its server
export. The file itself is never cut. No ZIP64: a file past 4 GB is refused (`xlsx-too-large`).

### Compression
Each part is deflated by the browser (`CompressionStream('deflate-raw')`); where it is missing or fails, the part is
stored. The zip's time is fixed (1980-01-01): stored files are byte-identical from run to run. `@dzgrid/core/xlsx` is
pure and runs in Node too (stored, or the host's own deflate injected).

### Events and problems
`ExportRequest.format`, and `format` on `exportRequested`, `exportRefused`, `exportFinished`, are `'xlsx'` for an Excel
export (absent for CSV, as before). `run(…, { format: 'xlsx' })` without the `xlsx` option fails with `missing-feature`
at `export.xlsx`. A problem holds a code, a path (`xlsx.columns[2]`) and a count: never a value, a row key or a row
number.

## Tests
- Hand-written cases `conformance/cases/xlsx/*` (read back with node's `zlib` and a DOM parser); unit tests
  `packages/core/test/xlsx/` (CRC check value, stored vs deflated, same bytes twice, slices, escapes, no value in a
  problem); Excel against CSV on random seeds; `unzip -t` and `xmllint` when present.
- DOM `packages/dom/test/export-xlsx.test.ts`: the format in the request and events, `exportAll`, the stored fallback,
  cancel, the limits before `canExport`, the cell menu item.
- Chrome, Firefox and WebKit build the same content.

## Grouped rows (Phase 7, owner Q-EX A « et l'export Excel aussi »; built at step 7)
As the CSV (`csv-export.md` « Grouped rows » 1–7): group rows with their label and their totals as typed cells (numbers
as numbers, days as dates), footers and the grand total; the outline levels as for a tree.

Numbered (step 7, 2026-11-05; `conformance/cases/xlsx/group-*`, `packages/core/test/grouping-export.test.ts`):
1. **Outline** (`tree: 'outline'`, the default): Excel's row groups — a group row is the summary **above** its rows
   (its + / − beside it), its rows one level deeper, a footer at the level of the rows it closes (it folds with them),
   the grand total at the top level. Everything open in the file, whatever the screen (`displayed` writes only what is
   shown; `all` every group). Past 7 levels: `xlsx-outline-depth`, as a tree.
2. **The group column**: the label as text (« Alger (3) », « Total Alger », « Total » from the grid; the value as
   formatted when written alone), indented one step per level as a tree's.
3. **Totals as typed cells**: a sum, a mean, a min, a max, a first or a last in the column's own cell type and format
   (a number with its `numberFormat`, a day as a date serial, an instant as a date-time serial in the zone); a count
   always a plain number; an application's function's result read by the column (one it cannot read: no cell). Never a formula: Excel's
   own SUBTOTAL is not used (the file holds the grid's numbers, the compensated sums).
4. `tree: 'level'` writes CSV's level column instead of the outline; `'none'` flat lines with group rows still in;
   `groupRows: false` data rows only (CSV 5).
5. `xlsxStyle` is called for totals cells too, with `row: null` and `header: false`.
