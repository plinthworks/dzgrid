# Exporting to CSV

## What the user does
Presses the host's "Export" button (the grid has none of its own), after filtering and sorting; or exports only the ticked rows; or, on a server-paged grid, asks for everything.

## What they observe
- A file downloads, holding the rows they see, in the order they see them, with a header line.
- It opens in Excel with columns split correctly, accents and Arabic intact, numbers that add up and dates in their own local time.
- A cell typed as `=SUM(A1)` or `+213…` shows as text in Excel; nothing runs.
- If the host refuses the export, they hear why; nothing downloads.

## What DzGrid does
- **Scope:** `displayed` (the rows shown now), `selected`, or `all` (every row the query matches, every page). What the browser holds it writes; on a server-paged grid, `all` and `selected` go through the host's `exportAll`: the grid never fetches page after page, and 10⁷ rows never pass through the browser.
- **Columns:** the request carries the list of column ids (`columns`); by default the visible ones in screen order (see the decisions).
- **Values, not the screen:** numbers in the locale's decimal mark when the separator is `;` (`numbers: 'excel'`, the default), machine form with `numbers: 'raw'`. Days are ISO `YYYY-MM-DD`. Instants are wall time in the display zone, `YYYY-MM-DD HH:mm:ss`, the zone named in the header (`Date (Africa/Algiers)`); `instants: 'iso'` gives UTC with `Z`. Enums give their translated label, or the code with `enums: 'code'`.
- **Quoting (RFC 4180):** a field holding the separator, a quote, CR or LF is quoted, its quotes doubled. Lines end in CRLF.
- **Separator by locale:** `;` when the locale writes decimals with a comma (French, `ar-DZ` with Latin digits), `,` otherwise. `separator` overrides it, a tab included.
- **BOM** on by default, so Excel reads UTF-8 and Arabic text; `bom: false` removes it.
- **Formula guard:** a text cell starting with `=`, `+`, `-`, `@`, a tab or a CR gets a leading `'`. A typed number such as `-5` never does. `sanitizeFormulas` turns it off; it is never cut from the phase.
- **File name:** `fileName(ctx)`, from the host.
- **Refusal and audit:** `canExport(request)` may return false (or a promise of it): no file, the event `exportRefused`, an announcement. `exportRequested` and `exportFinished` tell the host what happened, as data only: no row ever goes into an event or a problem.
- **Server export:** `exportAll(request)` receives the current query (filter, quick search, sort, params) without the page, and returns `{ url }`, `{ blob }` or nothing.
- **No frozen page:** the file is built in chunks that yield about every 20 ms, then downloaded through `<a download>`. `exportCsv(scope)` resolves to `done`, `refused` or `failed`.

## Tests
- Hand-written text: guard on `=1+1`, `+33…`, `@SUM(`, not on the number `-5`; doubled quotes; CR and LF quoted; Arabic; `;` and `1,5` in French, `,` and `1.5` in English; an Algiers instant written `2026-03-05 23:59:00`; ISO days; enum label or code; BOM; chunks joined equal the whole — `conformance/cases/csv/*` (15 cases) and `packages/core/test/csv/` (unit, scopes, spans, an RFC 4180 round trip), step 10.
- `canExport` false gives no Blob, `exportRefused` and an announcement; paged `all` calls `exportAll` and fetches no page; the Blob starts with a BOM and matches step 10's text (planned, step 19).
- Sample Arabic file opened in Excel by the owner (planned, step 23).

