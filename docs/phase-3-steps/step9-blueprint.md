# Step 9 blueprint: value lists — setValues (client) and DataSource.values (server) (architect, validated)
Decisions on top: step9-decisions.md (same folder) — they win where they differ (zero counts hidden but a ticked value kept with `selected: true`; cap 2 000).

## 0. Findings
- ColumnCache.exports is patched in place on updates: its array identity is not a memo key. Key memos on source.version, reader.version, listCtx and the column object, as #list does.
- ColumnCache.ranks(col, env, spec) already collates distinct sort keys once (LRU); keys does numeric kinds. distinct orders entries through these caches, never a collator of its own: the list order equals the column's sort order.
- client.setReader rewrites filtered.in.reader, so the filtered mask can be stale against the reader (K.14): do NOT reuse filtered.mask for counts; compile a fresh test (O(n) per memo miss).
- restart() in server/rows.ts calls gate.newEpoch(), which aborts every channel incl. values:<col>: an open server handle must re-ask after an epoch change (§3).
- docs/phase-3-plugins.md B2.1 `FilterSlot.values(): Promise<…>` cannot cancel or show "loading with the old list kept": replace with a handle (doc amendment).

## 1. API
Types (public, base, `packages/core/src/model/values.ts`):
```ts
interface SetValue { readonly value: string; readonly label: string; readonly count: number | null; readonly selected?: boolean }
interface ValueList { readonly values: readonly SetValue[]; readonly blanks: number | null; readonly truncated: boolean }
interface ValuesOptions { readonly search?: string; readonly max?: number }
interface ValuesHandle {
  readonly status: 'idle' | 'loading' | 'error';
  readonly result: ValueList | null;          // last accepted, kept (stale) while a narrower search loads
  readonly available: boolean;                // false: filter is server and the source has no `values`
  readonly failure?: unknown;                 // the host's error, unchanged
  readonly problems: readonly Problem[];
  search(text: string): void;                 // trimmed; same text = no-op; client recomputes synchronously, server supersedes
  refresh(): void;
  subscribe(fn: () => void): () => void;      // only when status or the result object changed
  close(): void;                              // gate.cancel('values:<col>'); cancelled is never an error; idempotent
}
```
- `RowModel.setValues?(column: string, o?: ValuesOptions): ValuesHandle` (optional). Not a kernel command (changes no state). The UI calls `kernel.values(column, o?)`, a pass-through; without model support a closed handle `available: false`. The kernel subscribes once and emits `{type:'problems', source:'data', problems}` when the handle gains new problems. No fetchFailed, no modelUpdated: a values failure never reaches the rows overlay (the part shows an inline error and retry, step 15). One handle per column at a time: a second setValues on the same column closes the first.
Placement:
- ops.filter === 'client' (client model, or sourceRows with filter client incl. server quick or sort): the browser; sourceRows delegates to inner.setValues; no request.
- ops.filter === 'server' (fetched set with page client, and server pages): always DataSource.values, never the held rows.
- ops.filter === 'server' and no source.values: available false, empty idle result, no problem.
Server request/response (`server/source.ts`, amend B1.3):
```ts
interface ValuesRequest {
  readonly column: string; readonly search: string; readonly limit: number;
  readonly filter?: WireFilterModel;   // toWire of (server filter part MINUS this column)
  readonly quick?: string;             // only when ops.quick === 'server' and non-empty
  readonly params: Readonly<Record<string, Json>>; readonly zone: string;
  readonly key: string;                // canonical of the fields above
  readonly signal: AbortSignalLike;
}
type ValuesResponse = readonly SetValue[] | { values: readonly SetValue[]; blanks?: number | null; truncated?: boolean };
```
No sort, no page. search raw trimmed (the server folds). A bare array → blanks null. truncated = values.length > limit (cut to limit). Quick in the browser with filter on the server: quick not sent (counts ignore the search; say so). The owner's zero rule applies to the server too: entries with count 0 are dropped; a ticked own value absent is added with count 0 and `selected: true` by the model (the server need not know).
New problem code `invalid-values-response` (problems.ts; a conformance problems case): not an object/array or no values array → error, handle status error, failure = that problem; an item not `{value: string}` → dropped, warning at response.values[i] (at most 10, then one summary, like MAX_CELL_PROBLEMS); duplicate value → first wins, warning; missing label → value, no problem; count not an integer ≥ 0 → null, warning; more items than limit → cut, truncated, warning at response.values; blanks invalid → null, warning. Sync return, thenable, throw handled like fetch in load().

