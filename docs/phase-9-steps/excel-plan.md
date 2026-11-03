# Excel export plan (Phase 9)

Sources: ARCHITECTURE K.11 (« Writer XLSX maison, RTL compris, sans SheetJS ») and §3.16 (export, chunked, audit hook,
`exportAll`), the validated-decisions line on §3.16/K.11 (S8: zip, CRC-32, 0 wrong cells of 100 010, 3.9 kB gz,
`deflate-raw` kept with stored fallback, instants as wall time with the zone named, a text cell never a formula,
`_xHHHH_`, days before 1900-03-01 as text with a `Problem`, 32 767 characters a cell, chunked, no ZIP64 in v1);
`spikes/s8-xlsx/README.md` (method, results, open points) and ROADMAP's S8 line; `docs/behaviors/csv-export.md`
(scopes, `canExport`, events, slices, cancel, server, trees, spans); `packages/core/src/csv/` (`chunks.ts`,
`writers.ts`, `wall.ts`, `rows.ts`: `ExportRequest`); `packages/dom/src/export/` (eager feature, lazy `run/`);
`packages/dom/src/context-menu/index.ts` (`use.csv`); `packages/core/src/i18n/format.ts` (`NumberFormatSpec`);
`packages/core/src/columns/defs.ts` (`ColumnGroupDef`, `width`, `pinned`, `ui.cellClass`, `csv: 'text'`);
`decisions.md` « Order changed » (owner, 2026-11-03: Excel export first); `npm run check:size` run on 2026-11-03.
Written from ECMA-376 (Part 1 §18 SpreadsheetML, Part 2 packaging) and PKWARE APPNOTE only, as the spike was: no
spreadsheet or zip library is read or used, no line of ag-Grid's export code (CLEANROOM.md).
Plan only; nothing coded. Sheet → tests first (red) → code → review → gate.

## 0. What the code already holds

- **The whole export pipeline, format-free but for one line.** `csvExport()` (eager, 1 200 B gz) owns `run`, `bind`,
  `cancel`, `busy`, `prefetch`, one export at a time, the chunk loaded at the first use. The lazy `run/` chunk
  (4 870 B gz) awaits settled rows, builds the `ExportRequest`, tells `exportRequested`, applies `maxCells`, asks
  `canExport`, calls `exportAll` on server pages, then builds in slices (`drain`, `yieldTo`, `batcher` → Blobs of
  4 MB), names the file (`safeFileName`, `defaultFileName`), saves it (`deliver` or `<a download>`), tells
  `exportFinished` / `exportRefused` and says the sentence. **Only the build step is CSV**: `csvChunks(...)` and
  `'text/csv'`; and the name adds `.csv`.
- **The value rules are in `csv/writers.ts`**: overlay read, blank and invalid counts, codecs, enum labels, wall time
  (`wallWriter`, offsets cached per six hours). XLSX needs the same reads but typed output, not text.
- **The rows** (`csvRows`): scopes, details and loading rows left out, selection in screen order; trees in tree
  order with `levelAt`; spans through a `SpanMap` built by the run chunk over the same rows.
- **The spike's writer** (`spikes/s8-xlsx/zip.js`, `xlsx.js`, 330 lines): whole-file in memory, `TextEncoder`,
  `CompressionStream` inside — fine for a spike, not for the pure core (no `TextEncoder`, no stream in lib ES2023).
- **The cell menu** has `use.csv: { run(scope?) }` → « Exporter en CSV ». No Excel item yet.
- **Budgets:** `core/csv` 1 866 / 2 000; `dom/export` 1 200 / 1 350; `export: run (lazy)` 4 870 / 5 300;
  `context-menu` 2 444 / 2 450; locales `*-context-menu` 309 / 366 / 444 (lines 350 / 400 / 500); K.8 87 392 / 90 000.

## 1. Behaviour (sheet `docs/behaviors/xlsx-export.md`, written first)