## Decisions (step 1, 2026-10-17)
- **Value, not display, by default:** `CsvOptions.text: 'value' | 'display'`, default `value` — the rules above (numbers for Excel or raw, ISO days, instants in wall time, enum label or code), never `format`. `display` writes the cell's text. This is owner decision 8's "raw value" and D7 together; B2.4's `csv: { text: 'display' }` is this option.
- **Scopes:** `displayed` is the rows shown now (the current page when paged, the whole list when `page` is off); `all` is every row the query matches, on every page; `selected` the selected rows. `all` never ignores the filters.
- **Who builds the file:** what the browser holds, it writes (`page` off or client, fetched set included: `all` is the fetched set after the browser's stages). What it does not hold goes to `exportAll` — with server pages, `all` and `selected`. Without `exportAll` there, `exportCsv` resolves `failed` with the warning `missing-feature` at `export.exportAll`.
- **One request type** for `canExport` and `exportAll`: `ExportRequest { scope, columns, query, count: number | null, selection?, server? }`; `server` is the `DataRequest` without `page` and `signal`, present with a source; `selection` is present for `selected`. It replaces the plan's `PageRequest` argument.
- **Default columns:** the visible ones in screen order (pinned start, centre, pinned end), the checkbox column never; `columns` names others, hidden ones included.
- **Order:** logical, first column first, in both directions.
- **Guard:** every field that is not a typed number — headers, enum labels, display text included — by its first character after leading spaces.
- **Numbers:** no thousands separators, Latin digits always, whatever the grid shows.
- **`{ url }`** is downloaded through `<a download>` like a Blob; nothing returned means the host did it (`done`).
- **Messages:** `export.fileName` (default name, `.csv` added), `announce.exportDone`, `announce.exportFailed`, `announce.exportRefused`. Step 19.

## Owner questions
- Does an Arabic reader expect the file in logical order (first column in column A)? Checked on the sample file at step 23.
- Must an export of health data always pass `canExport` (no default allow), and what may `exportRequested` / `exportFinished` carry for Sehhaty's audit log?

## Decisions (step 10, 2026-10-19; plan `docs/phase-3-steps/step10-csv-blueprint.md`, decisions `step10-decisions.md`)
- **Where:** the writer lives in the optional entry `@dzgrid/core/csv` (pure, runs in Node); the base carries only `ClientModel.allRows` (every row the query matches, all pages, in screen order) and the `ColumnDef.csv` type. The download button, `canExport`, the events and the file name are the DOM feature's (step 19).
- **Formula guard, precisely:** a field gets a leading `'` when its first character is a tab, a CR or a LF, or when its first character after any spaces, no-break spaces and invisible direction marks (U+200E, U+200F, U+061C) is `=`, `+`, `-` or `@`. That covers a cell an attacker pads with spaces or a right-to-left mark to slip past a check of the first character. It applies to every field that is not a typed number: text, headers, enum labels, custom codecs, display text. A number column's values never get it, in value or display mode (`-5` stays `-5`). The `'` shows in Excel: accepted, it is the price of opening the file safely. `sanitizeFormulas: false` removes it.
- **Identifiers kept as text (`csv: 'text'`, owner Q4):** a column defined with `csv: 'text'` writes a value made only of the digits 0–9 as `="0123"`, so Excel keeps the leading zeros and does not turn a long number into `1.23E+15`. Only digits-only values: such a formula cannot run anything. Any other value of the column is written as usual, guard included.
- **Excel mapping:** numbers with no grouping and Latin digits; with `numbers: 'excel'` the decimal point becomes the locale's mark unless the separator is `,` (`1,5` with `;` in French, `1.5` with an explicit `,`, the locale's mark with a tab); `numbers: 'raw'` leaves the machine form. NaN is a blank and an infinity an unreadable value: both are written empty, and counted. Days `YYYY-MM-DD`. Instants `YYYY-MM-DD HH:mm:ss` in the display zone, seconds kept and milliseconds dropped, the header ending ` (Zone)`; inside a repeated hour of a clock change two instants can read the same: `instants: 'iso'` gives UTC with `Z`, exact, header unchanged. Booleans `true` / `false`. Enums their label, or the code with `enums: 'code'`. `text: 'display'` writes each cell as the grid formats it, for every type.
- **Excel's SYLK trap:** a file whose first field starts with `ID` is taken by Excel for another format and refused. That first field is always quoted.
- **Quoting:** RFC 4180. A field holding the separator, `"`, CR or LF is quoted and its quotes doubled; line breaks inside a field are kept byte for byte (a lone CR stays a CR). Every line ends in CRLF, the last one included. A row of one empty field is written `""`, so the line is not empty.
- **Header:** one line of the columns' labels (`header`, else the id), as the host translated them; group headers are not written (one line, so Excel's filters and sums work on it); two equal labels stay equal. The guard applies to them.
- **Selected rows (owner Q2):** `selected` writes the selected rows that the current filters and search show, in screen order, on every page held. A selected row hidden by a filter (the selection kept on a filter change) is not written; the count given before the export says so. On server pages, `all` and `selected` are `exportAll`'s (the browser does not hold the rows).
- **Spans:** a tall or wide cell repeats its value in every slot it covers (the default, O5), so each line of the file stands on its own when sorted or filtered in Excel; `spans: 'first'` writes it in its first slot only and leaves the others empty (not for `selected`, where the first slot may not be written: it repeats). A full-width row is written as an ordinary row, each column its own value.
- **Columns:** the visible ones by default, start-pinned, centre, end-pinned; naming a hidden column writes it; an unknown id is skipped and told (`unknown-column`).
- **Not in the file:** no `sep=` line (it breaks the BOM in Excel), no choice of line ending, no direction marks added around Arabic text.
- **Large exports:** the text is made in chunks of about 500 rows, each a string, so the page can yield between them and hand the parts to a Blob. 100 000 rows of 30 columns take well under a second; beyond a few hundred thousand rows, the host's `exportAll` is the way.
