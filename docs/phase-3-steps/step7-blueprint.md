# Step 7 blueprint: selection across pages and fetched-set reconciling (architect, validated)
Owner decisions on top: step7-owner.md (same folder) — read it too; it adds `selection.keepOnFilter`.

## 1. Gaps today
- G1 `matchKey` (kernel.ts ~106) is `canonical({filter, quick})`: params and zone ignored; a new params via setSource or a zone change via context.set keeps an exclude "all" alive over another row set.
- G2 the stale check runs only in setQuery (~195-209), from the raw query: misses (a) setContext/setSource/columns.set changing membership without the query; (b) a hidden column changing a client quick search (`quickCols` input, client.ts ~182); (c) server filters that toWire drops (a half-typed filter changes the raw key, not the request: today it wrongly drops "all"); (d) a filter toWire drops after a column change.
- G3 the DOM header box and Ctrl+A dispatch `selection.allDisplayed`, never `selection.all` (dom/src/interact/select.ts ~13, keys/router.ts ~65): on server pages the box selects only the page, contradicting server-selection.md.
- G4 `headerSelection` looks at the page only: on a server an include selection on other pages reads 'none', and clicking a checked box `selection.clear`s keys on other pages (kernel.ts ~393-410, select.ts ~12-13).
- G5 no command for "all filtered rows across pages" in the browser; `selection.all` on a paged client or fetched set takes the page.
- G6 `selectionChanged.query` has no params/zone; `query.sort` goes stale after a later sort.
- G7 `announce.selected` exists (messages.ts ~22, locales) but nothing announces; dropping "all" is silent though the sheet promises it is said.
- G8 fetched-set reconciling works (inner.setRows → onModel; keeps = store.get) but is untested; sheet says "planned, step 7" (server-selection.md ~27).
- G9 the keeps contract comment (client.ts ~64) and a conformance suite `selection-across-pages` missing.

