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
- Hand-written text: guard on `=1+1`, `+33…`, `@SUM(`, not on the number `-5`; doubled quotes; CR and LF quoted; Arabic; `;` and `1,5` in French, `,` and `1.5` in English; an Algiers instant written `2026-03-05 23:59:00`; ISO days; enum label or code; BOM; chunks joined equal the whole — `conformance/cases/csv/*` (planned, step 10).
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