## 2. distinct (browser)
`ColumnCache.distinct(col, env, { collator?, search?, max?, others?: { key: string; test(): RowTest | null }, selected?: readonly string[] }): ValueList` — others supplied by the model (column-cache.ts cannot import compile.ts): key = canonical({ filterMinusCol, quickWords, quickCols }) (quickCols empty with no quick); test() = compile filterMinusCol + compileQuick combined (problems discarded: the rows pipeline tells them).
- Entry identity: the export text (what setTest matches).
- Blanks: rows with exports[i] === null (incl. unreadable cells, as setTest). A number in the browser (0 when none), counting rows passing others; independent of search, max and the zero rule.
- Labels: codec.format(coerce(rep), ctx), rep = first source row of the entry (enum: option label, or the value outside options; number: locale numerals; day: locale format; instant: ctx.timeZone). Two exports may share a label; both stay.
- Order: text-keyed columns (text, enum by label, custom keyKind text) by ranks().dict.get(String(sortKey)); number-keyed (number, day, instant, boolean, enum option-order) by keys()[rep]; tie-break export text by code-unit order (collator-equal values stay separate, adjacent, deterministic).
- Counts over rows passing others: every other column's filter and the quick search, never this column's own (the whole entry removed, incl. combined). Filters on hidden columns apply. Zero counts not listed; selected own values absent are added with count 0, selected true (decisions).
- Search: quickWords(search); each word in fold(label) or fold(exportText) (quick-search folding). Narrows entries only, never counts/blanks. Check fold of Arabic-Indic digits vs Latin-digit exports.
- Cap: max default VALUES_MAX = 2000 (decision); after search and the zero rule keep the first max in order; truncated if more matched.
- Memo two levels in ColumnCache: level 1 per column {entries (export, rep, label), rowEntry Int32Array (-1 blank), order}, key col identity + source.version + reader.version + listCtx + collatorKey; built from exports in one pass; cleared on any non-'none' patch delta and invalidateAll. Level 2 {counts Int32Array, blanksCount} keyed by level-1 identity + others.key. Search/max reuse both. Result memoised on (level2, search, max, selected) — identity stable so the handle skips useless notifications. Stats indexBuilds, countBuilds.
- Invalidation tests: rows set or transaction, reader version, locale/numerals/zone, column definition replaced, collator spec, another column's filter, quick text or visible columns (when quick non-empty), invalidate().
- Unknown or unfilterable column: closed handle, empty result, one problem unknown-column or invalid-filter at values.<col>.
- Client handle upkeep: subscribes to the model, reacts to rows/query/context changes; recomputes lazily; notifies only when the result identity changed (an own-column tick → no re-render, counts ignore it — but `selected` flags may change: then it does change).

## 3. Gate and epochs (server)
- Channel values:<col>, one begin per request; settle with gate.settle(ticket) === null before applying; apply to the handle only: no commit(), no ModelChange, no inner.setRows (test: rows fetches unchanged, no modelUpdated).
- New search → new begin (previous aborted 'superseded'); old result kept, status loading.
- Close → gate.cancel('values:'+col) ('aborted'); late answer dropped, never an error.
- New epoch: restart() ends with reconcileValues(): newEpoch aborts in flight ('stale-epoch'); per open handle: if its result was answered under the same key it would ask now, keep, ask nothing (an own-column Apply changes the epoch but not the values key); else re-begin, keeping the old result with status loading. Key from the current wire filter minus the column (wireOf memo reused, one extra toWire per open handle).
- Failure accepted → status error, failure = host error; stale → nothing; refresh() re-begins.
- Destroy → gate.destroy(); handles closed and inert, no notification.
- Diagnostics: valueFetches in SourceModel.diagnostics.
- Gate unchanged; extend the gate property test with interleaved values:a/values:b channels; add case values-channel-per-column.

