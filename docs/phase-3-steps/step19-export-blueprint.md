# Step 19 blueprint: `@dzgrid/dom/export` (architect, 2026-10-20)

Decisions on top: `step19-decisions.md` (they win). Sizes are estimates (×1.3).

## 0. Findings
- Core is ready: `@dzgrid/core/csv` has `csvChunks` (~500-row strings, returns `CsvSummary`), `csvRows(model, scope, selection)` (null for `all`/`selected` on server pages → `exportAll`), `ExportRequest {scope, columns, query, count|null, selection?, server?}` (`server` = DataRequest minus page and signal); `ClientModel.allRows` in the base (csv/rows.ts:29).
- Feature pattern: `GridFeature { id, parts?, setup(g) }` (features.ts:17); host API as methods on the feature object (`quickSearch().bind`); per-feature locale bundles checked at setup (pagination/index.ts:52); lazy chunks via `import()` with an advanced override (filters/set.ts:17, `loadDates`).
- Events: `GridEvent<T>` is a closed union (kernel.ts:66); features emit with `emit(g.kernel, e)` from core/internal; new variants are type-only (0 B); `settings.onEvent` receives them.
- Budgets: dom 19 052 / 19 100, core 26 756 / 26 900 → no runtime byte in base or core; type-only changes in messages.ts, context.ts, kernel.ts. K.8 66 958 / 85 000.
- Spans: `csvChunks` needs a SpanMap over the same rows; the export builds it (over allRows for `all`) only when `g.spans != null`, importing `@dzgrid/core/spans` dynamically.
- Oracle: `perf/fake-server.ts` (`queryAll`, `matches`), `perf/permutation.ts`; Playwright `page.waitForEvent('download')` in headless Chrome.

## 1. Architecture
Eager `@dzgrid/dom/export` (~0.9 kB: `csvExport(options)`, `bind(button)`, `prefetch()`, the loader, message-key check, busy flag, AbortController) + lazy chunk `packages/dom/src/export/run/index.ts` (~3.9 kB with `@dzgrid/core/csv` bundled: request, canExport, events, announcements, time slicing, Blob batching, file name, download, exportAll). No built-in button (csv-export.md; like step 16): the host's button calls `feature.run(scope)` or `feature.bind(button, {scope})` (click, aria-busy while running, prefetch on pointerenter/focus, busy clicks ignored). Rejected: a `footer.export` part; a toolbar.

## 2. API
```ts
import type { CsvOptions, CsvScope, ExportRequest } from '@dzgrid/core/csv';
export type ExportOutcome = 'done' | 'refused' | 'failed' | 'cancelled' | 'busy';
export interface ExportAllContext { readonly signal: AbortSignal; progress(done: number, total?: number): void }
export type ExportAllResult = { readonly url: string; readonly fileName?: string } | { readonly blob: Blob; readonly fileName?: string } | void;
export type Refusal = boolean | { readonly ok: false; readonly reason?: string };
export interface CsvExportOptions extends Omit<CsvOptions, 'chunkRows'> {
  readonly canExport: true | ((r: ExportRequest) => Refusal | Promise<Refusal>);   // REQUIRED; throw/reject refuses (fail closed)
  readonly exportAll?: (r: ExportRequest, c: ExportAllContext) => Promise<ExportAllResult>;   // server pages' all/selected
  readonly fileName?: (c: { scope: CsvScope; ctx: LocaleCtx; now: number }) => string;       // sanitised after
  readonly onProgress?: (p: { phase: 'preparing' | 'building' | 'waiting' | 'saving'; rows: number; total: number | null }) => void;
  readonly maxCells?: number;                                                                  // default 10 000 000
  readonly deliver?: (f: { blob?: Blob; url?: string; fileName: string }) => void | Promise<void>;
  readonly loadRun?: () => Promise<typeof import('./run/index.js')>;
}
export interface CsvExport extends GridFeature {
  run(scope?: CsvScope, o?: { columns?: readonly string[] }): Promise<ExportOutcome>;   // default 'displayed'
  cancel(): void; readonly busy: boolean; prefetch(): void;
  bind(button: HTMLElement, o?: { scope?: CsvScope }): () => void;
}
export function csvExport(o: CsvExportOptions): CsvExport;
```
One feature object per grid (a second live grid throws TypeError; remount after destroy fine). Messages: bundles `@dzgrid/dom/locales/{en,fr,ar}-export`, `ExportMessageKey`, required at setup: `export.fileName`, `announce.exportStarted`, `announce.exportDone` ({n}, plural), `announce.exportDoneHidden` ({n}, {hidden}), `announce.exportFailed`, `announce.exportRefused`, `announce.exportCancelled` (Arabic six plural forms).

