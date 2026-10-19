# Step 10 blueprint: CSV export in the core (architect, 2026-10-19)

Decisions on top: `step10-decisions.md` (they win). Numbering: 10 = core (this step), 19 = the DOM export feature.

## 0. Findings
- ClientModel has no way to read all rows the query matches once paging is on (`show()` in model/client.ts cuts `sorted.order` into a page; the uncut order is private). The one base change: `readonly allRows: DisplayedRows<T>` on ClientModel = `pageCfg ? flatDisplayed(store.snapshot, sorted!.order, version) : displayed`, a lazy getter. The fetched-set sourceRows delegates to `inner.allRows` (/server); server pages have none → `csvRows` returns null and step 19 goes to `exportAll`.
- DisplayedRows gives random access (nodeAt, keyAt). `SpanMap.inRow(row, c0, c1)` gives each span meeting a row once, origins above included — enough for spans 'first' and 'repeat'.
- The export does not use ColumnCache (indexed by source index, hidden by DisplayedRows): it reads each cell once with `reader.overlay ? reader.value(col,row,id) : col.read(row)` in try/catch, as ColumnCache.raw does.
- Codecs have `toExport` (number String(v), enum code, boolean 'true'|'false', instant UTC ISO via instantToIso) and `format`. Wall-time instants are missing: `offsetAt(ms, zone)` (value/zone-day.ts) and `epochDayToDay` (value/day.ts) exist.
- `separatorsFor(ctx)` (internal, Latin digits) gives the decimal mark → `csvSeparatorFor`.
- fullWidth rows are ordinary data rows (a flag in the span map); group headers are ColumnGroupDef (the base keeps only leaves).

## 1. Where it lives
Optional entry `@dzgrid/core/csv` (`packages/core/src/csv.ts` entry, `csv/*.ts` implementation), in package.json exports, build.mjs PACKAGES, vitest/vite aliases, tsconfig paths, size-budget.json (already added: 2 500 over the core). The base never imports it: extend the import-graph test that guards spans. Update the phase-3-plugins subpath table (`@dzgrid/core/csv` row). DOM `@dzgrid/dom/export` is step 19.

## 2. API
```ts
export interface CsvOptions {
  readonly text?: 'value' | 'display';            // 'value'
  readonly separator?: ',' | ';' | '\t';          // csvSeparatorFor(ctx)
  readonly bom?: boolean;                         // true
  readonly header?: boolean;                      // true
  readonly numbers?: 'excel' | 'raw';             // 'excel'
  readonly instants?: 'wall' | 'iso';             // 'wall'
  readonly enums?: 'label' | 'code';              // 'label'
  readonly sanitizeFormulas?: boolean;            // true
  readonly spans?: 'repeat' | 'first';            // 'repeat' (owner O5)
  readonly columns?: readonly string[];           // default: columns.visible() ids
  readonly chunkRows?: number;                    // 500
}
export interface CsvInput<T> {
  readonly rows: DisplayedRows<T>;
  readonly at?: Uint32Array | null;               // display indices to write, in order; null = all of rows
  readonly columns: ColumnLookup<T>;
  readonly ctx: LocaleCtx;
  readonly reader?: ValueReader<T>;
  readonly spans?: SpanMap | null;                // built by the caller for THESE rows and the visible columns
  readonly spanColumns?: readonly string[];       // the visible ids in the map's order
}
export interface CsvSummary { readonly rows: number; readonly columns: number; readonly blank: number; readonly invalid: number }  // counts only
export type CsvScope = 'displayed' | 'selected' | 'all';
export function csvSeparatorFor(ctx: LocaleCtx): ',' | ';';
export function csvColumns<T>(cols: ColumnLookup<T>, ids?: readonly string[]): { columns: ResolvedColumn<T>[]; problems: Problem[] };
export function csvRows<T>(model: ClientModel<T>, scope: CsvScope, selection: SelectionState): { rows: DisplayedRows<T>; at: Uint32Array | null; count: number } | null;
export function* csvChunks<T>(i: CsvInput<T>, o?: CsvOptions): Generator<string, CsvSummary>;
export function toCsv<T>(i: CsvInput<T>, o?: CsvOptions): string;   // chunks joined
export interface ExportRequest { scope: CsvScope; columns: readonly string[]; query: Query; count: number | null; selection?: SelectionState; server?: Omit<DataRequest, 'page' | 'signal'> }   // type only (type-only import of DataRequest)
```
CsvInput, not the kernel: pure, runs in Node; the step 19 feature assembles it. `selected` = a Uint32Array of display indices of allRows in screen order. Streaming: `csvChunks` yields strings of about chunkRows rows (header and BOM in chunk 0) and returns CsvSummary; the caller (step 19) slices by time and passes parts to `new Blob(parts)`. Above a few 10^5 rows x 30 columns, document `exportAll`. Not in step 10: canExport, events, fileName, the request builder. Not added: `eol` option (RFC 4180 CRLF), group-row header option, `sep=` line.
Column option (owner Q4): `ColumnDef.csv?: 'text'` (types in the base; behaviour in the entry).