## 4. Files, tests first
Docs first: new docs/behaviors/value-list.md (our words; the owner's rule); update filter-misc.md, filter-ui.md (counts apply other filters and the browser quick; server values never from held rows), request-order.md, server-filter.md, phase-3-plugins.md B1.3 and B2.1, ARCHITECTURE "Décisions de l'étape 9" (French), ROADMAP, size-budget.json $comment.
Tests:
- packages/core/test/distinct.test.ts: blanks incl. unreadable; enum labels both sort modes and outside options; number labels fr and ar numerals; day labels; instant labels two zones; collation accents, hamza variants, case, tie-break; counts ignoring own filter (set and combined) with others and quick; hidden-column filter; search folding (accent, Arabic marks, label vs export); cap and truncated; zero rule and the selected exception; each invalidation (indexBuilds/countBuilds); unknown column.
- packages/core/test/values-property.test.ts: seeded random rows over text (accents, Arabic, case, blanks, bad cells), enum, number, day, instant; random locales (en, fr, ar-DZ) and zones; random other-column filters, own-column filters and quick; an independent oracle (scan rows, Intl.Collator with the tie-break, count by export text) — equality of values, labels, counts, blanks, truncated, order for random max; restrict random filters to set/text/number if no reusable filter oracle exists.
- packages/core/test/source-values.test.ts (fake DataSource): request content (wire minus column, quick only when server, limit, zone, params, key); superseded by a new search (reason superseded); cancel on close (aborted, no error); new epoch with different key / same key / in flight; failure → status error, no fetchFailed, rows untouched; each invalid-response rule; no values → available false; filter client delegates, no request; fetched set with filter server uses the server; destroy; sync, thenable, throwing sources; zero rule and the selected exception on server lists.
- conformance/runner/suites/value-list.ts + conformance/cases/value-list/*.json (suite `value-list`; register in suites/index.ts; add to the case schema if there is one); server cases in cases/source-model/values-* (request shape, superseded search, epoch keep or re-ask); problems/invalid-values-response.json.
  Example own-filter-ignored-fr.json: locale fr-FR; columns s, t; rows 1 été x, 2 Ete x, 3 zèbre y, 4 null x, 5 été y; filter t set include [x], s set include [zèbre]; values column s, search "", max 10 → expected values [{Ete,Ete,1},{été,été,1}] PLUS, per the decisions, the ticked own value "zèbre" (count 0 with the other filters, selected true) — recompute and place it per your documented rule; blanks 1; truncated false.
- Bench perf/budgets.json: distinct 100 000 rows 5 000 distinct cold, and warm counts (other filter changed); measure first (guess cold ≤ 60 ms, warm ≤ 8 ms).
Code: create packages/core/src/model/values.ts (types, client handle localValues) and packages/core/src/server/values.ts (serverValues, readValues); modify model/column-cache.ts (export coerceCell; #index; distinct; stats; clear in patch and invalidateAll), model/client.ts (RowModel.setValues?, ClientModel.setValues, filter-minus-column helper, others builder), server/source.ts (DataSource.values?, ValuesRequest, ValuesResponse), server/rows.ts (setValues delegate or serverValues, reconcileValues at the end of restart, destroy hook, valueFetches), server.ts exports, kernel.ts (GridKernel.values), problems.ts, index.ts/internal.ts exports, conformance suites.
Budgets: core ≤ 26 000 (now 24 054; estimate +1.7–2.2 kB) — if over, stop and report; /server ≤ 6 000 over the core (now ~4 213; estimate +0.9–1.2 kB); dom unchanged.

## 5. Edges (decided)
- More than max distinct: O(n) + ranks collation (already paid by sorting); truncated.
- Unreadable cell is a blank (as setTest).
- Enum option-order sort uses keys (list follows option order).
- number 1 and string "1" in a text column: one entry (same export).
- invalidateAll from invalidate() drops the index (rows may be mutated in place).
- Custom filters on other columns that throw: rows not kept, no new problem told.
- Language change while open: labels and order change; the handle is notified via the context change.
- setSource changing params: epoch restarts, the handle re-asks (key changed).
- A host include list for a value outside the current search: its business; the client does not re-filter server entries.
- Two popups on different columns: independent channels.
