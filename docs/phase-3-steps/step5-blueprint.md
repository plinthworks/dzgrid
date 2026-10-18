# Step 5 blueprint: `sourceRows` (architect, validated by the lead)

Part 1 is DONE (commit 34fbc41): `ModelChange.told` / `failure`, kernel emits `problems` then `fetchFailed {source:'data', error, key, page}` after `modelUpdated`; `RowModel.problems`, `RowModel.warmSearch?`; base types `ModelEnv<T>`, `SourceBinding<T>`, `SourceHandle<T>` (in packages/core/src/model/client.ts, exported from the root as types).

## 0. Layering (decided)
- The `source` setting holds a binding made by `sourceRows(data, options)` from `@dzgrid/core/server`. The base imports no runtime code from `/server` (enforced by the purity scan; add a guard test that no base file imports a runtime value from server).
- `ModelEnv<T> = { getRowId, columns, ctx, page?: PageOptions, operations?: OperationsInput, query?: Query, abort?: () => AbortHandle }`.
- The DOM abort factory will be `() => new win.AbortController()` (part 4). If `env.abort` is absent, `sourceRows` uses a platform-free plain-object handle.

## 1. API in `@dzgrid/core/server` (new `server/source.ts` (types), `server/rows.ts` (model))
```ts
export type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };
export type WireFilterModel = FilterModel;   // step 6 makes it the resolved-bounds form; seam: server/wire.ts toWire = identity
export interface DataSource<T> { fetch(req: DataRequest): Promise<DataResponse<T>> | DataResponse<T> }   // `values?` at step 9
export interface DataRequest {
  readonly filter?: WireFilterModel; readonly quick?: string; readonly sort?: readonly SortItem[];  // copied from splitQuery(...).server: the split-query cases define presence
  readonly page?: PageWindow;               // only when ops.page === 'server'
  readonly params: Readonly<Record<string, Json>>; readonly zone: string;
  readonly key: string;                     // canonical({filter, quick, sort, page, params, zone})
  readonly signal: AbortSignalLike;
}
export interface PageWindow { readonly index: number; readonly size: number; readonly offset: number; readonly cursor: string | null }
export interface DataResponse<T> { readonly rows: readonly T[]; readonly total?: number; readonly hasNext?: boolean; readonly nextCursor?: string | null }
export interface SourceRowsOptions { paging?: 'offset' | 'cursor'; maxRows?: number /* default 100 000 */; params?: Readonly<Record<string, Json>> /* static in step 5 */; abort?: () => AbortHandle }
export interface SourceModel<T> extends SourceHandle<T> { readonly diagnostics: { fetches: number; gate: GateDiagnostics } }
export function sourceRows<T>(data: DataSource<T>, o?: SourceRowsOptions): SourceBinding<T> & { create(env: ModelEnv<T>): SourceModel<T> };
```
- `fetch` may return a Promise, a plain value, or any thenable. The model calls `.then` directly on a thenable and applies a plain value synchronously. A synchronous throw is a rejection; a double settle is ignored. (This keeps the conformance runner synchronous and the property test deterministic.)
- `fetchFailed.error` is the host's error unchanged; for a malformed response it is the Problem object.
- Page options come from `env.page` (the `pagination` setting). Page size and sizes are NOT in `SourceRowsOptions`.

### Problem codes (exactly two new). Each needs `conformance/cases/problems/<code>.json` (the runner enforces one per code); run them via a new `source` op in the `problems` suite (reuse the fake-source script).
| Code | Severity, path | When |
|---|---|---|
| `invalid-page-response` | warning; `response.total` / `response.hasNext` / `response.rows` / `response.nextCursor` | both total and hasNext absent (hasNext inferred as rows.length >= size); rows beyond page size (kept); bad total (read as absent); hasNext true without nextCursor in cursor mode (read as false) |
| `invalid-page-response` | error; `response` | response not an object or rows not an array: an accepted failure, status error with the Problem as failure, plus fetchFailed |
| `fetched-set-large` | warning; `response.rows` | ops.page !== 'server' and rows.length > maxRows. Rows kept. (part 3) |
- A bad `maxRows` or `paging` reuses `invalid-page` at `source.maxRows` / `source.paging`, default taken. `paging: 'cursor'` without server pages: a warning of the same kind.