**What the user does.** Presses the app's « Excel » button, or right-clicks a cell → « Exporter en Excel ».
**What they observe.** A `.xlsx` downloads; it opens in Excel without a repair prompt; the header row is bold and stays
at the top while scrolling, the pinned columns stay at the start; numbers add up and show as on screen (€, %, decimals)
with the user's own separators; dates are real dates Excel can sort and compute with; an Arabic grid gives a
right-to-left sheet; `=1+1` typed in a cell stays text.

### 1.1 What goes in the file

| Item | Decision |
|---|---|
| **Numbers** | `<c>` numeric, the typed value (never the text shown). NaN, ±Infinity: empty, counted (`blank` / `invalid`, as CSV). |
| **Days** | Serial in the 1900 system (1900-03-01 = 61) with a date format (Q-X1). Before 1900-03-01: a text cell `YYYY-MM-DD` and one `Problem` `xlsx-early-day` per column (path `xlsx.columns[i]`, detail: the count). |
| **Instants** | Serial of the **wall time in the display zone** (`wallWriter`'s offset logic, numeric form), date-time format (Q-X1); the header ends ` (Africa/Algiers)` as in CSV. `instants: 'utc'`: the UTC serial, header ` (UTC)`. A repeated hour reads twice, as in CSV. |
| **Booleans** | `t="b"` (Excel shows VRAI / FAUX in French). |
| **Text, enums** | Shared strings (`t="s"`), enums by label (`enums: 'code'` kept). **Never a formula**: no `<f>` is ever written, so the CSV guard's `'` is **not** added (nothing can run). `csv: 'text'` identifiers are text cells: leading zeros kept, no `="…"` trick. Characters XML cannot carry → `_xHHHH_`, a literal `_xHHHH_` → `_x005F_xHHHH_`, lone surrogates → U+FFFD. Over 32 767 characters: cut, one `Problem` `xlsx-text-cut` per column (count only). |
| **`text: 'display'`** | Every cell a text cell as the grid formats it (kept from CSV). |
| **Number formats** | From `numberFormat` (`NumberFormatSpec`) to an Excel code, built once per column: decimal `#,##0` / `0` (`useGrouping`), `minimumFractionDigits` zeros then `#` up to `maximumFractionDigits` (`#,##0.00##`); percent `0%`, `0.0%` (the value stays the fraction, as Intl and Excel both expect); currency: symbol and its side from `Intl.NumberFormat(locale, {style:'currency'}).formatToParts`, written as a quoted literal (`#,##0.00\ "€"`, `"$"#,##0.00`), the currency's digits from `resolvedOptions`. Excel draws the separators of the reader's own settings. No `numberFormat`: General. |
| **Column widths** | The grid's current widths (resized ones included) from the column model, px → Excel character units (`trunc((px − 5) / 7 × 256) / 256`, Calibri 11's 7 px digit), clamped to 255; a hidden column named in `columns`: its def width or Excel's default. |
| **Header** | Bold font (one `cellXfs` entry), a thin bottom border, colour `auto`. **No fill**: a fill needs an ARGB value in the file, and colours stay out of our code (§8, no hex); the host's hook may add one (§1.3). `header: false` kept. |
| **Frozen panes** | `<pane ySplit=h xSplit=p state="frozen">`: `h` = header rows (group rows + 1), `p` = start-pinned columns written first (plus the tree's level column if any). End-pinned columns cannot be frozen in Excel (only leading columns can): written in place, not frozen. `freeze: false` turns it off. |
| **AutoFilter** | On the last header row over the written range (Excel's filter buttons), as in the spike. |
| **Column groups** | One header row per group depth above the leaves; a group's label in a cell merged across its written leaves (`<mergeCells>`); a leaf with no group at a level merged vertically down to its header (as on screen). Groups are cut where the written columns break them (a moved column splits a group, as the screen does). Default on; `groups: false` writes one header row, as CSV. |
| **Spans** | Q-X2. Default `repeat` (the value in every slot, as CSV, so Excel's sort and filter work); `spans: 'merge'` writes the value in the first slot and a `<mergeCell>`; a merge crossing rows that are not all written (scope `selected`) falls back to repeat. Full-width rows: ordinary rows. |
| **Tree** | Q-X3. Default `tree: 'outline'`: `<row outlineLevel>` (roots 0), `<outlinePr summaryBelow="0">` (the parent above its children, as on screen), all open; the tree column indented with `alignment indent` (one style per level, capped with the outline). Excel stops at 7 levels: deeper rows stay at 7 and one `Problem` `xlsx-outline-depth`. `tree: 'level'` (CSV's level column) and `'none'` kept. Fillers: label in the tree column. Details never. |
| **Direction** | `<sheetView rightToLeft="1">` when the grid is `rtl` (`rtl` option overrides); cells in logical order, column A the first logical column (the CSV decision, step 23). |
| **Sheets** | One. Name: `sheetName` option, else the `export.fileName` text (« export », « تصدير »), cleaned: `[]:*?/\` removed, no leading or trailing `'`, at most 31 characters, `Sheet1` when empty. Several sheets: not now. |
| **Limits** | Excel holds 1 048 576 rows (header rows included) and 16 384 columns. Checked with `maxCells`, **before** `canExport` (same order as the cap): over → `exportRefused { refusal: 'too-large' }`, nothing built, the app offers its server export (Q-X5). ZIP64 out of v1: `maxCells` (10⁷) keeps the sheet XML far under 4 GB; the writer still refuses past 4 GB (`xlsx-too-large`). |
| **Not in the file** | No formula, no `docProps` (no creation date written: reproducible bytes, the spike's choice; Excel to confirm), no images, no comments, no data validation, no defined names. |
| **Problems** | Code + path + count only; **never a cell value, a row key or a row number** (rows may be sensitive). Sent once per export on `problems`. |

### 1.2 Cell colours

`ui.cellClass` gives CSS classes; turning CSS into Excel fills would mean reading computed styles in the DOM for every
cell (layout, cost, themes, dark mode): **not done**. Proposed instead (Q-X4), opt-in:

```ts
readonly xlsxStyle?: (c: { readonly column: string; readonly value: unknown; readonly row: Readonly<T>; readonly header: boolean }) =>
  { readonly fill?: string; readonly color?: string; readonly bold?: boolean; readonly italic?: boolean } | null;
```

Colours as `RRGGBB` given by the host (its own values, not ours). Styles de-duplicated (a map → `cellXfs` index);
past 60 000 distinct styles, plain cells and one `Problem` `xlsx-style-limit`. Called once per written cell only when
set: a grid without it pays a single `if`.

## 2. API (default = today exactly)

One export feature, a second format — not a parallel system: one `canExport`, one busy state, one audit trace, one
cancel, one server path.

```ts
// @dzgrid/dom/export
csvExport({ canExport, exportAll?, fileName?, …today's options…,
  xlsx?: true | XlsxOptions })                          // absent: CSV only, nothing changes
feature.run(scope?, { columns?, format?: 'csv' | 'xlsx' })  // default 'csv'
feature.bind(button, { scope?, format? })
feature.xlsx                                           // { run(scope?) } when `xlsx` is set: for the cell menu's `use`

interface XlsxOptions {                                 // core: @dzgrid/core/xlsx
  readonly sheetName?: string; readonly groups?: boolean; readonly freeze?: boolean;
  readonly spans?: 'repeat' | 'merge'; readonly tree?: 'outline' | 'level' | 'none';
  readonly instants?: 'wall' | 'utc'; readonly rtl?: boolean; readonly xlsxStyle?: …;   // Q-X4
}
```

- `text`, `enums`, `header`, `columns`, `levelHeader`, `treeColumn` are shared with CSV; `separator`, `bom`,
  `numbers`, `sanitizeFormulas` are CSV's only (ignored for XLSX: no text form, no formula).
- **`format` reaches the host:** `ExportRequest.format` (optional, `'csv'` when absent) — so `canExport` can allow CSV
  and refuse Excel, and the server's `exportAll(request)` knows which file to make. `exportRequested`,
  `exportRefused`, `exportFinished` gain `format` (types only in the base; zero runtime bytes there). A host's
  `exportAll` that ignores `format` returns whatever it makes; its `fileName` wins as today.
- `run(scope, { format: 'xlsx' })` without `xlsx` set: `failed`, warning `missing-feature` at `export.xlsx`, as
  `exportAll` today.
- File name: `.xlsx` instead of `.csv` (`safeFileName` takes the extension); MIME
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- **No new message key**: the sheet name reuses `export.fileName`; the sentences (« Exporté. N lignes »…) are the same.
  `EXPORT_KEYS` unchanged.
- **Cell menu:** `contextMenu({ use: { csv: exporter, xlsx: exporter.xlsx } })` → « Exporter en Excel » (key
  `export.xlsx` in `{en,fr,ar}-context-menu`, « Export to Excel », « تصدير إلى Excel »), the displayed rows, after the
  CSV item. Absent `use.xlsx`: no item.
- **The app's own button:** `exporter.bind(button, { scope: 'all', format: 'xlsx' })` — `aria-busy`, prefetch on hover
  and focus, as CSV.
- **Server grids:** unchanged path: `all` and `selected` go to `exportAll` with `format: 'xlsx'`. Since
  `@dzgrid/core/xlsx` is pure and runs in Node, a host's Node server may use it to write the same file (stored, or
  its own `zlib` deflate injected).
- `check:api`: additions only (`format` fields optional, `xlsx` option, `XlsxOptions`, `feature.xlsx`, the menu's
  `use.xlsx`).

## 3. Core vs DOM

**`@dzgrid/core/xlsx`** (new entry, pure, lib ES2023, no `TextEncoder`, no stream, no clock):
- `xlsxParts(input, options)`: a generator like `csvChunks` (same `CsvInput`-shaped input, ~500 rows a slice) yielding
  `{ entry, text }` pieces: `xl/worksheets/sheet1.xml` in slices, then `sharedStrings.xml`, `styles.xml`,
  `workbook.xml`, rels, `[Content_Types].xml`; returns the counts (`rows`, `columns`, `blank`, `invalid`) and the
  problems. Layout pieces (`<cols>`, pane, merges, autoFilter) are written from data the caller passes:
  `widths` (px), `pinnedStart` (count), `groups` (the header tree's leaf runs), `rtl`.
- Value writers sharing `csv/writers.ts`'s reads (overlay, codecs, counts) through a small common reader, so a fix to
  one rule reaches both (the « every place that recomputes » rule: screen, CSV, XLSX, clipboard).
- `numFmtFor(spec, ctx)` (the table above), `serialOfDay`, `serialOfWall`, `sheetNameOf`.
- `zip`: `crc32(update)` (slicing-by-8, from the spike), UTF-8 encoding by hand (default; the DOM injects
  `TextEncoder`), local headers **written after the data** (the entry's parts are held as compressed Blob parts
  anyway, so the header goes in front once CRC and sizes are known: no data descriptor, deterministic bytes), central
  directory, end record, fixed 1980-01-01 time. Deflate is **injected** (`deflate?: () => transformer`); absent:
  stored. Purity test unchanged and passing.

**DOM** (`packages/dom/src/export/`):
- eager part: `format` in `run`/`bind`, the `xlsx` facet, the `missing-feature` check (≈ +100 B).
- `run/`: the build step becomes « the format's builder », CSV kept static (CSV users' first download unchanged), XLSX
  by `import('../xlsx/index.js')`; the Excel limits before `canExport`; the extension and MIME.
- new lazy chunk `export/xlsx/`: reads widths, pinned count and header groups from the grid, encodes with
  `TextEncoder`, pipes each entry through `CompressionStream('deflate-raw')` (stored when missing or when it throws,
  per entry, as S8 decided), gathers Blob parts, yields with the same `drain` / `yieldTo` (≤ 16 ms slices, cancel
  checked each slice).

## 4. Tests first

All expectations by hand; written red before the code.
- **Conformance `conformance/cases/xlsx/*.json`** (≈ 20): rows, columns, options → expected cells (`A1` ref, type,
  value or serial, style's format code), merges, pane, outline levels, widths, sheet view. Cases: number formats
  (decimal 0/2/`2–4` digits, grouping off, percent, EUR in `fr`, USD in `en`, DZD in `ar-DZ`); days 1900-03-01 (61),
  1900-02-28 (text + problem), 2026-03-05; an Algiers instant and a Paris one inside the 2026-03-29 change; booleans;
  `=1+1`, `@SUM(`, `-5` text vs number; `_x0041_`; a lone surrogate; 32 768 characters; Arabic; `00123` identifier;
  groups two deep with a split group; spans repeat vs merge vs selected; a tree 9 deep; RTL; empty grid; one column.
- **Read-back helper** (test code, ours): parse the central directory, `zlib.inflateRawSync` per entry, check each
  CRC with `zlib.crc32`, parse the XML with jsdom's `DOMParser` (already a dev dependency) — no spreadsheet library.
- **Unit** `packages/core/test/xlsx/`: CRC check value `123456789` → `cbf43926`; stored and injected-deflate files read
  back equal; same input → same bytes (stored); slices joined equal the whole; problems carry no value (a sentinel
  string planted in every cell never appears in a problem or an event); escapes round trip.
- **Cross-check oracle**: `perf/export-permutation.ts` extended — for each seed, every XLSX cell read back equals the
  CSV value of the same cell under `numbers: 'raw'` (two writers, one truth); 200 seeds in `test:ci`.
- **Windowless file checks** (script test, skipped when the tool is absent): `unzip -t`, `xmllint --noout` on each
  part (both on macOS), Quick Look's converter `qlmanage -p -o` (as S8: values, Arabic, formats), and
  `soffice --headless --convert-to csv` when LibreOffice is installed (it is not on this machine today) compared with
  our CSV.
- **DOM** `packages/dom/test/export-xlsx.test.ts`: `format` in the request, the three events and `canExport`;
  `exportAll` receives `format: 'xlsx'`; `deliver` gets a Blob that reads back right; stored fallback when
  `CompressionStream` throws; cancel mid-build downloads nothing; the limits refuse before `canExport`; the menu item.
- **Browsers** (`scripts/audit-browser.mjs --only export`): Chrome, Firefox, WebKit build the same content (inflated);
  100 000 × 30 with no frame over 50 ms; the lazy chunk loaded only at the first Excel export.
- **Golden files for the owner**: `npm run example:xlsx` writes (not tracked) `examples/angular-audit/out/audit-ar.xlsx`
  (Arabic, RTL) and `audit-fr.xlsx` (groups, pinned, tree, €, %, dates, booleans, `=1+1`, `00123`). **The owner opens
  both in Excel on Windows and on a Mac** with a printed checklist: no repair prompt; header bold and frozen; pinned
  columns frozen; group headers merged; outline buttons + / − in the margin; € and % with his own separators; dates
  sortable (Ctrl+↓ then sort); booleans VRAI / FAUX; `=1+1` and `00123` as typed; Arabic sheet right to left, column
  A on the right. Numbers (installed) as a second look. Findings become conformance cases.

## 5. Owner questions

- **Q-X1** Dates dans Excel : format de date d'Excel de l'utilisateur (« 05/03/2026 », « 05/03/2026 23:59 ») ou ISO
  (« 2026-03-05 », « 2026-03-05 23:59:00 ») ? *Recommandation* : celui d'Excel (l'utilisateur voit ses dates comme
  partout ailleurs) ; les secondes restent dans la valeur, visibles en élargissant le format.
- **Q-X2** Cellules fusionnées à l'écran : dans Excel, valeur répétée sur chaque ligne ou vraie fusion ?
  *Recommandation* : répétée par défaut (le tri et le filtre d'Excel marchent ; avec une fusion Excel refuse de trier),
  fusion en option.
- **Q-X3** Arbre : groupes repliables d'Excel (boutons + / − dans la marge, nom en retrait, 7 niveaux au plus), tout
  ouvert à l'ouverture ? *Recommandation* : oui.
- **Q-X4** Couleurs des cellules : les classes CSS ne passent pas dans Excel (**coûteux** : ≈ 3 séances, lent, fragile).
  *Recommandation* : un crochet `xlsxStyle` que l'app remplit (fond, couleur du texte, gras), ≈ 0,5 séance, ≈ 300 o
  dans le code chargé à l'export seulement. Sans lui : cellules sans couleur, en-tête en gras.
- **Q-X5** Plus de 1 048 576 lignes ou 16 384 colonnes (limites d'Excel) : refuser ou couper ? *Recommandation* :
  refuser, comme le plafond actuel : rien ne se télécharge, « Export non autorisé », l'app propose son export serveur.
  Couper donnerait un fichier faux sans que l'utilisateur le voie.

## 6. Sub-steps (effort in sessions)

| Step | Content | Sessions |
|---|---|---|
| X0 | Sheet `xlsx-export.md`, conformance `xlsx/` by hand, read-back helper, owner answers | 0.5 |
| X1 | Core `@dzgrid/core/xlsx`: zip (CRC, stored, injected deflate, headers after data), parts, shared strings, typed cells, serials, escapes, cuts, problems, slices; shared value reader with CSV | 1.5 |
| X2 | Core layout: number formats, widths, bold header, panes, autoFilter, group merges, spans `merge`, tree outline, RTL, sheet name, limits | 1.5 |
| X3 | DOM: `format` in feature, request and events; lazy `export/xlsx/` (encode, `CompressionStream`, fallback, slices, cancel); limits refusal; menu item and locales; playground buttons (LTR and `rtl.html`) | 1.5 |
| X4 | `xlsxStyle` hook (if Q-X4 yes) | 0.5 |
| X5 | Browsers ×3, bench, windowless checks, oracle, golden files, review (new code), fixes, gate — **ships as 1.5.0** after the owner's Excel check | 1 |
| | **Total** | **6.5** (6 without X4) |

Each step ends with `npm run gate:step`.

## 7. Sizes (gzipped, minified; measured 2026-11-03 → estimated → line asked)

| Entry | Today / line | Estimate | Ask |
|---|---|---|---|
| `@dzgrid/core/xlsx` (new, over core) | — | 4 600 (S8 3 900 + formats, merges, outline, slices, problems; +300 with `xlsxStyle`) | 5 000 |
| `@dzgrid/dom/export: xlsx (lazy)` (new, `core/xlsx` external) | — | 900 | 1 100 |
| `@dzgrid/dom/export` (eager) | 1 200 / 1 350 | +100 | 1 350 kept |
| `@dzgrid/dom/export: run (lazy)` | 4 870 / 5 300 | +150 | 5 300 kept |
| `@dzgrid/core/csv` (shared reader) | 1 866 / 2 000 | ±30 | 2 000 kept |
| `@dzgrid/dom/context-menu` (« Exporter en Excel ») | 2 444 / 2 450 | +40 | 2 500 |
| `locales/{en,fr,ar}-context-menu` | 309 / 366 / 444 | +15 / +20 / +25 | kept |
| `@dzgrid/dom`, core base, theme, Angular | — | 0 (types only) | kept |
| K.8 audit profile | 87 392 / 90 000 | +100 at most (eager export) | kept |

**A grid that does not export pays nothing**; a grid exporting CSV only pays ≈ +100 B (eager) and its CSV download is
unchanged; the first Excel export downloads ≈ 5.5 kB gz more (`core/xlsx` + its DOM chunk), once. Estimates only:
each step measures with `npm run check:size` and asks again when over by more than 2 %.