## 2. API
RowModel (model/client.ts) gains:
- `membershipOf(q: Query): string` — pure: which rows this query matches in this model's current state. Client: `canonical({filter, quick, zone: ctx.timeZone, cols: quick non-blank ? visible column ids : null})`. Source: `canonical({wire: toWire(server.filter).filter, serverQuick, clientFilter, clientQuick, quickCols (only if quick is client-side), zone, params})`. Never sort or page. Cache per query key inside the source (toWire cost).
- `scope: { params: Readonly<Record<string, Json>>; zone: string }` — client `{params: {}, zone}`; source: the binding's params and ctx.timeZone.
Params stay a static `sourceRows(..., {params})` option (setSource brings new ones). The kernel sees them only via membershipOf/scope.
Kernel:
- `matchKey(q)` becomes `rows.membershipOf(q)`.
- New command `{type:'selection.allFiltered'}`: everything the query matches, exclude mode tied to membershipOf, when `rows.page !== null`; otherwise equals allDisplayed (D8 include set); if counts.filtered === 0 → selection.clear; on server pages identical to selection.all; forgets the anchor.
- `selection.all` keeps its meaning (query on a server, displayed elsewhere).
- Getter `kernel.selectionScope: {query; params; zone} | null` — non-null only for a tied exclude selection; carries the sort in force now (what a host bulk action reads).
- `selectionChanged` gains `scope: {params, zone} | null` and `reason: 'scope-changed' | 'rows-dropped' | null`.
Count per case: client unpaged include → keys.size; client paged selection.all → keys.size (page); allFiltered or any tied exclude → counts.filtered − keys.size (null when unknown); server include → keys.size. Re-tell when a count moves stays. After a stale drop: count 0, query null, reason 'scope-changed'.
Header box: getter `kernel.headerState` replacing raw headerSelection uses (viewport.ts ~174, select.ts ~12). Rule: the box describes what its click acts on (the model's selectAll policy). 'displayed' (client, fetched set, client paging): today's page/list computation (client-page.test.ts ~44-52 stays valid). 'query' (server pages): exclude — no excluded keys → 'all', count 0 → 'none', else 'some'; include — no keys → 'none', known counts.filtered === keys.size → 'all', else 'some'. ARIA all=true, some=mixed, none=false. Memoise on selection identity + rows.displayed + counts.filtered. toggleAll: 'all' → selection.clear, else selection.all. Ctrl+A → selection.all.
Announcements (dom/src/grid.ts on selectionChanged): source 'user' and count known → `announce.selected {n}`; count null → new `announce.selectedAll`; reason 'scope-changed' → new `announce.selectionCleared`; 'rows-dropped' → new `announce.selectionReduced {n}`. Keys in messages.ts and en/fr/ar (Arabic: all plural forms like announce.selected). Announce only when the text changed.
Footer link "Select all N rows" and footer.selected: step 17, not now.

## 3. Reconciling
Order unchanged: state, then modelUpdated, then reconcile events.
- `dropStale(source)`: if exclude and `allOf !== rows.membershipOf(query)` → clear, allOf = null. Runs in setQuery before rows.setQuery with membershipOf(q) (keeps C3b order: selection drop, modelUpdated, filterChanged), and at the top of onModel before the head event (covers context.set zone, setSource params, columns.set, column.state). Guard: a filter change must emit a single selectionChanged.
- Fetched set: only a new accepted answer replaces held rows (new epoch's first answer or refresh); a new epoch's failure drops nothing; surviving keys are inner.keeps (held); dropped keys told with source 'data', reason 'rows-dropped'; anchor dropped with its row; focus via reconcileFocus; a client-part filter/quick change keeps include keys; exclude cleared by dropStale on server-part or client-part change; count follows held rows.
- Server pages: keeps always true → include keys on other pages survive page, sort, refresh; excluded keys never dropped, count filtered − excluded clamped at 0; anchor kept (range with missing anchor row refused anchor-not-displayed, DOM announces); exclude cleared on filters, quick, params, zone, wire-changing column change; kept through sort, page, refresh; a half-typed filter toWire drops clears nothing; include kept on query change (unless the owner option keepOnFilter is false).

## 4. Files, tests first
Core tests:
1. `packages/core/test/selection-scope.test.ts` (new): exclude cleared on zone change and on setSource with other params; kept when a half-typed filter leaves the wire unchanged; cleared when a hidden column changes a client quick search; allFiltered on a paged client, a fetched set with page client, server pages (count, query+scope, unticked row, filter change clears, sort keeps); allFiltered on unpaged client equals include set; empty filtered clears; event order and reason; selectionScope follows the sort; headerState for the 6 server cases; keepOnFilter false (owner decision) for include on client and server, sort and page never clear.
2. extend `source-rows-fetched.test.ts`: include keys survive a refresh that keeps them; keys missing from a new epoch's answer dropped (source data, reason rows-dropped); an epoch whose request fails drops nothing; anchor dropped with its row; focus same index.
3. extend `source-rows.test.ts`: keys on pages 0 and 2 kept; select all, untick r7, page 5 → count total − 1; include survives a filter change, exclude does not.
4. update `kernel-p3.test.ts` serverLike and `review-p3a.test.ts` fakes with membershipOf and scope (and any other fake RowModel in tests).
Conformance: new suite `selection-across-pages` (`conformance/runner/suites/selection.ts` or a new file; register in index.ts) building sourceRows over a fake in-memory page source; ops page, only, all, toggle, filter, sort, setParams, zone (and allFiltered, keepOnFilter). Example:
{"id":"all-then-filter-clears-exclude","suite":"selection-across-pages","description":"Select all on a server is everything-except, tied to the filters; a filter change clears it, include keys stay.","input":{"rows":[...120 ids...],"pageSize":50,"ops":[{"op":"only","ids":["r3"]},{"op":"page","index":2},{"op":"only-add","ids":["r120"]},{"op":"all"},{"op":"toggle","id":"r7"},{"op":"sort","sort":[{"column":"v","dir":"asc"}]},{"op":"filter","column":"v","value":"x"}]},"expected":{"mode":"include","keys":[],"count":0,"reason":"scope-changed"}}
(recompute by hand; the lead has not verified this example). Add: include keys kept across a filter change; zone change; fetched-set drop; keepOnFilter false.
DOM tests `packages/dom/test/server-select.test.ts` (new, make() pattern of client-page.test.ts): box false → true after click (dispatches selection.all) → mixed after unticking a row; mixed for an include selection on another page; checked box click clears everything; Ctrl+A on a server selects the query; announcements (select, all, scope cleared, rows dropped); keepOnFilter false through settings (and live update). Keep sort-select.test.ts ~165-178 and client-page.test.ts ~44-52 passing.
Source: core kernel.ts (allFiltered, dropStale, headerState, selectionScope, event fields, keepOnFilter), model/client.ts (membershipOf, scope; keeps comment), server/rows.ts (both on the source); dom interact/select.ts, keys/router.ts, render/viewport.ts, grid.ts (announce), settings.ts (selection.keepOnFilter), update.ts, messages.ts, locales en/fr/ar.
Docs: server-selection.md (box rule, membershipOf, params and zone, allFiltered, announcements, keepOnFilter; tests marked done), selection.md (box and Ctrl+A on server, allFiltered in the browser, Q3 note), phase-3-plugins.md B1.6 (matchKey → membershipOf, allFiltered row, box sentence), ARCHITECTURE.md "Décisions de l'étape 7" (with owner decisions), server-pagination.md (mention allFiltered), ROADMAP step 7 line (+ Q2 left to step 17).

## 5. Edge cases (decided)
- Excluded keys for rows deleted server-side stay; count may be one too low; documented, not reconciled.
- Anchor after allFiltered forgotten.
- Purge or retry after failure change neither membership nor selection.
- Host selection.set exclude with unknown keys allowed; allOf = membershipOf(query) then.
- A host exclude selection on an unpaged client stays tied (tie now includes zone and visible columns for quick).
- Unknown total: count null; box 'some' unless no excluded keys; announce uses announce.selectedAll.
- dom base budget 17.5 kB during Phase 3 (owner); core base 24 kB; /server 6 kB.