## 3. Flow of run(scope, o)
1. Busy → `'busy'` (no event). AbortController, busy; `await loadRun()` (memoised; failure clears the memo → failed).
2. Unless server `all`/`selected`, wait for the model to leave `loading` (first modelUpdated, 30 s cap, cancellable); error → failed.
3. Request: columns `o.columns ?? options.columns ?? csvColumns(g.columns).ids`; query `K.query`; count (displayed: rows.displayed.count; browser all/selected: csvRows count; server all: counts.filtered; server selected: headerState/selectionChanged count, null when unknown); selection `K.selection` for selected; `server` {filter (wire), quick, sort, params, zone, key} from the model scope — if the wire filter is not reachable, rebuild it with `toWire` (dynamic import of core/server inside the chunk, only with a source). If it needs a base change: stop and ask.
4. Emit `exportRequested`, then canExport: true/allowed → continue; false / `{ok:false, reason}` / throw / reject (`g.report`) → `exportRefused`, announce `announce.exportRefused` (or the host's reason), `'refused'`, nothing downloads. canExport is UX, not security (the server checks again); Sehhaty writes its audit line there before allowing (fail closed).
5. Browser build with `count × columns > maxCells` → `exportRefused {refusal:'too-large'}`.
6. Browser (csvRows non-null) → §5. Server → without exportAll: failed + `missing-feature` at `export.exportAll`; else `await exportAll(request, {signal, progress})`: `{url}` (http:, https:, blob: after `new URL(u, location.href)`, else failed `invalid-url`; `<a download href>`; server must send an attachment disposition; bearer-header URLs → return a blob), `{blob}` delivered, `void` = the host did it. The grid never pages through the server.
7. Emit `exportFinished`, announce, return; busy cleared in finally.

## 4. Events (data only: no cell value, no row key)
```ts
{ type: 'exportRequested'; id; at /* ISO UTC */; scope; columns; query: Query; queryKey; server?: Omit<DataRequest,'page'|'signal'>;
  count: number | null; selection?: { mode: 'include' | 'exclude'; count: number | null }; zone; locale }
{ type: 'exportRefused'; id; at; scope; refusal: 'host' | 'too-large' | 'error'; reason?: string }
{ type: 'exportFinished'; id; at; outcome: 'done' | 'failed' | 'cancelled'; scope; via: 'browser' | 'server';
  rows: number | null; columns: number; bytes: number | null; fileName: string | null; hidden?: number; durationMs: number;
  blank?: number; invalid?: number; failure?: { stage: 'load' | 'canExport' | 'exportAll' | 'build' | 'download'; name: string } }
```
`id` per run (crypto.randomUUID or counter + random); `source: 'user'` from a bound button else `'api'`; "who" added by the host (the grid doesn't know the user); `params` carry tenant/role; the quick text is in `query` (owner Q2); a throwing onEvent must not abort the export; for exportAll the server writes the authoritative trace.

## 5. Browser build
`csvChunks(input, opts)` with chunkRows 500; slices of ≤ 16 ms; strings batched into Blobs every ~4 MB; `yieldToMain` = `scheduler.yield()` / MessageChannel / setTimeout(0) (a `yield` seam for jsdom); final `new Blob([...], { type: 'text/csv;charset=utf-8' })`. Budget 100k × 30: ~0.8–1.0 s wall, longest task ≤ 50 ms (LoAF) — measure and record before setting limits. Memory: peak ≈ final Blob + one 4 MB batch; `maxCells` refuses before building; background tabs crawl (documented). Download: object URL, detached `<a download>` in doc.body, click, remove, revoke after 60 s with the window's setTimeout; `deliver` seam. BOM EF BB BF. Cancel/destroy abort → no download, `exportFinished {outcome:'cancelled'}` (not after destroy). DisplayedRows/allRows are snapshots; a `columns.set` mid-build tested (resolve columns before the first chunk if needed).

## 6. Scopes
displayed/all/selected via the model (`csvRows`): filters, quick search and sort exactly as on screen (fetched set with server quick: the server's answer). Selected in the browser = selected rows the query shows; hidden ones → `hidden` and `announce.exportDoneHidden`. Selected on server pages → exportAll with `request.selection` (keys to the host's API, never in the event) and `request.server`. Empty result → header-only file, done, "0 rows".

## 7. File name
Default `${msg('export.fileName')}-YYYY-MM-DD-HHmm.csv`, Latin digits in the display zone. `safeFileName(name)`: strips control chars and `\ / : * ? " < > |`, bidi controls and zero-width chars; collapses spaces; trims dots/spaces; `_` prefix for Windows reserved names; ≤ 120 code points; `.csv` once; fallback `export.csv`; Arabic kept. A server result's fileName wins (same sanitiser).

## 8. Accessibility
All via `g.live.announce` (polite); nothing visible added. "Started" only if still running after 1 s; the end always (done with count, failed, refused, cancelled). No progress sentences (`onProgress` for a host progressbar). `bind` sets aria-busy, never `disabled`.

## 9. Arabic/RTL
BOM, logical order, Latin digits, no direction marks (step 10); an Arabic export button in `playground/rtl.html` for the owner's Excel check at step 23; the sanitiser keeps Arabic.

## 10–11. Files and sizes
Create: packages/dom/src/export/index.ts (eager), export/run/index.ts (+ request, slice, name, download), packages/dom/src/export.ts, locales/{en,fr,ar}-export.ts, tests. Modify (type-only in base/core): kernel.ts GridEvent, messages.ts, context.ts; package.json exports, build.mjs, aliases, tsconfig; import-graph test (base never imports export; export imports no other feature; core/spans only by import()); size-budget.json; perf/profiles/audit.ts, perf/audit-screen.ts, perf/fake-server.ts, playground/rtl.html; docs csv-export.md, phase-3-plugins B4, STATUS, ROADMAP, ARCHITECTURE.
Budgets asked: export (eager) 1 200; export run (lazy, csv bundled, `over` core) 5 100; en/fr/ar-export 220 / 250 / 380; base, core, csv unchanged; K.8 → ~68 300 of 85 000.

## 12. Tests
Unit: canExport (true, false, reason, throw/reject; no Blob on refusal; requested always first); paged all/selected → exportAll with server and count; missing exportAll → failed + missing-feature; url schemes, blob, void; Blob BOM and text = toCsv of the same input (formula guard, Arabic, spans); events' exact fields and a sentinel scan (no cell value or row key in events, problems, announcements); safeFileName cases and the default name's zone; slicing with a fake clock, cancel and destroy mid-build, busy; loading wait (no stale page), error → failed; maxCells; empty; missing keys throw; second grid throws; import graph and size lines.
Permutation (`perf/export-permutation.ts`, jsdom): seeded queries (filters, quick with/without accents, sorts, page, selection) on a client grid and config A; export displayed/all/selected, parse with the step 10 RFC 4180 helper, compare ids in order with queryAll/matches; config B: the fake exportAll builds the file from queryAll; check the request equals the oracle's query. 200 seeds in test:ci, 1 000 in test:perm.
Browser: download event (name, EF BB BF, content = oracle) per config; 100k × 30 bench (≤ 1 s, longest task ≤ 50 ms; figures recorded); axe 0 with the busy button; announcements in fr/ar RTL; lazy load (first paint doesn't fetch the chunk; a click and a pointerenter do).

## 14. Risks
48 B of base margin; `request.server` may need toWire or an accessor (decide at §3); a never-settling canExport (cancel aborts and clears busy); a chunk failing to load must not leave busy set; events must stay free of data (sentinel test).