## 3. Semantics
One `(raw) => string` writer per column built before the loop. Blank (isBlank) or null coerce → empty field. A throwing accessor or a null coerce of a non-blank → `summary.invalid`, written empty. One writer per column, so CsvSummary has counts, no problem list.
| Type | value mode | display mode |
|---|---|---|
| text | toExport | format |
| number | toExport, Latin digits, no grouping; excel: '.' → the locale decimal mark only if the separator is not ','; raw: untouched | format |
| day | ISO YYYY-MM-DD | format |
| instant | wall: offsetAt(ms, ctx.timeZone) → `YYYY-MM-DD HH:mm:ss`, header `Label (Zone)`; iso: instantToIso (UTC Z, header unchanged) | format |
| enum | label via codec.format (enums 'label') or code toExport | format |
| boolean | 'true' / 'false' | format |
| custom | toExport | format |
- Wall time drops milliseconds; ambiguous in a repeated hour (documented; `instants: 'iso'` exact).
- Number rule: the locale mark unless the separator is ','; tab keeps the locale mark; NaN/Infinity refused by coerce → blank; exponent forms pass.
- Header: one row of leaf labels `def.header ?? id` (already translated by the host), group headers dropped on purpose, duplicates left alone, the guard applies to headers too.
- Quoting (RFC 4180): quote a field containing the separator, `"`, CR or LF; double quotes; newlines kept byte-exact (a lone CR stays CR); rows end in CRLF, the last included; an empty single-column row is `""`; one precompiled regex per call.
- Excel SYLK quirk: always quote the first header field when it starts with `ID`.
- Formula guard: guard when the first char is \t, \r or \n, or when the first char after skipping spaces, NBSP and the bidi marks (U+200E, U+200F, U+061C) is = + - @; prefix `'`, before quoting. Typed numbers exempt (number codec, value from coerce, display mode too). Everything else guarded: text, headers, enum labels, display text, custom codecs. `sanitizeFormulas: false` turns it off. The `'` shows in Excel (accepted, documented). Exception (owner Q4): a `csv: 'text'` column whose value is digits only is written `="<digits>"` (no guard needed: digits cannot inject).
- Digits: value mode always Latin; `numerals: 'locale'` ignored there.
- Arabic/RTL: logical order, first column first; no LRM/RLM inserted; BOM U+FEFF on by default (Excel needs it for Arabic); columns from visible() order (start-pinned, centre, end-pinned). The checkbox column is not in ColumnLookup (verify at step 19).
- Excel separator caveat: Excel on Windows may use the system list separator and ignore ';' — tab is robust.
Scopes (csvRows): displayed = model.displayed (current page), at null; all = model.allRows, at null, filters apply; selected over allRows: include mode = selected keys in screen order; exclude mode = walk allRows skipping excluded keys; both restricted to rows the current query matches (owner Q2); O(n). Server pages → null (step 19 exportAll).
Spans: repeat (default, O5): each covered slot gets the ORIGIN's value (origin row via rows.nodeAt(origin.row)), one inRow per row when !spans.none; first: the origin slot keeps the value, other covered slots empty; a custom `columns` list maps ids through spanColumns (a column not in the map is written normally); the caller builds the map for the same rows (scope all → over allRows); with scope selected, `first` is ignored (repeat). Full-width rows: ordinary data rows, each column its own data. Hidden columns excluded by default; naming them includes them (no map index). Pages: displayed is the page, all crosses pages.
Performance: bench `csv 100k x 30 (toCsv)` ≤ 1 000 ms (measure first; estimate 0.5–0.8 s), ≤ 5 ms per 500-row chunk; toCsv peaks ~2x the text; 1M rows → chunks only.

## 4. Files, tests first
Create: amend docs/behaviors/csv-export.md (guard rule and Excel mapping, ID/SYLK, spans, selected rule, full-width rows, csv: 'text'); packages/core/src/csv.ts and csv/{writers.ts,quote.ts,rows.ts,chunks.ts,wall.ts}; packages/core/test/csv/*.test.ts; conformance/cases/csv/*.json and conformance/runner/suites/csv.ts; bench entry in perf/budgets.json.
Modify: packages/core/package.json exports ./csv; model/client.ts (allRows getter + interface); server/rows.ts (delegate); ColumnDef.csv type; the import-graph test; ROADMAP and STATUS.
Tests: unit (guard cases incl. after a space, RLM then =, LF; not on the number -5, 12-3, a=b; off; headers and enum labels; quoting cases; empty single-column row; ID quoted; Arabic and BOM on/off; fr ';' with 1,5, en ',' with 1.5, explicit ',' with fr gives '.', tab; numbers raw; Algiers instant 2026-03-05T22:59:00Z → `2026-03-05 23:59:00` with header `Date (Africa/Algiers)`, iso → …Z; ISO day; enum label/code; boolean; custom codec; display mode per type; blanks and throwing accessors counted; hidden columns by name; scopes displayed/all/selected include/exclude/restricted to the query; spans repeat (origin value, custom same) and first, a colSpan, a full-width row; chunkRows 1, 7, 10 000 joined equal toCsv; csv: 'text' digits-only → ="0123", other values guarded normally). Conformance suite `csv` (exact text with \r\n escaped; fr, ar, formulas). Property test: a small RFC 4180 parser in the test helper only; random rows from `"`, `,`, `;`, tab, CR, LF, spaces, Arabic, RLM, emoji, `=+-@`, empty strings, for each separator: parse(toCsv(rows)) equals the input after BOM, CRLF and the guard transform; with sanitizeFormulas false exactly; row and column counts kept incl. empty and single-column rows; chunked joined equals whole. Bench. Size: csv ≤ 2 500 over the core, core ≤ 26 100.