## 2. Semantics
### Common machinery
- An inner `ClientModel` plus a gate (`createGate(abort)`) with one channel `rows`.
- Every public method (setQuery, setPage, setColumns, setContext, invalidate, setSource, a response) runs inside one `commit`: inner notifications muted, state diffed, exactly ONE ModelChange emitted.
- ModelChange.kind: `rows` = accepted response for the same epoch key and the same ask as the rows shown (refresh/retry; the DOM keeps the scroll anchor); `page` = the ask changed, or a response for a new ask in the same epoch; `query` = the server part changed, a response for a new epoch, the first load, a source swap or purge; `status` = loading started/ended or error with rows unchanged; forwarded client-part changes keep the inner model's kind.
- Epoch key = `server.key | zone | canonical(params)`. A change: `gate.newEpoch()`, page 0, cursors and end marker cleared, load. Locale-only change does not refetch. Client-part-only change: `inner.setQuery`, no request.
- Load: status loading, `gate.begin('rows', req.key)`, call fetch; after it returns emit one `status` change if still pending. A synchronous answer emits one change only.
- `settle(ticket)` non-null → drop silently. A rejection settles like a success. `failure` only for an accepted rejection.
- First load starts at `create`. `ModelEnv.query` avoids a second fetch when the kernel gets an initial query. status starts `loading` with empty rows.
- destroy: `gate.destroy()` (reason destroyed), `inner.destroy()`, listeners cleared, no more fetches/changes.
- `invalidate()`: new seq, same epoch, same ask, rows kept. `invalidate({purge:true})`: `inner.setRows([])`, shown marker cleared, cursors cleared (cursor mode → page 0), so the first-load overlay shows.
- `setSource(next)`: ignored if same object; else newEpoch, page 0, cursors cleared, shown marker cleared, load (old rows stay, stale). Page options, paging, maxRows fixed at creation; the new binding's are ignored (documented).
- `counts.total` non-null only when the server part has no filter and no quick: the response total (server page) or fetched-set length; otherwise null. An empty page 0 with no hasNext sets total 0. `counts.filtered` = response total (server page) or the inner filtered count (fetched set).
- `selectAll` is `'query'` iff ops.page === 'server'. `keeps`: true on server pages, `inner.keeps` otherwise. `row` = `inner.row`. `warmSearch` delegates to inner, or an already-done warmup when ops.quick === 'server'.
- `ops` = `resolveOperations(env.operations, true)`; its problems go into `problems` (told at creation by the DOM as today).

