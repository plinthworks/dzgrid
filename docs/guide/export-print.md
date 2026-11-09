# Export and print

## CSV and Excel

`csvExport({ canExport })` from `@dzgrid/dom/export` writes the grid's rows to a CSV file, and to an Excel file
(`.xlsx`) with `xlsx: true` (texts `-export`). The file holds the visible columns in their order, the sort and the
filters; values are written as values (ISO days, instants in the grid's zone, numbers a spreadsheet can add up), or as
the cells show them with `text: 'display'`.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { csvExport } from '@dzgrid/dom/export';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_EXPORT } from '@dzgrid/dom/locales/en-export';

type Kettle = { id: string; model: string; litres: number; boughtOn: string };

const exporter = csvExport({
  canExport: true,
  xlsx: true,
  separator: ';',
  fileName: ({ scope }) => `kettles-${scope}`,
});
const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_EXPORT.text } };

createGrid<Kettle>(document.getElementById('kettles')!, {
  rows: [{ id: 'k1', model: 'Whistling Wren', litres: 1.7, boughtOn: '2024-12-01' }],
  columns: [
    { id: 'model', header: 'Model' },
    { id: 'litres', header: 'Litres', type: 'number' },
    { id: 'boughtOn', header: 'Bought on', type: 'day' },
  ],
  getRowId: (k) => k.id,
  messages,
  selection: { mode: 'multi' },
  features: [exporter],
});

exporter.bind(document.getElementById('csv')!, { scope: 'displayed' });
exporter.bind(document.getElementById('xlsx')!, { scope: 'displayed', format: 'xlsx' });
document.getElementById('selected')!.addEventListener('click', async () => {
  const outcome = await exporter.run('selected');   // 'done' | 'refused' | 'failed' | 'cancelled' | 'busy'
  console.log(outcome);
});
```

- Scopes: `'displayed'` (the rows shown now: the current page when paged), `'selected'`, `'all'` (every row the
  query matches, on every page; the filters still apply).
- `canExport: true`, or a function that may refuse (`{ ok: false, reason }`) — a place for your own permission rule.
- A text starting like a formula (`=`, `+`, `-`, `@`) gets a leading `'` so a spreadsheet does not run it; a number
  such as `-5` never does. `numbers: 'excel'` (the default) writes the locale's decimal mark when the separator is `;`,
  `numbers: 'raw'` the machine form. `csv: 'text'` on a column keeps identifiers such as `0123` as text.
- The file is built in chunks so the page never freezes; `exporter.cancel()` stops it, `onProgress` follows it.
- With server data, the grid holds only some rows: give `exportAll(request, { signal, progress })`, which asks your
  server for the file (the request carries the query in wire form) and returns `{ url }` or `{ blob }`.
- The right-click menu offers the same: `contextMenu({ use: { csv: exporter, xlsx: exporter.xlsx } })`.
- In Angular: `<button [dzgExport]="exporter" dzgExportScope="displayed">` (directive `DzgExport`).

## JSON

The same feature writes a JSON file: `run(scope, { format: 'json' })` or `bind(button, { format: 'json' })` — no option
to switch it on, its code is fetched at the first JSON export. The file is one array of objects keyed by the column ids,
in screen order, with raw values: numbers, `true` / `false`, days `'YYYY-MM-DD'`, instants as ISO UTC text with `Z`,
enum codes, `null` for an empty cell (`text: 'display'` writes what the cells show). Group and totals rows are not
written; `canExport` and `exportAll` see `request.format === 'json'`.

```ts
import type { CsvExport } from '@dzgrid/dom/export';

declare const exporter: CsvExport;
exporter.bind(document.getElementById('json')!, { scope: 'all', format: 'json' });
```

## Import a file

`fileImport({ onRows })` from `@dzgrid/dom/import` reads a CSV or Excel (`.xlsx`) file dropped on the grid, or picked
with your own button (`api(grid).bind(button)`, the keyboard path), in the browser. The first non-empty line is the
header, matched to your columns by title or id (case and accents aside); each cell goes through its column's type as
if typed in the grid's language. **The grid never changes its rows**: `onRows(rows, problems, file)` gets one object
per line, at each column's `field` (or id), and you decide — add them, replace, or show a preview. A refused cell is
left out and told as a problem (`import-cell`, path `rows[3].qty`, its code), never with its value. Excel files are
inflated by the browser's `DecompressionStream`; the reading code is fetched at the first file. Texts `-import`.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { fileImport } from '@dzgrid/dom/import';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_IMPORT } from '@dzgrid/dom/locales/en-import';

type Jar = { id: string; flavour: string; grams: number };
let jars: Jar[] = [{ id: 'j1', flavour: 'Fig', grams: 250 }];
const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_IMPORT.text } };
const importer = fileImport({
  accept: ['csv', 'xlsx'],
  onRows: (rows, problems) => {
    if (problems.length) console.warn(problems);
    jars = [...jars, ...rows.map((r, i) => ({ ...(r as Omit<Jar, 'id'>), id: `new-${Date.now()}-${i}` }))];
    grid.update({ rows: jars });
  },
});
const grid = createGrid<Jar>(document.getElementById('jars')!, {
  rows: jars,
  columns: [{ id: 'flavour', header: 'Flavour' }, { id: 'grams', header: 'Grams', type: 'number' }],
  getRowId: (j) => j.id,
  messages,
  features: [importer],
});
importer.api(grid)!.bind(document.getElementById('import-button')!);
```

## Print

`print(grid, { title })` from `@dzgrid/dom/print` prints the rows as they are on screen — same columns, order, sort and
filters, not only the rows scrolled into view — as a real table: headers repeated on each page, no row cut in two,
right to left in Arabic, a dark theme printed light (texts `-print`, CSS `print.css`). At most 5 000 rows (`maxRows`);
beyond, a line says how many were printed. A grid with server pages prints the page shown.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { print } from '@dzgrid/dom/print';
import { printOnMenu } from '@dzgrid/dom/print-menu';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_PRINT } from '@dzgrid/dom/locales/en-print';
import '@dzgrid/theme/dzgrid.css';
import '@dzgrid/theme/print.css';

type Bell = { id: string; tower: string; note: string };

const messages: GridMessages = { ...EN, text: { ...EN.text, ...EN_PRINT.text } };
const grid = createGrid<Bell>(document.getElementById('bells')!, {
  rows: [{ id: 'b1', tower: 'Saltmarsh', note: 'F sharp' }],
  columns: [{ id: 'tower', header: 'Tower' }, { id: 'note', header: 'Note' }],
  getRowId: (b) => b.id,
  messages,
});

document.getElementById('print')!.addEventListener('click', () => void print(grid, { title: 'Bells of the coast' }));
printOnMenu(grid, { title: 'Bells of the coast' });   // the browser's own Ctrl+P prints the whole grid too
```

`print(grid, { header: false })` leaves the header rows out (they are printed by default, even on a grid with
`headers: 'hidden'`). `print` is a function, not a feature: nothing is loaded until it is called. `printOnMenu(grid)` makes the browser's
own print command (Ctrl+P, the File menu) print the whole grid as well; without it, that command prints only what the
page shows. In Angular, pass `ctrl.grid()` to both.