### Server page (ops.page === 'server'; everything server) — PART 2
- Inner model holds one page with an empty query (pass-through; keeps row identity, duplicate-id problems, retained-row focus).
- `page.index`/`page.size` report the ASKED page, immediately (pager reacts in the click's frame; a failure leaves the asked page for retry). total/hasNext from the last accepted response.
- PageState: pageCount null when total unknown. canJump = (paging === 'offset').
- hasNext: explicit hasNext wins, then derived from total, then inferred (with the warning).
- setPage: size change → `index = resizeIndex(...)`, explicit index overrides; clamp to pageCount-1 if total known; same ask → no-op; else same epoch, new seq, kind `page`.
- Empty response at index > 0: known total > 0 → ask the last page, refetch once; known total 0 → index 0, empty, no refetch; unknown total (offset or cursor) → mark knownEnd = index so hasNext is forced false on index-1; if the rows shown are page index-1 (same size, same epoch key) keep them and emit `page` with hasNext false, otherwise ask index-1 and fetch once; repeat backwards while pages stay empty. Empty page 0 accepted (empty overlay).
- Cursor mode (PART 3): cursors per index in the epoch; cursors[0] = null, cursors[i+1] from page i's nextCursor; a jump beyond the highest reached index clamps to it; a size change resets to page 0 and clears cursors (deviation: a cursor cannot address the first row; it gets a conformance case).
- Kernel: pageChanged with source user at the ask, then data when total/hasNext arrive. Exclude selection tied by matchKey works unchanged. Include keys of other pages survive.

### Fetched set (ops.page off or client; some stage on the server) — PART 3
- One fetch of the whole set, no `page` in the request; total/hasNext/nextCursor ignored.
- Client-side stages in the inner ClientModel: `setQuery(split.client)`, client sort, page from env.page when ops.page === 'client'; setPage forwarded to inner.
- Server-part change → new epoch; when accepted for a new epoch key, inner page → 0 and kind `query`. Retry/refresh keeps the page.
- Both parts change at once: the client part applies immediately to the old rows (stale), final state right.
- maxRows per accepted response; rows kept with `fetched-set-large`. Not for server pages.
- selectAll 'displayed'. `operations: 'client'` with a source: same shape, fetched once, refetched only on refresh, zone change or source swap.

### While loading / after failure
- Old rows, selection, focus stay (displayed unchanged → kernel reconcile does nothing). Focus moves by reconcileFocus only when a response replaces rows.
- After a failure: asked page and last accepted rows stay, status error, `rows.refresh` asks the same ask under a new seq.

## 4. Budgets
- `core/server`: currently 710 B (gate). The size-budget $comment already says it is set again at steps 4–5. Measure at the end of the part and set measure + 10 %; record in ROADMAP. Hard ceiling from the plan: 6 000 B gz.
- Base core: must stay under 24 000 (now 22 611). dom untouched in parts 2–3.

## 5. Tests (written FIRST, failing before the code)
- Unit `packages/core/test/source-rows.test.ts` with `packages/core/test/support/fake-source.ts` (records calls with resolve/reject/signal/abort reason; sync thenables; a few real-Promise cases). Groups for part 2: construction and request contents; status transitions and kinds, one change per call; server page go/size/clamp/offset window; unknown total (inferred, explicit wins, rows beyond size, bad total); empty page past the end (kept, fetched once, page 0, known total); epochs and the gate (reversed, superseded abort reasons, stale error ignored); failure and retry; destroy in flight; setSource, purge, zone change; malformed response, sync throw, double settle, re-entrant sync source; kernel integration (selectAll 'query', keys across pages, pageChanged order, told → problems event, fetchFailed after modelUpdated).
- Property `packages/core/test/source-rows-property.test.ts`: mulberry32 (test/support/rng.ts), 20 steps, answers in random order; 1 000 seeds per config (part 2: server page offset; part 3 adds cursor and fetched set with client paging), then 1 000 with a destroy. Row ids encode the call number (naive oracle). Invariants: I1 final rows come from the last-asked request of the current epoch if it succeeded; I2 page.index equals the last ask; I3 no superseded call's rows ever shown; I4 status per the last ask; I5 no change after destroy; I6 gate.begun === calls.length; plus non-vacuity counts. Answers never empty here.
- Conformance `conformance/runner/suites/source.ts` registers suite `source-model` (add to suites/index.ts). Ops: query, go, size, refresh, purge, swap, ctx, destroy, answer {call, rows:[ids], total?, hasNext?, nextCursor?}, fail {call, error}. Calls named c1, c2… in order. Output: calls, aborted, changes (kinds), final {status, displayed, page, counts}, problems, failures. Synchronous (sync thenables). Part 2 cases: reversed-pages, empty-past-end-kept-on-screen, empty-past-end-fetched-once, empty-page-zero, clamp-known-total-refetch, unknown-total-inferred, explicit-hasnext-wins, rows-beyond-size-kept, filter-change-new-epoch, failure-keeps-asked-page-and-rows, retry-same-page, stale-failure-dropped, destroy-in-flight, source-swap, purge, malformed-response, size-change-keeps-first-row, plus problems/invalid-page-response.json. (Part 3: cursor-next-back, cursor-size-resets, client-part-no-request, blank-quick-not-sent, fetched-set-max-rows, fetched-set-total-null-when-filtered, client-shorthand-fetches-once, problems/fetched-set-large.json.)

Example `source-model/reversed-pages.json`:
```json
{
  "id": "reversed-pages",
  "suite": "source-model",
  "description": "Page 1 then page 2 asked quickly: page 2 shows, and page 1's late answer never does.",
  "input": {
    "columns": [{ "id": "name" }],
    "operations": "server",
    "pagination": { "pageSize": 2 },
    "steps": [
      { "op": "answer", "call": "c1", "rows": ["a", "b"], "total": 6 },
      { "op": "go", "index": 1 },
      { "op": "go", "index": 2 },
      { "op": "answer", "call": "c3", "rows": ["e", "f"], "total": 6 },
      { "op": "answer", "call": "c2", "rows": ["c", "d"], "total": 6 }
    ]
  },
  "expected": {
    "calls": [
      { "name": "c1", "page": { "index": 0, "size": 2, "offset": 0, "cursor": null } },
      { "name": "c2", "page": { "index": 1, "size": 2, "offset": 2, "cursor": null } },
      { "name": "c3", "page": { "index": 2, "size": 2, "offset": 4, "cursor": null } }
    ],
    "aborted": [["c2", "superseded"]],
    "changes": ["query", "page", "page", "page"],
    "final": {
      "status": "idle", "displayed": ["e", "f"],
      "page": { "index": 2, "size": 2, "total": 6, "pageCount": 3, "hasNext": false, "canJump": true },
      "counts": { "total": 6, "filtered": 6, "displayed": 2 }
    },
    "problems": [], "failures": []
  }
}
```
(The lead has not re-verified the `changes` array above by hand: recompute every expected value by hand from the semantics; where the semantics leave the exact change sequence open, decide, write the decision in the sheet, and keep it consistent.)
`empty-past-end-kept-on-screen`: answer c1 ["a","b"] hasNext true; go 1; answer c2 []. Expected: two calls only, final page index 0 hasNext false, displayed ["a","b"], status idle.

## 6. Commit split
1. DONE.
2. Server page (offset), common machinery, unknown total, step-back, failure/retry, destroy, setSource, purge; the `invalid-page-response` code + case; fake-source; the conformance suite + server-page cases; property test config 1; public-api SERVER list (`createGate`, `sourceRows`); layering guard; `core/server` budget measure + ROADMAP line.
3. Cursor + fetched set, maxRows, counts.total rules, zone epoch, property configs 2–3, conformance cases, warmSearch delegation, `fetched-set-large` + case.
4. DOM and docs (lead).

## 8. Open points (decided)
- Static params: a sourceRows option, in the epoch key. Live params: step 7 (owner).
- `pagination` set while operations.page is 'off': page off wins, `invalid-page` warning at `pagination`, setting ignored.
- Inconsistent response (total < offset + rows): trust the rows.
- Zone change refetches even with no instant filter: keep.
- Warnings told once per accepted response.
